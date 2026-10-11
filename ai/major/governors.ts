/**
 * THE MAJORS' GOVERNOR AI, as Civ 6's runs it (GameCore_XP2 AI::Governors,
 * AI/Governors.cpp; `tools/civ6lab/dll_readings.md` "C-97: the governor AI").
 *
 * THE ANALYSIS (the "Governor Analyzer" job 0x6eee50, at the AI's turn
 * start): per governor in database order (0x6ee5f0) a value per slot — the
 * slot of no city, then each of the seat's own cities in its order, then,
 * for a governor that may sit in a city-state (AssignCityState), each
 * city-state's capital the seat has met, at its place in the game's
 * city-state list; every value 0 for a governor neither appointed nor open
 * to the seat (0x4316f0). Per promotion in database order (0x6eedb0) a score:
 * the promotion's value (0x7b0bb0), at least 10.
 *
 * THE TURN (0x6ee100, the AI turn's second phase): AI_Governors.csv logs
 * each governor's best slot value and its promotions' scores (0x6ef6a0);
 * then, while a title is to spend (0x430ee0 / 0x431ac0), ONE choice: over
 * the governors in order, an unappointed one at its best slot value, an
 * appointed one at each promotion it may take (0x431400) — the first
 * strictly highest above 0 is appointed or promoted. Then the seats
 * (0x6ed750): a generalized assignment (0x8b5bf0) of the governors to the
 * slots, one pass, and every governor it leaves on a slot is assigned there.
 */
import { AI_GOVERNORS, AI_GOVERNOR_PROMOTIONS } from './tables';
import type { AiGovernor } from './types';
import type { MajorGovernorView, MajorView } from './view';
import { AI_RATE, FX, FX_MIN, valueBetween, whole } from '../../cpu/core/aiValue';
import { modifiersValue, type ValueTerms } from '../../cpu/core/aiModifiers';

/** the horizon every governor and promotion value runs to: the literal 100
 *  both callers pass (0x6ee5f0, 0x6eedb0 — `push 0x64`) */
const GOVERNOR_HORIZON = 100;
/** the value of the slot of no city (0x7b0e40): 10.0, 20.0 for a governor
 *  Governors_XP2 sends to a major (AssignToMajor) */
const NO_CITY_BASE = 10 * FX;
const NO_CITY_BASE_MAJOR = 20 * FX;
/** an own city's floor (0x7b0e40: the Loyalty term at least 20.0) */
const CITY_FLOOR = 20 * FX;
/** the turns a governor not yet in the city waits before the Loyalty term
 *  counts (0x7b0e40: 5 added to the start) */
const NEW_POSTING_TURNS = 5;
/** a promotion's value starts at 5.0 (0x7b0bb0) and its score is at least
 *  10.0 (0x6eedb0) */
const PROMOTION_START = 5 * FX;
const PROMOTION_FLOOR = 10 * FX;
/** a promotion of a governor not appointed (0x7b0bb0) */
const NOT_APPOINTED = -FX;

/** a slot: no city, or a city (an own city's id, a city-state's -1) */
export type GovernorSlot = { seat: number; id: number } | null;

const sameSlot = (a: GovernorSlot, b: GovernorSlot): boolean =>
  a === b || (!!a && !!b && a.seat === b.seat && a.id === b.id);

/** one governor's analysis: its slots (`m_cityIds`; a slot never filled is
 *  null, as the slot of no city) and their values (`m_values`), fixed point */
export interface GovernorAnalysis {
  type: string;
  slots: readonly GovernorSlot[];
  values: readonly number[];
}

export interface GovernorScores {
  governors: readonly GovernorAnalysis[];
  /** each promotion's score, by GovernorPromotionType, fixed point */
  promotions: ReadonlyMap<string, number>;
}

const terms = (view: MajorView, seat: number, city: GovernorSlot): ValueTerms => ({
  view, seat, start: 0, horizon: GOVERNOR_HORIZON, rate: AI_RATE,
  ...(city ? { owner: { cityId: city.id, capital: view.cities(city.seat).find((c) => c.id === city.id)?.capital ?? true, seat: city.seat } } : {}),
});

const rosterOf = (view: MajorView, seat: number): ReadonlyMap<string, MajorGovernorView> =>
  new Map(view.governors(seat).map((g) => [g.type, g]));

/**
 * ONE GOVERNOR'S VALUE IN A SLOT (0x7b0e40). The slot of no city: 10.0
 * (20.0 for an AssignToMajor governor). A city: FX_MIN for an AssignToMajor
 * governor; one of the seat's own that holds no other governor: the city's
 * Loyalty loss a turn without this governor (its Loyalty a turn less its
 * IdentityPressure where it sits there; nothing where it gains) from the
 * turn it would establish (5 on where it does not sit there) to the
 * horizon, at least 20.0; any other city nothing. Then the governor's own
 * modifiers (its BaseAbility promotions', GlobalAI +0x39c0) on the slot's
 * city (0x7a4b20). A city whose Loyalty a turn this governor turns from
 * below 0 to above it adds its city value (0x79fef0, not read here).
 */
