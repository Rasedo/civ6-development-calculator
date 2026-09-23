/**
 * THE NEUTRAL OBSERVATION'S `units` GROUP, TS side: one row per living unit
 * of the seat with the unit action columns it may take (cpu/core/unitMask.ts,
 * the GPU's `_seat_unit_mask` twin). Each test pins one column group on a
 * small scene, including where the candidate mask is deliberately looser
 * than the verb that re-validates it.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, expandBorders, tileAtCoords, grantTechs } from './helpers';
import { unitRows } from '../../cpu/core/unitMask';
import { spawnUnit } from '../../cpu/core/units';
import { emptySeat, setWar } from '../../cpu/core/seats';
import { neighborTile } from '../../world/hex';
import { IMPROVEMENT_IDS, unitActionIndex } from '../../cpu/core/unitActions';
import { UNIT_TYPE_IDX } from '../../cpu/data/units';
import type { City, GameState, Unit } from '../../cpu/core/types';

const SCHEMA = JSON.parse(readFileSync('shared/decide.schema.json', 'utf-8')) as {
  unit: [string, string, string][];
};
const A = unitActionIndex(IMPROVEMENT_IDS);

function scene(): { state: GameState; a: City; b: City } {
  const state = makeState(makeMap(24, 20));
  state.seats.push(emptySeat(1));
  state.unitsMode = true;
  state.sandbox = true;
  const a = settleAt(state, tileAtCoords(state.map, 5, 10).index, 0);
  const b = settleAt(state, tileAtCoords(state.map, 16, 10).index, 1);
  state.sandbox = false;
  expandBorders(state, a, 2);
  return { state, a, b };
}

function unit(state: GameState, type: string, tile: number, seat = 0): Unit {
  const u = spawnUnit(state, type, tile, seat);
  if (!u) throw new Error(`no ${type}`);
  u.movesLeft = 8;
  return u;
}

function maskOf(state: GameState, u: Unit): number[] {
  const rows = unitRows(state, u.seat);
  const k = state.units.filter((x) => x.seat === u.seat).indexOf(u);
  return rows[k].mask;
}

describe('the units group', () => {
  it('one row per unit of the seat in array order, fields in schema order', () => {
    const { state, a } = scene();
    const w = unit(state, 'WARRIOR', a.centerIndex + 2);
    unit(state, 'WARRIOR', a.centerIndex + 30, 1);
    const b = unit(state, 'BUILDER', a.centerIndex + 3);
    const rows = unitRows(state, 0);
    expect(rows.map((r) => r.tile)).toEqual([w.tileIndex, b.tileIndex]);
    expect(Object.keys(rows[0])).toEqual(SCHEMA.unit.map((f) => f[0]));
    expect(rows[0].type).toBe(UNIT_TYPE_IDX.indexOf('WARRIOR'));
    expect(rows[1].charges).toBe(b.charges);
    expect(rows[0]).toMatchObject({ gpAt: -1, gpSite: -1, gpArg: -1 });
    for (const r of rows) expect(r.mask).toEqual([...r.mask].sort((x, y) => x - y));
  });

  it('moves: every open neighbour, none without movement, none onto an own same-class unit', () => {
    const { state, a } = scene();
    const w = unit(state, 'WARRIOR', a.centerIndex + 2);
    expect(maskOf(state, w).filter((c) => c < 6)).toEqual([0, 1, 2, 3, 4, 5]);
    const e = neighborTile(state.map, state.map.tiles[w.tileIndex], 0)!;
    unit(state, 'WARRIOR', e.index);
    expect(maskOf(state, w)).not.toContain(0);
    w.movesLeft = 0;
    expect(maskOf(state, w).filter((c) => c < 6)).toEqual([]);
    expect(maskOf(state, w)).toContain(A.HOLD);
  });

  it('attack: a hostile unit beside it at war, none at peace', () => {
    const { state, a } = scene();
    const w = unit(state, 'WARRIOR', a.centerIndex + 2);
    const e = neighborTile(state.map, state.map.tiles[w.tileIndex], 0)!;
    unit(state, 'WARRIOR', e.index, 1);
    expect(maskOf(state, w)).not.toContain(A.ATTACK_0);
    setWar(state, 0, 1, true);
    expect(maskOf(state, w)).toContain(A.ATTACK_0);
    w.attacksLeft = 0;
    expect(maskOf(state, w)).not.toContain(A.ATTACK_0);
  });

  it('builds: a charged Builder on bare own grassland may farm; not in a centre, not spent', () => {
    const { state, a } = scene();
    const t = a.centerIndex + 1;
    const b = unit(state, 'BUILDER', t);
    expect(maskOf(state, b)).toContain(A.BUILD_FARM);
    state.map.tiles[t].improvement = 'FARM';
    expect(maskOf(state, b)).not.toContain(A.BUILD_FARM);
    expect(maskOf(state, b)).toContain(A.REMOVE_IMPROVEMENT);
    state.map.tiles[t].pillaged = true;
    b.charges = 0;
    // REPAIR asks no charge
    expect(maskOf(state, b)).toContain(A.REPAIR);
    const c = unit(state, 'BUILDER', a.centerIndex);
    expect(maskOf(state, c)).not.toContain(A.BUILD_FARM);
  });

  it('chop asks no ownership: woods outside the borders, the removal tech in', () => {
    const { state } = scene();
    const t = tileAtCoords(state.map, 10, 3);
    t.feature = 'WOODS';
    const b = unit(state, 'BUILDER', t.index);
    expect(maskOf(state, b)).not.toContain(A.CHOP);
    grantTechs(state, 'MINING');
    expect(maskOf(state, b)).toContain(A.CHOP);
    t.feature = null;
    expect(maskOf(state, b)).not.toContain(A.CHOP);
  });

  it('pillage: a fighter on an improvement of a seat it is at war with', () => {
    const { state, b } = scene();
    expandBorders(state, b, 1);
    const t = state.map.tiles[b.centerIndex + 1];
    t.improvement = 'FARM';
    const w = unit(state, 'WARRIOR', t.index);
    expect(maskOf(state, w)).not.toContain(A.PILLAGE);
    setWar(state, 0, 1, true);
    expect(maskOf(state, w)).toContain(A.PILLAGE);
    t.pillaged = true;
    expect(maskOf(state, w)).not.toContain(A.PILLAGE);
  });

  it('spread: all seven columns for a charged Missionary once the seat has a religion', () => {
    const { state, a } = scene();
    const m = unit(state, 'MISSIONARY', a.centerIndex + 2);
    expect(maskOf(state, m)).not.toContain(A.SPREAD_HERE);
    state.seats[0].religion.founded = true;
    const got = maskOf(state, m).filter((c) => c >= A.SPREAD_HERE && c < A.SPREAD_HERE + 7);
    expect(got).toEqual([0, 1, 2, 3, 4, 5, 6].map((k) => A.SPREAD_HERE + k));
  });

  it('found city: any Settler, wherever it stands', () => {
    const { state, a } = scene();
    const s = unit(state, 'SETTLER', a.centerIndex + 1);
    expect(maskOf(state, s)).toContain(A.FOUND_CITY);
  });

  it('promote: a unit that banked its level may take its open rows', () => {
    const { state, a } = scene();
    const w = unit(state, 'WARRIOR', a.centerIndex + 2);
    expect(maskOf(state, w).some((c) => c >= A.PROMOTE_0 && c < A.PROMOTE_0 + 8)).toBe(false);
    w.xp = 1000;
    expect(maskOf(state, w)).toContain(A.PROMOTE_0);
  });

  it('escort: a civilian on an own military unit\'s tile joins; joined, it breaks and does not step', () => {
    const { state, a } = scene();
    const t = a.centerIndex + 2;
    unit(state, 'WARRIOR', t);
    const b = unit(state, 'BUILDER', t);
    expect(maskOf(state, b)).toContain(A.ESCORT);
    expect(maskOf(state, b)).not.toContain(A.BREAK_ESCORT);
    b.escorted = true;
    const m = maskOf(state, b);
    expect(m).toContain(A.BREAK_ESCORT);
    expect(m).not.toContain(A.ESCORT);
    expect(m.filter((c) => c < 6)).toEqual([]);
  });
});
