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
import { spawnUnit, stepUnit, escortUnit, breakEscort, inEscort, escortRiders, unitDomain, unitIsNoncombat, unitIsMilitary, tileFreeForUnit, unitsAt } from '../../../cpu/core/units';
import { convoyCS } from '../../../cpu/core/combat';
import { promoRows } from '../../../cpu/data/promotions';
import { UNITS } from '../../../cpu/data/units';
import { neighbors, tilesWithin, hexDistance } from '../../../world/hex';
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

// ---------------------------------------------------------------------------
// A DRAGGED RIDER LIFTS ITS OWN FOG.
//
// CIV6: sight belongs to a UNIT, and a formation's members all stand on the
// same tile — so a Drone (BaseSightRange 5) escorted by a Warrior (2) sees
// five tiles out from wherever the Warrior walks. The engine used to reveal at
// the MOVER's sight alone, which threw the Drone's whole purpose away.
// ---------------------------------------------------------------------------
describe('the rider\u2019s sight', () => {
  const seen = (state: GameState, tile: number): boolean =>
    (state.seats[SEAT].explored ?? [])[tile] === 1;

  function ridingScene(riderType: string): { state: GameState; from: number; to: number } {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.fogOfWar = true;
    for (const sx of state.seats) sx.explored = state.map.tiles.map(() => 0);
    const [from, to] = twoAdjacent(state);
    put(state, from, 'WARRIOR');
    const rider = put(state, from, riderType);
    expect(escortUnit(state, rider).ok).toBe(true);
    // spawning already lit the Drone's own circle, and `from` is adjacent to
    // `to` — so the map goes dark again and only the STEP may light it.
    for (const sx of state.seats) sx.explored = state.map.tiles.map(() => 0);
    return { state, from, to };
  }

  it('carries the DRONE\u2019s five tiles, not the Warrior\u2019s two', () => {
    // the chassis columns are the install's, and they are what makes the
    // difference visible at all
    expect(UNITS.DRONE.sight).toBe(5);
    expect(UNITS.OBSERVATION_BALLOON.sight).toBe(3);

    const { state, to } = ridingScene('DRONE');
    const mover = state.units.find((u) => u.type === 'WARRIOR')!;
    const centre = state.map.tiles[to];
    const ring = (n: number) => tilesWithin(state.map, centre.col, centre.row, n)
      .filter((t) => hexDistance(t.col, t.row, centre.col, centre.row) === n);
    const far = ring(4);
    expect(far.length).toBeGreaterThan(0);
    // dark BEFORE the step — otherwise the assertion below proves nothing
    expect(far.every((t) => !seen(state, t.index))).toBe(true);
    expect(stepUnit(state, mover, state.map.tiles[to])).not.toBe('blocked');
    expect(far.some((t) => seen(state, t.index))).toBe(true);
  });

  it('reveals only the Warrior\u2019s own circle with a Builder aboard', () => {
    const { state, to } = ridingScene('BUILDER');
    const mover = state.units.find((u) => u.type === 'WARRIOR')!;
    expect(stepUnit(state, mover, state.map.tiles[to])).not.toBe('blocked');
    const centre = state.map.tiles[to];
    const far = tilesWithin(state.map, centre.col, centre.row, 4)
      .filter((t) => hexDistance(t.col, t.row, centre.col, centre.row) === 3);
    // a Builder sees no further than its escort, so the third ring stays dark
    expect(far.some((t) => seen(state, t.index))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THREE TO A TILE.
//
// CIV6 (Units.xml): nine chassis carry `FormationClass="FORMATION_CLASS_SUPPORT"`
// and hold a stacking slot of their own, so one plot carries a military unit,
// a civilian AND one of them — which is Civ 6's three-member formation and
// what `escortRiders`' own comment has always described.
// ---------------------------------------------------------------------------
describe('the support stacking class', () => {
  it('is its own slot, and the nine install rows carry it', () => {
    for (const id of ['BATTERING_RAM', 'SIEGE_TOWER', 'MILITARY_ENGINEER', 'MEDIC',
      'OBSERVATION_BALLOON', 'ANTI_AIR_GUN', 'MOBILE_SAM', 'DRONE', 'SUPPLY_CONVOY']) {
      expect(UNITS[id].support).toBe(true);
      expect(unitDomain(id)).toBe('support');
      // ...and every rule that asked "is this a fighter" still says no
      expect(unitIsNoncombat(id)).toBe(true);
      expect(unitIsMilitary(id)).toBe(false);
    }
    expect(unitDomain('BUILDER')).toBe('civilian');
    expect(unitDomain('WARRIOR')).toBe('military');
  });

  it('lets a military unit, a civilian and a support chassis share one plot', () => {
    const state = makeState(makeMap(10, 10));
    const [a] = twoAdjacent(state);
    put(state, a, 'WARRIOR');
    put(state, a, 'BUILDER');
    // the Ram could not stand here before: it held the civilian slot
    expect(tileFreeForUnit(state, a, SEAT, { type: 'BATTERING_RAM', seat: SEAT })).toBe(true);
    put(state, a, 'BATTERING_RAM');
    expect(unitsAt(state, a)).toHaveLength(3);
    // ...and a SECOND of any one class still cannot
    expect(tileFreeForUnit(state, a, SEAT, { type: 'MEDIC', seat: SEAT })).toBe(false);
    expect(tileFreeForUnit(state, a, SEAT, { type: 'SETTLER', seat: SEAT })).toBe(false);
  });

  it('forms with one rider of EACH class, and refuses a second of one', () => {
    const state = makeState(makeMap(10, 10));
    const [a] = twoAdjacent(state);
    put(state, a, 'WARRIOR');
    const bld = put(state, a, 'BUILDER');
    const ram = put(state, a, 'BATTERING_RAM');
    expect(escortUnit(state, bld).ok).toBe(true);
    expect(escortUnit(state, ram).ok).toBe(true);
    const war = state.units.find((u) => u.type === 'WARRIOR')!;
    expect(escortRiders(state, war)).toHaveLength(2);
    // a second civilian cannot even stand here, so the class cap is the
    // stacking rule's — what this pins is that the FORMATION took both.
    expect(inEscort(state, bld)).toBe(true);
    expect(inEscort(state, ram)).toBe(true);
  });

  it('drags BOTH riders when the escort steps', () => {
    const state = makeState(makeMap(10, 10));
    const [a, b] = twoAdjacent(state);
    const war = put(state, a, 'WARRIOR');
    const bld = put(state, a, 'BUILDER');
    const ram = put(state, a, 'BATTERING_RAM');
    expect(escortUnit(state, bld).ok).toBe(true);
    expect(escortUnit(state, ram).ok).toBe(true);
    const mpB = bld.movesLeft;
    const mpR = ram.movesLeft;
    expect(stepUnit(state, war, state.map.tiles[b])).not.toBe('blocked');
    // the whole formation lands together, and every member pays for it
    expect(war.tileIndex).toBe(b);
    expect(bld.tileIndex).toBe(b);
    expect(ram.tileIndex).toBe(b);
    expect(bld.movesLeft).toBeLessThan(mpB);
    expect(ram.movesLeft).toBeLessThan(mpR);
  });
});
