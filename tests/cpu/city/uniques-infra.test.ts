import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, bareCtx } from '../helpers';
import { computeCityStats, buildingVariantCoastYields } from '../../../cpu/core/city';
import { districtCost } from '../../../cpu/core/game';
import { validImprovementsIn } from '../../../cpu/core/rules';
import { tileYields, improvementAdjacency } from '../../../cpu/core/yields';
import { computeUnlocksIn, modifiersFromResearch } from '../../../cpu/core/effects';
import { neighbors } from '../../../world/hex';
import type { GameState, City, Tile } from '../../../cpu/core/types';

/**
 * THE UNIQUE INFRASTRUCTURE (CIV6, the owner's install): the Bath standing in
 * for Rome's Aqueduct, the Stave Church for Norway's Temple, and the Sphinx
 * and Ziggurat a Builder of Egypt or Sumeria lays. Each pins the clause the
 * install's tables state, on the engine's own rule bodies.
 */
function capital(state: GameState, col = 6, row = 6): City {
  const t = tileAtCoords(state.map, col, row);
  return settleAt(state, t.index, 0);
}

function placeDistrict(state: GameState, city: City, type: 'AQUEDUCT' | 'HOLY_SITE', tile: Tile): void {
  tile.district = type;
  tile.districtComplete = true;
  city.districts.push({ type, tileIndex: tile.index } as City['districts'][number]);
}

describe('the Bath (Rome, replaces the Aqueduct)', () => {
  it('adds +2 Housing and +1 Amenity on top of the Aqueduct, for Rome alone', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    const city = capital(state);
    const aq = neighbors(state.map, state.map.tiles[city.centerIndex])[0];
    placeDistrict(state, city, 'AQUEDUCT', aq);
    const bare = computeCityStats(state, city);
    state.seats[0].civ = 0; // Rome
    const rome = computeCityStats(state, city);
    expect(rome.housing - bare.housing).toBe(2);
    expect(rome.amenities.have - bare.amenities.have).toBe(1);
    state.seats[0].civ = 1; // Egypt keeps the plain Aqueduct
    const egypt = computeCityStats(state, city);
    expect(egypt.housing).toBe(bare.housing);
    expect(egypt.amenities.have).toBe(bare.amenities.have);
    // pillaged, the district's flat Amenity is dark like its water
    state.seats[0].civ = 0;
    aq.districtPillaged = true;
    expect(computeCityStats(state, city).amenities.have).toBe(bare.amenities.have);
  });

  it('is "cheaper to build": half the Aqueduct\'s price', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    capital(state);
    const plain = districtCost(state, 0, 'AQUEDUCT');
    state.seats[0].civ = 0;
    expect(districtCost(state, 0, 'AQUEDUCT')).toBe(Math.floor(plain * 0.5));
    expect(districtCost(state, 0, 'CAMPUS')).toBe(districtCost(state, 0, 'CAMPUS'));
    state.seats[0].civ = 2;
    expect(districtCost(state, 0, 'AQUEDUCT')).toBe(plain);
  });
});

describe('the Stave Church (Norway, replaces the Temple)', () => {
  it('gives the Holy Site a full adjacency bonus per Woods', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    const city = capital(state);
    const around = neighbors(state.map, state.map.tiles[city.centerIndex]);
    const hs = around[0];
    placeDistrict(state, city, 'HOLY_SITE', hs);
    const woods = neighbors(state.map, hs).filter((t) => t.index !== city.centerIndex).slice(0, 2);
    for (const w of woods) w.feature = 'WOODS';
    city.buildings.push('SHRINE', 'TEMPLE');
    const plain = computeCityStats(state, city).breakdown.districts.faith; // 2 Woods x 0.5 = 1
    state.seats[0].civ = 2; // Norway
    const stave = computeCityStats(state, city).breakdown.districts.faith; // + 2 x 1
    expect(stave - plain).toBe(2);
    city.buildings.splice(city.buildings.indexOf('TEMPLE'), 1);
    expect(computeCityStats(state, city).breakdown.districts.faith).toBe(plain);
  });

  it('pays +1 Production on every worked Coast tile carrying a resource', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    const center = tileAtCoords(state.map, 6, 6);
    center.terrain = 'GRASSLAND';
    const city = capital(state);
    for (const t of neighbors(state.map, center)) t.resource = 'FISH';
    city.buildings.push('SHRINE', 'TEMPLE');
    city.population = 3;
    expect(buildingVariantCoastYields(state, city)).toBeNull();
    const before = computeCityStats(state, city);
    state.seats[0].civ = 2;
    expect(buildingVariantCoastYields(state, city)).toEqual({ production: 1 });
    const after = computeCityStats(state, city);
    const paid = after.workedTiles.filter((i) => state.map.tiles[i].terrain === 'COAST' && state.map.tiles[i].resource !== null).length;
    expect(paid).toBeGreaterThan(0);
    expect(after.breakdown.tiles.production - before.breakdown.tiles.production).toBe(paid);
    for (const t of neighbors(state.map, center)) t.resource = null;
    expect(computeCityStats(state, city).breakdown.tiles.production).toBe(before.breakdown.tiles.production);
  });
});

