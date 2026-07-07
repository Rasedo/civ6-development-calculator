/**
 * Scripted rival civilizations: real cities, territory and units on the map,
 * abstract economy underneath. They settle, grow, expand borders, race you
 * for great people, pantheons and beliefs, and can declare (or receive) war
 * — at-war units raid like barbarians, and cities can be conquered.
 */

import type { City, GameState, RivalCity, RivalCiv, Tile, Unit, Yields } from './types';
import { tilesWithin, hexDistance } from './hex';
import { isWater, isImpassable, hasFreshWater } from './query';
import { nextRandom } from './rand';
import { spawnUnit, unitsAt } from './units';
import { hostileUnitAct, attackTargets, meleeAttack } from './combat';
import { defaultModifiers, availableTechsIn, availableCivicsIn, computeUnlocksIn, type Unlocks } from './effects';
import { tileYields } from './yields';
import { isSuzerain } from './cityStates';
import { LEVY_UNITS, LEVY_GOLD_COST, LEVY_COOLDOWN } from '../data/cityStates';
import type { RuleResult } from './rules';
import { TERRAINS } from '../data/terrains';
import { TECHS } from '../data/techs';
import { BUILDINGS } from '../data/buildings';
import { CIVICS } from '../data/civics';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { UNITS } from '../data/units';
import { GP_CLASS_DISTRICT, GP_CLASSES, GREAT_PEOPLE, gpCost } from '../data/greatPeople';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, RELIGION_NAMES } from '../data/religion';
import { growthFoodNeeded, CITY_MIN_DIST, FOOD_PER_CITIZEN, CITIZEN_SCIENCE, CITIZEN_CULTURE } from '../data/constants';
import { tileScore, tileYieldsForCenter } from './city';
import { canPlaceDistrictIn } from './rules';
import { hasRiver } from './query';
import { districtCostIn } from './game';
import { districtAdjacency } from './yields';
import { DISTRICTS, SCAFFOLD_DISTRICTS } from '../data/districts';
import {
  RIVAL_LEADERS,
  RIVAL_MAX_POP,
  RIVAL_PROD_DIV,
  RIVAL_MAX_CITIES,
  RIVAL_SETTLER_COST,
  RIVAL_BORDER_PERIOD,
  RIVAL_PANTHEON_TURN,
  RIVAL_RELIGION_TURN,
  RIVAL_WAR_MIN_TURNS,
  PEACE_MIN_WAR_TURNS,
  PEACE_GOLD_COST,
  RIVAL_CITY_MAX_HP,
  RIVAL_WORK_RADIUS,
  LOYALTY_MAX,
  LOYALTY_RANGE,
  LOYALTY_PRESSURE_SCALE,
  LOYALTY_AMENITY,
} from '../data/rivals';
import { tileClaimed, tileOwnedByCiv, civOfRival } from './civs';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

const RIVAL_SPACING = 10;

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
    population: rival.cities.length === 0 ? 3 : 1,
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
  tile.rivalId = rival.id;
  for (const t of tilesWithin(state.map, tile.col, tile.row, 1)) {
    if (!tileOwned(t) && !isWater(t)) t.rivalId = rival.id;
  }
  rival.cities.push(city);
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
      research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
      gpp: {},
      pantheonClaimed: false,
      religionFounded: false,
    };
    foundRivalCity(state, rival, tile);
    spawnUnit(state, 'WARRIOR', tile.index, 'rival', rival.id);
    state.rivals.push(rival);
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
    if (state.treasury < cost) return no(`Peace costs ${cost} gold right now.`);
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
    if (state.treasury < LEVY_GOLD_COST) return no(`Levy costs ${LEVY_GOLD_COST} gold.`);
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

  state.cities = state.cities.filter((c) => c.id !== city.id);
  delete state.cityHp[String(city.id)];
  state.tradeRoutes = state.tradeRoutes.filter((r) => r.from !== city.id && r.to !== city.id);
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
  state.eventLog.push(`${city.name} has defected to ${winner.name}! (loyalty collapsed)`);
}

// ---------------------------------------------------------------------------
// Per-turn phase
// ---------------------------------------------------------------------------

