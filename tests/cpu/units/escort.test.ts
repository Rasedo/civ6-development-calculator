/**
 * THE ESCORT FORMATION.
 *
 * CIV6 (Formations): "A military unit can create a formation with a support or
 * civilian unit at any time"; the formation's Movement "is equal to that of
 * the slowest unit that belongs to it", and the pair moves as one until it is
 * broken. CIV6 (Escort Mobility, Light Cavalry): "Formation units all inherit
 * escort's Movement speed."
 *
 * The engine already seats one military and one civilian unit to a tile, so
 * the formation is a LINK rather than a stack: the civilian carries the flag
 * and the tile names its escort.
 */
import { describe, it, expect } from 'vitest';
import { MP_SCALE } from '../../../cpu/data/constants';
import { makeMap, makeState } from '../helpers';
import { spawnUnit, stepUnit, escortUnit, breakEscort, inEscort } from '../../../cpu/core/units';
import { convoyCS } from '../../../cpu/core/combat';
import { promoRows } from '../../../cpu/data/promotions';
import { neighbors } from '../../../world/hex';
import { isWater, isImpassable } from '../../../world/query';
import type { GameState, Unit } from '../../../cpu/core/types';

const SEAT = 0;

function twoAdjacent(state: GameState): [number, number] {
  const ok = (i: number) => {
    const tl = state.map.tiles[i];
    return !!tl && !isWater(tl) && !isImpassable(tl);
  };
  for (let t = 0; t < state.map.tiles.length; t++) {
    if (!ok(t)) continue;
    for (const nb of neighbors(state.map, state.map.tiles[t])) {
      if (nb && ok(nb.index)) return [t, nb.index];
    }
  }
  throw new Error('no adjacent land pair');
}

/** `spawnUnit` places NEAR the index it is given; these lanes need the tile. */
function put(state: GameState, tile: number, type: string, over: Partial<Unit> = {}): Unit {
  const u = spawnUnit(state, type, tile, SEAT)!;
  expect(u).toBeTruthy();
  Object.assign(u, { tileIndex: tile, movesLeft: 2 * MP_SCALE, movesFull: 2 * MP_SCALE, ...over });
  return u;
}

const MOBILITY_COL = promoRows('LIGHT_CAV').findIndex((p) => p.id === 'ESCORT_MOBILITY');

describe('the escort formation', () => {
  it('forms only with an own military unit on the same tile', () => {
    const state = makeState(makeMap(8, 8));
    const [a] = twoAdjacent(state);
    const bld = put(state, a, 'BUILDER');

    expect(escortUnit(state, bld).ok).toBe(false); // nobody to escort it
    const war = put(state, a, 'WARRIOR');
    expect(escortUnit(state, war).ok).toBe(false); // a military unit is the escort, not the rider

    war.seat = SEAT + 1;
    expect(escortUnit(state, bld).ok).toBe(false); // a foreign unit escorts nobody
    war.seat = SEAT;
    expect(escortUnit(state, bld).ok).toBe(true);
    expect(inEscort(state, bld)).toBe(true);
    expect(escortUnit(state, bld).ok).toBe(false); // and only once
  });

  it('holds the rider still and lets the break free it', () => {
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    const bld = put(state, a, 'BUILDER');
    put(state, a, 'WARRIOR');
    expect(escortUnit(state, bld).ok).toBe(true);

    expect(stepUnit(state, bld, state.map.tiles[b])).toBe('blocked');
    expect(bld.tileIndex).toBe(a);

    expect(breakEscort(bld).ok).toBe(true);
    expect(inEscort(state, bld)).toBe(false);
    expect(stepUnit(state, bld, state.map.tiles[b])).not.toBe('blocked');
    expect(bld.tileIndex).toBe(b);
  });

  it('drags the rider along, and both pay', () => {
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    const bld = put(state, a, 'BUILDER');
    const war = put(state, a, 'WARRIOR');
    expect(escortUnit(state, bld).ok).toBe(true);
    const mp0 = bld.movesLeft;

    expect(stepUnit(state, war, state.map.tiles[b])).not.toBe('blocked');
    expect(war.tileIndex).toBe(b);
    expect(bld.tileIndex).toBe(b);
    expect(bld.movesLeft).toBeLessThan(mp0);
    expect(bld.escorted).toBe(true);
  });

  // "A formation's Movement is equal to that of the slowest unit that belongs
  // to it" — a rider with nothing left stops the escort where it stands.
  it('goes no further than its slowest member', () => {
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    const bld = put(state, a, 'BUILDER', { movesLeft: 0 });
    const war = put(state, a, 'WARRIOR');
    expect(escortUnit(state, bld).ok).toBe(true);

    expect(stepUnit(state, war, state.map.tiles[b])).toBe('cantAfford');
    expect(war.tileIndex).toBe(a);
    expect(bld.tileIndex).toBe(a);

    expect(breakEscort(bld).ok).toBe(true);
    expect(stepUnit(state, war, state.map.tiles[b])).not.toBe('blocked');
    expect(war.tileIndex).toBe(b);
  });

  it('Escort Mobility carries the rider free of its own pool', () => {
    expect(MOBILITY_COL).toBeGreaterThanOrEqual(0);
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    const bld = put(state, a, 'BUILDER', { movesLeft: 0 });
    const hor = put(state, a, 'HORSEMAN', { promos: 1 << MOBILITY_COL });
    expect(escortUnit(state, bld).ok).toBe(true);

    expect(stepUnit(state, hor, state.map.tiles[b])).not.toBe('blocked');
    expect(hor.tileIndex).toBe(b);
    expect(bld.tileIndex).toBe(b);
    expect(bld.movesLeft).toBe(0);
  });

  // CIV6 (Formations): "Naval military units may also create a formation with
  // embarked land units"; (Convoy, Naval Melee): "+10 Combat Strength when in a
  // formation" — the escort formation, so the term rides the HULL.
  it('a hull forms with its passenger, and Convoy pays the hull', () => {
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    for (const i of [a, b]) state.map.tiles[i].terrain = 'COAST';
    for (const id of ['SAILING', 'SHIPBUILDING', 'CARTOGRAPHY']) {
      state.seats[SEAT].research.techs.push(id);
    }
    const hull = put(state, a, 'GALLEY');
    const rider = put(state, a, 'WARRIOR', { embarked: true });
    const col = promoRows('NAVAL_MELEE').findIndex((p) => p.id === 'CONVOY');
    expect(col).toBeGreaterThanOrEqual(0);
    hull.promos = 1 << col;

    expect(convoyCS(state, hull)).toBe(0);      // it carries nobody yet
    expect(escortUnit(state, rider).ok).toBe(true);
    expect(convoyCS(state, hull)).toBe(10);
    expect(convoyCS(state, rider)).toBe(0);     // the carried unit is not the escort

    expect(stepUnit(state, hull, state.map.tiles[b])).not.toBe('blocked');
    expect(hull.tileIndex).toBe(b);
    expect(rider.tileIndex).toBe(b);
    expect(rider.embarked).toBe(true);
  });

  it('a flag with no escort beside it is no formation', () => {
    const state = makeState(makeMap(8, 8));
    const [a, b] = twoAdjacent(state);
    const bld = put(state, a, 'BUILDER', { escorted: true });
    expect(inEscort(state, bld)).toBe(false);
    expect(stepUnit(state, bld, state.map.tiles[b])).not.toBe('blocked');
    expect(bld.tileIndex).toBe(b);
  });
});
