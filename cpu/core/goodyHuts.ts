import { nextRandom } from './rand';
import { GOODY_KINDS, GOODY_SUBTYPES, type GoodyKind, type GoodySubType } from '../data/goodyHuts';
import type { GameState } from './types';

/**
 * THE TRIBAL VILLAGE DRAW (C-47).
 *
 * The install publishes two weighted tables and no rule joining them, so the
 * shape below is the natural reading of that pair and is recorded as a MODEL
 * choice: pick a KIND uniformly among those with an eligible subtype (every
 * `GoodyHuts` row carries Weight 100, so uniform is what those weights say),
 * then pick a SUBTYPE within it by its own weight.
 *
 * Kept apart from the payout on purpose: this is the half that consumes the
 * rng, so it is the half both engines must agree on step for step. It takes
 * exactly TWO draws when anything is eligible and NONE when nothing is, which
 * is what lets a village on a seat that can claim nothing leave the stream
 * where it found it.
 *
 * The GPU twin is `_draw_goody_reward`.
 */
export function goodyEligible(sub: GoodySubType, turn: number, hasCity: boolean): boolean {
  // a weight of 0 is a subtype this ruleset turns OFF, not a free one
  if (sub.weight <= 0) return false;
  if (sub.turn != null && turn < sub.turn) return false;
  if (sub.minOneCity && !hasCity) return false;
  return true;
}

export function eligibleGoodyKinds(turn: number, hasCity: boolean): GoodyKind[] {
  return GOODY_KINDS.filter((k) =>
    GOODY_SUBTYPES.some((s) => s.hut === k && goodyEligible(s, turn, hasCity)));
}

export function drawGoodyReward(
  state: GameState,
  turn: number,
  hasCity: boolean,
): GoodySubType | null {
  const kinds = eligibleGoodyKinds(turn, hasCity);
  if (!kinds.length) return null;
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(nextRandom(state) * kinds.length))];
  const subs = GOODY_SUBTYPES.filter((s) => s.hut === kind && goodyEligible(s, turn, hasCity));
  const total = subs.reduce((n, s) => n + s.weight, 0);
  let r = nextRandom(state) * total;
  for (const s of subs) {
    r -= s.weight;
    if (r < 0) return s;
  }
  return subs[subs.length - 1];
}
