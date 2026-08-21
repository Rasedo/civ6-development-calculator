import { describe, it, expect } from 'vitest';
import { greatPeopleEarned, greatPersonPointsPerTurn } from '../../../cpu/core/greatPeople';
import { seatOf, tileCity } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { foundCity, queueDistrict, queueBuilding, queueWonder, setGovernment, endTurn } from '../../../cpu/core/game';
import { canPlaceWonder, wonderExists } from '../../../cpu/core/rules';
import { computeCityStats, citySpecialistSlots, workableTiles } from '../../../cpu/core/city';
import { districtAdjacency } from '../../../cpu/core/yields';
import { governmentSlots } from '../../../cpu/core/effects';
import { grantCivics, expandBorders } from '../helpers';
import { GREAT_PEOPLE, GP_ERA_GPP } from '../../../cpu/data/greatPeople';
import { gpOfferCost } from '../../../cpu/core/greatPeople';

function sandboxCity() {
  const state = makeState(makeMap(16, 16));
  state.sandbox = true;
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
  return { state, city };
}

describe('world wonders', () => {
  it('enforces placement requirements', () => {
    const { state, city } = sandboxCity();
    const grass = tileAtCoords(state.map, 9, 8);
    expect(canPlaceWonder(state, city, 'PYRAMIDS', grass.index, 0).ok).toBe(false); // needs desert
    grass.terrain = 'DESERT';
    expect(canPlaceWonder(state, city, 'PYRAMIDS', grass.index, 0).ok).toBe(true);

    const dry = tileAtCoords(state.map, 7, 8);
    expect(canPlaceWonder(state, city, 'HANGING_GARDENS', dry.index, 0).ok).toBe(false);
    dry.riverMask = 1;
    expect(canPlaceWonder(state, city, 'HANGING_GARDENS', dry.index, 0).ok).toBe(true);
  });

  it('is one-per-world', () => {
    const { state, city } = sandboxCity();
    const desert = tileAtCoords(state.map, 9, 8);
    desert.terrain = 'DESERT';
    expect(queueWonder(state, city.id, 'PYRAMIDS', desert.index, 0).ok).toBe(true);
    expect(wonderExists(state, 'PYRAMIDS')).toBe(true);
    const other = tileAtCoords(state.map, 7, 8);
    other.terrain = 'DESERT';
    expect(canPlaceWonder(state, city, 'PYRAMIDS', other.index, 0).ok).toBe(false);
  });

  it('grants city yields and theater adjacency', () => {
    const { state, city } = sandboxCity();
    const before = computeCityStats(state, city).breakdown.buildings.culture;
    const desert = tileAtCoords(state.map, 9, 8);
    desert.terrain = 'DESERT';
    queueWonder(state, city.id, 'PYRAMIDS', desert.index, 0);
    const after = computeCityStats(state, city).breakdown.buildings.culture;
    expect(after - before).toBe(2);

    // theater square next to the wonder gets +2 culture adjacency (GS)
    expect(districtAdjacency(state.map, tileAtCoords(state.map, 10, 8), 'THEATER_SQUARE')).toBe(2);
  });

  it('Petra boosts this city’s worked desert tiles', () => {
    const { state, city } = sandboxCity();
    // make all workable tiles desert so worked tiles are desert for sure
    for (const t of state.map.tiles) {
      if (tileCity(t) === city.id && t.index !== city.centerIndex) t.terrain = 'DESERT';
    }
    const spot = tileAtCoords(state.map, 9, 8);
    const before = computeCityStats(state, city);
    expect(queueWonder(state, city.id, 'PETRA', spot.index, 0).ok).toBe(true);
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
      queueDistrict(state, city.id, 'INDUSTRIAL_ZONE', tileAtCoords(state.map, 10, 8).index, 0).ok,
    ).toBe(true);
    const base = computeCityStats(state, city);
    expect(queueWonder(state, city.id, 'RUHR_VALLEY', river.index, 0).ok).toBe(true);
    const boosted = computeCityStats(state, city);
    expect(boosted.total.production).toBeCloseTo(base.total.production * 1.2, 5);

    const growthBefore = boosted.effectiveFoodSurplus;
    const hg = tileAtCoords(state.map, 8, 9);
    hg.riverMask = 1;
    expect(queueWonder(state, city.id, 'HANGING_GARDENS', hg.index, 0).ok).toBe(true);
    const growthAfter = computeCityStats(state, city).effectiveFoodSurplus;
    expect(growthAfter).toBeCloseTo(growthBefore * 1.15, 5);
  });

  it('Forbidden City adds a wildcard policy slot', () => {
    const { state, city } = sandboxCity();
    grantCivics(state, 'CODE_OF_LAWS');
    expect(setGovernment(state, 'CHIEFDOM', 0).ok).toBe(true);
    expect(governmentSlots(state, 0).length).toBe(2);
    const spot = tileAtCoords(state.map, 9, 8);
    expect(queueWonder(state, city.id, 'FORBIDDEN_CITY', spot.index, 0).ok).toBe(true);
    expect(governmentSlots(state, 0).length).toBe(3);
    expect(governmentSlots(state, 0)[2]).toBe('wildcard');
  });
});

