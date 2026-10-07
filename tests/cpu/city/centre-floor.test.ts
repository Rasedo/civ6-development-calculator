/**
 * The city centre's floors (the DLL's plot yield 0x538a60): the plot's own
 * Food and Production are raised to YIELD_FOOD_CITY_TERRAIN_REPLACE 2 and
 * YIELD_PRODUCTION_CITY_TERRAIN_REPLACE 1, and what the natural wonders beside
 * it pay lands after the floor (runs/h1_duelw1121 Chengdu, Plains beside
 * Yosemite: Food 3). The GPU walk takes the same floors on its planes less
 * the exported `nwa` plane.
 */
import { describe, expect, it } from 'vitest';
import { bareCtx, makeMap, tileAtCoords } from '../helpers';
import { tileYieldsForCenter } from '../../../cpu/core/city';
import { neighbors } from '../../../world/hex';

describe('the city centre floors', () => {
  it('raise the plot before a natural wonder beside it pays', () => {
    const map = makeMap(8, 8, 'PLAINS');
    const centre = tileAtCoords(map, 3, 3);
    const ctx = bareCtx(map);
    const bare = tileYieldsForCenter(ctx, centre);
    expect(bare.food).toBe(2);
    expect(bare.production).toBe(1);
    neighbors(map, centre)[0].feature = 'YOSEMITE';
    const beside = tileYieldsForCenter(ctx, centre);
    expect(beside.food).toBe(3);
    expect(beside.production).toBe(1);
    expect(beside.gold).toBe(bare.gold + 1);
    expect(beside.science).toBe(bare.science + 1);
  });
});
