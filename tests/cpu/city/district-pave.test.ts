/**
 * A DISTRICT PAVES ITS PLOT, for every seat. CIV6: a district stands on an
 * improved plot and removes the improvement (the install's Districts and
 * Improvements carry no clause refusing one); every feature but Floodplains
 * and a bonus resource go with it. The GPU twin is
 * tests/gpu/districts_new_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs } from '../helpers';
import { districtSiteLegal, placeSeatDistrict } from '../../../cpu/core/phase';
import { computeUnlocks } from '../../../cpu/core/effects';
import { seatOf } from '../../../cpu/core/seats';

describe('a district on an improved plot', () => {
  it('is legal, and its pave removes the improvement and the bonus resource', () => {
    const state = makeState(makeMap(16, 16));
    const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
    grantTechs(state, 'POTTERY', 'WRITING');
    const plot = tileAtCoords(state.map, 9, 8);
    plot.improvement = 'FARM';
    plot.resource = 'WHEAT';
    const unlocks = computeUnlocks(state, 0);
    expect(districtSiteLegal(state, city, 'CAMPUS', unlocks, plot.index)).toBe(true);
    expect(placeSeatDistrict(state, seatOf(state, 0)!, city, 'CAMPUS', unlocks, plot.index)).toBe(true);
    expect(plot.district).toBe('CAMPUS');
    expect(plot.improvement).toBeNull();
    expect(plot.resource).toBeNull();
  });
});
