/**
 * Scripted rival civilizations: real cities, territory and units on the map,
 * with real production queues, research, maintenance, housing and border
 * culture underneath. They settle, grow, expand borders, race you for great
 * people, pantheons and beliefs, and can declare (or receive) war — at-war
 * units raid like barbarians, and cities can be conquered.
 */

import type { City, DistrictId, GameState, RivalCity, RivalCiv, Tile, Unit, Yields } from './types';
import { tilesWithin, hexDistance, neighbors } from './hex';
import { isWater, isImpassable } from './query';
import { nextRandom } from './rand';
import { spawnUnit, unitsAt, unitsHostile, inEnemyZoc, moveCostInto, crossesRiver, unitDomain } from './units';
import { hostileUnitAct, attackTargets, meleeAttack, hostileRangedStrike, clearCampFor, captureRivalCity, damageRoll, rivalCityDefense, terrainDefense, woundPenalty } from './combat';
import { modifiersFromResearch, availableTechsIn, availableCivicsIn, computeUnlocksIn, type Unlocks } from './effects';
import { detectRivalBoosts, effectiveResearchCostIn } from './boosts';
import { getRivalModifiers, withFollowerBelief, followerReligionForCity } from './effects';
import { tileYields } from './yields';
import { isSuzerain } from './cityStates';
import { LEVY_UNITS, LEVY_GOLD_COST, LEVY_COOLDOWN } from '../data/cityStates';
import type { RuleResult } from './rules';
import { TERRAINS } from '../data/terrains';
import { TECHS } from '../data/techs';
import { BUILDINGS } from '../data/buildings';
import { IMPROVEMENTS } from '../data/improvements';
import { CIVICS } from '../data/civics';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { UNITS, CITY_HEAL_PER_TURN, WALLS_HP } from '../data/units';
import { GP_CLASS_DISTRICT, GP_CLASSES, GREAT_PEOPLE, gpCost } from '../data/greatPeople';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, RELIGION_NAMES, PANTHEON_FAITH_COST } from '../data/religion';
import {
  growthFoodNeeded,
  housingGrowthFactor,
  CITY_MIN_DIST,
  CITY_WORK_RADIUS,
  FOOD_PER_CITIZEN,
  CITIZEN_SCIENCE,
  CITIZEN_CULTURE,
  HOUSING_FRESH_WATER,
  HOUSING_COASTAL,
  HOUSING_NO_WATER,
  AQUEDUCT_FRESH_BONUS,
  AQUEDUCT_NO_FRESH_TOTAL,
  GAME_SPEED,
  GOLD_PURCHASE_MULT,
  borderGrowthCost,
  amenitiesNeeded,
  amenityTier,
  LUXURY_AMENITY_CITIES,
  type AmenityTier,
} from '../data/constants';
import { PROJECTS, PROJECT_YIELD_FRACTION, PROJECT_GPP_FRACTION } from '../data/projects';
import { tileScore, tileYieldsForCenter, buildingMaintenance, districtMaintenance, resourcePriority } from './city';
import { canPlaceDistrictIn, validImprovementsIn, wonderExists } from './rules';
import { hasRiver, hasFreshWater, isCoastalLand, isCoastalWater } from './query';
import { BUILT_WONDERS } from '../data/builtWonders';
import { disbandUnit, tileFreeForUnit } from './units';
import { districtCostIn, goldAffordable } from './game';
import { districtAdjacency } from './yields';
import { DISTRICTS, SCAFFOLD_DISTRICTS } from '../data/districts';
import {
  RIVAL_LEADERS,
  RIVAL_MAX_CITIES,
  RIVAL_SETTLER_COST,
  RIVAL_WAR_MIN_TURNS,
  PEACE_MIN_WAR_TURNS,
  PEACE_GOLD_COST,
  RIVAL_CITY_MAX_HP,
  RIVAL_WORK_RADIUS,
  LOYALTY_MAX,
  LOYALTY_RANGE,
  LOYALTY_PRESSURE_SCALE,
  LOYALTY_AMENITY,
  WAR_WEARINESS_PER_TURN,
  WAR_WEARINESS_DECAY,
  WAR_WEARINESS_CAP,
  warWearinessPenalty,
} from '../data/rivals';
import { tileClaimed, tileOwnedByCiv, civOfRival } from './civs';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

const RIVAL_SPACING = 10;

/** AUDIT A-5r: the military units a scripted rival may gold-buy — the same
 * roster the production picker trains (WARRIOR/SLINGER ungated; the rest on
 * the rival's real techs), in UNITS-table order so strict `>` on combat
 * breaks ties to the lowest-index type (the GPU argmax mirror). BUILDER/
 * SCOUT are excluded — never in the rival roster. */
const RIVAL_BUY_UNITS: { id: string; tech?: string }[] = [
  { id: 'WARRIOR' },
  { id: 'SLINGER' },
  { id: 'ARCHER', tech: 'ARCHERY' },
  { id: 'SPEARMAN', tech: 'BRONZE_WORKING' },
  { id: 'HORSEMAN', tech: 'HORSEBACK_RIDING' },
];

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function tileOwned(t: Tile): boolean {
  return tileClaimed(t);
}

function siteQuality(state: GameState, tile: Tile): number {
  if (isWater(tile) || isImpassable(tile)) return -1;
  if (tile.wonder || tile.feature === 'OASIS' || tile.district) return -1;
  if (tileOwned(tile)) return -1;
  let q = hasFreshWater(state.map, tile) ? 8 : 0;
  for (const t of tilesWithin(state.map, tile.col, tile.row, 2)) {
    if (isWater(t) || isImpassable(t) || tileOwned(t)) continue;
    const terrain = TERRAINS[t.terrain]?.yields ?? {};
    const feature = t.feature ? FEATURES[t.feature]?.yields ?? {} : {};
    const res = t.resource ? RESOURCES[t.resource]?.yields ?? {} : {};
    for (const src of [terrain, feature, res]) {
      q += (src.food ?? 0) * 1.2 + (src.production ?? 0) + (src.gold ?? 0) * 0.5;
    }
    if (t.elevation === 'HILLS') q += 0.5;
  }
  return q;
}

function nextCityName(rival: RivalCiv): string {
  const leader = RIVAL_LEADERS.find((l) => l.name === rival.name);
  const names = leader?.cityNames ?? [rival.name];
  const n = rival.nextCityId;
  return n < names.length ? names[n] : `${names[0]} ${n + 1}`;
}

function foundRivalCity(state: GameState, rival: RivalCiv, tile: Tile): RivalCity {
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: nextCityName(rival),
    civId: civOfRival(rival.id),
    centerIndex: tile.index,
    // P5/S3 (C-14): pop 1 like foundCity — the capital's old pop-3 head
    // start was an asymmetric pacing crutch.
    population: 1,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: rival.cities.length === 0,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: RIVAL_CITY_MAX_HP,
    foundedTurn: state.turn,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  // P5/S3 (C-14): founding strips like foundCity — the improvement and the
  // removable feature die with the center (yields, +3 defense, lent
  // district adjacency all read the live map).
  tile.improvement = null;
  if (tile.feature && FEATURES[tile.feature].removable) tile.feature = null;
  tile.rivalId = rival.id;
  for (const t of tilesWithin(state.map, tile.col, tile.row, 1)) {
    // Mirrors foundCity: the full first ring, water included — a coastal
    // rival must own its harbor water (AUDIT C-1; the water skip made the
    // whole Harbor line structurally unreachable for rivals).
    if (!tileOwned(t)) t.rivalId = rival.id;
  }
  rival.cities.push(city);
  // GV-3: rival r's capital tile lives at civ index r+1, static once founded.
  if (city.isCapital) {
    if (!state.capitalTiles) state.capitalTiles = [];
    state.capitalTiles[rival.id + 1] = tile.index;
  }
  return city;
}