export function governorValue(view: MajorView, seat: number, g: AiGovernor, slot: GovernorSlot,
                              roster: ReadonlyMap<string, MajorGovernorView> = rosterOf(view, seat)): number {
  let base: number;
  if (!slot) base = g.assignToMajor ? NO_CITY_BASE_MAJOR : NO_CITY_BASE;
  else if (g.assignToMajor) return FX_MIN;
  else {
    const holder = [...roster.values()].find((x) => x.appointed && sameSlot(x.city, slot));
    if ((holder && holder.type !== g.type) || slot.seat !== seat) base = 0;
    else {
      const ip = g.identityPressure * FX;
      let loyalty = view.cityLoyaltyPerTurn(seat, slot.id);
      if (holder) loyalty -= ip;
      const loss = loyalty < 0 ? -loyalty : 0;
      const from = holder ? 0 : NEW_POSTING_TURNS;
      base = Math.max(valueBetween(loss, from, GOVERNOR_HORIZON), CITY_FLOOR);
    }
  }
  return base + modifiersValue(terms(view, seat, slot), g.modifiers);
}

/** the slots every governor's analysis is sized to: the slot of no city,
 *  the seat's cities, then one per city-state of the game's list */
function slotCount(view: MajorView, seat: number): number {
  return 1 + view.cities(seat).length + view.cityStateSeats().length;
}

/** ONE GOVERNOR'S ANALYSIS (0x6ee5f0) */
export function governorAnalysis(view: MajorView, seat: number, g: AiGovernor,
                                 roster: ReadonlyMap<string, MajorGovernorView> = rosterOf(view, seat)): GovernorAnalysis {
  const n = slotCount(view, seat);
  const slots: GovernorSlot[] = new Array(n).fill(null);
  const values: number[] = new Array(n).fill(0);
  if (!roster.get(g.type)?.appointed && !view.governorAvailable(seat, g.type)) return { type: g.type, slots, values };
  values[0] = governorValue(view, seat, g, null, roster);
  const cities = view.cities(seat);
  cities.forEach((c, i) => {
    const slot = { seat, id: c.id };
    slots[1 + i] = slot;
    values[1 + i] = governorValue(view, seat, g, slot, roster);
  });
  if (g.assignCityState) {
    view.cityStateSeats().forEach((cs, k) => {
      if (!view.cityStateHasCity(cs) || view.metTurn(seat, cs) === null) return;
      const slot = { seat: cs, id: -1 };
      slots[1 + cities.length + k] = slot;
      values[1 + cities.length + k] = governorValue(view, seat, g, slot, roster);
    });
  }
  return { type: g.type, slots, values };
}

/**
 * ONE PROMOTION'S SCORE (0x6eedb0 over 0x7b0bb0): over the governors whose
 * set holds it, -1.0 where one is not appointed, else the best (from 5.0) of
 * its modifiers' value (GovernorPromotionModifiers by ModifierId, GlobalAI
 * +0x39d8) on the city that governor sits in; at least 10.0.
 */
export function promotionScore(view: MajorView, seat: number, type: string,
                               roster: ReadonlyMap<string, MajorGovernorView> = rosterOf(view, seat)): number {
  const p = AI_GOVERNOR_PROMOTIONS.find((x) => x.type === type);
  if (!p) return PROMOTION_FLOOR;
  let best = PROMOTION_START;
  for (const gt of p.governors) {
    const g = roster.get(gt);
    if (!g?.appointed) {
      best = NOT_APPOINTED;
      break;
    }
    best = Math.max(best, modifiersValue(terms(view, seat, g.city), p.modifiers));
  }
  return Math.max(best, PROMOTION_FLOOR);
}

/** THE "Governor Analyzer" JOB: every governor's analysis and every
 *  promotion's score */
export function governorScores(view: MajorView, seat: number): GovernorScores {
  const roster = rosterOf(view, seat);
  return {
    governors: AI_GOVERNORS.map((g) => governorAnalysis(view, seat, g, roster)),
    promotions: new Map(AI_GOVERNOR_PROMOTIONS.map((p) => [p.type, promotionScore(view, seat, p.type, roster)])),
  };
}

/** a governor's best slot value (the log's Assignment, the choice's
 *  appointment value) */
export const bestSlotValue = (a: GovernorAnalysis): number => a.values.reduce((m, v) => Math.max(m, v), a.values.length ? -Infinity : -FX);

/** AI_Governors.csv's line of a governor: its best slot value's whole part
 *  and each promotion's score's (0x6ef6a0) */
export function governorLogLine(scores: GovernorScores, a: GovernorAnalysis): { assignment: number; promotions: [string, number][] } {
  const g = AI_GOVERNORS.find((x) => x.type === a.type)!;
  return { assignment: whole(bestSlotValue(a)), promotions: g.promotions.map((p) => [p, whole(scores.promotions.get(p) ?? 0)]) };
}

export type GovernorChoice = { appoint: string } | { promote: string; promotion: string } | null;

