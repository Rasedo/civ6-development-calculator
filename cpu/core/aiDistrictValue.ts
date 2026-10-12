/**
 * THE AI'S DISTRICT VALUE (GameCore_XP2 AI/Value_Manager.cpp 0x7a51f0 and
 * its body 0x7aaf80; `tools/civ6lab/dll_readings.md` "C-96: the district
 * value"): what a district is worth on a plot landing in `t` turns — the
 * plot's purchase, the feature it clears, the resource it harvests and the
 * improvement it replaces, then its yields a turn from `t` to the horizon
 * (its adjacency, the pseudo-yields it carries, its Great Person points, its
 * Maintenance off) less what the best other district would take of the
 * plot, with its lumps (the units it opens, its Housing, the river plots a
 * Dam guards, a Canal's trade, its space projects). The city's plot
 * analysis writes one per plot and district (AI_CityBuild.csv's DISTRICTS
 * rows), the district choice reads them.
 */
import { AI_DISTRICTS, AI_FEATURES, AI_IMPROVEMENTS, AI_RESOURCES } from '../data/aiBuildTables';
import type { AiDistrictRow } from './aiCityBuild';
import {
  AI_RATE, FX, FX_MIN, discounted, fmul, fxConst, presentValue, pseudoYieldValue, yieldValue,
} from './aiValue';
import {
  featureRemovalValue, harvestValue, improvementYieldsValue, type PlotValueFacts,
} from './aiPlotValue';

/** the Yields the per-yield terms run over, in the database's order */
const YIELDS = ['YIELD_FOOD', 'YIELD_PRODUCTION', 'YIELD_GOLD', 'YIELD_SCIENCE', 'YIELD_CULTURE', 'YIELD_FAITH'];

/** CITY_POPULATION_AQUEDUCT_BOOST (GlobalParameters, the globals' +0x13c):
 *  the Housing an Aqueduct counts beyond its row's */
const AQUEDUCT_BOOST = 2;

/** What the district value reads beyond the plot's facts */
export interface DistrictValueFacts extends PlotValueFacts {
  /** the plot has an owner (its owner byte not 0xff) */
  owned: boolean;
  /** the city's Gold price of the plot (city +0x1688, 0x1b1cb0): -1 where
   *  the city cannot buy it (beyond its reach, or no plot of the owner's
   *  beside it) */
  purchaseCost: number;
  /** the plot is a lake (IsLake) */
  lake: boolean;
  /** the city keeps the feature under the district (0x17cb00) */
  keepsFeature(district: string): boolean;
  /** the district on the plot, null none, and whether it is pillaged; the
   *  plot is the city's centre */
  district: string | null;
  districtPillaged: boolean;
  isCity: boolean;
  /** the district's whole adjacency of a YieldType at the plot (0x366df0 ->
   *  0x365720: its rows and the owner's adjacency modifiers) */
  districtAdjacency(district: string, yieldType: string): number;
  /** the district's adjacency rows' yield of a YieldType at the plot
   *  (each row through 0x365ae0) */
  rowsAdjacency(district: string, yieldType: string): number;
  /** the other districts the player may build, the city lacks and the plot
   *  takes (0x406c00, 0x1aec20, 0x35f2d0) */
  otherDistricts(district: string): readonly string[];
  /** the player's era's ChronologyIndex (Eras +0x1c) */
  chronology: number;
  /** the city's districts (0x1ae8f0) and the most its population allows
   *  (0x1ae8a0) */
  districtCount: number;
  districtCap: number;
  /** the player's other cities within `range` of the city with no
   *  `district` of the player's within `range` of them */
  regionalCities(district: string, range: number): number;
  /** the city trains units of a domain (0x1c77c0: a district of the domain,
   *  land, or the sea from its centre's plot), any of the player's cities
   *  does */
  cityTrains(domain: string): boolean;
  playerTrains(domain: string): boolean;
  /** the city analysis' values of the units of a domain, each at least 0,
   *  summed (0x5d4cd0) */
  domainUnitsValue(domain: string): number;
  /** the plots of the rivers at the plot (0xa2bf20, a plot once per river)
   *  the city's owner holds: those with an improvement, those with a
   *  district not InternalOnly */
  riverPlots(): { improved: number; districted: number };
  /** the player's trade count a Canal multiplies (0x4d9320 on the player's
   *  +0x12e0) */
  canalTrade: number;
  /** the project value (0x7b28c0) of a project at `t` .. `h`, raw */
  projectValue(project: string, t: number, h: number): number;
  /** a project is a SpaceRace one (Projects +0xe8 bit 1); one the player's
   *  civics favour (0x7a48d0 on the player's +0x1290) */
  spaceRace(project: string): boolean;
  favoured(project: string): boolean;
  /** the player's districts of a type (0x408b60): all, and complete */
  districtsOf(district: string, complete: boolean): number;
}

