/** STAVE_CHURCH_SEA_RESOURCE_REQUIREMENTS, TypeScript half.
 *
 * CIV6 (Buildings.xml): the set is REQUIRES_PLOT_HAS_VISIBLE_RESOURCE +
 * REQUIRES_PLOT_HAS_COAST, and two live modifiers ride it — the Stave
 * Church's +1 Production (STAVECHURCH_SEARESOURCE_PRODUCTION) and the
 * Aquarium's +1 Science (AQUARIUM_SEARESOURCE_SCIENCE). A strategic the seat
 * cannot see yet pays neither; its revealing technology turns both on. The
 * Aquarium's second plot clause (AQUARIUM_REEF_SCIENCE) pays each Reef tile.
 * The GPU twin is tests/gpu/sea_resource_visible_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, grantTechs } from '../helpers';
import { computeCityStats, buildingCoastYields } from '../../../cpu/core/city';
import { neighbors } from '../../../world/hex';
import { BUILDINGS } from '../../../cpu/data/buildings';
import type { City, GameState } from '../../../cpu/core/types';

function scene(): { state: GameState; city: City } {
  const state = makeState(makeMap(12, 12, 'COAST'));
  const center = tileAtCoords(state.map, 6, 6);
  center.terrain = 'GRASSLAND';
  const city = settleAt(state, center.index, 0);
  city.population = 6; // every Coast neighbour worked
  return { state, city };
}

/** what `id` adds to the city's tile yield of `key`, holding the rest. */
function clause(state: GameState, city: City, id: string, key: 'science' | 'production'): number {
  const without = computeCityStats(state, city).breakdown.tiles[key];
  city.buildings.push(id);
  const withIt = computeCityStats(state, city).breakdown.tiles[key];
  city.buildings.splice(city.buildings.indexOf(id), 1);
  return withIt - without;
}

describe('the sea-resource clause reads only a resource the seat can see', () => {
  it('the Aquarium carries the install\'s two plot clauses', () => {
    expect(BUILDINGS.AQUARIUM!.coastResourceYields).toEqual({ science: 1 });
    expect(BUILDINGS.AQUARIUM!.plotFeatureYields).toEqual({ feature: 'REEF', yields: { science: 1 } });
  });

  it('the Aquarium pays +1 Science per coastal resource tile, nothing on an unseen strategic', () => {
    const { state, city } = scene();
    const around = neighbors(state.map, state.map.tiles[city.centerIndex]);
    for (const t of around) t.resource = 'OIL'; // revealed at Refining
    const worked = () => computeCityStats(state, city).workedTiles.filter((i) => state.map.tiles[i].resource !== null).length;
    expect(buildingCoastYields(state, { ...city, buildings: ['AQUARIUM'] })).toEqual({ science: 1 });
    expect(worked()).toBeGreaterThan(0);
    expect(clause(state, city, 'AQUARIUM', 'science')).toBe(0);
    grantTechs(state, 'REFINING');
    expect(clause(state, city, 'AQUARIUM', 'science')).toBe(worked());
    // a bonus resource is always seen
    for (const t of around) t.resource = 'FISH';
    state.seats[0]!.research.techs = [];
    expect(clause(state, city, 'AQUARIUM', 'science')).toBe(worked());
  });

  it('the Stave Church pays nothing on an unseen strategic, once it is seen', () => {
    const { state, city } = scene();
    state.seats[0]!.civ = 2; // Norway
    city.buildings.push('SHRINE');
    for (const t of neighbors(state.map, state.map.tiles[city.centerIndex])) t.resource = 'OIL';
    expect(clause(state, city, 'TEMPLE', 'production')).toBe(0);
    grantTechs(state, 'REFINING');
    const n = computeCityStats(state, city).workedTiles.filter((i) => state.map.tiles[i].resource === 'OIL').length;
    expect(n).toBeGreaterThan(0);
    expect(clause(state, city, 'TEMPLE', 'production')).toBe(n);
  });

  it('the Aquarium pays +1 Science per worked Reef tile', () => {
    const { state, city } = scene();
    const around = neighbors(state.map, state.map.tiles[city.centerIndex]);
    for (const t of around.slice(0, 2)) t.feature = 'REEF';
    const reefs = computeCityStats(state, city).workedTiles.filter((i) => state.map.tiles[i].feature === 'REEF').length;
    expect(reefs).toBe(2);
    expect(clause(state, city, 'AQUARIUM', 'science')).toBe(2);
  });
});
