import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { foundCity, placeImprovement, endTurn, serialize, deserialize } from '../src/core/game';
import {
  nextRandom,
  moveCostInto,
  crossesRiver,
  findPath,
  orderMove,
  spawnUnit,
  queueUnit,
  builderImprove,
  builderRemoveFeature,
  unitMaintenance,
  tileFreeForUnit,
} from '../src/core/units';
import { DIR_E } from '../src/core/hex';

function unitsState() {
  const state = makeState(makeMap(16, 16));
  state.unitsMode = true;
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
  return { state, city };
}

describe('in-state RNG', () => {
  it('is deterministic and survives serialization', () => {
    const a = makeState();
    const b = makeState();
    a.rngState = 12345;
    b.rngState = 12345;
    const seqA = [nextRandom(a), nextRandom(a), nextRandom(a)];
    const restored = deserialize(serialize(b));
    nextRandom(restored);
    const seqB = [seqA[0], nextRandom(restored), nextRandom(restored)];
    expect(seqB).toEqual(seqA);
  });
});

describe('movement', () => {
  it('terrain movement costs stack', () => {
    const map = makeMap();
    const t = tileAtCoords(map, 5, 5);
    expect(moveCostInto(t)).toBe(1);
    t.elevation = 'HILLS';
    expect(moveCostInto(t)).toBe(2);
    t.feature = 'WOODS';
    expect(moveCostInto(t)).toBe(3);
  });

  it('river crossings end the turn; pathfinding avoids blockers', () => {
    const { state } = unitsState();
    const from = tileAtCoords(state.map, 8, 8);
    const to = tileAtCoords(state.map, 9, 8);
    from.riverMask = 1 << DIR_E;
    expect(crossesRiver(from, to)).toBe(true);

    const unit = spawnUnit(state, 'BUILDER', from.index)!;
    unit.tileIndex = from.index; // force exact tile
    expect(orderMove(state, unit.id, to.index).ok).toBe(true);
    expect(unit.tileIndex).toBe(to.index);
    expect(unit.movesLeft).toBe(0); // river ate all MP

    // mountains are impassable to paths
    const blocked = tileAtCoords(state.map, 11, 8);
    blocked.elevation = 'MOUNTAIN';
    expect(findPath(state, unit, blocked.index)).toBeNull();
  });

  it('multi-turn moves continue on end turn', () => {
    const { state } = unitsState();
    const unit = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 8, 8).index)!;
    const far = tileAtCoords(state.map, 14, 8);
    expect(orderMove(state, unit.id, far.index).ok).toBe(true);
    expect(unit.tileIndex).not.toBe(far.index); // 2 MP can't get there
    let guard = 0;
    while (unit.tileIndex !== far.index && guard++ < 10) endTurn(state);
    expect(unit.tileIndex).toBe(far.index);
    expect(unit.path).toBeNull();
  });

  it('one civilian per tile', () => {
    const { state } = unitsState();
    const spot = tileAtCoords(state.map, 8, 8).index;
    const a = spawnUnit(state, 'BUILDER', spot)!;
    expect(tileFreeForUnit(state, a.tileIndex)).toBe(false);
    const b = spawnUnit(state, 'BUILDER', spot)!;
    expect(b.tileIndex).not.toBe(a.tileIndex); // pushed to a neighbor
  });
});

describe('builders', () => {
  it('units mode blocks free improvements and requires builder charges', () => {
    const { state, city } = unitsState();
    const farmTile = tileAtCoords(state.map, 9, 8);
    expect(placeImprovement(state, farmTile.index, 'FARM').ok).toBe(false); // units mode

    expect(queueUnit(state, city.id, 'BUILDER').ok).toBe(true);
    let guard = 0;
    while (state.units.length === 0 && guard++ < 40) endTurn(state);
    const builder = state.units[0];
    expect(builder).toBeDefined();

    // walk to the farm tile, then build
    orderMove(state, builder.id, farmTile.index);
    let g2 = 0;
    while (builder.tileIndex !== farmTile.index && g2++ < 5) endTurn(state);
    expect(builderImprove(state, builder.id, 'FARM').ok).toBe(true);
    expect(farmTile.improvement).toBe('FARM');
    expect(builder.charges).toBe(2);
  });

  it('a builder disbands on its last charge; chopping works', () => {
    const { state } = unitsState();
    state.research.techs.push('MINING'); // unlock chops
    const woods = tileAtCoords(state.map, 9, 8);
    woods.feature = 'WOODS';
    const builder = spawnUnit(state, 'BUILDER', woods.index)!;
    builder.tileIndex = woods.index;
    builder.charges = 1;
    expect(builderRemoveFeature(state, builder.id).ok).toBe(true);
    expect(woods.feature).toBeNull();
    expect(state.units.length).toBe(0); // spent its last charge
  });

  it('sandbox trains instantly and still allows free improvements', () => {
    const { state, city } = unitsState();
    state.sandbox = true;
    expect(queueUnit(state, city.id, 'BUILDER').ok).toBe(true);
    expect(state.units.length).toBe(1);
    expect(placeImprovement(state, tileAtCoords(state.map, 9, 8).index, 'FARM').ok).toBe(true);
  });

  it('unit maintenance is wired (builders are free)', () => {
    const { state } = unitsState();
    spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 8, 8).index);
    expect(unitMaintenance(state)).toBe(0);
  });
});
