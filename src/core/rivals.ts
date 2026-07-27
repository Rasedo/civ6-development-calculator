/**
 * Scripted rival civilizations: real cities, territory and units on the map,
 * with real production queues, research, maintenance, housing and border
 * culture underneath. They settle, grow, expand borders, race you for great
 * people, pantheons and beliefs, and can declare (or receive) war — at-war
 * units raid like barbarians, and cities can be conquered.
 */

import type { City, CityState, CityStateQuest, DistrictId, GameState, RivalCity, RivalCiv, Tile, Unit, Yields } from './types';
import { tilesWithin, hexDistance, neighbors } from './hex';
import { isWater, isImpassable } from './query';
import { nextRandom } from './rand';
import { spawnUnit, unitsAt, unitsHostile, inEnemyZoc, moveCostInto, unitDomain, encampmentIntact, encampmentBlocks, riverCharge, layTradeRoad } from './units';
import { hostileUnitAct, attackTargets, meleeAttack, hostileRangedStrike, clearCampFor, captureRivalCity, damageRoll, rivalCityDefense, terrainDefense, woundPenalty, supportCount, SUPPORT_CS, xpLevelBonus, awardDefenseXp, encampmentTrainXp, GENERAL_AURA_RANGE, generalAuraCS } from './combat';
import { modifiersFromResearch, availableTechsIn, availableCivicsIn, computeUnlocksIn, type Unlocks } from './effects';
import { detectRivalBoosts, effectiveResearchCostIn } from './boosts';
import { getRivalModifiers, withFollowerBelief, followerReligionForCity } from './effects';
import { tileYields } from './yields';
import { emptyYields } from './types'; // A-22: rival specialist yields
import { rivalTradeCapacity, rivalRouteRaidedAt, routeYields, csRouteYields, routeYieldsInternational, TRADE_ROUTE_RANGE, TRADE_ROUTE_DURATION } from './trade';
import { isSuzerain, rivalIsSuzerain, csRivalEnvoyBonuses, csRivalSuzerainCapitalBonus } from './cityStates';
import { LEVY_UNITS, LEVY_GOLD_COST, LEVY_COOLDOWN, INFLUENCE_PER_TURN, ENVOY_COST, GOV_INFLUENCE_TIER, CS_MEET_RANGE, QUEST_COOLDOWN, QUEST_ENVOYS, CS_TYPE_DISTRICT } from '../data/cityStates';
import { computeAdoption } from './effects';
import { GOVERNMENTS_ADOPTION_LIVE, GOVERNMENTS } from '../data/policies';
import type { RuleResult } from './rules';
import { TERRAINS } from '../data/terrains';
import { TECHS } from '../data/techs';
import { BUILDINGS, SCRIPTED_HELD_BUILDINGS } from '../data/buildings';
import { IMPROVEMENTS } from '../data/improvements';
import { CIVICS } from '../data/civics';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { UNITS, CITY_HEAL_PER_TURN, WALLS_HP, ENCAMPMENT_HP } from '../data/units';
import { SPECIALIST_YIELDS, GP_CLASS_DISTRICT, GP_CLASSES, GREAT_PEOPLE, gpCost, GW_WORK_CLASSES, GW_CLASS_KIND, placeGreatWorks, greatWorkCulture, placeRelic, relicFaith } from '../data/greatPeople';
import { generalAuraMP } from './aura'; // #70/S3 (B-8): the aura's +1 MP half
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, RELIGION_NAMES, PANTHEON_FAITH_COST, WORSHIP_BUILDINGS, SPREAD_PRESSURE, MISSIONARY_CAP, APOSTLE_CAP, APOSTLE_BUY_LIVE, THEO_DAMAGE, THEO_BASE_DAMAGE, THEO_PRESSURE_SWING, THEO_PRESSURE_RANGE } from '../data/religion';
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
  REGIONAL_RANGE,
  borderGrowthCost,
  amenitiesNeeded,
  amenityTier,
  LUXURY_AMENITY_CITIES,
  EMBARK_MOVES,
  EMBARKED_DEFENSE_CS,
  embarkState,
  type AmenityTier,
} from '../data/constants';
import { PROJECTS, PROJECT_YIELD_FRACTION, PROJECT_GPP_FRACTION } from '../data/projects';
import { tileScore, tileYieldsForCenter, buildingMaintenance, districtMaintenance, resourcePriority, rivalTourism, civEraIndex } from './city';
import { canPlaceDistrictIn, validImprovementsIn, wonderExists } from './rules';
import { tileAppeal, appealTier } from './appeal'; // A-9 (#71)
import { hasRiver, hasFreshWater, isCoastalLand, isCoastalWater } from './query';
import { BUILT_WONDERS } from '../data/builtWonders';
import { disbandUnit, tileFreeForUnit, cityNavalCapable, waterEnterable } from './units';
import { districtCostIn, goldAffordable, buildingFaithCost } from './game';
import { districtAdjacency, pillagedDistrictTypes } from './yields';
import { DISTRICTS, SCAFFOLD_DISTRICTS, PLACEABLE_DISTRICTS } from '../data/districts';
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
  WW_SURPRISE_MULT,
  WW_FORMAL_MULT,
  warWearinessPenalty,
  RR_DOW_PROXIMITY,
  RR_DOW_STRENGTH_RATIO,
  RR_DOW_WW_MAX,
  RR_PEACE_WW,
  RR_FORMAL_MIN_TURNS,
  ERA_SCORE_FOUND,
  ERA_SCORE_CONQUER,
  ERA_SCORE_WONDER,
  ERA_SCORE_PANTHEON,
  ERA_SCORE_RELIGION,
  ERA_SCORE_GP,
  GOVERNOR_LOYALTY,
  RIVAL_TILE_BUY_LIVE,
  ADMIRAL_MARCH_LIVE,
  RR_ALLY_MIN_PEACE,
  RR_WARMONGER_DOW,
  RR_WARMONGER_CAPTURE,
  RR_WARMONGER_GANG,
  DIPLO_FAVOR_PER_SUZERAIN,
  CONGRESS_INTERVAL,
  CONGRESS_MIN_ERA,
  DVP_PER_RESOLUTION,
} from '../data/rivals';
import { addEraScore, agePressureFactor, governorPicks, governorTitles } from './eras';
import { tileClaimed, tileOwnedByCiv, civOfRival, civHasStrategic } from './civs';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

const RIVAL_SPACING = 10;

/** AUDIT A-5r (+B-10): the military units a scripted rival may gold-buy — the
 * same roster the production picker trains (WARRIOR/SLINGER ungated; the rest
 * on the rival's real techs), in UNITS-table order so strict `>` on combat
 * breaks ties to the lowest-index type (the GPU argmax mirror; HORSEMAN
 * precedes SWORDSMAN so the 36-combat tie keeps HORSEMAN). BUILDER/SCOUT are
 * excluded — never in the rival roster. requiresResource is gated in the buy
 * loop (data-driven off the catalog, verified there). */
