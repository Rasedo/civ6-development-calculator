/**
 * A FEATURE ARRIVES AFTER t0 — `addFeature`, C-41's carrier. Nothing in the
 * rollout calls it yet (WHERE a feature lands is an open owner question), so
 * this file is its whole TS reach. The GPU twin is
 * tests/gpu/feature_add_test.py.
 */
import { describe, expect, it } from 'vitest';
import { makeMap, makeState, tileAtCoords, bareCtx } from '../helpers';
import { addFeature } from '../../../cpu/core/game';
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
