/**
 * THE MAJORS' GOVERNMENT AND POLICY CARDS, as Civ 6's AI picks them
 * (GameCore_XP2_Release.dll; dll_readings "C-97: the government and policy
 * choice"). Each AI turn scores every policy (the policy jobs 0x621eb0 and
 * their value 0x7b26b0, logged "Policies" in AI_GovtPolicies.csv); on a
 * completed civic the choice (0x625d70) reads the last turn's scores, takes
 * the best government (0x7b0330) and fills each slot with the best card above
 * the slot's own. The choice leaves as the per-seat action record.
 */
import type { SeatActionRecord } from '../../cpu/core/types';
import { AI_GOVERNMENTS, AI_POLICIES, AI_SLOT_TYPES } from './tables';
import type { AiPolicy } from './types';
import type { MajorSlotView, MajorView } from './view';
import { AI_POLICY_HORIZON } from '../../cpu/data/aiValue';
import { AI_RATE, FX_MIN, fdiv, presentValue, pseudoYieldValue } from '../../cpu/core/aiValue';
import { modifiersValue, type ValueTerms } from '../../cpu/core/aiModifiers';

/** a job that never ran, or whose card the player cannot reach: -1.0 */
export const NO_SCORE = -256;
/** a Dark Age card in a Dark Age, a Golden Age card in a Golden Age */
const AGE_BONUS = 250 * 256;

/** the seat's policy scores in database order, fixed point (the list at
 *  PolicyAI +0x9e8, entry +0x48) */
export type PolicyScores = ReadonlyMap<string, number>;

const SLOT_ANY = new Map(AI_SLOT_TYPES.map((s) => [s.type, s.any] as const));

/** ObsoletePolicies (0x39e050): its obsoleting card's civic is held, or the
 *  great person class it needs is spent */
export function policyObsolete(view: MajorView, seat: number, p: AiPolicy): boolean {
  const held = view.civicsHeld(seat);
  for (const o of p.obsolete) {
    if (o.policy) {
      const by = AI_POLICIES.find((q) => q.type === o.policy);
      if (by?.civic && held.has(by.civic)) return true;
    }
    if (o.gpClass && !view.greatPersonClassAvailable(o.gpClass)) return true;
  }
  return false;
}

function terms(view: MajorView, seat: number, horizon: number): ValueTerms {
  return { view, seat, start: 0, horizon, rate: AI_RATE };
}

/**
 * ONE POLICY'S SCORE. The job (0x621eb0): -1.0 unless the card's civic is
 * held or on the civic AI's list (a Dark Age card skips the civic), the
 * player's age matches a Dark or Golden Age card, and the game era lies in
 * its window. The value (0x7b26b0, from turn 0 to AI_POLICY_HORIZON): FX_MIN
 * for an obsolete card; 250 for a Dark Age card in a Dark Age or a Golden Age
 * card in a Golden Age; plus its modifiers' sum.
 */
export function policyScore(view: MajorView, seat: number, p: AiPolicy): number {
  if (!p.darkAge) {
    if (!p.civic) return NO_SCORE;
    if (!view.civicsHeld(seat).has(p.civic) && !view.civicList(seat).has(p.civic)) return NO_SCORE;
  }
  if (p.darkAge && !view.darkAge(seat)) return NO_SCORE;
  if (p.goldenAge && !view.goldenAge(seat)) return NO_SCORE;
  if (p.minEra >= 0 && view.gameEra < p.minEra) return NO_SCORE;
  if (p.maxEra >= 0 && view.gameEra > p.maxEra) return NO_SCORE;
  const t = terms(view, seat, AI_POLICY_HORIZON);
  if (t.start >= t.horizon || policyObsolete(view, seat, p)) return FX_MIN;
  const bonus = (p.darkAge && view.darkAge(seat)) || (p.goldenAge && view.goldenAge(seat)) ? AGE_BONUS : 0;
  return bonus + modifiersValue(t, p.modifiers);
}

/** every policy's score, in database order (the AI turn's policy jobs) */
export function policyScores(view: MajorView, seat: number): PolicyScores {
  return new Map(AI_POLICIES.map((p) => [p.type, policyScore(view, seat, p)] as const));
}

/**
 * THE BEST SCORE PER SLOT TYPE (0x620110, the array at PolicyAI +0x5b8): the
 * first highest-scoring card of the type, every card for a type that allows
 * any; a card of another type is taken while none of the type has been met.
 */
export function slotTypeBest(scores: PolicyScores): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const st of AI_SLOT_TYPES) {
    let best: AiPolicy | null = null;
    for (const p of AI_POLICIES) {
      if (!best) { best = p; continue; }
      const sb = scores.get(best.type) ?? NO_SCORE;
      const sp = scores.get(p.type) ?? NO_SCORE;
      if (!st.any) {
        if (best.slot === st.type) {
          if (p.slot !== st.type) continue;
        } else if (p.slot === st.type) {
          best = p;
          continue;
        }
      }
      if (sb < sp) best = p;
    }
    out.set(st.type, best ? scores.get(best.type) ?? NO_SCORE : 0);
  }
  return out;
}

/**
 * ONE GOVERNMENT'S VALUE (0x7b0330): FX_MIN for one the player has been in
 * and is not in now; else, per slot row, the slot type's best card score / 10
 * over each slot's place (the i-th slot divides by i + 1; a type that allows
 * any by 1, 1, 2, 3, 3...), plus its Favor (Governments_XP2) as
 * PSEUDOYIELD_DIPLOMATIC_FAVOR from the start to the horizon, plus its
 * modifiers' sum.
 */
