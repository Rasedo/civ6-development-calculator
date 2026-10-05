import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, grantTechs } from '../helpers';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { baseAdjacency } from '../../../cpu/core/yields';
import { neighbors } from '../../../world/hex';
import type { GameState, Tile } from '../../../cpu/core/types';

/**
 * THE DISTRICT ADJACENCY ROWS AS THE GAME COUNTS THEM (GameCore 0x365ae0, one
 * Adjacency_YieldChanges row): OtherDistrictAdjacent counts a neighbour of
 * the district's own owner holding a complete, unpillaged district;
 * AdjacentImprovement an unpillaged improvement; a resource row the resource
 * as the owner sees it; AdjacentTerrain the terrain alone. The Industrial
 * Zone's Lumber Mill and strategic-resource rows; Machu Picchu's
 * MODIFIER_PLAYER_CITIES_TERRAIN_ADJACENCY. The GPU twin is
 * tests/gpu/adjacency_rows_test.py.
 */
function site(): { state: GameState; t: Tile; ns: Tile[] } {
  const state = makeState(makeMap(14, 14, 'GRASSLAND'));
  settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
  const t = tileAtCoords(state.map, 9, 9);
  const ns = neighbors(state.map, t);
  for (const x of [t, ...ns]) x.ownerSeat = 0;
  return { state, t, ns };
}

const iz = (state: GameState, t: Tile): number => baseAdjacency(makeYieldCtx(state, 0), t, 'INDUSTRIAL_ZONE');
const campus = (state: GameState, t: Tile): number => baseAdjacency(makeYieldCtx(state, 0), t, 'CAMPUS');

describe('the district adjacency rows', () => {
  it('OtherDistrictAdjacent counts the owner\'s live districts alone', () => {
    const { state, t, ns } = site();
    // two live districts beside a Campus: 1 per two
    for (const n of ns.slice(0, 2)) { n.district = 'COMMERCIAL_HUB'; n.districtComplete = true; }
    expect(campus(state, t)).toBe(1);
    ns[0].ownerSeat = 1;
    expect(campus(state, t)).toBe(0);
    ns[0].ownerSeat = 0;
    ns[0].districtPillaged = true;
    expect(campus(state, t)).toBe(0);
  });

  it('a pillaged Mine pays nothing; two Lumber Mills pay 1; a strategic resource 1 once seen', () => {
    const { state, t, ns } = site();
    ns[0].improvement = 'MINE';
    ns[1].improvement = 'MINE';
    expect(iz(state, t)).toBe(1);
    ns[1].pillaged = true;
    expect(iz(state, t)).toBe(0);
    ns[0].improvement = null;
    ns[1].improvement = null;
    ns[1].pillaged = false;
    ns[2].improvement = 'LUMBER_MILL';
    ns[3].improvement = 'LUMBER_MILL';
    expect(iz(state, t)).toBe(1);
    ns[4].resource = 'IRON';
    expect(iz(state, t)).toBe(1);
    grantTechs(state, 'BRONZE_WORKING');
    expect(iz(state, t)).toBe(2);
  });

  it('Machu Picchu pays its owner\'s Industrial Zone 1 per adjacent Mountain, a natural wonder\'s among them', () => {
    const { state, t, ns } = site();
    for (const n of ns.slice(0, 3)) n.elevation = 'MOUNTAIN';
    ns[2].feature = 'MOUNT_KILIMANJARO';
    expect(iz(state, t)).toBe(0);
    ns[0].builtWonder = 'MACHU_PICCHU';
    ns[0].builtWonderComplete = true;
    state.seats[0].cities[0].wonders.push({ id: 'MACHU_PICCHU', tileIndex: ns[0].index });
    expect(iz(state, t)).toBe(3);
    expect(baseAdjacency(makeYieldCtx(state, 1), t, 'INDUSTRIAL_ZONE')).toBe(0);
  });
});
