import { describe, it, expect } from 'vitest';
import { seatOf, tileCity, tileSeat } from '../../cpu/core/seats';
import { CIV_LEVELS } from '../../cpu/data/civLevels';
import { tilesWithin } from '../../world/hex';
import { canPlaceDistrict, makeMap, makeState, seededGame, tileAtCoords, grantTechs, expandBorders, standBuilding, standDistrict } from './helpers';
import { growthFoodNeeded, housingGrowthFactor, amenitiesNeeded, amenityTier, maxSpecialtyDistricts } from '../../cpu/data/constants';
import { foundCity, endTurn, itemCost } from '../../cpu/core/game';
import { availableBuildings, canFoundCity } from '../../cpu/core/rules';
import { placeSeatDistrict } from '../../cpu/core/phase';
import { computeUnlocksIn } from '../../cpu/core/effects';
import { computeCityStats, assignWorkedTiles, luxuryAmenities } from '../../cpu/core/city';

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
    // CIV6 (CITY_POP_PER_AMENITY 2), as `GetAmenitiesNeeded` reads live
    expect(amenitiesNeeded(1)).toBe(1);
    expect(amenitiesNeeded(4)).toBe(2);
    expect(amenitiesNeeded(5)).toBe(3);
    expect(amenitiesNeeded(6)).toBe(3);
    expect(amenitiesNeeded(7)).toBe(4);
    expect(amenitiesNeeded(9)).toBe(5);
    expect(amenitiesNeeded(12)).toBe(6);
    expect(amenitiesNeeded(13)).toBe(7);
    expect(amenityTier(0).name).toBe('Content');
    expect(amenityTier(2).name).toBe('Content'); // Content 0..2
    expect(amenityTier(3).name).toBe('Happy'); // Happy 3..4
    expect(amenityTier(4).name).toBe('Happy');
    expect(amenityTier(5).name).toBe('Ecstatic'); // Ecstatic 5 and up
    expect(amenityTier(-1).name).toBe('Displeased');
    expect(amenityTier(-2).name).toBe('Displeased');
    expect(amenityTier(-3).name).toBe('Unhappy'); // Unhappy from -3
    expect(amenityTier(-4).name).toBe('Unhappy');
    expect(amenityTier(-5).name).toBe('Unrest'); // Unrest -5..-6
    expect(amenityTier(-6).name).toBe('Unrest');
    expect(amenityTier(-7).name).toBe('Revolt'); // Revolt -7 and below
    expect(amenityTier(-30).name).toBe('Revolt');
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
    const r = foundCity(state, center.index, 0);
    expect(r.ok).toBe(true);
    const city = r.city!;
    expect(city.isCapital).toBe(true);
    expect(city.buildings).toContain('PALACE');
    expect(center.district).toBe('CITY_CENTER');
    expect(center.districtComplete).toBe(true);
    const owned = state.map.tiles.filter((t) => tileCity(t) === city.id);
    expect(owned.length).toBe(7); // Civ 6: ring 1 only; the rest comes from culture
  });

  // CIV6 (CivilizationLevels.StartingTilesForCity): FULL_CIV 6, CITY_STATE 5
  it('a city-state starts with its centre and five of the ring, a civ with all six', () => {
    const state = seededGame(4242, 1, 1);
    const cs = state.cityStates[0];
    expect(cs).toBeDefined();
    const mine = state.map.tiles.filter((t) => tileSeat(t) === cs.seat);
    const centre = state.map.tiles[cs.centerIndex];
    const ring = tilesWithin(state.map, centre.col, centre.row, 1).filter((t) => t.index !== cs.centerIndex).sort((a, b) => a.index - b.index);
    expect(CIV_LEVELS.CITY_STATE.startingTilesForCity).toBe(5);
    expect(CIV_LEVELS.FULL_CIV.startingTilesForCity).toBe(6);
    expect(mine.length).toBe(1 + Math.min(ring.length, CIV_LEVELS.CITY_STATE.startingTilesForCity));
    // the unclaimed one is the ring's HIGHEST tile index, the order both engines share
    if (ring.length === 6) expect(tileSeat(ring[ring.length - 1])).not.toBe(cs.seat);
  });

  it('enforces minimum city distance but not own-territory', () => {
    const state = makeState(makeMap(20, 20));
    const a = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    expandBorders(state, a, 4);
    expect(canFoundCity(state, tileAtCoords(state.map, 10, 8).index, 0).ok).toBe(false); // dist 2
    expect(canFoundCity(state, tileAtCoords(state.map, 11, 8).index, 0).ok).toBe(false); // dist 3 — real Civ 6 blocks it
    expect(canFoundCity(state, tileAtCoords(state.map, 12, 8).index, 0).ok).toBe(true); // dist 4, owned by first city
  });

  it('never steals already-claimed tiles', () => {
    const state = makeState(makeMap(20, 20));
    const a = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    const ring1 = tileAtCoords(state.map, 9, 8);
    expect(tileCity(ring1)).toBe(a.id);
    const b = foundCity(state, tileAtCoords(state.map, 12, 8).index, 0).city!;
    expect(tileCity(ring1)).toBe(a.id); // still A's
    expect(tileCity(tileAtCoords(state.map, 13, 8))).toBe(b.id);
    expect(tileCity(tileAtCoords(state.map, 11, 8))).toBe(b.id); // unowned gap goes to B's first ring
  });

  it('rejects water, mountains and oases', () => {
    const state = makeState(makeMap(16, 16));
    const water = tileAtCoords(state.map, 2, 2);
    water.terrain = 'COAST';
    expect(canFoundCity(state, water.index, 0).ok).toBe(false);
    const mtn = tileAtCoords(state.map, 3, 3);
    mtn.elevation = 'MOUNTAIN';
    expect(canFoundCity(state, mtn.index, 0).ok).toBe(false);
  });
});