export function governmentValue(view: MajorView, seat: number, gov: string, best: ReadonlyMap<string, number>,
                                horizon: number): number {
  const t = terms(view, seat, horizon);
  if (t.start >= t.horizon) return FX_MIN;
  if (view.governmentsHeld(seat).has(gov) && view.government(seat) !== gov) return FX_MIN;
  const g = AI_GOVERNMENTS.find((x) => x.type === gov);
  if (!g) return FX_MIN;
  let v = 0;
  for (const row of g.slots) {
    const base = fdiv(best.get(row.slot) ?? 0, 2560);
    const any = SLOT_ANY.get(row.slot) ?? false;
    for (let i = 0; i < row.n; i++) {
      const d = any ? Math.min(Math.max(i, 1), 3) : i + 1;
      v += fdiv(base, d * 256);
    }
  }
  if (g.favor) {
    const f = pseudoYieldValue(view, seat, g.favor << 8, 'PSEUDOYIELD_DIPLOMATIC_FAVOR');
    v += presentValue(f, t.rate, t.horizon) - presentValue(f, t.rate, t.start);
  }
  return v + modifiersValue(t, g.modifiers);
}

/** What the choice did: the government it adopted (null: none) and the cards
 *  it slotted, as the slots stand after it; `deferred` when a completed civic
 *  found no card scoring 0 or more and the choice waits for the next turn. */
export interface PolicyChoice {
  government: string | null;
  slots: readonly MajorSlotView[];
  deferred: boolean;
}

/**
 * THE CHOICE (0x625d70). On a completed civic (`civic` true) it waits when no
 * card scores 0 or more. The government: the first of the highest-valued
 * among those the player may change to and its own (0x392cb0: unlocked, not
 * the current one), valued to AI_POLICY_HORIZON; a different one is adopted
 * and the slots are rebuilt (`MajorView.slotsUnder`). Then each slot in
 * order: its card scores its listed score (-1.0 for none or an obsolete
 * one), and every card in database order scoring above the running best,
 * which the slot admits (CanSlot 0x393400: slottable now, not slotted
 * elsewhere, valid under the government 0x3930a0 — its exclusive card only
 * in it —, the slot's type or a slot that allows any) and is not obsolete,
 * becomes the best; a best other than the slot's card is slotted.
 */
export function choosePolicies(view: MajorView, seat: number, scores: PolicyScores, civic: boolean): PolicyChoice {
  let maxScore = -Infinity;
  for (const s of scores.values()) maxScore = Math.max(maxScore, s);
  if (civic && !(maxScore >= 0)) return { government: null, slots: view.slots(seat), deferred: true };
  const horizon = AI_POLICY_HORIZON;
  const best = slotTypeBest(scores);
  const now = view.government(seat);
  const unlocked = view.governmentsUnlocked(seat);
  let pick: string | null = null;
  let pickV = 0;
  for (const g of AI_GOVERNMENTS) {
    if (!(g.type === now || (unlocked.has(g.type) && g.type !== now))) continue;
    const v = governmentValue(view, seat, g.type, best, horizon);
    if (pick === null || v > pickV) {
      pick = g.type;
      pickV = v;
    }
  }
  const adopted = pick !== null && pick !== now ? pick : null;
  const slots = (adopted ? view.slotsUnder(seat, adopted) : view.slots(seat)).map((x) => ({ ...x }));
  const open = view.policiesSlottableUnder(seat, adopted ?? now);
  const slotted = new Set(slots.flatMap((x) => (x.policy ? [x.policy] : [])));
  const obsolete = new Map(AI_POLICIES.map((p) => [p.type, policyObsolete(view, seat, p)] as const));
  for (const slot of slots) {
    let cur = slot.policy;
    let bar = cur === null ? NO_SCORE : scores.get(cur) ?? NO_SCORE;
    if (cur !== null && obsolete.get(cur)) {
      cur = null;
      bar = NO_SCORE;
    }
    let take = cur;
    for (const p of AI_POLICIES) {
      const sp = scores.get(p.type) ?? NO_SCORE;
      if (sp <= bar) continue;
      if (!open.has(p.type) || slotted.has(p.type) || obsolete.get(p.type)) continue;
      if (p.government && p.government !== (adopted ?? now)) continue;
      if (p.slot !== slot.slot && !SLOT_ANY.get(slot.slot)) continue;
      take = p.type;
      bar = sp;
    }
    if (take !== null && take !== slot.policy) {
      if (slot.policy) slotted.delete(slot.policy);
      slotted.add(take);
      slot.policy = take;
    }
  }
  return { government: adopted, slots, deferred: false };
}

/** The choice as the seat's action record: the government's column and the
 *  slotted set's columns (the engine re-validates and lays them) */
export function policyRecord(view: MajorView, c: PolicyChoice): Pick<SeatActionRecord, 'government' | 'policies'> {
  const gi = c.government ? view.governmentColumn(c.government) : -1;
  return {
    government: gi >= 0 ? gi : null,
    policies: c.slots.flatMap((x) => {
      const i = x.policy ? view.policyColumn(x.policy) : -1;
      return i >= 0 ? [i] : [];
    }),
  };
}
