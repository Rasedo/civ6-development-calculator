import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, grantTechs, expandBorders } from '../helpers';
import { foundCity, queueDistrict, queueBuilding, endTurn, districtCost, districtDiscounted, effectiveResearchCost, itemCost } from '../../../cpu/core/game';
import { detectBoosts, toggleBoost, isBoosted } from '../../../cpu/core/boosts';
import { computeCityStats, computeHousing, cityMaintenance } from '../../../cpu/core/city';
import { tileAppeal, appealTier } from '../../../cpu/core/appeal';
import { placeImprovement } from '../../../cpu/core/game';

describe('eurekas & inspirations', () => {
  it('auto-detects observable conditions and discounts the cost', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    grantTechs(state, 'MINING');
    const hills = tileAtCoords(state.map, 9, 8);
    hills.elevation = 'HILLS';
    hills.resource = 'STONE';
    expect(placeImprovement(state, hills.index, 'QUARRY', 0).ok).toBe(true);

    expect(isBoosted(state, 'MASONRY', 0)).toBe(false);
    detectBoosts(state, 0);
    expect(isBoosted(state, 'MASONRY', 0)).toBe(true);
    expect(effectiveResearchCost(state, 0, 'MASONRY', 80)).toBe(48); // -40%
  });

  it('boosts fire during normal turns and never re-fire', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0); // grassland interior -> no coast
    endTurn(state);
    const count = seatOf(state, 0)!.research.boosted.length;
    endTurn(state);
    expect(seatOf(state, 0)!.research.boosted.length).toBe(count); // idempotent
  });

  it('manual boosts toggle', () => {
    const state = makeState(makeMap(16, 16));
    toggleBoost(state, 'WRITING', 0);
    expect(isBoosted(state, 'WRITING', 0)).toBe(true);
    toggleBoost(state, 'WRITING', 0);
    expect(isBoosted(state, 'WRITING', 0)).toBe(false);
  });
});

describe('district cost scaling', () => {
  it('rises with research and locks at queue time', () => {
    const state = makeState(makeMap(16, 16));
    const base = districtCost(state, 0);
    expect(base).toBe(32); // D-15: round(54 × GAME_SPEED)

    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    grantTechs(state, 'WRITING');
    const early = districtCost(state, 0);
    expect(early).toBeGreaterThan(base);

    expect(queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index, 0).ok).toBe(true);
    const locked = itemCost(city.queue[0]);
    expect(locked).toBe(early);
    grantTechs(state, 'POTTERY', 'MINING', 'SAILING', 'ASTROLOGY');
    expect(districtCost(state, 0)).toBeGreaterThan(early);
    expect(itemCost(city.queue[0])).toBe(locked); // still the price it was queued at
  });

  it('D-8: under-represented specialty types cost 40% less', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    grantTechs(state, 'WRITING', 'ASTROLOGY'); // Campus + Holy Site unlocked → U = 2

    // no completed districts yet: D(0) < U(2) → nothing is discounted
    expect(districtDiscounted(state, 0, 'HOLY_SITE')).toBe(false);

    // two COMPLETED campuses → D = 2 ≥ U, threshold ceil(2/2) = 1
    for (const [col, row] of [
      [9, 8],
      [7, 8],
    ] as const) {
      const t = tileAtCoords(state.map, col, row);
      t.district = 'CAMPUS';
      t.districtComplete = true;
      city.districts.push({ type: 'CAMPUS', tileIndex: t.index });
    }
    expect(districtDiscounted(state, 0, 'HOLY_SITE')).toBe(true); // placed 0 < 1
    expect(districtDiscounted(state, 0, 'CAMPUS')).toBe(false); // placed 2 ≥ 1
    expect(districtCost(state, 0, 'HOLY_SITE')).toBe(Math.floor(districtCost(state, 0) * 0.6));
    expect(districtCost(state, 0, 'CAMPUS')).toBe(districtCost(state, 0));
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
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    expandBorders(state, city, 2);
    const spot = tileAtCoords(state.map, 10, 8);
    tileAtCoords(state.map, 11, 8).feature = 'WOODS';
    tileAtCoords(state.map, 10, 7).elevation = 'MOUNTAIN';
    const expected = appealTier(tileAppeal(state.map, spot)).housing;
    const before = computeHousing(state, city);
    expect(queueDistrict(state, city.id, 'NEIGHBORHOOD', spot.index, 0).ok).toBe(true);
    // placing the district may not change the tile's own appeal inputs
    expect(computeHousing(state, city) - before).toBe(expected);
  });
});

describe('maintenance', () => {
  it('districts and buildings cost gold upkeep; commercial buildings are free', () => {
    const state = makeState(makeMap(16, 16));
    state.sandbox = true;
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    expandBorders(state, city, 2);
    city.population = 7;
    expect(cityMaintenance(state, city)).toBe(0); // palace + city center are free

    queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index, 0);
    queueBuilding(state, city.id, 'LIBRARY', 0);
    expect(cityMaintenance(state, city)).toBe(2); // campus 1 + library 1

    queueDistrict(state, city.id, 'COMMERCIAL_HUB', tileAtCoords(state.map, 7, 8).index, 0);
    queueBuilding(state, city.id, 'MARKET', 0);
    expect(cityMaintenance(state, city)).toBe(2); // hub free (P4/D-14, real Civ 6), market free

    const stats = computeCityStats(state, city);
    expect(stats.maintenance).toBe(2); // hub exempt (P4/D-14)
  });
});
