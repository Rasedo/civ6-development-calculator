import { describe, it, expect } from 'vitest';
import { BARB_SEAT } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { barbarianPhase } from '../../../cpu/core/combat';
import { spawnUnit } from '../../../cpu/core/units';
import type { GameState } from '../../../cpu/core/types';

// CIV 6 classes a barbarian outpost by WHERE IT STANDS: a reachable coast makes
// it a pirate camp, a Horses resource within 6 tiles a cavalry outpost, and
// everything else a land camp — while "regardless of position every outpost
// will spawn melee and ranged units".

function campAt(col: number, row: number, opts: { horses?: boolean } = {}): { state: GameState; camp: number } {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  const camp = tileAtCoords(state.map, col, row);
  state.barbSeat.camps.push(camp.index);
  if (opts.horses) tileAtCoords(state.map, col + 3, row).resource = 'HORSES';
  return { state, camp: camp.index };
}

/** Run the phase until it spawns one more barbarian, and name the newcomer. */
function nextSpawn(state: GameState, cap = 4000): string {
  const before = state.units.length;
  for (let i = 0; i < cap; i++) {
    barbarianPhase(state);
    if (state.units.length > before) return state.units[state.units.length - 1].type;
  }
  throw new Error('the phase never spawned — the scenario is inert');
}

describe('barbarian camp classes', () => {
  it('an empty camp regarrisons on its own land ladder', () => {
    const plain = campAt(6, 6);
    expect(nextSpawn(plain.state)).toBe('WARRIOR');

    const horse = campAt(6, 6, { horses: true });
    expect(nextSpawn(horse.state)).toBe('HORSEMAN');
  });

  it('the raid rotates CLASS, then ranged, then melee — every camp fields both', () => {
    // campNo 0, so the rotation is the turn alone: 0 = class, 1 = ranged, 2 = melee.
    const seen: Record<number, string> = {};
    for (const turn of [0, 1, 2]) {
      const { state, camp } = campAt(6, 6, { horses: true });
      state.turn = turn;
      spawnUnit(state, 'WARRIOR', camp, BARB_SEAT); // a garrison, so the camp RAIDS
      seen[turn] = nextSpawn(state);
    }
    expect(seen[0]).toBe('HORSEMAN'); // the camp's CLASS
    expect(seen[1]).toBe('ARCHER');   // ranged, whatever the class
    expect(seen[2]).toBe('WARRIOR');  // melee, whatever the class
  });

  it('a land camp raids melee where a cavalry outpost raids mounted', () => {
    const { state, camp } = campAt(6, 6);
    state.turn = 0;
    spawnUnit(state, 'WARRIOR', camp, BARB_SEAT);
    expect(nextSpawn(state)).toBe('WARRIOR');
  });

  it('the ladders climb with the era', () => {
    const { state, camp } = campAt(6, 6, { horses: true });
    state.turn = 123; // > 120: KNIGHT and CROSSBOWMAN
    spawnUnit(state, 'WARRIOR', camp, BARB_SEAT);
    expect(nextSpawn(state)).toBe('KNIGHT'); // 123 % 3 === 0 -> the class slot
  });
});
