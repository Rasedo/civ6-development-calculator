/**
 * WHAT A CITY'S SHOT IS SHOOTING AT.
 *
 * A city strike does not go through `defenderCS` — that body assembles a
 * unit-vs-unit fight and a dozen of its adders need an attacking UNIT to be
 * defined at all. So the two strike keys (`cstk`, the centre's; `estk`, the
 * Encampment's) read `cityStrikeDefenderCS`, and the fact that made this ONE
 * composer rather than two inline sums is the FORMATION: CIV6
 * (GlobalParameters) COMBAT_CORPS_STRENGTH_MODIFIER 10 and
 * COMBAT_ARMY_STRENGTH_MODIFIER 17 are flat strength on the unit, paid
 * wherever it fights — a city's shot included. TS had dropped it at both
 * sites and the GPU had not; a 24-seed battery lane found the 10.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { cityStrikeDefenderCS } from '../../../cpu/core/combat';
import { FORMATION_CS } from '../../../cpu/data/units';
import type { GameState } from '../../../cpu/core/types';

const scene = (): GameState => makeState(makeMap(16, 16));

describe('the defender under a city strike', () => {
  it('keeps its formation strength — the whole reason for one composer', () => {
    const state = scene();
    const t = tileAtCoords(state.map, 6, 6);
    const u = spawnUnit(state, 'WARRIOR', t.index, 1)!;
    const plain = cityStrikeDefenderCS(state, u, t);
    u.formation = 1; // Corps
    expect(cityStrikeDefenderCS(state, u, t)).toBe(plain + FORMATION_CS[1]!);
    u.formation = 2; // Army
    expect(cityStrikeDefenderCS(state, u, t)).toBe(plain + FORMATION_CS[2]!);
    expect(FORMATION_CS[1]).toBe(10);
    expect(FORMATION_CS[2]).toBe(17);
  });

  it('reads terrain under the defender', () => {
    const state = scene();
    const flat = tileAtCoords(state.map, 6, 6);
    const hill = tileAtCoords(state.map, 8, 6);
    hill.elevation = 'HILLS';
    const a = spawnUnit(state, 'WARRIOR', flat.index, 1)!;
    const b = spawnUnit(state, 'WARRIOR', hill.index, 1)!;
    expect(cityStrikeDefenderCS(state, b, hill))
      .toBeGreaterThan(cityStrikeDefenderCS(state, a, flat));
  });

  it('takes the flat embarked override instead of everything above it', () => {
    const state = scene();
    const t = tileAtCoords(state.map, 6, 6);
    const u = spawnUnit(state, 'WARRIOR', t.index, 1)!;
    u.embarked = true;
    const emb = cityStrikeDefenderCS(state, u, t);
    u.formation = 2;
    expect(cityStrikeDefenderCS(state, u, t)).toBe(emb);
  });
});
