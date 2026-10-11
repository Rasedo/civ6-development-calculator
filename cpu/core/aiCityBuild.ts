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
import { AI_BUILDINGS, AI_PROJECTS, AI_UNITS } from '../data/aiBuildTables';
import { AI_VALUE_HORIZON } from '../data/aiValue';
import { FX, FX_MIN, fdiv, fmul, fxConst, fxOf, presentValue, pseudoYieldValue, traderValue, valueBetween, yieldValue, AI_RATE, type AiValueView } from './aiValue';
import type { UnitProductionEntry } from './aiUnitProduction';
import { AMENITY_TIERS, amenityTier, growthFoodNeeded, housingGrowthFactor } from '../data/constants';
import { AI_YIELD_DEFAULT } from '../data/aiTables';
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
  defenseModifier: number;
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
  /** the player's version of a unit (player +0x12e8 +0x1c0), or null */
  unitVersion(unit: string): string | null;
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
  /** the city's growth as its forecast reads it */
  growth: CityGrowth;
  /** the player is CIVILIZATION_LEVEL_FULL_CIV (0x469db0) / _TRIBE (0x469ce0) */
  fullCiv: boolean;
  tribe: boolean;
  /** the player's units (its unit list's count, player +0x12e8 +0xc0) */
  unitCount: number;
  /** the military AI's unit production table (`aiUnitProduction.ts`) */
  unitProduction: ReadonlyMap<string, UnitProductionEntry>;
  /** the city trains units of the domain (0x17d660: a sea unit at a
   *  coastal city) */
  trainsDomain(domain: string): boolean;
  /** the count 0x7b62c0 adds half of to a combat unit stronger than the
   *  player's trade capacity (player +0x12f0 +0xc0; none at a city-state:
   *  runs/h1_duelv1124 Cardiff's Warrior reads its table value alone) */
  combatCount: number;
  /** the city's extra copies of a unit it trains (0x179dd0) */
  extraCopies(unit: string): number;
  /** the promotion class weight (0x723bb0), raw */
  promotionWeight(promotionClass: string | null): number;
  /** the player holds the strategic resource, or a city of its has it near
   *  (0x4aa790, 0x5d45c0) */
  resourceAccess(resource: string): boolean;
  /** the player's handicap index (player +0x908) */
  handicap: number;
}

/** 0x7b62c0's exits, A UNIT VALUED AT FX(-9999): at or past the horizon;
 *  not the player's version of it; a player that is neither a full
 *  civilization nor the barbarians, at peace and holding more than five
 *  units (runs/h1_duelv1124: a city-state's Shrine logs FX(-9999) plus its
 *  own value on 124 of the 127 turns it holds six units or more); a Spy for
 *  a player that is not a full civilization. Null where none applies (the
 *  value past them is not read here). */
export function unitValueExit(f: CityBuildFacts, unit: string, t: number, h = AI_VALUE_HORIZON): number | null {
  if (t >= h || f.unitVersion(unit) !== unit) return FX_MIN;
  if (!f.fullCiv && !f.tribe && !f.atWar && f.unitCount > 5) return FX_MIN;
  if (unit === 'UNIT_SPY' && !f.fullCiv) return FX_MIN;
  return null;
}

/** A city's growth (its growth object, city +0x1788): its Food surplus less
 *  its citizens' (raw, 0x1b5620), its housing (whole, 0x1b5840), the Food in
 *  store (raw, +0x80) and its overall growth multiplier (raw, 0x1b62d0) */
export interface CityGrowth {
  surplus: number;
  housing: number;
  population: number;
  stored: number;
  multiplier: number;
}

/** one step of the growth forecast: from `turn` the city holds `pop`
 *  citizens and its housing withholds `lost` Food a turn (raw) */
export interface GrowthStep {
  turn: number;
  lost: number;
  pop: number;
}

/** the turns the growth forecast runs to (CityBuildAI +0x6c0) */
const FORECAST_TURNS = 100;

/** 0x527ca0: the growth factor of the housing left, raw */
const housingFactor = (left: number): number => fxConst(housingGrowthFactor(left));

/** the Food the housing factor `f` withholds of `surplus` (both raw) */
const withheld = (surplus: number, f: number): number => Math.floor((-surplus * (f - FX)) / FX);

/** 0x1b6390: the turns to the next citizen — the Food the threshold still
 *  needs over the surplus times the growth multiplier, rounded up; -1 with
 *  no surplus */
