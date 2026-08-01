/**
 * #51/S2.4 — the per-seat turn body.
 *
 * The player's turn work lived in `game.ts:endTurn` and each rival's in the
 * per-rival loop of `rivals.ts:rivalPhase`, as two independent transcriptions
 * of the same rules. They had already drifted into being maintained by
 * comment: the rival copies carry "the player's twin", "the same position the
 * player uses", "mirrors the player's endTurn-top ...". This file is where
 * that stops being a promise and starts being one body.
 *
 * The PHASE DRIVER is untouched: game.ts still runs the player's block where
 * it always did and rivalPhase still runs each rival's where it always did,
 * so the draw order both engines depend on is exactly as before. Only the
 * work itself is shared.
 */

import type { City, GameState, QueueItem } from './types';
import { PLAYER_CIV, seatOf, isPlayerSeat, civsAtWar, rivalCount, civOfRival } from './seats';
import { isSuzerain } from './cityStates';
import { seatTourism } from './city';
import { computeAdoption } from './effects';
import { GOVERNMENTS, GOVERNMENTS_ADOPTION_LIVE } from '../data/policies';
import { DIPLO_FAVOR_PER_SUZERAIN } from '../data/rivals';

/** B-22 (#75): city-states this seat is Suzerain of. */
export function suzerainCount(state: GameState, seat: number = PLAYER_CIV): number {
  return state.cityStates.reduce((n, cs) => n + (isSuzerain(cs, seat) ? 1 : 0), 0);
}

/** B-22 (#75): diplomatic favor earned per turn — government tier plus one
 *  per suzerainty. */
export function diploFavorPerTurn(gov: string | null, suzerains: number): number {
  const tier = gov ? GOVERNMENTS[gov]?.tier ?? 0 : 0;
  return tier + DIPLO_FAVOR_PER_SUZERAIN * suzerains;
}

/**
 * Which government a seat is running.
 *
 * This is divergence (1) from `getModifiers`, and it lives in ONE place so the
 * two readers cannot drift: the player's government is STORED (an RL agent or
 * the UI slots the cards), a rival's is DERIVED from its research. They agree
 * today only because the scripted player adopts with the same function.
 * Round 7 gives rivals stored slots and this collapses to `s.government`.
 */
export function seatGovernmentId(state: GameState, seat: number): string | null {
  const s = seatOf(state, seat);
  if (!s) return null;
  if (isPlayerSeat(seat)) return s.government.current;
  return GOVERNMENTS_ADOPTION_LIVE ? computeAdoption(s.research).government : null;
}

/**
 * Is this seat at peace with every other civ?
 *
 * The two copies asked this differently — the player checked "no rival has
 * atWar", a rival checked "not atWar AND atWarRivals is empty" — because the
 * war state was stored asymmetrically. `civsAtWar` reads the same edge from
 * either end, so both are now the one question they always meant. City-state
 * wars are excluded here, as they were in both originals.
 */
export function atPeaceWithAllCivs(state: GameState, seat: number): boolean {
  for (let other = 0; other <= rivalCount(state); other++) {
    if (other !== seat && civsAtWar(state, seat, other)) return false;
  }
  return true;
}

/**
 * The per-turn civ-level accumulators, run at the same position in every
 * seat's turn so both engines mirror them together. Zero draws, integers
 * only — every one of these was already written twice, verbatim apart from
 * whose fields it touched.
 */
export function seatAccumulators(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  // B-20 (#71): TOURISM — Great Works plus every owned Seaside Resort (worth
  // its tile's appeal), accumulated once per turn at the civ level.
  s.tourism = (s.tourism ?? 0) + seatTourism(state, seat);
  // B-22 (#75): DIPLOMATIC FAVOR — government tier + suzerainties.
  s.diploFavor = (s.diploFavor ?? 0) + diploFavorPerTurn(seatGovernmentId(state, seat), suzerainCount(state, seat));
  // B-22 (#74): GRIEVANCES decay by 1 each turn this civ is at peace on every
  // axis (floor 0).
  if ((s.warmonger ?? 0) > 0 && atPeaceWithAllCivs(state, seat)) {
    s.warmonger = (s.warmonger ?? 0) - 1;
  }
}

/** The seat id for rival `rivalId` — re-exported so turn-body callers need
 *  only this module. */
export { civOfRival };

/**
 * #51/S2.4b — CITY GROWTH, for any seat's city.
 *
 * `RivalCity = City`, so the two transcriptions of this rule were byte-for-byte
 * the same arithmetic on the same field names: bank the surplus, grow at the
 * threshold, starve at a negative box with a floor of 1 pop. `game.ts:endTurn`
 * held one copy and the per-rival loop in `rivals.ts` held the other.
 *
 * The CALLER still computes the surplus, because the two seats reach it
 * differently — the player's `computeCityStats` returns
 * `effectiveFoodSurplus` with the housing/amenity/growth-mult chain already
 * folded in, while the rival path folds that chain at the call site. That
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
 * #51/S8.1a — THE ONE PLACE A SEAT'S PRODUCTION CHOICE IS COMMITTED.
 *
 * The rival ladder pushed straight onto `rc.queue` at nine separate sites while
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
