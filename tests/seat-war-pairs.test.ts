import { describe, it, expect } from 'vitest';
import { createGame, foundCity } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import {
  civsAtWar, PLAYER_CIV, civOfRival, seatOfCityState, BARB_SEAT, rivalsOf,
} from '../src/core/seats';
import { unitsHostile } from '../src/core/units';
import type { GameState } from '../src/core/types';

// #51/S6.3 — the war relation must answer for EVERY seat pair, the way the
// GPU's one symmetric matrix does (S6.0). `civsAtWar` and `unitsHostile` both
// used to fall through their rival branches for a CITY-STATE seat and report
// peace even while `CityState.atWar` was true.

function newGame(): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 909,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 2, rivals: 2,
  });
  foundCity(state, scoreSettleSites(state, 1)[0].tileIndex);
  return state;
}

describe('the war relation covers every seat pair', () => {
  it('player <-> city-state reads CityState.atWar, both orders', () => {
    const state = newGame();
    const cs = state.cityStates![0];
    const seat = seatOfCityState(cs.id);
    expect(civsAtWar(state, PLAYER_CIV, seat)).toBe(false);
    expect(civsAtWar(state, seat, PLAYER_CIV)).toBe(false);
    cs.atWar = true;
    expect(civsAtWar(state, PLAYER_CIV, seat)).toBe(true);
    expect(civsAtWar(state, seat, PLAYER_CIV)).toBe(true);
  });

  it('a city-state unit is hostile to a player unit exactly when at war', () => {
    const state = newGame();
    const cs = state.cityStates![0];
    const a = { seat: seatOfCityState(cs.id) };
    const b = { seat: PLAYER_CIV };
    expect(unitsHostile(state, a, b)).toBe(false);
    cs.atWar = true;
    expect(unitsHostile(state, a, b)).toBe(true);
    expect(unitsHostile(state, b, a)).toBe(true);
  });

  it('two city-states never fight, and a seat is never at war with itself', () => {
    const state = newGame();
    const s0 = seatOfCityState(state.cityStates![0].id);
    const s1 = seatOfCityState(state.cityStates![1].id);
    state.cityStates![0].atWar = true;
    state.cityStates![1].atWar = true;
    expect(civsAtWar(state, s0, s1)).toBe(false);
    expect(civsAtWar(state, s0, s0)).toBe(false);
    expect(unitsHostile(state, { seat: s0 }, { seat: s1 })).toBe(false);
  });

  it('rival <-> city-state is NOT MODELLED and answers false even at war', () => {
    // Recorded, not approximated: a rival can conquer a city-state (A-12b)
    // with no war state between them ever existing. If that changes, this
    // expectation is the thing to update — deliberately, not by accident.
    const state = newGame();
    const cs = state.cityStates![0];
    cs.atWar = true;
    expect(civsAtWar(state, civOfRival(0), seatOfCityState(cs.id))).toBe(false);
  });

  it('the barbarian arm still wins over everything', () => {
    const state = newGame();
    const cs = state.cityStates![0];
    expect(unitsHostile(state, { seat: BARB_SEAT }, { seat: seatOfCityState(cs.id) })).toBe(true);
    expect(unitsHostile(state, { seat: BARB_SEAT }, { seat: BARB_SEAT })).toBe(false);
  });

  it('the rival arms are untouched', () => {
    const state = newGame();
    const r0 = rivalsOf(state)[0];
    expect(civsAtWar(state, PLAYER_CIV, civOfRival(0))).toBe(false);
    r0.atWar = true;
    expect(civsAtWar(state, PLAYER_CIV, civOfRival(0))).toBe(true);
    expect(civsAtWar(state, civOfRival(0), civOfRival(1))).toBe(false);
  });
});
