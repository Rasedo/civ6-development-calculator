import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { moveCostInto, terrainMp, riverCharge, spawnUnit, stepUnit, RIVER_CROSS_MP } from '../../../cpu/core/units';
import { neighborTile } from '../../../world/hex';
import { MP_SCALE, EMBARK_TRANSITION_MP } from '../../../cpu/data/constants';
import type { Tile } from '../../../cpu/core/types';

/**
 * A RIVER IS AN EDGE BETWEEN TWO LAND TILES, so a unit stepping off the water
 * crosses none. `stepUnit` says it by construction — `riverCharge` rides the
 * NON-transition arm alone, and `moveCostInto` is terrain and road only — but
 * nothing pinned it, and the GPU twin had folded the river charge into the
 * one cost it used for BOTH arms. A disembark onto a river tile therefore
 * cost 4 MP there and 1 MP here, which stranded a unit on the water for a
 * turn and, at seed 9235 t191, cost a whole theological combat (A-1r).
 *
 * The GPU twin is tests/gpu/golden_move_test.py's disembark lane.
 */
describe('a disembark pays no river charge', () => {
  function setup() {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    const land = tileAtCoords(state.map, 5, 5);
    let dir = -1;
    let sea: Tile | null = null;
    for (let d = 0; d < 6; d++) {
      const n = neighborTile(state.map, land, d);
      if (n) { dir = d; sea = n; break; }
    }
    sea!.terrain = 'OCEAN';
    // a river on the edge the unit steps ACROSS
    land.riverMask = 1 << dir;
    return { state, land, sea: sea!, dir };
  }

  it('charges the river only between two LAND tiles', () => {
    const { state, land, sea } = setup();
    // the land tile's own river edge faces the water, so a step off the water
    // must read zero — this is the premise the whole lane rests on
    expect(riverCharge(state, sea, land)).toBe(0);
    expect(RIVER_CROSS_MP).toBeGreaterThan(0);
  });

  it('costs terrain alone, never terrain plus the crossing', () => {
    const { state, land, sea } = setup();
    // `moveCostInto` is the transition arm's whole base: terrain and road, no
    // river term anywhere in it
    expect(moveCostInto(state, sea, land)).toBe(terrainMp(land));
    expect(moveCostInto(state, sea, land)).toBe(MP_SCALE);
  });

  it('lets an embarked unit step ashore on its last MP', () => {
    const { state, land, sea } = setup();
    // spawned ashore, then put ON the water: a land chassis has no spawn
    // path onto a sea tile, and the scene needs it standing there
    const u = spawnUnit(state, 'SLINGER', land.index, 0);
    expect(u).toBeTruthy();
    u!.tileIndex = sea.index;
    u!.embarked = true;
    // exactly the disembark's cost and not a point more: were the river
    // charged too, this would fall short and the unit would sit on the water
    const cost = terrainMp(land) + EMBARK_TRANSITION_MP;
    u!.movesLeft = cost;
    u!.movesFull = cost;
    expect(stepUnit(state, u!, land)).not.toBe('cantAfford');
    expect(u!.tileIndex).toBe(land.index);
    expect(u!.embarked).toBe(false);
  });
});
