/**
 * THE ONCE MOMENTS — what a major records the first time it holds something
 * (GameCore_XP2 Game_History_MomentHandlers; the rows' own text names each
 * trigger). Every such moment is a KEY: the seat's `moments` holds the keys
 * it has recorded, the game's `momentsWorld` the keys anyone has, and a key's
 * pay is its [plain, first in the world] pair — the second when no one
 * recorded it before (`recordMoment`).
 *
 * `recordMoments` runs once a turn, before the era step, over the majors in
 * seat order: each records every key it now holds (`momentKeysHeld`), so a
 * lower seat that reaches a thing the same turn is first. The city-states'
 * research eras then join the world's: a city-state's first tech or civic of
 * an era leaves no major the world's first.
 *
 * The founding's once-a-game moments (near a natural wonder, a floodable
 * river or a volcano; the largest civilization by a margin) ride the same
 * keys from `foundingMoments`, and a specialty district's high starting
 * adjacency rides them from `districtMoment` as the district completes.
 * `_moment_*` on the GPU is the twin.
 */
import type { City, DistrictId, GameState, Tile } from './types';
import { addEraScore } from './eras';
import { isCiv, seatOf } from './seats';
import { fogActive, isExplored } from './fog';
import { makeYieldCtx } from './effects';
import { baseAdjacency, buildingVariantAdjacency, cityPower, onOrNextToShallowWater } from './yields';
import { militaryBuildingRows } from './cityStates';
import { PROJECTS } from '../data/projects';
import { MILITARISTIC_BUILDING_ROWS } from '../data/cityStates';
import { ERAS, TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { DISTRICTS } from '../data/districts';
import { IMPROVEMENTS } from '../data/improvements';
import { GOVERNMENT_LIST } from '../data/policies';
import { BELIEF_SLOTS } from '../data/religion';
import { STRATEGIC_IDS } from '../data/constants';
import { CIV_LEADERS } from '../data/seats';
import { FEATURES } from '../../world/features';
import {
  MOMENT_TECH_ERA, MOMENT_CIVIC_ERA, MOMENT_CITY_SIZES, MOMENT_GOV_TIERS, MOMENT_UNIT_SEA, MOMENT_UNIT_AIR,
  MOMENT_UNIT_STRATEGIC, MOMENT_UNIQUE_UNIT, MOMENT_UNIQUE_BUILDING, MOMENT_UNIQUE_DISTRICT,
  MOMENT_UNIQUE_IMPROVEMENT, MOMENT_NEIGHBORHOOD, MOMENT_SEASIDE_RESORT, MOMENT_MAX_BELIEFS,
  MOMENT_GOVERNORS_ALL, MOMENT_TRADING_POST_ALL, MOMENT_FIND_WONDER, MOMENT_FIRST_SUZERAIN,
  MOMENT_NEAR_WONDER, MOMENT_NEAR_FLOOD, MOMENT_NEAR_VOLCANO, MOMENT_LARGEST, MOMENT_HIGH_ADJACENCY,
  MOMENT_FORMATION, MOMENT_FULL_ENCAMPMENT, MOMENT_POWER_FROM_RESOURCE, MOMENT_DISASTER_IMPROVEMENT, MOMENT_MITIGATED_FLOOD,
  MOMENT_CIRCUMNAVIGATED, MOMENT_RENEWABLE, RENEWABLE_IMPROVEMENTS,
} from '../data/seats';

type Pay = readonly [number, number];
/** every key's id and pay, in key order */
export const MOMENT_KEYS: { id: string; pay: Pay }[] = [];
const add = (id: string, pay: Pay): number => {
  MOMENT_KEYS.push({ id, pay });
  return MOMENT_KEYS.length - 1;
};
const one = (v: number): Pay => [v, v];

/** a seat's first tech / civic of an era after the Ancient, by ERAS index (-1 none) */
export const TECH_ERA_KEY = ERAS.map((e, i) => (i === 0 ? -1 : add(`TECH_ERA:${e}`, MOMENT_TECH_ERA)));
export const CIVIC_ERA_KEY = ERAS.map((e, i) => (i === 0 ? -1 : add(`CIVIC_ERA:${e}`, MOMENT_CIVIC_ERA)));
/** a city of `MOMENT_CITY_SIZES[i].pop` */
export const CITY_SIZE_KEY = MOMENT_CITY_SIZES.map((s, i) => add(`CITY_SIZE:${i}`, s.pay));
/** a government of a tier, by tier (-1 for the Chiefdom's 0) */
export const GOV_TIER_KEY = [-1, ...MOMENT_GOV_TIERS.map((p, i) => add(`GOV_TIER:${i + 1}`, p))];
const UNIT_SEA_KEY = add('UNIT_SEA', MOMENT_UNIT_SEA);
const UNIT_AIR_KEY = add('UNIT_AIR', MOMENT_UNIT_AIR);
const STRATEGIC_KEY = new Map(STRATEGIC_IDS.map((r) => [r, add(`STRATEGIC:${r}`, MOMENT_UNIT_STRATEGIC)] as const));
/** the keys a living unit of each type holds: a seafaring one, a flying one,
 *  the strategic resource it uses, a unique one */
export const UNIT_KEYS: Record<string, number[]> = Object.fromEntries(Object.entries(UNITS).map(([id, u]) => {
  const ks: number[] = [];
  // CIV6 (UNIT_CREATED_FIRST_DOMAIN_SEA): any unit of DOMAIN_SEA, the Great
  // Admiral among them (1121 China t109: its first sea unit an Admiral)
  if (u.naval || u.seaDomain) ks.push(UNIT_SEA_KEY);
  if (u.air) ks.push(UNIT_AIR_KEY);
  const r = u.requiresResource ? STRATEGIC_KEY.get(u.requiresResource) : undefined;
  if (r !== undefined) ks.push(r);
  if (u.uniqueTo || u.uniqueLeader) ks.push(add(`UNIQUE_UNIT:${id}`, one(MOMENT_UNIQUE_UNIT)));
  return [id, ks];
}));
/** a building / district with a civilization's own variant: held by a seat
 *  of that civilization */
export const BUILDING_UNIQUE_KEY: Record<string, number> = Object.fromEntries(Object.values(BUILDINGS)
  .filter((b) => (b.civVariants ?? []).length > 0)
  .map((b) => [b.id, add(`UNIQUE_BUILDING:${b.id}`, one(MOMENT_UNIQUE_BUILDING))]));
export const DISTRICT_UNIQUE_KEY: Record<string, number> = Object.fromEntries(Object.values(DISTRICTS)
  .filter((d) => (d.civVariants ?? []).length > 0)
  .map((d) => [d.id, add(`UNIQUE_DISTRICT:${d.id}`, one(MOMENT_UNIQUE_DISTRICT))]));
export const NEIGHBORHOOD_KEY = add('NEIGHBORHOOD', MOMENT_NEIGHBORHOOD);
/** an improvement the seat lays on a plot a natural disaster enriched
 *  (`improvementMoment`) */
export const DISASTER_IMPROVEMENT_KEY = add('DISASTER_IMPROVEMENT', one(MOMENT_DISASTER_IMPROVEMENT));
/** a flood the seat's Dam or Great Bath mitigated (`mitigatedFloodMoment`) */
export const MITIGATED_FLOOD_KEY = add('MITIGATED_FLOOD', one(MOMENT_MITIGATED_FLOOD));
/** a plot the seat has explored in every column of the map */
export const CIRCUMNAVIGATED_KEY = add('CIRCUMNAVIGATED', MOMENT_CIRCUMNAVIGATED);
/** a renewable energy improvement, one key for the four types */
const RENEWABLE_KEY = add('RENEWABLE_ENERGY', MOMENT_RENEWABLE);
/** an improvement on the seat's land: a unique one, the Seaside Resort, a
 *  renewable energy one */
export const IMPROVEMENT_KEY: Record<string, number> = {
  ...Object.fromEntries(Object.values(IMPROVEMENTS)
    .filter((m) => m.uniqueTo || m.uniqueLeader || m.id === 'SEASIDE_RESORT')
    .map((m) => [m.id, m.id === 'SEASIDE_RESORT' ? add('SEASIDE_RESORT', MOMENT_SEASIDE_RESORT)
      : add(`UNIQUE_IMPROVEMENT:${m.id}`, one(MOMENT_UNIQUE_IMPROVEMENT))])),
  ...Object.fromEntries(RENEWABLE_IMPROVEMENTS.map((id) => [id, RENEWABLE_KEY])),
};
/** a living unit of a formation, [land, naval][formation] (-1 for none) */
export const FORMATION_KEY: readonly (readonly number[])[] = [
  [-1, add('FORMATION:CORPS', MOMENT_FORMATION.land[0]), add('FORMATION:ARMY', MOMENT_FORMATION.land[1])],
  [-1, add('FORMATION:FLEET', MOMENT_FORMATION.naval[0]), add('FORMATION:ARMADA', MOMENT_FORMATION.naval[1])],
];
export const FULL_ENCAMPMENT_KEY = add('FULL_ENCAMPMENT', one(MOMENT_FULL_ENCAMPMENT));
export const POWER_FROM_RESOURCE_KEY = add('POWER_FROM_RESOURCE', MOMENT_POWER_FROM_RESOURCE);
export const MAX_BELIEFS_KEY = add('MAX_BELIEFS', MOMENT_MAX_BELIEFS);
export const GOVERNORS_ALL_KEY = add('GOVERNORS_ALL', one(MOMENT_GOVERNORS_ALL));
export const TRADING_POST_ALL_KEY = add('TRADING_POST_ALL', MOMENT_TRADING_POST_ALL);
const NW_IDS = Object.keys(FEATURES).filter((f) => FEATURES[f].naturalWonder);
/** a natural wonder the seat has explored a plot of */
export const WONDER_FOUND_KEY: Record<string, number> = Object.fromEntries(
  NW_IDS.map((f) => [f, add(`FIND_WONDER:${f}`, MOMENT_FIND_WONDER)]));
/** the founding's: a city within range of this natural wonder, of a
 *  floodable river, of a volcano; the largest civilization by the margin */
export const NEAR_WONDER_KEY: Record<string, number> = Object.fromEntries(
  NW_IDS.map((f) => [f, add(`NEAR_WONDER:${f}`, one(MOMENT_NEAR_WONDER))]));
export const NEAR_FLOOD_KEY = add('NEAR_FLOOD', one(MOMENT_NEAR_FLOOD));
export const NEAR_VOLCANO_KEY = add('NEAR_VOLCANO', one(MOMENT_NEAR_VOLCANO));
export const LARGEST_KEY = add('LARGEST', one(MOMENT_LARGEST));
/** a specialty district completed with the starting adjacency its row names
 *  (`districtMoment`), by district */
export const HIGH_ADJACENCY_KEY: Partial<Record<DistrictId, number>> = Object.fromEntries(
  MOMENT_HIGH_ADJACENCY.map((r) => [r.district, add(`HIGH_ADJACENCY:${r.district}`, one(r.pay))]));
/** the keys past the table: the first suzerain of city-state `id` is key
 *  `SUZERAIN_KEY0 + id` */
export const SUZERAIN_KEY0 = MOMENT_KEYS.length;

export function momentPay(k: number): Pay {
  return k >= SUZERAIN_KEY0 ? [0, MOMENT_FIRST_SUZERAIN] : MOMENT_KEYS[k].pay;
}

/** key `k`'s name */
export function momentKeyId(k: number): string {
  return k >= SUZERAIN_KEY0 ? `SUZERAIN:${k - SUZERAIN_KEY0}` : MOMENT_KEYS[k].id;
}

const insertSorted = (xs: number[], k: number): void => {
  let i = 0;
  while (i < xs.length && xs[i] < k) i++;
  if (xs[i] !== k) xs.splice(i, 0, k);
};

/** Major `seat` records key `k` unless it has: the first-in-the-world pay
 *  when no one has recorded it, else the plain one. */
export function recordMoment(state: GameState, seat: number, k: number): void {
  const s = seatOf(state, seat);
  if (!s || !isCiv(seat)) return;
  const seen = (s.moments ??= []);
  if (seen.includes(k)) return;
  const world = (state.momentsWorld ??= []);
  const pay = momentPay(k)[world.includes(k) ? 0 : 1];
  if (pay > 0) addEraScore(state, seat, pay);
  insertSorted(seen, k);
  insertSorted(world, k);
}

/** CIV6 (IMPROVEMENT_CONSTRUCTED_ON_DISASTER_YIELD_TILE_FIRST): major `seat`
 *  lays an improvement on `t` — a plot a natural disaster enriched (its
 *  fertility) records the key; an improvement standing when a disaster
 *  enriches its plot records nothing (runs/h1_duelw1117 China: its Farms
 *  under the floods of t13-22 none, a Farm laid on t38's flood plot the
 *  moment). `_moment_disaster_improvement` is the twin. */
export function improvementMoment(state: GameState, seat: number, t: Tile): void {
  if (t.fertility > 0 || t.fertilityProd > 0 || (t.fertilitySci ?? 0) > 0 || (t.fertilityCul ?? 0) > 0) {
    recordMoment(state, seat, DISASTER_IMPROVEMENT_KEY);
  }
}

/** CIV6 (MITIGATED_RIVER_FLOOD): `seat` mitigated a flood — its Dam or Great
 *  Bath shielded the river (`riverShield`); a major records the key once a
 *  game (runs/h1_duelw1128 t160: China's Dam on the Amur, +1).
 *  `_moment_mitigated_flood` is the twin. */
export function mitigatedFloodMoment(state: GameState, seat: number): void {
  recordMoment(state, seat, MITIGATED_FLOOD_KEY);
}

/** CIV6 (DISTRICT_CONSTRUCTED_HIGH_ADJACENCY_*): major `seat` records the
 *  district of `type` its `city` completed on `tileIndex` when its yield
 *  there before any percent reaches its row's bonus — the seat's first such
 *  district of the type. */
export function districtMoment(state: GameState, seat: number, city: City, tileIndex: number, type: DistrictId): void {
  const k = HIGH_ADJACENCY_KEY[type];
  if (k === undefined || !isCiv(seat) || (seatOf(state, seat)?.moments ?? []).includes(k)) return;
  const row = MOMENT_HIGH_ADJACENCY.find((r) => r.district === type)!;
  const ctx = makeYieldCtx(state, seat);
  const tile = state.map.tiles[tileIndex];
  // the district's yield before any percent (GameCore District::GetYield
  // 0x249850 unscaled, read by the handler 0x312c00): its adjacency, and
  // the flat yields a district takes — Nan Madol's Culture beside the water
  let adj = baseAdjacency(ctx, tile, type, buildingVariantAdjacency(ctx.mods.civ, city, type));
  if (DISTRICTS[type].adjacencyYield === 'culture' && ctx.mods.waterDistrictCulture && onOrNextToShallowWater(ctx.map, tile)) {
    adj += ctx.mods.waterDistrictCulture;
  }
  if (adj >= row.min) recordMoment(state, seat, k);
}

/** the tech / civic era keys a research record holds, into `out` */
export function researchKeys(techs: readonly string[], civics: readonly string[], out: Set<number>): void {
  for (const id of techs) {
    const k = TECH_ERA_KEY[ERAS.indexOf(TECHS[id]?.era)] ?? -1;
    if (k >= 0) out.add(k);
  }
  for (const id of civics) {
    const k = CIVIC_ERA_KEY[ERAS.indexOf(CIVICS[id]?.era)] ?? -1;
    if (k >= 0) out.add(k);
  }
}

/** Every swept key major `seat` holds now, ascending. */
export function momentKeysHeld(state: GameState, seat: number): number[] {
  const s = seatOf(state, seat);
  const out = new Set<number>();
  if (!s || !isCiv(seat)) return [];
  researchKeys(s.research.techs, s.research.civics, out);
  const civ = s.civ >= 0 ? CIV_LEADERS[s.civ]?.civ ?? null : null;
  const map = state.map;
  for (const c of s.cities) {
    MOMENT_CITY_SIZES.forEach((z, i) => {
      if (c.population >= z.pop) out.add(CITY_SIZE_KEY[i]);
    });
    for (const b of c.buildings) {
      const k = BUILDING_UNIQUE_KEY[b];
      if (k !== undefined && BUILDINGS[b].civVariants?.some((v) => v.civ === civ)) out.add(k);
    }
    for (const d of c.districts) {
      if (!map.tiles[d.tileIndex]?.districtComplete) continue;
      if (d.type === 'NEIGHBORHOOD') out.add(NEIGHBORHOOD_KEY);
      const k = DISTRICT_UNIQUE_KEY[d.type];
      if (k !== undefined && DISTRICTS[d.type].civVariants?.some((v) => v.civ === civ)) out.add(k);
    }
    if (militaryBuildingRows(c) === MILITARISTIC_BUILDING_ROWS.length) out.add(FULL_ENCAMPMENT_KEY);
    // lit by a plant's burned resource: powered, its own supply short and no
    // fully-powering project at the head of its queue (`resolveSeatPower`)
    if (c.powered) {
      const p = cityPower(state, c);
      const head = c.queue[0];
      if (p.supply < p.demand && !(head?.kind === 'project' && PROJECTS[head.project]?.fullyPowered)) {
        out.add(POWER_FROM_RESOURCE_KEY);
      }
    }
  }
  const tier = GOVERNMENT_LIST.find((g) => g.id === s.government.chosen)?.tier ?? 0;
  if (GOV_TIER_KEY[tier] >= 0) out.add(GOV_TIER_KEY[tier]);
  // a unit held by levy is the city-state's: its keys are no unit this seat
  // created (runs/h1_duelw1112 China: the levy's ship at t56, its own first
  // ship's UNIT_CREATED_FIRST_DOMAIN_SEA_IN_WORLD at t70)
  // (a levied formation still counts: 1121 China t180, a levied Corps of
  // Line Infantry pays FORMATION_CORPS_FIRST_IN_WORLD and no Niter moment)
  for (const u of state.units) {
    if (u.seat !== seat) continue;
    if (u.leviedFrom === undefined) for (const k of UNIT_KEYS[u.type] ?? []) out.add(k);
    const fk = FORMATION_KEY[UNITS[u.type]?.naval ? 1 : 0][u.formation ?? 0] ?? -1;
    if (fk >= 0) out.add(fk);
  }
  for (const t of map.tiles) {
    if (t.ownerSeat === seat && t.improvement) {
      const k = IMPROVEMENT_KEY[t.improvement];
      if (k !== undefined) out.add(k);
    }
    const nw = t.feature !== null ? WONDER_FOUND_KEY[t.feature] : undefined;
    if (nw !== undefined && isExplored(state, seat, t.index)) out.add(nw);
  }
  // the world circumnavigated: under fog, every column of the map holds a
  // plot the seat has explored (0x50d390; runs/h1_duelw1127 Rome t157,
  // China t183)
  if (fogActive(state)) {
    const columnSeen = (x: number) => {
      for (let y = 0; y < map.height; y++) if (isExplored(state, seat, y * map.width + x)) return true;
      return false;
    };
    let round = true;
    for (let x = 0; x < map.width && round; x++) round = columnSeen(x);
    if (round) out.add(CIRCUMNAVIGATED_KEY);
  }
  const rel = s.religion;
  if (rel.founded && BELIEF_SLOTS.every((slot) => (rel[slot] ?? null) !== null)) out.add(MAX_BELIEFS_KEY);
  if ((s.governors ?? []).length > 0 && s.governors!.every((g) => g.appointed)) out.add(GOVERNORS_ALL_KEY);
  const others = state.seats.filter((o) => o.seat !== seat && isCiv(o.seat) && o.cities.length > 0);
  const posts = s.tradingPosts ?? [];
  if (others.length > 0 && others.every((o) => o.cities.some((c) => posts.includes(c.centerIndex)))) {
    out.add(TRADING_POST_ALL_KEY);
  }
  for (const cs of state.cityStates) {
    if ((cs.suzerain ?? -1) === seat) out.add(SUZERAIN_KEY0 + cs.id);
  }
  return [...out].sort((a, b) => a - b);
}

/** The turn's once moments: every major in seat order records the keys it
 *  holds, then the city-states' research eras join the world's. */
export function recordMoments(state: GameState): void {
  for (const s of state.seats) {
    if (!isCiv(s.seat)) continue;
    for (const k of momentKeysHeld(state, s.seat)) recordMoment(state, s.seat, k);
  }
  const cs = new Set<number>();
  for (const c of state.cityStates) researchKeys(c.research.techs, c.research.civics, cs);
  const world = (state.momentsWorld ??= []);
  for (const k of cs) insertSorted(world, k);
}
