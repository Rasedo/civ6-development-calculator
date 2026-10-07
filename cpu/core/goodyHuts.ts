import { randRange } from './rand';
import { GOODY_KINDS, GOODY_SUBTYPES, goodyKindWeight, type GoodyKind, type GoodySubType } from '../data/goodyHuts';
import { scaleByGameSpeed } from '../data/constants';
import type { GameState, Seat } from './types';
import { hasMet } from './cityStates';
import { hiddenResourcesFor } from './seats';
import { stockOf, stockpileCap } from './stockpile';
import { STRATEGIC_IDS } from '../data/constants';
import { gwHasRoom } from './greatWorks';
import { GWO_RELIC } from '../data/greatWorks';

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
export function goodyEligible(state: GameState, sub: GoodySubType, claimer: Seat): boolean {
  // a weight of 0 is a subtype this ruleset turns OFF, not a free one
  if (sub.weight <= 0) return false;
  // the row's Turn at the game's speed (0x42c980 through 0x5254d0;
  // runs/h1_duelw1117 t13: Medium Gold's Turn 20 open, the Gold pick over 85)
  if (sub.turn != null && state.turn < scaleByGameSpeed(sub.turn)) return false;
  if (sub.minOneCity && !claimer.cities.length) return false;
  // 0x42c980's other gates: a Relic slot in one of the claimer's cities
  // (0x497030), a city-state the claimer has met (the XP2 row's CityState),
  // a strategic resource it sees below its stockpile's ceiling
  // (StrategicResources: 0x4ac140, 0x4aa790 against 0x4aabe0)
  if (sub.relic && !claimer.cities.some((c) => gwHasRoom(state, c, GWO_RELIC))) return false;
  if (sub.cityState && !state.cityStates.some((cs) => hasMet(cs, claimer.seat))) return false;
  if (sub.strategic) {
    const hidden = hiddenResourcesFor(state, claimer.seat);
    const cap = stockpileCap(state, claimer.seat);
    if (!STRATEGIC_IDS.some((r) => !hidden.has(r) && stockOf(state, claimer.seat, r) < cap)) return false;
  }
  return true;
}

export function eligibleGoodyKinds(state: GameState, claimer: Seat): GoodyKind[] {
  return GOODY_KINDS.filter((k) =>
    GOODY_SUBTYPES.some((s) => s.hut === k && goodyEligible(state, s, claimer)));
}

export function drawGoodyReward(state: GameState, claimer: Seat): GoodySubType | null {
  const kinds = eligibleGoodyKinds(state, claimer);
  if (!kinds.length) return null;
  const had = claimer.goodyKinds ?? GOODY_KINDS.map(() => 0);
  const weights = kinds.map((k) => goodyKindWeight(had[GOODY_KINDS.indexOf(k)]));
  // "Choosing a Goody Hut Type", then "Choosing a Sub Type": the game's draws
  let at = randRange(state, weights.reduce((n, w) => n + w, 0), 'Choosing a Goody Hut Type');
  let kind = kinds[kinds.length - 1];
  for (let i = 0; i < kinds.length; i++) {
    at -= weights[i];
    if (at < 0) { kind = kinds[i]; break; }
  }
  const subs = GOODY_SUBTYPES.filter((s) => s.hut === kind && goodyEligible(state, s, claimer));
  const total = subs.reduce((n, s) => n + s.weight, 0);
  let r = randRange(state, total, 'Choosing a Sub Type');
  let out = subs[subs.length - 1];
  for (const s of subs) {
    r -= s.weight;
    if (r < 0) { out = s; break; }
  }
  claimer.goodyKinds = had.map((n, i) => n + (GOODY_KINDS[i] === kind ? 1 : 0));
  return out;
}