function expandRivalBorder(state: GameState, rival: RivalCiv, city: RivalCity): void {
  const center = state.map.tiles[city.centerIndex];
  let best: Tile | null = null;
  let bestScore = -Infinity;
  for (const t of tilesWithin(state.map, center.col, center.row, 3)) {
    if (tileOwned(t) || isWater(t) || isImpassable(t) || t.wonder) continue;
    const adjOwn = tilesWithin(state.map, t.col, t.row, 1).some(
      (n) => n.index !== t.index && tileOwnedByCiv(n, civOfRival(rival.id)),
    );
    if (!adjOwn) continue;
    const dist = hexDistance(center.col, center.row, t.col, t.row);
    const score = (t.resource ? 3 : 0) - dist * 2 - t.index / 1e6;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best) {
    best.rivalId = rival.id;
    city.tilesAcquired += 1;
  }
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
              hexDistance(state.map.tiles[c.centerIndex].col, state.map.tiles[c.centerIndex].row, t.col, t.row) <
              CITY_MIN_DIST + 1,
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
    let pts = 0;
    for (const rc of rival.cities) {
      if (!rc.districts.some((d) => d.type === gpDist && state.map.tiles[d.tileIndex].districtComplete)) continue;
      pts += 1 + rc.buildings.filter((b) => BUILDINGS[b]?.district === gpDist).length;
    }
    if (pts > 0) rival.gpp[cls] = (rival.gpp[cls] ?? 0) + pts;
    const earned = state.greatPeople.earned.filter((id) =>
      GREAT_PEOPLE[cls].some((p) => p.id === id),
    ).length;
    const person = GREAT_PEOPLE[cls][earned];
    if (!person) continue;
    if ((rival.gpp[cls] ?? 0) >= gpCost(earned)) {
      rival.gpp[cls] = 0;
      state.greatPeople.earned.push(person.id); // gone from the shared pool
      state.eventLog.push(`${rival.name} claimed ${person.name}.`);
    }
  }
}

function claimBeliefs(state: GameState, rival: RivalCiv): void {
  if (!rival.pantheonClaimed && state.turn >= RIVAL_PANTHEON_TURN + rival.id * 8) {
    const open = Object.keys(PANTHEONS).filter(
      (id) => id !== state.religion.pantheon && !state.claimedPantheons.includes(id),
    );
    if (open.length > 0) {
      const pick = open[Math.floor(nextRandom(state) * open.length)];
      state.claimedPantheons.push(pick);
      rival.pantheonClaimed = true;
      state.eventLog.push(`${rival.name} founded a pantheon (${PANTHEONS[pick].name} is taken).`);
    }
  }
  if (!rival.religionFounded && state.turn >= RIVAL_RELIGION_TURN + rival.id * 12) {
    const followers = Object.keys(FOLLOWER_BELIEFS).filter(
      (id) => id !== state.religion.follower && !state.claimedBeliefs.includes(id),
    );
    const founders = Object.keys(FOUNDER_BELIEFS).filter(
      (id) => id !== state.religion.founder && !state.claimedBeliefs.includes(id),
    );
    if (followers.length > 0 && founders.length > 0) {
      state.claimedBeliefs.push(followers[Math.floor(nextRandom(state) * followers.length)]);
      state.claimedBeliefs.push(founders[Math.floor(nextRandom(state) * founders.length)]);
      rival.religionFounded = true;
      const name = RELIGION_NAMES[(rival.id + 1) % RELIGION_NAMES.length];
      state.eventLog.push(`${rival.name} founded ${name} — two beliefs left the pool.`);
    }
  }
}

