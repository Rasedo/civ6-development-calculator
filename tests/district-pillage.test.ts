/**
 * AUDIT B-32: district pillage. A raided (pillaged) district's adjacency +
 * buildings go dark until repaired; STATIC counts (maintenance, one-per-type
 * limit) stay because the district is still owned. Yields darken, repair
 * restores, static counts unchanged.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, expandBorders } from './helpers';
import { foundCity, queueDistrict, queueBuilding } from '../src/core/game';
import { computeCityStats, cityMaintenance } from '../src/core/city';
import { districtAdjacency } from '../src/core/yields';
import { spawnUnit, builderRepair } from '../src/core/units';
import { hostileUnitAct } from '../src/core/combat';

function cityWithCampus(campusCol = 9) {
  const state = makeState(makeMap(16, 16));
  state.sandbox = true; // districts + buildings complete instantly
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
  expandBorders(state, city, 3);
  // two mountains give the Campus a static +2 science adjacency
  tileAtCoords(state.map, campusCol, 7).elevation = 'MOUNTAIN';
  tileAtCoords(state.map, campusCol + 1, 8).elevation = 'MOUNTAIN';
  const campus = tileAtCoords(state.map, campusCol, 8);
  expect(queueDistrict(state, city.id, 'CAMPUS', campus.index).ok).toBe(true);
  expect(campus.districtComplete).toBe(true);
  expect(queueBuilding(state, city.id, 'LIBRARY').ok).toBe(true); // +2 science, CAMPUS building
  return { state, city, campus };
}

describe('B-32 district pillage', () => {
  it('darkens a pillaged district (adjacency + building yields) and repair restores it', () => {
    const { state, city, campus } = cityWithCampus();
    const adjacency = districtAdjacency(state.map, campus, 'CAMPUS');
    expect(adjacency).toBe(2);

    const clean = computeCityStats(state, city).breakdown;
    expect(clean.districts.science).toBe(adjacency); // campus adjacency
    const cleanBuildScience = clean.buildings.science; // PALACE + LIBRARY
    const totalBefore = computeCityStats(state, city).total.science;

    // Pillage: the Campus adjacency (all of it) AND the Library (only its
    // building) go dark; the CITY_CENTER Palace science stays.
    campus.districtPillaged = true;
    const dark = computeCityStats(state, city).breakdown;
    expect(dark.districts.science).toBe(0); // campus adjacency gone
    expect(cleanBuildScience - dark.buildings.science).toBe(2); // just the Library
    expect(computeCityStats(state, city).total.science).toBeLessThan(totalBefore);

    // Repair restores every channel exactly.
    campus.districtPillaged = false;
    const fixed = computeCityStats(state, city).breakdown;
    expect(fixed.districts.science).toBe(adjacency);
    expect(fixed.buildings.science).toBe(cleanBuildScience);
    expect(computeCityStats(state, city).total.science).toBe(totalBefore);
  });

  it('keeps static counts (maintenance) while pillaged — pillaged is still owned', () => {
    const { state, city, campus } = cityWithCampus();
    const maintClean = cityMaintenance(state, city);
    expect(maintClean).toBeGreaterThan(0); // Campus upkeep = 1
    campus.districtPillaged = true;
    expect(cityMaintenance(state, city)).toBe(maintClean); // cost stays
  });

  it('a hostile unit standing on a completed enemy district pillages it; a builder repairs it', () => {
    // Campus at (11,8) — distance 3 from the (8,8) center, out of melee range so
    // the raider cannot attack the city and falls through to the pillage branch.
    const { state, city, campus } = cityWithCampus(11);
    state.unitsMode = true;
    expect(campus.cityId).toBe(city.id); // the district tile is owned
    const barb = spawnUnit(state, 'WARRIOR', campus.index, 'barbarian')!;
    barb.tileIndex = campus.index;
    barb.movesLeft = 2;
    expect(campus.districtPillaged).toBeFalsy();
    hostileUnitAct(state, barb);
    expect(campus.districtPillaged).toBe(true);
    expect(barb.movesLeft).toBe(0); // pillage ends the turn, no heal

    // A builder on the tile repairs the district (builderRepair twin).
    const builder = spawnUnit(state, 'BUILDER', campus.index)!;
    builder.tileIndex = campus.index;
    expect(builderRepair(state, builder.id).ok).toBe(true);
    expect(campus.districtPillaged).toBe(false);
  });
});