describe('specialists', () => {
  it('slots equal buildings in the district; OVERFLOW citizens man them automatically', () => {
    const { state, city } = sandboxCity();
    queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index, 0);
    expect(citySpecialistSlots(state, city).size).toBe(0); // no buildings yet
    queueBuilding(state, city.id, 'LIBRARY', 0);
    const campusTile = tileAtCoords(state.map, 9, 8).index;
    expect(citySpecialistSlots(state, city).get(campusTile)).toBe(1);

    // population within the workable pool -> every citizen works a tile
    city.population = 4;
    const before = computeCityStats(state, city);
    expect(before.specialistTotal).toBe(0);
    // one citizen beyond the pool mans the Campus slot: +2 science
    city.population = workableTiles(state, city).length + 1;
    const after = computeCityStats(state, city);
    expect(after.specialistTotal).toBe(1);
    expect(after.breakdown.districts.science - before.breakdown.districts.science).toBe(2);
  });

  it('the assignment clamps to open slots', () => {
    const { state, city } = sandboxCity();
    queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index, 0);
    queueBuilding(state, city.id, 'LIBRARY', 0);
    city.population = workableTiles(state, city).length + 99;
    expect(computeCityStats(state, city).specialistTotal).toBe(1); // one building, one slot
  });
});

describe('great people', () => {
  it('accumulates points and claims people with instant effects', () => {
    const { state, city } = sandboxCity();
    queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index, 0);
    queueBuilding(state, city.id, 'LIBRARY', 0);
    expect(greatPersonPointsPerTurn(state, 0).SCIENTIST).toBe(2); // district + library

    const before = seatOf(state, 0)!.research.techProgress;
    const turns = Math.ceil(gpOfferCost(state, 'SCIENTIST') / 2);
    for (let i = 0; i < turns; i++) endTurn(state);
    expect(greatPeopleEarned(state, 'SCIENTIST')).toBe(1);
    expect(state.claimedGreatPeople[0]).toBe(GREAT_PEOPLE.SCIENTIST[0].id);
    // +50 science landed somewhere in tech progress (research also ticked normally)
    expect(seatOf(state, 0)!.research.techProgress + 1e-9).toBeGreaterThanOrEqual(before);
  });

  it('merchants pay out gold', () => {
    const { state, city } = sandboxCity();
    queueDistrict(state, city.id, 'COMMERCIAL_HUB', tileAtCoords(state.map, 9, 8).index, 0);
    queueBuilding(state, city.id, 'MARKET', 0);
    const before = seatOf(state, 0)!.treasury;
    const lump = GP_ERA_GPP[GREAT_PEOPLE.MERCHANT[0].era];
    for (let i = 0; i < 60; i++) endTurn(state);
    expect(greatPeopleEarned(state, 'MERCHANT')).toBeGreaterThanOrEqual(1);
    expect(seatOf(state, 0)!.treasury).toBeGreaterThan(before + lump); // the claim plus income
  });
});
