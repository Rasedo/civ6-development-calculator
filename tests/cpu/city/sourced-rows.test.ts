import { describe, it, expect } from 'vitest';
import { seatOf, setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, grantTechs, expandBorders } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { computeCityStats } from '../../../cpu/core/city';
import { buildingLoyalty } from '../../../cpu/core/phase';
import { trainableUnits } from '../../../cpu/core/units';
import { LOYALTY_MAX } from '../../../cpu/data/seats';
import { BUILDINGS } from '../../../cpu/data/buildings';

// The rows that carried an AUTHORED magnitude until their real Civ 6 text was
// read. Each assertion quotes the clause it enforces, because the value alone
// says nothing about which rule it came from.

function oneCity() {
  const state = makeState(makeMap(16, 16));
  foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
  const city = seatOf(state, 0)!.cities[0];
  expandBorders(state, city, 2);
  return { state, city };
}

describe('the Monument, at its Gathering Storm row', () => {
  it('carries +1 Loyalty rather than a second point of culture', () => {
    const { city } = oneCity();
    expect(BUILDINGS.MONUMENT.yields?.culture).toBe(1);
    expect(buildingLoyalty(city)).toBe(0);
    city.buildings.push('MONUMENT');
    // CIV6 (R&F/GS): "+1 Loyalty. +1 Culture."
    expect(buildingLoyalty(city)).toBe(1);
  });

  it('pays "+1 additional Culture if city is at maximum Loyalty", and only then', () => {
    const { state, city } = oneCity();
    city.buildings.push('MONUMENT');
    city.loyalty = LOYALTY_MAX;
    const full = computeCityStats(state, city);
    city.loyalty = LOYALTY_MAX - 1;
    const short = computeCityStats(state, city);
    // the BUILDINGS bucket is the clause; the total also carries the empire's
    // culture multiplier, which scales the extra point with everything else.
    expect(full.breakdown.buildings.culture - short.breakdown.buildings.culture).toBeCloseTo(1, 6);
    expect(full.total.culture).toBeGreaterThan(short.total.culture);
  });
});

describe('the Lighthouse', () => {
  it('pays "+1 Food in Coast and Lake tiles controlled by the city"', () => {
    const { state, city } = oneCity();
    // two worked water tiles, one Coast and one Lake
    const a = tileAtCoords(state.map, 9, 8);
    const b = tileAtCoords(state.map, 7, 8);
    a.terrain = 'COAST';
    b.terrain = 'LAKE';
    setTileOwner(a, 0, city.id);
    setTileOwner(b, 0, city.id);
    a.locked = true;                          // the citizens go to the water
    b.locked = true;
    city.population = 2;
    const before = computeCityStats(state, city).total.food;
    city.buildings.push('LIGHTHOUSE');
    const stats = computeCityStats(state, city);
    const worked = stats.workedTiles
      .filter((i) => state.map.tiles[i].terrain === 'COAST' || state.map.tiles[i].terrain === 'LAKE').length;
    expect(worked).toBe(2);
    // the flat +1 rides the building's own yields; the tiles pay per worked one
    expect(stats.total.food - before).toBeCloseTo(1 + worked, 6);
  });
});

describe('the Military Engineer', () => {
  it('"can only be built in a city that has an Encampment with an Armory"', () => {
    const { state, city } = oneCity();
    state.unitsMode = true;
    grantTechs(state, 'MILITARY_ENGINEERING');
    const has = () => trainableUnits(state, 0, city).some((d) => d.id === 'MILITARY_ENGINEER');
    expect(has()).toBe(false);
    city.buildings.push('ARMORY');
    expect(has()).toBe(true);
  });
});
