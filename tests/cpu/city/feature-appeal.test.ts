import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat } from '../../../cpu/core/seats';
import { neighbors } from '../../../world/hex';
import { cityAppealResolver } from '../../../cpu/core/governors';
import { tileAppeal } from '../../../cpu/core/appeal';
import { getModifiers } from '../../../cpu/core/effects';
import { FEATURE_APPEAL_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (Amazon, TRAIT_AMAZON_RAINFOREST_EXTRA_APPEAL): "Rainforest tiles
 * provide +1 Appeal to adjacent tiles, instead of the usual -1." The install
 * writes it as EFFECT_ADJUST_FEATURE_APPEAL_MODIFIER on FEATURE_JUNGLE with
 * Amount 2 — exactly the swing from -1 to +1 (C-50).
 *
 * The term rides `cityAppealResolver`, which is already keyed by the tile's
 * OWNER and already threaded through every appeal consumer, so no per-seat
 * appeal plane is needed.
 *
 * The GPU twin is tests/gpu/feature_appeal_test.py.
 */
const civRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);

/** a city, and a tile of its own with `n` rainforest neighbours */
function scene(row: number, n: number): { state: GameState; probe: number } {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  const centre = tileAtCoords(state.map, 6, 6).index;
  settleAt(state, centre, 0);
  const probe = tileAtCoords(state.map, 7, 6).index;
  const t = state.map.tiles[probe];
  // paint `n` of the probe's neighbours RAINFOREST
  const nb = neighbors(state.map, t);
  for (let i = 0; i < n && i < nb.length; i++) nb[i].feature = 'RAINFOREST';
  return { state, probe };
}

describe('a seat`s own reading of an adjacent feature', () => {
  it('reads the install: one row, Brazil, RAINFOREST, +2', () => {
    expect(FEATURE_APPEAL_ROWS.length).toBe(1);
    expect(FEATURE_APPEAL_ROWS[0].civ).toBe('BRAZIL');
    expect(FEATURE_APPEAL_ROWS[0].feature).toBe('RAINFOREST');
    // the swing from the usual -1 to +1 is exactly 2
    expect(FEATURE_APPEAL_ROWS[0].amount).toBe(2);
  });

  it('turns each adjacent rainforest from -1 into +1 for Brazil', () => {
    const plain = scene(civRow('AMERICA'), 2);
    const pt = plain.state.map.tiles[plain.probe];
    const bare = tileAppeal(plain.state.map, pt, undefined, cityAppealResolver(plain.state));

    const br = scene(civRow('BRAZIL'), 2);
    const bt = br.state.map.tiles[br.probe];
    const amazon = tileAppeal(br.state.map, bt, undefined, cityAppealResolver(br.state));

    // two rainforests: -2 for anyone else, +2 for Brazil — a swing of 4
    expect(amazon - bare).toBe(4);
  });

  it('scales with the COUNT of adjacent rainforest, and pays nothing at zero', () => {
    const zero = scene(civRow('BRAZIL'), 0);
    const one = scene(civRow('BRAZIL'), 1);
    const gpaZ = cityAppealResolver(zero.state);
    const gpaO = cityAppealResolver(one.state);
    const az = tileAppeal(zero.state.map, zero.state.map.tiles[zero.probe], undefined, gpaZ);
    const ao = tileAppeal(one.state.map, one.state.map.tiles[one.probe], undefined, gpaO);
    // one rainforest: -1 becomes +1, a swing of 2 against the same scene
    const plainOne = scene(civRow('AMERICA'), 1);
    const bo = tileAppeal(plainOne.state.map, plainOne.state.map.tiles[plainOne.probe],
      undefined, cityAppealResolver(plainOne.state));
    expect(ao - bo).toBe(2);
    // ...and with no rainforest at all Brazil reads exactly like anyone else
    const plainZero = scene(civRow('AMERICA'), 0);
    const bz = tileAppeal(plainZero.state.map, plainZero.state.map.tiles[plainZero.probe],
      undefined, cityAppealResolver(plainZero.state));
    expect(az).toBe(bz);
  });

  it('never pays an UNOWNED tile, and never a seat the roster does not name', () => {
    const br = scene(civRow('BRAZIL'), 2);
    expect(getModifiers(br.state, 0).featureAppeal.length).toBe(1);
    // a tile far from the city belongs to nobody
    const far = br.state.map.tiles[tileAtCoords(br.state.map, 14, 14).index];
    expect(far.ownerCity).toBeLessThan(0);
    expect(cityAppealResolver(br.state)!(far)).toBe(0);
    // ...and a plain seat carries no row at all
    const plain = scene(-1, 2);
    expect(getModifiers(plain.state, 0).featureAppeal.length).toBe(0);
  });
});
