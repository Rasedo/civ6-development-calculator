/**
 * THE CITY BUILD AI'S VALUES (GameCore_XP2 AI/CityBuild.cpp and
 * AI/Value_Manager.cpp; `tools/civ6lab/dll_readings.md` "C-96 / C-97: the
 * city build AI"). Each turn the city's analysis job (0x5ce970, once per
 * plot it evaluates, the city centre first) fills a value per item in
 * DATABASE ORDER — the tables AI_CityBuild.csv's PLOT ANALYSIS LOG prints —
 * and the city's choices read them.
 *
 * A BUILDING other than a wonder is valued at the city centre only, for the
 * player's own version of it (a civilization's unique building in place of
 * the one it replaces) that CanConstruct does not refuse outright; any
 * other reads FX(-9999). Its turns T: the longer of the turns to its
 * technology and to its civic (the research and civics AIs' analyses), the
 * turns to its district where the city lacks it (+10 while that district is
 * not the city's current production), the turns to build it (0x17b1e0, its
 * cost less its progress over the city's Production toward it, rounded up),
 * +10 while the city produces something else, and each prerequisite
 * building the city lacks at its own research and build turns. T at or past
 * the horizon (the GlobalAI's `m_valueHorizons`[1], 50) reads FX(-9999).
 *
 * THE VALUE (0x7a7590) of v a turn from T to the horizon: PV(v, H) - PV(v,
 * T) (0x7a16e0 twice, the GlobalAI's discount), where v sums the
 * building's Building_YieldChanges, each through the city's percent on the
 * yield (city +0xbc0) at the player's yield weight (0x7a6690); its great
 * person points at their class's pseudo-yield; the player's era index as a
 * whole number where it can be built now; for a building with outer
 * defences, 1 for a city of two districts or more, 2 for a capital, 1 for a
 * city with a wonder, population / 5 + 1, 2 at war, its OuterDefenseStrength;
 * per great work slot 0.35 a slot at the best of its objects' pseudo-yields;
 * all that times 1 + 2 x the depth of its first-prerequisite chain, less its
 * Maintenance as Gold. Then, already discounted, its modifiers' whole values
 * (0x7a4b20, `aiModifiers.ts`) over T to the horizon, the building's owner
 * the city.
 */
import { AI_BUILDINGS } from '../data/aiBuildTables';
import { AI_VALUE_HORIZON } from '../data/aiValue';
import { FX, FX_MIN, fdiv, fmul, fxConst, fxOf, presentValue, pseudoYieldValue, valueBetween, yieldValue, AI_RATE, type AiValueView } from './aiValue';
import { AMENITY_TIERS, amenityTier } from '../data/constants';
import { modifiersValue, type AiModifier } from './aiModifiers';

/** One Buildings row as the city build AI reads it (ai_tables.py) */
export interface AiBuildingRow {
  type: string;
  cost: number;
  maintenance: number;
  housing: number;
  entertainment: number;
  regionalRange: number;
  outerDefenseHitPoints: boolean;
  outerDefenseStrength: number;
  tech: string | null;
  civic: string | null;
  district: string | null;
  wonder: boolean;
  placement: boolean;
  maxPlayerInstances: number;
  maxWorldInstances: number;
  trait: string | null;
  replaces: string | null;
  /** Capital, EnabledByReligion, RequiresAdjacentRiver, the
   *  GovernmentTierRequirement's tier (0 none), MutuallyExclusiveBuildings */
  capital: boolean;
  religion: boolean;
  adjacentRiver: boolean;
  governmentTier: number;
  exclusive: readonly string[];
  yields: readonly (readonly [string, number])[];
  prereqs: readonly string[];
  greatWorks: readonly { n: number; pseudo: readonly (string | null)[] }[];
  gpp: readonly (readonly [string | null, number])[];
  copies: readonly (readonly [string, string])[];
  units: readonly string[];
  entertainmentWithPower: number;
  modifiers: readonly AiModifier[];
}

export const AI_BUILDING_INDEX: ReadonlyMap<string, number> = new Map(AI_BUILDINGS.map((b, i) => [b.type, i]));

/** What the city build AI reads of one city and its owner: the engine
 *  implements it per kind of city (a major's, a city-state's). Item keys are
 *  the install's types (BUILDING_MONUMENT, DISTRICT_CAMPUS). */
