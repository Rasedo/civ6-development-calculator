import { describe, it, expect } from 'vitest';
import { playerSeat, tileCity } from '../src/core/seats';
import { makeMap, makeState, tileAtCoords, grantTechs, expandBorders } from './helpers';
import {
  growthFoodNeeded,
  housingGrowthFactor,
  amenitiesNeeded,
  amenityTier,
  maxSpecialtyDistricts,
} from '../src/data/constants';
import { foundCity, queueDistrict, queueBuilding, endTurn, toggleLockedTile, itemCost } from '../src/core/game';
import { canFoundCity, canPlaceDistrict } from '../src/core/rules';
import { computeCityStats, assignWorkedTiles, luxuryAmenities } from '../src/core/city';

describe('rule formulas', () => {
  it('growth thresholds follow the Civ 6 curve', () => {
    expect(growthFoodNeeded(1)).toBe(15);
    expect(growthFoodNeeded(2)).toBe(24); // 15 + 8 + 1
    expect(growthFoodNeeded(3)).toBe(33); // 15 + 16 + 2.83 -> floor
  });

  it('housing growth factors', () => {
    expect(housingGrowthFactor(3)).toBe(1);
    expect(housingGrowthFactor(1)).toBe(0.5);
    expect(housingGrowthFactor(0)).toBe(0.25);
    expect(housingGrowthFactor(-2)).toBe(0.25);
  });

  it('amenity needs and tiers', () => {
    expect(amenitiesNeeded(1)).toBe(0);
    expect(amenitiesNeeded(2)).toBe(0);
    expect(amenitiesNeeded(3)).toBe(1);
    expect(amenitiesNeeded(5)).toBe(2);
    expect(amenityTier(0).name).toBe('Content');
    expect(amenityTier(1).name).toBe('Happy');
    expect(amenityTier(3).name).toBe('Ecstatic');
    expect(amenityTier(-1).name).toBe('Displeased'); // D-12: Content is 0 only
    expect(amenityTier(-2).name).toBe('Displeased');
    expect(amenityTier(-3).name).toBe('Unhappy'); // D-12: Unhappy from -3
    expect(amenityTier(-5).name).toBe('Unhappy');
  });

  it('district slots scale with population', () => {
    expect(maxSpecialtyDistricts(1)).toBe(1);
    expect(maxSpecialtyDistricts(3)).toBe(1);
    expect(maxSpecialtyDistricts(4)).toBe(2);
    expect(maxSpecialtyDistricts(7)).toBe(3);
  });
});

describe('founding cities', () => {
  it('claims center + first ring and grants the capital a palace', () => {
    const state = makeState(makeMap(16, 16));
    const center = tileAtCoords(state.map, 8, 8);
    const r = foundCity(state, center.index);
    expect(r.ok).toBe(true);
    const city = r.city!;
    expect(city.isCapital).toBe(true);
    expect(city.buildings).toContain('PALACE');
    expect(center.district).toBe('CITY_CENTER');
    expect(center.districtComplete).toBe(true);
    const owned = state.map.tiles.filter((t) => tileCity(t) === city.id);
    expect(owned.length).toBe(7); // Civ 6: ring 1 only; the rest comes from culture
  });

  it('enforces minimum city distance but not own-territory', () => {
    const state = makeState(makeMap(20, 20));
    const a = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    expandBorders(state, a, 4);
    expect(canFoundCity(state, tileAtCoords(state.map, 10, 8).index).ok).toBe(false); // dist 2
    expect(canFoundCity(state, tileAtCoords(state.map, 11, 8).index).ok).toBe(false); // dist 3 — real Civ 6 blocks it (P4/D-5)
    expect(canFoundCity(state, tileAtCoords(state.map, 12, 8).index).ok).toBe(true); // dist 4, owned by first city
  });

  it('never steals already-claimed tiles', () => {
    const state = makeState(makeMap(20, 20));
    const a = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    const ring1 = tileAtCoords(state.map, 9, 8);
    expect(tileCity(ring1)).toBe(a.id);
    state.settlers = 1; // later cities need a trained settler
    const b = foundCity(state, tileAtCoords(state.map, 12, 8).index).city!;
    expect(tileCity(ring1)).toBe(a.id); // still A's
    expect(tileCity(tileAtCoords(state.map, 13, 8))).toBe(b.id);
    expect(tileCity(tileAtCoords(state.map, 11, 8))).toBe(b.id); // unowned gap goes to B's first ring
  });

  it('rejects water, mountains and oases', () => {
    const state = makeState(makeMap(16, 16));
    const water = tileAtCoords(state.map, 2, 2);
    water.terrain = 'COAST';
    expect(canFoundCity(state, water.index).ok).toBe(false);
    const mtn = tileAtCoords(state.map, 3, 3);
    mtn.elevation = 'MOUNTAIN';
    expect(canFoundCity(state, mtn.index).ok).toBe(false);
  });
});

