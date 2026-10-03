import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantCivics, settleAt, expandBorders } from '../helpers';
import { NO_SEAT, seatOf, setTileOwner } from '../../../cpu/core/seats';
import { neighbors } from '../../../world/hex';
import { adjacentPlotTarget } from '../../../cpu/core/rules';
import { spawnUnit } from '../../../cpu/core/units';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { maskCtx, unitMask } from '../../../cpu/core/unitMask';
import { computeCityStats, seatTourism, workableTiles } from '../../../cpu/core/city';
import { tileAppeal } from '../../../cpu/core/appeal';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import { CIVICS } from '../../../cpu/data/civics';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { IMPROVEMENT_IDS, buildColumnOf, unitActionIndex } from '../../../cpu/core/unitActions';
import type { City, GameState, Unit } from '../../../cpu/core/types';

/**
 * SKI RESORT (Expansion2_Improvements.xml, IMPROVEMENT_SKI_RESORT): "Provides
 * +4 Tourism. Provides an Amenity. Can only be built on a Mountain. Cannot be
 * built adjacent to another Ski Resort. Cannot be pillaged, worked or
 * removed." PrereqCivic CIVIC_PROFESSIONAL_SPORTS, UNIT_BUILDER,
 * BuildOnAdjacentPlot, SameAdjacentValid false, Workable false,
 * SKI_RESORT_AMENITY (MODIFIER_CITY_OWNER_ADJUST_IMPROVEMENT_AMENITY 1),
 * Improvement_Tourism TOURISMSOURCE_APPEAL.
 *
 * The GPU twin is tests/gpu/ski_resort_test.py.
 */
const COL = buildColumnOf(IMPROVEMENT_IDS.indexOf('SKI_RESORT'));

/** a city at (4,4) holding a ridge down col 6, rows 2-6, and a Builder of
 *  seat 0 beside it at (5,4). */
function scene(civic = true): { state: GameState; city: City; b: Unit } {
  const state = makeState(makeMap(16, 16));
  state.unitsMode = true;
  for (let r = 2; r <= 6; r++) tileAtCoords(state.map, 6, r).elevation = 'MOUNTAIN';
  const city = settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
  expandBorders(state, city, 3);
  if (civic) grantCivics(state, 'PROFESSIONAL_SPORTS');
  const b = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 5, 4).index, 0)!;
  return { state, city, b };
}

const order = (state: GameState, u: Unit, col: number) => applySeatUnitOrders(
  state, seatOf(state, 0) as never, [state.units.filter((x) => x.seat === 0).map((x) => (x === u ? col : -1))]);

describe('the Ski Resort', () => {
  it('reads the install', () => {
    const d = IMPROVEMENTS.SKI_RESORT;
    expect(d.adjacentPlot).toBe(true);
    expect(d.noAdjacentSame).toBe(true);
    expect(d.unworkable).toBe(true);
    expect(d.noPillage).toBe(true);
    expect(d.disasterResistant).toBe(true);
    expect(d.amenity).toBe(1);
    expect(d.tourismFromAppeal).toBe(true);
    expect(d.outsideTerritory).toBeUndefined();
    expect(d.portal).toBeUndefined();
    expect(d.elevations).toEqual(['MOUNTAIN']);
    expect(CIVICS.PROFESSIONAL_SPORTS.effects).toContainEqual({ kind: 'unlockImprovement', improvement: 'SKI_RESORT' });
    // appended after the Offshore Wind Farm, so no earlier build column moved
    expect(IMPROVEMENT_IDS.indexOf('SKI_RESORT')).toBe(39);
    expect(unitActionIndex(IMPROVEMENT_IDS).BUILD_SKI_RESORT).toBe(COL);
  });

  it('is laid from beside an owned mountain, after Professional Sports', () => {
    const none = scene(false);
    expect(unitMask(maskCtx(none.state, 0), none.b)).not.toContain(COL);
    const { state, b } = scene();
    const ctx = maskCtx(state, 0);
    expect(unitMask(ctx, b)).toContain(COL);
    const tgt = adjacentPlotTarget(state.map, state.map.tiles[b.tileIndex], IMPROVEMENTS.SKI_RESORT, ctx.owns);
    const charges = b.charges ?? 0;
    order(state, b, COL);
    expect(state.map.tiles[tgt].improvement).toBe('SKI_RESORT');
    expect(state.map.tiles[b.tileIndex].improvement).toBeNull();
    expect(b.charges).toBe(charges - 1);
  });

  it('refuses an unowned mountain and one beside another Ski Resort', () => {
    const { state, b } = scene();
    const here = state.map.tiles[b.tileIndex];
    const ctx = maskCtx(state, 0);
    // (6,3), (6,4) and (6,5) ring the Builder at (5,4); a resort at (6,2)
    // shuts its neighbour (6,3) out, and a resort at (6,6) shuts out (6,5)
    tileAtCoords(state.map, 6, 2).improvement = 'SKI_RESORT';
    tileAtCoords(state.map, 6, 6).improvement = 'SKI_RESORT';
    const tgt = adjacentPlotTarget(state.map, here, IMPROVEMENTS.SKI_RESORT, ctx.owns);
    expect(tgt).toBe(tileAtCoords(state.map, 6, 4).index);
    tileAtCoords(state.map, 6, 4).improvement = 'SKI_RESORT';
    expect(adjacentPlotTarget(state.map, here, IMPROVEMENTS.SKI_RESORT, ctx.owns)).toBe(-1);
    // a mountain outside the borders is nobody's to improve
    const far = scene();
    const fctx = maskCtx(far.state, 0);
    for (const n of neighbors(far.state.map, far.state.map.tiles[far.b.tileIndex])) {
      if (n.elevation === 'MOUNTAIN') setTileOwner(n, NO_SEAT);
    }
    expect(adjacentPlotTarget(far.state.map, far.state.map.tiles[far.b.tileIndex], IMPROVEMENTS.SKI_RESORT, fctx.owns)).toBe(-1);
  });

  it('pays its city an Amenity and Tourism equal to its Appeal, and is never worked', () => {
    const { state, city } = scene();
    const mt = tileAtCoords(state.map, 6, 4);
    const amen0 = computeCityStats(state, city).amenities.have;
    const tour0 = seatTourism(state, 0);
    mt.improvement = 'SKI_RESORT';
    expect(computeCityStats(state, city).amenities.have - amen0).toBe(1);
    expect(seatTourism(state, 0) - tour0).toBe(Math.max(0, tileAppeal(state.map, mt)));
    expect(workableTiles(state, city).some((t) => t.index === mt.index)).toBe(false);
  });

  it("stays unworked where Mit'a opens every other mountain", () => {
    const { state, city } = scene();
    state.seats[0].civ = CIV_LEADERS.findIndex((l) => l.leader === 'PACHACUTI');
    const mt = tileAtCoords(state.map, 6, 4);
    const open = () => workableTiles(state, city).some((t) => t.index === mt.index);
    expect(open()).toBe(true);
    mt.improvement = 'SKI_RESORT';
    expect(open()).toBe(false);
  });
});