export interface CityBuildFacts {
  view: AiValueView;
  seat: number;
  /** the engine's id of the city (the modifiers' subject) */
  cityId: number;
  population: number;
  capital: boolean;
  /** its districts, the city centre counted */
  districtCount: number;
  hasWonder: boolean;
  atWar: boolean;
  /** the player's era index (player +0x1358 +0xf8) */
  era: number;
  /** the city's percent on a YieldType (city +0xbc0) */
  yieldPct(yieldType: string): number;
  /** the player's version of a building, or null where its civilization
   *  may not build it */
  version(building: string): string | null;
  hasBuilding(building: string): boolean;
  /** the city holds the district complete (one under construction is not
   *  held: runs/h1_duelv1124 Bologna t16 counts its Campus's turns) */
  hasDistrict(district: string): boolean;
  /** the government tier the player runs (0 with none) */
  governmentTier: number;
  /** the worship building the city's majority religion offers it, or null */
  worship: string | null;
  /** the city centre beside a river */
  riverside: boolean;
  /** what the city's own ground refuses (a Flood Barrier with no coastal
   *  lowland) */
  groundRefuses(building: string): boolean;
  /** the city's current production, an item type, or null with nothing in
   *  hand (city +0x2350) */
  current: string | null;
  /** turns to research a technology / complete a civic through the AI's
   *  analyses (0x7610e0 / 0x621920); 0 for none or one held */
  techTurns(tech: string | null): number;
  civicTurns(civic: string | null): number;
  /** the city's Amenity balance and yields, and those of the player's
   *  cities within a regional building's range */
  amenity: AmenityCity;
  regionalAmenities(range: number): readonly AmenityCity[];
  /** turns to build an item at the city's Production toward it */
  buildTurns(item: string): number;
}

const turnsOver = (f: CityBuildFacts, b: AiBuildingRow): number => Math.max(f.techTurns(b.tech), f.civicTurns(b.civic));

/** what CanConstruct (its test with the research waived) refuses outright:
 *  a building the city holds or one it excludes, a Capital-only row, a
 *  government building above the tier run, a worship building the city's
 *  religion does not offer, a riverside building away from a river, and
 *  what the city's ground refuses */
export function refused(f: CityBuildFacts, b: AiBuildingRow): boolean {
  if (f.hasBuilding(b.type) || b.exclusive.some((x) => f.hasBuilding(x))) return true;
  if (b.capital && !f.capital) return true;
  if (b.governmentTier > f.governmentTier) return true;
  if (b.religion && f.worship !== b.type) return true;
  if (b.adjacentRiver && !f.riverside) return true;
  return f.groundRefuses(b.type);
}

/** 0x5ce970's turns for a building at the city centre */
export function buildingTurns(f: CityBuildFacts, b: AiBuildingRow): number {
  let t = turnsOver(f, b);
  if (b.district && !f.hasDistrict(b.district)) {
    t += f.buildTurns(b.district);
    if (f.current !== b.district) t += 10;
  }
  t += f.buildTurns(b.type);
  if (f.current !== null && f.current !== b.type) t += 10;
  for (const p of b.prereqs) {
    if (f.hasBuilding(p)) continue;
    const row = AI_BUILDINGS[AI_BUILDING_INDEX.get(p)!];
    t += turnsOver(f, row) + f.buildTurns(p);
  }
  return t;
}

/** CanConstruct with its reasons all clear: the technology and the civic
 *  held, the district standing in the city, a prerequisite building held */
function constructibleNow(f: CityBuildFacts, b: AiBuildingRow): boolean {
  if (refused(f, b) || f.techTurns(b.tech) !== 0 || f.civicTurns(b.civic) !== 0) return false;
  if (b.district && !f.hasDistrict(b.district)) return false;
  return !b.prereqs.length || b.prereqs.some((p) => f.hasBuilding(p));
}

