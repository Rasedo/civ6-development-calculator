import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, expandBorders, grantTechs, bareCtx } from '../helpers';
import { seatOf, setTileOwner } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { IMPROVEMENT_IDS, unitActionIndex } from '../../../cpu/core/unitActions';
import { validImprovementsIn } from '../../../cpu/core/rules';
import { computeUnlocksIn } from '../../../cpu/core/effects';
import { districtAdjacency, cityDistrictSum, tileYields } from '../../../cpu/core/yields';
import { FEATURES } from '../../../world/features';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import { PANTHEONS } from '../../../cpu/data/religion';
import { disasterPhase } from '../../../cpu/core/disasters';
import { generateMap } from '../../../world/mapgen';
import type { GameState, Tile } from '../../../cpu/core/types';

// THE MAP'S TWO NEW ROWS. CIV6 (Geothermal Fissure): "+1 Science", a Campus
// adjacency, "+1 Amenity" to an adjacent Aqueduct, and the ground a
// GEOTHERMAL PLANT ("+1 Science", "+2 Production", "Provides 4 Power per
// turn") must stand on. (Volcanic Soil): "This land adjacent to a volcano has
// suffered from a previous eruption ... Can receive additional yields from
// environmental effects." (Fire Goddess): "+2 Faith from Geothermal Fissures
// and Volcanic Soil."

const A = unitActionIndex(IMPROVEMENT_IDS);

function world() {
  const state = makeState(makeMap(20, 16));
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  expandBorders(state, city, 3);
  return { state, city };
}

/** Issue one action for `u` through the real order path. */
function order(state: GameState, u: { id: number }, action: number) {
  const seat = seatOf(state, 0)!;
  const mine = state.units.filter((x) => x.seat === 0);
  applySeatUnitOrders(state, seat, [mine.map((x) => (x.id === u.id ? action : -1))]);
}

describe('the Geothermal Fissure', () => {
  it('yields +1 Science and no builder can clear it', () => {
    expect(FEATURES.GEOTHERMAL_FISSURE.yields).toEqual({ science: 1 });
    expect(FEATURES.GEOTHERMAL_FISSURE.removable).toBe(false);
    const { state } = world();
    const t = tileAtCoords(state.map, 6, 8);
    const before = tileYields(bareCtx(state.map), t).science;
    t.feature = 'GEOTHERMAL_FISSURE';
    expect(tileYields(bareCtx(state.map), t).science).toBe(before + 1);
  });

  it('pays a Campus +2, exactly as a Reef does', () => {
    const { state } = world();
    const site = tileAtCoords(state.map, 6, 8);
    const bare = districtAdjacency(state.map, site, 'CAMPUS');
    tileAtCoords(state.map, 6, 9).feature = 'GEOTHERMAL_FISSURE';
    expect(districtAdjacency(state.map, site, 'CAMPUS')).toBe(bare + 2);
    tileAtCoords(state.map, 5, 8).feature = 'GEOTHERMAL_FISSURE';
    expect(districtAdjacency(state.map, site, 'CAMPUS')).toBe(bare + 4);
  });

  it('pays an adjacent Aqueduct one Amenity', () => {
    const { state, city } = world();
    const aq = tileAtCoords(state.map, 7, 8);
    aq.district = 'AQUEDUCT';
    aq.districtComplete = true;
    city.districts.push({ type: 'AQUEDUCT', tileIndex: aq.index });
    const bare = cityDistrictSum(state, city, 'amenities');
    tileAtCoords(state.map, 6, 8).feature = 'GEOTHERMAL_FISSURE';
    expect(cityDistrictSum(state, city, 'amenities')).toBe(bare + 1);
    // ...and a PILLAGED Aqueduct pays nothing
    aq.districtPillaged = true;
    expect(cityDistrictSum(state, city, 'amenities')).toBe(0);
  });

  it('is the only ground a Geothermal Plant may stand on', () => {
    const { state } = world();
    const t = tileAtCoords(state.map, 6, 8);
    const un = computeUnlocksIn(seatOf(state, 0)!.research);
    const list = (tile: Tile) => validImprovementsIn(tile, {
      unlocks: computeUnlocksIn(seatOf(state, 0)!.research),
      builder: 'BUILDER',
      map: state.map,
      ownsTile: () => true,
    });
    expect(un.improvements.has('GEOTHERMAL_PLANT')).toBe(false);
    grantTechs(state, 'SYNTHETIC_MATERIALS');
    expect(list(t)).not.toContain('GEOTHERMAL_PLANT');   // bare ground
    t.feature = 'GEOTHERMAL_FISSURE';
    expect(list(t)).toContain('GEOTHERMAL_PLANT');
    expect(IMPROVEMENTS.GEOTHERMAL_PLANT.power).toBe(4);
    expect(IMPROVEMENTS.GEOTHERMAL_PLANT.yields).toEqual({ science: 1, production: 2 });
  });

  it('the generator places some, next to mountains', () => {
    const map = generateMap({ width: 44, height: 26, seed: 42 });
    const fissures = map.tiles.filter((t) => t.feature === 'GEOTHERMAL_FISSURE');
    expect(fissures.length).toBeGreaterThan(0);
    for (const f of fissures) {
      expect(f.resource).toBeNull();
      expect(f.elevation).not.toBe('MOUNTAIN');
    }
  });
});