function turnsToGrow(g: CityGrowth): number {
  if (g.surplus <= 0) return -1;
  const eff = fmul(g.surplus, g.multiplier);
  if (eff <= 0) return -1;
  const q = Math.trunc(((growthFoodNeeded(g.population) * FX - g.stored) * FX) / eff);
  return (q >> 8) + ((q & 0xff) !== 0 ? 1 : 0);
}

/** 0x5cb570, THE GROWTH FORECAST (CityBuildAI +0x6c8 / +0x738 / +0x7a8):
 *  each turn ahead where the housing factor changes, the citizens then and
 *  the Food the housing withholds — the surplus falling 2 a citizen, each
 *  next citizen at its whole turns past the last, to 100 turns */
export function growthForecast(g: CityGrowth): GrowthStep[] {
  const out: GrowthStep[] = [];
  let s = g.surplus;
  let factor = housingFactor(g.housing - g.population);
  if (factor !== FX) out.push({ turn: 0, lost: withheld(s, factor), pop: g.population });
  let turn = turnsToGrow(g);
  for (let pop = g.population + 1; turn < FORECAST_TURNS; pop++) {
    const f = housingFactor(g.housing - pop);
    if (f !== factor) {
      factor = f;
      out.push({ turn, lost: withheld(s, factor), pop });
    }
    const eff = Math.floor((factor * s) / FX);
    if (eff <= 0) break;
    turn += Math.trunc((growthFoodNeeded(pop) * FX * FX) / eff) >> 8;
    s = Math.max(s - 2 * FX, 0);
  }
  return out;
}

/** 0x7a3d70: `housing` more in the city from turn `t` to the horizon — over
 *  each step of the forecast, twice the Food (at its DefaultValue) the
 *  housing factor stops withholding, discounted over the step */
