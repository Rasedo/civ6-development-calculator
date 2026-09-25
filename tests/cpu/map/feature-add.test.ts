/**
 * VOLCANIC SOIL — an eruption paints its ring. CIV6 (`RandomEvent_Yields`,
 * FEATURE_VOLCANIC_SOIL YIELD_FOOD, `ReplaceFeature="true"`): each eligible
 * land plot of the ring becomes Volcanic Soil with the severity's chance
 * (`ERUPTION_PAINT_P`), replacing Woods or Rainforest; Floodplains, a Geothermal
 * Fissure, water and Mountains are never painted (the lab 4 volcano scene).
 * The GPU twin is tests/gpu/feature_add_test.py.
 */
import { describe, expect, it } from 'vitest';
import { makeMap, makeState, tileAtCoords, bareCtx } from '../helpers';
import { disasterPhase, erupt, paintVolcanicSoil, soilPaintable } from '../../../cpu/core/disasters';
import { ERUPTION_PAINT_P, RANDOM_EVENT_START_TURN, volcanoRow, ERUPTION_ROWS } from '../../../cpu/data/disasters';
/** the volcano's three rows' paint chances, GENTLE / CATASTROPHIC / MEGACOLOSSAL */
const VOLCANO_PAINT_P = [0, 1, 2].map((sev) => ERUPTION_PAINT_P[volcanoRow(sev)]);
import { bareGround, validImprovementsIn } from '../../../cpu/core/rules';
import { tileYields } from '../../../cpu/core/yields';
import { neighbors } from '../../../world/hex';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import type { GameState, Tile } from '../../../cpu/core/types';
import type { FeatureId, ImprovementId } from '../../../world/types';