/** Place `count` rival civs on distant good sites (seeded, deterministic). */
export function placeRivals(state: GameState, count?: number): void {
  const land = state.map.tiles.filter((t) => !isWater(t) && !isImpassable(t)).length;
  const target = Math.min(
    RIVAL_LEADERS.length,
    count ?? Math.max(1, Math.min(3, Math.round(land / 350))),
  );

  const scored = state.map.tiles
    .map((t) => ({ t, q: siteQuality(state, t) }))
    .filter((s) => s.q > 0)
    .sort((a, b) => b.q - a.q || a.t.index - b.t.index);

  const picked: Tile[] = [];
  for (const { t } of scored) {
    if (picked.length >= target) break;
    if (picked.some((p) => hexDistance(p.col, p.row, t.col, t.row) < RIVAL_SPACING)) continue;
    if (
      state.cityStates.some((cs) => {
        const c = state.map.tiles[cs.centerIndex];
        return hexDistance(c.col, c.row, t.col, t.row) < 8;
      })
    ) {
      continue;
    }
    picked.push(t);
  }

  picked.forEach((tile, i) => {
    const leader = RIVAL_LEADERS[i % RIVAL_LEADERS.length];
    const rival: RivalCiv = {
      id: i,
      name: leader.name,
      color: leader.color,
      aggression: 0.3 + nextRandom(state) * 0.6,
      cities: [],
      nextCityId: 0,
      atWar: false,
      warTurns: 0,
      peaceTurns: 0,
      warWeariness: 0, // B-15
      spaceProjects: [], // B-25
      research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
      gpp: {},
      pantheonClaimed: false,
      religionFounded: false,
    };
    foundRivalCity(state, rival, tile);
    // P5/S2 gate-catch (a D-22 latent): push BEFORE the starting warrior
    // spawns so spawnUnit's bestMeleeCS chokepoint can find the rival —
    // "strongest melee ever FIELDED" includes the starting army (defense
    // 20 from turn 0; the GPU seeds r_best_melee from the fixture pools).
    state.rivals.push(rival);
    spawnUnit(state, 'WARRIOR', tile.index, 'rival', rival.id);
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function rivalUnits(state: GameState, rivalId?: number): Unit[] {
  return state.units.filter(
    (u) => u.owner === 'rival' && (rivalId === undefined || u.civId === rivalId),
  );
}

/** Rough military strength of the player (units + a base per city). */
export function playerStrength(state: GameState): number {
  let s = state.cities.length * 10;
  for (const u of state.units) {
    if (u.owner === 'player') s += UNITS[u.type]?.combat ?? 0;
  }
  return s;
}

export function rivalStrength(state: GameState, rival: RivalCiv): number {
  // C1-B2: strength counts what actually exists — cities and fielded units.
  // The old militaryStock×0.2 term died with the pooled stocks.
  let s = rival.cities.length * 8;
  for (const u of rivalUnits(state, rival.id)) s += UNITS[u.type]?.combat ?? 0;
  return Math.round(s);
}

function nearestDistance(state: GameState, a: number, bs: number[]): number {
  const at = state.map.tiles[a];
  let best = Infinity;
  for (const b of bs) {
    const bt = state.map.tiles[b];
    best = Math.min(best, hexDistance(at.col, at.row, bt.col, bt.row));
  }
  return best;
}

/** Distance between the closest player-city / rival-city pair. */
export function rivalProximity(state: GameState, rival: RivalCiv): number {
  if (state.cities.length === 0 || rival.cities.length === 0) return Infinity;
  let best = Infinity;
  for (const c of state.cities) {
    best = Math.min(
      best,
      nearestDistance(state, c.centerIndex, rival.cities.map((rc) => rc.centerIndex)),
    );
  }
  return best;
}

// ---------------------------------------------------------------------------
// Player diplomacy actions
// ---------------------------------------------------------------------------

export function declareWar(state: GameState, rivalId: number): RuleResult {
  const rival = state.rivals.find((r) => r.id === rivalId);
  if (!rival) return no('No such civilization.');
  if (rival.atWar) return no('Already at war.');
  rival.atWar = true;
  rival.warTurns = 0;
  state.eventLog.push(`War declared on ${rival.name}!`);
  return ok;
}

export function sueForPeace(state: GameState, rivalId: number): RuleResult {
  const rival = state.rivals.find((r) => r.id === rivalId);
  if (!rival) return no('No such civilization.');
  if (!rival.atWar) return no('Not at war.');
  if (rival.warTurns < PEACE_MIN_WAR_TURNS) {
    return no(`Too soon — they will not talk for another ${PEACE_MIN_WAR_TURNS - rival.warTurns} turns.`);
  }
  const cost = PEACE_GOLD_COST(rival.warTurns);
  if (!state.sandbox) {
    if (!goldAffordable(state.treasury, cost)) return no(`Peace costs ${cost} gold right now.`);
    state.treasury -= cost;
  }
  makePeace(state, rival);
  return ok;
}

function makePeace(state: GameState, rival: RivalCiv): void {
  rival.atWar = false;
  rival.warTurns = 0;
  rival.peaceTurns = 0;
  state.eventLog.push(`Peace with ${rival.name}.`);
}

/** Levy a militaristic city-state's troops (suzerain only, gold, cooldown). */
export function levyUnits(state: GameState, csId: number): RuleResult {
  const cs = state.cityStates.find((c) => c.id === csId);
  if (!cs) return no('No such city-state.');
  if (cs.type !== 'militaristic') return no('Only militaristic city-states levy troops.');
  if (!isSuzerain(cs)) return no('You must be suzerain (3+ envoys).');
  const since = state.turn - (cs.lastLevyTurn ?? -LEVY_COOLDOWN);
  if (since < LEVY_COOLDOWN) {
    return no(`Their troops are spent — ready in ${LEVY_COOLDOWN - since} turns.`);
  }
  if (!state.sandbox) {
    if (!goldAffordable(state.treasury, LEVY_GOLD_COST)) return no(`Levy costs ${LEVY_GOLD_COST} gold.`);
    state.treasury -= LEVY_GOLD_COST;
  }
  const type = state.turn > 60 ? 'SPEARMAN' : 'WARRIOR';
  for (let i = 0; i < LEVY_UNITS; i++) {
    spawnUnit(state, type, cs.centerIndex, 'player');
  }
  cs.lastLevyTurn = state.turn;
  state.eventLog.push(`${cs.name} levies ${LEVY_UNITS} ${type === 'SPEARMAN' ? 'spearmen' : 'warriors'} to your cause.`);
  return ok;
}

// ---------------------------------------------------------------------------
// Loyalty (only in motion while rival civs exist; capitals are immune)
// ---------------------------------------------------------------------------

/** Per-turn loyalty change for a player city under rival pressure. */
export function loyaltyDelta(state: GameState, city: City, amenityTierName: string): number {
  const here = state.map.tiles[city.centerIndex];
  let own = 0;
  let foreign = 0;
  for (const c of state.cities) {
    const t = state.map.tiles[c.centerIndex];
    const d = hexDistance(here.col, here.row, t.col, t.row);
    if (d <= LOYALTY_RANGE) own += c.population * (LOYALTY_RANGE + 1 - d);
  }
  for (const rival of state.rivals) {
    for (const rc of rival.cities) {
      const t = state.map.tiles[rc.centerIndex];
      const d = hexDistance(here.col, here.row, t.col, t.row);
      if (d <= LOYALTY_RANGE) foreign += rc.population * (LOYALTY_RANGE + 1 - d);
    }
  }
  const pressure =
    own + foreign === 0 ? 0 : (LOYALTY_PRESSURE_SCALE * (own - foreign)) / (own + foreign);
  return pressure + (LOYALTY_AMENITY[amenityTierName] ?? 0);
}

/**
 * Apply a turn of loyalty to `city` (called from endTurn with the stats it
 * already computed). Returns true when the city has hit 0 and must flip.
 */
export function applyLoyalty(state: GameState, city: City, amenityTierName: string): boolean {
  if (!state.rivals.some((r) => r.cities.length > 0)) return false;
  if (city.isCapital) {
    city.loyalty = LOYALTY_MAX;
    return false;
  }
  const next = (city.loyalty ?? LOYALTY_MAX) + loyaltyDelta(state, city, amenityTierName);
  city.loyalty = Math.max(0, Math.min(LOYALTY_MAX, next));
  return city.loyalty <= 0;
}

/** A city at 0 loyalty defects to the rival exerting the most pressure. */
export function flipCityToRival(state: GameState, city: City): void {
  const here = state.map.tiles[city.centerIndex];
  let winner: RivalCiv | null = null;
  let best = -1;
  for (const rival of state.rivals) {
    let pressure = 0;
    for (const rc of rival.cities) {
      const t = state.map.tiles[rc.centerIndex];
      const d = hexDistance(here.col, here.row, t.col, t.row);
      if (d <= LOYALTY_RANGE) pressure += rc.population * (LOYALTY_RANGE + 1 - d);
    }
    if (pressure > best) {
      best = pressure;
      winner = rival;
    }
  }
  if (!winner) return;
  transferCityToRival(state, city, winner, 'loyalty collapsed');
}

/** The player-city → rival-city transfer (shared by loyalty flips and
 * V-W2's reverse capture — a rival melee finishing a player city). */
export function transferCityToRival(state: GameState, city: City, winner: RivalCiv, why: string): boolean {
  state.cities = state.cities.filter((c) => c.id !== city.id);
  delete state.cityHp[String(city.id)];
  state.tradeRoutes = state.tradeRoutes.filter((r) => r.from !== city.id && r.to !== city.id);
  // P5/S7 (C-5): CONQUEST razes at the winner's city cap, mirroring the
  // player's captureRivalCity raze — the city simply ceases (tiles freed,
  // center unpaved, no plunder). Loyalty flips stay uncapped.
  if (why === 'conquered' && winner.cities.length >= RIVAL_MAX_CITIES) {
    for (const t of state.map.tiles) {
      if (t.cityId === city.id) t.cityId = -1;
    }
    const center = state.map.tiles[city.centerIndex];
    center.district = null;
    center.districtComplete = false;
    state.eventLog.push(`${city.name} razed — ${winner.name} cannot govern more cities.`);
    return false;
  }
  for (const t of state.map.tiles) {
    if (t.cityId === city.id) {
      t.cityId = -1;
      t.rivalId = winner.id;
    }
  }
  winner.cities.push({
    id: winner.nextCityId++,
    name: city.name,
    civId: civOfRival(winner.id),
    centerIndex: city.centerIndex,
    population: Math.max(1, Math.floor(city.population * 0.75)),
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: city.tilesAcquired,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: city.centerIndex }],
    wonders: [],
    specialists: {},
    hp: Math.round(RIVAL_CITY_MAX_HP / 2),
    foundedTurn: state.turn,
  });
  state.eventLog.push(`${city.name} has defected to ${winner.name}! (${why})`);
  return true;
}

// ---------------------------------------------------------------------------
// Per-turn phase
// ---------------------------------------------------------------------------

/** P5/S4 (C-15): the tile this rival city's culture growth claims next —
 * the player's pickBorderTile policy verbatim (radius 5, fully unowned
 * tiles, dist asc → resource priority desc → yield sum desc → index asc)
 * under the rival's OWN research modifiers (the rivalCityYields ctx).
 * Water, impassables and natural wonders are all claimable, exactly like
 * borderCandidates. One documented delta: adjacency is CIV-level (rival
 * territory has no per-city tile registry — P7 material), where the
 * player's is per-city. */
function pickRivalBorderTile(state: GameState, rival: RivalCiv, city: RivalCity): number | null {
  const center = state.map.tiles[city.centerIndex];
  const ctx = { map: state.map, mods: getRivalModifiers(state, rival) };  // A-7: belief tile yields rank candidates too
  const cands: { dist: number; res: number; ySum: number; i: number }[] = [];
  for (const t of tilesWithin(state.map, center.col, center.row, 5)) {
    if (tileOwned(t)) continue;
    const adjOwn = tilesWithin(state.map, t.col, t.row, 1).some(
      (n) => n.index !== t.index && tileOwnedByCiv(n, civOfRival(rival.id)),
    );
    if (!adjOwn) continue;
    const y = tileYields(ctx, t);
    cands.push({
      dist: hexDistance(center.col, center.row, t.col, t.row),
      res: resourcePriority(t),
      ySum: y.food + y.production + y.gold + y.science + y.culture + y.faith,
      i: t.index,
    });
  }
  if (cands.length === 0) return null;
  return cands.sort((a, b) => a.dist - b.dist || b.res - a.res || b.ySum - a.ySum || a.i - b.i)[0].i;
}

function tryFoundCity(state: GameState, rival: RivalCiv): void {
  // Expand near home: best site within reach of the existing cities.
  let best: Tile | null = null;
  let bestQ = 3; // don't settle garbage
  for (const rc of rival.cities) {
    const center = state.map.tiles[rc.centerIndex];
    for (const t of tilesWithin(state.map, center.col, center.row, 7)) {
      const q = siteQuality(state, t);
      if (q <= bestQ) continue;
      const tooClose =
        state.cities.some(
          (c) =>
            hexDistance(state.map.tiles[c.centerIndex].col, state.map.tiles[c.centerIndex].row, t.col, t.row) <
            CITY_MIN_DIST,
        ) ||
        state.cityStates.some(
          (cs) =>
            hexDistance(state.map.tiles[cs.centerIndex].col, state.map.tiles[cs.centerIndex].row, t.col, t.row) <
            CITY_MIN_DIST,
        ) ||
        state.rivals.some((r) =>
          r.cities.some(
            (c) =>
              // P5/S3 (C-14): uniform spacing — the old +1 rival-vs-rival
              // pad was asymmetric with canFoundCity's flat CITY_MIN_DIST.
              hexDistance(state.map.tiles[c.centerIndex].col, state.map.tiles[c.centerIndex].row, t.col, t.row) <
              CITY_MIN_DIST,
          ),
        );
      if (tooClose) continue;
      bestQ = q;
      best = t;
    }
  }
  if (best) {
    const city = foundRivalCity(state, rival, best);
    state.eventLog.push(`${rival.name} founded ${city.name}.`);
  }
}

function claimGreatPeople(state: GameState, rival: RivalCiv): void {
  for (const cls of GP_CLASSES) {
    // C1-B4c: real accrual — 1 + (built buildings of that district) per city
    // owning a COMPLETED district of the class (was cities × RIVAL_GPP_RATE,
    // so rivals now accrue 0 until their first Campus/HS/CH completes and
    // the player wins the early Great People uncontested).
    const gpDist = GP_CLASS_DISTRICT[cls];
    // A-7: Divine Spark — the belief's flat GPP joins the per-city term,
    // exactly like greatPersonPointsPerTurn (game.ts:876).
    const gppFlat = getRivalModifiers(state, rival).gppFlat[cls] ?? 0;
    let accrue = 0;
    for (const rc of rival.cities) {
      if (!rc.districts.some((d) => d.type === gpDist && state.map.tiles[d.tileIndex].districtComplete)) continue;
      accrue += 1 + gppFlat + rc.buildings.filter((b) => BUILDINGS[b]?.district === gpDist).length;
    }
    if (accrue > 0) rival.gpp[cls] = (rival.gpp[cls] ?? 0) + accrue;
    // P5/S5 (C-16): the player's advanceGreatPeople loop — overflow KEPT
    // (pts −= cost, not zeroed) and the person's effect lands in the
    // RIVAL's own streams (research progress, treasury, faith, capital
    // production), exactly like applyGreatPersonEffect.
    let pts = rival.gpp[cls] ?? 0;
    let earned = state.greatPeople.earned.filter((id) =>
      GREAT_PEOPLE[cls].some((p) => p.id === id),
    ).length;
    while (earned < GREAT_PEOPLE[cls].length && pts >= gpCost(earned)) {
      pts -= gpCost(earned);
      const person = GREAT_PEOPLE[cls][earned];
      const fx = person.effect;
      if (fx.science) rival.research.techProgress += fx.science;
      if (fx.culture) rival.research.civicProgress += fx.culture;
      if (fx.faith) rival.faith = (rival.faith ?? 0) + fx.faith;
      if (fx.gold) rival.treasury = (rival.treasury ?? 0) + fx.gold;
      if (fx.productionToCapital) {
        const cap = rival.cities.find((c) => c.isCapital);
        if (cap && cap.queue.length > 0) cap.queue[0].progress += fx.productionToCapital;
      }
      if (cls === 'PROPHET') rival.prophets = (rival.prophets ?? 0) + 1;
      state.greatPeople.earned.push(person.id); // gone from the shared pool
      state.eventLog.push(`${rival.name} claimed ${person.name}.`);
      earned++;
    }
    if ((rival.gpp[cls] ?? 0) !== pts) rival.gpp[cls] = pts;
  }
}

function claimBeliefs(state: GameState, rival: RivalCiv): void {
  // P5/S5 (C-17): the pantheon costs the player's PANTHEON_FAITH_COST from
  // the rival's own faith stream — the free timed claim died. The pick
  // stays a policy draw from the open pool.
  if (!rival.pantheonClaimed && (rival.faith ?? 0) >= PANTHEON_FAITH_COST) {
    const open = Object.keys(PANTHEONS).filter(
      (id) => id !== state.religion.pantheon && !state.claimedPantheons.includes(id),
    );
    if (open.length > 0) {
      rival.faith = (rival.faith ?? 0) - PANTHEON_FAITH_COST;
      const pick = open[Math.floor(nextRandom(state) * open.length)];
      state.claimedPantheons.push(pick);
      rival.pantheonClaimed = true;
      rival.pantheon = pick; // A-7: identity kept — its effects apply below
      state.eventLog.push(`${rival.name} founded a pantheon (${PANTHEONS[pick].name} is taken).`);
    }
  }
  // P5/S5 (C-17): religion needs the player's canFoundReligion gates —
  // a pantheon, a completed Holy Site, an earned Prophet (timer died).
  if (
    !rival.religionFounded &&
    rival.pantheonClaimed &&
    (rival.prophets ?? 0) > 0 &&
    rival.cities.some((rc) =>
      rc.districts.some((d) => d.type === 'HOLY_SITE' && state.map.tiles[d.tileIndex].districtComplete),
    )
  ) {
    const followers = Object.keys(FOLLOWER_BELIEFS).filter(
      (id) => id !== state.religion.follower && !state.claimedBeliefs.includes(id),
    );
    const founders = Object.keys(FOUNDER_BELIEFS).filter(
      (id) => id !== state.religion.founder && !state.claimedBeliefs.includes(id),
    );
    if (followers.length > 0 && founders.length > 0) {
      const fPick = followers[Math.floor(nextRandom(state) * followers.length)];
      const oPick = founders[Math.floor(nextRandom(state) * founders.length)];
      state.claimedBeliefs.push(fPick);
      state.claimedBeliefs.push(oPick);
      rival.religionFounded = true;
      rival.followerBelief = fPick; // A-7: identities kept — effects apply
      rival.founderBelief = oPick;
      // B-18: freeze the holy tile (the founding civ's capital center) — the
      // source of this religion's pressure spread. Capital always exists.
      rival.holyTile = (rival.cities.find((rc) => rc.isCapital) ?? rival.cities[0])?.centerIndex ?? null;
      const name = RELIGION_NAMES[(rival.id + 1) % RELIGION_NAMES.length];
      state.eventLog.push(`${rival.name} founded ${name} — two beliefs left the pool.`);
    }
  }
  // B-18: enhance the founded religion — a SECOND earned Prophet claims an
  // enhancer belief, denying it from the shared pool (like follower/founder).
  // The draw sits AFTER the founder draw with the same UNCONDITIONAL shape the
  // GPU's _next_random(eopen) mirrors — only the outcome gates on pool + state.
  // Effects are all inert this round; the identity applies via getRivalModifiers.
  if (rival.religionFounded && !rival.enhancerClaimed && (rival.prophets ?? 0) >= 2) {
    const enhancers = Object.keys(ENHANCER_BELIEFS).filter(
      (id) => id !== state.religion.enhancer && !(state.claimedEnhancers ?? []).includes(id),
    );
    if (enhancers.length > 0) {
      const ePick = enhancers[Math.floor(nextRandom(state) * enhancers.length)];
      (state.claimedEnhancers ??= []).push(ePick);
      rival.enhancerClaimed = true;
      rival.enhancerBelief = ePick; // A-7-style: identity kept — effects apply
      state.eventLog.push(`${rival.name} enhanced its religion (${ENHANCER_BELIEFS[ePick].name} is taken).`);
    }
  }
}

/** Peacetime patrol: drift back toward the nearest own city.
 * AUDIT A-8: a real-MP walk — home is picked once, then each step re-runs
 * the tilesWithin scan (any unit blocks, ties in tilesWithin order), moves
 * only if strictly closer, pays walkPath's charge (tile cost + 3 per river;
 * a full-MP unit always affords its first step), and stops once within 3. */
function patrol(state: GameState, rival: RivalCiv, unit: Unit): void {
  if (rival.cities.length === 0 || unit.movesLeft <= 0) return;
  const homeIdx = rival.cities
    .map((c) => c.centerIndex)
    .sort((a, b) => nearestDistance(state, unit.tileIndex, [a]) - nearestDistance(state, unit.tileIndex, [b]))[0];
  const home = state.map.tiles[homeIdx];
  const full = UNITS[unit.type]?.moves ?? 2;
  for (;;) {
    const here = state.map.tiles[unit.tileIndex];
    if (hexDistance(here.col, here.row, home.col, home.row) <= 3) return;
    const step = tilesWithin(state.map, here.col, here.row, 1)
      .filter((t) => t.index !== here.index && !isWater(t) && !isImpassable(t))
      .filter((t) => unitsAt(state, t.index).length === 0)
      .sort(
        (a, b) =>
          hexDistance(a.col, a.row, home.col, home.row) - hexDistance(b.col, b.row, home.col, home.row),
      )[0];
    if (!step || hexDistance(step.col, step.row, home.col, home.row) >= hexDistance(here.col, here.row, home.col, home.row)) {
      return;
    }
    const cost = moveCostInto(step) + (crossesRiver(here, step) ? 3 : 0);
    if (unit.movesLeft < cost && unit.movesLeft < full) return;
    unit.tileIndex = step.index;
    unit.movesLeft = Math.max(0, unit.movesLeft - cost);
    clearCampFor(state, unit, step.index); // P5/S7 (C-3)
    // B-3 ZOC: patrol halts adjacent to a hostile MILITARY unit (barbs at
    // peace; the player too once at war — LIVE unitsHostile per step).
    if (inEnemyZoc(state, unit.tileIndex, unit)) {
      unit.movesLeft = 0;
      return;
    }
    if (unit.movesLeft <= 0) return;
  }
}

/**
 * A rival city's food/production from its actual territory: the best
 * `population` owned tiles within working range (no-modifier yields, plus
 * a base and a small tech scaler). Good land now means strong rivals.
 */
/**
 * C1-B4: queue the best placeable scaffold district for this rival city, if
 * any — the rival's own unlocks, the shared placement rules
 * (canPlaceDistrictIn), tile = best floor(districtAdjacency) with ties to
 * the LOWEST tile index (map order, mirroring the exporter scan and the GPU
 * key). Queueing paves the tile immediately (tile.district set, complete
 * false, improvement cleared — exactly queueDistrict's writes) and locks
 * districtCostIn(rival.research).
 */
function tryQueueRivalDistrict(state: GameState, rival: RivalCiv, rc: RivalCity, unlocks: Unlocks): boolean {
  const owns = (t: Tile) => tileOwnedByCiv(t, civOfRival(rival.id));
  for (const { id } of SCAFFOLD_DISTRICTS) {
    let best = -1;
    let bestAdj = -1;
    for (const t of state.map.tiles) {
      if (!owns(t) || t.improvement) continue;
      if (!canPlaceDistrictIn(state, rc, id, t.index, { unlocks, ownsTile: owns }).ok) continue;
      const adj = Math.floor(districtAdjacency(state.map, t, id));
      if (adj > bestAdj) {
        bestAdj = adj;
        best = t.index;
      }
    }
    if (best < 0) continue;
    const tile = state.map.tiles[best];
    // P4/D-8: the rival's own discount, priced BEFORE registering the
    // placement (symmetric with the player's queueDistrict).
    const base = districtCostIn(rival.research);
    const cost = rivalDistrictDiscounted(state, rival, id, unlocks) ? Math.floor(base * 0.6) : base;
    tile.district = id;
    tile.districtComplete = false;
    tile.improvement = null;
    // AUDIT C-6: placement removes a bonus resource, exactly like the
    // player's queueDistrict (real Civ 6 rule; canPlaceDistrictIn already
    // refused luxury/strategic).
    if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;
    rc.districts.push({ type: id, tileIndex: best });
    rc.queue.push({ kind: 'district', district: id, tileIndex: best, progress: 0, cost });
    return true;
  }
  return false;
}

/** P5/S1 (C-12): a rival city's gold upkeep — the player's cityMaintenance
 * verbatim (completed districts + buildings, shared maintenance tables). */
function rivalCityMaintenance(state: GameState, rc: RivalCity): number {
  let total = 0;
  for (const d of rc.districts) {
    if (state.map.tiles[d.tileIndex].districtComplete) total += districtMaintenance(d.type);
  }
  for (const b of rc.buildings) total += buildingMaintenance(b);
  return total;
}

/** P4/D-8 (symmetric with districtDiscounted): 40% off while this rival has
 * PLACED fewer of the type than its per-unlocked-type average of COMPLETED
 * specialty districts — n < ceil(D/U), D ≥ U, from ITS OWN research. */
function rivalDistrictDiscounted(
  state: GameState,
  rival: RivalCiv,
  type: DistrictId,
  unlocks: Unlocks,
): boolean {
  if (!DISTRICTS[type]?.countsTowardLimit) return false;
  const U = [...unlocks.districts].filter((d) => DISTRICTS[d as DistrictId]?.countsTowardLimit).length;
  if (U === 0) return false;
  let D = 0;
  let n = 0;
  for (const rc of rival.cities) {
    for (const d of rc.districts) {
      if (!DISTRICTS[d.type]?.countsTowardLimit) continue;
      if (state.map.tiles[d.tileIndex].districtComplete) D += 1;
      if (d.type === type) n += 1;
    }
  }
  return D >= U && n < Math.ceil(D / U);
}

/**
 * C1-B4b-2: queue the CHEAPEST building available under the rival's own
 * gates — catalog order breaks cost ties (mirrors the GPU's argmin over
 * cost·1024+index). Single-slot queues mean no queued-set bookkeeping; the
 * required district must already be COMPLETE (a one-slot queue can't wait
 * on an in-flight district like the player's multi-item queue can).
 * Worship buildings are religion-locked (no rival religion machinery).
 */
function tryQueueRivalBuilding(state: GameState, rc: RivalCity, unlocks: Unlocks): boolean {
  const have = new Set(rc.buildings);
  const center = state.map.tiles[rc.centerIndex];
  const done = new Set(
    rc.districts.filter((d) => state.map.tiles[d.tileIndex].districtComplete).map((d) => d.type),
  );
  let best: (typeof BUILDINGS)[string] | null = null;
  for (const def of Object.values(BUILDINGS)) {
    if (have.has(def.id) || def.worship) continue;
    if (!done.has(def.district)) continue;
    if (!unlocks.buildings.has(def.id)) continue;
    if (def.requiresAny && !def.requiresAny.some((x) => have.has(x))) continue;
    if (def.exclusiveWith?.some((x) => have.has(x))) continue;
    if (def.special === 'WATER_MILL' && !hasRiver(center)) continue;
    // Cheapest wins; ties break by id (ascending) to match the GPU's exported
    // building order (sorted cost, then id) — NOT catalog/source order, which
    // silently diverged (e.g. MARKET vs TEMPLE, both cost 120: id 'MARKET' wins).
    if (!best || def.cost < best.cost || (def.cost === best.cost && def.id < best.id)) best = def;
  }
  if (!best) return false;
  rc.queue.push({ kind: 'building', building: best.id, progress: 0 });
  return true;
}

/** AUDIT A-4: the CAPITAL raises a world wonder once buildings run dry —
 * first unlocked wonder in data order, first eligible owned tile (lowest
 * index), one per world (wonderExists counts in-flight tiles: queueing
 * paves them, exactly like the player's queueWonder). Placement mirrors
 * canPlaceWonder's checks from the rival's seat; the tile writes are
 * queueWonder's verbatim (improvement dies, feature dies except
 * floodplains, a bonus resource is stripped — the C-6 rule). */
function tryQueueRivalWonder(state: GameState, rival: RivalCiv, rc: RivalCity, _unlocks: Unlocks): boolean {
  if (!rc.isCapital) return false;
  const civ = civOfRival(rival.id);
  const center = state.map.tiles[rc.centerIndex];
  for (const def of Object.values(BUILT_WONDERS)) {
    if (wonderExists(state, def.id)) continue;
    if (def.requiresTech && !rival.research.techs.includes(def.requiresTech)) continue;
    if (def.requiresCivic && !rival.research.civics.includes(def.requiresCivic)) continue;
    const p = def.placement;
    const cands = tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS)
      .filter((t) => {
        if (!tileOwnedByCiv(t, civ) || t.index === rc.centerIndex) return false;
        if (t.district || t.builtWonder || t.wonder) return false;
        if (isImpassable(t)) return false;
        if (t.resource && RESOURCES[t.resource].category !== 'bonus') return false;
        if (p.onCoastalWater) {
          if (!isCoastalWater(state.map, t)) return false;
        } else {
          if (isWater(t)) return false;
          if (t.feature === 'FLOODPLAINS' && !p.allowFloodplains) return false;
          if (t.feature === 'OASIS') return false;
          if (p.terrains && !p.terrains.includes(t.terrain)) return false;
          if (p.flatOnly && t.elevation !== 'FLAT') return false;
          if (p.hillsOnly && t.elevation !== 'HILLS') return false;
        }
        if (p.requiresRiver && !hasRiver(t)) return false;
        const around = neighbors(state.map, t);
        if (p.adjacentDistrict && !around.some((n) => n.district === p.adjacentDistrict && n.districtComplete)) return false;
        if (p.adjacentResource && !around.some((n) => n.resource === p.adjacentResource)) return false;
        return true;
      })
      .sort((a, b) => a.index - b.index);
    const tile = cands[0];
    if (!tile) continue;
    tile.builtWonder = def.id;
    tile.builtWonderComplete = false;
    tile.improvement = null;
    tile.feature = tile.feature === 'FLOODPLAINS' ? tile.feature : null;
    if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;
    rc.wonders.push({ id: def.id, tileIndex: tile.index });
    rc.queue.push({ kind: 'wonder', wonder: def.id, tileIndex: tile.index, progress: 0 });
    return true;
  }
  return false;
}

