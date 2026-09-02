import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantTechs } from '../helpers';
import { emptySeat, NO_SEAT } from '../../../cpu/core/seats';
import { spawnUnit, unitFullMoves, stepUnit, ignoresShores } from '../../../cpu/core/units';
import { rosterCS, healOnEliminate } from '../../../cpu/core/combat';
import { getModifiers } from '../../../cpu/core/effects';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { COMBAT_CS_ROWS, POST_KILL_HEAL_ROWS, EMBARK_MOVE_ROWS, IGNORE_SHORES_ROWS } from '../../../cpu/data/civilizations';
import { MP_SCALE, EMBARK_MOVES } from '../../../cpu/data/constants';
import type { GameState } from '../../../cpu/core/types';

/**
 * THE GRANTED ABILITIES AS ROWS (CIV6, the install's UnitAbilities and
 * their modifiers): a flat Combat Strength under a clause, a heal on a
 * kill, embarked Movement, no shore penalty — one clause per assertion.
 */
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);

function coastalScene(civ: string): GameState {
  const state = makeState(makeMap(12, 12, 'GRASSLAND'));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  state.seats[0].civ = seatRow(civ);
  state.seats[1].civ = seatRow('AMERICA');
  for (let r = 0; r < 12; r++) tileAtCoords(state.map, 8, r).terrain = 'COAST'; // a coast column
  return state;
}

describe('the combat-strength rows', () => {
  it('are the census: six rows, each on a class mask the target classes spell', () => {
    expect(COMBAT_CS_ROWS.length).toBe(6);
    expect(POST_KILL_HEAL_ROWS.length + EMBARK_MOVE_ROWS.length + IGNORE_SHORES_ROWS.length).toBe(5);
    const state = makeState(makeMap(8, 8, 'GRASSLAND'));
    state.seats[0].civ = seatRow('MONGOLIA');
    const m = getModifiers(state, 0);
    expect(m.leader).toBe('GENGHIS_KHAN');
    expect(m.combatCs.length).toBe(1);
    expect(m.combatCs[0].classMask).not.toBe(0);
  });

  it("Barbarossa's +7 against a city-state's units, and only theirs", () => {
    const state = coastalScene('GERMANY');
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    expect(rosterCS(state, u, 100, 100, false)).toBe(7);
    expect(rosterCS(state, u, 1, 100, false)).toBe(0);
    expect(rosterCS(state, u, 100, 100, true)).toBe(7); // a city-state's city too
  });

  it("Tomyris's +5 against a wounded unit, and 30 HP after a kill", () => {
    const state = coastalScene('SCYTHIA');
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    expect(rosterCS(state, u, 1, 100, false)).toBe(0);
    expect(rosterCS(state, u, 1, 60, false)).toBe(5);
    expect(rosterCS(state, u, 1, null, true)).toBe(0); // a city is never wounded
    u.hp = 40;
    healOnEliminate(state, u);
    expect(u.hp).toBe(70);
    const plain = coastalScene('AMERICA');
    const w = spawnUnit(plain, 'WARRIOR', tileAtCoords(plain.map, 5, 5).index, 0)!;
    w.hp = 40;
    healOnEliminate(plain, w);
    expect(w.hp).toBe(40);
  });

  it("Genghis Khan's +3 for cavalry classes alone", () => {
    const state = coastalScene('MONGOLIA');
    grantTechs(state, 'HORSEBACK_RIDING');
    const horse = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 5, 5).index, 0)!;
    const foot = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 6).index, 0)!;
    expect(rosterCS(state, horse, 1, 100, false)).toBe(3);
    expect(rosterCS(state, foot, 1, 100, false)).toBe(0);
  });

  it("Hojo's +5 on coastal land for land units and on Coast for hulls", () => {
    const state = coastalScene('JAPAN');
    const inland = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 2, 5).index, 0)!;
    const shore = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 5).index, 0)!;
    expect(rosterCS(state, inland, 1, 100, false)).toBe(0);
    expect(rosterCS(state, shore, 1, 100, false)).toBe(5);
    const galley = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 8, 3).index, 0)!;
    expect(rosterCS(state, galley, 1, 100, false)).toBe(5);
    tileAtCoords(state.map, 8, 3).terrain = 'LAKE';
    expect(rosterCS(state, galley, 1, 100, false)).toBe(5); // a lake is shallow water
    tileAtCoords(state.map, 8, 3).terrain = 'OCEAN';
    expect(rosterCS(state, galley, 1, 100, false)).toBe(0);
  });

  it('the Great Turkish Bombard: siege units +5 against a city, not a unit', () => {
    const state = coastalScene('OTTOMAN');
    grantTechs(state, 'ENGINEERING');
    const cat = spawnUnit(state, 'CATAPULT', tileAtCoords(state.map, 5, 5).index, 0)!;
    expect(rosterCS(state, cat, 1, null, true)).toBe(5);
    expect(rosterCS(state, cat, 1, 100, false)).toBe(0);
    const foot = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 6).index, 0)!;
    expect(rosterCS(state, foot, 1, null, true)).toBe(0);
  });
});

describe('the embarked rows', () => {
  it("Mana: +2 Movement embarked for every land unit; the Colonies: Settlers alone", () => {
    const maori = coastalScene('MAORI');
    const w = spawnUnit(maori, 'WARRIOR', tileAtCoords(maori.map, 5, 5).index, 0)!;
    w.embarked = true;
    expect(unitFullMoves(maori, w)).toBe(MP_SCALE * (EMBARK_MOVES + 2));
    const phoen = coastalScene('PHOENICIA');
    const w2 = spawnUnit(phoen, 'WARRIOR', tileAtCoords(phoen.map, 5, 5).index, 0)!;
    w2.embarked = true;
    expect(unitFullMoves(phoen, w2)).toBe(MP_SCALE * EMBARK_MOVES);
    const s = spawnUnit(phoen, 'SETTLER', tileAtCoords(phoen.map, 5, 6).index, 0)!;
    s.embarked = true;
    expect(unitFullMoves(phoen, s)).toBe(MP_SCALE * (EMBARK_MOVES + 2));
  });

  it('ignore-shores: the Knarr for every Norwegian unit, the Colonies for a Phoenician Settler', () => {
    const norway = coastalScene('NORWAY');
    expect(ignoresShores(norway, { type: 'WARRIOR', seat: 0 })).toBe(true);
    const phoen = coastalScene('PHOENICIA');
    expect(ignoresShores(phoen, { type: 'WARRIOR', seat: 0 })).toBe(false);
    expect(ignoresShores(phoen, { type: 'SETTLER', seat: 0 })).toBe(true);
    expect(ignoresShores(phoen, { type: 'WARRIOR', seat: 1 })).toBe(false);
    // end to end: a Phoenician Settler embarks with movement to spare
    grantTechs(phoen, 'SAILING');
    const s = spawnUnit(phoen, 'SETTLER', tileAtCoords(phoen.map, 7, 5).index, 0)!;
    const sea = tileAtCoords(phoen.map, 8, 5);
    expect(sea.ownerSeat).toBe(NO_SEAT);
    const out = stepUnit(phoen, s, sea);
    expect(['moved', 'halted']).toContain(out);
    expect(s.tileIndex).toBe(sea.index);
    expect(s.movesLeft).toBeGreaterThan(0);
  });
});