/** Peacetime patrol: drift back toward the nearest own city. */
function patrol(state: GameState, rival: RivalCiv, unit: Unit): void {
  if (rival.cities.length === 0 || unit.movesLeft <= 0) return;
  const here = state.map.tiles[unit.tileIndex];
  const homeIdx = rival.cities
    .map((c) => c.centerIndex)
    .sort((a, b) => nearestDistance(state, unit.tileIndex, [a]) - nearestDistance(state, unit.tileIndex, [b]))[0];
  const home = state.map.tiles[homeIdx];
  if (hexDistance(here.col, here.row, home.col, home.row) <= 3) return;
  const step = tilesWithin(state.map, here.col, here.row, 1)
    .filter((t) => t.index !== here.index && !isWater(t) && !isImpassable(t))
    .filter((t) => unitsAt(state, t.index).length === 0)
    .sort(
      (a, b) =>
        hexDistance(a.col, a.row, home.col, home.row) - hexDistance(b.col, b.row, home.col, home.row),
    )[0];
  if (step && hexDistance(step.col, step.row, home.col, home.row) < hexDistance(here.col, here.row, home.col, home.row)) {
    unit.tileIndex = step.index;
    unit.movesLeft = 0;
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
    tile.district = id;
    tile.districtComplete = false;
    tile.improvement = null;
    rc.districts.push({ type: id, tileIndex: best });
    rc.queue.push({ kind: 'district', district: id, tileIndex: best, progress: 0, cost: districtCostIn(rival.research) });
    return true;
  }
  return false;
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
    if (!best || def.cost < best.cost) best = def;
  }
  if (!best) return false;
  rc.queue.push({ kind: 'building', building: best.id, progress: 0 });
  return true;
}

export function rivalCityYields(
  state: GameState,
  rival: RivalCiv,
  rc: RivalCity,
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
  const ctx = { map: state.map, mods: defaultModifiers() };
  const worked = tilesWithin(state.map, center.col, center.row, RIVAL_WORK_RADIUS)
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
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, rc.population);
  const centerY = tileYieldsForCenter(ctx, center);
  const total = { ...centerY };
  for (const w of worked) {
    for (const k of Object.keys(total) as (keyof Yields)[]) total[k] += w.y[k];
  }
  // C1-B3b: the research stand-in reads the REAL tree — nTechs/RIVAL_PROD_DIV
  // (K=12 calibrated so t100 production lands near the old techLevel curve);
  // it retires entirely at B5 when rival improvements carry production.
  total.production *= 1 + rival.research.techs.length / RIVAL_PROD_DIV;
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
    total[col] += Math.floor(districtAdjacency(state.map, dt, d.type));
  }
  // C1-B4b-2: building yields under empty modifiers (mult 1, no belief
  // adds; the exported scope has no regional/SHIPYARD buildings and
  // worship never queues, so the plain def.yields sum IS
  // cityBuildingYields here).
  for (const id of rc.buildings) {
    const bd = BUILDINGS[id];
    if (!bd?.yields) continue;
    for (const [k, v] of Object.entries(bd.yields)) total[k as keyof Yields] += v ?? 0;
  }
  return total;
}