export function housingValue(g: CityGrowth, forecast: readonly GrowthStep[], housing: number, t: number, h: number): number {
  const s = g.surplus;
  const food = fxConst(AI_YIELD_DEFAULT.YIELD_FOOD ?? 1);
  const next = (after: number): GrowthStep | undefined => forecast.find((e) => e.turn > after);
  const amount = (c: { pop: number; lost: number }): number =>
    2 * fmul(withheld(-s, housingFactor(g.housing - c.pop + housing)) + c.lost, food);
  let cur = { pop: g.population, lost: withheld(s, housingFactor(g.housing - g.population)) };
  let fetched = cur.lost;
  let start = -1;
  let e = next(start);
  while (e && e.turn < t) {
    cur = e;
    start = e.turn;
    fetched = e.lost;
    e = next(start);
  }
  e = next(start);
  if (e) fetched = e.lost;
  let value = 0;
  while (e && start < h) {
    const a = amount(cur);
    value += presentValue(a, AI_RATE, Math.min(h, e.turn)) - presentValue(a, AI_RATE, Math.max(t, start));
    start = e.turn;
    cur = e;
    e = next(start);
    if (e) fetched = e.lost;
  }
  if (fetched > 0) {
    const a = amount(cur);
    value += presentValue(a, AI_RATE, h) - presentValue(a, AI_RATE, Math.max(t, start));
  }
  return value;
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
export function constructibleNow(f: CityBuildFacts, b: AiBuildingRow): boolean {
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
  // its units (Unit_BuildingPrereqs) but an Archaeologist, each at its unit
  // value (`unitValue`; a unit whose value is not read counts its exits)
  for (const u of b.units) {
    if (u === 'UNIT_ARCHAEOLOGIST') continue;
    value += unitValue(f, AI_UNITS[AI_UNIT_INDEX.get(u)!], t, h) ?? unitValueExit(f, u, t, h) ?? 0;
  }
  if (b.housing > 0) value += housingValue(f.growth, growthForecast(f.growth), b.housing, t, h);
  value += modifiersValue({ view: f.view, seat: f.seat, start: t, horizon: h, rate: AI_RATE, owner: { cityId: f.cityId, capital: f.capital } },
    b.modifiers);
  return value;
}

/** One Units row as the unit value and the Default Specialization pick read
 *  it (ai_tables.py) */
export interface AiUnitRow {
  type: string;
  foundCity: boolean;
  buildCharges: number;
  mustPurchase: boolean;
  combat: number;
  /** TypeTags CLASS_RECON */
  recon: boolean;
  rangedCombat: number;
  bombard: number;
  antiAir: number;
  range: number;
  moves: number;
  maintenance: number;
  cost: number;
  domain: string;
  /** FormationClass FORMATION_CLASS_CIVILIAN */
  civilian: boolean;
  pseudo: string | null;
  promotionClass: string | null;
  /** StrategicResource */
  resource: string | null;
  trait: string | null;
  tech: string | null;
  civic: string | null;
  district: string | null;
  /** the Mandatory / plain ObsoleteCivic and ObsoleteTech */
  obsolete: readonly string[];
  /** Unit_BuildingPrereqs */
  buildings: readonly string[];
  spy: boolean;
  wmd: boolean;
  religiousStrength: number;
  spreadCharges: number;
  healCharges: number;
  parkCharges: number;
  canTrain: boolean;
  /** Units_XP2 */
  majorOnly: boolean;
  maintenanceResource: string | null;
  maintenanceResourceAmount: number;
  resourceCost: number;
}

export const AI_UNIT_INDEX: ReadonlyMap<string, number> = new Map(AI_UNITS.map((u, i) => [u.type, i]));

const COMBAT_PSEUDO = new Set(['PSEUDOYIELD_UNIT_COMBAT', 'PSEUDOYIELD_UNIT_NAVAL_COMBAT', 'PSEUDOYIELD_UNIT_AIR_COMBAT']);

/** 0x5ce970's turns for a unit: the longer of the turns to its technology
 *  and to its civic, the turns to train it, +10 while the city produces
 *  something else */
export function unitTurns(f: CityBuildFacts, u: AiUnitRow): number {
  let t = Math.max(u.tech ? f.techTurns(u.tech) + 5 : 0, u.civic ? f.civicTurns(u.civic) + 5 : 0);
  if (!u.mustPurchase) t += f.buildTurns(u.type);
  if (!u.mustPurchase && f.current !== null && f.current !== u.type) t += 10;
  return t;
}

/** 0x7b62c0, A UNIT'S VALUE landing in `t` turns, to horizon `h`: past the
 *  exits (`unitValueExit`, a domain the city cannot train) by its
 *  pseudo-yield — a combat unit (PSEUDOYIELD_UNIT_COMBAT, the default, or a
 *  naval or air one) the military AI's table value (x3 for an entry
 *  obsolete to the player), plus half the count player +0x12f0 +0xc0 holds where its Combat exceeds the
 *  player's trade route capacity; an explorer, settler or spy 1.0 plus the
 *  eras' points as PSEUDOYIELD_GOLDENAGE_POINT; a Trader its worth
 *  (`traderValue`) through PSEUDOYIELD_UNIT_TRADE — then x (the city's extra
 *  copies + 1) x the promotion class weight, 0 outright for a strategic
 *  resource the player cannot reach, through its pseudo-yield, less its
 *  Maintenance as Gold below handicap 3, paid from `t` to `h`. Null where a
 *  term it needs is not read (a religious unit, an Archaeologist, a WMD,
 *  an air unit, a unit with a Units_XP2 maintenance resource, ParkCharges). */
export function unitValue(f: CityBuildFacts, u: AiUnitRow, t: number, h = AI_VALUE_HORIZON): number | null {
  const exit = unitValueExit(f, u.type, t, h);
  if (exit !== null) return exit;
  if (!f.trainsDomain(u.domain)) return FX_MIN;
  const pseudo = u.pseudo ?? 'PSEUDOYIELD_UNIT_COMBAT';
  let v = 0;
  if (COMBAT_PSEUDO.has(pseudo)) {
    if (pseudo === 'PSEUDOYIELD_UNIT_AIR_COMBAT') return null;
    const e = f.unitProduction.get(u.type);
    v = e?.value ?? 0;
    if (e?.obsolete) v = fmul(v, 3 * FX);
    if (u.combat > f.view.tradeRouteCapacity(f.seat)) v += fxConst(f.combatCount * 0.5);
  } else if (pseudo === 'PSEUDOYIELD_UNIT_TRADE') {
    const tv = traderValue(f.view, f.seat, 0, t, h);
    if (tv === null) return null;
    v = pseudoYieldValue(f.view, f.seat, tv, pseudo);
  } else if (pseudo === 'PSEUDOYIELD_UNIT_EXPLORER' || pseudo === 'PSEUDOYIELD_UNIT_SETTLER' || pseudo === 'PSEUDOYIELD_UNIT_SPY') {
    // the eras' points (0x2c43b0) are not read: none for a player outside
    // the eras record (a city-state)
    if (f.fullCiv) return null;
    v = FX;
  } else {
    return null;
  }
  if (u.wmd || u.maintenanceResource || u.parkCharges > 0) return null;
  v = fmul(v, (f.extraCopies(u.type) + 1) * FX);
  v = fmul(v, f.promotionWeight(u.promotionClass));
  if (u.resource && !f.resourceAccess(u.resource)) return 0;
  v = pseudoYieldValue(f.view, f.seat, v, pseudo);
  if (f.handicap < 3) v -= yieldValue(null, null, Math.max(0, u.maintenance) * FX, 'YIELD_GOLD');
  return presentValue(v, AI_RATE, h) - presentValue(v, AI_RATE, t);
}

/** THE UNITS TABLE of the city centre (0x5ce970's unit loop): a raw value per
 *  Units row in database order; null where the value is not read */
export function unitTable(f: CityBuildFacts): (number | null)[] {
  return AI_UNITS.map((u) => {
    const t = unitTurns(f, u);
    return t < 0 ? FX_MIN : unitValue(f, u, t);
  });
}

/** The city centre's value tables (raw, database order) */
export interface CityBuildTables {
  buildings: readonly number[];
  units: readonly number[];
  projects: readonly number[];
}

/** What the Default Specialization pick reads of the city beside its tables */
export interface PickFacts {
  /** the building in the city's queue or held (0x17e690 > 0) */
  buildingHeld(building: string): boolean;
  /** CanConstruct (0x170450) with its reasons clear */
  canConstruct(building: string): boolean;
  /** CanTrain (0x172820) */
  canTrain(unit: string): boolean;
  /** the project the city may produce (0x179650) */
  canProduce(project: string): boolean;
  /** the city's favoured-items verdict on a building (CityBuildAI +0x528,
   *  0x5d2d10): 1 favoured, -1 disfavoured, 0 neither */
  favored(building: string): -1 | 0 | 1;
  /** the defensive pick: the military AI's +0x4b8, or the city's threat
   *  (CityBuildAI +0x1b8 above -1) with its centre's district property or
   *  CityBuildAI +0x218 */
  defense: boolean;
}

export interface Pick {
  kind: 'building' | 'unit' | 'project';
  type: string;
  value: number;
}

/** 0x5d4d70, THE DEFAULT SPECIALIZATION PICK over the city centre's tables:
 *  the best building (0x5d0860: not held, constructible, its value halved
 *  where disfavoured and doubled where favoured; in the defensive pick only
 *  one with a DefenseModifier or OuterDefenseStrength), the best unit
 *  (0x5d2600: no FoundCity, no BuildCharges, trainable, not MustPurchase; in
 *  the defensive pick only a combat unit that is not CLASS_RECON) and, but
 *  in the defensive pick, the best project (0x5d1f10) — each best starting
 *  at FX(-9999) and taking a strictly higher value, the first in database
 *  order on a tie. The building wins at least the unit's and the project's
 *  value, else the unit at least the project's, else the project; null
 *  where none is valued (the log's "NO BUILDS AT ALL" for a player that is
 *  not a full civilization). */
export function defaultSpecialization(t: CityBuildTables, f: PickFacts): Pick | null {
  let bIdx = -1;
  let bVal = FX_MIN;
  AI_BUILDINGS.forEach((b, k) => {
    if (f.buildingHeld(b.type)) return;
    if (f.defense && !(b.defenseModifier > 0 || b.outerDefenseStrength > 0)) return;
    if (!f.canConstruct(b.type)) return;
    let v = t.buildings[k];
    const fav = f.favored(b.type);
    if (fav === -1) v = fmul(v, fxConst(0.5));
    else if (fav === 1) v = fmul(v, 2 * FX);
    if (v > bVal) {
      bVal = v;
      bIdx = k;
    }
  });
  let uIdx = -1;
  let uVal = FX_MIN;
  AI_UNITS.forEach((u, k) => {
    if (u.foundCity || u.buildCharges > 0) return;
    if (!f.canTrain(u.type) || u.mustPurchase) return;
    if (f.defense && (u.combat === 0 || u.recon)) return;
    if (t.units[k] > uVal) {
      uVal = t.units[k];
      uIdx = k;
    }
  });
  let pIdx = -1;
  let pVal = FX_MIN;
  if (!f.defense) {
    AI_PROJECTS.forEach((p, k) => {
      if (f.canProduce(p) && t.projects[k] > pVal) {
        pVal = t.projects[k];
        pIdx = k;
      }
    });
  }
  if (bIdx >= 0 && bVal >= uVal && bVal >= pVal) return { kind: 'building', type: AI_BUILDINGS[bIdx].type, value: bVal };
  if (uIdx >= 0 && uVal >= pVal) return { kind: 'unit', type: AI_UNITS[uIdx].type, value: uVal };
  if (pIdx >= 0) return { kind: 'project', type: AI_PROJECTS[pIdx], value: pVal };
  return null;
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
