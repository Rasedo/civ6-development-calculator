/**
 * THE POLICY AND GOVERNMENT VALUES (GameCore_XP2_Release.dll; dll_readings
 * "C-97: the government and policy choice"): the policy job (0x621eb0) and
 * its value (0x7b26b0), the best card per slot type (0x620110) and a
 * government's value (0x7b0330), on any party's view (a city-state's one
 * city its capital, its civilization level barring great people and
 * Influence); the majors' policy choice (`ai/major/policies.ts`) reads them.
 */
import { AI_GOVERNMENTS, AI_POLICIES, AI_SLOT_TYPES } from '../../ai/major/tables';
import type { AiPolicy } from '../../ai/major/types';
import type { MajorView } from '../../ai/major/view';
import { AI_POLICY_HORIZON } from '../data/aiValue';
import { AI_RATE, FX_MIN, fdiv, presentValue, pseudoYieldValue } from './aiValue';
import { modifiersValue, type ValueTerms } from './aiModifiers';

/** a job that never ran, or whose card the player cannot reach: -1.0 */
export const NO_SCORE = -256;
/** a Dark Age card in a Dark Age, a Golden Age card in a Golden Age */
const AGE_BONUS = 250 * 256;

/** the seat's policy scores in database order, fixed point (the list at
 *  PolicyAI +0x9e8, entry +0x48) */
export type PolicyScores = ReadonlyMap<string, number>;

export const SLOT_ANY = new Map(AI_SLOT_TYPES.map((s) => [s.type, s.any] as const));

/** ObsoletePolicies (0x39e050): its obsoleting card's civic is held, or the
 *  player cannot earn the great person class it needs (0x2f1ed0: its
 *  civilization level's CanEarnGreatPeople, 0x43a980 — a city-state's and the
 *  Free Cities' levels lack it — or the class is spent) */
export function policyObsolete(view: MajorView, seat: number, p: AiPolicy): boolean {
  const held = view.civicsHeld(seat);
  for (const o of p.obsolete) {
    if (o.policy) {
      const by = AI_POLICIES.find((q) => q.type === o.policy);
      if (by?.civic && held.has(by.civic)) return true;
    }
    if (o.gpClass && (!view.fullCiv(seat) || !view.greatPersonClassAvailable(o.gpClass))) return true;
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
