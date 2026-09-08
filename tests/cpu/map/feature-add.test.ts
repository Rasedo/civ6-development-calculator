/**
 * A FEATURE ARRIVES AFTER t0 — `addFeature`, the eruption's carrier. Nothing in the
 * rollout calls it yet (WHERE a feature lands is an open owner question), so
 * this file is its whole TS reach. The GPU twin is
 * tests/gpu/feature_add_test.py.
 */
import { describe, expect, it } from 'vitest';
import { makeMap, makeState, tileAtCoords, bareCtx } from '../helpers';
import { addFeature } from '../../../cpu/core/game';
import { bareGround, validImprovementsIn } from '../../../cpu/core/rules';
import { tileYields } from '../../../cpu/core/yields';

describe('addFeature', () => {
  it('refuses water, a live feature, an improvement and a natural-wonder row', () => {
    const state = makeState(makeMap(16, 16));
    const water = tileAtCoords(state.map, 5, 5);
    water.terrain = 'COAST';
    expect(addFeature(state, water.index, 'WOODS')).toBe(false);

    const featured = tileAtCoords(state.map, 6, 5);
    featured.feature = 'MARSH';
    expect(addFeature(state, featured.index, 'WOODS')).toBe(false);

    const improved = tileAtCoords(state.map, 7, 5);
    improved.improvement = 'FARM';
    expect(addFeature(state, improved.index, 'WOODS')).toBe(false);

    const bare = tileAtCoords(state.map, 8, 5);
    expect(addFeature(state, bare.index, 'ULURU')).toBe(false); // a wonder never arrives
    expect(bare.feature).toBeNull();
  });

  it('plants on bare land, and the arrival pays its catalog yields live', () => {
    const state = makeState(makeMap(16, 16));
    const t = tileAtCoords(state.map, 9, 5);
    const before = tileYields(bareCtx(state.map), t);
    expect(addFeature(state, t.index, 'WOODS')).toBe(true);
    expect(t.feature).toBe('WOODS');
    const after = tileYields(bareCtx(state.map), t);
    expect(after.production).toBe(before.production + 1);
    // a second plant on the SAME tile refuses — the feature is live now
    expect(addFeature(state, t.index, 'WOODS')).toBe(false);
  });

  it('leaves the ground jobs standing under the SOIL, and takes them under Woods', () => {
    // CIV6 (Improvement_ValidFeatures): FEATURE_VOLCANIC_SOIL is listed valid
    // for the Farm, the Mine and the Fort, so the soil is bare ground; Woods
    // occupy the tile and take those jobs with them.
    const state = makeState(makeMap(16, 16));
    const hill = tileAtCoords(state.map, 11, 5);
    hill.terrain = 'GRASSLAND';
    hill.elevation = 'HILLS';
    const opts = { unlocks: null, ownsTile: () => true };
    const jobs = () => validImprovementsIn(state.map.tiles[hill.index], opts);
    expect(jobs()).toContain('MINE');
    expect(jobs()).toContain('FARM');

    expect(addFeature(state, hill.index, 'VOLCANIC_SOIL')).toBe(true);
    expect(bareGround(state.map.tiles[hill.index])).toBe(true);
    expect(jobs()).toContain('MINE');
    expect(jobs()).toContain('FARM');

    const woods = tileAtCoords(state.map, 12, 5);
    woods.terrain = 'GRASSLAND';
    woods.elevation = 'HILLS';
    expect(addFeature(state, woods.index, 'WOODS')).toBe(true);
    const wj = validImprovementsIn(state.map.tiles[woods.index], opts);
    expect(wj).not.toContain('MINE');
    expect(wj).not.toContain('FARM');
    expect(bareGround(state.map.tiles[woods.index])).toBe(false);
  });

  it('Fire Goddess pays its Volcanic Soil half the turn the soil exists', () => {
    const state = makeState(makeMap(16, 16));
    const t = tileAtCoords(state.map, 10, 5);
    const ctx = bareCtx(state.map);
    ctx.mods.featureYields.VOLCANIC_SOIL = { faith: 2 };
    expect(tileYields(ctx, t).faith).toBe(0);
    expect(addFeature(state, t.index, 'VOLCANIC_SOIL')).toBe(true);
    expect(tileYields(ctx, t).faith).toBe(2);
  });
});