export function rivalPhase(state: GameState): void {
  if (state.rivals.length === 0) return;

  // Rival units get their movement in this phase (like barbarians).
  for (const u of state.units) {
    if (u.owner === 'rival') u.movesLeft = UNITS[u.type]?.moves ?? 2;
  }

  for (const rival of state.rivals) {
    if (rival.cities.length === 0) continue; // eliminated

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
    for (const rc of rival.cities) {
      const q = rc.queue[0];
      if (q?.kind === 'unit') unitCount += 1;
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
      } else if (unitCount < unitCap) {
        const type = rival.research.techs.includes('HORSEBACK_RIDING')
          ? 'HORSEMAN'
          : rival.research.techs.includes('BRONZE_WORKING')
            ? 'SPEARMAN'
            : 'WARRIOR';
        rc.queue.push({ kind: 'unit', unit: type, progress: 0 });
        unitCount += 1;
      }
    }

    // Cities: real tile yields drive growth and the production queues.
    // Iterate a SNAPSHOT — a settler completing mid-loop founds a city,
    // and the newborn must not act this turn (the GPU gates on the
    // pre-turn alive mask the same way).
    let sciSum = 0;
    let culSum = 0;
    for (const rc of [...rival.cities]) {
      const y = rivalCityYields(state, rival, rc);
      const food = y.food;
      const production = y.production;
      // C1-B3a: rival science/culture streams — tile+center columns plus
      // the citizens' contribution, exactly like the player path.
      sciSum += y.science + CITIZEN_SCIENCE * rc.population;
      culSum += y.culture + CITIZEN_CULTURE * rc.population;
      // C1-B1: the real growth accounting — true surplus (can be negative),
      // the unscaled Civ 6 growth curve, grow subtracts the need instead of
      // zeroing the box, and starvation shrinks the city exactly like the
      // player turn loop. RIVAL_MAX_POP stays as the housing stand-in until
      // C1-B2+ gives rivals real housing.
      rc.foodBox += food - FOOD_PER_CITIZEN * rc.population;
      const need = growthFoodNeeded(rc.population);
      if (rc.foodBox >= need && rc.population < RIVAL_MAX_POP) {
        rc.population += 1;
        rc.foodBox -= need;
      } else if (rc.foodBox < 0) {
        rc.population = Math.max(1, rc.population - 1);
        rc.foodBox = 0;
      }
      // Queue progress + completion (settler founds via the site scan; a
      // unit spawns at THIS city — no home-city RNG draw anymore).
      const q = rc.queue[0];
      if (q && (q.kind === 'settler' || q.kind === 'unit' || q.kind === 'district' || q.kind === 'building')) {
        q.progress += production;
        const cost =
          q.kind === 'unit'
            ? UNITS[q.unit]?.cost ?? 54
            : q.kind === 'building'
              ? BUILDINGS[q.building]?.cost ?? 54
              : q.cost ?? 54;
        if (q.progress >= cost) {
          rc.queue.shift();
          if (q.kind === 'settler') tryFoundCity(state, rival);
          else if (q.kind === 'district') state.map.tiles[q.tileIndex].districtComplete = true;
          else if (q.kind === 'building') rc.buildings.push(q.building);
          else spawnUnit(state, q.unit, rc.centerIndex, 'rival', rival.id);
        }
      }
      if ((state.turn + rc.id * 3) % RIVAL_BORDER_PERIOD === 0) {
        expandRivalBorder(state, rival, rc);
      }
      rc.hp = Math.min(RIVAL_CITY_MAX_HP, rc.hp + (rival.atWar ? 5 : 15));
    }

    // C1-B3a: REAL research — cheapest-first auto-pick at RAW cost (no
    // eurekas for rivals until B6; ties keep the tech-table order via the
    // stable sort, mirroring the player's autoPickResearch), progress
    // banks and drains exactly like advanceResearch. techLevel still
    // drives every consumer until B3b swaps them one by one.
    const rsr = rival.research;
    const pickNext = () => {
      if (rsr.tech === null) rsr.tech = availableTechsIn(rsr).sort((a, b) => a.cost - b.cost)[0]?.id ?? null;
      if (rsr.civic === null) rsr.civic = availableCivicsIn(rsr).sort((a, b) => a.cost - b.cost)[0]?.id ?? null;
    };
    pickNext();
    rsr.techProgress += sciSum;
    while (rsr.tech && rsr.techProgress >= TECHS[rsr.tech].cost) {
      rsr.techProgress -= TECHS[rsr.tech].cost;
      rsr.techs.push(rsr.tech);
      rsr.tech = null;
      pickNext();
    }
    if (!rsr.tech && availableTechsIn(rsr).length === 0) rsr.techProgress = Math.min(rsr.techProgress, 0);
    rsr.civicProgress += culSum;
    while (rsr.civic && rsr.civicProgress >= CIVICS[rsr.civic].cost) {
      rsr.civicProgress -= CIVICS[rsr.civic].cost;
      rsr.civics.push(rsr.civic);
      rsr.civic = null;
      pickNext();
    }
    if (!rsr.civic && availableCivicsIn(rsr).length === 0) rsr.civicProgress = Math.min(rsr.civicProgress, 0);

    // Races: great people, pantheons, beliefs.
    claimGreatPeople(state, rival);
    claimBeliefs(state, rival);

    // War and peace.
    if (rival.atWar) {
      rival.warTurns += 1;
      for (const unit of rivalUnits(state, rival.id)) {
        if (unit.movesLeft > 0) hostileUnitAct(state, unit);
      }
      if (rival.warTurns >= RIVAL_WAR_MIN_TURNS && nextRandom(state) < 0.25) {
        makePeace(state, rival);
      }
    } else {
      rival.peaceTurns += 1;
      for (const unit of rivalUnits(state, rival.id)) {
        // Self-defense first: kill adjacent barbarians, then drift home.
        const targets = attackTargets(state, unit);
        if (targets.length > 0) {
          meleeAttack(state, unit.id, targets[0]);
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
