import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { spawnUnit } from '../../../cpu/core/units';
import { neighborTile } from '../../../world/hex';

/**
 * A DIRECTION keeps its slot at the map's edge. The replay surface decodes
 * MOVE_d / ATTACK_d / FORM_UP_d / CONDEMN_d / SPREAD_d against the six hex
 * directions; the compacted neighbour list drops an off-map slot and would
 * shift every later direction by one — the GPU's `neigh` plane keeps the
 * -1, so the two engines walked apart along an ocean's east edge.
 */
describe('a direction at the map edge', () => {
  it('moves along its own slot, never the compacted list', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    state.unitsMode = true;
    const edge = tileAtCoords(state.map, 11, 4); // the east edge, an even row
    expect(neighborTile(state.map, edge, 0)).toBeNull(); // the off-map slot
    const u = spawnUnit(state, 'WARRIOR', edge.index, 0)!;
    applySeatUnitOrders(state, state.seats[0], [[3]]); // MOVE_3
    expect(u.tileIndex).toBe(neighborTile(state.map, edge, 3)!.index);
  });
});
