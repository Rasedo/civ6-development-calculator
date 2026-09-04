import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { spawnUnit, unitFullMoves } from '../../../cpu/core/units';
import { UNITS } from '../../../cpu/data/units';
import { MP_SCALE, SEA_MOVE_TECH, SEA_MOVE_TECH_BONUS } from '../../../cpu/data/constants';
import type { GameState } from '../../../cpu/core/types';

/**
 * A unit is BORN with the pool `unitFullMoves` gives it (A-2r).
 *
 * `spawnUnit` used to re-add the chassis moves, the raider bonus, the golden
 * bonus and the start tile by hand, and so dropped the three terms
 * `unitFullMoves` also carries — the Mathematics rung every HULL reads,
 * Enhanced Mobility, and the emergency march. A naval unit was therefore born
 * one whole Movement short and only came right at the next `refreshUnits`,
 * which does call the real composer. Its FIRST turn was the divergence: the
 * GPU spawned a Galley with four Movement and TS with three, so a four-step
 * walk parted the engines and TS stopped one tile short.
 */
function scene(): GameState {
  const state = makeState(makeMap(20, 20, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  // a hull needs somewhere to float: a patch of COAST far from the city and
  // from every LAND spawn below, so neither kind is squeezed out
  for (let c = 14; c <= 18; c++) {
    for (let r = 14; r <= 18; r++) tileAtCoords(state.map, c, r).terrain = 'COAST';
  }
  return state;
}

describe('a unit is born with the pool its own composer gives it', () => {
  it('gives a HULL the Mathematics rung on the turn it is born', () => {
    const state = scene();
    const seat = seatOf(state, 0)!;
    expect(UNITS.GALLEY.naval).toBe(true);
    // without the tech: the bare chassis
    const before = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 15, 15).index, 0);
    expect(before).not.toBeNull();
    expect(before!.movesLeft).toBe(MP_SCALE * UNITS.GALLEY.moves);

    // ...and with it, the rung lands AT BIRTH, not one turn later
    seat.research.techs.push(SEA_MOVE_TECH);
    const after = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 17, 17).index, 0);
    expect(after).not.toBeNull();
    expect(after!.movesLeft).toBe(MP_SCALE * (UNITS.GALLEY.moves + SEA_MOVE_TECH_BONUS));
  });

  it('is exactly what unitFullMoves answers, for every chassis it spawns', () => {
    const state = scene();
    seatOf(state, 0)!.research.techs.push(SEA_MOVE_TECH);
    // each on ground it can actually stand on, or a null spawn would let the
    // lane pass while proving nothing
    for (const [type, cc, rr] of [['GALLEY', 16, 16], ['WARRIOR', 3, 3],
                                  ['BUILDER', 4, 3], ['SCOUT', 3, 4]] as const) {
      const u = spawnUnit(state, type, tileAtCoords(state.map, cc, rr).index, 0);
      expect(u).not.toBeNull();
      expect(u!.movesLeft).toBe(unitFullMoves(state, u!));
      // and the stored pool matches, or the "spent no MP" gate reads wrong
      expect(u!.movesFull).toBe(u!.movesLeft);
    }
  });

  it('leaves a LAND unit untouched by the naval rung', () => {
    const state = scene();
    seatOf(state, 0)!.research.techs.push(SEA_MOVE_TECH);
    const w = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 3).index, 0);
    expect(w!.movesLeft).toBe(MP_SCALE * UNITS.WARRIOR.moves);
  });
});
