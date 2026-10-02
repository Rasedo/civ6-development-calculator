import { describe, it, expect } from 'vitest';
import { makeMap, makeState } from '../helpers';
import { emptySeat } from '../../../cpu/core/seats';
import { gameEraTurn } from '../../../cpu/core/eras';
import { AGE_START_BARS, ageBars } from '../../../cpu/data/seats';
import { ERAS, TECHS } from '../../../cpu/data/techs';
import type { GameState } from '../../../cpu/core/types';

/** run the game era's step on every turn from the state's turn through `to`,
 *  returning the turns a new era began on */
function runTo(state: GameState, to: number): number[] {
  const began: number[] = [];
  while (state.turn < to) {
    state.turn += 1;
    if (gameEraTurn(state)) began.push(state.turn);
  }
  return began;
}

function twoSeats(): GameState {
  const state = makeState(makeMap(12, 12));
  state.seats.push(emptySeat(1));
  return state;
}

describe('the game era', () => {
  it('runs its online maximum, 30 turns, when no major stands ahead (H-1: 31, 61, 91)', () => {
    const state = twoSeats();
    expect([state.gameEra, state.eraStartTurn, state.eraCountdown]).toEqual([0, 1, -1]);
    expect(runTo(state, 95)).toEqual([31, 61, 91]);
    expect([state.gameEra, state.eraStartTurn]).toEqual([3, 91]);
  });

  it('counts down from the minimum less ten once half the majors stand in a later era', () => {
    const state = twoSeats();
    const classical = Object.keys(TECHS).find((id) => TECHS[id].era === 'Classical')!;
    state.seats[1].research.techs.push(classical);
    // the countdown may start from turn 1 + 20 - 10 = 11, the era 10 turns on
    expect(runTo(state, 25)).toEqual([21]);
    // one of three is not half: the next era waits for its maximum
    const state3 = twoSeats();
    state3.seats.push(emptySeat(2));
    state3.seats[1].research.techs.push(classical);
    expect(runTo(state3, 35)).toEqual([31]);
  });

  it('ends at the last era', () => {
    const state = twoSeats();
    state.gameEra = ERAS.length - 1;
    expect(runTo(state, 100)).toEqual([]);
  });
});

describe('the age bars', () => {
  it('fix the score plus the scaled bases and the shifts (H-1 Duel 1104, Qin)', () => {
    expect(AGE_START_BARS).toEqual([8, 19]);
    // Classical, one city: 10 + 11 / 22
    expect(ageBars(10, 1, 0, 0, 1)).toEqual([21, 32]);
    // Medieval out of a Dark age, two cities
    expect(ageBars(20, 2, 0, 1, 2)).toEqual([27, 38]);
    // Renaissance out of a Heroic age, three cities
    expect(ageBars(73, 3, 1, 1, 3)).toEqual([86, 97]);
    // never below 0
    expect(ageBars(0, 0, 0, 5, 1)).toEqual([0, 0]);
  });
});
