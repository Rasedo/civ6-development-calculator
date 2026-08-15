import { civsAtWar, seatOf } from '../../../cpu/core/seats';
import { describe, it, expect } from 'vitest';
import { setWar, BARB_SEAT } from '../../../cpu/core/seats';
import { createGame } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';
import { spawnUnit, unitsHostile } from '../../../cpu/core/units';
import { routeRaidedAt } from '../../../cpu/core/trade';
import { hostileRangedStrike, attackTargets } from '../../../cpu/core/combat';
import { neighbors } from '../../../world/hex';
import type { GameState } from '../../../cpu/core/types';

// — a civ's war with another civ is a real war.
//
// Two mechanics ignored it, both written before made civ↔civ war
// exist, and both saying so in their own comments:
//
//   walls / Encampment STRIKE   filtered candidates with `!isCiv(u.seat)`
//   trade route RAIDING         a civ↔civ raid flag left permanently off
//
// The engines AGREED, so no gate caught it — it is a fidelity gap against
// Civ 6, where a city's strike picks its target by combat strength and a war
// suspends the enemy's trade regardless of who the enemy is.
//
// The GPU twin for the strike is tests/gpu/civ_pair_strike_test.py (it needs a walled
// civ city, which is a fixture-state poke). What is tested here is the
// PREDICATE both mechanics now share, plus the raid end to end.

function newGame(): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 771,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 0, opponents: 3,
  });
  settleFirstCity(state, 0);
  return state;
}

/** A land tile within 3 of `centre`, and one comfortably outside. */
function tilesNear(state: GameState, centre: number): { near: number; far: number } {
  const c = state.map.tiles[centre];
  const d = (t: { col: number; row: number }) =>
    Math.max(
      Math.abs(t.col - c.col),
      Math.abs(t.row - c.row),
      Math.abs(t.col - c.col + t.row - c.row),
    );
  const land = state.map.tiles.filter((t) => t.terrain !== 'OCEAN' && t.terrain !== 'COAST');
  const near = land.find((t) => d(t) >= 1 && d(t) <= 2)!;
  const far = land.find((t) => d(t) > 8)!;
  return { near: near.index, far: far.index };
}

describe('civ↔civ trade raiding', () => {
  it('an at-war CIV SEAT suspends another civ\'s route, exactly as seat 0 does', () => {
    const state = newGame();
    const centre = seatOf(state, 0)!.cities[0].centerIndex;
    const { near, far } = tilesNear(state, centre);
    const owner = 1;
    const raider = 2;

    const u = spawnUnit(state, 'WARRIOR', far, raider)!;
    expect(routeRaidedAt(state, [centre], owner)).toBe(false); // out of range

    u.tileIndex = near;
    expect(routeRaidedAt(state, [centre], owner)).toBe(false); // in range, at PEACE

    setWar(state, owner, raider, true);
    expect(routeRaidedAt(state, [centre], owner)).toBe(true); // in range, AT WAR

    setWar(state, owner, raider, false);
    expect(routeRaidedAt(state, [centre], owner)).toBe(false); // peace again
  });

  it('a barbarian raids with no war at all, and a THIRD civ at peace does not', () => {
    const state = newGame();
    const centre = seatOf(state, 0)!.cities[0].centerIndex;
    const { near, far } = tilesNear(state, centre);
    const owner = 1;

    const neutral = spawnUnit(state, 'WARRIOR', near, 3)!;
    expect(routeRaidedAt(state, [centre], owner)).toBe(false);

    // ...and the barbarian standing on the same tile does raid it (caps.alwaysHostile)
    neutral.tileIndex = far;
    spawnUnit(state, 'WARRIOR', near, BARB_SEAT);
    expect(routeRaidedAt(state, [centre], owner)).toBe(true);
  });

  it('a civ does not raid its OWN route', () => {
    const state = newGame();
    const centre = seatOf(state, 0)!.cities[0].centerIndex;
    const { near } = tilesNear(state, centre);
    const owner = 1;
    spawnUnit(state, 'WARRIOR', near, owner);
    expect(routeRaidedAt(state, [centre], owner)).toBe(false);
  });

  it('raiding needs a war, whichever pair of seats it is', () => {
    const state = newGame();
    const centre = seatOf(state, 0)!.cities[0].centerIndex;
    const { near } = tilesNear(state, centre);
    const raider = 1;
    spawnUnit(state, 'WARRIOR', near, raider);
    expect(routeRaidedAt(state, [centre], 0)).toBe(false);
    setWar(state, 0, raider, true);
    expect(routeRaidedAt(state, [centre], 0)).toBe(true);
  });
});

describe('war is a property of a PAIR of seats', () => {
  it('setWar writes both sides, and either orientation clears both', () => {
    const state = newGame();
    const a = 1;
    const b = 2;
    expect(civsAtWar(state, a, b)).toBe(false);
    setWar(state, a, b, true);
    expect(civsAtWar(state, a, b)).toBe(true);
    expect(civsAtWar(state, b, a)).toBe(true);
    expect(seatOf(state, a)!.wars).toContain(b);
    expect(seatOf(state, b)!.wars).toContain(a);
    setWar(state, b, a, false);
    expect(civsAtWar(state, a, b)).toBe(false);
    expect(seatOf(state, a)!.wars).not.toContain(b);
    expect(civsAtWar(state, a, a)).toBe(false); // a seat is never at war with itself
  });

  it('unitsHostile between two civs keys on that pair, not on which seat asks', () => {
    const state = newGame();
    const a = { seat: 1 };
    const b = { seat: 2 };
    expect(unitsHostile(state, a, b)).toBe(false);
    setWar(state, a.seat, b.seat, true);
    expect(unitsHostile(state, a, b)).toBe(true);
    expect(unitsHostile(state, b, a)).toBe(true);
    expect(unitsHostile(state, a, { seat: a.seat })).toBe(false); // same seat
  });

  it('a RANGED unit never strikes another civ unit — melee still lists it', () => {
    const state = newGame();
    setWar(state, 1, 2, true);
    const land = state.map.tiles.filter((t) => t.terrain !== 'OCEAN' && t.terrain !== 'COAST');
    const atkTile = land[0];
    const defTile = neighbors(state.map, atkTile).find((n) => n.terrain !== 'OCEAN' && n.terrain !== 'COAST')!;
    const atk = spawnUnit(state, 'ARCHER', atkTile.index, 1)!;
    const def = spawnUnit(state, 'WARRIOR', defTile.index, 2)!;
    expect(unitsHostile(state, atk, def)).toBe(true);
    const hp0 = def.hp;
    const mp0 = atk.movesLeft;
    hostileRangedStrike(state, atk, def.tileIndex);
    expect(def.hp).toBe(hp0);        // the ranged arm is a no-op against a civ
    expect(atk.movesLeft).toBe(mp0); // and costs nothing
    expect(attackTargets(state, atk)).not.toContain(def.tileIndex);
    const melee = spawnUnit(state, 'WARRIOR', atkTile.index, 1)!;
    expect(attackTargets(state, melee)).toContain(def.tileIndex);
  });
});