/**
 * THE CHOICE (0x6ee100), while the seat holds a title to spend on an
 * appointment or a promotion: the first strictly highest above 0 of each
 * unappointed governor's best slot value and each promotion an appointed
 * governor may take.
 */
export function governorChoice(view: MajorView, seat: number, scores: GovernorScores): GovernorChoice {
  // 0x430ee0: a title to spend and a governor of the game's list not
  // appointed — Ibrahim, whom no duel's seat may appoint, stays unappointed
  if (view.governorTitles(seat) <= 0) return null;
  const roster = rosterOf(view, seat);
  let best = 0;
  let choice: GovernorChoice = null;
  scores.governors.forEach((a, i) => {
    const g = AI_GOVERNORS[i];
    const r = roster.get(g.type);
    if (!r?.appointed) {
      const v = bestSlotValue(a);
      if (v > best) {
        best = v;
        choice = { appoint: g.type };
      }
      return;
    }
    for (const p of g.promotions) {
      const v = scores.promotions.get(p) ?? 0;
      if (v > best && !r.promotions.has(p) && view.governorCanPromote(seat, g.type, p)) {
        best = v;
        choice = { promote: g.type, promotion: p };
      }
    }
  });
  return choice;
}

/** the generalized assignment's slots (0x6ed750): no city, the seat's
 *  cities, every city-state with a city in the game's list */
export function assignmentSlots(view: MajorView, seat: number): GovernorSlot[] {
  return [null, ...view.cities(seat).map((c) => ({ seat, id: c.id })),
    ...view.cityStateSeats().filter((cs) => view.cityStateHasCity(cs)).map((cs) => ({ seat: cs, id: -1 }))];
}

/**
 * THE SEATS (0x6ed750 over the generalized assignment 0x8b5bf0, one pass).
 * Each governor starts on the slot it sits in (λ 0x6ecee0); per slot in
 * order, each governor's gain (λ 0x6ece40: its value there, whole, -1 for a
 * governor not appointed or a slot its analysis lacks; less its value where
 * it sits, if elsewhere), the first largest gain above 0 (0x61ddb0 at
 * capacity 1) takes the slot unless it is its own: the slot's occupant
 * (λ 0x6ed060's record) is unseated, which the record never clears when a
 * governor leaves a slot. `appointed` is the roster after the turn's choice.
 * Returns each governor's slot index, -1 for none.
 */
export function governorAssignment(view: MajorView, seat: number, scores: GovernorScores,
                                   appointed: ReadonlySet<string>): { slots: GovernorSlot[]; at: number[] } {
  const slots = assignmentSlots(view, seat);
  const roster = rosterOf(view, seat);
  const value = (i: number, s: number): number => {
    if (!appointed.has(AI_GOVERNORS[i].type)) return -1;
    const a = scores.governors[i];
    const k = a.slots.findIndex((x) => sameSlot(x, slots[s]));
    return whole(k >= 0 ? a.values[k] : -FX);
  };
  const at = AI_GOVERNORS.map(() => -1);
  const occupant = slots.map(() => -1);
  AI_GOVERNORS.forEach((g, i) => {
    const r = roster.get(g.type);
    if (!r?.appointed || !r.city) return;
    const s = slots.findIndex((x) => sameSlot(x, r.city));
    if (s < 0) return;
    at[i] = s;
    occupant[s] = i;
  });
  for (let s = 0; s < slots.length; s++) {
    let pick = -1;
    let gain = -Infinity;
    for (let i = 0; i < AI_GOVERNORS.length; i++) {
      const v = at[i] === -1 || at[i] === s ? value(i, s) : value(i, s) - value(i, at[i]);
      if (v > gain) {
        gain = v;
        pick = i;
      }
    }
    if (pick < 0 || gain <= 0 || at[pick] === s) continue;
    const old = occupant[s];
    occupant[s] = pick;
    at[pick] = s;
    if (old >= 0) at[old] = -1;
  }
  return { slots, at };
}

/** the turn's decisions as the game's operations: the appointment or the
 *  promotion, then an assignment per governor the seats leave on a city
 *  (a governor already there, and the slot of no city, change nothing) */
export interface GovernorTurn {
  choice: GovernorChoice;
  assign: { governor: string; slot: GovernorSlot }[];
}

/** THE AI TURN (0x6ee100) on the analysis of its start */
export function governorTurn(view: MajorView, seat: number, scores: GovernorScores): GovernorTurn {
  const choice = governorChoice(view, seat, scores);
  const roster = rosterOf(view, seat);
  const appointed = new Set([...roster.values()].filter((g) => g.appointed).map((g) => g.type));
  if (choice && 'appoint' in choice) appointed.add(choice.appoint);
  const { slots, at } = governorAssignment(view, seat, scores, appointed);
  const assign: GovernorTurn['assign'] = [];
  AI_GOVERNORS.forEach((g, i) => {
    if (at[i] < 0 || !slots[at[i]]) return;
    if (sameSlot(roster.get(g.type)?.city ?? null, slots[at[i]])) return;
    assign.push({ governor: g.type, slot: slots[at[i]] });
  });
  return { choice, assign };
}
