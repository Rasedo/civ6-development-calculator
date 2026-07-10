import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantTechs, expandBorders } from './helpers';
import { foundCity, queueDistrict, queueBuilding, endTurn, districtCost, effectiveResearchCost, itemCost } from '../src/core/game';
import { detectBoosts, toggleBoost, isBoosted } from '../src/core/boosts';
import { computeCityStats, computeHousing, cityMaintenance } from '../src/core/city';
import { tileAppeal, appealTier } from '../src/core/appeal';
import { placeImprovement } from '../src/core/game';

describe('eurekas & inspirations', () => {
  it('auto-detects observable conditions and discounts the cost', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index);
    grantTechs(state, 'MINING');
    const hills = tileAtCoords(state.map, 9, 8);
    hills.elevation = 'HILLS';
    hills.resource = 'STONE';
    expect(placeImprovement(state, hills.index, 'QUARRY').ok).toBe(true);

    expect(isBoosted(state, 'MASONRY')).toBe(false);
    detectBoosts(state);
    expect(isBoosted(state, 'MASONRY')).toBe(true);
    expect(effectiveResearchCost(state, 'MASONRY', 80)).toBe(48); // -40%
  });

  it('boosts fire during normal turns and never re-fire', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index); // grassland interior -> no coast
    endTurn(state);
    const count = state.research.boosted.length;
    endTurn(state);
    expect(state.research.boosted.length).toBe(count); // idempotent
  });

  it('manual boosts toggle', () => {
    const state = makeState(makeMap(16, 16));
    toggleBoost(state, 'WRITING');
    expect(isBoosted(state, 'WRITING')).toBe(true);
    toggleBoost(state, 'WRITING');
    expect(isBoosted(state, 'WRITING')).toBe(false);
  });
});

describe('district cost scaling', () => {
  it('rises with research and locks at queue time', () => {
    const state = makeState(makeMap(16, 16));
    const base = districtCost(state);
    expect(base).toBe(54);

    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    grantTechs(state, 'WRITING');
    const early = districtCost(state);
    expect(early).toBeGreaterThan(base);

    expect(queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index).ok).toBe(true);
    const locked = itemCost(city.queue[0]);
    expect(locked).toBe(early);
    grantTechs(state, 'POTTERY', 'MINING', 'SAILING', 'ASTROLOGY');
    expect(districtCost(state)).toBeGreaterThan(early);
    expect(itemCost(city.queue[0])).toBe(locked); // still the price it was queued at
  });
});

describe('appeal & neighborhoods', () => {
  it('computes appeal from surroundings', () => {
    const map = makeMap(12, 12);
    const t = tileAtCoords(map, 5, 5);
    expect(tileAppeal(map, t)).toBe(0);
    tileAtCoords(map, 6, 5).feature = 'WOODS';
    tileAtCoords(map, 4, 5).elevation = 'MOUNTAIN';
    expect(tileAppeal(map, t)).toBe(2);
    expect(appealTier(2).name).toBe('Charming');
    tileAtCoords(map, 5, 4).improvement = 'MINE';
    tileAtCoords(map, 5, 6).feature = 'MARSH';
    expect(tileAppeal(map, t)).toBe(0);
  });

  it('neighborhood housing follows tile appeal', () => {
    const state = makeState(makeMap(16, 16));
    state.sandbox = true;
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    expandBorders(state, city, 2);
    const spot = tileAtCoords(state.map, 10, 8);
    tileAtCoords(state.map, 11, 8).feature = 'WOODS';
    tileAtCoords(state.map, 10, 7).elevation = 'MOUNTAIN';
    const expected = appealTier(tileAppeal(state.map, spot)).housing;
    const before = computeHousing(state, city);
    expect(queueDistrict(state, city.id, 'NEIGHBORHOOD', spot.index).ok).toBe(true);
    // placing the district may not change the tile's own appeal inputs
    expect(computeHousing(state, city) - before).toBe(expected);
  });
});

describe('maintenance', () => {
  it('districts and buildings cost gold upkeep; commercial buildings are free', () => {
    const state = makeState(makeMap(16, 16));
    state.sandbox = true;
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    expandBorders(state, city, 2);
    city.population = 7;
    expect(cityMaintenance(state, city)).toBe(0); // palace + city center are free

    queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index);
    queueBuilding(state, city.id, 'LIBRARY');
    expect(cityMaintenance(state, city)).toBe(2); // campus 1 + library 1

    queueDistrict(state, city.id, 'COMMERCIAL_HUB', tileAtCoords(state.map, 7, 8).index);
    queueBuilding(state, city.id, 'MARKET');
    expect(cityMaintenance(state, city)).toBe(2); // hub free (P4/D-14, real Civ 6), market free

    const stats = computeCityStats(state, city);
    expect(stats.maintenance).toBe(2); // hub exempt (P4/D-14)
  });
});
