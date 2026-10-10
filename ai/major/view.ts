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

export interface MajorView extends AiValueView {
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
