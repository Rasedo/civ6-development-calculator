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
import { AI_BUILDINGS, AI_DISTRICTS, AI_PROJECTS, AI_UNITS } from '../data/aiBuildTables';
import { AI_VALUE_HORIZON } from '../data/aiValue';
import { FX, FX_MIN, fdiv, fmul, fxConst, fxOf, presentValue, pseudoYieldValue, traderValue, valueBetween, yieldValue, AI_RATE, type AiValueView } from './aiValue';
import type { UnitProductionEntry } from './aiUnitProduction';
import type { CityStats } from './city';
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
  /** PurchaseYield YIELD_GOLD */
  goldPurchase: boolean;
  /** PurchaseYield YIELD_FAITH */
  faithPurchase: boolean;
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
  /** Buildings_XP2 BlocksCoastalFlooding (+0x48 bit 1) */
  blocksCoastalFlooding: boolean;
  /** Buildings_XP2 ResourceTypeConvertedToPower (+0x58), null none */
  convertsToPower: string | null;
  modifiers: readonly AiModifier[];
}

export const AI_BUILDING_INDEX: ReadonlyMap<string, number> = new Map(AI_BUILDINGS.map((b, i) => [b.type, i]));

/** One Features row as the city build AI reads it (ai_tables.py) */
export interface AiFeatureRow {
  type: string;
  removable: boolean;
  /** Features_XP2 ValidDistrictPlacement: a district stands on it unremoved */
  validDistrictPlacement: boolean;
  removeTech: string | null;
  appeal: number;
  /** Features.DangerValue: what the plot adds to the AI's danger map */
  danger: number;
  /** Feature_YieldChanges and Feature_Removes: [YieldType, amount] */
  yields: readonly (readonly [string, number])[];
  removes: readonly (readonly [string, number])[];
}

/** One Districts row as the city build AI reads it (ai_tables.py) */
export interface AiDistrictRow {
  type: string;
  tech: string | null;
  civic: string | null;
  trait: string | null;
  maintenance: number;
  housing: number;
  appeal: number;
  /** HitPoints, null where the row has none */
  hitPoints: number | null;
  /** MilitaryDomain, null for none */
  domain: string | null;
  coast: boolean;
  aqueduct: boolean;
  internalOnly: boolean;
  requiresPopulation: boolean;
  /** District_GreatPersonPoints: [the class's PseudoYieldType, points] */
  gpp: readonly (readonly [string | null, number])[];
  /** Districts_XP2's Canal and PreventsFloods */
  canal: boolean;
  preventsFloods: boolean;
  /** the projects whose PrereqDistrict it is, in the database's order */
  projects: readonly string[];
  /** the largest RegionalRange of its buildings, 0 none */
  regionalRange: number;
  /** AppealHousingChanges: [MinimumValue, AppealChange], the first the
   *  plot's Appeal reaches applies */
  appealHousing: readonly (readonly [number, number])[];
}

