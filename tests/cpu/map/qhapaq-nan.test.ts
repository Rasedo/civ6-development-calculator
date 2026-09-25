import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantCivics } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { deriveMountainRanges } from '../../../world/query';
import { adjacentPlotRowOk, adjacentPlotTarget, portalAt, portalExit } from '../../../cpu/core/rules';
import { spawnUnit } from '../../../cpu/core/units';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { maskCtx, unitMask } from '../../../cpu/core/unitMask';
import { computeUnlocks } from '../../../cpu/core/effects';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import { CIVICS } from '../../../cpu/data/civics';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { IMPROVEMENT_IDS, buildColumnOf, unitActionIndex } from '../../../cpu/core/unitActions';
import type { GameState, Unit } from '../../../cpu/core/types';

/**
 * QHAPAQ ÑAN (Expansion2_Improvements_Major.xml, IMPROVEMENT_MOUNTAIN_ROAD):
 * "Unlocks the Builder ability to construct a Qhapaq Ñan, unique to
 * Pachacuti. Acts as a movement portal on a mountain range, allowing units to
 * move into it and exit from another portal at the cost of 2 Movement. ... Can
 * only be built on an adjacent Mountain tile. Cannot be pillaged or removed."
 * TraitType TRAIT_LEADER_PACHACUTI_IMPROVEMENT_MOUNTAIN_ROAD, PrereqCivic
 * CIVIC_FOREIGN_TRADE, UNIT_BUILDER, the Tunnel's own MOUNTAIN_PORTAL.
 *
 * The GPU twin is tests/gpu/qhapaq_nan_test.py.
 */
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);
const COL = buildColumnOf(IMPROVEMENT_IDS.indexOf('MOUNTAIN_ROAD'));

/** a ridge down col 8, rows 2-7, and a Builder of seat 0 beside it at (7,4). */
function scene(leader: string, civic = true): { state: GameState; b: Unit } {
  const state = makeState(makeMap(16, 16));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  state.seats[0].civ = leaderRow(leader);
  for (let r = 2; r <= 7; r++) tileAtCoords(state.map, 8, r).elevation = 'MOUNTAIN';
  deriveMountainRanges(state.map);
  if (civic) grantCivics(state, 'FOREIGN_TRADE');
  const b = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 7, 4).index, 0)!;
  return { state, b };
}

describe('Qhapaq Ñan', () => {
  it('reads the install', () => {
    const d = IMPROVEMENTS.MOUNTAIN_ROAD;
    expect(d.uniqueLeader).toBe('PACHACUTI');
    expect(d.uniqueTo).toBeUndefined();
    expect(d.portal).toBe(true);
    expect(d.adjacentPlot).toBe(true);
    expect(d.noPillage).toBe(true);
    expect(d.disasterResistant).toBe(true);
    expect(d.outsideTerritory).toBe(true);
    expect(d.elevations).toEqual(['MOUNTAIN']);
    expect(d.engineer).toBeUndefined();          // the Builder's row
    expect(Object.values(d.yields)).toEqual([]);  // no yield row
    expect(CIVICS.FOREIGN_TRADE.effects).toContainEqual({ kind: 'unlockImprovement', improvement: 'MOUNTAIN_ROAD' });
    // appended after the governor rows, so no earlier build column moved
    expect(IMPROVEMENT_IDS.indexOf('MOUNTAIN_ROAD')).toBe(37);
    expect(unitActionIndex(IMPROVEMENT_IDS).BUILD_MOUNTAIN_ROAD).toBe(COL);
  });

  it("is Pachacuti's Builder's, after Foreign Trade", () => {
    const d = IMPROVEMENTS.MOUNTAIN_ROAD;
    const ok = (leader: string, unit: string, civic = true) => {
      const { state } = scene(leader, civic);
      return adjacentPlotRowOk(d, unit, computeUnlocks(state, 0), leader as never);
    };
    expect(ok('PACHACUTI', 'BUILDER')).toBe(true);
    expect(ok('PACHACUTI', 'MILITARY_ENGINEER')).toBe(false);
    expect(ok('T_ROOSEVELT', 'BUILDER')).toBe(false);
    expect(ok('PACHACUTI', 'BUILDER', false)).toBe(false);
  });

  it('is offered beside a bare mountain, and laid on the lowest-index one', () => {
    const { state, b } = scene('PACHACUTI');
    const ctx = maskCtx(state, 0);
    expect(unitMask(ctx, b)).toContain(COL);
    const tgt = adjacentPlotTarget(state.map, state.map.tiles[b.tileIndex], IMPROVEMENTS.MOUNTAIN_ROAD, ctx.owns);
    expect(tgt).toBeGreaterThanOrEqual(0);
    const charges = b.charges ?? 0;
    const actor = seatOf(state, 0)!;
    applySeatUnitOrders(state, actor as never, [state.units.filter((u) => u.seat === 0).map((u) => (u === b ? COL : -1))]);
    expect(state.map.tiles[tgt].improvement).toBe('MOUNTAIN_ROAD');
    expect(state.map.tiles[b.tileIndex].improvement).toBeNull();
    expect(b.charges).toBe(charges - 1);
    expect(b.movesLeft).toBe(0);
  });

  it('is offered to nobody else', () => {
    const { state, b } = scene('T_ROOSEVELT');
    expect(unitMask(maskCtx(state, 0), b)).not.toContain(COL);
    const noCivic = scene('PACHACUTI', false);
    expect(unitMask(maskCtx(noCivic.state, 0), noCivic.b)).not.toContain(COL);
  });

  it('is a portal on the same network as the Tunnel', () => {
    const { state } = scene('PACHACUTI');
    const a = tileAtCoords(state.map, 8, 3);
    const c = tileAtCoords(state.map, 8, 6);
    a.improvement = 'MOUNTAIN_ROAD';
    expect(portalAt(a)).toBe(true);
    expect(portalExit(state.map, a)).toBe(-1);  // alone on its range
    c.improvement = 'MOUNTAIN_TUNNEL';
    expect(portalExit(state.map, a)).toBe(c.index);
    expect(portalExit(state.map, c)).toBe(a.index);
  });

  it('lets a unit onto its mountain and through it', () => {
    const { state } = scene('PACHACUTI');
    const a = tileAtCoords(state.map, 8, 3);
    const c = tileAtCoords(state.map, 8, 6);
    a.improvement = 'MOUNTAIN_ROAD';
    c.improvement = 'MOUNTAIN_ROAD';
    const w = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 3).index, 0)!;
    w.tileIndex = a.index;
    w.movesLeft = w.movesFull ?? w.movesLeft;
    const A_PORTAL = unitActionIndex(IMPROVEMENT_IDS).PORTAL;
    expect(unitMask(maskCtx(state, 0), w)).toContain(A_PORTAL);
    applySeatUnitOrders(state, seatOf(state, 0) as never, [state.units.filter((u) => u.seat === 0).map((u) => (u === w ? A_PORTAL : -1))]);
    expect(w.tileIndex).toBe(c.index);
  });
});
