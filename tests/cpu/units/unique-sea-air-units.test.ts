/**
 * THE UNIQUE NAVAL AND AIR UNITS, plus the two late land rows (Janissary and
 * Saka Horse Archer). Every stat is the install's own Units.xml row and every
 * ability is one UnitAbilities.xml clause, quoted at its catalog row.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, setWar } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { chassisAbilityCS, mayCapture } from '../../../cpu/core/combat';
import { routePlunderer } from '../../../cpu/core/trade';
import { UNITS } from '../../../cpu/data/units';
import { GAME_SPEED } from '../../../cpu/data/constants';
import type { GameState, Unit } from '../../../cpu/core/types';

/** id -> [civ, replaces|null, cost, moves, combat] straight off Units.xml. */
const ROWS: readonly (readonly [string, string, string | null, number, number, number])[] = [
  ['P51_MUSTANG', 'AMERICA', 'FIGHTER', 520, 10, 105],
  ['MINAS_GERAES', 'BRAZIL', 'BATTLESHIP', 430, 5, 70],
  ['SEA_DOG', 'ENGLAND', 'PRIVATEER', 280, 4, 40],
  ['U_BOAT', 'GERMANY', 'SUBMARINE', 430, 3, 65],
  ['DE_ZEVEN_PROVINCIEN', 'NETHERLANDS', 'FRIGATE', 280, 4, 50],
  ['BARBARY_CORSAIR', 'OTTOMAN', 'PRIVATEER', 240, 4, 40],
  ['BIREME', 'PHOENICIA', 'GALLEY', 65, 4, 35],
  ['JANISSARY', 'OTTOMAN', 'MUSKETMAN', 120, 2, 60],
  ['SAKA_HORSE_ARCHER', 'SCYTHIA', null, 100, 4, 20],
] as const;

function scene(): GameState {
  const state = makeState(makeMap(24, 24));
  state.unitsMode = true;
  return state;
}

/** a hull needs water under it — turn a band of the map into coast. */
function sea(state: GameState, cols: readonly number[], row: number, terrain: 'COAST' | 'OCEAN' = 'COAST'): void {
  for (const c of cols) tileAtCoords(state.map, c, row).terrain = terrain;
}

function put(state: GameState, type: string, col: number, row: number, seat = 0): Unit {
  const u = spawnUnit(state, type, tileAtCoords(state.map, col, row).index, seat);
  expect(u, `${type} did not spawn`).toBeTruthy();
  return u!;
}

describe('the unique sea and air catalog', () => {
  it('carries every row with the install’s own numbers', () => {
    for (const [id, civ, replaces, cost, moves, combat] of ROWS) {
      const d = UNITS[id];
      expect(d, `${id} has no catalog row`).toBeTruthy();
      expect(d.uniqueTo, `${id} names the wrong civilization`).toBe(civ);
      expect(d.replaces ?? null, `${id} replaces the wrong chassis`).toBe(replaces);
      expect(d.cost, `${id} cost`).toBe(Math.round(cost * GAME_SPEED));
      expect(d.moves, `${id} moves`).toBe(moves);
      expect(d.combat, `${id} combat`).toBe(combat);
      if (replaces) expect(d.upgradesTo, `${id} upgrade`).toBe(UNITS[replaces].upgradesTo);
    }
  });

  it('leaves EVERY civilization with a unique unit of its own', () => {
    const seen = new Set(Object.values(UNITS).map((u) => u.uniqueTo).filter(Boolean));
    // 34 rows in the roster; each one now names at least one chassis
    expect(seen.size).toBe(34);
  });

  it('keeps the raider trio a raider, and the Bireme a plain hull', () => {
    for (const id of ['SEA_DOG', 'U_BOAT', 'BARBARY_CORSAIR']) {
      expect(UNITS[id].raider, `${id} is no raider`).toBe(true);
      expect(UNITS[id].stealth, `${id} is not hidden`).toBe(true);
    }
    expect(UNITS.BIREME.raider).toBeUndefined();
    expect(UNITS.BIREME.naval).toBe(true);
  });
});