/** A-4: the civ-wide wonder growth multiplier (Hanging Gardens) — the
 * empireGrowthMult twin over the RIVAL's completed wonders. */
function rivalGrowthAllMult(state: GameState, rival: RivalCiv): number {
  let mult = 1;
  for (const rc of rival.cities) {
    for (const w of rc.wonders ?? []) {
      const def = BUILT_WONDERS[w.id];
      if (def?.effects?.growthAllMult && state.map.tiles[w.tileIndex].builtWonderComplete) {
        mult *= def.effects.growthAllMult;
      }
    }
  }
  return mult;
}

/** C1-B5b: does this rival already have a builder (alive or queued)? One at a time. */
function rivalHasBuilder(state: GameState, rival: RivalCiv): boolean {
  // NB: rival UNIT civId is the RAW rival id (rivalUnits' convention) —
  // only TILE ownership lives in the unified civ space.
  if (state.units.some((u) => u.owner === 'rival' && u.civId === rival.id && u.type === 'BUILDER')) return true;
  return rival.cities.some((rc) => rc.queue[0]?.kind === 'unit' && rc.queue[0].unit === 'BUILDER');
}

/** C1-B5b: any owned LAND tile a rival builder could work right now?
 * AUDIT A-13: every improvement validImprovementsIn offers under the rival's
 * own unlocks counts (resource improvements included), plus pillaged tiles
 * (repair jobs) — mirrors the GPU job mask exactly. Water improvements are
 * unreachable (a land builder can never stand on the tile). */
