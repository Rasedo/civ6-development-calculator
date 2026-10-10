/**
 * THE ENGINE AS THE MAJORS' AI READS IT: a read-only view of one game state,
 * in the game's own type names (POLICY_*, CIVIC_*, GOVERNMENT_*,
 * GREAT_PERSON_CLASS_*). The engine implements it (cpu/core/majorView.ts);
 * the AI never touches the engine's state, and what it decides leaves as the
 * per-seat action record the engine applies for any driver. What the value
 * layer reads (the cities, their yields, the government, the yield weights)
 * is the shared `AiValueView`.
 */
import type { AiValueView } from '../../cpu/core/aiValue';

export interface MajorSlotView {
  /** the slot's GovernmentSlotType */
  slot: string;
  /** the card slotted, null for an empty slot */
  policy: string | null;
}

/** a map plot as the AI reads it (Plot), in the game's type names */
export interface MajorPlotView {
  index: number;
  x: number;
  y: number;
  water: boolean;
  /** Plot +0x3a bit 3: a mountain, an impassable feature */
  impassable: boolean;
  /** FeatureType, null for none */
  feature: string | null;
  /** ResourceType, null for none */
  resource: string | null;
  /** the seat whose territory holds it, -1 for none */
  owner: number;
  /** a district stands on it, a city centre included */
  district: boolean;
  /** a city centre stands on it, any seat's */
  city: boolean;
  /** the plot's area (AreaBuilder), region (Map_Region, -1 off passable
   *  land) and continent (-1 for the sea) */
  area: number;
  region: number;
  continent: number;
  coastal: boolean;
  freshWater: boolean;
}

/** one plot of a unit's planning reach (UnitPlanning): the turn it is
 *  reached in, 1 for this turn, and the Movement left there */
export interface MajorReachView {
  plot: number;
  turns: number;
  moves: number;
}

export interface MajorUnitView {
  /** the engine's unit id */
  id: number;
  /** UnitType */
  type: string;
  plot: number;
  /** Units.FoundCity */
  founder: boolean;
}

/** a unit of a player at war with the seat, as its danger map reads it:
 *  its combat, ranged and bombard strengths and its attack range */
export interface MajorHostileUnitView {
  id: number;
  plot: number;
  melee: number;
  ranged: number;
  bombard: number;
  range: number;
  air: boolean;
}

/** a city's defence: its combat strength, its ranged strike's strength (0
 *  where it has none) and reach */
export interface MajorCityDefenceView {
  plot: number;
  strength: number;
  ranged: number;
  range: number;
}

