import { describe, it, expect } from 'vitest';
import { tileYields, districtAdjacency } from '../src/core/yields';
import { makeMap, makeState, tileAtCoords, bareCtx } from './helpers';
import { foundCity, queueDistrict, queueBuilding } from '../src/core/game';
import { computeCityStats } from '../src/core/city';
import { DIR_E } from '../src/core/hex';

describe('tile yields', () => {
  const map = makeMap();
  const ctx = bareCtx(map);

  it('matches base Civ 6 terrain values', () => {
    const t = tileAtCoords(map, 1, 1);

    t.terrain = 'GRASSLAND';
    expect(tileYields(ctx, t)).toMatchObject({ food: 2, production: 0, gold: 0 });

    t.terrain = 'PLAINS';
    t.elevation = 'HILLS';
    expect(tileYields(ctx, t)).toMatchObject({ food: 1, production: 2 });

    t.elevation = 'FLAT';
    t.terrain = 'COAST';
    expect(tileYields(ctx, t)).toMatchObject({ food: 1, gold: 1 });

    t.terrain = 'GRASSLAND';
    t.feature = 'WOODS';
    expect(tileYields(ctx, t)).toMatchObject({ food: 2, production: 1 });

    t.feature = 'FLOODPLAINS';
    t.terrain = 'DESERT';
    expect(tileYields(ctx, t)).toMatchObject({ food: 3, production: 0 });

    t.feature = null;
  });

  it('mountains yield nothing', () => {
    const t = tileAtCoords(map, 2, 2);
    t.elevation = 'MOUNTAIN';
    expect(tileYields(ctx, t)).toMatchObject({ food: 0, production: 0 });
    t.elevation = 'FLAT';
  });

  it('stacks resource and improvement on terrain', () => {
    const t = tileAtCoords(map, 3, 3);
    t.terrain = 'PLAINS';
    t.resource = 'WHEAT';
    t.improvement = 'FARM';
    // plains 1F1P + wheat 1F + farm 1F
    expect(tileYields(ctx, t)).toMatchObject({ food: 3, production: 1 });
    t.resource = null;
    t.improvement = null;
    t.terrain = 'GRASSLAND';
  });
});

describe('district adjacency', () => {
  it('campus: +1 per mountain, +0.5 per rainforest, floored', () => {
    const map = makeMap();
    const center = tileAtCoords(map, 5, 5);
    const east = tileAtCoords(map, 6, 5);
    const west = tileAtCoords(map, 4, 5);
    east.elevation = 'MOUNTAIN';
    west.elevation = 'MOUNTAIN';
    expect(districtAdjacency(map, center, 'CAMPUS')).toBe(2);

    east.elevation = 'FLAT';
    east.terrain = 'PLAINS';
    east.feature = 'RAINFOREST';
    // 1 mountain (1) + 1 rainforest (0.5) -> floor(1.5) = 1
    expect(districtAdjacency(map, center, 'CAMPUS')).toBe(1);
  });

  it('commercial hub: +2 on a river tile', () => {
    const map = makeMap();
    const t = tileAtCoords(map, 5, 5);
    expect(districtAdjacency(map, t, 'COMMERCIAL_HUB')).toBe(0);
    t.riverMask = 1 << DIR_E;
    expect(districtAdjacency(map, t, 'COMMERCIAL_HUB')).toBe(2);
  });

  it('industrial zone: +1 per adjacent mine or quarry', () => {
    const map = makeMap();
    const t = tileAtCoords(map, 5, 5);
    tileAtCoords(map, 6, 5).improvement = 'MINE';
    tileAtCoords(map, 4, 5).improvement = 'QUARRY';
    expect(districtAdjacency(map, t, 'INDUSTRIAL_ZONE')).toBe(2);
  });

  it('only completed districts count for district adjacency', () => {
    const map = makeMap();
    const t = tileAtCoords(map, 5, 5);
    const n = tileAtCoords(map, 6, 5);
    n.district = 'CAMPUS';
    n.districtComplete = false;
    expect(districtAdjacency(map, t, 'THEATER_SQUARE')).toBe(0);
    n.districtComplete = true;
    // 1 district * 0.5 -> floor(0.5) = 0; add city center to reach 1
    const n2 = tileAtCoords(map, 4, 5);
    n2.district = 'CITY_CENTER';
    n2.districtComplete = true;
    expect(districtAdjacency(map, t, 'THEATER_SQUARE')).toBe(1);
  });
});

describe('shipyard special', () => {
  it('adds production equal to harbor gold adjacency', () => {
    const state = makeState(makeMap(14, 14));
    state.sandbox = true;
    // shoreline: make a coast strip east of land
    for (let row = 0; row < 14; row++) {
      for (let col = 8; col < 14; col++) {
        const t = tileAtCoords(state.map, col, row);
        t.terrain = col === 8 ? 'COAST' : 'OCEAN';
      }
    }
    const r = foundCity(state, tileAtCoords(state.map, 7, 7).index);
    expect(r.ok).toBe(true);
    const city = r.city!;
    // place harbor on coast adjacent to the city center
    const harborTile = tileAtCoords(state.map, 8, 7);
    expect(queueDistrict(state, city.id, 'HARBOR', harborTile.index).ok).toBe(true);
    const adjacency = districtAdjacency(state.map, harborTile, 'HARBOR');
    expect(adjacency).toBeGreaterThanOrEqual(2); // city center +2

    expect(queueBuilding(state, city.id, 'LIGHTHOUSE').ok).toBe(true);
    const before = computeCityStats(state, city).breakdown.buildings.production;
    expect(queueBuilding(state, city.id, 'SHIPYARD').ok).toBe(true);
    const after = computeCityStats(state, city).breakdown.buildings.production;
    expect(after - before).toBe(adjacency);
  });
});
