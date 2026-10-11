/**
 * THE FREE CITY'S OWN PLAY (C-60): its build table — the city-state
 * production model over the Free Cities' census (`FREE_CITY_BUILD_ROWS`) —
 * read against the world era's research, and its units' walk. The GPU twin is
 * tests/gpu/minor_purse_test.py's Free City scenes.
 */
import { describe, it, expect } from 'vitest';
import { makeState, makeMap, tileAtCoords } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { flipCity, freeCitiesPhase } from '../../../cpu/core/phase';
import { freeCityBuild } from '../../../cpu/core/minorBuild';
import { spawnUnit } from '../../../cpu/core/units';
import { wallsMax } from '../../../cpu/core/rules';
import { FREE_SEAT } from '../../../cpu/core/seats';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { UNITS } from '../../../cpu/data/units';
import { hexDistance } from '../../../world/hex';
import type { City, GameState } from '../../../cpu/core/types';

function scene(): { state: GameState; city: City } {
  const state = makeState(makeMap(24, 14));
  foundCity(state, tileAtCoords(state.map, 2, 7).index, 0);
  const border = foundCity(state, tileAtCoords(state.map, 12, 7).index, 0).city!;
  border.population = 3;
  flipCity(state, border);
  return { state, city: state.freeSeat!.cities[0] };
}

const freeUnits = (state: GameState) => state.units.filter((u) => u.seat === FREE_SEAT);

/** the Free Cities' own research, holding what the table's rows ask */
function research(state: GameState) {
  const r = state.freeSeat!.research;
  r.techs = ['POTTERY', 'ARCHERY', 'MASONRY'];
  return r;
}

describe("the Free City's build table", () => {
  it('reads its own research: no ranged unit before Archery', () => {
    const { state, city } = scene();
    freeCityBuild(state, city, 100, state.freeSeat!.research);
    expect(freeUnits(state).some((u) => u.type === 'ARCHER')).toBe(false);
  });

  it('banks its Production and trains the ranged class it lacks, paying where the unit lands', () => {
    const { state, city } = scene();
    // the revolt's pair is melee: no ranged unit calls the city home
    expect(freeUnits(state).length).toBe(2);
    const r = research(state);
    freeCityBuild(state, city, 5, r);
    expect(city.freePot).toBe(5);
    expect(freeUnits(state).length).toBe(2);
    freeCityBuild(state, city, 100, r);
    const trained = freeUnits(state).filter((u) => u.type === 'ARCHER');
    expect(trained.length).toBe(1);
    expect(trained[0].freeCity).toBeUndefined();
    expect(city.freePot).toBe(105 - UNITS.ARCHER.cost);
  });

  it('raises a Monument, then a Granary, once a ranged unit calls it home', () => {
    const { state, city } = scene();
    spawnUnit(state, 'ARCHER', city.centerIndex, FREE_SEAT);
    const r = research(state);
    freeCityBuild(state, city, 100, r);
    expect(city.buildings).toContain('MONUMENT');
    expect(city.freePot).toBe(100 - BUILDINGS.MONUMENT.cost);
    freeCityBuild(state, city, 100, r);
    expect(city.buildings).toContain('GRANARY');
  });

  it('raises its walls and fills the pool, and repairs a breach at the HP it puts back', () => {
    const { state, city } = scene();
    spawnUnit(state, 'ARCHER', city.centerIndex, FREE_SEAT);
    city.buildings.push('MONUMENT', 'GRANARY');
    const r = research(state);
    freeCityBuild(state, city, 100, r);
    expect(city.buildings).toContain('ANCIENT_WALLS');
    const max = wallsMax(state, city);
    expect(city.outerHp).toBe(max);
    city.outerHp = max - 30;
    city.lastHitTurn = state.turn - 10;
    city.freePot = 0;
    freeCityBuild(state, city, 29, r);
    expect(city.outerHp).toBe(max - 30);
    freeCityBuild(state, city, 1, r);
    expect(city.outerHp).toBe(max);
    expect(city.freePot).toBe(0);
  });

  it("walks the Free Cities' units around the city in its own phase", () => {
    const { state, city } = scene();
    const before = freeUnits(state).map((u) => u.tileIndex);
    for (let k = 0; k < 6; k++) freeCitiesPhase(state);
    const ctr = state.map.tiles[city.centerIndex];
    const after = freeUnits(state);
    expect(after.some((u, i) => u.tileIndex !== before[i])).toBe(true);
    for (const u of after) {
      const t = state.map.tiles[u.tileIndex];
      expect(hexDistance(state.map, t.col, t.row, ctr.col, ctr.row)).toBeLessThanOrEqual(6);
    }
  });
});