describe('the sea and air clauses', () => {
  it('pays the U-Boat in deep water and nowhere else', () => {
    const state = scene();
    sea(state, [6], 6, 'OCEAN');
    sea(state, [8], 6);
    const ocean = tileAtCoords(state.map, 6, 6);
    const coast = tileAtCoords(state.map, 8, 6);
    // an OCEAN tile asks Cartography to enter, so the hull stands on the coast
    // and the clause is read at each ground in turn
    const u = put(state, 'U_BOAT', 8, 6);
    expect(chassisAbilityCS(state, u, ocean.index)).toBe(10);
    expect(chassisAbilityCS(state, u, coast.index)).toBe(0);
  });

  it('pays the Mustang against a fighter and not against a bomber', () => {
    const state = scene();
    const t = tileAtCoords(state.map, 6, 6).index;
    const p = put(state, 'P51_MUSTANG', 6, 6);
    expect(chassisAbilityCS(state, p, t, { foeType: 'FIGHTER' })).toBe(5);
    expect(chassisAbilityCS(state, p, t, { foeType: 'JET_FIGHTER' })).toBe(5);
    expect(chassisAbilityCS(state, p, t, { foeType: 'BOMBER' })).toBe(0);
    expect(chassisAbilityCS(state, p, t, { foeType: 'WARRIOR' })).toBe(0);
    expect(chassisAbilityCS(state, p, t)).toBe(0);
    expect(UNITS.P51_MUSTANG.xpRate).toBe(1.5);
  });

  it('pays De Zeven Provinciën against a defensible district alone', () => {
    const state = scene();
    sea(state, [6], 6);
    const t = tileAtCoords(state.map, 6, 6).index;
    const d = put(state, 'DE_ZEVEN_PROVINCIEN', 6, 6);
    expect(chassisAbilityCS(state, d, t, { vsDistrict: true })).toBe(7);
    expect(chassisAbilityCS(state, d, t)).toBe(0);
  });

  it('lets the Sea Dog take a naval prize its seat could not', () => {
    const state = scene();
    state.seats.push(emptySeat(1));
    setWar(state, 0, 1, true);
    sea(state, [6, 7, 9], 6);
    const dog = put(state, 'SEA_DOG', 6, 6);
    const prize = put(state, 'GALLEY', 7, 6, 1);
    expect(mayCapture(state, dog, prize)).toBe(true);
    // a plain Privateer holds no such permission of its own
    const priv = put(state, 'PRIVATEER', 9, 6);
    expect(mayCapture(state, priv, prize)).toBe(false);
    // and the prize must be a HULL
    const foot = put(state, 'WARRIOR', 11, 6, 1);
    expect(mayCapture(state, dog, foot)).toBe(false);
  });

  it('lets the Bireme guard a Trader at sea, and the Mandekalu ashore', () => {
    const state = scene();
    state.seats.push(emptySeat(1));
    setWar(state, 0, 1, true);
    sea(state, [6, 7], 6);
    const wet = tileAtCoords(state.map, 6, 6);
    put(state, 'GALLEY', 6, 6, 1); // the raider afloat
    expect(routePlunderer(state, wet.index, 0)).toBe(1);
    put(state, 'BIREME', 7, 6, 0);
    expect(routePlunderer(state, wet.index, 0)).toBe(null);
    // the LAND guard does not answer for water
    const land = tileAtCoords(state.map, 16, 16);
    put(state, 'WARRIOR', 16, 16, 1);
    put(state, 'MANDEKALU_CAVALRY', 17, 16, 0);
    expect(routePlunderer(state, land.index, 0)).toBe(null);
  });

  it('gives the Janissary its free promotion and the Saka its early bow', () => {
    const state = scene();
    const j = put(state, 'JANISSARY', 6, 6);
    expect(j.xp).toBeGreaterThan(0);
    expect(UNITS.SAKA_HORSE_ARCHER.requiresTech).toBe('HORSEBACK_RIDING');
    expect(UNITS.SAKA_HORSE_ARCHER.ranged?.range).toBe(1);
    // the Ottoman carries TWO uniques, one on land and one at sea
    const ott = Object.values(UNITS).filter((u) => u.uniqueTo === 'OTTOMAN').map((u) => u.id).sort();
    expect(ott).toEqual(['BARBARY_CORSAIR', 'JANISSARY']);
  });
});
