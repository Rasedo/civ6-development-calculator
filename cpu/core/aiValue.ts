/**
 * THE AI'S VALUE ARITHMETIC (GameCore_XP2 AI/Value_Manager.cpp;
 * `tools/civ6lab/dll_readings.md` "H-1: the research AI", "H-1: the civics
 * AI"): the DLL's 24.8 fixed point, the present value of a yield paid each
 * turn (0x7a16e0), a yield discounted some turns (0x7a1240), and what a
 * yield a turn is worth from the turn a row lands to the value horizon — the
 * research AI's and the civics AI's every term — and a yield's and a
 * pseudo-yield's value to a player (0x7a6690, 0x7a60d0) over the view every
 * AI party's value reads (`AiValueView`). The yield weight is `aiWeights.ts`,
 * the modifier evaluator `aiModifiers.ts`; every AI party (the city-states'
 * and the Free Cities' research, civics and city builds) values through these.
 */
import { AI_DISCOUNT_PCT, AI_VALUE_HORIZON } from '../data/aiValue';
import { AI_PSEUDOYIELD_DEFAULT, AI_YIELD_DEFAULT } from '../data/aiTables';

/** one in 24.8 fixed point */
export const FX = 256;
/** FX(-9999): the AI's "never" (the data word at 0xf04cb0) */
export const FX_MIN = -9999 * FX;

/** a float constant as the DLL converts it: the floor as the integer part,
 *  the fraction's top 8 bits below it */
export function fxConst(c: number): number {
  const fl = Math.floor(c);
  return fl * FX + Math.trunc((c - fl) * FX);
}

/** a value already in fixed point's units, rounded to the nearest raw step */
export function fxOf(x: number): number {
  return Math.round(x * FX);
}

/** the product of two raws (an arithmetic shift: floor) */
export function fmul(a: number, b: number): number {
  return Math.floor((a * b) / FX);
}

/** the quotient of two raws (truncated) */
export function fdiv(a: number, b: number): number {
  return Math.trunc((a * FX) / b);
}

/** a raw times a raw over 100 (the DLL's magic-number divide, truncated) */
function fpct(a: number, b: number): number {
  return Math.trunc((a * b) / (FX * 100));
}

const HALF = fxConst(0.5);
const SIXTH = fxConst(0.16667);
const NEG_SIXTH = fxConst(-0.16667);
const CENT = fxConst(0.01);
const TEN = fxConst(10);

/** 0x7a16e0: the present value of `a` paid each turn for `n` turns at `r`
 *  percent — a(D-1)/(kD), D the cubic expansion of (1+k)^n */
export function presentValue(a: number, r: number, n: number): number {
  if (n === 0) return a;
  if (n < 0) return 0;
  if (r === 0) return fmul(a, n * FX);
  if (r >= 0x3200 || fmul(fmul(r, n * FX), CENT) >= TEN) return fdiv(a, fmul(r, CENT));
  n = Math.min(n, 400);
  const nk = fpct(n * FX, r);
  const nk2 = fpct(r, nk);
  const n2k2 = fmul(nk2, (n - 1) * FX);
  const n2k3 = fpct(r, n2k2);
  const n3k3 = fmul(n2k3, (n - 2) * FX);
  const dm1 = fmul(HALF, n2k2) + fmul(SIXTH, n3k3) + nk;
  const d = dm1 + FX;
  if (d < FX) return 0;
  return fdiv(fmul(dm1, a), Math.max(fpct(r, d), CENT));
}

/** 0x7a1240: `a` discounted `n` turns at `r` percent — a(1-k)^n by the
 *  cubic expansion */
export function discounted(a: number, r: number, n: number): number {
  if (n === 0) return a;
  if (n < 0) return 0;
  const nk = fmul(fmul(r, n * FX), CENT);
  const n2k2 = fmul(fmul(fmul(nk, r), (n - 1) * FX), CENT);
  const n3k3 = fmul(fmul(fmul(n2k2, r), (n - 2) * FX), CENT);
  const e = Math.max(0, fmul(HALF, n2k2) + fmul(NEG_SIXTH, n3k3) - nk + FX);
  return e > FX ? 0 : fmul(a, e);
}

/** the GlobalAI's discount rate (+0x290), raw percent */
export const AI_RATE = fxConst(AI_DISCOUNT_PCT);

/** 0x7a2140: a yield `a` a turn from turn `from` to turn `to` — PV(to) -
 *  PV(from), one discounted turn where the two meet */
