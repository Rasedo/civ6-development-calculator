/**
 * THE ENGINE AS THE MAJORS' AI READS IT: a read-only view of one game state,
 * in the game's own type names (POLICY_*, CIVIC_*, GOVERNMENT_*,
 * GREAT_PERSON_CLASS_*). The engine implements it (cpu/core/majorView.ts);
 * the AI never touches the engine's state, and what it decides leaves as the
 * per-seat action record the engine applies for any driver.
 */

export interface MajorCityView {
  /** the engine's city id */
  id: number;
  capital: boolean;
}

export interface MajorSlotView {
  /** the slot's GovernmentSlotType */
  slot: string;
  /** the card slotted, null for an empty slot */
  policy: string | null;
}

export interface MajorView {
  readonly turn: number;
  /** the game speed's CostMultiplier, a percent */
  readonly costMultiplierPct: number;
  /** the game era, an index into AI_ERAS */
  readonly gameEra: number;
  /** the city-states the game holds */
  readonly cityStates: number;
  /** the CivicTypes the seat holds */
  civicsHeld(seat: number): ReadonlySet<string>;
  /** the CivicTypes the seat's civic AI lists with a score above 0 (its
   *  research list); a policy of such a civic is scored before its civic is
   *  held */
  civicList(seat: number): ReadonlySet<string>;
  /** the government the seat is in, null in Anarchy */
  government(seat: number): string | null;
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
  cities(seat: number): readonly MajorCityView[];
  /** a city's yield of a YieldType as the city totals it (City::GetYield) */
  cityYield(seat: number, cityId: number, yieldType: string): number;
  /** the action record's column for a PolicyType / GovernmentType, -1 for
   *  one the engine does not carry */
  policyColumn(type: string): number;
  governmentColumn(type: string): number;
}
