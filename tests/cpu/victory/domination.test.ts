import { describe, it, expect } from 'vitest';
import { dominationWinner } from '../../../cpu/core/game';
import { seatOf } from '../../../cpu/core/seats';
import type { GameState } from '../../../cpu/core/types';

// DominationWinner reads only capitalTiles + who currently has a city
// centered on each. These focused cases pin the semantics (the real risk — the
// gate never triggers domination by t100, so parity alone can't validate it).
const mk = (capitalTiles: number[], seat0Centers: number[], civCenters: number[][]): GameState =>
  ({
    capitalTiles,
    // Seats[0] is seat 0, seats[r+1] the other civs — and EVERY seat
    // holds its own cities, so seat 0's live here like anyone else's.
    seats: [
      { seat: 0, cities: seat0Centers.map((centerIndex) => ({ centerIndex })) },
      ...civCenters.map((cityState) => ({ cities: cityState.map((centerIndex) => ({ centerIndex })) })),
    ],
  }) as unknown as GameState;

describe('dominationWinner', () => {
  const caps = [10, 20, 30]; // seat 0 cap 10, seat 1 cap 20, seat 2 cap 30

  it('is -1 while capitals are split among civs', () => {
    expect(dominationWinner(mk(caps, [10], [[20], [30]]))).toBe(-1);
  });

  it('is 0 when seat 0 holds every capital (all captured)', () => {
    expect(dominationWinner(mk(caps, [10, 20, 30], [[], []]))).toBe(0);
  });

  it('is r+1 when a civ holds every capital', () => {
    expect(dominationWinner(mk(caps, [], [[10, 20, 30], []]))).toBe(1);
  });

  it('is -1 when a capital was razed (no city on the tile)', () => {
    expect(dominationWinner(mk(caps, [10, 20], [[], []]))).toBe(-1);
  });

  it('is -1 before every capital is founded', () => {
    // only seat 0 and one civ have founded (capitalTiles[2] missing)
    const s = mk([10, 20], [10], [[20], []]);
    [10, 20].forEach((t, i) => { const st = seatOf(s, i); if (st) st.capitalTile = t; }); // seat 2 unfounded, so the capital count falls short of the seat count
    expect(dominationWinner(s)).toBe(-1);
  });
});