describe('Volcanic Soil', () => {
  // The row carries the NAME a belief pays on. NOTHING places it: neither
  // engine can add a feature after t0, and putting it on the map at
  // generation would refuse a Farm, Mine or Seaside Resort on every
  // volcano-adjacent tile, which no source supports.
  it('is a catalog row with no yields of its own', () => {
    expect(FEATURES.VOLCANIC_SOIL.yields).toEqual({});
    expect(FEATURES.VOLCANIC_SOIL.removable).toBe(false);
  });

  it('...and the eruption lays down the fertility its page describes', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    const volcano = tileAtCoords(state.map, 8, 8);
    volcano.elevation = 'MOUNTAIN';
    volcano.volcano = true;
    const slope = tileAtCoords(state.map, 9, 8);
    setTileOwner(slope, 0);

    let guard = 0;
    while (slope.fertility === 0 && guard++ < 600) disasterPhase(state);
    expect(slope.fertility).toBeGreaterThanOrEqual(1);
    expect(slope.feature).toBeNull(); // nothing paints the feature
  });
});

describe('the Fire Goddess', () => {
  it('pays +2 Faith on a Fissure and on Volcanic Soil, and on nothing else', () => {
    expect(PANTHEONS.FIRE_GODDESS.effects.featureYields).toEqual({
      GEOTHERMAL_FISSURE: { faith: 2 },
      VOLCANIC_SOIL: { faith: 2 },
    });
    const { state } = world();
    const ctx = bareCtx(state.map);
    ctx.mods.featureYields = PANTHEONS.FIRE_GODDESS.effects.featureYields!;
    const t = tileAtCoords(state.map, 6, 8);
    t.feature = 'GEOTHERMAL_FISSURE';
    expect(tileYields(ctx, t).faith).toBe(2);
    t.feature = 'VOLCANIC_SOIL';
    expect(tileYields(ctx, t).faith).toBe(2);
    t.feature = 'WOODS';
    expect(tileYields(ctx, t).faith).toBe(0);
  });
});

describe('the three Holy Site adjacency pantheons', () => {
  const cases = [
    ['DANCE_OF_THE_AURORA', 'TUNDRA'],
    ['DESERT_FOLKLORE', 'DESERT'],
    ['SACRED_PATH', 'RAINFOREST'],
  ] as const;

  it('each hands the Holy Site one source its own row does not name', () => {
    const { state } = world();
    const site = tileAtCoords(state.map, 6, 8);
    for (const [belief, source] of cases) {
      const rules = PANTHEONS[belief].effects.districtAdjacency!;
      expect(rules.district).toBe('HOLY_SITE');
      expect(rules.rules).toEqual([{ source, amount: 1 }]);
      // paint two neighbours with the source and read the adjacency back
      const around = [tileAtCoords(state.map, 6, 9), tileAtCoords(state.map, 5, 8)];
      for (const n of around) {
        n.feature = null;
        n.terrain = source === 'RAINFOREST' ? 'PLAINS' : source;
        if (source === 'RAINFOREST') n.feature = 'RAINFOREST';
      }
      const bare = districtAdjacency(state.map, site, 'HOLY_SITE');
      expect(districtAdjacency(state.map, site, 'HOLY_SITE', rules.rules)).toBe(bare + 2);
      for (const n of around) {
        n.feature = null;
        n.terrain = 'GRASSLAND';
      }
    }
  });
});

describe('Fishing Boats', () => {
  function sea() {
    const { state, city } = world();
    state.unitsMode = true;
    grantTechs(state, 'SAILING');
    const water = tileAtCoords(state.map, 9, 8);
    water.terrain = 'COAST';
    water.feature = null;
    water.resource = 'FISH';
    setTileOwner(water, 0, city.id);
    return { state, city, water };
  }

  /** A builder AT SEA: `spawnUnit` refuses a water plot to a land unit, so
   *  the unit is landed first and then walked onto the plot it improves. */
  function afloat(state: GameState, at: Tile) {
    const u = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 8, 8).index, 0)!;
    u.tileIndex = at.index;
    u.embarked = true;
    return u;
  }

  it('the roster carries a BUILD verb for it', () => {
    expect(IMPROVEMENT_IDS).toContain('FISHING_BOATS');
    expect(A.BUILD_FISHING_BOATS).toBeGreaterThan(0);
  });

  it('an EMBARKED builder standing on the resource builds it', () => {
    const { state, water } = sea();
    const u = afloat(state, water);
    order(state, u, A.BUILD_FISHING_BOATS);
    expect(water.improvement).toBe('FISHING_BOATS');
  });

  it('...and nobody builds it without Sailing', () => {
    const { state, water } = sea();
    seatOf(state, 0)!.research.techs = [];
    const u = afloat(state, water);
    order(state, u, A.BUILD_FISHING_BOATS);
    expect(water.improvement).toBeNull();
  });

  it('...nor on a bare water tile with no resource', () => {
    const { state, city } = sea();
    const bare = tileAtCoords(state.map, 9, 9);
    bare.terrain = 'COAST';
    bare.feature = null;
    bare.resource = null;
    setTileOwner(bare, 0, city.id);
    const u = afloat(state, bare);
    order(state, u, A.BUILD_FISHING_BOATS);
    expect(bare.improvement).toBeNull();
  });
});
