/** THE LUXURY ALLOCATION, TypeScript half.
 *
 * The DLL (Player_Resources 0x4a6110) gives each luxury ONE pass: the first
 * LUXURY_AMENITY_CITIES cities of a list stably sorted by need, re-sorted
 * after every pass. A Luxury Policy duplicate is a no-cap resource whose pass
 * reaches that many per copy held and wraps round the list; the passes run
 * widest first. runs/h1_duelw1112 t83: China's five cities read 3, 5, 4, 5, 3.
 *
 * The GPU twin is `tests/gpu/luxury_allocation_test.py`.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { luxuryAmenities } from '../../../cpu/core/city';
import { CONGRESS_LUXURY_POLICY } from '../../../cpu/data/seats';
import { LUXURY_IDS, resourceImprovement } from '../../../world/resources';
import { tilesWithin } from '../../../world/hex';
import type { City, GameState, Seat } from '../../../cpu/core/types';

/** Seat 0 with five cities of the given populations, in id order, and
 *  improved plots of `copies[i]` copies of luxury i. */
function scene(pops: number[], copies: number[]): GameState {
  const state = makeState(makeMap(40, 8, 'GRASSLAND'));
  const s: Seat = { ...emptySeat(0), name: 'Seat0' };
  state.seats = [s];
  pops.forEach((pop, i) => {
    const col = 3 + 7 * i;
    const tile = tileAtCoords(state.map, col, 4);
    const city: City = {
      id: s.nextCityId++, name: `City${i}`, seat: 0, centerIndex: tile.index,
      population: pop, foodBox: 0, cultureBox: 0, tilesAcquired: 0, focus: 'balanced',
      queue: [], isCapital: i === 0, buildings: [],
      districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [], hp: 200, foundedTurn: 1,
    };
    tile.district = 'CITY_CENTER';
    tile.districtComplete = true;
    for (const t of tilesWithin(state.map, col, 4, 1)) setTileOwner(t, 0, city.id);
    s.cities.push(city);
  });
  let k = 0;
  copies.forEach((n, lux) => {
    for (let j = 0; j < n; j++, k++) {
      const city = s.cities[k % s.cities.length];
      const c = state.map.tiles[city.centerIndex];
      const t = tileAtCoords(state.map, c.col + (k < s.cities.length ? 1 : -1), c.row);
      t.resource = LUXURY_IDS[lux];
      t.improvement = resourceImprovement(t);
    }
  });
  return state;
}

describe('the luxury allocation', () => {
  it('a duplicate pass reaches four cities per copy and wraps; the rest serve the neediest', () => {
    // needs 1, 2, 2, 4, 1 (populations 1, 3, 4, 7, 2); four luxuries, the
    // first held twice under Luxury Policy A
    const state = scene([1, 3, 4, 7, 2], [2, 1, 1, 1]);
    state.congress = [{ res: CONGRESS_LUXURY_POLICY, outcome: 0, target: 0 }];
    expect([...luxuryAmenities(state, 0).values()]).toEqual([3, 5, 4, 5, 3]);
  });

  it('with no policy each luxury is one pass of four', () => {
    const state = scene([1, 3, 4, 7, 2], [2, 1, 1, 1]);
    expect([...luxuryAmenities(state, 0).values()]).toEqual([2, 4, 4, 4, 2]);
  });
});