export function valueBetween(a: number, from: number, to: number, r = AI_RATE): number {
  if (from === to) return discounted(a, r, from);
  return presentValue(a, r, to) - presentValue(a, r, from);
}

/** the game era the research and civic values count rows of an earlier era
 *  against: the player's eras record's (PlayerEras m_eGameEra, player
 *  +0x1358 +0x158), the era before through the players' starts of the turn
 *  a new one begins (`endTurn` runs them before the counter moves; the
 *  research prices of those starts read the new era) — runs/h1_duelw1121
 *  t30 and t60: every major's, city-state's and the Free Cities' rows as
 *  the era before, the new era's the turn after */
export function aiGameEra(state: { gameEra?: number; eraStartTurn?: number; turn: number }): number {
  const era = state.gameEra ?? 0;
  return era > 0 && state.turn + 1 === state.eraStartTurn ? era - 1 : era;
}

/** what a yield `a` a turn is worth from the turn a row `turns` away lands
 *  to the tree values' horizon */
export function fromLanding(a: number, turns: number): number {
  return valueBetween(a, turns, AI_VALUE_HORIZON);
}

/** 0x7a60d0: a pseudo-yield's worth, `amount` of it at its DefaultValue
 *  `def` times the player's factor 1 + `w` (its pseudo-yield weight, raw) */
export function pseudoYield(def: number, amount: number, w: number): number {
  return fmul(amount, fmul(FX + w, fxConst(def)));
}

/** the whole part of a raw, as the analyzers add it (`sar 8`) */
export const whole = (v: number): number => v >> 8;

/** one AiLists row a trait or a strategy carries (System Yields,
 *  YieldSensitivities or PseudoYields), with its difficulty bounds */
export interface AiListRef {
  list: string;
  system: string;
  minDifficulty?: string | null;
  maxDifficulty?: string | null;
}

/** one AiFavoredItems row */
export interface AiListItem {
  item: string;
  value: number;
  favored: boolean;
  minDifficulty?: string | null;
  maxDifficulty?: string | null;
}

/** A city as the AI's value reads it */
export interface AiCityView {
  /** the engine's city id */
  id: number;
  capital: boolean;
}

/**
 * THE STATE AS THE AI'S VALUE READS IT, in the game's type names: what the
 * modifier analyzers and the yield value take from a player. The engine
 * implements it (cpu/core/aiView.ts); the AI view (`AiView`) extends it.
 */
