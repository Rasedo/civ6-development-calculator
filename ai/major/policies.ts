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
import { AI_GOVERNMENTS, AI_POLICIES } from './tables';
import type { MajorSlotView, MajorView } from './view';
import { AI_POLICY_HORIZON } from '../../cpu/data/aiValue';
import { NO_SCORE, SLOT_ANY, governmentValue, policyObsolete, slotTypeBest, type PolicyScores } from '../../cpu/core/aiPolicyValue';

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
