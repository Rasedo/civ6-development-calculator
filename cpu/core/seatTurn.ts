/**
 * The per-seat turn body.
 *
 * The player's turn work lived in `game.ts:endTurn` and each seat's in the
 * per-seat loop of `phase.ts:seatPhase`, as two independent transcriptions
 * of the same rules. They had already drifted into being maintained by
 * comment: the seat copies carry "the player's twin", "the same position the
 * player uses", "mirrors the player's endTurn-top ...". This file is where
 * that stops being a promise and starts being one body.
 *
 * The PHASE DRIVER is untouched: game.ts still runs the player's block where
 * it always did and seatPhase still runs each seat's where it always did,
 * so the draw order both engines depend on is exactly as before. Only the
 * work itself is shared.
 */

import type { City, GameState, QueueItem } from './types';
import { seatOf, civsAtWar, seatOfIndex } from './seats';
// S1(a): the ctx block reads the scripted DoW site's own helpers. phase.ts
// already imports from THIS module — the cycle is function-level and resolves
// at call time (observeSeat runs long after module init).
import { isSuzerain } from './cityStates';
import { seatTourism } from './city';
import { computeAdoption } from './effects';
import { GOVERNMENTS, GOVERNMENTS_ADOPTION_LIVE } from '../data/policies';
import { DIPLO_FAVOR_PER_SUZERAIN } from '../data/seats';

/** city-states this seat is Suzerain of. */
export function suzerainCount(state: GameState, seat: number): number {
  return state.cityStates.reduce((n, cs) => n + (isSuzerain(cs, seat) ? 1 : 0), 0);
}

/** diplomatic favor earned per turn — government tier plus one
 *  per suzerainty. */
export function diplomaticFavorPerTurn(gov: string | null, suzerains: number): number {
  const tier = gov ? GOVERNMENTS[gov]?.tier ?? 0 : 0;
  return tier + DIPLO_FAVOR_PER_SUZERAIN * suzerains;
}

/**
 * Which government a seat is running.
 *
 * This is divergence (1) from `getModifiers`, and it lives in ONE place so the
 * two readers cannot drift: the player's government is STORED (an RL agent or
 * the UI slots the cards), a seat's is DERIVED from its research. They agree
 * today only because the scripted player adopts with the same function.
 * Round 7 gives the other seats stored slots and this collapses to `s.government`.
 */
export function seatGovernmentId(state: GameState, seat: number): string | null {
  const s = seatOf(state, seat);
  if (!s) return null;
  // One rule: the government is a pure function of the seat's own research.
  // Seat 0 stores the same value (endTurn recomputes it with this function),
  // so reading the derivation is the same answer without the fork.
  return GOVERNMENTS_ADOPTION_LIVE ? computeAdoption(s.research).government : s.government.current;
}

/**
 * Is this seat at peace with every other civ?
 *
 * `civsAtWar` reads the same edge from either end, so the question is asked
 * once for every seat. City-state wars are excluded.
 */
export function atPeaceWithAllCivs(state: GameState, seat: number): boolean {
  for (let other = 0; other <= state.seats.length - 1; other++) {
    if (other !== seat && civsAtWar(state, seat, other)) return false;
  }
  return true;
}

/**
 * The per-turn civ-level accumulators, run at the same position in every
 * seat's turn so both engines mirror them together. Zero draws, integers only.
 */
export function seatAccumulators(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  // TOURISM — Great Works plus every owned Seaside Resort (worth
  // its tile's appeal), accumulated once per turn at the civ level.
  s.tourism = (s.tourism ?? 0) + seatTourism(state, seat);
  // DIPLOMATIC FAVOR — government tier + suzerainties.
  s.diplomaticFavor = (s.diplomaticFavor ?? 0) + diplomaticFavorPerTurn(seatGovernmentId(state, seat), suzerainCount(state, seat));
  // GRIEVANCES decay by 1 each turn this civ is at peace on every
  // axis (floor 0).
  if ((s.warmonger ?? 0) > 0 && atPeaceWithAllCivs(state, seat)) {
    s.warmonger = (s.warmonger ?? 0) - 1;
  }
}

