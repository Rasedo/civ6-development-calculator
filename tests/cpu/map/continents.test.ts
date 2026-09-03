import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { deriveContinents, isWater } from '../../../world/query';
import { homeContinent, onHomeContinent, routeIntercontinental, emptySeat, seatOf } from '../../../cpu/core/seats';
import { neighbors } from '../../../world/hex';

/**
 * CIV6 (Continents): every contiguous LANDMASS gets an id; water is -1. A
 * seat's HOME continent is its ORIGINAL capital's, which is what the
 * install's requirements read (REQUIREMENT_PLOT_IS_OWNER_CAPITAL_CONTINENT
 * and its city/unit siblings) — C-48.
 *
 * The GPU twin is tests/gpu/continents_test.py, which also pins that the
 * fixture's shipped ids are exactly these.
 */
describe('the continent fill', () => {
  it('gives water -1 and every land tile an id', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    for (const t of state.map.tiles) {
      expect(t.continent, `tile ${t.index}`).toBe(isWater(t) ? -1 : 0);
    }
  });

  it('separates two landmasses and joins one', () => {
    const map = makeMap(12, 12, 'GRASSLAND');
    // a full column of ocean cuts the map in two
    for (const t of map.tiles) if (t.col === 6) t.terrain = 'OCEAN';
    deriveContinents(map);
    const west = tileAtCoords(map, 2, 5).continent!;
    const east = tileAtCoords(map, 9, 5).continent!;
    expect(west).toBeGreaterThanOrEqual(0);
    expect(east).toBeGreaterThanOrEqual(0);
    expect(west).not.toBe(east);
    // ...and everything on one side shares the id
    for (const t of map.tiles) {
      if (isWater(t)) continue;
      expect(t.continent).toBe(t.col < 6 ? west : east);
    }
  });

  it('is not split by a lake, because the land around it stays connected', () => {
    const map = makeMap(12, 12, 'GRASSLAND');
    const mid = tileAtCoords(map, 6, 6);
    mid.terrain = 'COAST';                       // an inland water tile
    deriveContinents(map);
    const ids = new Set(map.tiles.filter((t) => !isWater(t)).map((t) => t.continent));
    expect(ids.size).toBe(1);
    expect(mid.continent).toBe(-1);
    // the ring around it is land and carries that one id
    for (const n of neighbors(map, mid)) expect(n.continent).toBe([...ids][0]);
  });

  it('numbers from 0 in ascending tile index, so a reseed cannot renumber', () => {
    const map = makeMap(12, 12, 'GRASSLAND');
    for (const t of map.tiles) if (t.col === 6) t.terrain = 'OCEAN';
    deriveContinents(map);
    const first = map.tiles.find((t) => !isWater(t))!;
    expect(first.continent).toBe(0);
    const seen: number[] = [];
    for (const t of map.tiles) {
      const c = t.continent!;
      if (c >= 0 && !seen.includes(c)) seen.push(c);
    }
    expect(seen).toEqual(seen.slice().sort((a, b) => a - b));
  });
});

describe('a seat calls its ORIGINAL capital home', () => {
  function scene() {
    const map = makeMap(20, 20, 'GRASSLAND');
    for (const t of map.tiles) if (t.col === 10) t.terrain = 'OCEAN';
    const state = makeState(map);
    state.seats.push(emptySeat(1));
    return state;
  }

  it('reads the capital tile, and answers -1 before any founding', () => {
    const state = scene();
    expect(homeContinent(state, 1)).toBe(-1);
    const centre = tileAtCoords(state.map, 4, 5);
    settleAt(state, centre.index, 1);
    expect(homeContinent(state, 1)).toBe(centre.continent);
    expect(onHomeContinent(state, 1, centre.index)).toBe(true);
  });

  it('does not move when a later city is founded across the water', () => {
    const state = scene();
    const home = tileAtCoords(state.map, 4, 5);
    settleAt(state, home.index, 1);
    const was = homeContinent(state, 1);
    const abroad = tileAtCoords(state.map, 15, 5);
    expect(abroad.continent).not.toBe(was);
    settleAt(state, abroad.index, 1);
    expect(homeContinent(state, 1)).toBe(was);
    expect(onHomeContinent(state, 1, abroad.index)).toBe(false);
  });

  it('survives the capital city being removed — the TILE is the anchor', () => {
    const state = scene();
    const home = tileAtCoords(state.map, 4, 5);
    settleAt(state, home.index, 1);
    const was = homeContinent(state, 1);
    // the city goes; `capitalTile` is stamped on the SEAT and stays, exactly
    // as the GPU's `civ_cap_tile` does
    seatOf(state, 1)!.cities.length = 0;
    expect(homeContinent(state, 1)).toBe(was);
  });

  it('calls a route intercontinental only between two KNOWN, different ids', () => {
    const state = scene();
    const west = tileAtCoords(state.map, 4, 5);
    const west2 = tileAtCoords(state.map, 5, 5);
    const east = tileAtCoords(state.map, 15, 5);
    const sea = tileAtCoords(state.map, 10, 5);
    expect(routeIntercontinental(state, west.index, east.index)).toBe(true);
    expect(routeIntercontinental(state, west.index, west2.index)).toBe(false);
    // water carries no continent, so it can never make a route intercontinental
    expect(sea.continent).toBe(-1);
    expect(routeIntercontinental(state, west.index, sea.index)).toBe(false);
  });
});