export interface AiValueView {
  /** the game speed's CostMultiplier, a percent */
  readonly costMultiplierPct: number;
  /** the city-states the game holds */
  readonly cityStates: number;
  /** the government the seat is in, null in Anarchy */
  government(seat: number): string | null;
  cities(seat: number): readonly AiCityView[];
  /** a city's yield of a YieldType as the city totals it (City::GetYield) */
  cityYield(seat: number, cityId: number, yieldType: string): number;
  /** the seat's yield weight w (0x702ad0), raw (`aiWeights.ts`) */
  yieldWeight(seat: number, yieldType: string): number;
  /** the seat's pseudo-yield weight w (0x700810), raw (`aiWeights.ts`) */
  pseudoYieldWeight(seat: number, pseudo: string): number;
  /** the seat's districts, built or building (the PLAYER_DISTRICTS collection:
   *  runs/h1_duelw1124 player 1 values a Campus under construction at t54) */
  districts(seat: number): readonly AiDistrictView[];
  /** a district's yield of a YieldType as the district totals it (0x24b5a0:
   *  its own yields with its modifiers, and its buildings') */
  districtYield(seat: number, cityId: number, district: string, yieldType: string): number;
  /** a city has the building (City_Buildings 0x18e9f0) */
  cityHasBuilding(seat: number, cityId: number, building: string): boolean;
  /** a city has a district of the type, built or building (0x1ae530) */
  cityHasDistrict(seat: number, cityId: number, district: string): boolean;
  /** a city's religion (City +0x1910: the religion its majority follows),
   *  -1 for none */
  cityReligion(seat: number, cityId: number): number;
  /** the religion the seat founded (its seat stands for it), null for none */
  religionFounded(seat: number): number | null;
  /** the plots within `radius` of a plot, the plot included */
  plotsWithin(plot: number, radius: number): readonly number[];
  /** a plot's TerrainType (hills and mountains their own types) and
   *  FeatureType */
  plotTerrain(plot: number): string;
  plotFeature(plot: number): string | null;
  /** the plots an AI hex walk of `radius` visits when it takes a plot's
   *  offset coordinates (+0x158, +0x15c) as axial ones (0x6c7690 and its
   *  kin): those on the map within `radius` of column x + floor(y / 2) of the
   *  row, that column on the map or not */
  plotsWithinReadAsAxial(plot: number, radius: number): readonly number[];
  /** a city's districts, built or building, its centre's included
   *  (DistrictTypes) */
  cityDistricts(seat: number, cityId: number): readonly string[];
  /** a city's centre plot */
  cityPlot(seat: number, cityId: number): number;
  /** the plot of a city's district of the type, built or building
   *  (0x1ae530), null for none */
  districtPlot(seat: number, cityId: number, district: string): number | null;
  /** a city's Food surplus less its citizens' (its growth object's
   *  0x1b5620), raw */
  cityFoodSurplus(seat: number, cityId: number): number;
  /** the seat's era (player +0x1358): the latest era of a technology or a
   *  civic it holds, an index into AI_ERAS */
  playerEra(seat: number): number;
  /** the Production a unit costs the seat now (its unit manager's current
   *  cost, 0x4f2b20), whole */
  unitCost(seat: number, unitType: string): number;
  /** the seat's cost of its next district of a DistrictType (0x4088a0) */
  districtCost(seat: number, district: string): number;
  /** the seat's stock of a strategic ResourceType less its reservations
   *  (0x4aa790, ownership 0) */
  resourceStockFree(seat: number, resource: string): number;
  /** the resource value (0x7a21e0) of `count` more of a ResourceType to the
   *  seat from `t` to `h`, raw; a city-state's (`minorResourceFacts`), 0
   *  for a seat whose resource facts are not ported */
  resourceValueOf(seat: number, resource: string, count: number, t: number, h: number): number;
  /** the copies of a BuildingType standing in the world (0x1e7b70) */
  buildingsBuilt(building: string): number;
  /** the barbarian camps on plots the seat has revealed, in plot order */
  barbarianCamps(seat: number): readonly number[];
  /** the buildings of a district type in the seat's version (its
   *  civilization's unique building in place of the one it replaces), in
   *  table order, each with its Building_YieldChanges amount of the yield */
  districtBuildingYields(seat: number, district: string, yieldType: string): readonly { building: string; amount: number }[];
  /** the seat's trade route capacity (PlayerTrade +0xf0) */
  tradeRouteCapacity(seat: number): number;
  /** the seat's civilization level is a full civilization's
   *  (CIVILIZATION_LEVEL_FULL_CIV: CanEarnGreatPeople and CanGiveInfluence,
   *  which a city-state's and the Free Cities' levels lack) */
  fullCiv(seat: number): boolean;
  /** the seat's best combat strength (PlayerStats +0xf0, 0x4d9320: the
   *  strongest melee strength it has trained, m_iMaxMeleeStrengthTrained) */
  bestCombatStrength(seat: number): number;
  /** the envoys the seat has placed (0x44a440) */
  influenceTokensUsed(seat: number): number;
  /** the city-states the seat is suzerain of (0x44a5a0) */
  tributaries(seat: number): number;
  /** the city-states the game holds (its minor list, game +0x3f8 +0x1650) */
  cityStateCount(): number;
  /** each of the seat's units' Units.Maintenance */
  unitMaintenances(seat: number): readonly number[];
  /** per unit of the seat whose upgrade its research unlocks (0x58fff0, the
   *  visible test), the upgrade's Gold (0x590520) */
  unitUpgradeGolds(seat: number): readonly number[];
  /** the seat's Influence Points a turn (Player_Influence 0x44c6a0) */
  influencePointsPerTurn(seat: number): number;
  /** the seat's treasury (Player_Treasury +0xf8) and its gross Gold a turn
   *  (0x4e0bf0: its cities' Gold before their buildings' Maintenance) */
  treasury(seat: number): number;
  grossGoldYield(seat: number): number;
  /** a unit at the head of the city's build queue (0x179860 on city +0x2170) */
  cityTrainingUnit(seat: number, cityId: number): boolean;
  /** the seat's units in its list's order, their plot, UnitType, whole
   *  Movement (0x56e130) and level (the unit's experience +0x1bc0, its +0x10) */
  playerUnits(seat: number): readonly { plot: number; type: string; moves: number; level: number }[];
  /** the military AI's unit production value of a UnitType (0x79ca90: its
   *  table entry's +0x160, 0 none) */
  unitProductionValue(seat: number, unitType: string): number;
  /** 0x5eb0f0 with no region: over `holder`'s knowledge base's records of
   *  `player`'s units of age at most `maxAge` whose plot lies in the area of
   *  `plot` or in no region, each unit's max(Combat, RangedCombat) summed */
  knownStrength(holder: number, player: number, plot: number, maxAge: number): number;
  /** the game's barbarian players (0x483b50 +0x29f0) */
  barbarianSeats(): readonly number[];
  /** the seat's strongest unit of a PromotionClass (PlayerStats 0x4bcd30):
   *  in the Units' order its own version, not MustPurchase, its PrereqTech
   *  and PrereqCivic held, the last of the greatest max(Combat,
   *  RangedCombat); null none */
  bestUnitOfClass(seat: number, promotionClass: string): string | null;
  /** the plots the city owns within its three rings (the
   *  COLLECTION_CITY_PLOT_YIELDS walk, 0x69feb0) */
  cityOwnedPlots(seat: number, cityId: number): readonly AiPlotView[];
  /** the seat's trade units (Units +0x1b9 bit 6) */
  traders(seat: number): number;
  /** the trade AI's expected route value (the knowledge base's +0x6d8,
   *  AI_Knowledge.csv's TRADE VAL), raw; null where it is not read */
  tradeKnowledge(seat: number): number | null;
  atWar(seat: number, other: number): boolean;
  /** the envoys `seat` holds in a city-state (its tokens received from it,
   *  0x44c860) */
  envoys(cityState: number, seat: number): number;
  /** a city-state's CivilizationType */
  minorCivilization(cityState: number): string | null;
  /** a city's citizens (City +0x588) */
  cityCitizens(seat: number, cityId: number): number;
  /** a city's finished specialty districts, pillaged or not (0x1ae8f0) */
  citySpecialtyDistricts(seat: number, cityId: number): number;
  /** a city's centre strikes (0x249ee0 above 0: its walls stand) */
  cityStrikes(seat: number, cityId: number): boolean;
  /** a city centre's outer defence stands (0x24b290 on 0x6da56a3d above its
   *  damage, district +0x8d8): its walls' pool above 0 */
  cityOuterStands(seat: number, cityId: number): boolean;
  /** a city centre's strike strength (0x249ee0), its whole part */
  cityStrike(seat: number, cityId: number): number;
  /** the turns a city builds a UnitType, BuildingType or DistrictType in
   *  (0x17bb40, 0x17b1e0, 0x17b5a0) at its Production times 1 + its percent
   *  toward the item + `extra` raw (24.8); with `scale` (0x17b5a0's production
   *  multiplier) the Production times `extra` where it is not 0 */
  cityItemTurns(seat: number, cityId: number, type: string, extra: number, scale?: boolean): number;
  /** the seat's research and civics AIs' turns to a TECH_ / CIVIC_ type
   *  (0x7610e0, 0x621920), 0 for none or one held */
  researchTurns(seat: number, type: string | null): number;
  /** the city's CityBuildAI's expected count of a UnitType (0x5d4750), raw */
  cityUnitExpected(seat: number, cityId: number, unit: string): number;
  /** the times the seat completed a ProjectType (player +0x1330, 0x4be7b0) */
  projectCompletions(seat: number, project: string): number;
  /** the turns a city builds a ProjectType in (0x17b890): its cost less the
   *  progress kept on it and the city's store, at its Production toward it
   *  times 1 + `extra` raw (24.8) */
  projectTurns(seat: number, cityId: number, project: string, extra: number): number;
  /** the major civilizations' seats in turn order, the defeated left out */
  majors(): readonly number[];
  /** the improved plots of the ResourceType in the seat's territory */
  resourceHeld(seat: number, resource: string): number;
  /** the seat's yield of a YieldType per turn, its cities' totals summed */
  playerYield(seat: number, yieldType: string): number;
  /** the grievances `holder` holds against `against`, 0 for none */
  grievances(holder: number, against: number): number;
  /** PlayerStats' m_iMilitaryStrength (0x4bb1e0) */
  militaryStrength(seat: number): number;
  /** PlayerStats' strength over every domain (0x4bd0d0 with -1: +0x210 less
   *  +0x390) */
  domainStrength(seat: number): number;
  /** the pair's standing alliance */
  allied(a: number, b: number): boolean;
  /** `a`'s standing denouncement of `b` */
  denouncing(a: number, b: number): boolean;
  /** a city's Amenity balance (have less needed) and its yields by
   *  YieldType, as the Amenity value reads them (0x79f7c0) */
  cityAmenity(seat: number, cityId: number): { balance: number; yields: Readonly<Record<string, number>> };
  /** 0x6cfd60: an owner with no capital, or a city on its owner's home
   *  continent (PlayerCities m_eHomeContinent, +0x160; a city-state's city on it) */
  cityOnHomeContinent(seat: number, cityId: number): boolean;
  /** `housing` more in a city from `t` to `h` (0x7a3d70 on its growth and
   *  its CityBuildAI's growth forecast), raw */
  cityHousingValue(seat: number, cityId: number, housing: number, t: number, h: number): number;
  /** the seat's Great Person points a turn toward a class
   *  (GREAT_PERSON_CLASS_*) */
  greatPersonPointsPerTurn(seat: number, cls: string): number;
  /** the seat's diplomatic victory points, and the points a victory takes
   *  (DIPLOMATIC_VICTORY_POINTS_REQUIRED) */
  diplomaticPoints(seat: number): number;
  readonly diplomaticVictoryPoints: number;
  /** the running scored competitions the seat ranks in the top quarter of
   *  (its rank at most a quarter of the seats scoring above 0) */
  competitionLeads(seat: number): number;
  /** a city may advance the ProjectType now */
  cityCanProject(seat: number, cityId: number, project: string): boolean;
}

