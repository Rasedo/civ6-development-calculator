/**
 * THE NEUTRAL OBSERVATION, TS side: what the decision server reads, emitted
 * by this engine as plain integers, in the shape `shared/decide.schema.json`
 * names and `gpu/core/neutral.py` emits. The gate compares the two every
 * turn before the decide; the driver still decides from the GPU's.
 *
 * So far the `world` group: the facts every seat sees alike.
 */
import type { GameState } from './types';
import { cityHolders } from './seats';
import { SEAT_GROUPS as SEAT_SCALARS } from './decideObsSeat';
import { SEAT_GROUPS as SEAT_MASKS } from './decideObsMasks';
import { SEAT_GROUPS as SEAT_BUY } from './decideObsBuy';
import { SEAT_GROUPS as SEAT_CITIES } from './decideObsCities';
import { SEAT_GROUPS as SEAT_TARGETS } from './decideObsTargets';
import { SEAT_GROUPS as SEAT_UNITS } from './decideObsUnits';

/** one per-seat group of the neutral observation: plain ints, lists, rows */
export type SeatEmitter = (state: GameState, seat: number) => unknown;

/** every registered per-seat group, one registry per module so two writers
 *  never share a file; a name registered twice is a programming error */
const SEAT_REGISTRIES: readonly Record<string, SeatEmitter>[] = [
  SEAT_SCALARS, SEAT_MASKS, SEAT_BUY, SEAT_CITIES, SEAT_TARGETS, SEAT_UNITS,
];

/** The per-seat groups for one seat, by group name. */
export function seatGroups(state: GameState, seat: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const reg of SEAT_REGISTRIES) {
    for (const [name, emit] of Object.entries(reg)) {
      if (name in out) throw new Error(`neutral group ${name} registered twice`);
      out[name] = emit(state, seat);
    }
  }
  return out;
}

export interface WorldObs {
  turn: number;
  /** [holder seat, centre, followed religion] per living city */
  cities: number[][];
  /** [id, centre] per living city-state */
  cityStates: number[][];
  goody: number[];
}

/** The `world` group: the turn, every living city of every holder (the
 *  majors, then the Free Cities — `cityHolders`) in array order, every
 *  living city-state in roster array order, and the Tribal Village tiles
 *  ascending. */
export function worldObs(state: GameState): WorldObs {
  const cities: number[][] = [];
  for (const holder of cityHolders(state)) {
    for (const c of holder.cities) cities.push([holder.seat, c.centerIndex, c.followedReligion ?? -1]);
  }
  const goody: number[] = [];
  for (const t of state.map.tiles) if (t.goodyHut) goody.push(t.index);
  return {
    turn: state.turn,
    cities,
    cityStates: (state.cityStates ?? []).map((cs) => [cs.id, cs.centerIndex]),
    goody,
  };
}
