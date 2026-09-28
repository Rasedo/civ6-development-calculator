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
import { pressureTerm } from '../../../cpu/core/phase';
import { luxuryAmenities, cityMaintenance } from '../../../cpu/core/city';
import { centreStrength, wallsStrength } from '../../../cpu/core/combat';
import { spawnUnit, traderCost } from '../../../cpu/core/units';
import { tilePurchaseCost, projectCost } from '../../../cpu/core/game';
import { DISTRICTS } from '../../../cpu/data/districts';
import { RESOURCES, resourceImprovement, LUXURY_IDS } from '../../../world/resources';
import { gameProgressPct, progressCost, plotPrice } from '../../../cpu/data/constants';
import { TECHS } from '../../../cpu/data/techs';

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

describe('the second wave of the harness findings', () => {
  it('loyalty pressure: 10 (own - foreign) / min(own, foreign), at most 20 either way', () => {
    expect(pressureTerm(0, 0)).toBe(0);
    expect(pressureTerm(30, 30)).toBe(0);
    expect(pressureTerm(20, 10)).toBe(10);   // ratio 2
    expect(pressureTerm(10, 20)).toBe(-10);
    expect(pressureTerm(30, 10)).toBe(20);   // ratio 3, the cap
    expect(pressureTerm(100, 10)).toBe(20);
    expect(pressureTerm(15, 10)).toBe(5);    // ratio 1.5
    expect(pressureTerm(5, 0)).toBe(20);     // unopposed
    expect(pressureTerm(0, 5)).toBe(-20);
  });

  it('a pillaged luxury improvement gives no copy', () => {
    const state = makeState(makeMap(18, 18));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index, 0);
    const t = tileAtCoords(state.map, 10, 9);
    t.resource = 'WINE';
    t.improvement = 'PLANTATION';
    expect(luxuryAmenities(state, 0).get(city.id)).toBe(1);
    t.pillaged = true;
    expect(luxuryAmenities(state, 0).get(city.id)).toBe(0);
  });

  it('the Dam pays Entertainment 1; a pillaged district no upkeep', () => {
    expect(DISTRICTS.DAM.amenities).toBe(1);
    const state = makeState(makeMap(18, 18));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index, 0);
    const t = tileAtCoords(state.map, 10, 9);
    t.district = 'CAMPUS';
    t.districtComplete = true;
    city.districts.push({ type: 'CAMPUS', tileIndex: t.index });
    const m = cityMaintenance(state, city);
    t.districtPillaged = true;
    expect(cityMaintenance(state, city)).toBe(m - DISTRICTS.CAMPUS.maintenance);
  });

  it('Amber: a luxury on Coast or under Woods and Rainforest, Fishing Boats at sea and a Mine ashore', () => {
    expect(RESOURCES.AMBER).toMatchObject({ category: 'luxury', yields: { culture: 1 }, terrains: ['COAST'] });
    expect(LUXURY_IDS[LUXURY_IDS.length - 1]).toBe('AMBER');
    const map = makeMap();
    const sea = tileAtCoords(map, 2, 2);
    sea.terrain = 'COAST';
    sea.resource = 'AMBER';
    expect(resourceImprovement(sea)).toBe('FISHING_BOATS');
    const wood = tileAtCoords(map, 4, 4);
    wood.feature = 'WOODS';
    wood.resource = 'AMBER';
    expect(resourceImprovement(wood)).toBe('MINE');
  });

  it('the garrison: Combat less a point per 10 damage above the base, a ship included; the walls +3 each', () => {
    const state = makeState(makeMap(18, 18));
    state.unitsMode = true;
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index, 0);
    const bare = centreStrength(state, city);
    city.buildings.push('ANCIENT_WALLS', 'MEDIEVAL_WALLS');
    expect(wallsStrength(city)).toBe(6);
    expect(centreStrength(state, city)).toBe(bare + 6);
    const u = spawnUnit(state, 'MUSKETMAN', city.centerIndex, 0)!;
    const base = centreStrength(state, city, false) - 6 - (city.buildings.includes('PALACE') ? 3 : 0);
    u.hp = 75;
    expect(centreStrength(state, city) - centreStrength(state, city, false))
      .toBe(Math.max(0, 55 - 2.5 - base));
  });

  it('prices on the game\'s integer percent: the Trader, a plot, a district project', () => {
    const state = makeState(makeMap(18, 18));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index, 0);
    const rs = state.seats[0].research;
    rs.techs.push(...Object.keys(TECHS).slice(0, 29));
    const pct = gameProgressPct(rs.techs.length, rs.civics.length);
    expect(pct).toBe(37);
    expect(traderCost(state, 0)).toBe(progressCost(40, 3, pct));        // 42
    expect(plotPrice(3, pct)).toBe(Math.floor((37.5 * 2.48) / 5) * 5);  // 93 -> 90
    expect(tilePurchaseCost(state, city, tileAtCoords(state.map, 12, 9).index)).toBe(plotPrice(3, pct));
    expect(projectCost(state, 0, 'RESEARCH_GRANTS')).toBe(progressCost(25, 14, pct));
  });
});