const DISTRICT = new Map(AI_DISTRICTS.map((r) => [r.type, r] as const));
const FEATURE = new Map(AI_FEATURES.map((r) => [r.type, r] as const));
const RESOURCE = new Map(AI_RESOURCES.map((r) => [r.type, r] as const));
const IMPROVEMENT = new Map(AI_IMPROVEMENTS.map((r) => [r.type, r] as const));

const between = (a: number, t: number, h: number): number => presentValue(a, AI_RATE, h) - presentValue(a, AI_RATE, t);

/** a float's 24.8 raw as the DLL converts it: the floor's whole part, the
 *  fraction's 256ths truncated */
function fxOfFloat(x: number): number {
  const w = Math.floor(x);
  return (w << 8) | (Math.trunc(Math.fround(x - w) * 256) & 0xff);
}

/** a district's per-turn value from its adjacency rows (0x365ae0 per row
 *  and yield, at the player's value), once per facts and district */
const ROWS = new WeakMap<DistrictValueFacts, Map<string, number>>();
function rowsValue(f: DistrictValueFacts, district: string): number {
  let m = ROWS.get(f);
  if (!m) ROWS.set(f, (m = new Map()));
  let v = m.get(district);
  if (v !== undefined) return v;
  v = 0;
  for (const y of YIELDS) v += yieldValue(f.view, f.seat, f.rowsAdjacency(district, y) * FX, y);
  m.set(district, v);
  return v;
}

