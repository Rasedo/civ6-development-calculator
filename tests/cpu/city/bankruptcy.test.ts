import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeState, settleAt, tileAtCoords } from '../helpers';
import { endTurn } from '../../../cpu/core/game';
import { spawnUnit } from '../../../cpu/core/units';

// An insolvent treasury (after unit upkeep) disbands ONE unit per turn —
// the priciest seat-0 unit, tie -> lowest id (oldest spawn). Inert at the gate
// (play stays gold-positive), so these focused cases pin the semantics.
// The upkeep arm runs in the per-actor seat loop, which skips a cityless
// seat, so every scene founds a capital; a deep-red treasury swamps its income.
describe('bankruptcy', () => {
  it('disbands one unit per turn: the priciest, tie -> lowest id', () => {
    const state = makeState();
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    const h1 = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 5, 5).index, 0); // maint 2
    spawnUnit(state, 'SPEARMAN', tileAtCoords(state.map, 8, 5).index, 0); // maint 1
    const h2 = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 11, 5).index, 0); // maint 2
    seatOf(state, 0)!.treasury = -50; // deeper than one turn of city income
    endTurn(state);

    const seat0Units = state.units.filter((u) => (u.seat) === 0);
    expect(seat0Units.length).toBe(2); // exactly one disbanded, not the whole army
    expect(state.units.some((u) => u.id === h1!.id)).toBe(false); // priciest + oldest id -> gone
    expect(state.units.some((u) => u.id === h2!.id)).toBe(true); // the tie went to the lower id
  });

  it('disbands nothing while solvent', () => {
    const state = makeState();
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 5, 5).index, 0);
    seatOf(state, 0)!.treasury = 100; // 100 - 2 upkeep >= 0
    endTurn(state);
    expect(state.units.filter((u) => (u.seat) === 0).length).toBe(1);
  });

  it('never disbands a free (0-upkeep) unit even when insolvent', () => {
    const state = makeState();
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0); // maint 0
    seatOf(state, 0)!.treasury = -50; // deep in the red, but nothing costs upkeep
    endTurn(state);
    expect(state.units.filter((u) => (u.seat) === 0).length).toBe(1); // WARRIOR kept
  });
});
