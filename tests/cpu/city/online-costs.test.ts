/**
 * The city's turn step as the harness measured it against the game
 * (runs/h1_duelw1103 / 1104): culture accrues on the city as its growth left
 * it, improvement housing pays whole, and the Gathering Storm floodplains.
 * The GPU twin is tests/gpu/online_costs_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { computeCityStats, computeHousing } from '../../../cpu/core/city';
import { cultureAfterGrowth, paveGround } from '../../../cpu/core/phase';
import { FEATURES, isFloodplains } from '../../../world/features';
import { featureDefense } from '../../../cpu/core/combat';
import { validImprovementsIn } from '../../../cpu/core/rules';

describe('culture after growth', () => {
  it('keeps the grown-on read when the population held, reads the city again when it moved', () => {
    const state = makeState(makeMap(18, 18));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index, 0);
    const stats = computeCityStats(state, city);
    expect(cultureAfterGrowth(state, city, city.population, stats)).toBe(stats.total.culture);
    city.population += 1;
    const again = computeCityStats(state, city).total.culture;
    expect(again).toBeGreaterThan(stats.total.culture); // the new citizen's 0.3
    expect(cultureAfterGrowth(state, city, city.population - 1, stats)).toBe(again);
  });
});

describe('improvement housing', () => {
  it('sums the Housing / TilesRequired shares over the city and pays the floor', () => {
    const state = makeState(makeMap(18, 18));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index, 0);
    const base = computeHousing(state, city);
    tileAtCoords(state.map, 10, 9).improvement = 'FARM';
    expect(computeHousing(state, city)).toBe(base); // one half pays nothing
    tileAtCoords(state.map, 8, 9).improvement = 'PASTURE';
    expect(computeHousing(state, city)).toBe(base + 1); // a Farm and a Pasture pay 1
    tileAtCoords(state.map, 9, 8).improvement = 'FARM';
    expect(computeHousing(state, city)).toBe(base + 1);
  });
});

describe('the Gathering Storm floodplains', () => {
  it('pays the desert row Food 2 and the grassland and plains rows nothing', () => {
    expect(FEATURES.FLOODPLAINS.yields).toEqual({ food: 2 });
    expect(FEATURES.FLOODPLAINS_GRASSLAND.yields).toEqual({});
    expect(FEATURES.FLOODPLAINS_PLAINS.yields).toEqual({});
    expect(FEATURES.FLOODPLAINS_GRASSLAND.terrains).toEqual(['GRASSLAND']);
    expect(FEATURES.FLOODPLAINS_PLAINS.terrains).toEqual(['PLAINS']);
  });

  it('keeps every class rule on all three', () => {
    for (const f of ['FLOODPLAINS', 'FLOODPLAINS_GRASSLAND', 'FLOODPLAINS_PLAINS']) {
      expect(isFloodplains(f)).toBe(true);
      expect(featureDefense(f)).toBe(-2);
      const map = makeMap();
      const t = tileAtCoords(map, 3, 3);
      t.terrain = f === 'FLOODPLAINS' ? 'DESERT' : f === 'FLOODPLAINS_GRASSLAND' ? 'GRASSLAND' : 'PLAINS';
      t.feature = f as typeof t.feature;
      expect(validImprovementsIn(t, { unlocks: null, ownsTile: () => true, map })).toContain('FARM');
      paveGround(t);
      expect(t.feature).toBe(f); // a district leaves the floodplains under it
    }
    expect(isFloodplains('MARSH')).toBe(false);
    expect(isFloodplains(null)).toBe(false);
  });
});
