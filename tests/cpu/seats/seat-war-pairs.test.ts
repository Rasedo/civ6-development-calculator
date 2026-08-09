import { describe, it, expect } from 'vitest';
import { createGame } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';
import { civsAtWar, setWar, seatOfIndex, seatOfCityState, BARB_SEAT } from '../../../cpu/core/seats';
import { unitsHostile } from '../../../cpu/core/units';
import type { GameState } from '../../../cpu/core/types';

// The war relation must answer for EVERY seat pair, the way the GPU's one
// symmetric matrix does. Both engines now keep a single store, so one `setWar`
// has to read back true from either side of the pair.

function newGame(): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 909,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 2, opponents: 2,
  });
  settleFirstCity(state, 0);
  return state;
}

describe('the war relation covers every seat pair', () => {
  it('a civ and a city-state read the one war store, both orders', () => {
    const state = newGame();
    const cs = state.cityStates![0];
    const seat = seatOfCityState(cs.id);
    expect(civsAtWar(state, 0, seat)).toBe(false);
    expect(civsAtWar(state, seat, 0)).toBe(false);
    setWar(state, seat, 0, true);
    expect(civsAtWar(state, 0, seat)).toBe(true);
    expect(civsAtWar(state, seat, 0)).toBe(true);
  });

  it('a city-state unit is hostile to a seat-0 unit exactly when at war', () => {
    const state = newGame();
    const cs = state.cityStates![0];
    const a = { seat: seatOfCityState(cs.id) };
    const b = { seat: 0 };
    expect(unitsHostile(state, a, b)).toBe(false);
    setWar(state, seatOfCityState(cs.id), 0, true);
    expect(unitsHostile(state, a, b)).toBe(true);
    expect(unitsHostile(state, b, a)).toBe(true);
  });

  it('two city-states never fight, and a seat is never at war with itself', () => {
    const state = newGame();
    const s0 = seatOfCityState(state.cityStates![0].id);
    const s1 = seatOfCityState(state.cityStates![1].id);
    setWar(state, s0, 0, true);
    setWar(state, s1, 0, true);
    expect(civsAtWar(state, s0, s1)).toBe(false);
    expect(civsAtWar(state, s0, s0)).toBe(false);
    expect(unitsHostile(state, { seat: s0 }, { seat: s1 })).toBe(false);
  });

  it('the barbarian arm still wins over everything', () => {
    const state = newGame();
    const cs = state.cityStates![0];
    expect(unitsHostile(state, { seat: BARB_SEAT }, { seat: seatOfCityState(cs.id) })).toBe(true);
    expect(unitsHostile(state, { seat: BARB_SEAT }, { seat: BARB_SEAT })).toBe(false);
  });

  it('civ against civ reads the same store', () => {
    const state = newGame();
    const r0 = state.seats.slice(1)[0];
    expect(civsAtWar(state, 0, seatOfIndex(0))).toBe(false);
    setWar(state, r0.seat, 0, true);
    expect(civsAtWar(state, 0, seatOfIndex(0))).toBe(true);
    expect(civsAtWar(state, seatOfIndex(0), seatOfIndex(1))).toBe(false);
  });
});