describe('citizens and growth', () => {
  it('works as many tiles as population, honoring locks', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    expect(assignWorkedTiles(state, city).length).toBe(1);

    const mediocre = tileAtCoords(state.map, 7, 8); // plain grassland, would not win on score
    const better = tileAtCoords(state.map, 9, 8);
    better.elevation = 'HILLS'; // 2F1P beats 2F
    expect(assignWorkedTiles(state, city)).toContain(better.index);

    mediocre.locked = true;
    const worked = assignWorkedTiles(state, city);
    expect(worked).toContain(mediocre.index);
    expect(worked.length).toBe(1);
  });

  it('accumulates food and grows', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    const stats = computeCityStats(state, city);
    expect(stats.foodSurplus).toBeGreaterThan(0);
    let guard = 0;
    while (city.population === 1 && guard++ < 50) endTurn(state);
    expect(city.population).toBe(2);
  });

  it('treasury and science accumulate over turns', () => {
    const state = makeState(makeMap(16, 16));
    foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
    endTurn(state);
    expect(seatOf(state, 0)!.treasury).toBeGreaterThan(0); // palace gold
    expect(seatOf(state, 0)!.scienceTotal).toBeGreaterThan(0);
    expect(state.turn).toBe(2);
  });
});

describe('districts and buildings', () => {
  function settled() {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    return { state, city };
  }

  it('district requires research and completes after enough production', () => {
    const { state, city } = settled();
    const seat = seatOf(state, 0)!;
    const spot = tileAtCoords(state.map, 9, 8);
    expect(placeSeatDistrict(state, seat, city, 'CAMPUS', computeUnlocksIn(seat.research, []), spot.index)).toBe(false); // Writing missing
    grantTechs(state, 'WRITING');
    expect(placeSeatDistrict(state, seat, city, 'CAMPUS', computeUnlocksIn(seat.research, []), spot.index)).toBe(true);
    expect(spot.districtComplete).toBe(false);
    const prod = computeCityStats(state, city).total.production;
    const turns = Math.ceil(itemCost(city.queue[0]) / prod);
    for (let i = 0; i < turns; i++) endTurn(state);
    expect(spot.districtComplete).toBe(true);
  });

  it('enforces the population district limit', () => {
    const { state, city } = settled();
    state.sandbox = true;
    standDistrict(state, city, 'CAMPUS', tileAtCoords(state.map, 9, 8).index);
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

  it('GS: a district may sit on floodplains, never on an oasis', () => {
    const { state, city } = settled();
    state.sandbox = true;
    const spot = tileAtCoords(state.map, 9, 8);
    spot.terrain = 'DESERT';
    spot.feature = 'FLOODPLAINS';
    expect(canPlaceDistrict(state, city, 'CAMPUS', spot.index).ok).toBe(true);
    spot.feature = 'OASIS';
    expect(canPlaceDistrict(state, city, 'CAMPUS', spot.index).ok).toBe(false);
  });

  it('a district needs the tech that CLEARS the feature on its tile', () => {
    const { state, city } = settled();
    grantTechs(state, 'WRITING');
    const spot = tileAtCoords(state.map, 9, 8);
    spot.terrain = 'PLAINS';
    spot.feature = 'RAINFOREST'; // cleared by BRONZE_WORKING
    expect(canPlaceDistrict(state, city, 'CAMPUS', spot.index).ok).toBe(false);
    grantTechs(state, 'MINING', 'BRONZE_WORKING');
    expect(canPlaceDistrict(state, city, 'CAMPUS', spot.index).ok).toBe(true);
  });

  it('the wire names the district TILE: an illegal one is refused, the named one is paved', () => {
    const { state, city } = settled();
    grantTechs(state, 'WRITING', 'MINING', 'BRONZE_WORKING');
    const seat = seatOf(state, 0)!;
    const unlocks = computeUnlocksIn(seat.research, []);
    const off = tileAtCoords(state.map, 0, 0); // not this city's tile
    expect(placeSeatDistrict(state, seat, city, 'CAMPUS', unlocks, off.index)).toBe(false);
    expect(off.district).toBe(null);
    const spot = tileAtCoords(state.map, 9, 8);
    spot.terrain = 'PLAINS';
    spot.feature = 'WOODS'; // the pave clears it
    expect(placeSeatDistrict(state, seat, city, 'CAMPUS', unlocks, spot.index)).toBe(true);
    expect(spot.district).toBe('CAMPUS');
    expect(spot.feature).toBe(null);
  });

  it('buildings require their chain and a completed district', () => {
    const { state, city } = settled();
    state.sandbox = true;
    const offered = (id: string) => availableBuildings(state, city).some((b) => b.id === id);
    expect(offered('UNIVERSITY')).toBe(false); // no campus at all
    standDistrict(state, city, 'CAMPUS', tileAtCoords(state.map, 9, 8).index);
    expect(offered('UNIVERSITY')).toBe(false); // needs library
    standBuilding(state, city, 'LIBRARY');
    standBuilding(state, city, 'UNIVERSITY');
    const sci = computeCityStats(state, city).breakdown.buildings.science;
    expect(sci).toBe(2 + 4 + 2); // library + university + palace
  });

  it('water mill requires a river on the city center', () => {
    const { state, city } = settled();
    state.sandbox = true;
    const offered = (id: string) => availableBuildings(state, city).some((b) => b.id === id);
    expect(offered('WATER_MILL')).toBe(false);
    state.map.tiles[city.centerIndex].riverMask = 1;
    expect(offered('WATER_MILL')).toBe(true);
  });
});

describe('amenities', () => {
  it('an improved luxury inside borders grants an amenity', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    const lux = tileAtCoords(state.map, 9, 8);
    lux.resource = 'WINE';
    expect(luxuryAmenities(state, 0).get(city.id)).toBe(0); // not improved yet
    lux.improvement = 'PLANTATION';
    expect(luxuryAmenities(state, 0).get(city.id)).toBe(1);
  });
});
