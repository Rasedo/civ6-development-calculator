import { describe, it, expect } from 'vitest';
import { makeMap, tileAtCoords, bareCtx } from '../helpers';
import { neighbors } from '../../../world/hex';
import { FEATURES } from '../../../world/features';
import { districtAdjacency, tileYields } from '../../../cpu/core/yields';
import { FEATURE_SIGHT_THROUGH } from '../../../cpu/data/sight';
import type { FeatureId } from '../../../world/types';

/**
 * PIOPIOTAHI, TSINGY, DEVIL'S TOWER, GIANT'S CAUSEWAY, LAKE RETBA and
 * PAMUKKALE, read against the install (Feature_AdjacentYields,
 * Feature_YieldChanges, Adjacency_YieldChanges Pamukkale_*) and the recorded
 * games runs/h1_duelw1104 / 1106 / 1107 / 1108.
 */
describe('the adjacent-yield wonders', () => {
  const rows: [FeatureId, Record<string, number>][] = [
    ['PIOPIOTAHI', { gold: 1, culture: 1 }],
    ['TSINGY', { culture: 1, science: 1 }],
    ['DEVILS_TOWER', { faith: 1, production: 1 }],
    ['GIANTS_CAUSEWAY', { culture: 1 }],
  ];
  for (const [id, adj] of rows) {
    it(`${id} is an Impassable natural wonder paying its ring once per plot it touches`, () => {
      const f = FEATURES[id];
      expect(f.naturalWonder).toBe(true);
      expect(f.impassable).toBe(true);
      expect(f.adjacentYields).toEqual(adj);
      const map = makeMap(10, 10, 'GRASSLAND');
      const a = tileAtCoords(map, 4, 4);
      const b = neighbors(map, a)[0];
      a.feature = id;
      b.feature = id;
      const ring = neighbors(map, a).find((n) => !n.feature && neighbors(map, n).includes(b))!;
      const plain = tileYields(bareCtx(map), tileAtCoords(map, 0, 9));
      const y = tileYields(bareCtx(map), ring);
      for (const [k, v] of Object.entries(adj)) {
        expect(y[k as keyof typeof y] - plain[k as keyof typeof plain]).toBe(2 * v);
      }
    });
  }

  it('reads the install sight-through rows', () => {
    expect(FEATURE_SIGHT_THROUGH.PIOPIOTAHI).toBe(1);
    expect(FEATURE_SIGHT_THROUGH.TSINGY).toBe(1);
    expect(FEATURE_SIGHT_THROUGH.DEVILS_TOWER).toBe(2);
    expect(FEATURE_SIGHT_THROUGH.PAMUKKALE).toBe(1);
  });
});

describe('Lake Retba', () => {
  it('yields its own row in place of the ground under it (1 Production, 2 Gold, 2 Culture)', () => {
    const map = makeMap(8, 8, 'COAST');
    const t = tileAtCoords(map, 3, 3);
    t.feature = 'LAKE_RETBA';
    expect(FEATURES.LAKE_RETBA.impassable).toBeUndefined();
    const y = tileYields(bareCtx(map), t);
    expect([y.food, y.production, y.gold, y.science, y.culture, y.faith]).toEqual([0, 1, 2, 0, 2, 0]);
  });
});

describe('Pamukkale', () => {
  it('pays no plot, and lends its neighbouring districts their Pamukkale rows', () => {
    const map = makeMap(10, 10, 'GRASSLAND');
    const p = tileAtCoords(map, 4, 4);
    p.feature = 'PAMUKKALE';
    const d = neighbors(map, p)[0];
    const ring = tileYields(bareCtx(map), d);
    const plain = tileYields(bareCtx(map), tileAtCoords(map, 0, 9));
    expect(ring).toEqual(plain);
    expect(districtAdjacency(map, d, 'CAMPUS')).toBe(2);
    expect(districtAdjacency(map, d, 'THEATER_SQUARE')).toBe(2);
    expect(districtAdjacency(map, d, 'COMMERCIAL_HUB')).toBe(2);
    // the Holy Site's natural-wonder row and its Pamukkale row both pay
    expect(districtAdjacency(map, d, 'HOLY_SITE')).toBe(3);
  });
});
