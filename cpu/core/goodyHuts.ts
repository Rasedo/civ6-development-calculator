import { randRange } from './rand';
import { GOODY_KINDS, GOODY_SUBTYPES, goodyKindWeight, type GoodyKind, type GoodySubType } from '../data/goodyHuts';
import { scaleByGameSpeed } from '../data/constants';
import type { GameState, Seat } from './types';

/**
 * THE TRIBAL VILLAGE DRAW (0x42bdd0, dll_readings "H-1: the goody hut's
 * kind"): ONE weighted pick of a KIND among those with an eligible subtype,
 * each weighing `goodyKindWeight` of the times its claimer has had it
 * ("Choosing a Goody Hut Type"), then ONE of a SUBTYPE within it by its own
 * weight ("Choosing a Sub Type").
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
  // the row's Turn at the game's speed (0x42c980 through 0x5254d0;
  // runs/h1_duelw1117 t13: Medium Gold's Turn 20 open, the Gold pick over 85)
  if (sub.turn != null && turn < scaleByGameSpeed(sub.turn)) return false;
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
  claimer: Seat,
): GoodySubType | null {
  const kinds = eligibleGoodyKinds(turn, hasCity);
  if (!kinds.length) return null;
  const had = claimer.goodyKinds ?? GOODY_KINDS.map(() => 0);
  const weights = kinds.map((k) => goodyKindWeight(had[GOODY_KINDS.indexOf(k)]));
  // "Choosing a Goody Hut Type", then "Choosing a Sub Type": the game's draws
  let at = randRange(state, weights.reduce((n, w) => n + w, 0));
  let kind = kinds[kinds.length - 1];
  for (let i = 0; i < kinds.length; i++) {
    at -= weights[i];
    if (at < 0) { kind = kinds[i]; break; }
  }
  const subs = GOODY_SUBTYPES.filter((s) => s.hut === kind && goodyEligible(s, turn, hasCity));
  const total = subs.reduce((n, s) => n + s.weight, 0);
  let r = randRange(state, total);
  let out = subs[subs.length - 1];
  for (const s of subs) {
    r -= s.weight;
    if (r < 0) { out = s; break; }
  }
  claimer.goodyKinds = had.map((n, i) => n + (GOODY_KINDS[i] === kind ? 1 : 0));
  return out;
}