function rivalHasJob(state: GameState, rival: RivalCiv, unlocks: Unlocks): boolean {
  const owns = (t: Tile) => tileOwnedByCiv(t, civOfRival(rival.id));
  return state.map.tiles.some(
    (t) =>
      owns(t) &&
      !isWater(t) &&
      (t.pillaged || (!t.improvement && validImprovementsIn(t, { unlocks, ownsTile: owns }).length > 0)),
  );
}

/**
 * C1-B5b: rival builder actions — on a valid owned unimproved tile, build the
 * option with the best Δ tileScore under defaultModifiers (owner boosts land
 * in B5b-iii); Δ per improvement is its flat catalog yields, so ties resolve
 * by validImprovementsIn's return order via strict `>` (a resource tile
 * offers exactly its resource's improvement — A-13).
 * Otherwise single-step toward the nearest job (dist·(T+1)+index key, then
 * the tileFreeForUnit neighbor closest to it, ties to direction order,
 * moving only if strictly closer) — the exporter's player builder walk with
 * the civ-aware stacking rules. Zero RNG.
 */
function rivalBuilderActions(state: GameState, rival: RivalCiv, unlocks: Unlocks): void {
  const owns = (t: Tile) => tileOwnedByCiv(t, civOfRival(rival.id));
  const vopts = { unlocks, ownsTile: owns };
  // C1-B5b-iii: the OWNER's research boosts apply (mine yields; farm-adj
  // rides along but FEUDALISM sits outside the 100-turn horizon, matching
  // the player path's latent status). Government/religion/CS blocks stay
  // player machinery.
  const ctx = { map: state.map, mods: modifiersFromResearch(rival.research) };
  const nTiles = state.map.tiles.length;
  for (const u of [...state.units]) {
    // unit civId = RAW rival id; tile ownership = unified civ space
    if (u.owner !== 'rival' || u.civId !== rival.id || u.type !== 'BUILDER' || (u.charges ?? 0) <= 0) continue;
    const bt = state.map.tiles[u.tileIndex];
    // AUDIT A-13: REPAIR first — standing on an owned pillaged tile clears
    // the flag with builderRepair's exact semantics (no charge, the turn is
    // spent). Barbarian raids on rival farmland finally get answered.
    if (bt.pillaged && owns(bt)) {
      bt.pillaged = false;
      u.movesLeft = 0;
      continue;
    }
    // AUDIT A-13: the FARM/MINE/LUMBER_MILL filter is GONE — rival builders
    // place every improvement validImprovementsIn offers under their own
    // unlocks (QUARRY/PASTURE/CAMP/PLANTATION/OIL_WELL; resource tiles offer
    // exactly the resource's improvement). Water improvements are
    // unreachable — a land builder can never stand on the tile.
    const options = !bt.improvement ? validImprovementsIn(bt, vopts) : [];
    if (options.length > 0) {
      let bestImp = options[0];
      let bestGain = -Infinity;
      for (const imp of options) {
        const gain =
          tileScore(tileYields(ctx, { ...bt, improvement: imp }), 'balanced') -
          tileScore(tileYields(ctx, bt), 'balanced');
        if (gain > bestGain) {
          bestGain = gain;
          bestImp = imp;
        }
      }
      bt.improvement = bestImp;
      bt.pillaged = false;
      // P5/S4 gate-catch (seed 9066 t44, hunted via the new RU a-flags):
      // building spends the turn — the D-2 heal gate must see it (real
      // Civ 6; the GPU sets v_acted here). A working builder healing +20
      // every turn was the asymmetry.
      u.movesLeft = 0;
      u.charges = (u.charges ?? 1) - 1;
      if (u.charges <= 0) disbandUnit(state, u.id);
      continue;
    }
    // walk toward the nearest job — A-13: a job is any owned LAND tile that
    // is unimproved-and-buildable (any improvement) OR pillaged (repair).
    let best = -1;
    let bestKey = Infinity;
    for (const t of state.map.tiles) {
      if (!owns(t) || isWater(t)) continue;
      const isJob = t.pillaged || (!t.improvement && validImprovementsIn(t, vopts).length > 0);
      if (!isJob) continue;
      const key = hexDistance(bt.col, bt.row, t.col, t.row) * (nTiles + 1) + t.index;
      if (key < bestKey) {
        bestKey = key;
        best = t.index;
      }
    }
    if (best < 0) continue;
    // AUDIT A-8: the walk toward the (fixed) nearest job runs on REAL MP —
    // per step: the free neighbor strictly closer (first-found wins ties =
    // direction order), walkPath's charge (tile cost + 3 per river; a
    // full-MP unit always affords its first step). Any step still blocks
    // the D-2 heal (movesLeft < full — the GPU v_acted twin).
    const jt = state.map.tiles[best];
    const fullB = UNITS[u.type]?.moves ?? 2;
    for (;;) {
      const at = state.map.tiles[u.tileIndex];
      const dHere = hexDistance(at.col, at.row, jt.col, jt.row);
      if (dHere === 0) break;
      let dest = -1;
      let destD = dHere;
      for (const n of neighbors(state.map, at)) {
        if (!tileFreeForUnit(state, n.index, u)) continue;
        const d = hexDistance(n.col, n.row, jt.col, jt.row);
        if (d < destD) {
          destD = d;
          dest = n.index;
        }
      }
      if (dest < 0) break;
      const dt = state.map.tiles[dest];
      const cost = moveCostInto(dt) + (crossesRiver(at, dt) ? 3 : 0);
      if (u.movesLeft < cost && u.movesLeft < fullB) break;
      u.tileIndex = dest;
      u.movesLeft = Math.max(0, u.movesLeft - cost);
      clearCampFor(state, u, dest); // P5/S7 (C-3): mirrors walkPath's any-unit clear
      // B-3 ZOC: the builder (a civilian mover) halts adjacent to a hostile
      // MILITARY unit too — only the EXERTER must be military.
      if (inEnemyZoc(state, u.tileIndex, u)) {
        u.movesLeft = 0;
        break;
      }
      if (u.movesLeft <= 0) break;
    }
  }
}

