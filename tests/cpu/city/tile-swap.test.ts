/** THE TILE SWAP — "Claim this tile to be worked by this city, instead of your
 * other city. Ownership cannot be swapped if the tile has a district, a
 * wonder, or is next to the other city's center tile." (the install's
 * LOC_PLOTINFO_SWAP_TILE_OWNER_TOOLTIP), plus the Golf Course's and Open-Air
 * Museum's "Tiles with <row> cannot be swapped". The claimant's reach is its
 * work radius. `tests/gpu/tile_swap_test.py` pins the GPU twin on the same
 * scenes. */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { swapTileOk, workableTiles } from '../../../cpu/core/city';
import { seatPhase } from '../../../cpu/core/phase';
import { setTileOwner, tileCity, tileSeat } from '../../../cpu/core/seats';
import type { City, GameState } from '../../../cpu/core/types';

/** two cities of seat 0 four hexes apart on one row: A at (4,6), B at (8,6).
 *  Every plot within 3 of either is claimed, the nearer centre's (A on a tie). */
function scene(): { state: GameState; a: City; b: City } {
  const state = makeState(makeMap(16, 12, 'GRASSLAND'));
  const a = settleAt(state, tileAtCoords(state.map, 4, 6).index, 0);
  const b = settleAt(state, tileAtCoords(state.map, 8, 6).index, 0);
  for (const t of state.map.tiles) {
    if (t.index === a.centerIndex || t.index === b.centerIndex) continue;
    const da = Math.abs(t.col - 4) + Math.abs(t.row - 6);
    const db = Math.abs(t.col - 8) + Math.abs(t.row - 6);
    if (Math.min(da, db) > 4) continue;
    setTileOwner(t, 0, da <= db ? a.id : b.id);
  }
  return { state, a, b };
}

describe('the tile swap', () => {
  it('takes a sibling city\'s plot inside the claimant\'s work radius', () => {
    const { state, a, b } = scene();
    const t = tileAtCoords(state.map, 6, 5);
    setTileOwner(t, 0, b.id);
    expect(swapTileOk(state, a, t.index)).toBe(true);
    expect(workableTiles(state, a).some((w) => w.index === t.index)).toBe(false);
    state.seatActions = { [state.turn - 1]: { 0: {
      production: [], tech: null, civic: null, units: [], swapTiles: [[a.centerIndex, t.index]],
    } } };
    seatPhase(state);
    expect(tileSeat(t)).toBe(0);
    expect(tileCity(t)).toBe(a.id);
    expect(workableTiles(state, a).some((w) => w.index === t.index)).toBe(true);
    // the record re-validates: the plot is the claimant's own now
    expect(swapTileOk(state, a, t.index)).toBe(false);
  });

  it('keeps the plot\'s pin — a retag inside one seat is not a change of hands', () => {
    const { state, a, b } = scene();
    const t = tileAtCoords(state.map, 6, 5);
    setTileOwner(t, 0, b.id);
    t.locked = true;
    state.seatActions = { [state.turn - 1]: { 0: {
      production: [], tech: null, civic: null, units: [], swapTiles: [[a.centerIndex, t.index]],
    } } };
    seatPhase(state);
    expect(tileCity(t)).toBe(a.id);
    expect(t.locked).toBe(true);
  });

  it('refuses every plot the text names, and every plot out of reach', () => {
    const { state, a, b } = scene();
    const at = (c: number, r: number) => {
      const t = tileAtCoords(state.map, c, r);
      setTileOwner(t, 0, b.id);
      return t;
    };
    // next to the losing city's centre
    expect(swapTileOk(state, a, at(7, 6).index)).toBe(false);
    // the losing city's centre itself: a centre is a district
    expect(swapTileOk(state, a, b.centerIndex)).toBe(false);
    // out of the claimant's work radius
    expect(swapTileOk(state, a, at(10, 6).index)).toBe(false);
    // a district, under construction or complete
    const d = at(6, 5);
    d.district = 'CAMPUS';
    d.districtComplete = false;
    expect(swapTileOk(state, a, d.index)).toBe(false);
    d.districtComplete = true;
    expect(swapTileOk(state, a, d.index)).toBe(false);
    // a wonder site, raised or not
    const w = at(6, 7);
    w.builtWonder = 'PYRAMIDS';
    w.builtWonderComplete = false;
    expect(swapTileOk(state, a, w.index)).toBe(false);
    // a noSwap improvement, pillaged or not
    const g = at(6, 6);
    expect(swapTileOk(state, a, g.index)).toBe(true);
    g.improvement = 'GOLF_COURSE';
    expect(swapTileOk(state, a, g.index)).toBe(false);
    g.improvement = 'OPEN_AIR_MUSEUM';
    g.pillaged = true;
    expect(swapTileOk(state, a, g.index)).toBe(false);
    g.improvement = 'FARM';
    g.pillaged = false;
    expect(swapTileOk(state, a, g.index)).toBe(true);
    // another seat's plot
    setTileOwner(g, 1, 0);
    expect(swapTileOk(state, a, g.index)).toBe(false);
    // the claimant's own plot, and nobody's
    setTileOwner(g, 0, a.id);
    expect(swapTileOk(state, a, g.index)).toBe(false);
    setTileOwner(g, -1);
    expect(swapTileOk(state, a, g.index)).toBe(false);
  });

  it('the record refuses a refused plot and a claimant that is not the seat\'s city', () => {
    const { state, a, b } = scene();
    const near = tileAtCoords(state.map, 7, 6);
    setTileOwner(near, 0, b.id);
    const ok = tileAtCoords(state.map, 6, 5);
    setTileOwner(ok, 0, b.id);
    state.seatActions = { [state.turn - 1]: { 0: {
      production: [], tech: null, civic: null, units: [],
      swapTiles: [[a.centerIndex, near.index], [ok.index, ok.index]],
    } } };
    seatPhase(state);
    expect(tileCity(near)).toBe(b.id);
    expect(tileCity(ok)).toBe(b.id);
  });
});
