import { describe, it, expect } from 'vitest';
import { dominationWinner } from '../src/core/game';
import type { GameState } from '../src/core/types';

// GV-3: dominationWinner reads only capitalTiles + who currently has a city
// centered on each. These focused cases pin the semantics (the real risk — the
// gate never triggers domination by t100, so parity alone can't validate it).
const mk = (capitalTiles: number[], playerCenters: number[], rivalCenters: number[][]): GameState =>
  ({
    capitalTiles,
    cities: playerCenters.map((centerIndex) => ({ centerIndex })),
    rivals: rivalCenters.map((cs) => ({ cities: cs.map((centerIndex) => ({ centerIndex })) })),
  }) as unknown as GameState;

describe('GV-3 dominationWinner', () => {
  const caps = [10, 20, 30]; // player cap 10, rival0 cap 20, rival1 cap 30

  it('is -1 while capitals are split among civs', () => {
    expect(dominationWinner(mk(caps, [10], [[20], [30]]))).toBe(-1);
  });

  it('is 0 when the player holds every capital (all captured)', () => {
    expect(dominationWinner(mk(caps, [10, 20, 30], [[], []]))).toBe(0);
  });

  it('is r+1 when a rival holds every capital', () => {
    expect(dominationWinner(mk(caps, [], [[10, 20, 30], []]))).toBe(1);
  });

  it('is -1 when a capital was razed (no city on the tile)', () => {
    expect(dominationWinner(mk(caps, [10, 20], [[], []]))).toBe(-1);
  });

  it('is -1 before every capital is founded', () => {
    // only the player and one rival have founded (capitalTiles[2] missing)
    const s = mk([10, 20], [10], [[20], []]);
    s.capitalTiles = [10, 20]; // rival1 unfounded → count < 1 + rivals
    expect(dominationWinner(s)).toBe(-1);
  });
});
