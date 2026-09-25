import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeMap, makeState, tileAtCoords, grantTechs, settleAt } from '../helpers';
import { emptySeat, NO_SEAT, FREE_SEAT } from '../../../cpu/core/seats';
import { spawnUnit, unitFullMoves, stepUnit, ignoresShores } from '../../../cpu/core/units';
import { rosterCS, healOnEliminate, cityStrikeDefenderCS } from '../../../cpu/core/combat';
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

describe('the Roosevelt Corollary', () => {
  it('pays +5 on the ORIGINAL capital continent and nothing off it', () => {
    // two landmasses, the capital on the western one
    const map = makeMap(20, 20, 'GRASSLAND');
    for (const t of map.tiles) if (t.col === 10) t.terrain = 'OCEAN';
    const state = makeState(map);
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    state.seats[0].civ = seatRow('AMERICA');
    settleAt(state, tileAtCoords(state.map, 4, 5).index, 0);
    expect(getModifiers(state, 0).leader).toBe('T_ROOSEVELT');

    const home = tileAtCoords(state.map, 5, 6);
    const abroad = tileAtCoords(state.map, 15, 6);
    expect(home.continent).not.toBe(abroad.continent);
    const at = (t: number) => rosterCS(state, { type: 'WARRIOR', seat: 0, tileIndex: t }, 1, 100, false);
    expect(at(home.index)).toBe(5);
    expect(at(abroad.index)).toBe(0);
    // ...and a seat the roster does not name takes nothing anywhere
    state.seats[0].civ = -1;
    expect(at(home.index)).toBe(0);
  });
});

describe('the combat-strength rows', () => {
  it('are the census: ten rows, each on a class mask the target classes spell', () => {
    expect(COMBAT_CS_ROWS.length).toBe(10);
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

  it("Swift Hawk's +10 against the Free Cities, and a civilization only in a golden age", () => {
    const state = coastalScene('MAPUCHE');
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    expect(rosterCS(state, u, FREE_SEAT, 100, false)).toBe(10);
    expect(rosterCS(state, u, FREE_SEAT, null, true)).toBe(10); // a Free City too
    expect(rosterCS(state, u, 1, 100, false)).toBe(0);
    expect(rosterCS(state, u, 100, 100, false)).toBe(0); // a city-state is neither
  });
});

describe("the unit a city's strike hits", () => {
  // CIV6: no roster row's requirement set asks who attacks, so the struck
  // unit takes its rows with the striking city as its opponent — a district
  // (OPPONENT_IS_DISTRICT), of the city's seat, never wounded
  const struck = (civ: string, type: string, striker: number, tech?: string) => {
    const state = coastalScene(civ);
    if (tech) grantTechs(state, tech);
    const t = tileAtCoords(state.map, 5, 5);
    const u = spawnUnit(state, type, t.index, 0)!;
    const withRows = cityStrikeDefenderCS(state, u, t, striker);
    state.seats[0].civ = -1;
    return withRows - cityStrikeDefenderCS(state, u, t, striker);
  };

  it('the Great Turkish Bombard: a siege unit +5 against the shooting district', () => {
    expect(struck('OTTOMAN', 'CATAPULT', 1, 'ENGINEERING')).toBe(5);
    expect(struck('OTTOMAN', 'WARRIOR', 1)).toBe(0);
  });

  it("Barbarossa's +7 when the city is a city-state's, and only then", () => {
    expect(struck('GERMANY', 'WARRIOR', 100)).toBe(7);
    expect(struck('GERMANY', 'WARRIOR', 1)).toBe(0);
  });

  it("Swift Hawk's +10 when the city is a Free City", () => {
    expect(struck('MAPUCHE', 'WARRIOR', FREE_SEAT)).toBe(10);
    expect(struck('MAPUCHE', 'WARRIOR', 1)).toBe(0);
  });

  it("Tomyris takes nothing — a city is never wounded — and Hojo's coast still pays", () => {
    expect(struck('SCYTHIA', 'WARRIOR', 1)).toBe(0);
    const state = coastalScene('JAPAN');
    const shore = tileAtCoords(state.map, 7, 5);
    const u = spawnUnit(state, 'WARRIOR', shore.index, 0)!;
    const withRows = cityStrikeDefenderCS(state, u, shore, 1);
    state.seats[0].civ = -1;
    expect(withRows - cityStrikeDefenderCS(state, u, shore, 1)).toBe(5);
  });
});

describe('the site census', () => {
  it('every strength composition that names one seat-keyed adder names them all', () => {
    // a site with congressUnitCS and no rosterCS is a roster clause the other
    // engine pays and this one does not — seed 9248's melee assault was that
    const src = readFileSync(new URL('../../../cpu/core/combat.ts', import.meta.url), 'utf8');
    const bodies = src.split('\nfunction ').flatMap((b) => b.split('\nexport function ')).slice(1);
    const missing = bodies
      .filter((b) => b.includes('congressUnitCS(') && !b.includes('rosterCS('))
      .map((b) => b.slice(0, b.indexOf('(')));
    // ONE allowed name: `congressUnitCS` is the adder's OWN body.
    const allowed = new Set(['congressUnitCS']);
    expect(missing.filter((n) => !allowed.has(n))).toEqual([]);
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