/** One Projects row as the project value reads it (ai_tables.py) */
export interface AiProjectRow {
  type: string;
  tech: string | null;
  civic: string | null;
  district: string | null;
  /** MaxPlayerInstances, -1 none */
  maxPlayerInstances: number;
  /** UnlocksFromEffect (Projects' or Projects_XP2's) */
  unlocksFromEffect: boolean;
  /** RequiredBuilding; the projects it needs (ProjectPrereqs) */
  requiredBuilding: string | null;
  prereqs: readonly string[];
  outerDefenseRepair: boolean;
  spaceRace: boolean;
  /** PrereqResource set (the project info's +0x148 reference, 0xa99160):
   *  the weapon projects the AI's values count, the nuclear and
   *  thermonuclear devices */
  prereqResource: boolean;
  /** the projects whose prerequisite it is (ProjectPrereqs) */
  unlocks: readonly string[];
  /** Project_GreatPersonPoints: [the class's PseudoYieldType, Points,
   *  PointProgressionParam1] */
  gpp: readonly (readonly [string | null, number, number])[];
  /** Projects_XP1's IdentityPerCitizenChange */
  identityPerCitizen: number;
  /** Projects_XP2's CreateBuilding; the buildings it consumes
   *  (Project_BuildingCosts) */
  createBuilding: string | null;
  consumes: readonly string[];
  /** ProjectCompletionModifiers */
  modifiers: readonly AiModifier[];
}

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
  /** a belief of the city's majority religion enables the unit
   *  (CanTrain's EnabledByReligion test, 0x172cdf..0x172f33) */
  beliefEnables(unit: string): boolean;
  /** the city follows a religion (city +0x1910, its majority religion) */
  followsReligion: boolean;
  hasBuilding(building: string): boolean;
  /** the city holds the building pillaged */
  buildingPillaged(building: string): boolean;
  /** the city holds the district complete (one under construction is not
   *  held: runs/h1_duelv1124 Bologna t16 counts its Campus's turns) */
  hasDistrict(district: string): boolean;
  /** the city's complete districts of the type are all pillaged (0x1ad720) */
  districtPillaged(district: string): boolean;
  /** the government tier the player runs (0 with none) */
  governmentTier: number;
  /** the worship building the city's majority religion offers it, or null */
  worship: string | null;
  /** the city centre beside a river */
  riverside: boolean;
  /** what the city's own ground refuses (a Flood Barrier with no coastal
   *  lowland) */
  groundRefuses(building: string): boolean;
  /** the city's coastal lowland plots the sea has not taken, and those of
   *  them holding a district (the XP2 terrain manager's list, 0xa39110) */
  coastalLowlands(): { plots: number; districts: number };
  /** the player's stock of the strategic resource less its reservations
   *  is above 0 (0x4ab6c0 -> 0x4aa790, ownership 0) */
  stocked(resource: string): boolean;
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
  /** the growth forecast (`growthForecast`, CityBuildAI +0x6c8) its city's
   *  full update computed, which the housing values read */
  forecast: readonly GrowthStep[];
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
  /** the player's cities (player +0x12f0 +0xc0), half of which 0x7b62c0
   *  adds to a combat unit stronger than the strongest melee strength the
   *  player has trained (runs/h1_duelv1121 t17 Hunza: its Heavy Chariot's
   *  Combat 28 over the city-state's 25, its table value 1.16 + 0.5, 7.35 as
   *  logged; its Spearman's 25 not, 2.87) */
  cities: number;
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
 *  a building the city holds whole (a pillaged one stands to be repaired:
 *  runs/h1_duelv1124 Granada t73-t78, its pillaged Lighthouse valued) or one
 *  it excludes, a Capital-only row, a
 *  government building above the tier run, a worship building the city's
 *  religion does not offer, a riverside building away from a river, and
 *  what the city's ground refuses */