describe('citizens and growth', () => {
  it('works as many tiles as population, honoring locks', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    expect(assignWorkedTiles(state, city).length).toBe(1);

    const mediocre = tileAtCoords(state.map, 7, 8); // plain grassland, would not win on score
    const better = tileAtCoords(state.map, 9, 8);
    better.elevation = 'HILLS'; // 2F1P beats 2F
    expect(assignWorkedTiles(state, city)).toContain(better.index);

    toggleLockedTile(state, city.id, mediocre.index);
    const worked = assignWorkedTiles(state, city);
    expect(worked).toContain(mediocre.index);
    expect(worked.length).toBe(1);
  });

  it('accumulates food and grows', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    const stats = computeCityStats(state, city);
    expect(stats.foodSurplus).toBeGreaterThan(0);
    let guard = 0;
    while (city.population === 1 && guard++ < 50) endTurn(state);
    expect(city.population).toBe(2);
  });

  it('treasury and science accumulate over turns', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index);
    endTurn(state);
    expect(playerSeat(state).treasury).toBeGreaterThan(0); // palace gold
    expect(playerSeat(state).scienceTotal).toBeGreaterThan(0);
    expect(state.turn).toBe(2);
  });
});

describe('districts and buildings', () => {
  function settled() {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    return { state, city };
  }

  it('sandbox places districts instantly; normal mode queues them', () => {
    const { state, city } = settled();
    state.sandbox = true;
    const spot = tileAtCoords(state.map, 9, 8);
    expect(queueDistrict(state, city.id, 'CAMPUS', spot.index).ok).toBe(true);
    expect(spot.districtComplete).toBe(true);
    expect(city.queue.length).toBe(0);
  });

  it('district requires research outside sandbox and completes after enough production', () => {
    const { state, city } = settled();
    const spot = tileAtCoords(state.map, 9, 8);
    expect(queueDistrict(state, city.id, 'CAMPUS', spot.index).ok).toBe(false); // Writing missing
    grantTechs(state, 'WRITING');
    expect(queueDistrict(state, city.id, 'CAMPUS', spot.index).ok).toBe(true);
    expect(spot.districtComplete).toBe(false);
    const prod = computeCityStats(state, city).total.production;
    const turns = Math.ceil(itemCost(city.queue[0]) / prod);
    for (let i = 0; i < turns; i++) endTurn(state);
    expect(spot.districtComplete).toBe(true);
  });

  it('enforces the population district limit', () => {
    const { state, city } = settled();
    state.sandbox = true;
    expect(queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index).ok).toBe(true);
    const second = canPlaceDistrict(state, city, 'HOLY_SITE', tileAtCoords(state.map, 7, 8).index);
    expect(second.ok).toBe(false); // pop 1 -> only 1 specialty district
  });

  it('aqueduct needs city center adjacency and a water source', () => {
    const { state, city } = settled();
    state.sandbox = true;
    const adj = tileAtCoords(state.map, 9, 8); // adjacent to center, no water source
    expect(canPlaceDistrict(state, city, 'AQUEDUCT', adj.index).ok).toBe(false);
    tileAtCoords(state.map, 10, 8).terrain = 'LAKE'; // lake next to the spot
    expect(canPlaceDistrict(state, city, 'AQUEDUCT', adj.index).ok).toBe(true);
    const far = tileAtCoords(state.map, 11, 9);
    expect(canPlaceDistrict(state, city, 'AQUEDUCT', far.index).ok).toBe(false);
  });

  it('encampment cannot touch the city center', () => {
    const { state, city } = settled();
    state.sandbox = true;
    expandBorders(state, city, 2);
    expect(canPlaceDistrict(state, city, 'ENCAMPMENT', tileAtCoords(state.map, 9, 8).index).ok).toBe(false);
    expect(canPlaceDistrict(state, city, 'ENCAMPMENT', tileAtCoords(state.map, 10, 8).index).ok).toBe(true);
  });

  it('buildings require their chain and a completed district', () => {
    const { state, city } = settled();
    state.sandbox = true;
    expect(queueBuilding(state, city.id, 'UNIVERSITY').ok).toBe(false); // no campus at all
    queueDistrict(state, city.id, 'CAMPUS', tileAtCoords(state.map, 9, 8).index);
    expect(queueBuilding(state, city.id, 'UNIVERSITY').ok).toBe(false); // needs library
    expect(queueBuilding(state, city.id, 'LIBRARY').ok).toBe(true);
    expect(queueBuilding(state, city.id, 'UNIVERSITY').ok).toBe(true);
    const sci = computeCityStats(state, city).breakdown.buildings.science;
    expect(sci).toBe(2 + 4 + 2); // library + university + palace
  });

  it('water mill requires a river on the city center', () => {
    const { state, city } = settled();
    state.sandbox = true;
    expect(queueBuilding(state, city.id, 'WATER_MILL').ok).toBe(false);
    state.map.tiles[city.centerIndex].riverMask = 1;
    expect(queueBuilding(state, city.id, 'WATER_MILL').ok).toBe(true);
  });
});

describe('amenities', () => {
  it('an improved luxury inside borders grants an amenity', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    const lux = tileAtCoords(state.map, 9, 8);
    lux.resource = 'WINE';
    expect(luxuryAmenities(state).get(city.id)).toBe(0); // not improved yet
    lux.improvement = 'PLANTATION';
    expect(luxuryAmenities(state).get(city.id)).toBe(1);
  });
});