describe('Volcanic Soil', () => {
  it('paints bare land and Woods or Rainforest, and nothing else', () => {
    const state = makeState(makeMap(16, 16));
    const at = (c: number, r: number) => tileAtCoords(state.map, c, r);
    expect(soilPaintable(at(2, 2))).toBe(true);
    const improved = at(3, 2);
    improved.improvement = 'FARM';
    expect(soilPaintable(improved)).toBe(true);
    for (const f of ['WOODS', 'RAINFOREST'] as const) {
      const t = at(4, 2);
      t.feature = f;
      expect(soilPaintable(t)).toBe(true);
    }
    for (const f of ['FLOODPLAINS', 'GEOTHERMAL_FISSURE', 'MARSH', 'OASIS', 'VOLCANIC_SOIL', 'ULURU'] as const) {
      const t = at(5, 2);
      t.feature = f;
      expect(soilPaintable(t)).toBe(false);
    }
    const water = at(6, 2);
    water.terrain = 'COAST';
    expect(soilPaintable(water)).toBe(false);
    const peak = at(7, 2);
    peak.elevation = 'MOUNTAIN';
    expect(soilPaintable(peak)).toBe(false);
    const drowned = at(8, 2);
    drowned.submerged = true;
    expect(soilPaintable(drowned)).toBe(false);
    const campus = at(9, 2);
    campus.district = 'CAMPUS';
    expect(soilPaintable(campus)).toBe(false);
    const centre = at(10, 2);
    centre.district = 'CITY_CENTER';
    expect(soilPaintable(centre)).toBe(false);
    const wonder = at(11, 2);
    wonder.builtWonder = 'PYRAMIDS';
    expect(soilPaintable(wonder)).toBe(false);
  });

  it('replaces the Woods and its Lumber Mill, keeps any other improvement', () => {
    const state = makeState(makeMap(16, 16));
    const woods = tileAtCoords(state.map, 9, 5);
    woods.feature = 'WOODS';
    woods.improvement = 'LUMBER_MILL';
    const plain = tileYields(bareCtx(state.map), tileAtCoords(state.map, 9, 6));
    expect(tileYields(bareCtx(state.map), woods).production).toBeGreaterThan(plain.production);
    paintVolcanicSoil(woods);
    expect(woods.feature).toBe('VOLCANIC_SOIL');
    expect(woods.improvement).toBeNull();
    // the soil yields nothing of its own: the plot pays what bare ground pays
    expect(tileYields(bareCtx(state.map), woods)).toEqual(plain);
    const farm = tileAtCoords(state.map, 10, 5);
    farm.improvement = 'FARM';
    paintVolcanicSoil(farm);
    expect(farm.feature).toBe('VOLCANIC_SOIL');
    expect(farm.improvement).toBe('FARM');
  });

  it('a catalog row stands on a feature only where Improvement_ValidFeatures lists it', () => {
    // CIV6 (Improvement_ValidFeatures): the Fort, the Airstrip, the Missile
    // Silo, the Colossal Head and the Terrace Farm list Volcanic Soil alone;
    // the rows below them list nothing, so any feature plot refuses them.
    const state = makeState(makeMap(16, 16));
    const t = tileAtCoords(state.map, 8, 8);
    const offered = (id: ImprovementId, feature: FeatureId | null): boolean => {
      const def = IMPROVEMENTS[id];
      t.terrain = def.terrains?.[0] ?? 'GRASSLAND';
      t.elevation = def.elevations?.[0] ?? 'FLAT';
      t.feature = feature;
      return validImprovementsIn(t, {
        unlocks: null, ownsTile: () => true, map: state.map,
        builder: def.engineer ? 'MILITARY_ENGINEER' : def.builtBy,
        civ: def.uniqueTo ?? null,
        suzerain: new Set(def.suzerainOf ? [def.suzerainOf] : []),
        govPromos: new Set(def.governorPromo ? [def.governorPromo] : []),
      }).includes(id);
    };
    const soil: ImprovementId[] = ['FORT', 'AIRSTRIP', 'MISSILE_SILO', 'COLOSSAL_HEADS', 'TERRACE_FARM'];
    const none: ImprovementId[] = ['SOLAR_FARM', 'WIND_FARM', 'CITY_PARK', 'KURGAN', 'MISSION', 'STEPWELL',
      'GOLF_COURSE', 'ICE_HOCKEY_RINK', 'OPEN_AIR_MUSEUM', 'MONASTERY', 'BATEY', 'MAORI_PA'];
    for (const id of [...soil, ...none]) {
      expect(offered(id, null), `${id} on bare ground`).toBe(true);
      expect(offered(id, 'WOODS'), `${id} on Woods`).toBe(false);
      expect(offered(id, 'VOLCANIC_SOIL'), `${id} on Volcanic Soil`).toBe(soil.includes(id));
    }
    // the two whose other clauses this bare scene cannot meet list nothing
    expect(IMPROVEMENTS.MEKEWAP.features).toBeUndefined();
    expect(IMPROVEMENTS.CHEMAMULL.features).toBeUndefined();
  });

  it('is bare ground: the Farm and the Mine stay buildable under it', () => {
    // CIV6 (Improvement_ValidFeatures): FEATURE_VOLCANIC_SOIL is listed valid
    // for the Farm and the Mine.
    const state = makeState(makeMap(16, 16));
    const hill = tileAtCoords(state.map, 11, 5);
    hill.terrain = 'GRASSLAND';
    hill.elevation = 'HILLS';
    hill.feature = 'WOODS';
    const opts = { unlocks: null, ownsTile: () => true };
    const jobs = () => validImprovementsIn(state.map.tiles[hill.index], opts);
    expect(jobs()).not.toContain('MINE');
    paintVolcanicSoil(hill);
    expect(bareGround(hill)).toBe(true);
    expect(jobs()).toContain('MINE');
    expect(jobs()).toContain('FARM');
  });

  it('Fire Goddess pays its Volcanic Soil half the turn the soil exists', () => {
    const state = makeState(makeMap(16, 16));
    const t = tileAtCoords(state.map, 10, 5);
    const ctx = bareCtx(state.map);
    ctx.mods.featureYields.VOLCANIC_SOIL = { faith: 2 };
    expect(tileYields(ctx, t).faith).toBe(0);
    paintVolcanicSoil(t);
    expect(tileYields(ctx, t).faith).toBe(2);
  });

  it('an eruption paints each eligible ring plot at the severity\'s chance', () => {
    // sixteen volcanoes four apart, their rings disjoint; every ring is reset
    // before each round and every volcano erupts at the severity under test
    const state: GameState = makeState(makeMap(16, 16));
    const volcanoes: Tile[] = [];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const v = tileAtCoords(state.map, 2 + 4 * i, 2 + 4 * j);
        v.elevation = 'MOUNTAIN';
        v.volcano = true;
        volcanoes.push(v);
      }
    }
    const rings = volcanoes.map((v) => neighbors(state.map, v));
    // half the rings stand in Woods under a Lumber Mill; one plot of every
    // ring is Floodplains, never painted
    const reset = () => rings.forEach((ring, k) => ring.forEach((t, d) => {
      t.feature = d === 0 ? 'FLOODPLAINS' : k % 2 ? 'WOODS' : null;
      t.improvement = k % 2 && d > 0 ? 'LUMBER_MILL' : null;
      t.pillaged = false;
      t.fertility = 0;
    }));
    for (let sev = 0; sev < VOLCANO_PAINT_P.length; sev++) {
      let plots = 0;
      let painted = 0;
      let woodsPlots = 0;
      let woodsPainted = 0;
      for (let round = 0; round < 40; round++) {
        reset();
        volcanoes.forEach((v) => erupt(state, [v], volcanoRow(sev)));
        rings.forEach((ring, k) => {
          expect(ring[0].feature).toBe('FLOODPLAINS');
          for (const t of ring.slice(1)) {
            plots += 1;
            if (k % 2) woodsPlots += 1;
            if (t.feature !== 'VOLCANIC_SOIL') continue;
            painted += 1;
            if (k % 2) {
              woodsPainted += 1;
              expect(t.improvement).toBeNull();
            }
          }
        });
      }
      const p = VOLCANO_PAINT_P[sev];
      expect(Math.abs(painted / plots - p)).toBeLessThan(0.05);
      expect(Math.abs(woodsPainted / woodsPlots - p)).toBeLessThan(0.07);
    }
  });

  it('the turn\'s draw picks the eruption\'s severity by the rows\' weights', () => {
    // a sea with one volcano ringed by desert: an eruption or a dust storm is
    // all the turn's draw can name. Over the phases that erupted, the
    // severity is GENTLE / CATASTROPHIC / MEGACOLOSSAL in proportion to
    // 4 / 2.5 / 1.5 — read off how often a bare ring plot is painted, the
    // weighted mean of the three paint chances.
    const state: GameState = makeState(makeMap(16, 16, 'COAST'));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const v = tileAtCoords(state.map, 8, 8);
    v.terrain = 'DESERT';
    v.elevation = 'MOUNTAIN';
    v.volcano = true;
    const ring = neighbors(state.map, v);
    let plots = 0;
    let painted = 0;
    let eruptions = 0;
    for (let i = 0; i < 3000; i++) {
      for (const t of ring) { t.terrain = 'DESERT'; t.elevation = 'FLAT'; t.feature = null; t.meteor = false; }
      state.eventLog = [];
      disasterPhase(state);
      if (!state.eventLog.some((e) => e.includes('eruption'))) continue;
      eruptions += 1;
      plots += ring.length;
      painted += ring.filter((t) => t.feature === 'VOLCANIC_SOIL').length;
    }
    // the volcano's 8 against the dust storms' 8 + 2 and the meteor's 6 (the
    // bare desert ring is nobody's)
    expect(Math.abs(eruptions / 3000 - 8 / 24)).toBeLessThan(0.03);
    const w = [4, 2.5, 1.5];
    const mean = w.reduce((a, x, s) => a + x * VOLCANO_PAINT_P[s], 0) / 8;
    expect(Math.abs(painted / plots - mean)).toBeLessThan(0.03);
  });

  it('the eight eruption rows are the install\'s paint chances, in the live table\'s order', () => {
    // Eyjafjallajokull CATASTROPHIC / MEGACOLOSSAL, Kilimanjaro GENTLE /
    // CATASTROPHIC, Vesuvius MEGACOLOSSAL, then the volcano's three
    expect([...ERUPTION_ROWS]).toEqual(['EYJAFJALLAJOKULL_CATASTROPHIC', 'EYJAFJALLAJOKULL_MEGACOLOSSAL',
      'KILIMANJARO_GENTLE', 'KILIMANJARO_CATASTROPHIC', 'VESUVIUS_MEGACOLOSSAL',
      'VOLCANO_GENTLE', 'VOLCANO_CATASTROPHIC', 'VOLCANO_MEGACOLOSSAL']);
    expect([...ERUPTION_PAINT_P]).toEqual([0.5, 0.75, 0.5, 0.5, 0.25, 0.35, 0.5, 0.75]);
    expect([0, 1, 2].map(volcanoRow)).toEqual([5, 6, 7]);
  });
});
