import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, isCiv, setWar } from '../../../cpu/core/seats';
import { inEnemyZoc, unitExertsZoc, unitReligious, spawnUnit } from '../../../cpu/core/units';
import { MP_SCALE } from '../../../cpu/data/constants';
import type { GameState, Seat, Unit } from '../../../cpu/core/types';

// CIV6 (Zone of Control): "Many combat units exert a 'Zone of Control'...
// Ranged and Bombard class units do not exert ZOC. Cavalry units, as well as
// Naval Raider class units have the ability to ignore an enemy's ZOC.
// RELIGIOUS UNITS EXERT ZOC AGAINST OTHER RELIGIOUS UNITS. Rivers block Zone
// of Control from all units."

function twoSeatsAtWar(): GameState {
  const state = makeState(makeMap(12, 12));
  state.unitsMode = true;
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Rome',
    seat: 1,
    government: { current: null, policies: [], held: 0 },
    cities: [],
  } as Seat;
  state.seats.push(civ);
  setWar(state, 0, 1, true);
  return state;
}

function put(state: GameState, seat: number, type: string, col: number, row: number): Unit {
  return spawnUnit(state, type, tileAtCoords(state.map, col, row).index, seat)!;
}

/** a mover standing beside the exerter, never itself on the map */
function mover(state: GameState, type: string, col: number, row: number): Unit {
  return {
    id: 9000, type, seat: 0, tileIndex: tileAtCoords(state.map, col, row).index,
    movesLeft: 2 * MP_SCALE, hp: 100, charges: null, path: null,
  };
}

describe('which units are religious', () => {
  it('is exactly the religious-strength roster', () => {
    for (const t of ['MISSIONARY', 'APOSTLE', 'INQUISITOR']) expect(unitReligious(t)).toBe(true);
    for (const t of ['WARRIOR', 'ARCHER', 'SETTLER', 'BUILDER', 'SPY']) expect(unitReligious(t)).toBe(false);
  });

  it('and a religious unit exerts no MILITARY zone', () => {
    const state = twoSeatsAtWar();
    const miss = put(state, 1, 'MISSIONARY', 5, 5);
    expect(unitExertsZoc(miss)).toBe(false);
  });
});

describe('the religious zone', () => {
  it('halts another religious unit', () => {
    const state = twoSeatsAtWar();
    put(state, 1, 'APOSTLE', 5, 5);
    expect(inEnemyZoc(state, tileAtCoords(state.map, 6, 5).index, mover(state, 'MISSIONARY', 6, 5))).toBe(true);
  });

  it('and lets a MILITARY unit walk straight through', () => {
    const state = twoSeatsAtWar();
    put(state, 1, 'APOSTLE', 5, 5);
    expect(inEnemyZoc(state, tileAtCoords(state.map, 6, 5).index, mover(state, 'WARRIOR', 6, 5))).toBe(false);
  });

  it('...and is not exerted while embarked', () => {
    const state = twoSeatsAtWar();
    const ap = put(state, 1, 'APOSTLE', 5, 5);
    ap.embarked = true;
    expect(inEnemyZoc(state, tileAtCoords(state.map, 6, 5).index, mover(state, 'MISSIONARY', 6, 5))).toBe(false);
  });
});

describe('the military zone', () => {
  it('halts a military unit', () => {
    const state = twoSeatsAtWar();
    put(state, 1, 'WARRIOR', 5, 5);
    expect(inEnemyZoc(state, tileAtCoords(state.map, 6, 5).index, mover(state, 'WARRIOR', 6, 5))).toBe(true);
  });

  it('and a religious unit ignores it', () => {
    const state = twoSeatsAtWar();
    put(state, 1, 'WARRIOR', 5, 5);
    expect(inEnemyZoc(state, tileAtCoords(state.map, 6, 5).index, mover(state, 'MISSIONARY', 6, 5))).toBe(false);
  });

  it('...even with a whole ring of them', () => {
    const state = twoSeatsAtWar();
    for (const [c, r] of [[5, 5], [7, 5], [6, 4], [6, 6], [5, 6], [7, 6]] as const) {
      put(state, 1, 'WARRIOR', c, r);
    }
    const dest = tileAtCoords(state.map, 6, 5).index;
    expect(inEnemyZoc(state, dest, mover(state, 'WARRIOR', 6, 5))).toBe(true);
    expect(inEnemyZoc(state, dest, mover(state, 'MISSIONARY', 6, 5))).toBe(false);
  });
});

describe('what the religious zone still obeys', () => {
  it('a river blocks it, exactly as it blocks the military one', () => {
    const state = twoSeatsAtWar();
    put(state, 1, 'APOSTLE', 5, 5);
    const dest = tileAtCoords(state.map, 6, 5);
    const m = mover(state, 'MISSIONARY', 6, 5);
    expect(inEnemyZoc(state, dest.index, m)).toBe(true);
    // a river along every edge of the entered tile
    dest.riverMask = 0x3f;
    expect(inEnemyZoc(state, dest.index, m)).toBe(false);
  });

  it('and a friendly religious unit exerts nothing', () => {
    const state = twoSeatsAtWar();
    setWar(state, 0, 1, false);
    put(state, 1, 'APOSTLE', 5, 5);
    expect(inEnemyZoc(state, tileAtCoords(state.map, 6, 5).index, mover(state, 'MISSIONARY', 6, 5))).toBe(false);
    expect(state.units.every((u) => !isCiv(u.seat) || u.seat === 1)).toBe(true);
  });
});
