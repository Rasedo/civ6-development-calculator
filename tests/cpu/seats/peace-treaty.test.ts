import { describe, it, expect } from 'vitest';
import { civsAtWar, emptySeat, seatOfCityState, setWar, setWarTurnsWith, treatyTurnsWith } from '../../../cpu/core/seats';
import { makeState, settleAt, tileAtCoords } from '../helpers';
import { declareWar, sueForPeace, seatPhase } from '../../../cpu/core/phase';
import { declareWarOnCityState, sueForPeaceWithCityState } from '../../../cpu/core/cityStates';
import { PEACE_TREATY_TURNS, WAR_MIN_TURNS } from '../../../cpu/data/seats';
import type { CityState, GameState } from '../../../cpu/core/types';

// CIV 6: a peace treaty BINDS. Once peace is made neither side may declare on
// the other again until the term runs out, which is what stops a rich seat
// thrashing war -> peace -> war on one opponent.

function twoMajors(): GameState {
  const state = makeState();
  state.sandbox = true; // peace is free, so the scene is about the CLOCK
  state.seats.push(emptySeat(1));
  // the countdown rides the seat phase, which skips a seat with no cities
  settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
  settleAt(state, tileAtCoords(state.map, 9, 9).index, 1);
  return state;
}

function addCs(state: GameState, id: number): CityState {
  const t = tileAtCoords(state.map, 8, 8);
  const cityState = {
    ...emptySeat(seatOfCityState(id)),
    id,
    name: 'Kandy',
    type: 'scientific',
    centerIndex: t.index,
    population: 4,
    envoys: {},
    met: [0],
  } as unknown as CityState;
  state.cityStates.push(cityState);
  return cityState;
}

describe('the peace treaty', () => {
  it('binds the pair for its full term, then releases it', () => {
    const state = twoMajors();
    expect(declareWar(state, 0, 1).ok).toBe(true);
    setWarTurnsWith(state, 0, 1, WAR_MIN_TURNS);
    expect(sueForPeace(state, 0, 1).ok).toBe(true);
    expect(civsAtWar(state, 0, 1)).toBe(false);
    expect(treatyTurnsWith(state, 0, 1)).toBe(PEACE_TREATY_TURNS);

    const refused = declareWar(state, 0, 1);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('treaty');
    expect(declareWar(state, 1, 0).ok).toBe(false); // the OTHER side is bound too

    // one countdown per pair per turn, at the pair's lower seat's tail
    for (let i = 0; i < PEACE_TREATY_TURNS; i++) {
      state.turn += 1;
      seatPhase(state);
    }
    expect(treatyTurnsWith(state, 0, 1)).toBe(0);
    expect(declareWar(state, 0, 1).ok).toBe(true);
  });

  it('does not tick below zero, and a pair that never made peace is unbound', () => {
    const state = twoMajors();
    for (let i = 0; i < 5; i++) {
      state.turn += 1;
      seatPhase(state);
    }
    expect(treatyTurnsWith(state, 0, 1)).toBe(0);
    expect(declareWar(state, 0, 1).ok).toBe(true);
  });

  it('binds a city-state pairing the same way', () => {
    const state = twoMajors();
    const cityState = addCs(state, 1);
    expect(declareWarOnCityState(state, cityState.id, 0).ok).toBe(true);
    setWarTurnsWith(state, cityState.seat, 0, WAR_MIN_TURNS);
    expect(sueForPeaceWithCityState(state, cityState.id, 0).ok).toBe(true);
    expect(treatyTurnsWith(state, cityState.seat, 0)).toBe(PEACE_TREATY_TURNS);

    const refused = declareWarOnCityState(state, cityState.id, 0);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('treaty');

    for (let i = 0; i < PEACE_TREATY_TURNS; i++) {
      state.turn += 1;
      seatPhase(state);
    }
    expect(treatyTurnsWith(state, cityState.seat, 0)).toBe(0);
    expect(declareWarOnCityState(state, cityState.id, 0).ok).toBe(true);
  });

  it('a war that never ended in peace leaves no treaty behind', () => {
    const state = twoMajors();
    setWar(state, 0, 1, true);
    expect(treatyTurnsWith(state, 0, 1)).toBe(0);
  });
});