/**
 * C1-B5b-iii: rival housing, mods-free — the computeHousing core: center
 * water (fresh/coastal/dry + the Aqueduct rule), building housing, and
 * improvement housing on civ-owned tiles within the work radius. Specialty
 * districts all carry 0 housing in scope, so no district term.
 */
export function rivalHousing(state: GameState, rival: RivalCiv, rc: RivalCity): number {
  const map = state.map;
  const center = map.tiles[rc.centerIndex];
  const fresh = hasFreshWater(map, center);
  let water = fresh ? HOUSING_FRESH_WATER : isCoastalLand(map, center) ? HOUSING_COASTAL : HOUSING_NO_WATER;
  const hasAqueduct = rc.districts.some(
    (d) => d.type === 'AQUEDUCT' && map.tiles[d.tileIndex].districtComplete,
  );
  if (hasAqueduct) {
    water = fresh ? water + AQUEDUCT_FRESH_BONUS : Math.max(water, AQUEDUCT_NO_FRESH_TOTAL);
  }
  let total = water;
  // A-7 / B-18: belief building housing (Religious Community) keys per-city on
  // the city's followed religion; River Goddess (pantheon) stays per-civ. The
  // owner religion id is this rival's index + 1 (used when coupling is inert).
  const ownerRel = state.rivals.indexOf(rival) + 1;
  const m = withFollowerBelief(state, getRivalModifiers(state, rival), followerReligionForCity(rc.followedReligion, ownerRel));
  for (const id of rc.buildings) {
    total += BUILDINGS[id]?.housing ?? 0;
    total += m.buildingHousingAdd[id] ?? 0;
  }
  if (m.riverCity && hasRiver(center)) total += m.riverCity.housing;
  const civ = civOfRival(rival.id);
  for (const t of tilesWithin(map, center.col, center.row, CITY_WORK_RADIUS)) {
    if (!tileOwnedByCiv(t, civ) || !t.improvement) continue;
    total += IMPROVEMENTS[t.improvement as keyof typeof IMPROVEMENTS]?.housing ?? 0;
  }
  return total;
}

/** P5/S6 (C-20): the player's amenity model per rival civ — each UNIQUE
 * improved luxury on ITS territory grants +1 amenity to its
 * LUXURY_AMENITY_CITIES neediest cities (need desc, id asc = acquisition
 * order — the luxuryAmenities mirror); tier = amenityTier(have − needed)
 * with have = local building amenities + grants. Regional/policy amenity
 * sources are player machinery (rivals can't build them; no Palace). */
export function rivalAmenityTiers(state: GameState, rival: RivalCiv): Map<number, AmenityTier> {
  const grants = new Map<number, number>();
  for (const rc of rival.cities) grants.set(rc.id, 0);
  const luxuries = new Set<string>();
  for (const t of state.map.tiles) {
    if (!t.resource || (t.rivalId ?? -1) !== rival.id) continue;
    const def = RESOURCES[t.resource];
    if (def.category === 'luxury' && t.improvement === def.improvement) luxuries.add(t.resource);
  }
  const baseHave = new Map<number, number>();
  for (const rc of rival.cities) {
    let n = 0;
    for (const id of rc.buildings) {
      const bd = BUILDINGS[id];
      if (bd && !bd.regional && bd.amenities) n += bd.amenities;
    }
    baseHave.set(rc.id, n);
  }
  for (let i = 0; i < luxuries.size; i++) {
    const ranked = [...rival.cities].sort((a, b) => {
      const needA = amenitiesNeeded(a.population) - (baseHave.get(a.id)! + grants.get(a.id)!);
      const needB = amenitiesNeeded(b.population) - (baseHave.get(b.id)! + grants.get(b.id)!);
      return needB - needA || a.id - b.id;
    });
    for (const rc of ranked.slice(0, LUXURY_AMENITY_CITIES)) grants.set(rc.id, grants.get(rc.id)! + 1);
  }
  // A-7: River Goddess (pantheon, per-civ) + B-18 Zen Meditation (follower,
  // per-CITY on the followed religion) join the tier balance exactly like
  // computeCityStats' have (city.ts:456-461); the luxury-grant RANKING
  // stays building-amenities-only, mirroring the player's luxuryAmenities.
  const base = getRivalModifiers(state, rival);
  const ownerRel = state.rivals.indexOf(rival) + 1;
  // B-15: this rival's flat war-weariness amenity penalty (symmetric with the
  // player's), applied to the tier balance after the luxury grants.
  const wwPenalty = warWearinessPenalty(rival.warWeariness ?? 0);
  const tiers = new Map<number, AmenityTier>();
  for (const rc of rival.cities) {
    const m = withFollowerBelief(state, base, followerReligionForCity(rc.followedReligion, ownerRel));
    let extra = 0;
    if (m.riverCity && hasRiver(state.map.tiles[rc.centerIndex])) extra += m.riverCity.amenities;
    if (m.amenitiesIfSpecialty.length > 0) {
      const specialty = rc.districts.filter(
        (d) => DISTRICTS[d.type].countsTowardLimit && state.map.tiles[d.tileIndex].districtComplete,
      ).length;
      for (const rule of m.amenitiesIfSpecialty) if (specialty >= rule.min) extra += rule.amenities;
    }
    tiers.set(rc.id, amenityTier(baseHave.get(rc.id)! + grants.get(rc.id)! + extra - wwPenalty - amenitiesNeeded(rc.population)));
  }
  return tiers;
}

