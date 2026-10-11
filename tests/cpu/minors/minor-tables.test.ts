/**
 * THE CITY-STATES' VALUE TABLES ON A WORLD (`minorTables`, the Default
 * Specialization pick over them): seed9001's opening state, and the same
 * with each minor at population 3, a Monument held and a Warrior in hand (7
 * in, 2 in the overflow store). Per minor the valued rows' count and sum of
 * the buildings, units and projects tables, and the pick.
 *
 * The GPU twin is tests/gpu/city_value_test.py's `test_minor_tables`, which
 * reads the same facts off the sim's own state.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadWorld } from '../../../cpu/world/load';
import { minorBuildFacts, minorKnownUnits, minorPickFacts, minorTables } from '../../../cpu/core/minorBuild';
import { defaultSpecialization } from '../../../cpu/core/aiCityBuild';
import { FX_MIN } from '../../../cpu/core/aiValue';
import type { WorldFile } from '../../../world/file';
import type { GameState } from '../../../cpu/core/types';

const world = (): GameState =>
  loadWorld(JSON.parse(readFileSync('seeder/worlds/seed9001.world.json', 'utf-8')) as WorldFile);

function digest(state: GameState) {
  const out: Record<number, unknown> = {};
  for (const cs of state.cityStates) {
    const known = minorKnownUnits(cs);
    const t = minorTables(state, cs, known);
    const pick = defaultSpecialization(t, minorPickFacts(state, cs, minorBuildFacts(state, cs, known)));
    const sum = (xs: readonly number[]) => {
      const v = xs.filter((x) => x !== FX_MIN);
      return [v.length, v.reduce((a, b) => a + b, 0)];
    };
    out[cs.seat] = [[sum(t.buildings), sum(t.units), sum(t.projects)], pick && [pick.kind, pick.type, pick.value]];
  }
  return out;
}

describe("the city-states' value tables on a world", () => {
  it('reads the opening state', () => {
    expect(digest(world())).toEqual({
      100: [[[9, 62956], [32, 10710], [1, 0]], ['building', 'BUILDING_WALLS', 23332]],
      101: [[[15, 94682], [34, 5880], [1, 0]], ['building', 'BUILDING_WALLS', 23981]],
      102: [[[17, 111536], [35, 1269], [1, 0]], ['building', 'BUILDING_WALLS', 25389]],
    });
  });

  it('reads the population, the buildings held and the item in hand', () => {
    const state = world();
    for (const cs of state.cityStates) {
      cs.population = 3;
      cs.buildings = [...(cs.buildings ?? []), 'MONUMENT'];
      cs.prodItem = 'unit:WARRIOR';
      cs.prodProgress = 7;
      cs.prodOverflow = 2;
    }
    expect(digest(state)).toEqual({
      100: [[[11, 52891], [34, 6046], [1, 0]], ['building', 'BUILDING_WALLS', 15277]],
      101: [[[18, 100114], [35, -161], [1, 0]], ['building', 'BUILDING_WALLS', 16493]],
      102: [[[18, 94321], [35, -161], [1, 0]], ['building', 'BUILDING_WALLS', 16493]],
    });
  });
});
