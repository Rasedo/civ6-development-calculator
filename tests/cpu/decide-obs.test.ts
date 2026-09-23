/**
 * THE NEUTRAL OBSERVATION'S WORLD GROUP, TS side: every living city of every
 * holder — the majors in seat order, then the Free Cities — as [holder seat,
 * centre, followed religion] in each holder's array order; every living
 * city-state as [id, centre]; the Tribal Village tiles ascending. The gate
 * compares it with `gpu/core/neutral.py`'s `world_obs` every turn.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { foundCity } from '../../cpu/core/game';
import { flipCity } from '../../cpu/core/phase';
import { FREE_SEAT, emptySeat } from '../../cpu/core/seats';
import { worldObs } from '../../cpu/core/decideObs';
import type { CityState } from '../../cpu/core/types';

describe('worldObs', () => {
  it('lists the holders in seat order, the Free Cities last, city-states by roster', () => {
    const state = makeState(makeMap(20, 20));
    state.seats.push(emptySeat(1));
    const at = (c: number, r: number) => tileAtCoords(state.map, c, r).index;
    const a = foundCity(state, at(8, 8), 0).city!;
    const b = foundCity(state, at(12, 8), 0).city!;
    const c = foundCity(state, at(4, 15), 1).city!;
    expect([a, b, c].every(Boolean)).toBe(true);
    a.followedReligion = 1;
    flipCity(state, b);
    expect(state.freeSeat!.cities[0]!.centerIndex).toBe(b.centerIndex);
    state.cityStates.push({ id: 3, centerIndex: at(16, 16) } as unknown as CityState);
    state.map.tiles[at(2, 2)].goodyHut = true;
    state.map.tiles[at(1, 1)].goodyHut = true;
    state.turn = 7;
    expect(worldObs(state)).toEqual({
      turn: 7,
      cities: [[0, a.centerIndex, 1], [1, c.centerIndex, -1], [FREE_SEAT, b.centerIndex, -1]],
      cityStates: [[3, at(16, 16)]],
      goody: [at(1, 1), at(2, 2)],
    });
  });
});
