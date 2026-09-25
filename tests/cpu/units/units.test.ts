import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, orderUnit, stepThrough } from '../helpers';
import { foundCity, endTurn, serialize, deserialize } from '../../../cpu/core/game';
import { moveCostInto, crossesRiver, spawnUnit, builderCost, builderRemoveFeature, tileFreeForUnit, stepUnit, unitPassable } from '../../../cpu/core/units';
import { nextRandom } from '../../../cpu/core/rand';
import { commitProduction } from '../../../cpu/core/seatTurn';
import { getModifiers, unitUpkeep } from '../../../cpu/core/effects';
import { DIR_E } from '../../../world/hex';
import { MP_SCALE, RAILROAD_MP } from '../../../cpu/data/constants';

function unitsState() {
  const state = makeState(makeMap(16, 16));
  // The capital is placed BEFORE units mode goes live: with it on, `foundCity`
  // demands a settler standing on the tile, which is the real opening and not
  // what these lanes are about.
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
  state.unitsMode = true;
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
  it('terrain movement costs stack, and a route pays its own tier', () => {
    const map = makeMap();
    const state = makeState(map);
    const t = tileAtCoords(map, 5, 5);
    // MoveCostInto now takes the tile being LEFT as well. Passing
    // the same tile keeps these terrain assertions (no road on either end).
    expect(moveCostInto(state, t, t)).toBe(MP_SCALE);
    t.elevation = 'HILLS';
    expect(moveCostInto(state, t, t)).toBe(2 * MP_SCALE);
    t.feature = 'WOODS';
    expect(moveCostInto(state, t, t)).toBe(3 * MP_SCALE);
    // A ROUTE-to-ROUTE step ignores the terrain penalty entirely and pays the
    // world's road tier: CIV6 gives the Ancient and Classical road 1.0.
    const from = tileAtCoords(map, 5, 6);
    from.road = true;
    t.road = true;
    expect(moveCostInto(state, from, t)).toBe(MP_SCALE);
    // ...but a road on only ONE end does nothing (real Civ 6).
    from.road = false;
    expect(moveCostInto(state, from, t)).toBe(3 * MP_SCALE);
    from.road = true;
    // CIV6: Industrial Road 0.75, Modern Road 0.5.
    state.roadTier = 2;
    expect(moveCostInto(state, from, t)).toBe(3);
    state.roadTier = 3;
    expect(moveCostInto(state, from, t)).toBe(2);
    // CIV6 (Railroad): 0.25, and only where BOTH ends carry one.
    t.railroad = true;
    expect(moveCostInto(state, from, t)).toBe(2);
    from.railroad = true;
    expect(moveCostInto(state, from, t)).toBe(RAILROAD_MP);
  });

  it('river crossings end the turn; mountains are impassable', () => {
    const { state } = unitsState();
    const from = tileAtCoords(state.map, 8, 8);
    const to = tileAtCoords(state.map, 9, 8);
    from.riverMask = 1 << DIR_E;
    expect(crossesRiver(from, to)).toBe(true);

    const unit = spawnUnit(state, 'BUILDER', from.index, 0)!;
    unit.tileIndex = from.index; // force exact tile
    stepUnit(state, unit, to);
    expect(unit.tileIndex).toBe(to.index);
    expect(unit.movesLeft).toBe(0); // river ate all MP

    const blocked = tileAtCoords(state.map, 11, 8);
    blocked.elevation = 'MOUNTAIN';
    expect(unitPassable(blocked, unit)).toBe(false);
  });

  it('steps need the full MP cost, except one step from full MP', () => {
    const { state } = unitsState();
    const start = tileAtCoords(state.map, 8, 10);
    const mid = tileAtCoords(state.map, 9, 10);
    const hills = tileAtCoords(state.map, 10, 10);
    for (const t of [start, mid, hills]) {
      t.elevation = 'FLAT';
      t.feature = null;
    }
    hills.elevation = 'HILLS';

    const unit = spawnUnit(state, 'BUILDER', start.index, 0)!;
    unit.tileIndex = start.index; // force exact tile
    // 2 points: the flat step costs one (one left); the hills step costs two,
    // more than the one left and the unit is no longer at full — stop.
    expect(stepUnit(state, unit, mid)).toBe('moved');
    expect(stepUnit(state, unit, hills)).toBe('cantAfford');
    expect(unit.tileIndex).toBe(mid.index);
    expect(unit.movesLeft).toBe(MP_SCALE);

    unit.movesLeft = 2 * MP_SCALE; // fresh turn
    stepUnit(state, unit, hills);
    expect(unit.tileIndex).toBe(hills.index);

    // Full-MP exception: a 5-cost step (hills + woods + river) is still one
    // legal step from full MP, and eats everything.
    mid.riverMask = 0b111111; // crossing is read off the FROM tile
    hills.feature = 'WOODS';
    const back = spawnUnit(state, 'WARRIOR', mid.index, 0)!;
    back.tileIndex = mid.index;
    stepUnit(state, back, hills);
    expect(back.tileIndex).toBe(hills.index);
    expect(back.movesLeft).toBe(0);
  });

  it('one civilian per tile', () => {
    const { state } = unitsState();
    const spot = tileAtCoords(state.map, 8, 8).index;
    const a = spawnUnit(state, 'BUILDER', spot, 0)!;
    expect(tileFreeForUnit(state, a.tileIndex, 0)).toBe(false);
    const b = spawnUnit(state, 'BUILDER', spot, 0)!;
    expect(b.tileIndex).not.toBe(a.tileIndex); // pushed to a neighbor
  });
});

describe('builders', () => {
  it('a trained builder walks to the tile and spends a charge on its improvement', () => {
    const { state, city } = unitsState();
    const farmTile = tileAtCoords(state.map, 9, 8);

    commitProduction(state, 0, city, { kind: 'unit', unit: 'BUILDER', progress: 0, cost: builderCost(state, 0) });
    let guard = 0;
    // a barbarian scout can stand up before the Builder trains — pick by type
    while (!state.units.some((u) => u.type === 'BUILDER' && u.seat === 0) && guard++ < 40) endTurn(state);
    const builder = state.units.find((u) => u.type === 'BUILDER' && u.seat === 0)!;
    expect(builder).toBeDefined();

    // walk to the farm tile, then build
    stepThrough(state, builder, [farmTile.index]);
    builder.movesLeft = Math.max(builder.movesLeft, MP_SCALE); // the order is the next turn's
    orderUnit(state, builder, 'BUILD_FARM');
    expect(farmTile.improvement).toBe('FARM');
    expect(builder.charges).toBe(2);
  });

  it('a builder disbands on its last charge; chopping works', () => {
    const { state } = unitsState();
    seatOf(state, 0)!.research.techs.push('MINING'); // unlock chops
    const woods = tileAtCoords(state.map, 9, 8);
    woods.feature = 'WOODS';
    const builder = spawnUnit(state, 'BUILDER', woods.index, 0)!;
    builder.tileIndex = woods.index;
    builder.charges = 1;
    expect(builderRemoveFeature(state, builder.id, 0).ok).toBe(true);
    expect(woods.feature).toBeNull();
    expect(state.units.length).toBe(0); // spent its last charge
  });

  it('builders pay no upkeep', () => {
    const { state } = unitsState();
    expect(unitUpkeep(getModifiers(state, 0), 'BUILDER')).toBe(0);
  });
});
