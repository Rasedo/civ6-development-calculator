import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { spawnUnit, unitFullMoves } from '../../../cpu/core/units';
import { rosterCS } from '../../../cpu/core/combat';
import { MP_SCALE } from '../../../cpu/data/constants';
import { upgradeGoldCost } from '../../../cpu/core/stockpile';
import { getModifiers } from '../../../cpu/core/effects';
import { LEVY_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (The Raven King, EFFECT_ADJUST_PLAYER_LEVIED_UNIT_UPGRADE_DISCOUNT_
 * PERCENT): a LEVIED unit upgrades at 75% off. The row has shipped since
 * batch 11 and NOTHING READ IT — the gap was the mark, not the magnitude
 * (C-66).
 *
 * The GPU twin is tests/gpu/levied_upgrade_test.py.
 */
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function scene(leader: string): GameState {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = leaderRow(leader);
  settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  // the upgrade needs the target chassis unlocked
  seatOf(state, 0)!.research.techs.push('BRONZE_WORKING', 'IRON_WORKING');
  return state;
}

describe('a levied unit upgrades cheaply', () => {
  it('reads the install: 75%, and it is Matthias Corvinus', () => {
    expect(LEVY_ROWS.length).toBe(1);
    expect(LEVY_ROWS[0].leader).toBe('MATTHIAS_CORVINUS');
    expect(LEVY_ROWS[0].upgradeDiscountPct).toBe(75);
  });

  it('charges a plain unit the full price and a levied one a quarter', () => {
    const s = scene('MATTHIAS_CORVINUS');
    expect(getModifiers(s, 0).levy.length).toBe(1);
    const full = upgradeGoldCost(s, 0, 'WARRIOR', false);
    const cut = upgradeGoldCost(s, 0, 'WARRIOR', true);
    expect(full).toBeGreaterThan(0);              // or this lane proves nothing
    expect(cut).toBe(Math.round(full * 0.25));
    expect(cut).toBeLessThan(full);
  });

  it('gives a seat without the row no discount at all', () => {
    const s = scene('VICTORIA');
    expect(getModifiers(s, 0).levy.length).toBe(0);
    const full = upgradeGoldCost(s, 0, 'WARRIOR', false);
    expect(upgradeGoldCost(s, 0, 'WARRIOR', true)).toBe(full);
  });

  it('reads the install for the ABILITY too: +2 Movement, +5 Combat', () => {
    expect(LEVY_ROWS[0].levyMoves).toBe(2);
    expect(LEVY_ROWS[0].levyCombat).toBe(5);
  });

  it('gives a levied unit the ability`s Movement AT BIRTH, not a turn later', () => {
    const s2 = scene('MATTHIAS_CORVINUS');
    const plain = spawnUnit(s2, 'WARRIOR', tileAtCoords(s2.map, 8, 8).index, 0);
    const base = unitFullMoves(s2, plain!);
    // the mark alone is the whole condition
    const lev = spawnUnit(s2, 'WARRIOR', tileAtCoords(s2.map, 10, 10).index, 0);
    lev!.levied = true;
    expect(unitFullMoves(s2, lev!)).toBe(base + MP_SCALE * LEVY_ROWS[0].levyMoves);
  });

  it('gives a levied unit +5 Combat, flat and clause-free', () => {
    const s2 = scene('MATTHIAS_CORVINUS');
    const u = spawnUnit(s2, 'WARRIOR', tileAtCoords(s2.map, 8, 8).index, 0)!;
    const before = rosterCS(s2, u, 1, null, false);
    u.levied = true;
    expect(rosterCS(s2, u, 1, null, false)).toBe(before + LEVY_ROWS[0].levyCombat);
  });

  it('gives a seat without the row neither bonus', () => {
    const s2 = scene('VICTORIA');
    const u = spawnUnit(s2, 'WARRIOR', tileAtCoords(s2.map, 8, 8).index, 0)!;
    const mv = unitFullMoves(s2, u);
    const cs = rosterCS(s2, u, 1, null, false);
    u.levied = true;
    expect(unitFullMoves(s2, u)).toBe(mv);
    expect(rosterCS(s2, u, 1, null, false)).toBe(cs);
  });

  it('marks a levied unit, and a spawned one not', () => {
    const s = scene('MATTHIAS_CORVINUS');
    const u = spawnUnit(s, 'WARRIOR', tileAtCoords(s.map, 8, 8).index, 0);
    expect(u).not.toBeNull();
    expect(!!u!.levied).toBe(false);              // an ordinary unit carries no mark
    u!.levied = true;
    expect(u!.levied).toBe(true);
  });
});