/** 0x7a7110, A TRADER'S WORTH from turn `start`: none once the seat's trade
 *  units fill its capacity (plus `extra`, the capacity the caller adds);
 *  else the trade AI's expected route value from `start` to 30 turns on (or
 *  the horizon), one discounted turn where the two meet, plus a route's era
 *  score (0x2c4470, `moment`) as PSEUDOYIELD_GOLDENAGE_POINT, times 4; null
 *  where the route value is not read */
export function traderValue(view: AiValueView, seat: number, extra: number, start: number, horizon: number, moment = 0,
  r = AI_RATE): number | null {
  if (view.traders(seat) >= view.tradeRouteCapacity(seat) + extra) return 0;
  const k = view.tradeKnowledge(seat);
  if (k === null) return null;
  const end = Math.min(start + 30, horizon);
  const v = start === end ? discounted(k, r, start) : presentValue(k, r, end) - presentValue(k, r, start);
  return (v + pseudoYieldValue(view, seat, moment * FX, 'PSEUDOYIELD_GOLDENAGE_POINT')) * 4;
}

/** A plot as the AI's requirement evaluators read it, in the game's type
 *  names */
export interface AiPlotView {
  terrain: string;
  feature: string | null;
  resource: string | null;
  /** the resource revealed to the player (0x50a690) */
  resourceVisible: boolean;
  improvement: string | null;
  impassable: boolean;
  /** the resource's ResourceClassType, null for none */
  resourceClass: string | null;
  /** the improvement is the one that improves the resource */
  improved: boolean;
  /** the plot's Appeal */
  appeal: number;
}