/** 0x7a7590's per-turn v of a building, before its PV */
export function buildingPerTurn(f: CityBuildFacts, b: AiBuildingRow): number {
  let v = 0;
  for (const [y, amt] of b.yields) {
    // the city's percent on the yield; the building's own (0x18e890) and
    // the second yields pass (0x18e570) are not read
    const city = fxConst(Math.fround(f.yieldPct(y) * Math.fround(0.01) + 1));
    v += yieldValue(f.view, f.seat, fmul(amt * FX, city), y);
  }
  if (constructibleNow(f, b)) v += f.era * FX;
  for (const [pseudo, pts] of b.gpp) if (pseudo) v += pseudoYieldValue(f.view, f.seat, pts * FX, pseudo);
  if (b.outerDefenseHitPoints) {
    let d = 0;
    if (f.districtCount >= 2) d += FX;
    if (f.capital) d += 2 * FX;
    if (f.hasWonder) d += FX;
    d += (Math.trunc(f.population / 5) + 1) * FX;
    if (f.atWar) d += 2 * FX;
    // the threat terms (CityBuildAI +0x1b8, x4 for a damaged own copy, x2
    // against a stronger enemy) are not read
    v += d;
  }
  v += b.outerDefenseStrength * FX;
  for (const g of b.greatWorks) {
    const amt = Math.trunc((g.n * FX * 0x2300) / 25600);
    let best = 0;
    for (const p of g.pseudo) if (p) best = Math.max(best, pseudoYieldValue(f.view, f.seat, amt, p));
    v += best;
  }
  let depth = 0;
  for (let r = b; r.prereqs.length; depth++) r = AI_BUILDINGS[AI_BUILDING_INDEX.get(r.prereqs[0])!];
  v = fmul(v, FX + depth * 2 * FX);
  v -= yieldValue(f.view, f.seat, b.maintenance * FX, 'YIELD_GOLD');
  return v;
}

/** A city as the Amenity value reads it: its Amenity balance (have less
 *  needed) and its yields */
export interface AmenityCity {
  balance: number;
  yields: Readonly<Record<string, number>>;
}

/** the happiness level's NonFoodYieldModifier (the Happinesses rows: the
 *  tier of the balance) */
const levelPct = (balance: number): number => Math.round((amenityTier(balance).yieldFactor - 1) * 100);

/** 0x79f7c0's turn: one Amenity more in the city — PSEUDOYIELD_HAPPINESS of
 *  1 where its happiness level holds; else of the levels it climbs, plus per
 *  yield but Food the level's NonFoodYieldModifier change on the city's
 *  yield at the player's weight, at least the Amenity's own 1 */
function amenityPerTurn(f: CityBuildFacts, c: AmenityCity): number {
  const before = AMENITY_TIERS.length - 1 - AMENITY_TIERS.indexOf(amenityTier(c.balance) as never);
  const after = AMENITY_TIERS.length - 1 - AMENITY_TIERS.indexOf(amenityTier(c.balance + 1) as never);
  if (before === after) return pseudoYieldValue(f.view, f.seat, FX, 'PSEUDOYIELD_HAPPINESS');
  let v = pseudoYieldValue(f.view, f.seat, (after - before) * FX, 'PSEUDOYIELD_HAPPINESS');
  const pb = levelPct(c.balance);
  const pa = levelPct(c.balance + 1);
  if (pb !== -100) {
    const ratio = fdiv((pa + 100) * FX, (pb + 100) * FX) - FX;
    for (const [y, amount] of Object.entries(c.yields)) {
      if (y !== 'YIELD_FOOD') v += yieldValue(f.view, f.seat, fmul(fxOf(amount), ratio), y);
    }
  }
  return Math.max(v, FX);
}

/** 0x7a7590: a building's value landing in `t` turns, to horizon `h` */
export function buildingValue(f: CityBuildFacts, b: AiBuildingRow, t: number, h = AI_VALUE_HORIZON): number {
  if (t >= h) return FX_MIN;
  const v = buildingPerTurn(f, b);
  let value = presentValue(v, AI_RATE, h) - presentValue(v, AI_RATE, t);
  // an Entertainment building's Amenity (0x79f7c0, valued as one Amenity
  // more whatever its Entertainment): this city's, or over the player's
  // cities in its RegionalRange, held to 50.0
  if (b.entertainment > 0) {
    const cities = b.regionalRange <= 1 ? [f.amenity] : f.regionalAmenities(b.regionalRange);
    let e = 0;
    for (const c of cities) e += valueBetween(amenityPerTurn(f, c), t, h);
    value += b.regionalRange <= 1 ? e : Math.min(e, 50 * FX);
  }
  value += modifiersValue({ view: f.view, seat: f.seat, start: t, horizon: h, rate: AI_RATE, owner: { cityId: f.cityId, capital: f.capital } },
    b.modifiers);
  return value;
}

/** THE BUILDINGS TABLE of the city centre (0x5ce970's building loop): a raw
 *  value per Buildings row in database order */
export function buildingTable(f: CityBuildFacts): number[] {
  return AI_BUILDINGS.map((b) => {
    if (b.wonder || b.placement) return FX_MIN;
    if (f.version(b.type) !== b.type || refused(f, b)) return FX_MIN;
    const t = buildingTurns(f, b);
    return t < 0 ? FX_MIN : buildingValue(f, b, t);
  });
}
