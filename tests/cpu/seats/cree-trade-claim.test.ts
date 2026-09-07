/**
 * THE CREE TRADER'S TILE CLAIM. CIV6
 * (TRAIT_CIVILIZATION_CREE_TRADE_GAIN_TILES,
 * EFFECT_ADJUST_PLAYER_TRADE_GAIN_TILES_EN_ROUTE GainTileRadius 3):
 * "Unclaimed tiles within 3 tiles of a Cree City come under Cree control when
 * a Trader first moves into them."
 *
 * The radius is measured from the CITY, not from the path or the route's
 * ends — on a long course those three readings differ enormously.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { NO_SEAT, seatOf, setTileOwner, tileSeat } from '../../../cpu/core/seats';
import { claimTileEnRoute } from '../../../cpu/core/trade';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { TRADE_GAIN_TILE_ROWS } from '../../../cpu/data/civilizations';
import type { GameState } from '../../../cpu/core/types';

const CREE_ROW = CIV_LEADERS.findIndex((l) => l.civ === 'CREE');
const RADIUS = TRADE_GAIN_TILE_ROWS.find((r) => r.civ === 'CREE')!.radius;

function scene(civRow: number): GameState {
  const state = makeState(makeMap(24, 24, 'GRASSLAND'));
  state.seats[0].civ = civRow;
  settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  return state;
}

describe("a Cree Trader claims the ground it walks", () => {
  it('names the install radius', () => {
    expect(RADIUS).toBe(3);
    expect(CREE_ROW).toBeGreaterThanOrEqual(0);
  });

  it('claims an UNCLAIMED tile within the radius of one of its own cities', () => {
    const state = scene(CREE_ROW);
    // 3 tiles from the centre at (6,6), and owned by nobody
    const t = tileAtCoords(state.map, 9, 6);
    setTileOwner(t, NO_SEAT);
    expect(tileSeat(t)).toBe(NO_SEAT);
    expect(claimTileEnRoute(state, 0, t.index)).toBe(true);
    expect(tileSeat(t)).toBe(0);
  });

  it('leaves ground BEYOND the radius alone, however far the course runs', () => {
    const state = scene(CREE_ROW);
    const far = tileAtCoords(state.map, 16, 16);
    setTileOwner(far, NO_SEAT);
    expect(claimTileEnRoute(state, 0, far.index)).toBe(false);
    expect(tileSeat(far)).toBe(NO_SEAT);
  });

  it('never takes a tile that is already OWNED', () => {
    const state = scene(CREE_ROW);
    state.seats.push({ ...seatOf(state, 0)!, seat: 1, cities: [] });
    const held = tileAtCoords(state.map, 8, 6);
    setTileOwner(held, 1);
    expect(claimTileEnRoute(state, 0, held.index)).toBe(false);
    expect(tileSeat(held)).toBe(1);
  });

  it('pays nobody but the Cree', () => {
    const other = CIV_LEADERS.findIndex((l) => l.civ !== 'CREE');
    const state = scene(other);
    const t = tileAtCoords(state.map, 9, 6);
    setTileOwner(t, NO_SEAT);
    expect(claimTileEnRoute(state, 0, t.index)).toBe(false);
    expect(tileSeat(t)).toBe(NO_SEAT);
  });
});