export function rivalCityYields(
  state: GameState,
  rival: RivalCiv,
  rc: RivalCity,
  tier?: AmenityTier,
): Yields {
  // C1-B1: the REAL citizen path, under defaultModifiers (rivals get no
  // player techs/policies). Candidates mirror workableTiles — owned tiles
  // in the work radius, no district/wonder tiles, impassable excluded
  // (water IS workable, exactly like player citizens) — scored by the real
  // tileScore ('balanced' focus, ties to the lowest index, mirroring
  // assignWorkedTiles with no locks), topped by population. The center
  // contributes its real floored yields (tileYieldsForCenter) instead of
  // the old flat 3🍞/2⚙ base. The nTechs production multiplier remains
  // the research→production stand-in until C1-B5's real improvements.
  const center = state.map.tiles[rc.centerIndex];
  // A rival applies its OWN research boosts to its own tiles, exactly like the
  // player (Civ 6): improvement yields (mine +production), farm-adjacency, hill
  // farms — all from the rival's own techs/civics. NOT the player's boosts.
  // A-7: plus its OWN claimed pantheon/beliefs (getRivalModifiers) — feature/
  // improvement yields flow through tileYields; the founder's capital incomes
  // and pantheon channels apply below. B-18: the FOLLOWER belief (Work Ethic,
  // Feed the World / Choral Music building adds, faithPerWonder) keys per-city
  // on this city's followed religion (owner religion = rival index + 1 when the
  // coupling is inert). Government/CS stay player-only.
  const ownerRel = state.rivals.indexOf(rival) + 1;
  const ctx = { map: state.map, mods: withFollowerBelief(state, getRivalModifiers(state, rival), followerReligionForCity(rc.followedReligion, ownerRel)) };
  const ranked = tilesWithin(state.map, center.col, center.row, RIVAL_WORK_RADIUS)
    .filter(
      (t) =>
        tileOwnedByCiv(t, civOfRival(rival.id)) &&
        t.index !== rc.centerIndex &&
        !t.district &&
        !t.builtWonder &&
        !isImpassable(t),
    )
    .map((t) => {
      const y = tileYields(ctx, t);
      return { y, index: t.index, score: tileScore(y, 'balanced') };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const worked = ranked.slice(0, rc.population);
  const centerY = tileYieldsForCenter(ctx, center);
  const total = { ...centerY };
  for (const w of worked) {
    for (const k of Object.keys(total) as (keyof Yields)[]) total[k] += w.y[k];
  }
  // A-4: this city's completed wonders (registry tiles confirmed complete).
  const rcWonders = (rc.wonders ?? [])
    .filter((w) => state.map.tiles[w.tileIndex].builtWonderComplete)
    .map((w) => BUILT_WONDERS[w.id])
    .filter((d): d is (typeof BUILT_WONDERS)[string] => Boolean(d));
  // A-4 Petra: +2 food +2 gold +1 production on worked desert non-floodplain
  // tiles — POST-selection like computeCityStats' petraBonus (the score
  // ranks without it; the center never qualifies, it carries CITY_CENTER).
  if (rcWonders.some((d) => d.effects?.petraDesert)) {
    for (const w of worked) {
      const t = state.map.tiles[w.index];
      if (t.terrain === 'DESERT' && t.feature !== 'FLOODPLAINS' && !t.district) {
        total.food += 2;
        total.gold += 2;
        total.production += 1;
      }
    }
  }
  // C1-B5b-iii: the B3 research→production stand-in is RETIRED — real
  // mines carry rival production now (owner boosts included via ctx).
  // C1-B4b: COMPLETED districts add floor(adjacency) into their yield
  // column — the rival twin of cityDistrictYields under empty modifiers
  // (adjacencyMult 1, no envoy bonuses, no Work Ethic). Gold/faith land
  // in columns no rival consumer reads yet (BUILD_PLAN: rival stocks are
  // a later stage); added after the research multiplier so production
  // semantics stay worked-tiles-only.
  for (const d of rc.districts) {
    if (d.type === 'CITY_CENTER') continue;
    const dt = state.map.tiles[d.tileIndex];
    if (!dt.districtComplete) continue;
    const col = DISTRICTS[d.type].adjacencyYield;
    if (!col) continue;
    const adj = Math.floor(districtAdjacency(state.map, dt, d.type));
    total[col] += adj;
    // A-7 Work Ethic: Holy Site adjacency also provides production
    // (yields.ts:150, the rival's floored-adjacency convention).
    if (d.type === 'HOLY_SITE' && ctx.mods.workEthic) total.production += adj;
  }
  // C1-B4b-2: building yields under empty modifiers (mult 1, no belief
  // adds; worship never queues, so the plain def.yields sum matches
  // cityBuildingYields). P1/C-22: Harbors are rival-reachable now, so the
  // SHIPYARD special is live — production += the completed Harbor's
  // floor(adjacency), the rival twin of yields.ts:171.
  for (const id of rc.buildings) {
    const bd = BUILDINGS[id];
    if (bd?.yields) {
      for (const [k, v] of Object.entries(bd.yields)) total[k as keyof Yields] += v ?? 0;
    }
    // A-7: belief building adds (Feed the World, Choral Music — the
    // cityBuildingYields beliefAdd twin, yields.ts:169).
    const beliefAdd = ctx.mods.buildingYieldAdd[id];
    if (beliefAdd) {
      for (const [k, v] of Object.entries(beliefAdd)) total[k as keyof Yields] += v ?? 0;
    }
    if (bd?.special === 'SHIPYARD') {
      const harbor = rc.districts.find((d) => d.type === 'HARBOR');
      if (harbor && state.map.tiles[harbor.tileIndex].districtComplete) {
        total.production += Math.floor(districtAdjacency(state.map, state.map.tiles[harbor.tileIndex], 'HARBOR'));
      }
    }
  }
  // A-4: wonder flat city yields + the belief faithPerWonder (city.ts:435-437
  // positions — pre-tier, with the buildings).
  for (const wd of rcWonders) {
    if (wd.cityYields) {
      for (const [k, v] of Object.entries(wd.cityYields)) total[k as keyof Yields] += v ?? 0;
    }
  }
  if (ctx.mods.faithPerWonder > 0) total.faith += ctx.mods.faithPerWonder * rcWonders.length;
  // A-7r: the government/policy flat yields — cityYields to every city,
  // capitalYields to the capital (computeCityStats' `bonuses`, city.ts:445-447)
  // — added BEFORE the tier scaling. getRivalModifiers layers the rival's
  // adopted government + slotted policies into these, so AUTOCRACY's capital
  // yields and URBAN_PLANNING's +1 production flow here, the player twin.
  for (const [k, v] of Object.entries(ctx.mods.cityYields)) total[k as keyof Yields] += v ?? 0;
  // A-7: the founder's capital incomes (perFollowers/perCity land in
  // capitalYields) — added BEFORE the tier scaling, the computeCityStats
  // bonuses position (city.ts:447/475-479).
  if (rc.isCapital) {
    for (const [k, v] of Object.entries(ctx.mods.capitalYields)) total[k as keyof Yields] += v ?? 0;
  }
  // P5/S6 (C-20): the amenity tier scales non-food yields, exactly like
  // computeCityStats. External callers (score/statelog) re-rank FRESH;
  // the phase loop passes its loop-top frozen map — the player's luxMap
  // discipline.
  const t = tier ?? rivalAmenityTiers(state, rival).get(rc.id) ?? amenityTier(0);
  for (const k of ['production', 'gold', 'science', 'culture', 'faith'] as (keyof Yields)[]) {
    total[k] *= t.yieldFactor;
  }
  // A-4: the owning city's wonder yield multipliers (Oxford/Big Ben) —
  // AFTER the tier scaling, the computeCityStats order (city.ts:483-489).
  for (const wd of rcWonders) {
    const mult = wd.effects?.cityYieldMult;
    if (!mult) continue;
    for (const k of Object.keys(mult) as (keyof Yields)[]) {
      total[k] *= mult[k] ?? 1;
    }
  }
  return total;
}

/** P5/S6 (C-19): a rival city at 0 loyalty defects to the civ exerting the
 * most pressure — the PLAYER included (the reverse transfer at last; the
 * player wins ties, then rivals by id — the GPU's first_argmax order). */
function defectRivalCity(state: GameState, rival: RivalCiv, rc: RivalCity): void {
  const here = state.map.tiles[rc.centerIndex];
  const pressureOf = (cities: { centerIndex: number; population: number }[]) => {
    let p = 0;
    for (const c of cities) {
      const t = state.map.tiles[c.centerIndex];
      const d = hexDistance(here.col, here.row, t.col, t.row);
      if (d <= LOYALTY_RANGE) p += c.population * (LOYALTY_RANGE + 1 - d);
    }
    return p;
  };
  let winner: RivalCiv | null = null; // null = the player
  let best = pressureOf(state.cities);
  for (const other of state.rivals) {
    if (other.id === rival.id) continue;
    const p = pressureOf(other.cities);
    if (p > best) {
      best = p;
      winner = other;
    }
  }
  if (winner === null) {
    // The reverse transfer: the capture machinery minus the conquest
    // plunder (raze-at-6 and last-city elimination semantics shared).
    captureRivalCity(state, rival, rc, false);
    state.eventLog.push(`${rc.name} defected to your empire!`);
  } else {
    transferRivalCityToRival(state, rival, winner, rc);
  }
}

/** The rc → rc transfer (loyalty flips between rivals): pop ×0.75 floor 1,
 * fresh boxes, CITY_CENTER-only registry, half HP, territory re-tags —
 * the transferCityToRival shape on the rival side. */
function transferRivalCityToRival(state: GameState, from: RivalCiv, to: RivalCiv, rc: RivalCity): void {
  from.cities = from.cities.filter((c) => c.id !== rc.id);
  const center = state.map.tiles[rc.centerIndex];
  for (const t of tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS)) {
    if (tileOwnedByCiv(t, civOfRival(from.id))) t.rivalId = to.id;
  }
  to.cities.push({
    id: to.nextCityId++,
    name: rc.name,
    civId: civOfRival(to.id),
    centerIndex: rc.centerIndex,
    population: Math.max(1, Math.floor(rc.population * 0.75)),
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: rc.tilesAcquired,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: rc.centerIndex }],
    wonders: [],
    specialists: {},
    hp: Math.round(RIVAL_CITY_MAX_HP / 2),
    foundedTurn: state.turn,
  });
  state.eventLog.push(`${rc.name} defected from ${from.name} to ${to.name}!`);
}

