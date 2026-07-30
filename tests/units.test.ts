import { describe, it, expect } from 'vitest';
import { playerSeat } from '../src/core/seats';
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
  walkPath,
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
    // B-23 (#71): moveCostInto now takes the tile being LEFT as well. Passing
    // the same tile keeps these terrain assertions (no road on either end).
    expect(moveCostInto(t, t)).toBe(1);
    t.elevation = 'HILLS';
    expect(moveCostInto(t, t)).toBe(2);
    t.feature = 'WOODS';
    expect(moveCostInto(t, t)).toBe(3);
    // B-23 (#71): a ROAD-to-ROAD step ignores the terrain penalty entirely.
    const from = tileAtCoords(map, 5, 6);
    from.road = true;
    t.road = true;
    expect(moveCostInto(from, t)).toBe(1);
    // ...but a road on only ONE end does nothing (real Civ 6).
    from.road = false;
    expect(moveCostInto(from, t)).toBe(3);
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

  it('steps need the full MP cost, except one step from full MP (D-3/D-4)', () => {
    const { state } = unitsState();
    const start = tileAtCoords(state.map, 8, 10);
    const mid = tileAtCoords(state.map, 9, 10);
    const hills = tileAtCoords(state.map, 10, 10);
    for (const t of [start, mid, hills]) {
      t.elevation = 'FLAT';
      t.feature = null;
    }
    hills.elevation = 'HILLS';

    const unit = spawnUnit(state, 'BUILDER', start.index)!;
    unit.tileIndex = start.index; // force exact tile
    unit.path = [mid.index, hills.index];
    walkPath(state, unit);
    // 2 MP: flat costs 1 (1 left); hills costs 2 > 1 and not at full — stop.
    expect(unit.tileIndex).toBe(mid.index);
    expect(unit.movesLeft).toBe(1);
    expect(unit.path).toEqual([hills.index]); // path survives for next turn

    unit.movesLeft = 2; // fresh turn
    walkPath(state, unit);
    expect(unit.tileIndex).toBe(hills.index);
    expect(unit.path).toBeNull();

    // Full-MP exception: a 5-cost step (hills + woods + river) is still one
    // legal step from full MP, and eats everything.
    mid.riverMask = 0b111111; // crossing is read off the FROM tile
    hills.feature = 'WOODS';
    const back = spawnUnit(state, 'WARRIOR', mid.index)!;
    back.tileIndex = mid.index;
    back.path = [hills.index];
    walkPath(state, back);
    expect(back.tileIndex).toBe(hills.index);
    expect(back.movesLeft).toBe(0);
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
    playerSeat(state).research.techs.push('MINING'); // unlock chops
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
