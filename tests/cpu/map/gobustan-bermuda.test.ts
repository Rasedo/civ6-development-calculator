import { describe, it, expect } from 'vitest';
import { makeMap, tileAtCoords, bareCtx } from '../helpers';
import { neighbors } from '../../../world/hex';
import { FEATURES } from '../../../world/features';
import { tileYields } from '../../../cpu/core/yields';
import { tileAppeal } from '../../../cpu/core/appeal';
import { featureDefense } from '../../../cpu/core/combat';
import { terrainMp } from '../../../cpu/core/units';
import { FEATURE_SIGHT_THROUGH } from '../../../cpu/data/sight';
import { MP_SCALE } from '../../../cpu/data/constants';

/**
 * GOBUSTAN (Expansion2_Features.xml) and the BERMUDA TRIANGLE
 * (GranColombia_Maya_Features.xml), read against the recorded game
 * runs/h1_duelw1105: Gobustan's plots yield 1 Production 3 Culture, the
 * Triangle's 10 Science (Feature_AdjacentYields 5 from each of the other two).
 */
describe('Gobustan', () => {
  it('reads the install', () => {
    const g = FEATURES.GOBUSTAN;
    expect(g.naturalWonder).toBe(true);
    expect(g.impassable).toBeUndefined();
    expect(g.yields).toEqual({ culture: 3, production: 1 });
    expect(featureDefense('GOBUSTAN')).toBe(3);
    expect(FEATURE_SIGHT_THROUGH.GOBUSTAN).toBe(1);
  });

  it('yields its own row in place of the Plains under it, costs 2 to enter and is Breathtaking', () => {
    const map = makeMap(8, 8, 'PLAINS');
    const t = tileAtCoords(map, 3, 3);
    t.feature = 'GOBUSTAN';
    const y = tileYields(bareCtx(map), t);
    expect([y.food, y.production, y.gold, y.science, y.culture, y.faith]).toEqual([0, 1, 0, 0, 3, 0]);
    expect(terrainMp(t)).toBe(2 * MP_SCALE);
    expect(tileAppeal(map, t)).toBe(5);
  });
});

describe('the Bermuda Triangle', () => {
  it('reads the install', () => {
    const b = FEATURES.BERMUDA_TRIANGLE;
    expect(b.naturalWonder).toBe(true);
    expect(b.impassable).toBeUndefined();
    expect(b.yields).toEqual({});
    expect(b.adjacentYields).toEqual({ science: 5 });
  });

  it('pays its ring 5 Science, and each of its three plots 5 from each of the other two', () => {
    const map = makeMap(10, 10, 'OCEAN');
    const a = tileAtCoords(map, 4, 4);
    // three mutually adjacent plots: `a`, and two of its neighbours that touch
    const n1 = neighbors(map, a)[0];
    const n2 = neighbors(map, a).find((n) => neighbors(map, n1).includes(n))!;
    for (const t of [a, n1, n2]) t.feature = 'BERMUDA_TRIANGLE';
    for (const t of [a, n1, n2]) {
      const y = tileYields(bareCtx(map), t);
      expect([y.food, y.production, y.science]).toEqual([0, 0, 10]);
    }
    const ring = neighbors(map, a).find((n) => !n.feature)!;
    const touching = neighbors(map, ring).filter((n) => n.feature === 'BERMUDA_TRIANGLE').length;
    const plain = tileYields(bareCtx(map), tileAtCoords(map, 0, 9));
    expect(tileYields(bareCtx(map), ring).science - plain.science).toBe(5 * touching);
  });

  it("leaves an Impassable wonder's plots reading nothing from their neighbours", () => {
    const map = makeMap(10, 10, 'DESERT');
    const a = tileAtCoords(map, 4, 4);
    const b = neighbors(map, a)[0];
    a.feature = 'PAITITI';
    b.feature = 'PAITITI';
    const y = tileYields(bareCtx(map), a);
    expect([y.food, y.production, y.gold, y.culture]).toEqual([0, 0, 0, 0]);
  });
});