export function refused(f: CityBuildFacts, b: AiBuildingRow): boolean {
  if ((f.hasBuilding(b.type) && !f.buildingPillaged(b.type)) || b.exclusive.some((x) => f.hasBuilding(x))) return true;
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

/** the three reasons the building value reads off CanConstruct
 *  (0x7a7f35..0x7a7f49: result +0x24 the PrereqTech, +0x14 the PrereqCivic,
 *  +0x18 the PrereqDistrict, cleared at 0x170951 by a complete one, pillaged
 *  or not) all clear; its prerequisite buildings (+0x1f8) are not among
 *  them (runs/h1_duelv1128 Nazca t65-99: its Temple takes the era with no
 *  Shrine and its Holy Site pillaged) */
export function reasonsClearNow(f: CityBuildFacts, b: AiBuildingRow): boolean {
  if (f.techTurns(b.tech) !== 0 || f.civicTurns(b.civic) !== 0) return false;
  return !b.district || f.hasDistrict(b.district);
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
  if (reasonsClearNow(f, b)) v += f.era * FX;
  for (const [pseudo, pts] of b.gpp) if (pseudo) v += pseudoYieldValue(f.view, f.seat, pts * FX, pseudo);
  if (b.outerDefenseHitPoints) {
    let d = 0;
    if (f.districtCount >= 2) d += FX;
    if (f.capital) d += 2 * FX;
    if (f.hasWonder) d += FX;
    d += (Math.trunc(f.population / 5) + 1) * FX;
    if (f.atWar) d += 2 * FX;
    // the threat terms (0x7a84c0..0x7a8758: +4.0 where a city of the player
    // is threatened, x4 for a damaged own copy, x2 against a stronger foe)
    // are not read
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

/** the city's Amenity view off its stats: CityBuildAI +0x1080's yields are
 *  each yield attribute's base, its modifier held to 0 (0x5cc510: the
 *  attribute's clamps set to [0, 0] before its second Value) — before the
 *  amenity tier's, the cards' and a city-state's -50% Production
 *  (runs/h1_duely1127 Hattusa t77, Unhappy at -3: Retainers logged 82, 80 on its base
 *  yields, 54 on its yields) */
export function amenityCityOf(stats: { amenities: CityStats['amenities']; baseYields: CityStats['baseYields'] }): AmenityCity {
  return {
    balance: stats.amenities.have - stats.amenities.needed,
    yields: {
      YIELD_FOOD: stats.baseYields.food, YIELD_PRODUCTION: stats.baseYields.production, YIELD_GOLD: stats.baseYields.gold,
      YIELD_SCIENCE: stats.baseYields.science, YIELD_CULTURE: stats.baseYields.culture, YIELD_FAITH: stats.baseYields.faith,
    },
  };
}

/** the happiness level's NonFoodYieldModifier (the Happinesses rows: the
 *  tier of the balance) */
const levelPct = (balance: number): number => Math.round((amenityTier(balance).yieldFactor - 1) * 100);

/** 0x79f7c0's turn: `n` Amenities more in the city — PSEUDOYIELD_HAPPINESS
 *  of `n` where its happiness level holds; else of the levels it climbs,
 *  plus per yield but Food the level's NonFoodYieldModifier change on the
 *  city's yield at the player's weight, at least the Amenities' own `n`. Its
 *  term of a negative balance (PSEUDOYIELD_GOLDENAGE_POINT of
 *  THRESHOLD_SHIFT_PER_MISSING_AMENITY x the balance) is 0: the parameter is
 *  0 (Expansion2_GlobalParameters.xml) */
export function amenityPerTurn(f: { view: CityBuildFacts['view'] | null; seat: number }, c: AmenityCity, n = 1): number {
  const before = AMENITY_TIERS.length - 1 - AMENITY_TIERS.indexOf(amenityTier(c.balance) as never);
  const after = AMENITY_TIERS.length - 1 - AMENITY_TIERS.indexOf(amenityTier(c.balance + n) as never);
  if (before === after) return pseudoYieldValue(f.view, f.seat, n * FX, 'PSEUDOYIELD_HAPPINESS');
  let v = pseudoYieldValue(f.view, f.seat, (after - before) * FX, 'PSEUDOYIELD_HAPPINESS');
  const pb = levelPct(c.balance);
  const pa = levelPct(c.balance + n);
  if (pb !== -100) {
    const ratio = fdiv((pa + 100) * FX, (pb + 100) * FX) - FX;
    for (const [y, amount] of Object.entries(c.yields)) {
      if (y !== 'YIELD_FOOD') v += yieldValue(f.view, f.seat, fmul(fxOf(amount), ratio), y);
    }
  }
  return Math.max(v, n * FX);
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
  } else if (b.regionalRange > 1 && b.convertsToPower && !f.stocked(b.convertsToPower)) {
    // a regional power plant whose fuel the player holds none of is worth
    // nothing so far (0x7a9089..0x7a909b: runs/h1_duelv1124, every Coal
    // Power Plant row of the city-states 0.00)
    value = 0;
  }
  // a building that blocks coastal flooding (0x7a92b6): 100.0 a coastal
  // lowland plot of the city's the sea has not taken, 1,500.0 a such plot
  // holding a district, after the PV; the whole value 0 with no such plot
  // (runs/h1_duelv1121 Hunza t208-220: the Flood Barrier 300.0 over the
  // rest on its three lowlands, Antioch 100.0 on its one)
  if (b.blocksCoastalFlooding) {
    const l = f.coastalLowlands();
    value = l.plots === 0 ? 0 : value + (l.districts * 15 + l.plots) * 100 * FX;
  }
  // its units (Unit_BuildingPrereqs) but an Archaeologist, each at its unit
  // value (`unitValue`; a unit whose value is not read counts its exits)
  for (const u of b.units) {
    if (u === 'UNIT_ARCHAEOLOGIST') continue;
    value += unitValue(f, AI_UNITS[AI_UNIT_INDEX.get(u)!], t, h) ?? unitValueExit(f, u, t, h) ?? 0;
  }
  if (b.housing > 0) value += housingValue(f.growth, f.forecast, b.housing, t, h);
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
  /** PurchaseYield YIELD_GOLD */
  goldPurchase: boolean;
  /** PurchaseYield YIELD_FAITH */
  faithPurchase: boolean;
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
  /** FormationClass FORMATION_CLASS_SUPPORT */
  support: boolean;
  /** TypeTags */
  tags: readonly string[];
  /** its active abilities' strength modifiers (UnitAbilityModifiers) */
  abilities: readonly AiModifier[];
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
  /** EnabledByReligion: trained only where a belief enables it */
  religion: boolean;
  religiousStrength: number;
  spreadCharges: number;
  healCharges: number;
  parkCharges: number;
  requiresInquisition: boolean;
  canTrain: boolean;
  /** Units_XP2 TourismBomb */
  tourismBomb: number;
  /** Units_XP2 TourismBombPossible */
  tourismBombPossible: boolean;
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
 *  obsolete to the player), plus half the player's cities (player +0x12f0
 *  +0xc0) where its Combat exceeds the strongest melee strength the player
 *  has trained (PlayerStats +0xf0, 0x4d9320); an explorer, settler or spy 1.0 plus the
 *  eras' points as PSEUDOYIELD_GOLDENAGE_POINT; a Trader its worth
 *  (`traderValue` with start and horizon both `t`: one turn's route value
 *  discounted to `t`) through PSEUDOYIELD_UNIT_TRADE; a religious unit
 *  (PSEUDOYIELD_UNIT_RELIGIOUS) its tourism bomb as PSEUDOYIELD_TOURISM — then
 *  x (the city's extra copies + 1) x the promotion class weight, 0 outright
 *  for a strategic resource the player cannot reach, through its
 *  pseudo-yield, less its Maintenance as Gold below handicap 3, paid from
 *  `t` to `h`. Null where a term it needs is not read (an Archaeologist, a
 *  WMD, an air unit, a unit with a Units_XP2 maintenance resource; a full
 *  civilization's religious or park-charged unit). */
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
    if (u.combat > f.view.bestCombatStrength(f.seat)) v += fxConst(f.cities * 0.5);
  } else if (pseudo === 'PSEUDOYIELD_UNIT_TRADE') {
    const tv = traderValue(f.view, f.seat, 0, t, t);
    if (tv === null) return null;
    v = pseudoYieldValue(f.view, f.seat, tv, pseudo);
  } else if (pseudo === 'PSEUDOYIELD_UNIT_EXPLORER' || pseudo === 'PSEUDOYIELD_UNIT_SETTLER' || pseudo === 'PSEUDOYIELD_UNIT_SPY') {
    // the eras' points (0x2c43b0) are not read: none for a player outside
    // the eras record (a city-state)
    if (f.fullCiv) return null;
    v = FX;
  } else if (pseudo === 'PSEUDOYIELD_UNIT_RELIGIOUS') {
    // its religious term (ReligiousStrength x 0.01 by its charges, x the
    // eras' points) counts only in a city of the player's own founded
    // religion (0x4681c0 +0x1c0, 0x7b67a4..0x7b68f5) — a city-state and the
    // Free Cities found none, so it is 0 (runs/h1_duelv1127: a minor's
    // Missionary 0.00 on its turns following religion 11). The culture
    // AI's park term (0x6239a0 x ParkCharges) reads 0 at these players
    // (every valid Naturalist row of the five verbose duels 0.00). Then
    // the tourism bomb, TourismBomb + 10 where TourismBombPossible
    // (Units_XP2 +0x28 / +0x48 bit 32, 0x7b6a3e), as PSEUDOYIELD_TOURISM
    // (runs/h1_duelv1121: every Rock Band row 10.0 a turn from T to H)
    if (f.fullCiv) return null;
    v = pseudoYieldValue(f.view, f.seat, (u.tourismBomb + (u.tourismBombPossible ? 10 : 0)) * FX, 'PSEUDOYIELD_TOURISM');
  } else {
    return null;
  }
  // a park-charged unit's own tourism (0x7b7456: the culture AI's park
  // term) reads 0 at a city-state and the Free Cities, as above
  if (u.wmd || u.maintenanceResource || (u.parkCharges > 0 && f.fullCiv)) return null;
  v = fmul(v, (f.extraCopies(u.type) + 1) * FX);
  v = fmul(v, f.promotionWeight(u.promotionClass));
  if (u.resource && !f.resourceAccess(u.resource)) return 0;
  v = pseudoYieldValue(f.view, f.seat, v, pseudo);
  // its Maintenance as Gold at the player's weight (0x7b72d1 passes the
  // player: runs/h1_duely1121 Antioch t151, the Field Cannon's 2.785 less
  // 5 Maintenance at its Economic AI's boosted Gold, below the game's Scout
  // at 0.0)
  if (f.handicap < 3) v -= yieldValue(f.view, f.seat, Math.max(0, u.maintenance) * FX, 'YIELD_GOLD');
  return presentValue(v, AI_RATE, h) - presentValue(v, AI_RATE, t);
}

/** THE UNITS TABLE of the city centre (0x5ce970's unit loop): a raw value per
 *  Units row in database order; null where the value is not read */
export function unitTable(f: CityBuildFacts): (number | null)[] {
  return AI_UNITS.map((u) => {
    // CanTrain (0x172820, its prerequisites skipped) refuses an
    // EnabledByReligion unit no belief of the city's majority religion
    // enables (runs/h1_duelv1128: every minor's Warrior Monk FX(-9999))
    if (u.religion && !f.beliefEnables(u.type)) return FX_MIN;
    // and, past its prerequisites, a unit of ReligiousStrength in a city
    // following no religion (0x172d88..0x172d9d: runs/h1_duelv1127 a
    // minor's Missionary, Apostle and Guru valued only on its turns
    // following one) and a RequiresInquisition unit for a player that has
    // launched no inquisition (0x172da3, 0x497a30) — a city-state and the
    // Free Cities launch none (every minor's Inquisitor FX(-9999))
    if (u.religiousStrength > 0 && !f.followsReligion) return FX_MIN;
    if (u.requiresInquisition) return FX_MIN;
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
  /** CanConstruct's reasons clear (its result aside): the building's
   *  district stands in the city and, where it has prerequisites, one of
   *  them is held unpillaged */
  reasonsClear(building: string): boolean;
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
 *  order on a tie; the defensive pick's project value 0. The building wins
 *  at least the unit's and the project's value, else the unit at least the
 *  project's, else the project; null where none is valued (the log's "NO
 *  BUILDS AT ALL" for a player that is not a full civilization). The
 *  contract in hand goes before it (`aiContracts.ts` `takesTurn`). */
export function defaultSpecialization(t: CityBuildTables, f: PickFacts): Pick | null {
  const { building, unit, project } = specializationBests(t, f);
  if (building.index >= 0 && building.value >= unit.value && building.value >= project.value) {
    return { kind: 'building', type: AI_BUILDINGS[building.index].type, value: building.value };
  }
  if (unit.index >= 0 && unit.value >= project.value) return { kind: 'unit', type: AI_UNITS[unit.index].type, value: unit.value };
  if (project.index >= 0) return { kind: 'project', type: AI_PROJECTS[project.index].type, value: project.value };
  return null;
}

/** the Default Specialization's three bests (0x5d0860, 0x5d2600, 0x5d1f10),
 *  each a database index (-1 none) and its value (FX(-9999) with none; the
 *  defensive pick values no project: 0) */
export function specializationBests(t: CityBuildTables, f: PickFacts): Record<'building' | 'unit' | 'project', { index: number; value: number }> {
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
  let pVal = f.defense ? 0 : FX_MIN;
  if (!f.defense) {
    AI_PROJECTS.forEach((p, k) => {
      if (f.canProduce(p.type) && t.projects[k] > pVal) {
        pVal = t.projects[k];
        pIdx = k;
      }
    });
  }
  return { building: { index: bIdx, value: bVal }, unit: { index: uIdx, value: uVal }, project: { index: pIdx, value: pVal } };
}

/** THE BUILDINGS TABLE of the city centre (0x5ce970's building loop): a raw
 *  value per Buildings row in database order, each 0x7a4d40's with no plot:
 *  the building value (0x7a7590) doubled where the city holds the building
 *  pillaged (0x18e9f0 and 0x18fe60, 0x7a5182..0x7a51d9 -> 0x7a5136;
 *  runs/h1_duelv1124 Granada t89 its pillaged Lighthouse 227.34 = 2 x
 *  113.67) — the same doubling for a held walls building under damaged
 *  walls never reaches the table, which refuses a held building */
function analysisBuildings(f: CityBuildFacts): number[] {
  return AI_BUILDINGS.map((b) => {
    if (b.wonder || b.placement) return FX_MIN;
    if (f.version(b.type) !== b.type || refused(f, b)) return FX_MIN;
    const t = buildingTurns(f, b);
    if (t < 0 || t >= AI_VALUE_HORIZON) return FX_MIN;
    const v = buildingValue(f, b, t);
    return f.hasBuilding(b.type) && f.buildingPillaged(b.type) ? fmul(v, 2 * FX) : v;
  });
}

/** each building's BuildingPrereqs dependents (Buildings +0x198: the rows
 *  whose PrereqBuilding it is), database order */
export const BUILDING_DEPENDENTS: readonly (readonly number[])[] = AI_BUILDINGS.map((b) =>
  AI_BUILDINGS.flatMap((d, i) => (d.prereqs.includes(b.type) ? [i] : [])));
const DISTRICT_ROW = new Map(AI_DISTRICTS.map((d, i) => [d.type, i] as const));

/** The centre's BUILDINGS table as the city update leaves it, and each
 *  district's buildings term (AI_DISTRICTS order) */
export interface CityBuildingsPass {
  buildings: number[];
  districts: number[];
}

/**
 * THE BUILDINGS' DEPENDENTS AND THE DISTRICTS' BUILDINGS (0x5cadc0, the
 * city update's pass after the plot analysis, before its log and events),
 * over the analysis's table in place, the Buildings in database order. A
 * building B with a positive value, its district not held complete and
 * unpillaged (0x1aea60 / 0x1ad720), adds that value into its PrereqDistrict's
 * term — unless the city holds one of its MutuallyExclusiveBuildings
 * (Buildings +0x1e0) or one of them comes earlier in the table, and unless
 * B is MustPurchase (+0x159 bit 4; no row of the layered install is). Then
 * a B that is no wonder takes into its slot each BuildingPrereqs dependent's
 * value (the player's version of it; one with none adds nothing) where that
 * is above 0, B's own value untested, as the table holds it then (one table:
 * an earlier dependent adds as the pass left it; runs/lb1_bv1128 Nazca t56: its Shrine's 27.18
 * + the Temple's 43.25 = 70.43, as the PLOT ANALYSIS LOG prints it).
 * `analysis`: the analysis's own table.
 */
export function buildingsPass(f: CityBuildFacts, analysis: readonly number[]): CityBuildingsPass {
  const buildings = [...analysis];
  const districts = AI_DISTRICTS.map(() => 0);
  AI_BUILDINGS.forEach((b, k) => {
    const d = b.district === null ? undefined : DISTRICT_ROW.get(b.district);
    if (d !== undefined && buildings[k] > 0
      && !b.exclusive.some((x) => f.hasBuilding(x) || (AI_BUILDING_INDEX.get(x) ?? Infinity) < k)
      && !(f.hasDistrict(b.district!) && !f.districtPillaged(b.district!))) districts[d] += buildings[k];
    if (b.wonder) return;
    for (const i of BUILDING_DEPENDENTS[k]) {
      const v = f.version(AI_BUILDINGS[i].type);
      const j = v === null ? undefined : AI_BUILDING_INDEX.get(v);
      if (j !== undefined && buildings[j] > 0) buildings[k] += buildings[j];
    }
  });
  return { buildings, districts };
}

/** `buildingsPass` over the city's analysis (0x5ce970's building loop) */
export function cityBuildingsPass(f: CityBuildFacts): CityBuildingsPass {
  return buildingsPass(f, analysisBuildings(f));
}

/** The centre's BUILDINGS table as the city update leaves it
 *  (`cityBuildingsPass`) */
export function buildingTable(f: CityBuildFacts): number[] {
  return cityBuildingsPass(f).buildings;
}