/** A district as the AI's value reads it */
export interface AiDistrictView {
  /** the engine's city id */
  cityId: number;
  /** the DistrictType */
  type: string;
}

/** 0x7a6690: a yield's value to the player — amount x Yields.DefaultValue x
 *  (1 + min(w, 9.0)), w the player's yield weight; `seat` null is an
 *  analyzer that passes no player (the bare DefaultValue) */
export function yieldValue(view: AiValueView | null, seat: number | null, amount: number, yieldType: string): number {
  const v = fmul(amount, fxConst(AI_YIELD_DEFAULT[yieldType] ?? 1));
  if (!view || seat === null) return v;
  const w = view.yieldWeight(seat, yieldType);
  return fmul(v, Math.min(w, 9 * FX) + FX);
}

/** 0x7a60d0 by name: amount x (the player's factor x
 *  PseudoYields.DefaultValue), the factor (1 + w) + q — w the pseudo-yield
 *  weight (0x700810, at least -1.0), q 0 but for PSEUDOYIELD_DIPLOMATIC_BONUS
 *  toward a named player (0x655840), which no value here names; `seat` null
 *  is a caller that passes no player (factor 1) */
export function pseudoYieldValue(view: AiValueView | null, seat: number | null, amount: number, pseudo: string): number {
  return pseudoYield(AI_PSEUDOYIELD_DEFAULT[pseudo] ?? 1, amount, view && seat !== null ? view.pseudoYieldWeight(seat, pseudo) : 0);
}

/** 0x8c4540: the turns `rem` raw left needs at `rate` raw a turn — the
 *  truncated quotient, one more where a remainder is left; 1 where nothing
 *  is left; -1 where the rate is none */
export function turnsAt(rem: number, rate: number): number {
  if (rate <= 0) return -1;
  if (rem <= 0) return 1;
  const n = Math.floor(fdiv(rem, rate) / FX);
  return rem > rate * n ? n + 1 : n;
}
