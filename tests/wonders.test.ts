import { describe, it, expect } from 'vitest';
import { generateMap } from '../src/core/mapgen';
import { makeMap, makeState, tileAtCoords, bareCtx } from './helpers';
import { tileYields, districtAdjacency } from '../src/core/yields';
import { isImpassable } from '../src/core/query';
import { canFoundCity, canPlaceDistrict, validImprovements } from '../src/core/rules';
import { foundCity } from '../src/core/game';
import { workableTiles } from '../src/core/city';
import { WONDERS } from '../src/data/wonders';

describe('wonder generation', () => {
  it('places wonders with the right tile counts, none on top of each other', () => {
    const map = generateMap({ width: 84, height: 54, seed: 42 });
    const byWonder = new Map<string, number>();
    for (const t of map.tiles) {
      if (!t.wonder) continue;
      byWonder.set(t.wonder, (byWonder.get(t.wonder) ?? 0) + 1);
      expect(t.feature).toBeNull();
      expect(t.resource).toBeNull();
    }
    expect(byWonder.size).toBeGreaterThanOrEqual(1);
    for (const [id, count] of byWonder) {
      expect(count).toBe(WONDERS[id].size);
    }
  });

  it('honors withWonders=false', () => {
    const map = generateMap({ width: 44, height: 26, seed: 7, withWonders: false });
    expect(map.tiles.every((t) => t.wonder === null)).toBe(true);
  });

  it('is deterministic', () => {
    const a = generateMap({ width: 44, height: 26, seed: 99 });
    const b = generateMap({ width: 44, height: 26, seed: 99 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('wonder effects', () => {
  it('passable wonder tiles use the wonder yields', () => {
    const map = makeMap();
    const t = tileAtCoords(map, 5, 5);
    t.wonder = 'GREAT_BARRIER_REEF';
    t.terrain = 'COAST';
    expect(tileYields(bareCtx(map), t)).toMatchObject({ food: 2, science: 2 });
    expect(isImpassable(t)).toBe(false);
  });

  it('Uluru grants +2 culture +2 faith to adjacent tiles', () => {
    const map = makeMap();
    tileAtCoords(map, 5, 5).wonder = 'ULURU';
    const next = tileAtCoords(map, 6, 5); // grassland 2F
    expect(tileYields(bareCtx(map), next)).toMatchObject({ food: 2, culture: 2, faith: 2 });
    expect(isImpassable(tileAtCoords(map, 5, 5))).toBe(true);
  });

  it('Torres del Paine doubles adjacent terrain yields', () => {
    const map = makeMap();
    tileAtCoords(map, 5, 5).wonder = 'TORRES_DEL_PAINE';
    const next = tileAtCoords(map, 6, 5);
    next.elevation = 'HILLS'; // grassland hills: 2F1P -> doubled to 4F2P
    expect(tileYields(bareCtx(map), next)).toMatchObject({ food: 4, production: 2 });
  });

  it('Holy Site gets +2 faith per adjacent natural wonder', () => {
    const map = makeMap();
    tileAtCoords(map, 6, 5).wonder = 'ULURU';
    expect(districtAdjacency(map, tileAtCoords(map, 5, 5), 'HOLY_SITE')).toBe(2);
  });

  it('wonder tiles cannot be settled, improved or districted, but are workable', () => {
    const state = makeState(makeMap(16, 16));
    const wonderTile = tileAtCoords(state.map, 9, 8);
    wonderTile.wonder = 'GREAT_BARRIER_REEF';
    wonderTile.terrain = 'COAST';
    expect(canFoundCity(state, wonderTile.index).ok).toBe(false);

    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    state.sandbox = true;
    expect(canPlaceDistrict(state, city, 'CAMPUS', wonderTile.index).ok).toBe(false);
    expect(validImprovements(state, wonderTile)).toEqual([]);
    expect(workableTiles(state, city).some((t) => t.index === wonderTile.index)).toBe(true);
  });
});