/** 0x7aaf80: the district's own value on the plot from `t` to `h` */
export function districtBodyValue(f: DistrictValueFacts, row: AiDistrictRow, t: number, h: number): number {
  if (t >= h) return FX_MIN;
  if (row.coast && f.lake) return FX_MIN;
  // a flood (unless the district holds the floods back) or an eruption the
  // AI expects sooner ends the horizon there
  for (const hazard of [row.preventsFloods ? null : f.floodTurns, f.eruptionTurns]) {
    if (hazard === null || hazard >= h * FX) continue;
    h = hazard >> 8;
    if (h <= t) return 0;
  }
  const pd = pseudoYieldValue(f.view, f.seat, FX, 'PSEUDOYIELD_DISTRICT');
  let v = pd;
  // the whole adjacency counts on an owned plot only (0x366df0 reads 0 at
  // a plot without an owner); the rows count on any
  if (f.owned) for (const y of YIELDS) v += yieldValue(f.view, f.seat, f.districtAdjacency(row.type, y) * FX, y);
  // what the district's own rows earn here against the best other district's
  const own = rowsValue(f, row.type);
  let best = own;
  for (const d of f.otherDistricts(row.type)) best = Math.max(best, rowsValue(f, d));
  v += own;
  if (best > own && !row.aqueduct) v -= best;
  // HitPoints x 0.02 at (d - d f) / d + 1 of the CITY_DEFENSES pseudo-yield's
  // value at no player (d) and at the player's (d f)
  if (row.hitPoints !== null) {
    const hp = fxOfFloat(Math.fround(row.hitPoints * Math.fround(0.02)));
    const d = pseudoYieldValue(null, null, FX, 'PSEUDOYIELD_CITY_DEFENSES');
    const df = pseudoYieldValue(f.view, f.seat, FX, 'PSEUDOYIELD_CITY_DEFENSES');
    v += fmul(Math.trunc(((d - df) * FX) / d) + FX, hp);
  }
  // half the era's chronology while the city may add a district, the whole
  // where the plot holds it already
  const chron = fmul(f.chronology * FX, pd);
  if (!row.requiresPopulation || f.districtCap > f.districtCount) v += fmul(fxConst(0.5), chron);
  if (f.district === row.type) v += chron;
  // a regional building's reach: x (the cities it would serve + 1) / 2
  if (row.regionalRange > 0) v = fmul(fxOfFloat(Math.fround((f.regionalCities(row.type, row.regionalRange) + 1) * 0.5)), v);
  // Appeal beside a district with Housing
  if (row.appeal !== 0 && f.besideHousingDistrict) {
    v += yieldValue(f.view, f.seat, fxOfFloat(Math.fround(row.appeal * 0.5)), 'YIELD_FOOD');
  }
  // the units of its domain where the city trains none: a naval or air
  // combat pseudo-yield of 5.0, twice where no city of the player's does;
  // where none does, the units' values once
  let lump = 0;
  if (row.domain && !f.cityTrains(row.domain)) {
    const pseudo = row.domain === 'DOMAIN_SEA' ? 'PSEUDOYIELD_UNIT_NAVAL_COMBAT' : row.domain === 'DOMAIN_AIR' ? 'PSEUDOYIELD_UNIT_AIR_COMBAT' : null;
    const any = f.playerTrains(row.domain);
    if (pseudo) {
      const p = pseudoYieldValue(f.view, f.seat, 5 * FX, pseudo);
      v += any ? p : 2 * p;
    }
    if (!any) lump += f.domainUnitsValue(row.domain);
  }
  v -= yieldValue(f.view, f.seat, row.maintenance * FX, 'YIELD_GOLD');
  for (const [pseudo, points] of row.gpp) if (pseudo) v += pseudoYieldValue(f.view, f.seat, points * FX, pseudo);
  let value = between(v, t, h) + lump;
  // its Housing (an Aqueduct's the boost) at the plot's Appeal band
  const housing = row.housing + (row.aqueduct ? AQUEDUCT_BOOST : 0);
  if (housing > 0) {
    const band = row.appealHousing.find(([min]) => f.appeal >= min);
    value += f.housingValue(housing + (band ? band[1] : 0), t, h);
  }
  // a Dam: 100.0 an improved plot and 300.0 a district's along its rivers
  if (row.preventsFloods) {
    const r = f.riverPlots();
    value += (r.improved * 100 + r.districted * 300) * FX;
  }
  // a Canal: 100.0 a trade
  if (row.canal) value += f.canalTrade * 100 * FX;
  // its projects at a tenth each, x3 a favoured one, the positive summed;
  // where SpaceRace ones value above 0, shared among the player's districts
  // of the type while those stand within half their count (rounded up)
  let projects = 0;
  let space = -1;
  for (const p of row.projects) {
    let pv = fmul(f.projectValue(p, t, h), fxConst(0.1));
    if (f.spaceRace(p) && pv > 0) space = Math.max(space + 1, 1);
    if (f.favoured(p)) pv = fmul(pv, 3 * FX);
    projects += Math.max(pv, 0);
  }
  const k = Math.ceil(Math.fround(space * 0.5));
  if (k > 0 && f.district !== row.type && f.districtsOf(row.type, true) <= k) {
    value += Math.trunc((projects * FX) / ((f.districtsOf(row.type, false) + 1) * FX));
  }
  return value;
}

/** 0x7a51f0: the district on the plot landing in `t` turns, to `h` */
export function districtValue(f: DistrictValueFacts, district: string, t: number, h: number): number {
  if (t > h) return FX_MIN;
  const row = DISTRICT.get(district);
  if (!row) return FX_MIN;
  let value = 0;
  if (!f.owned) value -= discounted(yieldValue(null, null, f.purchaseCost * FX, 'YIELD_GOLD'), AI_RATE, t);
  if (f.feature && !f.keepsFeature(district)) {
    if (!FEATURE.get(f.feature)?.removable) return 0;
    value += featureRemovalValue(f, f.feature, t, h);
  }
  if (f.resource) {
    if ((RESOURCE.get(f.resource)?.harvests.length ?? 0) === 0) return 0;
    value += harvestValue(f, f.resource, t, h);
  }
  if (f.improvement && !f.pillaged) {
    const imp = IMPROVEMENT.get(f.improvement);
    if (imp) value -= improvementYieldsValue(f, imp, t, h);
    if (f.resource) value -= f.resourceValue(f.resource, -1, t, h);
  }
  const repair = f.district === district && f.districtPillaged;
  if (repair && f.isCity) value += 12500 * FX;
  value += districtBodyValue(f, row, t, h);
  return repair ? value * 2 : value;
}
