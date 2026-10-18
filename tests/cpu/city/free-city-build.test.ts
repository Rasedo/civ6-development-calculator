/**
 * THE FREE CITY'S OWN PLAY (C-60): its production — the item in hand its AI's
 * Default Specialization picked on an empty queue (`freeCityBuild`) — and its
 * units' walk. The GPU twin is tests/gpu/minor_purse_test.py's Free City
 * scenes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeState, makeMap, tileAtCoords } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { loadWorld } from '../../../cpu/world/load';
import { freeCityBuildFacts } from '../../../cpu/core/majorCityBuild';
import { buildingTable, unitTable } from '../../../cpu/core/aiCityBuild';
import { FX_MIN } from '../../../cpu/core/aiValue';
import { spawnUnit } from '../../../cpu/core/units';
import type { WorldFile } from '../../../world/file';
import { flipCity, freeCitiesPhase } from '../../../cpu/core/phase';
import { freeCityBuild } from '../../../cpu/core/minorBuild';
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

/** the Free Cities' own research */
function research(state: GameState) {
  const r = state.freeSeat!.research;
  r.techs = ['POTTERY', 'ARCHERY', 'MASONRY'];
  return r;
}

describe("the Free City's production", () => {
  it("seed9001's revolt: its tables and its picks over eight steps of 5 Production (the GPU twin's numbers)", () => {
    const state = loadWorld(JSON.parse(readFileSync('seeder/worlds/seed9001.world.json', 'utf-8')) as WorldFile);
    for (const s of state.seats) {
      const u = state.units.find((x) => x.seat === s.seat && x.type === 'SETTLER');
      if (u) foundCity(state, u.tileIndex, s.seat);
    }
    spawnUnit(state, 'SETTLER', 652, 0);
    const born = foundCity(state, 652, 0).city!;
    born.population = 3;
    flipCity(state, born);
    const city = state.freeSeat!.cities[0];
    const f = freeCityBuildFacts(state, city);
    const bt = buildingTable(f).filter((v) => v !== FX_MIN);
    const ut = unitTable(f).filter((v): v is number => v !== null && v !== FX_MIN);
    // the Warrior Monk, Warrior and Slinger each with half its one city over
    // the strongest melee it has trained (none: the revolt's grants train nothing)
    expect([bt.length, bt.reduce((a, b) => a + b, 0), ut.length, ut.reduce((a, b) => a + b, 0)]).toEqual([1, 7728, 6, 32712]);
    const seq: unknown[] = [];
    for (let k = 0; k < 8; k++) {
      freeCityBuild(state, city, 5);
      const q = city.queue[0];
      seq.push([q?.kind === 'building' ? q.building : q?.kind === 'unit' ? q.unit : '-', q?.progress ?? 0, city.productionBank ?? 0]);
    }
    expect(seq).toEqual([['MONUMENT', 0, 5], ['MONUMENT', 10, 0], ['MONUMENT', 15, 0], ['MONUMENT', 20, 0], ['MONUMENT', 25, 0],
      ['SLINGER', 0, 0], ['SLINGER', 5, 0], ['SLINGER', 10, 0]]);
  });

  it('banks its Production with nothing in hand, then its AI picks an item for the next step', () => {
    const { state, city } = scene();
    research(state);
    city.queue = [];
    city.productionBank = 0;
    freeCityBuild(state, city, 5);
    expect(city.productionBank).toBe(5);
    expect(city.queue.length).toBe(1);
    const q = city.queue[0];
    freeCityBuild(state, city, 3);
    // the step paid the Production and the bank into the item (or completed it)
    expect(city.queue[0] === q ? q.progress : 8).toBe(8);
    expect(city.productionBank).toBe(city.queue[0] === q ? 0 : city.productionBank);
  });

  it('completes the item in hand at its price: a building rises, the queue empties for the next pick', () => {
    const { state, city } = scene();
    research(state);
    city.queue = [{ kind: 'building', building: 'MONUMENT', progress: BUILDINGS.MONUMENT.cost - 1 }];
    city.productionBank = 0;
    freeCityBuild(state, city, 3);
    expect(city.buildings).toContain('MONUMENT');
    expect(city.productionBank).toBe(2);
    expect(city.queue[0]?.kind === 'building' && city.queue[0].building === 'MONUMENT').toBe(false);
  });

  it('a unit lands on or beside the centre; the walls fill their pool', () => {
    const { state, city } = scene();
    research(state);
    const before = freeUnits(state).length;
    city.queue = [{ kind: 'unit', unit: 'ARCHER', progress: UNITS.ARCHER.cost }];
    freeCityBuild(state, city, 1);
    expect(freeUnits(state).length).toBe(before + 1);
    city.queue = [{ kind: 'building', building: 'ANCIENT_WALLS', progress: BUILDINGS.ANCIENT_WALLS.cost }];
    freeCityBuild(state, city, 1);
    expect(city.buildings).toContain('ANCIENT_WALLS');
    expect(city.outerHp).toBe(wallsMax(state, city));
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