const RIVAL_BUY_UNITS: { id: string; tech?: string }[] = [
  { id: 'WARRIOR' },
  { id: 'SLINGER' },
  { id: 'ARCHER', tech: 'ARCHERY' },
  { id: 'SPEARMAN', tech: 'BRONZE_WORKING' },
  { id: 'HORSEMAN', tech: 'HORSEBACK_RIDING' },
  { id: 'SWORDSMAN', tech: 'IRON_WORKING' },
  { id: 'PIKEMAN', tech: 'MILITARY_TACTICS' },
  { id: 'CROSSBOWMAN', tech: 'MACHINERY' },
  { id: 'KNIGHT', tech: 'STIRRUPS' },
  { id: 'MUSKETMAN', tech: 'GUNPOWDER' },
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
    // B9-R3 (A-9): a civ's FIRST city gets the PALACE, the foundCity mirror.
    // No relocation on capital loss — B-30 strips it on every capture/
    // transfer path and nothing re-grants one (recorded residual).
    buildings: rival.cities.length === 0 ? ['PALACE'] : [],
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
  tile.rivalCityId = city.id; // A-17: per-city registry
  for (const t of tilesWithin(state.map, tile.col, tile.row, 1)) {
    // Mirrors foundCity: the full first ring, water included — a coastal
    // rival must own its harbor water (AUDIT C-1; the water skip made the
    // whole Harbor line structurally unreachable for rivals).
    if (!tileOwned(t)) {
      t.rivalId = rival.id;
      t.rivalCityId = city.id;
    }
  }
  rival.cities.push(city);
  addEraScore(state, civOfRival(rival.id), ERA_SCORE_FOUND); // B-24: founded a city (t0 capitals included — exported)
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
      atWarRivals: [], // A-19/B-33 (S1): per-pair war substrate, empty at t0
      warKindFormal: [], // B-22 (S3): FORMAL-war partner ids, empty at t0
      denouncedTurn: {}, // B-22 (S3): directed denouncement stamps, empty at t0
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

// ---------------------------------------------------------------------------
// A-19/B-33 (task #55): per-pair war state on UNIFIED civ ids (0 = player,
// r+1 = rival r). The (0, r+1) player pair reads/writes the EXISTING `atWar`
// boolean; a rival↔rival pair reads/writes both rivals' `atWarRivals` arrays
// (symmetric by construction). S1 ships these INERT (nothing reads them yet).
// ---------------------------------------------------------------------------

/** Are unified civs `a` and `b` at war right now? */
export function civsAtWar(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  // A player pair (one side is civ 0) reads the rival's war-with-player bool.
  if (a === 0 || b === 0) {
    const rivalUnified = a === 0 ? b : a;
    return state.rivals.find((r) => r.id === rivalUnified - 1)?.atWar ?? false;
  }
  // A rival↔rival pair: membership in either side's list (symmetric).
  return state.rivals.find((r) => r.id === a - 1)?.atWarRivals?.includes(b - 1) ?? false;
}

/** Set the war state between unified civs `a` and `b` (both sides written). */
export function setRivalWar(state: GameState, a: number, b: number, on: boolean): void {
  if (a === b) return;
  if (a === 0 || b === 0) {
    // The player pair rides the existing single boolean (both engines).
    const rival = state.rivals.find((r) => r.id === (a === 0 ? b : a) - 1);
    if (rival) rival.atWar = on;
    return;
  }
  const ra = state.rivals.find((r) => r.id === a - 1);
  const rb = state.rivals.find((r) => r.id === b - 1);
  if (!ra || !rb) return;
  const add = (r: RivalCiv, otherRivalId: number) => {
    const list = (r.atWarRivals ??= []);
    if (on) {
      if (!list.includes(otherRivalId)) list.push(otherRivalId);
    } else {
      r.atWarRivals = list.filter((x) => x !== otherRivalId);
    }
  };
  add(ra, b - 1);
  add(rb, a - 1);
}

/** Closest city-pair distance between two rivals (Infinity if either is
 *  cityless). The rival↔rival twin of `rivalProximity`. */
function rivalRivalProximity(state: GameState, a: RivalCiv, b: RivalCiv): number {
  if (a.cities.length === 0 || b.cities.length === 0) return Infinity;
  let best = Infinity;
  for (const ca of a.cities) {
    const ta = state.map.tiles[ca.centerIndex];
    for (const cb of b.cities) {
      const tb = state.map.tiles[cb.centerIndex];
      best = Math.min(best, hexDistance(ta.col, ta.row, tb.col, tb.row));
    }
  }
  return best;
}

/**
 * A-19/B-33 (task #55 S2): the pairwise rival↔rival auto-DoW — ZERO-DRAW.
 * Runs at the TOP of rivalPhase (before the per-rival loop) so a declared war
 * is live for both civs' war-acts this turn. Deterministic scan: aggressor id
 * ascending, first eligible target id ascending, at most ONE new war per civ
 * per turn (both participants). Conditions re-derive the player auto-DoW's
 * DETERMINISTIC gates (proximity, strength ratio) and DROP its RNG probability
 * gate; anti-thrash is the aggressor's own war-weariness (RR_DOW_WW_MAX). No
 * nextRandom anywhere — the player pair's RNG draws are untouched.
 */
/** Is THIS rival's current war with `otherRivalId` a FORMAL one (casus belli)? */
export function isFormalWar(rival: RivalCiv, otherRivalId: number): boolean {
  return rival.warKindFormal?.includes(otherRivalId) ?? false;
}

/** Set/clear the FORMAL flag on the (a,b) rival pair symmetrically. */
function setWarKindFormal(state: GameState, a: number, b: number, formal: boolean): void {
  const ra = state.rivals.find((r) => r.id === a - 1);
  const rb = state.rivals.find((r) => r.id === b - 1);
  if (!ra || !rb) return;
  const mark = (r: RivalCiv, otherRivalId: number) => {
    const list = (r.warKindFormal ??= []);
    if (formal) {
      if (!list.includes(otherRivalId)) list.push(otherRivalId);
    } else {
      r.warKindFormal = list.filter((x) => x !== otherRivalId);
    }
  };
  mark(ra, b - 1);
  mark(rb, a - 1);
}

/**
 * B-22 (task #55 S3): the pairwise rival↔rival DENOUNCEMENT pass — ZERO-DRAW.
 * Runs BEFORE the DoW pass. A civ denounces a nearer, weaker-scoring rival it is
 * not yet at war with — the same threshold FAMILY as the DoW (proximity gate +
 * a strength edge), but a WEAKER bar (mere `si > sj`, not the ×1.3 DoW ratio) so
 * the denouncement reliably PRECEDES the war. The stamp is a persistent grudge
 * (set once per directed pair, never reset). A later DoW ≥ RR_FORMAL_MIN_TURNS
 * after the stamp is FORMAL (casus belli); otherwise SURPRISE. Deterministic
 * scan (denouncer id asc, target id asc); no nextRandom.
 */
function rivalRivalDenounce(state: GameState): void {
  for (let a = 0; a < state.rivals.length; a++) {
    const ri = state.rivals[a];
    if (ri.cities.length === 0) continue;
    const si = rivalStrength(state, ri);
    const stamps = (ri.denouncedTurn ??= {});
    for (let b = 0; b < state.rivals.length; b++) {
      if (a === b) continue;
      const rj = state.rivals[b];
      if (rj.cities.length === 0) continue;
      if (stamps[rj.id] !== undefined) continue; // already denounced (grudge)
      if (civsAtWar(state, ri.id + 1, rj.id + 1)) continue;
      if (rivalRivalProximity(state, ri, rj) > RR_DOW_PROXIMITY) continue;
      if (!(si > rivalStrength(state, rj))) continue;
      stamps[rj.id] = state.turn;
      // B-22 (2026-07-27): a denouncement BREAKS an alliance, both sides.
      breakAlliance(ri, rj);
      state.eventLog.push(`${ri.name} denounces ${rj.name}.`);
    }
  }
  // B-22 (2026-07-27): ALLIANCE FORMATION, right after the denounce pass so a
  // fresh grudge cannot be allied over on the same turn. Zero-draw and fully
  // deterministic: a pair allies once it has been at PEACE for
  // RR_ALLY_MIN_PEACE turns with NO denouncement in either direction. That
  // stands in for real Civ 6's Declaration-of-Friendship prerequisite. Written
  // symmetrically, and only ever from the LOWER id so the scan order cannot
  // matter.
  for (let a = 0; a < state.rivals.length; a++) {
    const ri = state.rivals[a];
    if (ri.cities.length === 0) continue;
    for (let b = a + 1; b < state.rivals.length; b++) {
      const rj = state.rivals[b];
      if (rj.cities.length === 0) continue;
      if (civsAtWar(state, ri.id + 1, rj.id + 1)) continue;
      if ((ri.alliedRivals ?? []).includes(rj.id)) continue;
      if (ri.denouncedTurn?.[rj.id] !== undefined || rj.denouncedTurn?.[ri.id] !== undefined) continue;
      // B-22: grievances block alliances outright.
      if ((ri.warmonger ?? 0) > 0 || (rj.warmonger ?? 0) > 0) continue;
      if (state.turn < RR_ALLY_MIN_PEACE) continue;
      (ri.alliedRivals ??= []).push(rj.id);
      (rj.alliedRivals ??= []).push(ri.id);
      state.eventLog.push(`${ri.name} and ${rj.name} form an alliance.`);
    }
  }
}

/** B-22: drop a rival↔rival alliance on BOTH sides (denouncement or war). */
function breakAlliance(ri: RivalCiv, rj: RivalCiv): void {
  if (ri.alliedRivals) ri.alliedRivals = ri.alliedRivals.filter((x) => x !== rj.id);
  if (rj.alliedRivals) rj.alliedRivals = rj.alliedRivals.filter((x) => x !== ri.id);
}

function rivalRivalDeclareWars(state: GameState): void {
  const used = new Set<number>();
  for (let a = 0; a < state.rivals.length; a++) {
    const ri = state.rivals[a];
    if (ri.cities.length === 0 || used.has(ri.id)) continue;
    // anti-thrash: a war-weary civ never opens a new front (documented).
    if ((ri.warWeariness ?? 0) >= RR_DOW_WW_MAX) continue;
    const si = rivalStrength(state, ri);
    for (let b = 0; b < state.rivals.length; b++) {
      if (a === b) continue;
      const rj = state.rivals[b];
      if (rj.cities.length === 0 || used.has(rj.id)) continue;
      if (civsAtWar(state, ri.id + 1, rj.id + 1)) continue;
      if (rivalRivalProximity(state, ri, rj) > RR_DOW_PROXIMITY) continue;
      // B-22 (2026-07-27): a WARMONGER invites unprovoked war — past
      // RR_WARMONGER_GANG the usual strength advantage is not required.
      const gang = (rj.warmonger ?? 0) >= RR_WARMONGER_GANG;
      if (!gang && !(si > rivalStrength(state, rj) * RR_DOW_STRENGTH_RATIO)) continue;
      // B-22 (S3) anti-thrash: never declare on a target already over the peace
      // threshold — the peace pass (EITHER side's ww > RR_PEACE_WW) would sue it
      // out the SAME turn, and the aggressor would re-declare next turn ad
      // infinitum. A rival pinned war-weary by ITS player war (ww driven past
      // RR_PEACE_WW) is thus off-limits until it recovers. This root-causes the
      // S3 magnitude reshuffle's declare/peace thrash (surfaced a dormant S2
      // war-act divergence — the pair matrix was inert in S1). Zero-draw.
      if ((rj.warWeariness ?? 0) > RR_PEACE_WW) continue;
      // B-22 (2026-07-27): ALLIES NEVER DECLARE ON EACH OTHER (real Civ 6).
      if ((ri.alliedRivals ?? []).includes(rj.id)) continue;
      setRivalWar(state, ri.id + 1, rj.id + 1, true);
      // B-22 (2026-07-27): declaring earns GRIEVANCES.
      ri.warmonger = (ri.warmonger ?? 0) + RR_WARMONGER_DOW;
      // B-22 (S3): FORMAL iff the aggressor denounced this target ≥ the min turns
      // earlier; else SURPRISE (the default). Deterministic — no draws.
      const dt = ri.denouncedTurn?.[rj.id];
      const formal = dt !== undefined && state.turn - dt >= RR_FORMAL_MIN_TURNS;
      setWarKindFormal(state, ri.id + 1, rj.id + 1, formal);
      state.eventLog.push(`${ri.name} declares ${formal ? 'a formal' : 'a surprise'} war on ${rj.name}!`);
      used.add(ri.id);
      used.add(rj.id);
      break; // one new war per aggressor per turn
    }
  }
}

/**
 * A-19/B-33 (task #55 S2): the pairwise rival↔rival auto-peace — ZERO-DRAW.
 * Runs at the END of rivalPhase (after every rival acted). A warring pair
 * sues out once EITHER side's war-weariness exceeds RR_PEACE_WW. Deterministic
 * unordered-pair scan (a < b). The (0, r+1) player pair keeps its own RNG
 * peace path (untouched this stage).
 */
function rivalRivalMakePeace(state: GameState): void {
  for (let a = 0; a < state.rivals.length; a++) {
    const ri = state.rivals[a];
    for (let b = a + 1; b < state.rivals.length; b++) {
      const rj = state.rivals[b];
      if (!civsAtWar(state, ri.id + 1, rj.id + 1)) continue;
      if ((ri.warWeariness ?? 0) > RR_PEACE_WW || (rj.warWeariness ?? 0) > RR_PEACE_WW) {
        setRivalWar(state, ri.id + 1, rj.id + 1, false);
        setWarKindFormal(state, ri.id + 1, rj.id + 1, false); // B-22 (S3): war ended
        state.eventLog.push(`${ri.name} and ${rj.name} make peace.`);
      }
    }
  }
}

export function declareWar(state: GameState, rivalId: number): RuleResult {
  const rival = state.rivals.find((r) => r.id === rivalId);
  if (!rival) return no('No such civilization.');
  if (rival.atWar) return no('Already at war.');
  rival.atWar = true;
  rival.warTurns = 0;
  // B-22 (#74): the player earns GRIEVANCES for declaring, exactly as a rival
  // does (RR_WARMONGER_DOW at the rival↔rival DoW site).
  state.warmonger = (state.warmonger ?? 0) + RR_WARMONGER_DOW;
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

/** Per-turn loyalty change for a player city under rival pressure.
 *  B-24 S2: every pop-pressure contribution scales by the SOURCE civ's age
 *  factor (Dark ×0.5 / Normal ×1 / Golden ×1.5) — factors are halves, so the
 *  sums stay exact in both engines' dtypes. The flip-WINNER pick
 *  (`flipCityToRival`) deliberately stays on RAW pressure (both engines). */
export function loyaltyDelta(state: GameState, city: City, amenityTierName: string): number {
  const here = state.map.tiles[city.centerIndex];
  let own = 0;
  let foreign = 0;
  for (const c of state.cities) {
    const t = state.map.tiles[c.centerIndex];
    const d = hexDistance(here.col, here.row, t.col, t.row);
    if (d <= LOYALTY_RANGE) own += c.population * (LOYALTY_RANGE + 1 - d);
  }
  own *= agePressureFactor(state, 0);
  for (const rival of state.rivals) {
    let sub = 0;
    for (const rc of rival.cities) {
      const t = state.map.tiles[rc.centerIndex];
      const d = hexDistance(here.col, here.row, t.col, t.row);
      if (d <= LOYALTY_RANGE) sub += rc.population * (LOYALTY_RANGE + 1 - d);
    }
    foreign += sub * agePressureFactor(state, civOfRival(rival.id));
  }
  const pressure =
    own + foreign === 0 ? 0 : (LOYALTY_PRESSURE_SCALE * (own - foreign)) / (own + foreign);
  return pressure + (LOYALTY_AMENITY[amenityTierName] ?? 0);
}

/**
 * Apply a turn of loyalty to `city` (called from endTurn with the stats it
 * already computed). Returns true when the city has hit 0 and must flip.
 */
export function applyLoyalty(state: GameState, city: City, amenityTierName: string, govBonus = 0): boolean {
  if (!state.rivals.some((r) => r.cities.length > 0)) return false;
  if (city.isCapital) {
    city.loyalty = LOYALTY_MAX;
    return false;
  }
  // B-24 S3: govBonus = GOVERNOR_LOYALTY when this city holds a governor
  // (the stateless per-turn pick endTurn computes before the city loop).
  const next = (city.loyalty ?? LOYALTY_MAX) + loyaltyDelta(state, city, amenityTierName) + govBonus;
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
/**
 * #70/S4 (AUDIT A-9): PALACE RELOCATION. Real Civ 6 does not leave a civ
 * capital-less when its capital falls — the Palace is rebuilt in the surviving
 * city with the HIGHEST POPULATION (ties → acquisition order, which is this
 * array's own order, so a strict `>` keeps the earliest). Call this on the
 * LOSER's city list immediately after a city leaves it, by capture, loyalty
 * defection or raze; it is a no-op while a capital is still held.
 *
 * `state.capitalTiles` is deliberately NOT touched: it is the STATIC domination
 * record (GV-3), and real Civ 6 agrees — the ORIGINAL capital remains the
 * domination target while the relocated Palace carries the capital BONUSES
 * (recapturing the original yields an "Original Capital" plus a "New Capital").
 * Both engines therefore relocate the BUILDING and the isCapital FLAG only.
 */
export function relocatePalace(
  cities: { isCapital: boolean; population: number; buildings: string[] }[],
): void {
  if (cities.length === 0) return; // civ eliminated — nothing to crown
  if (cities.some((c) => c.isCapital)) return; // capital still held
  let best = cities[0];
  for (const c of cities) if (c.population > best.population) best = c;
  best.isCapital = true;
  if (!best.buildings.includes('PALACE')) best.buildings.push('PALACE');
}

export function transferCityToRival(state: GameState, city: City, winner: RivalCiv, why: string): boolean {
  state.cities = state.cities.filter((c) => c.id !== city.id);
  relocatePalace(state.cities); // #70/S4 (A-9): the player's Palace moves on capital loss
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
  // AUDIT B-30: DERIVE the carried districts from the tiles this city owns
  // (complete only), snapshotting before the re-tag loop clears cityId — mirrors
  // the GPU twin's owned-tile, district_complete gather. Incomplete districts
  // stay paved-but-dead; phantom references to other cities' tiles never appear.
  // G-5 (#66): the rival city model holds ONE district per TYPE (the GPU
  // rc_dist_tile registry is type-keyed; real Civ 6 allows one district of
  // each type per city). A player city can carry duplicate-type districts
  // (e.g. two Campuses) that the GPU twin's `rc_dist_tile[type] = tile` loop
  // silently collapses to the LAST tile in ascending-index order. Dedupe by
  // type here — last (highest tile index) wins — so the transferred rival
  // city's districts (adjacency yields AND the trace count) match the GPU.
  const keptByType = new Map<DistrictId, number>();
  for (const t of state.map.tiles) {
    if (t.cityId === city.id && t.district !== null && t.districtComplete) {
      keptByType.set(t.district, t.index); // ascending scan → last (highest) wins, mirroring the GPU registry overwrite
    }
  }
  const keptDistricts: { type: DistrictId; tileIndex: number }[] = [];
  for (const [type, tileIndex] of keptByType) keptDistricts.push({ type, tileIndex });
  const keptWonders = city.wonders.filter((w) => state.map.tiles[w.tileIndex].cityId === city.id);
  for (const t of state.map.tiles) {
    if (t.cityId === city.id) {
      t.cityId = -1;
      t.rivalId = winner.id;
      t.rivalCityId = winner.nextCityId; // A-17: the rc pushed below
    }
  }
  // AUDIT B-30: conquest keeps infrastructure. The city carries its districts
  // (live, re-owned via the tile re-tag above), buildings MINUS PALACE, and
  // wonders into the rival. ANCIENT_WALLS kept with outerHp 0 (heals via B-1).
  const keptBuildings = city.buildings.filter((b) => b !== 'PALACE');
  const defected: RivalCity = {
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
    buildings: keptBuildings,
    districts: keptDistricts.map((d) => ({ ...d })),
    wonders: keptWonders.map((w) => ({ ...w })),
    specialists: {},
    hp: Math.round(RIVAL_CITY_MAX_HP / 2),
    foundedTurn: state.turn,
  };
  if (keptBuildings.includes('ANCIENT_WALLS')) defected.outerHp = 0; // B-30: walls kept, outer pool 0
  winner.cities.push(defected);
  addEraScore(state, civOfRival(winner.id), ERA_SCORE_CONQUER); // B-24: gained a city (flip or conquest; raze returned above)
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
 * borderCandidates. A-17: adjacency is PER-CITY via the rivalCityId tile
 * registry — a rival city can no longer claim across a sibling's frontier,
 * exactly like the player's n.cityId === city.id check. */
function pickRivalBorderTile(state: GameState, rival: RivalCiv, city: RivalCity): number | null {
  const center = state.map.tiles[city.centerIndex];
  const ctx = { map: state.map, mods: getRivalModifiers(state, rival) };  // A-7: belief tile yields rank candidates too
  const cands: { dist: number; res: number; ySum: number; i: number }[] = [];
  for (const t of tilesWithin(state.map, center.col, center.row, 5)) {
    if (tileOwned(t)) continue;
    const adjOwn = tilesWithin(state.map, t.col, t.row, 1).some(
      (n) => n.index !== t.index && tileOwnedByCiv(n, civOfRival(rival.id)) && n.rivalCityId === city.id,
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
      if (
        !rc.districts.some(
          (d) =>
            d.type === gpDist &&
            state.map.tiles[d.tileIndex].districtComplete &&
            !state.map.tiles[d.tileIndex].districtPillaged, // B-32: pillaged district earns no GPP
        )
      )
        continue;
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
      // B-20: WRITER/MUSICIAN slot Great Works into this rival's cities (+2
      // culture/turn each, deferred); overflow charges fall back to the instant
      // culture lump, one per charge. Other classes apply culture instantly.
      if (GW_WORK_CLASSES.has(cls)) {
        const overflow = placeGreatWorks(rival.cities, GW_CLASS_KIND[cls]!); // #73: per-kind
        if (fx.culture) rival.research.civicProgress += fx.culture * overflow;
      } else if (fx.culture) {
        rival.research.civicProgress += fx.culture;
      }
      if (fx.faith) rival.faith = (rival.faith ?? 0) + fx.faith;
      if (fx.gold) rival.treasury = (rival.treasury ?? 0) + fx.gold;
      if (fx.productionToCapital) {
        const cap = rival.cities.find((c) => c.isCapital);
        if (cap && cap.queue.length > 0) cap.queue[0].progress += fx.productionToCapital;
      }
      if (cls === 'PROPHET') rival.prophets = (rival.prophets ?? 0) + 1;
      // B7-G (B-8): a GENERAL/ADMIRAL claim spawns its support unit (civilian,
      // 4 MP) at the rival's capital — same instant-effect-plus-spawn as the
      // player's applyGreatPersonEffect. Zero RNG.
      if (cls === 'GENERAL' || cls === 'ADMIRAL') {
        const cap = rival.cities.find((c) => c.isCapital);
        if (cap) spawnUnit(state, cls, cap.centerIndex, 'rival', rival.id);
      }
      state.greatPeople.earned.push(person.id); // gone from the shared pool
      addEraScore(state, civOfRival(rival.id), ERA_SCORE_GP); // B-24: per earn
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
      addEraScore(state, civOfRival(rival.id), ERA_SCORE_PANTHEON); // B-24
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
      addEraScore(state, civOfRival(rival.id), ERA_SCORE_RELIGION); // B-24
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
  const naval = !!UNITS[unit.type]?.naval;
  // #45/B-6: a NAVAL galley patrols on water; an EMBARKED land unit that
  // survived a war-march into a peace turn comes home coherently — steps on the
  // flat EMBARK_MOVES pool and disembarks onto land (all-MP transition). A
  // grounded land unit stays land-only (the v1 peace rule). The occupancy rule
  // is UNCHANGED from the pre-N2 patrol (ANY unit blocks — the GPU peace-act
  // mirror); only the terrain half becomes mover-aware.
  const passOk = (t: Tile): boolean => {
    if (isImpassable(t)) return false;
    if (encampmentBlocks(state, t, unit)) return false; // B-17 (#71)
    // Water steps are the LIVE-gated surface (mirror of the war-march and the
    // GPU peace-act's _embark_live gate); with the flag off every mover here is
    // land-only, exactly as pre-N2.
    if (isWater(t)) return embarkState.live && (naval || !!unit.embarked) && waterEnterable(state, t, unit);
    return !naval; // land step: naval cannot; grounded/disembarking land units can
  };
  for (;;) {
    const here = state.map.tiles[unit.tileIndex];
    if (hexDistance(here.col, here.row, home.col, home.row) <= 3) return;
    const full = unit.embarked && !naval ? EMBARK_MOVES : UNITS[unit.type]?.moves ?? 2;
    const step = tilesWithin(state.map, here.col, here.row, 1)
      .filter((t) => t.index !== here.index && passOk(t) && unitsAt(state, t.index).length === 0)
      .sort(
        (a, b) =>
          hexDistance(a.col, a.row, home.col, home.row) - hexDistance(b.col, b.row, home.col, home.row),
      )[0];
    if (!step || hexDistance(step.col, step.row, home.col, home.row) >= hexDistance(here.col, here.row, home.col, home.row)) {
      return;
    }
    // Embark/disembark (a LAND unit crossing land↔water) costs ALL remaining MP;
    // water steps enter at 1 and never pay a river charge.
    const transition = !naval && isWater(here) !== isWater(step);
    const cost = transition
      ? unit.movesLeft
      : moveCostInto(here, step) + riverCharge(state, here, step); // B-23 (#71): roads
    if (unit.movesLeft < cost && unit.movesLeft < full) return;
    if (transition) unit.embarked = isWater(step);
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
  // A-24: a district sits on a tile owned by THIS city (the player's
  // canPlaceDistrict uses `t.cityId === city.id`). Restrict the picker AND the
  // ownsTile validity check to this rc's A-17 registry (rivalCityId === rc.id) —
  // a sibling's registered tile is NOT a valid site, keeping .districts and the
  // registry mutually consistent (was civ-level, so overlapping frontiers could
  // pave a sibling's tile — seed 9118).
  const owns = (t: Tile) => tileOwnedByCiv(t, civOfRival(rival.id)) && t.rivalCityId === rc.id;
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
    if (have.has(def.id) || def.worship || SCRIPTED_HELD_BUILDINGS.has(def.id)) continue; // B9-R1: regional held until R2
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
        // A-24: per-city ownership, mirroring canPlaceWonder's `tile.cityId ===
        // city.id` — the wonder tile registers to THIS rc (rivalCityId), not
        // merely the civ. Same coherence fix as tryQueueRivalDistrict.
        if (!tileOwnedByCiv(t, civ) || t.rivalCityId !== rc.id || t.index === rc.centerIndex) return false;
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
      (t.pillaged ||
        t.districtPillaged || // B-32: a pillaged district is a repair job too
        (!t.improvement && validImprovementsIn(t, { unlocks, ownsTile: owns, map: state.map }).length > 0)), // B-27 (#71)
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
  // B-27 (#71): pass the map so the rival builder is offered SEASIDE_RESORT
  // on exactly the same terms the player is (the symmetry contract).
  const vopts = { unlocks, ownsTile: owns, map: state.map };
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
    // AUDIT B-32: a pillaged DISTRICT underfoot repairs the same way (builderRepair
    // twin — no charge, the turn is spent). Barb raids on rival districts get answered.
    if (bt.districtPillaged && owns(bt)) {
      bt.districtPillaged = false;
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
      const isJob = t.pillaged || t.districtPillaged || (!t.improvement && validImprovementsIn(t, vopts).length > 0); // B-32
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
      const cost = moveCostInto(at, dt) + riverCharge(state, at, dt); // B-23 (#71): roads
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
 * B6-S2: rival missionary actions — per missionary (units order): target the
 * NEAREST city of ANY civ (player + every rival, own included) whose
 * followedReligion != this civ's religion g = rival index + 1
 * (dist·(T+1)+centerIndex key, the builder-job convention — centerIndex is
 * unique so the key is total). Within 1 of the target center → SPREAD: add
 * the lump (SPREAD_PRESSURE, SCRIPTURE ×1.5 → 15) to that city's accumulator
 * for g, spend the turn, charge −1, die at 0 charges. Otherwise the
 * builder-class real-MP walk toward the center, stopping within 1. Pressure
 * writes feed NOTHING this turn — the accumulators are only read by
 * spreadReligiousPressure at endTurn (after rivalPhase), where the follow
 * flip lands; yields/combat read followedReligion, which does not move
 * mid-turn. Zero RNG.
 */
/**
 * B-18 (#71): resolve one theological combat for `att` (an APOSTLE of religion
 * `g`). Returns true when a fight happened and the attacker spent its turn.
 *
 * Sourced shape: only Apostles initiate; both combatants take damage from the
 * RELIGIOUS-STRENGTH DIFFERENCE; 0 HP kills; the loser's religion loses
 * pressure in nearby cities and the winner's gains. DETERMINISTIC on purpose —
 * a conditional RNG draw here would have to be mirrored draw-for-draw on both
 * engines, the surface the A-12 rival quests dissolved by design.
 *
 * Target pick is a TOTAL order (dist, then unit id) so both engines agree.
 */
function theologicalCombat(state: GameState, att: Unit, g: number, nRel: number): boolean {
  const at = state.map.tiles[att.tileIndex];
  const atkStr = UNITS[att.type]?.religiousStrength ?? 0;
  // B-18 (#71) PARITY FIX: pick the defender in `state.units` ARRAY ORDER,
  // not by unit ID. Array order is this codebase's shared convention — the GPU
  // mirrors it with slot order, and B-31 capture deliberately moves a captured
  // unit to the END of both the TS array and the GPU pool precisely so the two
  // stay aligned. An ID tie-break was the odd one out: after any capture a
  // unit's id no longer reflects its array position, so TS picked #171 (apostle)
  // where the GPU picked the lower-slotted #176 (missionary) — seed 9040 t207,
  // which then split the damage rolls and the followed-religion checksum.
  let def: Unit | null = null;
  for (const u of state.units) {
    if ((UNITS[u.type]?.religiousStrength ?? 0) <= 0) continue;
    const ug = u.owner === 'player' ? 0 : (u.civId ?? -1) + 1;
    if (ug === g) continue; // same religion — no contest
    const ut2 = state.map.tiles[u.tileIndex];
    if (hexDistance(at.col, at.row, ut2.col, ut2.row) !== 1) continue;
    def = u;
    break;
  }
  if (!def) return false;
  const defStr = UNITS[def.type]?.religiousStrength ?? 0;
  const toDef = Math.max(1, THEO_BASE_DAMAGE + THEO_DAMAGE * (atkStr - defStr));
  const toAtk = Math.max(1, THEO_BASE_DAMAGE + THEO_DAMAGE * (defStr - atkStr));
  def.hp -= toDef;
  att.hp -= toAtk;
  att.movesLeft = 0;
  const loserRel = def.hp <= 0 ? (def.owner === 'player' ? 0 : (def.civId ?? -1) + 1) : att.hp <= 0 ? g : -1;
  const winnerRel = def.hp <= 0 ? g : att.hp <= 0 ? (def.owner === 'player' ? 0 : (def.civId ?? -1) + 1) : -1;
  if (winnerRel >= 0) {
    const deadTile = def.hp <= 0 ? def.tileIndex : att.tileIndex;
    const dt = state.map.tiles[deadTile];
    for (const c of [...state.cities, ...state.rivals.flatMap((rv) => rv.cities)]) {
      const ct = state.map.tiles[c.centerIndex];
      if (hexDistance(dt.col, dt.row, ct.col, ct.row) > THEO_PRESSURE_RANGE) continue;
      let pres = c.religionPressure;
      if (!pres || pres.length !== nRel) {
        pres = new Array(nRel).fill(0);
        c.religionPressure = pres;
      }
      pres[winnerRel] += THEO_PRESSURE_SWING;
      if (loserRel >= 0) pres[loserRel] = Math.max(0, pres[loserRel] - THEO_PRESSURE_SWING);
    }
  }
  // B-20 (#73): RELICS. Real Civ 6 creates a relic when an Apostle killed in
  // theological combat carried the MARTYR promotion; promotions are unmodeled
  // and this routine is deliberately ZERO-DRAW, so every dead APOSTLE martyrs
  // (a recorded overstatement — see the RELIC_* comment in data/greatPeople).
  // A dead MISSIONARY yields nothing. Granted in the SAME order as the two
  // disbands below (defender first, then attacker) so slot placement is
  // order-exact across engines.
  if (def.hp <= 0 && def.type === 'APOSTLE') grantRelic(state, def.owner === 'player' ? 0 : (def.civId ?? -1) + 1);
  if (att.hp <= 0) grantRelic(state, g); // the attacker is always an APOSTLE
  if (def.hp <= 0) disbandUnit(state, def.id);
  if (att.hp <= 0) disbandUnit(state, att.id);
  return true;
}

/** B-20 (#73): hand unified civ `civ` (0 player, r+1 rival r) one relic. */
function grantRelic(state: GameState, civ: number): void {
  if (civ === 0) placeRelic(state.cities);
  else placeRelic(state.rivals[civ - 1]?.cities ?? []);
}

/**
 * B-22 (#75): the DIPLOMATIC FAVOR a civ earns this turn — its GOVERNMENT TIER
 * plus DIPLO_FAVOR_PER_SUZERAIN for every city-state it is Suzerain of. Both
 * seats share this shape; `gov` is the civ's adopted government id (null =
 * none, which pays nothing — Chiefdom is tier 0 anyway) and `suzerains` the
 * count from that seat's suzerain test. Zero-draw, integer-only.
 */
export function diploFavorPerTurn(gov: string | null, suzerains: number): number {
  const tier = gov ? GOVERNMENTS[gov]?.tier ?? 0 : 0;
  return tier + DIPLO_FAVOR_PER_SUZERAIN * suzerains;
}

/** B-22 (#75): city-states the PLAYER is Suzerain of. */
export function playerSuzerainCount(state: GameState): number {
  return state.cityStates.reduce((n, cs) => n + (isSuzerain(cs) ? 1 : 0), 0);
}

/** B-22 (#75): city-states rival `rivalId` is Suzerain of. */
export function rivalSuzerainCount(state: GameState, rivalId: number): number {
  return state.cityStates.reduce((n, cs) => n + (rivalIsSuzerain(cs, rivalId) ? 1 : 0), 0);
}

/**
 * B-22 (#76): the WORLD CONGRESS session. Convenes at every CONGRESS_INTERVAL
 * turn once ANY civ has reached CONGRESS_MIN_ERA (Medieval), and runs one
 * resolution: every civ commits ALL its DIPLOMATIC FAVOR as votes, the largest
 * commitment wins and takes DVP_PER_RESOLUTION Diplomatic Victory Points, and
 * every commitment is spent. Ties go to the greater PERCENTAGE of favor spent
 * (always 100% while there is no chooser — see the constants' comment), then to
 * the lowest unified civ id.
 *
 * A civ with ZERO favor casts no vote and cannot win; if nobody has favor the
 * session still counts but awards nothing. Zero-draw and integer-only: the
 * outcome is a pure function of state, never a roll. Called from endTurn right
 * after eraBoundary, the same position the GPU mirrors.
 */
export function worldCongress(state: GameState): void {
  if (state.turn % CONGRESS_INTERVAL !== 0) return;
  const eras = [
    civEraIndex(state.research.techs, state.research.civics),
    ...state.rivals.map((rv) => civEraIndex(rv.research.techs, rv.research.civics)),
  ];
  if (!eras.some((e) => e >= CONGRESS_MIN_ERA)) return;
  state.congressSessions = (state.congressSessions ?? 0) + 1;
  // every civ commits ALL its favor; the largest commitment wins
  const votes = [state.diploFavor ?? 0, ...state.rivals.map((rv) => rv.diploFavor ?? 0)];
  let win = -1;
  for (let c = 0; c < votes.length; c++) {
    if (votes[c] <= 0) continue; // no favor, no vote
    if (win < 0 || votes[c] > votes[win]) win = c; // ties keep the LOWER id
  }
  // the commitments are spent whether or not they won
  state.diploFavor = 0;
  for (const rv of state.rivals) rv.diploFavor = 0;
  if (win < 0) return; // nobody could vote
  if (win === 0) state.diploPoints = (state.diploPoints ?? 0) + DVP_PER_RESOLUTION;
  else {
    const rv = state.rivals[win - 1];
    if (rv) rv.diploPoints = (rv.diploPoints ?? 0) + DVP_PER_RESOLUTION;
  }
}

function rivalMissionaryActions(state: GameState, rival: RivalCiv): void {
  const g = state.rivals.indexOf(rival) + 1;
  const nRel = 1 + state.rivals.length;
  const nTiles = state.map.tiles.length;
  const eb = rival.enhancerBelief ? ENHANCER_BELIEFS[rival.enhancerBelief]?.effects : undefined;
  const lump = Math.round(SPREAD_PRESSURE * (eb?.spreadPressureMult ?? 1));
  const allCities: City[] = [...state.cities, ...state.rivals.flatMap((rv) => rv.cities)];
  for (const u of [...state.units]) {
    if (u.owner !== 'rival' || u.civId !== rival.id || (u.charges ?? 0) <= 0) continue;
    if (u.type !== 'MISSIONARY' && u.type !== 'APOSTLE') continue; // B-18 (#71): apostles spread too
    // B-18 (#71): THEOLOGICAL COMBAT, before the spread/walk. Only an APOSTLE
    // may INITIATE (real Civ 6 also allows Inquisitors — out of scope), and
    // only against an ADJACENT religious unit of a DIFFERENT religion. Both
    // sides take damage scaled by the religious-strength difference; a unit at
    // 0 HP dies and its religion sheds THEO_PRESSURE_SWING in nearby cities
    // while the winner's gains it. ZERO-DRAW by design (see THEO_DAMAGE).
    if (u.type === 'APOSTLE' && theologicalCombat(state, u, g, nRel)) continue;
    const ut = state.map.tiles[u.tileIndex];
    let target: City | null = null;
    let bestKey = Infinity;
    for (const c of allCities) {
      if (c.followedReligion === g) continue;
      const ct = state.map.tiles[c.centerIndex];
      const key = hexDistance(ut.col, ut.row, ct.col, ct.row) * (nTiles + 1) + c.centerIndex;
      if (key < bestKey) {
        bestKey = key;
        target = c;
      }
    }
    if (!target) continue;
    const tt = state.map.tiles[target.centerIndex];
    if (hexDistance(ut.col, ut.row, tt.col, tt.row) <= 1) {
      let pres = target.religionPressure;
      if (!pres || pres.length !== nRel) {
        pres = new Array(nRel).fill(0);
        target.religionPressure = pres;
      }
      pres[g] += lump;
      u.movesLeft = 0;
      u.charges = (u.charges ?? 1) - 1;
      if (u.charges <= 0) disbandUnit(state, u.id);
      continue;
    }
    // walk toward the (fixed) target center on REAL MP — the rivalBuilderActions
    // step loop verbatim, with the ≤1 stop instead of the on-tile stop.
    const fullM = UNITS[u.type]?.moves ?? 2;
    for (;;) {
      const at = state.map.tiles[u.tileIndex];
      const dHere = hexDistance(at.col, at.row, tt.col, tt.row);
      if (dHere <= 1) break;
      let dest = -1;
      let destD = dHere;
      for (const n of neighbors(state.map, at)) {
        if (!tileFreeForUnit(state, n.index, u)) continue;
        const d = hexDistance(n.col, n.row, tt.col, tt.row);
        if (d < destD) {
          destD = d;
          dest = n.index;
        }
      }
      if (dest < 0) break;
      const dt = state.map.tiles[dest];
      const cost = moveCostInto(at, dt) + riverCharge(state, at, dt); // B-23 (#71): roads
      if (u.movesLeft < cost && u.movesLeft < fullM) break;
      u.tileIndex = dest;
      u.movesLeft = Math.max(0, u.movesLeft - cost);
      clearCampFor(state, u, dest); // any-unit camp clear, the walkPath mirror
      if (inEnemyZoc(state, u.tileIndex, u)) {
        u.movesLeft = 0;
        break;
      }
      if (u.movesLeft <= 0) break;
    }
  }
}

/**
 * B7-G (B-8): rival GREAT GENERAL march. A live GENERAL walks with the war
 * effort toward the civ's CURRENT war-march target — the NEAREST player city
 * center (dist·(T+1)+centerIndex key, the missionary/builder total-order
 * convention) — stopping within GENERAL_AURA_RANGE (2) so its +5 CS aura
 * covers the front. Real-MP walk (the missionary chassis verbatim: passable
 * free neighbor strictly closer, walkPath's exact charge, ZOC halt, camp
 * clear). At peace it holds (guarded below). ADMIRALs always hold at the
 * capital (naval war-march targeting is a residual) and the scripted PLAYER
 * general holds too — both are absent from this rival-only walker. Zero RNG.
 */
function rivalGeneralActions(state: GameState, rival: RivalCiv): void {
  if (!rival.atWar || state.cities.length === 0) return;
  const nTiles = state.map.tiles.length;
  for (const u of [...state.units]) {
    // #71 (B-8 residual: naval war-march targeting). ADMIRALs march the war
    // effort exactly as GENERALs do — real Civ 6 Great Admirals are units you
    // move with the fleet, and an admiral parked in the capital can never put
    // its +5/+1MP naval aura over the front. Same chassis, same target scan,
    // same ≤range stop; only the aura's DOMAIN differs, and that is decided at
    // the roll sites by inGeneralAura, not here.
    if (u.owner !== 'rival' || u.civId !== rival.id) continue;
    // B-8 (#71): the ADMIRAL march is landed INERT (ADMIRAL_MARCH_LIVE) — the
    // substrate-then-flip pattern this round used for B-18/A-5r/A-9/B-26. The
    // walker admits admirals on both engines; only the switch is off. WHY: a
    // marching admiral is a CIVILIAN and can be captured (B-31) where one
    // parked in the capital never was, and the engines diverged on it
    // (seed 9287 t235, rUnits0 1 vs 0). Flip = drop the guard.
    if (u.type !== 'GENERAL' && !(ADMIRAL_MARCH_LIVE && u.type === 'ADMIRAL')) continue;
    const ut = state.map.tiles[u.tileIndex];
    // war-march target: the nearest player city center (total-order key —
    // centerIndex is unique, so the min is deterministic).
    let target: City | null = null;
    let bestKey = Infinity;
    for (const c of state.cities) {
      const ct = state.map.tiles[c.centerIndex];
      const key = hexDistance(ut.col, ut.row, ct.col, ct.row) * (nTiles + 1) + c.centerIndex;
      if (key < bestKey) {
        bestKey = key;
        target = c;
      }
    }
    if (!target) continue;
    const tt = state.map.tiles[target.centerIndex];
    // the rivalMissionaryActions step loop verbatim, with the ≤2 stop.
    const fullM = UNITS[u.type]?.moves ?? 2;
    for (;;) {
      const at = state.map.tiles[u.tileIndex];
      const dHere = hexDistance(at.col, at.row, tt.col, tt.row);
      if (dHere <= GENERAL_AURA_RANGE) break;
      let dest = -1;
      let destD = dHere;
      for (const n of neighbors(state.map, at)) {
        if (!tileFreeForUnit(state, n.index, u)) continue;
        const d = hexDistance(n.col, n.row, tt.col, tt.row);
        if (d < destD) {
          destD = d;
          dest = n.index;
        }
      }
      if (dest < 0) break;
      const dt = state.map.tiles[dest];
      const cost = moveCostInto(at, dt) + riverCharge(state, at, dt); // B-23 (#71): roads
      if (u.movesLeft < cost && u.movesLeft < fullM) break;
      u.tileIndex = dest;
      u.movesLeft = Math.max(0, u.movesLeft - cost);
      clearCampFor(state, u, dest); // any-unit camp clear, the walkPath mirror
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
    (d) =>
      d.type === 'AQUEDUCT' &&
      map.tiles[d.tileIndex].districtComplete &&
      !map.tiles[d.tileIndex].districtPillaged, // B-32: pillaged Aqueduct gives no housing
  );
  if (hasAqueduct) {
    water = fresh ? water + AQUEDUCT_FRESH_BONUS : Math.max(water, AQUEDUCT_NO_FRESH_TOTAL);
  }
  const pillaged = pillagedDistrictTypes(map, rc.districts); // B-32
  let total = water;
  // A-7 / B-18: belief building housing (Religious Community) keys per-city on
  // the city's followed religion; River Goddess (pantheon) stays per-civ. The
  // owner religion id is this rival's index + 1 (used when coupling is inert).
  const ownerRel = state.rivals.indexOf(rival) + 1;
  const m = withFollowerBelief(state, getRivalModifiers(state, rival), followerReligionForCity(rc.followedReligion, ownerRel));
  for (const id of rc.buildings) {
    const bd = BUILDINGS[id];
    if (bd && pillaged.has(bd.district)) continue; // B-32: dark buildings
    total += bd?.housing ?? 0;
    total += m.buildingHousingAdd[id] ?? 0;
  }
  // A-9 (#71): appeal-based NEIGHBORHOOD housing — the computeHousing twin.
  // Rivals get no GENERIC district housing (only the Aqueduct term above), so
  // this is the one district row that contributes here, exactly as on the GPU.
  for (const d of rc.districts) {
    if (d.type !== 'NEIGHBORHOOD') continue;
    const dt = map.tiles[d.tileIndex];
    if (!dt.districtComplete || dt.districtPillaged) continue;
    total += appealTier(tileAppeal(map, dt)).housing;
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
 * with have = local building amenities + regional (B9-R2) + grants. Policy
 * amenity sources stay player machinery (no Palace). */
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
    const pillaged = pillagedDistrictTypes(state.map, rc.districts); // B-32
    let n = 0;
    for (const id of rc.buildings) {
      const bd = BUILDINGS[id];
      if (bd && !bd.regional && bd.amenities && !pillaged.has(bd.district)) n += bd.amenities;
    }
    // B9-R2: regional amenities (Zoo/Stadium) join the base like the player's
    // luxury ranking (city.ts:292 — localBuildingAmenities + regional).
    baseHave.set(rc.id, n + rivalRegionalEffects(state, rival, rc).amenities);
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

/** B9-R2: regionalEffects (yields.ts:215) for a rival city — regional
 * buildings on this rival's OWN cities' complete unpillaged districts reach
 * every same-civ city center within REGIONAL_RANGE; the same building type
 * never stacks. */
function rivalRegionalEffects(state: GameState, rival: RivalCiv, rc: RivalCity): { yields: Yields; amenities: number } {
  const center = state.map.tiles[rc.centerIndex];
  const seen = new Set<string>();
  const out = { yields: { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 } as Yields, amenities: 0 };
  for (const other of rival.cities) {
    for (const inst of other.districts) {
      const tile = state.map.tiles[inst.tileIndex];
      if (!tile.districtComplete || tile.districtPillaged) continue; // B-32: pillaged source is dark
      for (const id of other.buildings) {
        const def = BUILDINGS[id];
        if (!def || !def.regional || def.district !== inst.type) continue;
        if (seen.has(id)) continue;
        if (hexDistance(tile.col, tile.row, center.col, center.row) > REGIONAL_RANGE) continue;
        seen.add(id);
        if (def.yields) {
          for (const [k, v] of Object.entries(def.yields)) out.yields[k as keyof Yields] += v ?? 0;
        }
        if (def.amenities) out.amenities += def.amenities;
      }
    }
  }
  return out;
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
        // AUDIT A-23 (2026-07-27): PER-CITY, not civ-level. The player's
        // workableTiles keys on `t.cityId === city.id`; the rival twin now
        // keys on the A-17 registry the same way, so two adjacent rival
        // cities can no longer BOTH work the same civ tile — a
        // double-count the player is structurally incapable of.
        tileOwnedByCiv(t, civOfRival(rival.id)) &&
        t.rivalCityId === rc.id &&
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
  // AUDIT A-22 (2026-07-27): RIVAL SPECIALISTS. Specialists were player-only —
  // `rivalCityYields` never read `RivalCity.specialists` and no rival
  // assignment path existed, so a rival's district buildings gave it nothing a
  // citizen could work. Rivals now assign the way real Civ 6 auto-assigns:
  // citizens go wherever the yield is best. Modeled as ONE merged ranking —
  // workable TILES and open SPECIALIST SLOTS scored by the same `tileScore`
  // 'balanced' weighting, sorted together, top `population` taken. That is
  // exactly equivalent to "take a specialist when it beats the tile it would
  // displace", and it is trivially mirrorable: the GPU appends the same slot
  // entries to the same key array before its topk. Zero-draw. Ties go to
  // TILES (slots sort after every tile).
  const specSlots: { y: Yields; score: number; di: number }[] = [];
  for (const d of rc.districts) {
    const sy = SPECIALIST_YIELDS[d.type];
    if (!sy) continue;
    const dt = state.map.tiles[d.tileIndex];
    if (!dt.districtComplete || dt.districtPillaged) continue; // B-32
    const n = rc.buildings.filter((b) => BUILDINGS[b]?.district === d.type).length;
    const y = { ...emptyYields(), ...sy } as Yields;
    const sc = tileScore(y, 'balanced');
    // Tie key = the district's index in PLACEABLE_DISTRICTS, the SAME canonical
    // order the exporter uses — otherwise equal-scoring slots (CAMPUS science 2
    // vs HOLY_SITE faith 2 both score 2 under focus_base) would break ties by
    // this city's build order in TS and by catalog order on the GPU.
    const di = PLACEABLE_DISTRICTS.indexOf(d.type);
    for (let k = 0; k < n; k++) specSlots.push({ y, score: sc, di });
  }
  specSlots.sort((a, b) => b.score - a.score || a.di - b.di);
  const merged: { y: Yields; score: number; tie: number; index: number }[] = ranked.map((r) => ({
    y: r.y,
    score: r.score,
    tie: r.index,
    index: r.index,
  }));
  const tieBase = state.map.tiles.length;
  // A SPECIALIST has no tile, so index -1 — the Petra scan below skips it.
  specSlots.forEach((sl, k) => merged.push({ y: sl.y, score: sl.score, tie: tieBase + k, index: -1 }));
  merged.sort((a, b) => b.score - a.score || a.tie - b.tie);
  const worked = merged.slice(0, rc.population);
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
      if (w.index < 0) continue; // A-22: specialists work no tile
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
  const pillaged = pillagedDistrictTypes(state.map, rc.districts); // B-32
  for (const d of rc.districts) {
    if (d.type === 'CITY_CENTER') continue;
    const dt = state.map.tiles[d.tileIndex];
    if (!dt.districtComplete || dt.districtPillaged) continue; // B-32: pillaged = dark
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
    if (bd?.regional) continue; // B9-R2: handled by the regional scan (affects own city too)
    if (bd && pillaged.has(bd.district)) continue; // B-32: buildings in a pillaged district are dark
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
  // B9-R2: regional-building yields — the city.ts:445-446 position (after the
  // local buildings, before the wonder flat yields), pre-tier.
  {
    const regional = rivalRegionalEffects(state, rival, rc);
    for (const [k, v] of Object.entries(regional.yields)) total[k as keyof Yields] += v ?? 0;
  }
  // B-20: slotted Great Works — culture/turn per work BY KIND (#70/S1), the
  // buildings-tier position, pre-tier like the player's (city.ts).
  total.culture += greatWorkCulture(rc);
  total.faith += relicFaith(rc); // B-20 (#73): relics pay faith, the city.ts twin position
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
  // A-12: this civ's CS envoy bonuses — capital yield at 1+ envoys,
  // per-completed-district adds at 3/6 (count-based like the player's
  // csEnvoyBonuses; suzerainty not required). Pre-tier, the player's
  // modifiers position.
  {
    const csb = csRivalEnvoyBonuses(state, rival.id);
    if (rc.isCapital) {
      for (const [k, v] of Object.entries(csb.capital)) total[k as keyof Yields] += v ?? 0;
      // B-21: the suzerain's per-CS unique perk — a flat capital yield to
      // whichever seat is suzerain (this rival here).
      const suz = csRivalSuzerainCapitalBonus(state, rival.id);
      for (const [k, v] of Object.entries(suz)) total[k as keyof Yields] += v ?? 0;
    }
    // B-21: the 3/6 tiers land on BUILDINGS now — mirror cityBuildingYields'
    // regional-skip + pillaged-dark (the rc.buildings loop above; `pillaged`
    // is the same B-32 set computed there).
    for (const id of rc.buildings) {
      const add = csb.buildingAdd[id];
      if (!add) continue;
      const bd = BUILDINGS[id];
      if (bd?.regional) continue; // B9-R2: regional buildings skip local adds
      if (bd && pillaged.has(bd.district)) continue; // B-32: pillaged district = dark
      for (const [k, v] of Object.entries(add)) total[k as keyof Yields] += v ?? 0;
    }
  }
  // A-11: outgoing unraided trade routes pay the origin — the trade position
  // in computeCityStats (added BEFORE the tier scaling, city.ts:486; the
  // production half scales with the tier, the food half does not — exactly
  // like the player's).
  for (const route of rival.tradeRoutes ?? []) {
    if (route.from !== rc.id) continue;
    if (route.toCs !== undefined) {
      // A-12b: a CS route pays gold + the CS specialty (the player's
      // csRouteYields), the same pre-tier trade position.
      const cs = state.cityStates.find((c) => c.id === route.toCs);
      if (!cs) continue;
      if (rivalRouteRaidedAt(state, rival, [rc.centerIndex, cs.centerIndex])) continue;
      const cy = csRouteYields(cs);
      total.food += cy.food;
      total.production += cy.production;
      total.gold += cy.gold;
      total.science += cy.science;
      total.culture += cy.culture;
      total.faith += cy.faith;
      continue;
    }
    if (route.toPlayer !== undefined) {
      // B-23 international: a rival route to a player city — gold only, keyed
      // on the destination's completed specialty districts. Suspended while
      // this rival is at war with the player (destination-civ interdiction)
      // or while barbarians prowl either endpoint (rivalRouteRaidedAt).
      if (rival.atWar) continue;
      const pdest = state.cities.find((c) => c.id === route.toPlayer);
      if (!pdest) continue;
      if (rivalRouteRaidedAt(state, rival, [rc.centerIndex, pdest.centerIndex])) continue;
      const iy = routeYieldsInternational(state, pdest);
      total.gold += iy.gold;
      continue;
    }
    const dest = rival.cities.find((c) => c.id === route.to);
    if (!dest) continue;
    if (rivalRouteRaidedAt(state, rival, [rc.centerIndex, dest.centerIndex])) continue;
    const ry = routeYields(state, dest);
    total.food += ry.food;
    total.production += ry.production;
    // B6-S1 (Messenger of the Gods): extra yields when the DESTINATION city
    // follows this civ's religion — the route-income position, pre-tier.
    if (rival.enhancerBelief && dest.followedReligion === ownerRel) {
      const tr = ENHANCER_BELIEFS[rival.enhancerBelief]?.effects.tradeReligionYields;
      if (tr) {
        for (const [k, v] of Object.entries(tr)) total[k as keyof Yields] += v ?? 0;
      }
    }
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
export function transferRivalCityToRival(state: GameState, from: RivalCiv, to: RivalCiv, rc: RivalCity): void {
  // B-22 (2026-07-27): taking a rival's city earns GRIEVANCES.
  to.warmonger = (to.warmonger ?? 0) + RR_WARMONGER_CAPTURE;
  from.cities = from.cities.filter((c) => c.id !== rc.id);
  relocatePalace(from.cities); // #70/S4 (A-9)
  // A-11: routes die with their endpoint (the receiver starts route-less).
  from.tradeRoutes = from.tradeRoutes?.filter((x) => x.from !== rc.id && x.to !== rc.id);
  // A-17: exactly the flipping city's tiles re-tag (registry scan) — the old
  // work-radius sweep both leaked its outer ring and stole sibling frontage.
  for (const t of state.map.tiles) {
    if (tileOwnedByCiv(t, civOfRival(from.id)) && t.rivalCityId === rc.id) {
      t.rivalId = to.id;
      t.rivalCityId = to.nextCityId; // the rc pushed below
    }
  }
  // AUDIT B-30: conquest keeps infrastructure — the flipping city carries its
  // districts (live, re-tagged above), buildings MINUS PALACE, and wonders to
  // the new rival. ANCIENT_WALLS kept with outerHp 0 (heals via B-1).
  const keptBuildings = rc.buildings.filter((b) => b !== 'PALACE');
  const flipped: RivalCity = {
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
    buildings: keptBuildings,
    districts: rc.districts.map((d) => ({ ...d })),
    wonders: rc.wonders.map((w) => ({ ...w })),
    specialists: {},
    hp: Math.round(RIVAL_CITY_MAX_HP / 2),
    foundedTurn: state.turn,
  };
  if (keptBuildings.includes('ANCIENT_WALLS')) flipped.outerHp = 0; // B-30: walls kept, outer pool 0
  to.cities.push(flipped);
  addEraScore(state, civOfRival(to.id), ERA_SCORE_CONQUER); // B-24: gained a city (rc→rc flip or #55 war capture)
  state.eventLog.push(`${rc.name} defected from ${from.name} to ${to.name}!`);
}

/**
 * A-24 machine-check (env-gated by CIV6_RC_REGISTRY_CHECK; the TS twin of the
 * GPU engine's _check_rc_registry_invariant). Every district tile and wonder
 * tile an rc lists must register BACK to that rc — its `rivalCityId` equals
 * `rc.id` (a district sits on a tile owned by THAT city, the placement rule
 * tryQueueRivalDistrict/tryQueueRivalWonder now enforce) — and that tile must
 * be owned by this rival's civ. A tile registered to a SIBLING rc (the seed
 * 9118 latent) throws. NO always-on cost: only called when the env flag is set.
 */
export function assertRivalRegistryCoherent(state: GameState): void {
  for (const rival of state.rivals) {
    const civ = civOfRival(rival.id);
    for (const rc of rival.cities) {
      const check = (kind: string, tileIndex: number, type: string) => {
        const t = state.map.tiles[tileIndex];
        if (t.rivalCityId !== rc.id || !tileOwnedByCiv(t, civ)) {
          throw new Error(
            `A-24 registry incoherence: rival=${rival.id} rc.id=${rc.id} ${kind}=${type} ` +
              `tile=${tileIndex} rivalCityId=${t.rivalCityId} rivalId=${t.rivalId} turn=${state.turn}`,
          );
        }
      };
      for (const d of rc.districts) check('district', d.tileIndex, d.type);
      for (const w of rc.wonders ?? []) check('wonder', w.tileIndex, w.id);
    }
  }
}

// ---------------------------------------------------------------------------
// AUDIT A-12 (B8-L): rival city-state quests — deterministic, zero-draw
// ---------------------------------------------------------------------------

/** Has this rival satisfied its `cs` quest? The rival-seat twin of
 *  questSatisfied (cityStates.ts) — reads THIS rival's cities/routes. */
function rivalQuestSatisfied(
  state: GameState,
  rival: RivalCiv,
  cs: CityState,
  quest: CityStateQuest,
): boolean {
  switch (quest.kind) {
    case 'clearCamp':
      return quest.campIndex !== undefined && !state.barbCamps.includes(quest.campIndex);
    case 'sendTradeRoute':
      // READ-ONLY on the rival's own route list (slice T owns trade.ts).
      return (rival.tradeRoutes ?? []).some((r) => r.toCs === cs.id);
    case 'buildDistrict':
      return rival.cities.some((rc) =>
        rc.districts.some(
          (d) => d.type === quest.district && state.map.tiles[d.tileIndex].districtComplete,
        ),
      );
  }
}

/** Pick this rival's next `cs` quest with NO RNG: the FIRST SATISFIABLE
 *  option in the fixed order clearCamp → buildDistrict → sendTradeRoute
 *  (the B8 zero-draw design). Returns null when none apply (retry next
 *  turn, the questIssuedTurn clock unchanged — the player-path convention). */
function issueRivalQuest(state: GameState, rival: RivalCiv, cs: CityState): CityStateQuest | null {
  const center = state.map.tiles[cs.centerIndex];
  // clearCamp — the NEAREST barb camp within range 6, ties to the LOWEST tile
  // index (the deterministic key hexDist·(nTiles+1)+tile, the A-14 convention).
  let campIndex: number | undefined;
  let campKey = Infinity;
  const span = state.map.tiles.length + 1;
  for (const i of state.barbCamps) {
    const t = state.map.tiles[i];
    const d = hexDistance(t.col, t.row, center.col, center.row);
    if (d > 6) continue;
    const key = d * span + i;
    if (key < campKey) {
      campKey = key;
      campIndex = i;
    }
  }
  if (campIndex !== undefined) return { kind: 'clearCamp', campIndex };
  // buildDistrict — the CS type's district, unless this rival already holds
  // one completed (the player's `!already` gate, rival-seat).
  const district = CS_TYPE_DISTRICT[cs.type];
  const alreadyBuilt = rival.cities.some((rc) =>
    rc.districts.some((d) => d.type === district && state.map.tiles[d.tileIndex].districtComplete),
  );
  if (!alreadyBuilt) return { kind: 'buildDistrict', district };
  // sendTradeRoute — unless this rival already routes to this CS.
  if (!(rival.tradeRoutes ?? []).some((r) => r.toCs === cs.id)) return { kind: 'sendTradeRoute' };
  return null;
}

/**
 * AUDIT A-5r (#71): the `tilePurchaseCost` twin for a rival. Same curve — ring
 * base (50 + 25 per ring past 2, GAME_SPEED-scaled) x (1 + 4 x the civ's best
 * research fraction) + a flat step per tile this civ has already bought — but
 * keyed on THIS rival's techs/civics and its own borderCostMult-carrying
 * modifiers, exactly as the player's reads state.research and getModifiers.
 */
function rivalTilePurchaseCost(state: GameState, rival: RivalCiv, rc: RivalCity, tileIndex: number): number {
  const center = state.map.tiles[rc.centerIndex];
  const t = state.map.tiles[tileIndex];
  const ring = Math.max(2, hexDistance(center.col, center.row, t.col, t.row));
  const tPct = rival.research.techs.length / Object.keys(TECHS).length;
  const cPct = rival.research.civics.length / Object.keys(CIVICS).length;
  const base = Math.round((50 + 25 * (ring - 2)) * GAME_SPEED);
  const step = Math.round(5 * GAME_SPEED);
  // A-5r (#71): tilePurchaseMult stays 1 on the RIVAL seat. It is a
  // government/policy effect the GPU does not model for rivals (the A-7r
  // note), so reading it here would desync the two prices the moment a rival
  // adopted a government carrying it. Flat on both engines until the GPU
  // grows the channel.
  return Math.round(base * (1 + 4 * Math.max(tPct, cPct)) + step * (rival.tilesPurchased ?? 0));
}

export function rivalPhase(state: GameState): void {
  if (state.rivals.length === 0) return;

  // Rival units get their movement in this phase (like barbarians).
  // #45/B-6: an EMBARKED land unit moves on the flat EMBARK_MOVES pool (not its
  // land moves) — mirrors refreshUnits and the GPU war-march's full_mp. Naval
  // units keep their own moves.
  // #70/S3 (B-8): this reset — NOT refreshUnits — is where a rival unit's
  // movement budget for the turn is actually established, so it is where the
  // general/admiral aura's +1 MP must be applied, and `movesFull` must be
  // rewritten to match. Two bugs live here if it is not:
  //   (1) the rival half of the aura would be silently wiped (the GPU rival
  //       walkers grant it, so the engines would diverge by 1 MP);
  //   (2) leaving `movesFull` at refreshUnits' `full + aura` while movesLeft
  //       resets to plain `full` makes NEXT turn's "spent no MP" gate fail for
  //       a rival that never moved — no heal, and fortify wrongly reset.
  // Rival generals war-walk LATER in this phase, so freezing the bonus here
  // (before any of them moves) is also what keeps the GPU snapshot turn-exact.
  for (const u of state.units) {
    if (u.owner !== 'rival') continue;
    const fullR = u.embarked && !UNITS[u.type]?.naval ? EMBARK_MOVES : UNITS[u.type]?.moves ?? 2;
    u.movesLeft = fullR + generalAuraMP(state, u);
    u.movesFull = u.movesLeft;
  }

  // A-19/B-33 (S2): pairwise rival↔rival auto-DoW — BEFORE the per-rival loop
  // so a declared war is live for both civs' war-acts this turn (ZERO-DRAW).
  // B-22 (S3): denouncements first — a stamp ≥ RR_FORMAL_MIN_TURNS old makes the
  // ensuing DoW FORMAL (halved war-weariness accrual).
  rivalRivalDenounce(state);
  rivalRivalDeclareWars(state);

  for (const rival of state.rivals) {
    if (rival.cities.length === 0) continue; // eliminated

    // B-15: war weariness — symmetric with the player's endTurn-top update,
    // read at this rival's block top before rivalAmenityTiers uses it.
    // A-19/B-33 (S2): a rival at war with ANYONE (the player OR another rival)
    // accrues weariness; it decays only at FULL peace. The pairwise war state
    // is fixed for this turn by the phase-top DoW pass, so anyWar is stable
    // through this block (peace resolves after the loop).
    const anyWarTop = rival.atWar || (rival.atWarRivals?.length ?? 0) > 0;
    // B-22 (S3): casus-belli accrual multiplier — rival↔rival ONLY. A rival in a
    // SURPRISE rival↔rival war (not marked FORMAL) accrues ×WW_SURPRISE_MULT;
    // otherwise (a war ONLY with the player, or an all-FORMAL warmonger) it
    // accrues ×WW_FORMAL_MULT (the S2 baseline). The player-war axis is thus
    // unchanged — the casus-belli differential is a rival diplomacy feature.
    const surpriseActive = (rival.atWarRivals ?? []).some((id) => !isFormalWar(rival, id));
    const wwMult = surpriseActive ? WW_SURPRISE_MULT : WW_FORMAL_MULT;
    rival.warWeariness = anyWarTop
      ? Math.min(WAR_WEARINESS_CAP, (rival.warWeariness ?? 0) + WAR_WEARINESS_PER_TURN * wwMult)
      : Math.max(0, (rival.warWeariness ?? 0) - WAR_WEARINESS_DECAY);

    // AUDIT A-3: eurekas/inspirations fire from the RIVAL's seat too — the
    // mirror of the player's endTurn-top detectBoosts (same conditions,
    // this civ's cities/research/territory; the discounts apply in the
    // research loops below).
    detectRivalBoosts(state, rival);

    // AUDIT A-12: city-state diplomacy from the rival's seat — meet by
    // PROXIMITY (a city or unit within CS_MEET_RANGE; rivals have no fog),
    // then the player's influence→envoy accrual (cityStatePhase mirror:
    // flat rate + the adopted government's tier), then the scripted
    // greedy assignment (neediest met CS by OWN envoys, ties lowest id).
    // T1 PERF: this rival's units are invariant from here through the
    // composition count below — no unit spawns/disbands occur in the CS-meet
    // block or the pre-turn count loop (the buy/war/peace loops that DO mutate
    // the list come later), so one filtered list is shared across the three
    // uses (CS-meet proximity, unitCount, melee/ranged tally).
    const rivalUnitList = rivalUnits(state, rival.id);
    {
      for (const cs of state.cityStates) {
        const met = (cs.rivalMet ??= []);
        if (met[rival.id]) continue;
        const ct = state.map.tiles[cs.centerIndex];
        const near =
          rival.cities.some((rc) => {
            const t = state.map.tiles[rc.centerIndex];
            return hexDistance(t.col, t.row, ct.col, ct.row) <= CS_MEET_RANGE;
          }) ||
          rivalUnitList.some((u) => {
            const t = state.map.tiles[u.tileIndex];
            return hexDistance(t.col, t.row, ct.col, ct.row) <= CS_MEET_RANGE;
          });
        if (near) {
          met[rival.id] = true;
          state.eventLog.push(`${rival.name} met the city-state of ${cs.name}.`);
        }
      }
      if (state.cityStates.some((cs) => cs.rivalMet?.[rival.id])) {
        const gov = GOVERNMENTS_ADOPTION_LIVE ? computeAdoption(rival.research).government : null;
        const tier = gov ? GOV_INFLUENCE_TIER[gov] ?? 0 : 0;
        rival.influencePoints = (rival.influencePoints ?? 0) + INFLUENCE_PER_TURN + tier;
        while (rival.influencePoints >= ENVOY_COST) {
          rival.influencePoints -= ENVOY_COST;
          rival.envoysAvailable = (rival.envoysAvailable ?? 0) + 1;
        }
        while ((rival.envoysAvailable ?? 0) > 0) {
          let pick: (typeof state.cityStates)[number] | null = null;
          for (const cs of state.cityStates) {
            if (!cs.rivalMet?.[rival.id]) continue;
            const mine = cs.rivalEnvoys?.[rival.id] ?? 0;
            if (!pick || mine < (pick.rivalEnvoys?.[rival.id] ?? 0)) pick = cs;
          }
          if (!pick) break;
          const env = (pick.rivalEnvoys ??= []);
          env[rival.id] = (env[rival.id] ?? 0) + 1;
          rival.envoysAvailable = (rival.envoysAvailable ?? 0) - 1;
        }
      }

      // AUDIT A-12 (B8-L): RIVAL city-state quests — the ZERO-DRAW twin of
      // cityStatePhase's quest loop, at the A-12a accrual position (right
      // after the greedy envoy assignment). Each MET CS keeps ONE quest per
      // rival (cs.rivalQuest[rival.id]); a satisfied one resolves here
      // (+QUEST_ENVOYS to THIS rival's envoys — the accrual channel), else a
      // new one issues on cooldown expiry. The kind is DETERMINISTIC: the
      // FIRST SATISFIABLE option in the fixed order [clearCamp, buildDistrict,
      // sendTradeRoute] against this rival's state — NO nextRandom, so the
      // player quest path's draw count is untouched (the deferral's stated
      // risk removed by construction). questIssuedTurn clock defaults to 0
      // (the GPU cs_r_quest_issued zeros init) → first issue at turn≥cooldown.
      for (const cs of state.cityStates) {
        if (!cs.rivalMet?.[rival.id]) continue;
        const rq = (cs.rivalQuest ??= []);
        const rqi = (cs.rivalQuestIssuedTurn ??= []);
        const cur = rq[rival.id] ?? null;
        if (cur) {
          if (rivalQuestSatisfied(state, rival, cs, cur)) {
            rq[rival.id] = null;
            rqi[rival.id] = state.turn;
            const env = (cs.rivalEnvoys ??= []);
            env[rival.id] = (env[rival.id] ?? 0) + QUEST_ENVOYS;
            state.eventLog.push(`${cs.name} quest complete for ${rival.name}: +${QUEST_ENVOYS} envoy.`);
          }
        } else if (state.turn - (rqi[rival.id] ?? 0) >= QUEST_COOLDOWN) {
          const q = issueRivalQuest(state, rival, cs);
          if (q) {
            rq[rival.id] = q;
            rqi[rival.id] = state.turn;
          }
        }
      }
    }

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
    let unitCount = rivalUnitList.length;
    let settlerQueued = false;
    // AUDIT A-6: army composition (military only — builders don't count),
    // live + queued, updated through this pick loop so same-turn picks see
    // each other — the ranged share targets 1 ranged per 2 melee.
    let meleeCount = 0;
    let rangedCount = 0;
    // #45/B-6 galley policy: does this civ already own or have queued a NAVAL
    // unit? The scripted lever builds exactly ONE galley, ever (zero-naval gate).
    let hasNaval = rivalUnitList.some((u) => !!UNITS[u.type]?.naval);
    for (const u of rivalUnitList) {
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
        if (q.unit && UNITS[q.unit]?.naval) hasNaval = true;
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
        // AUDIT B-10: best-of-roster type pick — data-driven over UNITS, no
        // hardcoded id ladder. Melee lane: the highest-combat non-ranged,
        // non-naval military unit the rival has the tech + (B-9) strategic
        // access for; ranged lane: the highest ranged-strength ranged unit
        // likewise. Ties resolve to the LOWEST UNITS-table index via the
        // strict `>` scan (the A-5r convention; HORSEMAN precedes SWORDSMAN so
        // the 36-combat tie keeps HORSEMAN). BUILDER (combat 0) and SCOUT
        // (combat 10, dominated by the ungated WARRIOR) never win; naval hulls
        // are excluded. WARRIOR/SLINGER are ungated so each lane always fills.
        const rivalCiv = civOfRival(rival.id);
        let meleeType = 'WARRIOR';
        let meleeStr = -Infinity;
        let rangedType = 'SLINGER';
        let rangedStr = -Infinity;
        for (const def of Object.values(UNITS)) {
          if (def.naval) continue;
          if (def.requiresTech && !rival.research.techs.includes(def.requiresTech)) continue;
          if (def.requiresResource && !civHasStrategic(state, rivalCiv, def.requiresResource)) continue;
          if (def.ranged) {
            if (def.ranged.strength > rangedStr) {
              rangedStr = def.ranged.strength;
              rangedType = def.id;
            }
          } else if (def.combat > 0) {
            if (def.combat > meleeStr) {
              meleeStr = def.combat;
              meleeType = def.id;
            }
          }
        }
        const wantRanged = rangedCount * 2 < meleeCount;
        const type = wantRanged ? rangedType : meleeType;
        rc.queue.push({ kind: 'unit', unit: type, progress: 0 });
        unitCount += 1;
        if (wantRanged) rangedCount += 1;
        else meleeCount += 1;
      } else if (
        // #45/B-6 SCRIPTED GALLEY POLICY (the minimal in-gate naval lever): a
        // civ with SAILING and a naval-capable city (coastal center or a
        // completed Harbor) builds exactly ONE GALLEY when it owns zero naval
        // units — priority JUST BELOW the military floor (above projects, so it
        // only diverts otherwise-idle production). The galley then joins the
        // patrol walker at peace (water steps) and hostileUnitAct at war.
        !hasNaval &&
        rival.research.techs.includes('SAILING') &&
        cityNavalCapable(state, rc)
      ) {
        rc.queue.push({ kind: 'unit', unit: 'GALLEY', progress: 0 });
        unitCount += 1;
        hasNaval = true;
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
          if (have.has(def.id) || def.worship || SCRIPTED_HELD_BUILDINGS.has(def.id)) continue; // B9-R1: regional held until R2
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
          // AUDIT B-9: strategic-resource access gates the gold buy too (HORSEMAN
          // needs HORSES) — data-driven off requiresResource, mirroring the ladder.
          if (def.requiresResource && !civHasStrategic(state, civOfRival(rival.id), def.requiresResource)) continue;
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
            // B-17 (ROUND B7): a purchased military unit inherits the spawn
            // city's Encampment training XP (best military-building tier).
            if ((UNITS[pickId]?.combat ?? 0) > 0) {
              const xp = encampmentTrainXp(spawnCity.buildings);
              if (xp > 0) u.xp = xp;
            }
          }
        }
      }
      // AUDIT A-5r (#71): TILE PURCHASE — the last rung of the gold ladder,
      // reached only when nothing else was bought, so it can never starve the
      // building/settler/unit priorities above. The player's `buyTile` twin:
      // the SAME deterministic border candidate the culture growth uses
      // (pickRivalBorderTile), the SAME cost curve as tilePurchaseCost keyed on
      // THIS civ's research, and the same decoupling from the culture counter
      // (P4/D-17 — a purchase claims the tile but does NOT advance cultureBox).
      // ONE tile per civ per turn, first rc in slot order with a candidate.
      if (RIVAL_TILE_BUY_LIVE && !bought) {
        for (const rc of rival.cities) {
          const next = pickRivalBorderTile(state, rival, rc);
          if (next === null) continue;
          const cost = rivalTilePurchaseCost(state, rival, rc, next);
          if (!goldAffordable(rival.treasury ?? 0, cost)) break;
          rival.treasury = (rival.treasury ?? 0) - cost;
          state.map.tiles[next].rivalId = rival.id;
          state.map.tiles[next].rivalCityId = rc.id; // A-17 registry
          rc.tilesAcquired += 1;
          rival.tilesPurchased = (rival.tilesPurchased ?? 0) + 1;
          bought = true;
          break;
        }
      }
      // B9-R3 (A-9): WORSHIP — a civ that FOUNDED a religion faith-buys its
      // worship building (worship is faith-purchase-only, like the player's
      // purchaseBuilding). Deterministic no-draw pick keyed off the religion
      // index (owner religion = rival index + 1, the B-18 convention); flat
      // buildingFaithCost (190·GAME_SPEED); FIRST city in array order with a
      // COMPLETE unpillaged Holy Site and the Temple. Faith is a separate
      // currency, so this does not consume the one-gold-purchase slot.
      if (rival.religionFounded) {
        const wid = WORSHIP_BUILDINGS[(state.rivals.indexOf(rival) + 1) % WORSHIP_BUILDINGS.length];
        const wCost = buildingFaithCost(wid);
        if (goldAffordable(rival.faith ?? 0, wCost)) {
          for (const rc of rival.cities) {
            if (rc.buildings.includes(wid) || !rc.buildings.includes('TEMPLE')) continue;
            const hs = rc.districts.find((d) => d.type === 'HOLY_SITE');
            const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
            if (!ht?.districtComplete || ht.districtPillaged) continue;
            rival.faith = (rival.faith ?? 0) - wCost;
            rc.buildings.push(wid);
            break;
          }
        }
      }
      // B6-S2: MISSIONARY — after the worship buy (worship saturates first;
      // faith is a separate currency, independent of the gold slot). A civ
      // with a founded religion faith-buys ONE missionary per turn at the
      // enhancer-adjusted price (HOLY_ORDER ×0.7 → 42), cap MISSIONARY_CAP
      // live per civ; gate = the FIRST city in array order with a SHRINE and
      // a COMPLETE unpillaged Holy Site (real Civ 6's Shrine requirement).
      // Spawns at that city center (no free spot = refund, the spawn-refund
      // convention). SCRIPTURE adds +1 charge at purchase.
      if (rival.religionFounded) {
        let boughtRelig = false; // B-18 (#71)
        const liveM = state.units.filter(
          (u) => u.owner === 'rival' && u.civId === rival.id && u.type === 'MISSIONARY',
        ).length;
        const eb = rival.enhancerBelief ? ENHANCER_BELIEFS[rival.enhancerBelief]?.effects : undefined;
        const mCost = Math.round(UNITS.MISSIONARY.cost * (eb?.missionaryCostMult ?? 1));
        if (liveM < MISSIONARY_CAP && goldAffordable(rival.faith ?? 0, mCost)) {
          for (const rc of rival.cities) {
            if (!rc.buildings.includes('SHRINE')) continue;
            const hs = rc.districts.find((d) => d.type === 'HOLY_SITE');
            const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
            if (!ht?.districtComplete || ht.districtPillaged) continue;
            const u = spawnUnit(state, 'MISSIONARY', rc.centerIndex, 'rival', rival.id);
            if (u) {
              rival.faith = (rival.faith ?? 0) - mCost;
              boughtRelig = true; // B-18 (#71): one religious unit per civ per turn
              if (eb?.missionaryChargeBonus) u.charges = (u.charges ?? 0) + eb.missionaryChargeBonus;
            }
            break;
          }
        }
        // B-18 (#71): the APOSTLE buy — the missionary block's twin, run AFTER
        // it so the cheaper unit still saturates first (the worship-then-
        // missionary precedence this whole gold/faith ladder follows). Same
        // SHRINE + complete unpillaged HOLY_SITE gate, same spawn-refund
        // convention, same cap (an apostle counts against APOSTLE_CAP only).
        // B-18 (#71): ONE religious unit per civ per turn — an apostle is only
        // bought when no missionary was. Keeps the two buys from interacting
        // through the shared faith pool, which is a timing surface both
        // engines would have to reproduce exactly.
        const liveA = state.units.filter(
          (u) => u.owner === 'rival' && u.civId === rival.id && u.type === 'APOSTLE',
        ).length;
        // B-18 (#71): FLAT cost — the enhancer's missionaryCostMult is a
        // MISSIONARY discount and does not extend to apostles here (both
        // engines flat, so the belief can never desync the two prices).
        const aCost = Math.round(UNITS.APOSTLE.cost);
        if (APOSTLE_BUY_LIVE && !boughtRelig && liveA < APOSTLE_CAP && goldAffordable(rival.faith ?? 0, aCost)) {
          for (const rc of rival.cities) {
            if (!rc.buildings.includes('SHRINE')) continue;
            const hs = rc.districts.find((d) => d.type === 'HOLY_SITE');
            const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
            if (!ht?.districtComplete || ht.districtPillaged) continue;
            const u = spawnUnit(state, 'APOSTLE', rc.centerIndex, 'rival', rival.id);
            if (u) rival.faith = (rival.faith ?? 0) - aCost;
            break;
          }
        }
      }

      // AUDIT A-12 (B8-L): RIVAL LEVY — the levyUnits(state, csId) twin for
      // rivals, inside the gold block AFTER every purchase (the A-5 position;
      // the GPU levies just before _rival_trade_phase — the same point). An
      // AT-WAR rival that is suzerain of a militaristic CS levies its troops
      // when it can afford LEVY_GOLD_COST — ONE CS per rival per turn (the
      // FIRST eligible in id order). LEVY_COOLDOWN is per-CS and SHARED across
      // seats (cs.lastLevyTurn — real Civ 6: levied troops go to ONE civ), so
      // a rival levy blocks the player and other rivals alike for the cooldown.
      // Payment + cooldown are UNCONDITIONAL on a free spawn spot (levyUnits
      // pays before spawnUnit, which lands the LEVY_UNITS units on the CS
      // center or its nearest free neighbor). The type era ladder stays 2-step
      // (WARRIOR ≤ turn 60 else SPEARMAN — residual note, mirrors levyUnits).
      if (rival.atWar && goldAffordable(rival.treasury ?? 0, LEVY_GOLD_COST)) {
        for (const cs of state.cityStates) {
          if (cs.type !== 'militaristic') continue;
          if (!rivalIsSuzerain(cs, rival.id)) continue;
          const since = state.turn - (cs.lastLevyTurn ?? -LEVY_COOLDOWN);
          if (since < LEVY_COOLDOWN) continue;
          rival.treasury = (rival.treasury ?? 0) - LEVY_GOLD_COST;
          const type = state.turn > 60 ? 'SPEARMAN' : 'WARRIOR';
          for (let i = 0; i < LEVY_UNITS; i++) {
            spawnUnit(state, type, cs.centerIndex, 'rival', rival.id);
          }
          cs.lastLevyTurn = state.turn;
          state.eventLog.push(
            `${cs.name} levies ${LEVY_UNITS} ${type === 'SPEARMAN' ? 'spearmen' : 'warriors'} to ${rival.name}.`,
          );
          break;
        }
      }
    }

    // AUDIT A-11/A-12b: trade — ONE new route per civ per turn while
    // capacity allows (trader-training pacing). Scan origins × destinations
    // in city-array order — own cities first, then MET city-states (from
    // asc, to asc, cs asc — the deterministic GPU-mirrorable flat order);
    // the best NEW in-range pair by the route's TOTAL yields (identical to
    // the old food+prod for domestic routeYields, whose only channels those
    // are; a CS route is 3 gold + 1 specialty = 4 flat), strictly-greater
    // beats so ties keep the first-found.
    {
      const routes = (rival.tradeRoutes ??= []);
      if (routes.length < rivalTradeCapacity(state, rival) && rival.cities.length >= 1) {
        let best: { from: number; to?: number; toCs?: number; toPlayer?: number; ySum: number } | null = null;
        for (const from of rival.cities) {
          const ft = state.map.tiles[from.centerIndex];
          for (const to of rival.cities) {
            if (to.id === from.id) continue;
            if (routes.some((x) => x.from === from.id && x.to === to.id)) continue;
            const tt = state.map.tiles[to.centerIndex];
            if (hexDistance(ft.col, ft.row, tt.col, tt.row) > TRADE_ROUTE_RANGE) continue;
            const y = routeYields(state, to);
            const ySum = y.food + y.production;
            if (!best || ySum > best.ySum) best = { from: from.id, to: to.id, ySum };
          }
          for (const cs of state.cityStates) {
            if (!cs.rivalMet?.[rival.id]) continue;
            if (routes.some((x) => x.from === from.id && x.toCs === cs.id)) continue;
            const ct = state.map.tiles[cs.centerIndex];
            if (hexDistance(ft.col, ft.row, ct.col, ct.row) > TRADE_ROUTE_RANGE) continue;
            const cy = csRouteYields(cs);
            const ySum = cy.food + cy.production + cy.gold + cy.science + cy.culture + cy.faith;
            if (!best || ySum > best.ySum) best = { from: from.id, toCs: cs.id, ySum };
          }
        }
        // B-23 international: considered AFTER domestic + CS (only when no
        // domestic/CS candidate exists) — a route to a player city, gold-heavy
        // and picked by NEAREST-city preference (min hex distance; ties keep
        // the first in from-asc, player-city-asc order). Rivals always know
        // the player (no fog); rival→rival routes stay descoped (rivals don't
        // meet each other's cities until A-19).
        if (!best) {
          let bestIntl: { from: number; toPlayer: number; d: number } | null = null;
          for (const from of rival.cities) {
            const ft = state.map.tiles[from.centerIndex];
            for (const pc of state.cities) {
              if (routes.some((x) => x.from === from.id && x.toPlayer === pc.id)) continue;
              const pt = state.map.tiles[pc.centerIndex];
              const d = hexDistance(ft.col, ft.row, pt.col, pt.row);
              if (d > TRADE_ROUTE_RANGE) continue;
              if (!bestIntl || d < bestIntl.d) bestIntl = { from: from.id, toPlayer: pc.id, d };
            }
          }
          if (bestIntl) best = { from: bestIntl.from, toPlayer: bestIntl.toPlayer, ySum: 0 };
        }
        if (best) {
          const route: { from: number; to?: number; toCs?: number; toPlayer?: number; expiresTurn: number } =
            { from: best.from, expiresTurn: state.turn + TRADE_ROUTE_DURATION };
          if (best.toCs !== undefined) route.toCs = best.toCs;
          else if (best.toPlayer !== undefined) route.toPlayer = best.toPlayer;
          else route.to = best.to!;
          routes.push(route);
          // B-23 (#71): the rival route's Trader lays road along its land path.
          // Destination centre: an own city, a met city-state, or a player city.
          const fromRc = rival.cities.find((c) => c.id === route.from);
          const destIdx =
            route.toCs !== undefined
              ? state.cityStates.find((c) => c.id === route.toCs)?.centerIndex ?? -1
              : route.toPlayer !== undefined
              ? state.cities.find((c) => c.id === route.toPlayer)?.centerIndex ?? -1
              : rival.cities.find((c) => c.id === route.to)?.centerIndex ?? -1;
          if (fromRc && destIdx >= 0) layTradeRoad(state, fromRc.centerIndex, destIdx);
        }
      }
      // B-23 duration: after the pick, drop routes whose expiresTurn has
      // arrived — the freed capacity re-picks NEXT turn (zero draws). Also
      // drop international routes whose player destination no longer exists.
      rival.tradeRoutes = routes.filter(
        (x) =>
          (x.expiresTurn === undefined || x.expiresTurn > state.turn) &&
          (x.toPlayer === undefined || state.cities.some((c) => c.id === x.toPlayer)),
      );
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
    // B-24 S3: this rival's governor seats for THIS turn — same stateless
    // greedy as the player (quantized milli loyalty snapshot at the loop top,
    // ties by array position == the GPU's rc slot order).
    const rGovPicks = governorPicks(
      rival.cities.map((rc) => Math.round((rc.loyalty ?? LOYALTY_MAX) * 1000)),
      governorTitles(rival.research.civics.length),
    );
    const rGovIds = new Set([...rGovPicks].map((i) => rival.cities[i].id));
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
        // B-24 S2: contributions scale by the SOURCE civ's age factor (the
        // loyaltyDelta mirror — per-civ subtotal × factor, halves-exact).
        let own = 0;
        let foreign = 0;
        for (const c2 of rival.cities) {
          const t2 = state.map.tiles[c2.centerIndex];
          const d = hexDistance(here.col, here.row, t2.col, t2.row);
          if (d <= LOYALTY_RANGE) own += c2.population * (LOYALTY_RANGE + 1 - d);
        }
        own *= agePressureFactor(state, civOfRival(rival.id));
        let subP = 0;
        for (const c2 of state.cities) {
          const t2 = state.map.tiles[c2.centerIndex];
          const d = hexDistance(here.col, here.row, t2.col, t2.row);
          if (d <= LOYALTY_RANGE) subP += c2.population * (LOYALTY_RANGE + 1 - d);
        }
        foreign += subP * agePressureFactor(state, 0);
        for (const other of state.rivals) {
          if (other.id === rival.id) continue;
          let subO = 0;
          for (const c2 of other.cities) {
            const t2 = state.map.tiles[c2.centerIndex];
            const d = hexDistance(here.col, here.row, t2.col, t2.row);
            if (d <= LOYALTY_RANGE) subO += c2.population * (LOYALTY_RANGE + 1 - d);
          }
          foreign += subO * agePressureFactor(state, civOfRival(other.id));
        }
        const pressure =
          own + foreign === 0 ? 0 : (LOYALTY_PRESSURE_SCALE * (own - foreign)) / (own + foreign);
        const next =
          (rc.loyalty ?? LOYALTY_MAX) +
          pressure +
          (LOYALTY_AMENITY[tier.name] ?? 0) +
          (rGovIds.has(rc.id) ? GOVERNOR_LOYALTY : 0); // B-24 S3
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
          else if (q.kind === 'district') {
            const dt = state.map.tiles[q.tileIndex];
            dt.districtComplete = true;
            if (dt.district === 'ENCAMPMENT') dt.encampHp = ENCAMPMENT_HP; // B-17 (#71)
          }
          else if (q.kind === 'building') {
            rc.buildings.push(q.building);
            if (q.building === 'ANCIENT_WALLS') rc.outerHp = WALLS_HP; // AUDIT B-1
          }
          else if (q.kind === 'wonder') {
            state.map.tiles[q.tileIndex].builtWonderComplete = true; // A-4
            addEraScore(state, civOfRival(rival.id), ERA_SCORE_WONDER); // B-24: wonder completed
          }
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
            const trained = spawnUnit(state, q.unit, rc.centerIndex, 'rival', rival.id);
            // B-17 (ROUND B7): a trained military unit inherits this city's
            // Encampment training XP (best military-building tier).
            if (trained && (UNITS[q.unit]?.combat ?? 0) > 0) {
              const xp = encampmentTrainXp(rc.buildings);
              if (xp > 0) trained.xp = xp;
            }
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
        state.map.tiles[next].rivalCityId = rc.id; // A-17
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
          // A-19/B-33 (S2): the walls/Encampment ranged strike targets the
          // player + barbarians only — a rival city does NOT counter-strike an
          // enemy rival's units (v1 scope; the besiege heal-block below IS
          // symmetric). Excluding rival attackers keeps the GPU strike (already
          // player/barb-only) byte-exact without a strike-side rival port.
          if (!unitsAt(state, t.index).some((u) => u.owner !== 'rival' && unitsHostile(state, u, { owner: 'rival', civId: rival.id }))) continue;
          if (d < bestDist) {
            bestDist = d;
            bestTile = t.index;
          }
        }
        if (bestTile >= 0) {
          const hostiles = unitsAt(state, bestTile).filter(
            (u) => u.owner !== 'rival' && unitsHostile(state, u, { owner: 'rival', civId: rival.id }),
          );
          const defender = hostiles.find((u) => unitDomain(u.type) === 'military') ?? hostiles[0];
          const tt = state.map.tiles[bestTile];
          // B-29 + B-7 support (the pcstk mirror; attacker is the city — no flanking).
          // #45/B-6: an embarked target defends at the flat EMBARKED_DEFENSE_CS.
          const defCS = defender.embarked
            ? EMBARKED_DEFENSE_CS - woundPenalty(defender)
            : (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender) + SUPPORT_CS * supportCount(state, bestTile, defender) + xpLevelBonus(defender); // B-4 defender veterancy (embarked → flat, no xp)
          // #70/S2 (B-8): the general/admiral aura shields against city fire,
          // outside the embarked ternary (the combat.ts pcstk mirror).
          const defCSa = defCS + generalAuraCS(state, defender, bestTile);
          const atkCS = rivalCityDefense(state, rival, rc);
          defender.hp -= damageRoll(state, atkCS - defCSa, 'rcstk', bestTile);
          awardDefenseXp(defender); // B-4: +2 to a surviving military defender (attacker is the city)
          if (defender.hp <= 0) disbandUnit(state, defender.id);
        }
      }
      // B-17 (ROUND B7): the rival mirror of the ADDITIONAL Encampment strike
      // (the pestk twin). A rival city with a COMPLETE unpillaged ENCAMPMENT
      // fires the same once-per-turn ranged strike right AFTER its walls strike
      // (walls first, then Encampment — per rc, before the heal), k="restk".
      // B-17 (#71): a LIVE garrison is now required — an Encampment reduced to
      // 0 HP is occupied and fires nothing (the pestk twin's rule).
      if (rc.districts.some((dd) => encampmentIntact(state.map.tiles[dd.tileIndex]))) {
        let bestTile = -1;
        let bestDist = 99;
        for (const t of state.map.tiles) {
          const d = hexDistance(rcCenter.col, rcCenter.row, t.col, t.row);
          if (d < 1 || d > 2) continue;
          // A-19/B-33 (S2): the walls/Encampment ranged strike targets the
          // player + barbarians only — a rival city does NOT counter-strike an
          // enemy rival's units (v1 scope; the besiege heal-block below IS
          // symmetric). Excluding rival attackers keeps the GPU strike (already
          // player/barb-only) byte-exact without a strike-side rival port.
          if (!unitsAt(state, t.index).some((u) => u.owner !== 'rival' && unitsHostile(state, u, { owner: 'rival', civId: rival.id }))) continue;
          if (d < bestDist) {
            bestDist = d;
            bestTile = t.index;
          }
        }
        if (bestTile >= 0) {
          const hostiles = unitsAt(state, bestTile).filter(
            (u) => u.owner !== 'rival' && unitsHostile(state, u, { owner: 'rival', civId: rival.id }),
          );
          const defender = hostiles.find((u) => unitDomain(u.type) === 'military') ?? hostiles[0];
          const tt = state.map.tiles[bestTile];
          const defCS = defender.embarked
            ? EMBARKED_DEFENSE_CS - woundPenalty(defender)
            : (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender) + SUPPORT_CS * supportCount(state, bestTile, defender) + xpLevelBonus(defender);
          const defCSa = defCS + generalAuraCS(state, defender, bestTile); // #70/S2 (B-8), the rcstk mirror
          const atkCS = rivalCityDefense(state, rival, rc);
          defender.hp -= damageRoll(state, atkCS - defCSa, 'restk', bestTile);
          awardDefenseXp(defender);
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
        // B-17 (#71): the Encampment garrison repairs on the same gate/rate —
        // the player's barbarianPhase mirror.
        for (const d of rc.districts) {
          if (d.type !== 'ENCAMPMENT') continue;
          const dt = state.map.tiles[d.tileIndex];
          if (dt.district !== 'ENCAMPMENT' || !dt.districtComplete || dt.districtPillaged) continue;
          dt.encampHp = Math.min(ENCAMPMENT_HP, (dt.encampHp ?? ENCAMPMENT_HP) + CITY_HEAL_PER_TURN);
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
    // B-25 (#72): LIFETIME culture — the same per-turn sum, banked separately
    // because civicProgress is SPENT by every completed civic. Real Civ 6
    // scores DOMESTIC TOURISTS off lifetime culture, so this is the substrate
    // the Culture victory reads. Zero-draw; the GPU mirrors at this position.
    rival.cultureTotal = (rival.cultureTotal ?? 0) + culSum;
    // P5/S1 (C-12): net gold — city upkeep already netted per city; unit
    // upkeep and the GV-5 bankruptcy rule mirror the player's exactly
    // (milli-rounded test; disband the priciest-upkeep unit, tie → lowest
    // id; no refund).
    rival.treasury = (rival.treasury ?? 0) + goldSum;
    rival.faith = (rival.faith ?? 0) + faithSum; // P5/S5 (C-17)
    // B-20 (#71): TOURISM — the player's twin, accumulated once per turn at
    // the civ level (Great Works + owned Seaside Resorts, each worth its
    // tile's appeal). Zero-draw, integer-only.
    rival.tourism = (rival.tourism ?? 0) + rivalTourism(state, rival);
    // B-22 (#75): DIPLOMATIC FAVOR — government tier + suzerainties, the
    // player's twin at the same per-turn accumulator position.
    rival.diploFavor =
      (rival.diploFavor ?? 0) +
      diploFavorPerTurn(
        GOVERNMENTS_ADOPTION_LIVE ? computeAdoption(rival.research).government : null,
        rivalSuzerainCount(state, rival.id),
      );
    // B-22 (2026-07-27): grievances DECAY by 1 each turn this civ is at peace
    // on every axis (floor 0) — the same position as the other per-turn civ
    // accumulators so the GPU mirrors it exactly.
    if ((rival.warmonger ?? 0) > 0 && !rival.atWar && (rival.atWarRivals ?? []).length === 0) {
      rival.warmonger = (rival.warmonger ?? 0) - 1;
    }
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
    // B6-S2: missionary actions (spread on the adjacent target, else walk).
    rivalMissionaryActions(state, rival);

    // Races: great people, pantheons, beliefs.
    claimGreatPeople(state, rival);
    claimBeliefs(state, rival);

    // B7-G (B-8): the Great General marches with the war effort (spawned above
    // in claimGreatPeople — a fresh one walks this turn on its full MP). Runs
    // BEFORE the war loop so the aura reflects the general's advanced position.
    rivalGeneralActions(state, rival);

    // War and peace. A-19/B-33 (S2): a rival at war with ANYONE (player or a
    // rival) takes the WAR branch (its units run hostileUnitAct, which now
    // scans at-war rivals' units/cities via the symmetric unitsHostile). The
    // player-war counters and the player-peace RNG roll stay gated on
    // rival.atWar; the player-DoW roll (else branch) is skipped for a rival
    // already in ANY war — both engines gate on anyWar identically, so the
    // conditional draw is dropped in lockstep (RNG-stream parity preserved).
    const anyWar = rival.atWar || (rival.atWarRivals?.length ?? 0) > 0;
    if (anyWar) {
      if (rival.atWar) rival.warTurns += 1;
      for (const unit of rivalUnits(state, rival.id)) {
        if (UNITS[unit.type]?.charges !== undefined) continue; // C1-B5b: civilians act in rivalBuilderActions, never march
        if (unit.movesLeft > 0) hostileUnitAct(state, unit);
      }
      if (rival.atWar && rival.warTurns >= RIVAL_WAR_MIN_TURNS && nextRandom(state) < 0.25) {
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
        // B-22 (#74): a WARMONGERING player is ganged up on — past
        // RR_WARMONGER_GANG grievances a rival declares without the usual
        // strength advantage, the exact twin of the rival↔rival gang rule.
        ((state.warmonger ?? 0) >= RR_WARMONGER_GANG || rivalStrength(state, rival) > playerStrength(state) * 1.3) &&
        nextRandom(state) < 0.08 * (0.5 + rival.aggression)
      ) {
        rival.atWar = true;
        rival.warTurns = 0;
        state.eventLog.push(`${rival.name} declares war on you!`);
      }
    }
  }

  // A-19/B-33 (S2): pairwise rival↔rival auto-peace — AFTER every rival acted
  // (their war-acts updated ww/cities), before the tail check (ZERO-DRAW).
  rivalRivalMakePeace(state);

  // A-24: env-gated registry coherence check at the phase tail (after every
  // founding/placement/capture this turn). Off by default → zero cost + no
  // trajectory change; the GPU forced-compaction gate exercises the twin.
  // globalThis avoids a @types/node dependency (the src tsconfig has none).
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CIV6_RC_REGISTRY_CHECK) {
    assertRivalRegistryCoherent(state);
  }
}