export interface MajorView extends AiValueView {
  /** the map's plots by index */
  plots(): readonly MajorPlotView[];
  /** the plots within `radius` of a plot, the plot included */
  plotsWithin(plot: number, radius: number): readonly number[];
  plotDistance(a: number, b: number): number;
  /** the seat has revealed the plot */
  revealed(seat: number, plot: number): boolean;
  /** a plot's yield of a YieldType as the seat sees it */
  plotYield(seat: number, plot: number, yieldType: string): number;
  /** the seat sees the ResourceType (its PrereqTech) */
  resourceVisible(seat: number, resource: string): boolean;
  /** the improved plots of the ResourceType in the seat's territory */
  resourceHeld(seat: number, resource: string): number;
  /** the plots of the seat's city centres */
  cityPlots(seat: number): readonly number[];
  /** the continent of the seat's original capital, -1 before it has one */
  homeContinent(seat: number): number;
  /** the citizens' Loyalty pressure on a plot from the seat's side (the own
   *  against the foreign term), whole points */
  pressureAt(seat: number, plot: number): number;
  /** the strategies (StrategyType) the seat's AI follows (the value layer's
   *  `followedStrategies`) */
  strategies(seat: number): ReadonlySet<string>;
  leaderType(seat: number): string | null;
  civilizationType(seat: number): string | null;
  units(seat: number): readonly MajorUnitView[];
  /** a unit's planning reach within `turns` on the Movement it has left, in
   *  the pathfinder's order */
  unitReach(unitId: number, turns: number): readonly MajorReachView[];
  /** the plots of a unit's path to `plot`, its own left out, empty for none */
  unitPath(unitId: number, plot: number): readonly number[];
  /** the direction (DirectionTypes) from a plot to its neighbour, -1 for none */
  stepDirection(from: number, to: number): number;
  /** the action record's unit column of a verb (MOVE_0..5, FOUND_CITY), -1
   *  for one the engine does not carry */
  unitActionColumn(name: string): number;
  /** the units of the players at war with the seat (the barbarians always)
   *  that the seat sees now and that carry a combat strength */
  hostileUnits(seat: number): readonly MajorHostileUnitView[];
  /** the cities of the players at war with the seat whose centres it sees now */
  hostileCities(seat: number): readonly MajorCityDefenceView[];
  /** the seat's own cities */
  cityDefences(seat: number): readonly MajorCityDefenceView[];
  readonly turn: number;
  /** the game era, an index into AI_ERAS */
  readonly gameEra: number;
  /** the CivicTypes the seat holds */
  civicsHeld(seat: number): ReadonlySet<string>;
  /** the CivicTypes the seat's civic AI lists with a score above 0 (its
   *  research list); a policy of such a civic is scored before its civic is
   *  held */
  civicList(seat: number): ReadonlySet<string>;
  /** every government the seat has been in */
  governmentsHeld(seat: number): ReadonlySet<string>;
  /** the governments the seat's civics unlock */
  governmentsUnlocked(seat: number): ReadonlySet<string>;
  /** the seat's slots in order, with what each holds */
  slots(seat: number): readonly MajorSlotView[];
  /** the slots as a change to `government` rebuilds them (the old cards laid
   *  back into the new slots) */
  slotsUnder(seat: number, government: string): readonly MajorSlotView[];
  /** the cards the seat may slot under `government` (CanSlot's validity: the
   *  civic, a Dark Age card's window, a legacy card, the World Congress's
   *  ban, a government's exclusive card) */
  policiesSlottableUnder(seat: number, government: string | null): ReadonlySet<string>;
  darkAge(seat: number): boolean;
  goldenAge(seat: number): boolean;
  /** a great person of the class is still to be earned in the game */
  greatPersonClassAvailable(cls: string): boolean;
  /** the action record's column for a PolicyType / GovernmentType, -1 for
   *  one the engine does not carry */
  policyColumn(type: string): number;
  governmentColumn(type: string): number;

  // THE DIPLOMATIC VIEW (ai/major/diplomacy.ts). Seats are the engine's: a
  // major's seat, a city-state's seat, the Free Cities' and the barbarians'.
  /** the major civilizations' seats in turn order, the defeated left out */
  majors(): readonly number[];
  /** the seat's LeaderType, null for a seat with no leader */
  leader(seat: number): string | null;
  /** the turn `seat` met `other`, null while they have not met */
  metTurn(seat: number, other: number): number | null;
  atWar(seat: number, other: number): boolean;
  /** turns the pair has been at peace since their last war (or since they
   *  met when they never fought) */
  peaceTurns(seat: number, other: number): number;
  /** a Diplomatic Delegation / a Resident Embassy `sender` holds with `receiver` */
  hasDelegation(sender: number, receiver: number): boolean;
  hasEmbassy(sender: number, receiver: number): boolean;
  /** open borders `grantor` grants `guest` */
  hasOpenBorders(grantor: number, guest: number): boolean;
  /** the seat's yield of a YieldType per turn, its cities' totals summed */
  playerYield(seat: number, yieldType: string): number;
  /** the seat's citizens */
  population(seat: number): number;
  /** the world wonders the seat has built */
  wondersBuilt(seat: number): number;
  /** the great people the seat has earned */
  greatPeopleEarned(seat: number): number;
  /** the plots the seat owns */
  plotsOwned(seat: number): number;
  /** the religion the seat founded (its seat stands for it), null for none */
  religionFounded(seat: number): number | null;
  /** the religion most of the seat's cities follow, null for none */
  majorityReligion(seat: number): number | null;
  /** the trade routes running between the two seats' cities, either way */
  tradeRoutesBetween(a: number, b: number): number;
  /** the city-states' seats */
  cityStateSeats(): readonly number[];
  /** the envoys `seat` holds in a city-state */
  envoys(cityState: number, seat: number): number;
  /** the grievances `holder` holds against `against`, 0 for none */
  grievances(holder: number, against: number): number;
  /** the seat's military units of a DomainType */
  militaryUnits(seat: number, domain: string): number;
}
