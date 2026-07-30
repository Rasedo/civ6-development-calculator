import { describe, it, expect } from 'vitest';
import { isBarbSeat, BARB_SEAT } from '../src/core/seats';
import { makeState, tileAtCoords } from './helpers';
import { spatialObservation, SPATIAL_PLANES, SPATIAL_PLANE_COUNT } from '../src/core/spatial';
import { createGame, foundCity } from '../src/core/game';
import { initFog } from '../src/core/fog';
import { spawnUnit } from '../src/core/units';
import { isWater } from '../src/core/query';

const plane = (name: (typeof SPATIAL_PLANES)[number]) => SPATIAL_PLANES.indexOf(name);

describe('spatial observation', () => {
  it('has the right shape and marks terrain/ownership/units', () => {
    const state = makeState(); // 12×12 grassland, all explored
    const size = state.map.width * state.map.height;
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index).city!;
    const hillTile = tileAtCoords(state.map, 2, 2);
    hillTile.elevation = 'HILLS';
    const unit = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 3).index)!;

    const obs = spatialObservation(state);
    expect(obs.length).toBe(SPATIAL_PLANE_COUNT * size);

    const at = (p: number, i: number) => obs[p * size + i];
    expect(at(plane('hills'), hillTile.index)).toBe(1);
    expect(at(plane('myCityCenter'), city.centerIndex)).toBe(1); // pop 1
    expect(at(plane('ownedMine'), city.centerIndex)).toBe(1);
    expect(at(plane('myUnits'), unit.tileIndex)).toBe(2); // military
    expect(at(plane('explored'), 0)).toBe(1);
    // grassland food = 2 everywhere unowned tiles too
    expect(at(plane('food'), tileAtCoords(state.map, 9, 9).index)).toBeGreaterThanOrEqual(2);
  });

  it('hides everything under fog except nothing at all', () => {
    const state = createGame({ width: 30, height: 20, seed: 4, withResources: true, withWonders: true });
    state.fogOfWar = true;
    state.unitsMode = true;
    const site = state.map.tiles.find((t) => !isWater(t) && t.elevation !== 'MOUNTAIN')!;
    foundCity(state, site.index);
    initFog(state);
    const size = state.map.width * state.map.height;
    const obs = spatialObservation(state);
    const at = (p: number, i: number) => obs[p * size + i];

    const unexplored = state.explored
      .map((e, i) => (e === 0 ? i : -1))
      .filter((i) => i >= 0);
    expect(unexplored.length).toBeGreaterThan(0);
    for (const i of unexplored.slice(0, 50)) {
      for (let p = 0; p < SPATIAL_PLANE_COUNT; p++) {
        expect(at(p, i)).toBe(0);
      }
    }
    // explored tiles do carry data
    expect(at(plane('explored'), site.index)).toBe(1);
  });

  it('reflects dynamic changes (pillage, hostiles)', () => {
    const state = makeState();
    state.unitsMode = true;
    const farm = tileAtCoords(state.map, 4, 4);
    farm.improvement = 'FARM';
    const size = state.map.width * state.map.height;
    let obs = spatialObservation(state);
    expect(obs[plane('improvement') * size + farm.index]).toBe(1);
    farm.pillaged = true;
    obs = spatialObservation(state);
    expect(obs[plane('improvement') * size + farm.index]).toBe(2);

    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 8, 8).index, BARB_SEAT);
    obs = spatialObservation(state);
    const barbTile = state.units.find((u) => isBarbSeat(u.seat))!.tileIndex;
    expect(obs[plane('hostiles') * size + barbTile]).toBe(2);
  });
});
