import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { seatOf } from '../../../cpu/core/seats';
import { createGame, endTurn } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';

// religious victory (predominance in EVERY alive civ, >half of each
// civ's cities). Gate-unreachable at 250t on the current seeds (ambient +1
// pressure and 10/15 missionary lumps don't flip majorities everywhere by the
// horizon), so these pokes pin the semantics: victoryType 4 and its victor,
// the not-every-civ refusal, and the cityless-civ exclusion.

function newGame(opponents = 1) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, opponents,
  });
  settleFirstCity(state, 0);
  state.autoResearch = false;
  return state;
}

/** Pre-load pressure so this endTurn's spread flips every listed city to g. */
function pressAll(state: ReturnType<typeof newGame>, g: number, amount = 500) {
  const nRel = 1 + state.seats.length - 1;
  const all = [...seatOf(state, 0)!.cities, ...state.seats.slice(1).flatMap((civSeat) => civSeat.cities)];
  for (const c of all) {
    const pres = new Array(nRel).fill(0);
    pres[g] = amount;
    c.religionPressure = pres;
  }
}

describe('B6-S3 religious victory', () => {
  it('a civ religion predominant in every civ wins for THAT civ', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    civSeat.religion.founded = true;
    civSeat.religion.holyTile = civSeat.cities[0].centerIndex;
    pressAll(state, 1);
    endTurn(state);
    expect(state.victoryType).toBe(4);
    expect(state.victoryRow).toBe(1);
    expect(state.gameOver).toBe(true);
  });

  it("seat 0's religion predominant everywhere wins the SAME way", () => {
    const state = newGame(1);
    seatOf(state, 0)!.religion.founded = true;
    seatOf(state, 0)!.religion.holyTile = seatOf(state, 0)!.cities[0].centerIndex;
    pressAll(state, 0);
    endTurn(state);
    expect(state.victoryType).toBe(4);
    expect(state.victoryRow).toBe(0);
    expect(state.gameOver).toBe(true);
  });

  it('no victory while any alive civ lacks a >half majority', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    civSeat.religion.founded = true;
    civSeat.religion.holyTile = civSeat.cities[0].centerIndex;
    pressAll(state, 1);
    // Seat 0's single city resists: a dominant religion-0 accumulator
    // outweighs any ambient +1 religion-1 pressure this turn's spread adds.
    seatOf(state, 0)!.cities[0].religionPressure = [500, 0];
    endTurn(state);
    // 0 of 1 seat-0 cities follow religion 1 -> 0*2 <= 1 blocks the win.
    expect(state.victoryType).toBe(0);
    expect(state.gameOver).toBe(false);
  });

  it('a civ with zero cities is excluded from the every-civ requirement', () => {
    const state = newGame(2);
    const civSeat = (state.seats[(0) + 1] as Seat);
    // Civ 1 is eliminated: no cities, no units.
    (state.seats[(1) + 1] as Seat).cities = [];
    state.units = state.units.filter((u) => !(u.seat === (state.seats[(1) + 1] as Seat).seat));
    civSeat.religion.founded = true;
    civSeat.religion.holyTile = civSeat.cities[0].centerIndex;
    pressAll(state, 1);
    endTurn(state);
    expect(state.victoryType).toBe(4);
    expect(state.victoryRow).toBe(1);
    expect(state.gameOver).toBe(true);
  });
});
