/**
 * THE MAJORS' AI'S VIEW OF THIS ENGINE (ai/major/view.ts): one seat-agnostic
 * read-only view over a GameState, in the game's type names. Nothing here
 * writes the state; the slot rebuild a government change would make is laid
 * on copies (`carryLayout`).
 */
import type { MajorCityView, MajorSlotView, MajorView } from '../../ai/major/view';
import { engineId, gameTypeOf } from '../data/aliases';
import { CIVICS } from '../data/civics';
import { COST_MULTIPLIER_PCT } from '../data/constants';
import { GP_CLASSES } from '../data/greatPeople';
import { GOVERNMENTS, GOVERNMENT_LIST, POLICIES, POLICY_LIST, type SlotKind } from '../data/policies';
import { congressPolicyBlocked } from './congress';
import { carryLayout, darkAgeEra, fitPoliciesLoose, governmentBit, governmentSlots, governmentsOpen, inDarkAge, seatGovernment,
  unlockedPolicyIds } from './effects';
import { gpOffer } from './greatPeople';
import { citiesOf, seatOf } from './seats';
import type { GameState, GreatPersonClass, YieldKey } from './types';
import { computeCityStats } from './city';

/** What the view takes from AI parts this engine does not run: the civic AI's
 *  research list per seat (CivicTypes), empty where none is given. */
export interface MajorViewInputs {
  civicList?: ReadonlyMap<number, ReadonlySet<string>>;
}

const slotType = (k: SlotKind): string => `SLOT_${k.toUpperCase()}`;
const YIELD_KEY: Readonly<Record<string, YieldKey>> = {
  YIELD_FOOD: 'food', YIELD_PRODUCTION: 'production', YIELD_GOLD: 'gold',
  YIELD_SCIENCE: 'science', YIELD_CULTURE: 'culture', YIELD_FAITH: 'faith',
};
const govType = (id: string): string => gameTypeOf('government', id, 'GOVERNMENT_');
const policyType = (id: string): string => gameTypeOf('policy', id, 'POLICY_');
const govId = (type: string): string | null => engineId('government', type, 'GOVERNMENT_', GOVERNMENTS);

export function majorView(state: GameState, inputs: MajorViewInputs = {}): MajorView {
  const seat = (i: number) => {
    const s = seatOf(state, i);
    if (!s) throw new Error(`majorView: no seat ${i}`);
    return s;
  };
  const slottable = (i: number, gov: string | null): Set<string> => {
    const s = seat(i);
    if (!gov) return new Set();
    return unlockedPolicyIds(s.research, congressPolicyBlocked(state), darkAgeEra(state, i), s.government.held, gov);
  };
  const slotsOf = (i: number): MajorSlotView[] => {
    const cards = seat(i).government.policies;
    return governmentSlots(state, i).map((k, j) => ({ slot: slotType(k), policy: cards[j] ? policyType(cards[j]!) : null }));
  };
  return {
    turn: state.turn,
    costMultiplierPct: COST_MULTIPLIER_PCT,
    gameEra: state.gameEra ?? 0,
    cityStates: state.cityStates.length,
    civicsHeld: (i) => new Set(seat(i).research.civics.filter((c) => c in CIVICS).map((c) => gameTypeOf('civic', c, 'CIVIC_'))),
    civicList: (i) => inputs.civicList?.get(i) ?? new Set(),
    government: (i) => {
      const g = seatGovernment(state, i);
      return g ? govType(g) : null;
    },
    governmentsHeld: (i) => new Set(GOVERNMENT_LIST.filter((g) => seat(i).government.held & governmentBit(g.id)).map((g) => govType(g.id))),
    governmentsUnlocked: (i) => new Set(governmentsOpen(state, i).map((k) => govType(GOVERNMENT_LIST[k].id))),
    slots: slotsOf,
    slotsUnder: (i, type) => {
      const g = govId(type);
      if (!g || g === seatGovernment(state, i)) return slotsOf(i);
      const before = governmentSlots(state, i);
      const old = fitPoliciesLoose(before, seat(i).government.policies.filter((p): p is string => !!p));
      const after = governmentSlots(state, i, g);
      const open = slottable(i, g);
      const laid = carryLayout(old.map((c, j) => [before[j], c] as const), after, (c) => open.has(c));
      return after.map((k, j) => ({ slot: slotType(k), policy: laid[j] ? policyType(laid[j]!) : null }));
    },
    policiesSlottableUnder: (i, type) => {
      const g = type ? govId(type) : null;
      return new Set([...slottable(i, g)].map(policyType));
    },
    darkAge: (i) => inDarkAge(state, i),
    goldenAge: (i) => seat(i).age === 2,
    greatPersonClassAvailable: (cls) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      return !GP_CLASSES.includes(c) || gpOffer(state, c) !== -2;
    },
    cities: (i): MajorCityView[] => citiesOf(state, i).map((c) => ({ id: c.id, capital: c.isCapital })),
    cityYield: (i, id, type) => {
      const city = citiesOf(state, i).find((c) => c.id === id);
      const key = YIELD_KEY[type];
      return city && key ? computeCityStats(state, city).total[key] : 0;
    },
    policyColumn: (type) => {
      const id = engineId('policy', type, 'POLICY_', POLICIES);
      return id ? POLICY_LIST.findIndex((p) => p.id === id) : -1;
    },
    governmentColumn: (type) => {
      const id = govId(type);
      return id ? GOVERNMENT_LIST.findIndex((g) => g.id === id) : -1;
    },
  };
}
