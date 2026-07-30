import { describe, it, expect } from 'vitest';
import { playerSeat, isPlayerSeat, PLAYER_CIV } from '../src/core/seats';
import { makeState, tileAtCoords } from './helpers';
import { endTurn } from '../src/core/game';
import { spawnUnit } from '../src/core/units';

// GV-5: an insolvent treasury (after unit upkeep) disbands ONE unit per turn —
// the priciest player unit, tie -> lowest id (oldest spawn). Inert at the gate
// (play stays gold-positive), so these focused cases pin the semantics.
describe('GV-5 bankruptcy', () => {
  it('disbands one unit per turn: the priciest, tie -> lowest id', () => {
    const state = makeState();
    state.unitsMode = true;
    const h1 = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 5, 5).index, PLAYER_CIV); // maint 2
    spawnUnit(state, 'SPEARMAN', tileAtCoords(state.map, 8, 5).index, PLAYER_CIV); // maint 1
    const h2 = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 11, 5).index, PLAYER_CIV); // maint 2
    // upkeep = 2 + 1 + 2 = 5; treasury 1 -> -4 after settle -> bankruptcy.
    playerSeat(state).treasury = 1;
    endTurn(state);

    const players = state.units.filter((u) => isPlayerSeat(u.seat));
    expect(players.length).toBe(2); // exactly one disbanded, not the whole army
    expect(state.units.some((u) => u.id === h1!.id)).toBe(false); // priciest + oldest id -> gone
    expect(state.units.some((u) => u.id === h2!.id)).toBe(true); // the tie went to the lower id
  });

  it('disbands nothing while solvent', () => {
    const state = makeState();
    state.unitsMode = true;
    spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 5, 5).index, PLAYER_CIV);
    playerSeat(state).treasury = 100; // 100 - 2 upkeep = 98 >= 0
    endTurn(state);
    expect(state.units.filter((u) => isPlayerSeat(u.seat)).length).toBe(1);
  });

  it('never disbands a free (0-upkeep) unit even when insolvent', () => {
    const state = makeState();
    state.unitsMode = true;
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, PLAYER_CIV); // maint 0
    playerSeat(state).treasury = -50; // already deep in the red, but nothing costs upkeep
    endTurn(state);
    expect(state.units.filter((u) => isPlayerSeat(u.seat)).length).toBe(1); // WARRIOR kept
  });
});
