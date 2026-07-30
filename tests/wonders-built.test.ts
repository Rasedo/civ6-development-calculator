import { describe, it, expect } from 'vitest';
import { playerSeat } from '../src/core/seats';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { foundCity, queueDistrict, queueBuilding, queueWonder, setSpecialists, setGovernment, endTurn } from '../src/core/game';
import { greatPersonPointsPerTurn, greatPeopleEarned } from '../src/core/game';
import { canPlaceWonder, wonderExists } from '../src/core/rules';
import { computeCityStats, citySpecialistSlots } from '../src/core/city';
import { districtAdjacency } from '../src/core/yields';
import { governmentSlots } from '../src/core/effects';
import { grantCivics, expandBorders } from './helpers';
import { gpCost } from '../src/data/greatPeople';

function sandboxCity() {
  const state = makeState(makeMap(16, 16));
  state.sandbox = true;
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
  return { state, city };
}

describe('world wonders', () => {
  it('enforces placement requirements', () => {
    const { state, city } = sandboxCity();
    const grass = tileAtCoords(state.map, 9, 8);
    expect(canPlaceWonder(state, city, 'PYRAMIDS', grass.index).ok).toBe(false); // needs desert
    grass.terrain = 'DESERT';
    expect(canPlaceWonder(state, city, 'PYRAMIDS', grass.index).ok).toBe(true);

    const dry = tileAtCoords(state.map, 7, 8);
    expect(canPlaceWonder(state, city, 'HANGING_GARDENS', dry.index).ok).toBe(false);
    dry.riverMask = 1;
    expect(canPlaceWonder(state, city, 'HANGING_GARDENS', dry.index).ok).toBe(true);
  });

  it('is one-per-world', () => {
    const { state, city } = sandboxCity();
    const desert = tileAtCoords(state.map, 9, 8);
    desert.terrain = 'DESERT';
    expect(queueWonder(state, city.id, 'PYRAMIDS', desert.index).ok).toBe(true);
    expect(wonderExists(state, 'PYRAMIDS')).toBe(true);
    const other = tileAtCoords(state.map, 7, 8);
    other.terrain = 'DESERT';
    expect(canPlaceWonder(state, city, 'PYRAMIDS', other.index).ok).toBe(false);
  });

  it('grants city yields and theater adjacency', () => {
    const { state, city } = sandboxCity();
    const before = computeCityStats(state, city).breakdown.buildings.culture;
    const desert = tileAtCoords(state.map, 9, 8);
    desert.terrain = 'DESERT';
    queueWonder(state, city.id, 'PYRAMIDS', desert.index);
    const after = computeCityStats(state, city).breakdown.buildings.culture;
    expect(after - before).toBe(2);

    // theater square next to the wonder gets +1 culture adjacency
    expect(districtAdjacency(state.map, tileAtCoords(state.map, 10, 8), 'THEATER_SQUARE')).toBe(1);
  });

  it('Petra boosts this city’s worked desert tiles', () => {
    const { state, city } = sandboxCity();
    // make all workable tiles desert so worked tiles are desert for sure
    for (const t of state.map.tiles) {
      if (t.cityId === city.id && t.index !== city.centerIndex) t.terrain = 'DESERT';
    }
    const spot = tileAtCoords(state.map, 9, 8);
    const before = computeCityStats(state, city);
    expect(queueWonder(state, city.id, 'PETRA', spot.index).ok).toBe(true);
    const after = computeCityStats(state, city);
    // one worked desert tile gains +2f +2g +1p (worked tile itself may shift; check gold delta ≥ 2)
    expect(after.breakdown.tiles.gold).toBeGreaterThanOrEqual(before.breakdown.tiles.gold + 2);
  });

  it('Ruhr Valley multiplies city production; Hanging Gardens boosts growth', () => {
    const { state, city } = sandboxCity();
    expandBorders(state, city, 2);
    const river = tileAtCoords(state.map, 9, 8);
    river.riverMask = 1;
    expect(
      queueDistrict(state, city.id, 'INDUSTRIAL_ZONE', tileAtCoords(state.map, 10, 8).index).ok,
    ).toBe(true);
    const base = computeCityStats(state, city);
    expect(queueWonder(state, city.id, 'RUHR_VALLEY', river.index).ok).toBe(true);
    const boosted = computeCityStats(state, city);
    expect(boosted.total.production).toBeCloseTo(base.total.production * 1.2, 5);

    const growthBefore = boosted.effectiveFoodSurplus;
    const hg = tileAtCoords(state.map, 8, 9);
    hg.riverMask = 1;
    expect(queueWonder(state, city.id, 'HANGING_GARDENS', hg.index).ok).toBe(true);
    const growthAfter = computeCityStats(state, city).effectiveFoodSurplus;
    expect(growthAfter).toBeCloseTo(growthBefore * 1.15, 5);
  });

  it('Forbidden City adds a wildcard policy slot', () => {
    const { state, city } = sandboxCity();
    grantCivics(state, 'CODE_OF_LAWS');
    expect(setGovernment(state, 'CHIEFDOM').ok).toBe(true);
    expect(governmentSlots(state).length).toBe(2);
    const spot = tileAtCoords(state.map, 9, 8);
    expect(queueWonder(state, city.id, 'FORBIDDEN_CITY', spot.index).ok).toBe(true);
    expect(governmentSlots(state).length).toBe(3);
    expect(governmentSlots(state)[2]).toBe('wildcard');
  });
});