/** The seat id for seat `seatIndex` — re-exported so turn-body callers need
 *  only this module. */
export { seatOfIndex };

/**
 * CITY GROWTH, for any seat's city.
 *
 * `City = City`, so the two transcriptions of this rule were byte-for-byte
 * the same arithmetic on the same field names: bank the surplus, grow at the
 * threshold, starve at a negative box with a floor of 1 pop. `game.ts:endTurn`
 * held one copy and the per-seat loop in `phase.ts` held the other.
 *
 * The CALLER still computes the surplus, because the two seats reach it
 * differently — the player's `computeCityStats` returns
 * `effectiveFoodSurplus` with the housing/amenity/growth-mult chain already
 * folded in, while the seat path folds that chain at the call site. That
 * difference is real and is its own slice; the growth RULE is not.
 */
export function seatGrowth(city: City, surplus: number, growthNeeded: number): void {
  city.foodBox += surplus;
  if (city.foodBox >= growthNeeded) {
    city.population += 1;
    city.foodBox -= growthNeeded;
  } else if (city.foodBox < 0) {
    city.population = Math.max(1, city.population - 1);
    city.foodBox = 0;
  }
}

/**
 * THE ONE PLACE A SEAT'S PRODUCTION CHOICE IS COMMITTED.
 *
 * The seat ladder pushed straight onto `rc.queue` at nine separate sites while
 * an externally-driven seat's choice arrived as an ACTION and went through a
 * different applier. Two appliers for one decision is why a net cannot be
 * handed the AI's moves: the AI never produces a move, it produces a mutation.
 *
 * Every commit now goes through here, which makes the choice observable at a
 * single seam — that is what the seat-tagged action log needs, and it is the
 * completeness check for the conversion: a queue that changed without a
 * `commitProduction` call is state moving behind the applier's back.
 *
 * Deliberately NOT a decision function. The ladder still decides; this only
 * commits. Logging the walk instead of the pick would make two engines that
 * choose identically produce different streams.
 */
export function commitProduction(state: GameState, seat: number, city: City, item: QueueItem): void {
  city.queue.push(item);
  if (process.env.CIV6_ALOG) {
    const what =
      item.kind === 'unit' ? item.unit
      : item.kind === 'building' ? item.building
      : item.kind === 'district' ? item.district
      : item.kind === 'wonder' ? item.wonder
      : item.kind === 'project' ? item.project
      : item.kind;
    console.error(`ALOG t${state.turn} s${seat} prod city=${city.id} ${item.kind}:${what}`);
  }
}


/**
 * The remaining COMMIT seams, same contract as `commitProduction`.
 *
 * Each is the one place a seat's choice of that kind lands, so the seat-tagged
 * stream is complete rather than production-only. Completeness is the point:
 * the invariant the log exists to prove is that a seat's state changes are all
 * explained by its logged actions, and a verb with no seam is a hole in that.
 *
 * As with production these COMMIT, they do not decide, and they log the pick
 * rather than the walk.
 */
export function commitResearch(state: GameState, seat: number, kind: 'tech' | 'civic', id: string | null): void {
  const s = seatOf(state, seat);
  if (!s) return;
  if (kind === 'tech') s.research.tech = id;
  else s.research.civic = id;
  if (process.env.CIV6_ALOG && id !== null) {
    console.error(`ALOG t${state.turn} s${seat} ${kind} ${id}`);
  }
}

/** A unit order committed by a seat — the verb plus where it landed. */
export function logUnitOrder(state: GameState, seat: number, unitId: number, verb: string, tileIndex: number): void {
  if (process.env.CIV6_ALOG) {
    console.error(`ALOG t${state.turn} s${seat} ${verb} unit=${unitId} tile=${tileIndex}`);
  }
}
