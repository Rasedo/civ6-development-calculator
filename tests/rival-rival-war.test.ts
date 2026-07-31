import { describe, it, expect } from 'vitest';
import { civOfRival, setRivalWar, PLAYER_CIV, BARB_SEAT } from '../src/core/seats';
import { createGame, foundCity } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import { spawnUnit } from '../src/core/units';
import { routeRaidedAt } from '../src/core/trade';
import type { GameState } from '../src/core/types';

// #51/S7.1 (task #59) — a rival's war with another rival is a real war.
//
// Two mechanics ignored it, both written before A-19 made rival↔rival war
// exist, and both saying so in their own comments:
//
//   walls / Encampment STRIKE   filtered candidates with `!isRivalSeat(u.seat)`
//   trade route RAIDING         `RIVAL_RIVAL_RAIDS_LIVE = false`
//
// The engines AGREED, so no gate caught it — it is a fidelity gap against
// Civ 6, where a city's strike picks its target by combat strength and a war
// suspends the enemy's trade regardless of who the enemy is.
//
// The GPU twin for the strike is gpu/rr_strike_test.py (it needs a walled
// rival city, which is a fixture-state poke). What is tested here is the
// PREDICATE both mechanics now share, plus the raid end to end.

function newGame(): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 771,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 0, rivals: 3,
  });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
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

describe('#51/S7.1 (#59) rival↔rival trade raiding', () => {
  it('an at-war RIVAL suspends another rival\'s route, exactly as the player does', () => {
    const state = newGame();
    const centre = state.cities[0].centerIndex;
    const { near, far } = tilesNear(state, centre);
    const owner = civOfRival(0);
    const raider = civOfRival(1);

    const u = spawnUnit(state, 'WARRIOR', far, raider)!;
    expect(routeRaidedAt(state, [centre], owner)).toBe(false); // out of range

    u.tileIndex = near;
    expect(routeRaidedAt(state, [centre], owner)).toBe(false); // in range, at PEACE

    setRivalWar(state, owner, raider, true);
    expect(routeRaidedAt(state, [centre], owner)).toBe(true); // in range, AT WAR

    setRivalWar(state, owner, raider, false);
    expect(routeRaidedAt(state, [centre], owner)).toBe(false); // peace again
  });

  it('a barbarian raids with no war at all, and a THIRD rival at peace does not', () => {
    const state = newGame();
    const centre = state.cities[0].centerIndex;
    const { near, far } = tilesNear(state, centre);
    const owner = civOfRival(0);

    const neutral = spawnUnit(state, 'WARRIOR', near, civOfRival(2))!;
    expect(routeRaidedAt(state, [centre], owner)).toBe(false);

    // ...and the barbarian standing on the same tile does raid it (caps.alwaysHostile)
    neutral.tileIndex = far;
    spawnUnit(state, 'WARRIOR', near, BARB_SEAT);
    expect(routeRaidedAt(state, [centre], owner)).toBe(true);
  });

  it('a rival does not raid its OWN route', () => {
    const state = newGame();
    const centre = state.cities[0].centerIndex;
    const { near } = tilesNear(state, centre);
    const owner = civOfRival(0);
    spawnUnit(state, 'WARRIOR', near, owner);
    expect(routeRaidedAt(state, [centre], owner)).toBe(false);
  });

  it('the PLAYER arm is unchanged — a rival raids the player only at war', () => {
    const state = newGame();
    const centre = state.cities[0].centerIndex;
    const { near } = tilesNear(state, centre);
    const raider = civOfRival(0);
    spawnUnit(state, 'WARRIOR', near, raider);
    expect(routeRaidedAt(state, [centre], PLAYER_CIV)).toBe(false);
    setRivalWar(state, PLAYER_CIV, raider, true);
    expect(routeRaidedAt(state, [centre], PLAYER_CIV)).toBe(true);
  });
});