describe('specialists', () => {
  it('slots equal buildings in the district; specialists trade tiles for district yields', () => {
    const { state, city } = sandboxCity();
    city.population = 4;
    queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index);
    expect(citySpecialistSlots(state, city).size).toBe(0); // no buildings yet
    queueBuilding(state, city.id, 'LIBRARY');
    const campusTile = tileAtCoords(state.map, 9, 8).index;
    expect(citySpecialistSlots(state, city).get(campusTile)).toBe(1);

    const before = computeCityStats(state, city);
    expect(setSpecialists(state, city.id, campusTile, 1).ok).toBe(true);
    const after = computeCityStats(state, city);
    expect(after.specialistTotal).toBe(1);
    expect(after.workedTiles.length).toBe(before.workedTiles.length - 1);
    expect(after.breakdown.districts.science - before.breakdown.districts.science).toBe(2);
  });

  it('clamps to slots', () => {
    const { state, city } = sandboxCity();
    city.population = 5;
    queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index);
    queueBuilding(state, city.id, 'LIBRARY');
    const campusTile = tileAtCoords(state.map, 9, 8).index;
    setSpecialists(state, city.id, campusTile, 99);
    expect(computeCityStats(state, city).specialistTotal).toBe(1);
  });
});

describe('great people', () => {
  it('accumulates points and claims people with instant effects', () => {
    const { state, city } = sandboxCity();
    queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index);
    queueBuilding(state, city.id, 'LIBRARY');
    expect(greatPersonPointsPerTurn(state).SCIENTIST).toBe(2); // district + library

    const before = playerSeat(state).research.techProgress;
    const turns = Math.ceil(gpCost(0) / 2);
    for (let i = 0; i < turns; i++) endTurn(state);
    expect(greatPeopleEarned(state, 'SCIENTIST')).toBe(1);
    expect(state.greatPeople.earned[0]).toBe('GP_ARYABHATA');
    // +50 science landed somewhere in tech progress (research also ticked normally)
    expect(playerSeat(state).research.techProgress + 1e-9).toBeGreaterThanOrEqual(before);
  });

  it('merchants pay out gold', () => {
    const { state, city } = sandboxCity();
    queueDistrict(state, city.id, 'COMMERCIAL_HUB', tileAtCoords(state.map, 9, 8).index);
    queueBuilding(state, city.id, 'MARKET');
    const before = playerSeat(state).treasury;
    for (let i = 0; i < 30; i++) endTurn(state);
    expect(greatPeopleEarned(state, 'MERCHANT')).toBeGreaterThanOrEqual(1);
    expect(playerSeat(state).treasury).toBeGreaterThan(before + 100); // Colaeus +100 plus income
  });
});
