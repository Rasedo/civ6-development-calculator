/** AN UNASSIGNED CITIZEN PAYS GOLD, TypeScript half.
 *
 * CIV6 (GlobalParameters GOLD_PERCENTAGE_YIELD_PER_UNASSIGNED_POP 50): a
 * citizen with no plot and no specialist slot to work pays half a Gold, under
 * the city's percents (runs/h1_duelw1112 Shenyang t116: 5 plots worked at
 * population 6, 3.5 Gold where its plots pay 3).
 *
 * The GPU twin is section 7 of `tests/gpu/citizens_test.py`.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { computeCityStats } from '../../../cpu/core/city';
import type { City, Seat } from '../../../cpu/core/types';

describe('an unassigned citizen', () => {
  it('pays half a Gold where no plot is left to work', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    const s: Seat = { ...emptySeat(0), name: 'Seat0' };
    state.seats = [s];
    const tile = tileAtCoords(state.map, 5, 5);
    const city: City = {
      id: s.nextCityId++, name: 'City0', seat: 0, centerIndex: tile.index,
      population: 4, foodBox: 0, cultureBox: 0, tilesAcquired: 0, focus: 'balanced',
      queue: [], isCapital: true, buildings: [],
      districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [], hp: 200, foundedTurn: 1,
    };
    tile.district = 'CITY_CENTER';
    tile.districtComplete = true;
    setTileOwner(tile, 0, city.id);
    s.cities.push(city);
    // the city owns its centre alone: all four citizens stand idle
    expect(computeCityStats(state, city).breakdown.citizens.gold).toBe(2);
    // one plot to work: three idle
    setTileOwner(tileAtCoords(state.map, 6, 5), 0, city.id);
    expect(computeCityStats(state, city).breakdown.citizens.gold).toBe(1.5);
  });
});