describe('the Sphinx and the Ziggurat', () => {
  const opts = (civ: string | null, extra: Record<string, unknown> = {}) =>
    ({ unlocks: null, ownsTile: () => true, civ, ...extra }) as Parameters<typeof validImprovementsIn>[1];

  it('are offered to their civilization\'s Builder alone, on their own ground', () => {
    const map = makeMap(8, 8, 'GRASSLAND');
    const flat = tileAtCoords(map, 2, 2);
    expect(validImprovementsIn(flat, opts('EGYPT'))).toContain('SPHINX');
    expect(validImprovementsIn(flat, opts('ROME'))).not.toContain('SPHINX');
    expect(validImprovementsIn(flat, opts(null))).not.toContain('SPHINX');
    expect(validImprovementsIn(flat, opts('SUMERIA'))).toContain('ZIGGURAT');
    expect(validImprovementsIn(flat, opts('EGYPT'))).not.toContain('ZIGGURAT');
    const hills = tileAtCoords(map, 3, 2);
    hills.elevation = 'HILLS';
    expect(validImprovementsIn(hills, opts('EGYPT'))).toContain('SPHINX');
    expect(validImprovementsIn(hills, opts('SUMERIA'))).not.toContain('ZIGGURAT'); // "Cannot be built on Hills"
    const snow = tileAtCoords(map, 4, 2);
    snow.terrain = 'SNOW';
    expect(validImprovementsIn(snow, opts('SUMERIA'))).toContain('ZIGGURAT');
    expect(validImprovementsIn(snow, opts('EGYPT'))).not.toContain('SPHINX');
    // Improvement_ValidFeatures: Floodplains yes, Woods no
    const flood = tileAtCoords(map, 5, 2);
    flood.feature = 'FLOODPLAINS';
    expect(validImprovementsIn(flood, opts('EGYPT'))).toContain('SPHINX');
    expect(validImprovementsIn(flood, opts('SUMERIA'))).toContain('ZIGGURAT');
    const wood = tileAtCoords(map, 6, 2);
    wood.feature = 'WOODS';
    expect(validImprovementsIn(wood, opts('EGYPT'))).not.toContain('SPHINX');
    // "Cannot be built adjacent to another Sphinx"
    const near = tileAtCoords(map, 2, 4);
    const nb = neighbors(map, near)[0];
    nb.improvement = 'SPHINX';
    expect(validImprovementsIn(near, opts('EGYPT', { map }))).not.toContain('SPHINX');
    // the Sphinx waits on Craftsmanship; the Ziggurat on nothing
    const none = computeUnlocksIn({ techs: [], civics: [] } as never);
    expect(validImprovementsIn(flat, opts('EGYPT', { unlocks: none }))).not.toContain('SPHINX');
    expect(validImprovementsIn(flat, opts('SUMERIA', { unlocks: none }))).toContain('ZIGGURAT');
    const craft = computeUnlocksIn({ techs: [], civics: ['CRAFTSMANSHIP'] } as never);
    expect(validImprovementsIn(flat, opts('EGYPT', { unlocks: craft }))).toContain('SPHINX');
  });

  it('yield what their tables state, with the wonder, floodplains and river clauses', () => {
    const map = makeMap(8, 8, 'GRASSLAND');
    const ctx = bareCtx(map);
    const sx = tileAtCoords(map, 3, 3);
    sx.improvement = 'SPHINX';
    expect(tileYields(ctx, sx)).toMatchObject({ faith: 1, culture: 1 });
    sx.feature = 'FLOODPLAINS';
    expect(tileYields(ctx, sx).culture).toBe(2);
    const w = neighbors(map, sx)[0];
    w.builtWonder = 'PYRAMIDS';
    expect(improvementAdjacency(ctx, sx, 'SPHINX').faith).toBe(0); // in flight: not yet
    w.builtWonderComplete = true;
    expect(improvementAdjacency(ctx, sx, 'SPHINX').faith).toBe(2);
    const zg = tileAtCoords(map, 5, 5);
    zg.improvement = 'ZIGGURAT';
    expect(tileYields(ctx, zg)).toMatchObject({ science: 2, culture: 0 });
    zg.riverMask = 1;
    expect(tileYields(ctx, zg).culture).toBe(1);
    // "Additional Culture once Natural History is discovered"
    const nh = modifiersFromResearch({ techs: [], civics: ['NATURAL_HISTORY'] } as never);
    expect(nh.improvementYields.SPHINX?.culture).toBe(1);
    expect(nh.improvementYields.ZIGGURAT?.culture).toBe(1);
  });
});