export function rivalPhase(state: GameState): void {
  if (state.rivals.length === 0) return;

  // Rival units get their movement in this phase (like barbarians).
  for (const u of state.units) {
    if (u.owner === 'rival') u.movesLeft = UNITS[u.type]?.moves ?? 2;
  }

  for (const rival of state.rivals) {
    if (rival.cities.length === 0) continue; // eliminated

    // B-15: war weariness — symmetric with the player's endTurn-top update,
    // read at this rival's block top before rivalAmenityTiers uses it.
    rival.warWeariness = rival.atWar
      ? Math.min(WAR_WEARINESS_CAP, (rival.warWeariness ?? 0) + WAR_WEARINESS_PER_TURN)
      : Math.max(0, (rival.warWeariness ?? 0) - WAR_WEARINESS_DECAY);

    // AUDIT A-3: eurekas/inspirations fire from the RIVAL's seat too — the
    // mirror of the player's endTurn-top detectBoosts (same conditions,
    // this civ's cities/research/territory; the discounts apply in the
    // research loops below).
    detectRivalBoosts(state, rival);

    // C1-B2: per-city REAL production queues (settler + units at real
    // costs) replace the pooled prodstock/milstock, their pace/split
    // constants and the random home-city draw. Each city queues ONE item —
    // the capital prefers the settler (one in flight per civ), everyone
    // else trains units up to the cap — funds it with its OWN production,
    // and resolves it on completion at that city. Unit TYPE gates on the
    // rival's REAL techs (C1-B3b); buildings arrive with B4. Picks
    // happen for the PRE-TURN city set, in founding order, before any
    // same-turn completion can found a new city.
    const unitCap = rival.cities.length * 2 + (rival.atWar ? 3 : 1);
    let unitCount = rivalUnits(state, rival.id).length;
    let settlerQueued = false;
    // AUDIT A-6: army composition (military only — builders don't count),
    // live + queued, updated through this pick loop so same-turn picks see
    // each other — the ranged share targets 1 ranged per 2 melee.
    let meleeCount = 0;
    let rangedCount = 0;
    for (const u of rivalUnits(state, rival.id)) {
      const d = UNITS[u.type];
      if (!d || d.combat <= 0) continue;
      if (d.ranged) rangedCount += 1;
      else meleeCount += 1;
    }
    for (const rc of rival.cities) {
      const q = rc.queue[0];
      if (q?.kind === 'unit') {
        unitCount += 1;
        const d = q.unit ? UNITS[q.unit] : undefined;
        if (d && d.combat > 0) {
          if (d.ranged) rangedCount += 1;
          else meleeCount += 1;
        }
      }
      if (q?.kind === 'settler') settlerQueued = true;
    }
    const rivalUnlocks = computeUnlocksIn(rival.research);
    for (const rc of rival.cities) {
      if (rc.queue.length > 0) continue;
      if (!settlerQueued && rc.isCapital && rival.cities.length < RIVAL_MAX_CITIES) {
        rc.queue.push({ kind: 'settler', progress: 0, cost: RIVAL_SETTLER_COST(rival.cities.length) });
        settlerQueued = true;
      } else if (tryQueueRivalDistrict(state, rival, rc, rivalUnlocks)) {
        // C1-B4: districts outrank units — the economy compounds.
      } else if (tryQueueRivalBuilding(state, rc, rivalUnlocks)) {
        // C1-B4b-2: then buildings, then the army.
      } else if (tryQueueRivalWonder(state, rival, rc, rivalUnlocks)) {
        // A-4: the capital raises a world wonder once buildings run dry.
      } else if (!rivalHasBuilder(state, rival) && rivalHasJob(state, rival, rivalUnlocks) && unitCount < unitCap) {
        // C1-B5b: one builder per civ at a time, only while jobs exist.
        // A builder is a unit — it takes a cap slot like any other.
        // P4/D-10: price escalates on the RIVAL's own counter (one at a
        // time, so no queued term), locked at queue time like the player's.
        rc.queue.push({
          kind: 'unit',
          unit: 'BUILDER',
          progress: 0,
          cost: Math.round((50 + 4 * (rival.buildersTrained ?? 0)) * GAME_SPEED),
        });
        unitCount += 1;
      } else if (unitCount < unitCap) {
        // AUDIT A-6: a mixed roster — train ranged while the army holds
        // fewer than 1 ranged per 2 melee; best types off the rival's OWN
        // techs (ARCHER once ARCHERY lands, SLINGER before — it is ungated,
        // exactly like the player's catalog; the melee ladder unchanged).
        const meleeType = rival.research.techs.includes('HORSEBACK_RIDING')
          ? 'HORSEMAN'
          : rival.research.techs.includes('BRONZE_WORKING')
            ? 'SPEARMAN'
            : 'WARRIOR';
        const rangedType = rival.research.techs.includes('ARCHERY') ? 'ARCHER' : 'SLINGER';
        const wantRanged = rangedCount * 2 < meleeCount;
        const type = wantRanged ? rangedType : meleeType;
        rc.queue.push({ kind: 'unit', unit: type, progress: 0 });
        unitCount += 1;
        if (wantRanged) rangedCount += 1;
        else meleeCount += 1;
      } else {
        // AUDIT A-14: army capped, nothing else queueable — run the first
        // project whose district is COMPLETE (PROJECTS data order),
        // converting production to a yield lump + GPP like the player's
        // queueProject. Cost = the player's projectCost curve on the
        // RIVAL's own research (the D-8 symmetry pattern).
        const proj = Object.values(PROJECTS).find((p) =>
          rc.districts.some((d) => d.type === p.district && state.map.tiles[d.tileIndex].districtComplete),
        );
        if (proj) {
          const cost = Math.max(Math.round(15 * GAME_SPEED), Math.round(districtCostIn(rival.research) * 0.5));
          rc.queue.push({ kind: 'project', project: proj.id, progress: 0, cost });
        }
      }
    }

    // AUDIT A-5 (+A-5r): spend the banked gold — ONE purchase per civ per
    // turn, priority BUILDING > SETTLER > UNIT. Building: the cheapest
    // completable building anywhere in the civ (cost, then id, then city
    // order — the tryQueueRivalBuilding key), bought INSTANTLY at the
    // player's goldPurchaseMult price, keeping the opening peace cost as a
    // war chest. Skips a building queued in that same city (completion would
    // duplicate it). If no building was bought, the A-5r settler/unit
    // branches run below (no war-chest reserve, matching the controlled
    // head's apply_rival_actions purchase spec).
    {
      let bought = false;
      let buyCity: RivalCity | null = null;
      let buyDef: (typeof BUILDINGS)[string] | null = null;
      for (const rc of rival.cities) {
        const have = new Set(rc.buildings);
        const done = new Set(
          rc.districts.filter((d) => state.map.tiles[d.tileIndex].districtComplete).map((d) => d.type),
        );
        const center = state.map.tiles[rc.centerIndex];
        for (const def of Object.values(BUILDINGS)) {
          if (have.has(def.id) || def.worship) continue;
          if (!done.has(def.district)) continue;
          if (!rivalUnlocks.buildings.has(def.id)) continue;
          if (def.requiresAny && !def.requiresAny.some((x) => have.has(x))) continue;
          if (def.exclusiveWith?.some((x) => have.has(x))) continue;
          if (def.special === 'WATER_MILL' && !hasRiver(center)) continue;
          if (rc.queue[0]?.kind === 'building' && rc.queue[0].building === def.id) continue;
          if (!buyDef || def.cost < buyDef.cost || (def.cost === buyDef.cost && def.id < buyDef.id)) {
            buyDef = def;
            buyCity = rc;
          }
        }
      }
      if (buyDef && buyCity) {
        const price = buyDef.cost * GOLD_PURCHASE_MULT;
        const reserve = PEACE_GOLD_COST(0);
        if (Math.round((rival.treasury ?? 0) * 1000) >= Math.round((price + reserve) * 1000)) {
          rival.treasury = (rival.treasury ?? 0) - price;
          buyCity.buildings.push(buyDef.id);
          if (buyDef.id === 'ANCIENT_WALLS') buyCity.outerHp = WALLS_HP; // AUDIT B-1
          bought = true;
        }
      }
      // AUDIT A-5r: SETTLER — when no building was bought and the civ is
      // under its city cap, buy one at the rival settler price × mult. The
      // rival has no settler bank, so the purchase founds IMMEDIATELY via the
      // production-settler site scan (tryFoundCity); pay only on a real found
      // (no site = refund, the spawn-refund convention). The new city joins
      // this turn's amenity map and city loop (both taken after this block).
      if (!bought && rival.cities.length < RIVAL_MAX_CITIES) {
        const price = RIVAL_SETTLER_COST(rival.cities.length) * GOLD_PURCHASE_MULT;
        if (goldAffordable(rival.treasury ?? 0, price)) {
          const before = rival.cities.length;
          tryFoundCity(state, rival);
          if (rival.cities.length > before) {
            rival.treasury = (rival.treasury ?? 0) - price;
            bought = true;
          }
        }
      }
      // AUDIT A-5r: MILITARY UNIT — when nothing else was bought and the
      // civ's live+queued military is under the #56 H1 quota (2× cities,
      // rival-side), buy the STRONGEST affordable trainable military unit
      // (highest combat, ties to table order) at cost × mult. It spawns via
      // the shared rival machinery at the capital (else the first city), and
      // pays only where it LANDED (no free spot = refund, the P5/S8 pattern).
      if (!bought && meleeCount + rangedCount < rival.cities.length * 2) {
        let pickId: string | null = null;
        let pickCombat = -Infinity;
        for (const cand of RIVAL_BUY_UNITS) {
          if (cand.tech && !rival.research.techs.includes(cand.tech)) continue;
          const def = UNITS[cand.id];
          if (!def) continue;
          if (!goldAffordable(rival.treasury ?? 0, def.cost * GOLD_PURCHASE_MULT)) continue;
          if (def.combat > pickCombat) {
            pickCombat = def.combat;
            pickId = cand.id;
          }
        }
        if (pickId) {
          const spawnCity = rival.cities.find((c) => c.isCapital) ?? rival.cities[0];
          const price = UNITS[pickId].cost * GOLD_PURCHASE_MULT;
          const u = spawnUnit(state, pickId, spawnCity.centerIndex, 'rival', rival.id);
          if (u) {
            rival.treasury = (rival.treasury ?? 0) - price;
            bought = true;
          }
        }
      }
    }

    // Cities: real tile yields drive growth and the production queues.
    // Iterate a SNAPSHOT — a settler completing mid-loop founds a city,
    // and the newborn must not act this turn (the GPU gates on the
    // pre-turn alive mask the same way).
    let sciSum = 0;
    let culSum = 0;
    let goldSum = 0;
    let faithSum = 0;
    // P5/S6 (C-20): the amenity map freezes at the loop top (the player's
    // luxMap discipline) — loyalty, growth and yields all read this turn's
    // tiers; defections resolve after the loop (the player pattern).
    const amenTiers = rivalAmenityTiers(state, rival);
    const rcDefectors: RivalCity[] = [];
    for (const rc of [...rival.cities]) {
      const tier = amenTiers.get(rc.id) ?? amenityTier(0);
      // P5/S6 (C-19): rival city loyalty at the loop top (the player's
      // applyLoyalty position) — own = THIS civ's cities, foreign = the
      // player's + every other rival's; capitals are immune; live pops
      // (earlier cities in this loop already grew — the player's mix).
      if (rc.isCapital) {
        rc.loyalty = LOYALTY_MAX;
      } else if (state.cities.length > 0 || state.rivals.some((o) => o.id !== rival.id && o.cities.length > 0)) {
        const here = state.map.tiles[rc.centerIndex];
        let own = 0;
        let foreign = 0;
        for (const c2 of rival.cities) {
          const t2 = state.map.tiles[c2.centerIndex];
          const d = hexDistance(here.col, here.row, t2.col, t2.row);
          if (d <= LOYALTY_RANGE) own += c2.population * (LOYALTY_RANGE + 1 - d);
        }
        for (const c2 of state.cities) {
          const t2 = state.map.tiles[c2.centerIndex];
          const d = hexDistance(here.col, here.row, t2.col, t2.row);
          if (d <= LOYALTY_RANGE) foreign += c2.population * (LOYALTY_RANGE + 1 - d);
        }
        for (const other of state.rivals) {
          if (other.id === rival.id) continue;
          for (const c2 of other.cities) {
            const t2 = state.map.tiles[c2.centerIndex];
            const d = hexDistance(here.col, here.row, t2.col, t2.row);
            if (d <= LOYALTY_RANGE) foreign += c2.population * (LOYALTY_RANGE + 1 - d);
          }
        }
        const pressure =
          own + foreign === 0 ? 0 : (LOYALTY_PRESSURE_SCALE * (own - foreign)) / (own + foreign);
        const next = (rc.loyalty ?? LOYALTY_MAX) + pressure + (LOYALTY_AMENITY[tier.name] ?? 0);
        rc.loyalty = Math.max(0, Math.min(LOYALTY_MAX, next));
        if (rc.loyalty <= 0) rcDefectors.push(rc);
      }
      const y = rivalCityYields(state, rival, rc, tier);
      // P5/S1 (C-12): rivals pay district+building upkeep like the player's
      // computeCityStats (completed districts only; same maintenance tables).
      goldSum += y.gold - rivalCityMaintenance(state, rc);
      faithSum += y.faith; // P5/S5 (C-17): the faith yield gains its consumer
      const food = y.food;
      const production = y.production;
      // C1-B3a: rival science/culture streams — tile+center columns plus
      // the citizens' contribution, exactly like the player path.
      sciSum += y.science + CITIZEN_SCIENCE * rc.population;
      const culC = y.culture + CITIZEN_CULTURE * rc.population;
      culSum += culC;
      // C1-B1: the real growth accounting — true surplus (can be negative),
      // the unscaled Civ 6 growth curve, grow subtracts the need instead of
      // zeroing the box, and starvation shrinks the city exactly like the
      // player turn loop.
      // C1-B5b-iii: REAL housing throttles growth (housingGrowthFactor on
      // positive surplus) — RIVAL_MAX_POP is retired; farms now supply the
      // housing that makes growth survivable.
      const surplus = food - FOOD_PER_CITIZEN * rc.population;
      const hFactor = housingGrowthFactor(rivalHousing(state, rival, rc) - rc.population);
      // P5/S6 (C-20): the tier's growth factor rides the housing factor,
      // exactly like computeCityStats' effective surplus (no empire/policy
      // mults — those are player machinery).
      // A-7/A-4: the belief growth multiplier AND the civ's wonder growth
      // multiplier (Hanging Gardens — the empireGrowthMult twin) ride the
      // chain exactly like computeCityStats (city.ts:495-501).
      rc.foodBox += surplus > 0
        ? surplus * hFactor * tier.growthFactor * getRivalModifiers(state, rival).growthMult * rivalGrowthAllMult(state, rival)
        : surplus;
      const need = growthFoodNeeded(rc.population);
      if (rc.foodBox >= need) {
        rc.population += 1;
        rc.foodBox -= need;
      } else if (rc.foodBox < 0) {
        rc.population = Math.max(1, rc.population - 1);
        rc.foodBox = 0;
      }
      // Queue progress + completion (settler founds via the site scan; a
      // unit spawns at THIS city — no home-city RNG draw anymore).
      const q = rc.queue[0];
      if (q && (q.kind === 'settler' || q.kind === 'unit' || q.kind === 'district' || q.kind === 'building' || q.kind === 'project' || q.kind === 'wonder')) {
        q.progress += production;
        const cost =
          q.kind === 'unit'
            ? q.cost ?? UNITS[q.unit]?.cost ?? 54 // P4/D-10: builders lock at queue
            : q.kind === 'building'
              ? BUILDINGS[q.building]?.cost ?? 54
              : q.kind === 'wonder'
                ? BUILT_WONDERS[q.wonder]?.cost ?? 54 // A-4: catalog cost (already speed-scaled)
                : q.cost ?? 54; // settler / district / project carry their own cost
        if (q.progress >= cost) {
          rc.queue.shift();
          if (q.kind === 'settler') tryFoundCity(state, rival);
          else if (q.kind === 'district') state.map.tiles[q.tileIndex].districtComplete = true;
          else if (q.kind === 'building') {
            rc.buildings.push(q.building);
            if (q.building === 'ANCIENT_WALLS') rc.outerHp = WALLS_HP; // AUDIT B-1
          }
          else if (q.kind === 'wonder') state.map.tiles[q.tileIndex].builtWonderComplete = true; // A-4
          else if (q.kind === 'project') {
            // A-14: the completion lump lands in the RIVAL's own streams
            // (the player's completeProject applies via applyLumpYield to
            // its civ streams; GP effects already use this rival pattern).
            const def = PROJECTS[q.project];
            // B-25: a rival completing the space race ends the game as a player
            // DEFEAT (victoryType 4 — the domination-defeat mirror). Rivals
            // never queue space projects under the scripted greedy `.find`, so
            // this is inert in-gate; present for correctness + the poke path.
            if (def?.space) {
              if (!rival.spaceProjects) rival.spaceProjects = [];
              if (!rival.spaceProjects.includes(q.project)) rival.spaceProjects.push(q.project);
              if (def.victory) {
                state.victoryType = 4; // science defeat: a rival launched first
                state.gameOver = true;
              }
            } else if (def?.yield) {
              const amount = Math.round(cost * PROJECT_YIELD_FRACTION);
              if (def.yield === 'science') rival.research.techProgress += amount;
              else if (def.yield === 'culture') rival.research.civicProgress += amount;
              else if (def.yield === 'gold') rival.treasury = (rival.treasury ?? 0) + amount;
              else if (def.yield === 'faith') rival.faith = (rival.faith ?? 0) + amount;
            }
            if (def?.gpClass) {
              const pts = Math.round(cost * PROJECT_GPP_FRACTION);
              rival.gpp[def.gpClass] = (rival.gpp[def.gpClass] ?? 0) + pts;
            }
          } else {
            spawnUnit(state, q.unit, rc.centerIndex, 'rival', rival.id);
            if (q.unit === 'BUILDER') rival.buildersTrained = (rival.buildersTrained ?? 0) + 1; // P4/D-10
          }
        }
      }
      // P5/S4 (C-15): the player's cultural border growth — this city's
      // culture (the culSum term, pre-growth pop) fills its own box and
      // consumes against the player's escalating curve; the flat
      // every-9-turns timer died with it.
      rc.cultureBox += culC;
      // A-7: Religious Settlements — the belief border-cost multiplier,
      // the player's Math.round(base * borderCostMult) form (city.ts:507).
      const rcBorderCost = () =>
        Math.round(borderGrowthCost(rc.tilesAcquired) * getRivalModifiers(state, rival).borderCostMult);
      while (rc.cultureBox >= rcBorderCost()) {
        const next = pickRivalBorderTile(state, rival, rc);
        if (next === null) {
          // Nowhere to grow: cap the box at the current threshold.
          rc.cultureBox = Math.min(rc.cultureBox, rcBorderCost());
          break;
        }
        rc.cultureBox -= rcBorderCost();
        state.map.tiles[next].rivalId = rival.id;
        rc.tilesAcquired += 1;
      }
      // AUDIT B-2: the rival mirror of the player city strike (combat.ts) —
      // a rival city WITH ANCIENT_WALLS fires once per turn at the nearest
      // unit hostile to THIS civ (barbarians always; the player's at-war
      // units, civilians included), lowest tile index breaking ties. One
      // roll at the rival city's defense strength vs the target's defense
      // (rivalCityDefense; single roll, no retaliation, never captures).
      // rc order, immediately before the heal — a kill shifts the shared RNG.
      const rcCenter = state.map.tiles[rc.centerIndex];
      if (rc.buildings.includes('ANCIENT_WALLS')) {
        let bestTile = -1;
        let bestDist = 99;
        for (const t of state.map.tiles) {
          const d = hexDistance(rcCenter.col, rcCenter.row, t.col, t.row);
          if (d < 1 || d > 2) continue;
          if (!unitsAt(state, t.index).some((u) => unitsHostile(state, u, { owner: 'rival', civId: rival.id }))) continue;
          if (d < bestDist) {
            bestDist = d;
            bestTile = t.index;
          }
        }
        if (bestTile >= 0) {
          const hostiles = unitsAt(state, bestTile).filter((u) =>
            unitsHostile(state, u, { owner: 'rival', civId: rival.id }),
          );
          const defender = hostiles.find((u) => unitDomain(u.type) === 'military') ?? hostiles[0];
          const tt = state.map.tiles[bestTile];
          const defCS = (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender); // B-29 (attacker is the city)
          const atkCS = rivalCityDefense(state, rival, rc);
          defender.hp -= damageRoll(state, atkCS - defCS, 'rcstk', bestTile);
          if (defender.hp <= 0) disbandUnit(state, defender.id);
        }
      }
      // AUDIT A-10: a siege pins the HP, exactly like the player's heal —
      // any adjacent unit hostile to THIS civ (the player's at-war units,
      // CIVILIANS included per unitsHostile — the P5/S2 player-heal lesson
      // — or barbarians; other rivals never besiege).
      const besieged = neighbors(state.map, rcCenter).some((n) =>
        unitsAt(state, n.index).some((u) => unitsHostile(state, u, { owner: 'rival', civId: rival.id })),
      );
      // AUDIT A-20: unbesieged cities heal the flat player rate, war or
      // not (real Civ 6) — the 15-peace/5-war split was a local invention.
      // AUDIT B-1: the outer wall pool heals on the same gate/rate (cap
      // WALLS_HP), full-HP or not — the player's barbarianPhase mirror.
      if (!besieged) {
        rc.hp = Math.min(RIVAL_CITY_MAX_HP, rc.hp + CITY_HEAL_PER_TURN);
        if (rc.buildings.includes('ANCIENT_WALLS')) {
          rc.outerHp = Math.min(WALLS_HP, (rc.outerHp ?? WALLS_HP) + CITY_HEAL_PER_TURN);
        }
      }
    }

    // P5/S6 (C-19): loyalty collapses resolve after the city loop (they
    // mutate the list) — to the max-pressure civ; the PLAYER can win one.
    for (const rc of rcDefectors) defectRivalCity(state, rival, rc);

    // C1-B3a: REAL research — cheapest-first auto-pick at RAW cost (no
    // eurekas for rivals until B6; ties keep the tech-table order via the
    // stable sort, mirroring the player's autoPickResearch), progress
    // banks and drains exactly like advanceResearch.
    const rsr = rival.research;
    // A-3: cheapest-first by EFFECTIVE cost, like the player's auto-pick
    // (boosts discount the pick key; stable sort keeps table-order ties).
    const pickNext = () => {
      if (rsr.tech === null)
        rsr.tech = availableTechsIn(rsr).sort(
          (a, b) => effectiveResearchCostIn(rsr, a.id, a.cost) - effectiveResearchCostIn(rsr, b.id, b.cost),
        )[0]?.id ?? null;
      if (rsr.civic === null)
        rsr.civic = availableCivicsIn(rsr).sort(
          (a, b) => effectiveResearchCostIn(rsr, a.id, a.cost) - effectiveResearchCostIn(rsr, b.id, b.cost),
        )[0]?.id ?? null;
    };
    pickNext();
    rsr.techProgress += sciSum;
    // A-3: boosted techs complete at the discounted cost, like the player's
    // advanceResearch (effectiveResearchCostIn — same rounding).
    while (rsr.tech && rsr.techProgress >= effectiveResearchCostIn(rsr, rsr.tech, TECHS[rsr.tech].cost)) {
      rsr.techProgress -= effectiveResearchCostIn(rsr, rsr.tech, TECHS[rsr.tech].cost);
      rsr.techs.push(rsr.tech);
      rsr.tech = null;
      pickNext();
    }
    if (!rsr.tech && availableTechsIn(rsr).length === 0) rsr.techProgress = Math.min(rsr.techProgress, 0);
    rsr.civicProgress += culSum;
    // P5/S1 (C-12): net gold — city upkeep already netted per city; unit
    // upkeep and the GV-5 bankruptcy rule mirror the player's exactly
    // (milli-rounded test; disband the priciest-upkeep unit, tie → lowest
    // id; no refund).
    rival.treasury = (rival.treasury ?? 0) + goldSum;
    rival.faith = (rival.faith ?? 0) + faithSum; // P5/S5 (C-17)
    rival.treasury -= state.units.reduce(
      (s, u) => s + (u.owner === 'rival' && u.civId === rival.id ? UNITS[u.type]?.maintenance ?? 0 : 0),
      0,
    );
    if (Math.round(rival.treasury * 1000) < 0) {
      let victim: Unit | undefined;
      for (const u of state.units) {
        if (u.owner !== 'rival' || u.civId !== rival.id) continue;
        const m = UNITS[u.type]?.maintenance ?? 0;
        if (m <= 0) continue;
        const vm = victim ? UNITS[victim.type]?.maintenance ?? 0 : 0;
        if (!victim || m > vm || (m === vm && u.id < victim.id)) victim = u;
      }
      if (victim) disbandUnit(state, victim.id);
    }
    while (rsr.civic && rsr.civicProgress >= effectiveResearchCostIn(rsr, rsr.civic, CIVICS[rsr.civic].cost)) {
      rsr.civicProgress -= effectiveResearchCostIn(rsr, rsr.civic, CIVICS[rsr.civic].cost);  // A-3
      rsr.civics.push(rsr.civic);
      rsr.civic = null;
      pickNext();
    }
    if (!rsr.civic && availableCivicsIn(rsr).length === 0) rsr.civicProgress = Math.min(rsr.civicProgress, 0);

    // C1-B5b: builder actions (build best-Δ improvement or walk to a job).
    rivalBuilderActions(state, rival, rivalUnlocks);

    // Races: great people, pantheons, beliefs.
    claimGreatPeople(state, rival);
    claimBeliefs(state, rival);

    // War and peace.
    if (rival.atWar) {
      rival.warTurns += 1;
      for (const unit of rivalUnits(state, rival.id)) {
        if (UNITS[unit.type]?.charges !== undefined) continue; // C1-B5b: civilians act in rivalBuilderActions, never march
        if (unit.movesLeft > 0) hostileUnitAct(state, unit);
      }
      if (rival.warTurns >= RIVAL_WAR_MIN_TURNS && nextRandom(state) < 0.25) {
        // P5/S2 (C-13): suing costs the rival what it costs the player —
        // PEACE_GOLD_COST(warTurns) from ITS treasury; a broke rival fights
        // on. The roll stays UNCONDITIONAL (draw-count parity with the GPU);
        // only the outcome gates on affordability.
        const cost = PEACE_GOLD_COST(rival.warTurns);
        if (goldAffordable(rival.treasury ?? 0, cost)) {
          rival.treasury = (rival.treasury ?? 0) - cost;
          makePeace(state, rival);
        }
      }
    } else {
      rival.peaceTurns += 1;
      for (const unit of rivalUnits(state, rival.id)) {
        if (UNITS[unit.type]?.charges !== undefined) continue; // C1-B5b: builders don't patrol
        // Self-defense first: kill barbarians in reach, then drift home.
        // AUDIT A-6: ranged units snipe at their full range (one roll, no
        // retaliation) — a melee call would just refuse the distant tile.
        const targets = attackTargets(state, unit);
        if (targets.length > 0) {
          if (UNITS[unit.type]?.ranged) hostileRangedStrike(state, unit, targets[0]);
          else meleeAttack(state, unit.id, targets[0]);
          continue;
        }
        patrol(state, rival, unit);
      }
      if (
        state.cities.length > 0 &&
        rival.peaceTurns > 20 &&
        rivalProximity(state, rival) <= 9 &&
        rivalStrength(state, rival) > playerStrength(state) * 1.3 &&
        nextRandom(state) < 0.08 * (0.5 + rival.aggression)
      ) {
        rival.atWar = true;
        rival.warTurns = 0;
        state.eventLog.push(`${rival.name} declares war on you!`);
      }
    }
  }
}
