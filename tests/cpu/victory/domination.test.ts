import { describe, it, expect } from 'vitest';
import { dominationWinner } from '../../../cpu/core/game';
import type { GameState } from '../../../cpu/core/types';

// DominationWinner reads only capitalTiles + who currently has a city
// centered on each. These focused cases pin the semantics (the real risk — the
// gate never triggers domination by t100, so parity alone can't validate it).
// A seat carries its OWN id and its OWN capital tile; `capitalTiles[i]` here is
// just this helper's shorthand for handing seat i one. A capital left off the
// end is a seat that has not founded yet.
const mk = (capitalTiles: number[], seat0Centers: number[], civCenters: number[][]): GameState =>
  ({
    seats: [
      { seat: 0, capitalTile: capitalTiles[0], cities: seat0Centers.map((centerIndex) => ({ centerIndex })) },
      ...civCenters.map((cities, i) => ({
        seat: i + 1,
        capitalTile: capitalTiles[i + 1],
        cities: cities.map((centerIndex) => ({ centerIndex })),
      })),
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
    expect(dominationWinner(mk([10, 20], [10], [[20], []]))).toBe(-1);
  });
});
