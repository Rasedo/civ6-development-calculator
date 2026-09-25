import type { SeatEmitter } from './decideObs';
import type { GameState } from './types';
import { seatOf } from './seats';
import { cityStateById, envoysOf, hasMet } from './cityStates';
import { gpOffer } from './greatPeople';
import { GP_CLASSES } from '../data/greatPeople';
import { worldEraIndex } from './eras';
import { congressSessionDue, congressVoter, dvLeader, preference, specialSessionDue } from './congress';
import { CONGRESS_DV_MIN_ERA, CONGRESS_VOTE_STEP } from '../data/seats';
import { NUCLEAR_DEVICES } from '../data/nuclear';
import { siloTargets } from './combat';
import { canEnhanceReligion, canFoundReligion, openBeliefs } from './game';
import { BELIEF_CATALOGS, BELIEF_SLOTS } from '../data/religion';

/**
 * THE SEAT SCALARS (the silo launch, envoys, congress, the Great Person pass,
 * the religion's beliefs).
 *
 * The per-seat groups of the neutral observation this module emits, by the
 * GROUP NAME the GPU's `gpu/core/neutral.py` `seat_obs` uses for the same
 * group. The driver sends every registered group for every seat, and the gate
 * compares each one with the GPU's group of that name, field by field, before
 * the decide. A name the GPU does not emit is a red.
 */

/** The `nuke` group: the first device the seat holds whose silo reaches an
 *  offered target, and the lowest such tile; -1 each where there is none. */
function nukeGroup(state: GameState, seat: number): { device: number; tile: number } {
  for (let k = 0; k < NUCLEAR_DEVICES.length; k++) {
    const t = siloTargets(state, seat, k, 1);
    if (t.length) return { device: k, tile: t[0] };
  }
  return { device: -1, tile: -1 };
}

/** The `envoy` group: the bank, and per city-state roster index the envoys
 *  the seat holds there (the store, `envoysOf`), -1 where it has not met the
 *  city-state or the city-state is gone. */
function envoyGroup(state: GameState, seat: number): { avail: number; held: number[] } {
  const held: number[] = [];
  for (let i = 0; i < (state.cityStateMax ?? 0); i++) {
    const cs = cityStateById(state, i);
    held.push(cs && hasMet(cs, seat) ? envoysOf(cs, seat) : -1);
  }
  return { avail: seatOf(state, seat)?.envoysAvailable ?? 0, held };
}

/** The `congress` group: the Regular Session the coming step (turn + 1)
 *  would hold — its ANNOUNCED slate and the seat's `preference` per slot —
 *  whether it also holds the Diplomatic Victory resolution and who leads it,
 *  whether a Special Session sits, the seat's favor floored, the vote step. */
function congressGroup(state: GameState, seat: number): Record<string, unknown> {
  const turn = state.turn + 1;
  const worldEra = worldEraIndex(state);
  const fires = congressSessionDue(turn, worldEra);
  const slate = fires ? [...(state.congressSlate ?? [-1, -1])] : [-1, -1];
  const prefOutcome = [-1, -1], prefTarget = [-1, -1];
  if (slate.some((r) => r >= 0)) {
    const ctx = congressVoter(state, seat);
    slate.forEach((r, i) => {
      if (r < 0) return;
      const p = preference(state, r, seat, ctx);
      prefOutcome[i] = p.outcome;
      prefTarget[i] = p.target;
    });
  }
  const dv = fires && worldEra >= CONGRESS_DV_MIN_ERA;
  return {
    slate, pref_outcome: prefOutcome, pref_target: prefTarget, dv,
    leader: dv ? dvLeader(state) : -1,
    special: specialSessionDue(state, turn, worldEra),
    favor: Math.floor(seatOf(state, seat)?.diplomaticFavor ?? 0),
    vote_step: CONGRESS_VOTE_STEP,
  };
}

/** The `gp` group, per Great Person class: the standing offer (`gpOffer`),
 *  who passed on it, its frozen price, and the seat's points floored. */
function gpGroup(state: GameState, seat: number): Record<string, number[]> {
  const sx = seatOf(state, seat);
  return {
    offer: GP_CLASSES.map((c) => gpOffer(state, c)),
    passed_by: GP_CLASSES.map((_c, i) => state.gpPassedBy?.[i] ?? -1),
    price: GP_CLASSES.map((_c, i) => state.gpPrice?.[i] ?? 0),
    points: GP_CLASSES.map((c) => Math.floor(sx?.gpp[c] ?? 0)),
  };
}

/** The `belief` group: whether the seat may found or enhance its religion
 *  now (`canFoundReligion` / `canEnhanceReligion`), the class catalog row its
 *  religion holds per class (-1 none), and each class's open beliefs. */
function beliefGroup(state: GameState, seat: number): Record<string, unknown> {
  const rel = seatOf(state, seat)?.religion;
  const open = (c: number) => {
    const ids = Object.keys(BELIEF_CATALOGS[c]);
    return openBeliefs(state, c).map((id) => ids.indexOf(id));
  };
  return {
    found: canFoundReligion(state, seat).ok,
    enhance: canEnhanceReligion(state, seat).ok,
    held: BELIEF_SLOTS.map((slot, c) => {
      const id = rel?.[slot];
      return id ? Object.keys(BELIEF_CATALOGS[c]).indexOf(id) : -1;
    }),
    follower: open(0),
    worship: open(1),
    founder: open(2),
    enhancer: open(3),
  };
}

export const SEAT_GROUPS: Record<string, SeatEmitter> = {
  nuke: nukeGroup,
  envoy: envoyGroup,
  congress: congressGroup,
  gp: gpGroup,
  belief: beliefGroup,
};
