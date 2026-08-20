import { seatOf } from '../../../cpu/core/seats';
import { describe, it, expect } from 'vitest';
import { BARB_SEAT } from '../../../cpu/core/seats';
import { createGame } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';
import { spawnUnit, refreshUnits } from '../../../cpu/core/units';
import { generalAuraMP, GENERAL_AURA_MP, inGeneralAura } from '../../../cpu/core/aura';
import { hexDistance } from '../../../world/hex';
import { isImpassable, isWater } from '../../../world/query';
import { UNITS, UNIT_HP } from '../../../cpu/data/units';
import type { GameState } from '../../../cpu/core/types';

// The MOVEMENT half of the Great General aura, and the
// Unit.movesFull bookkeeping it forced. Civ 6's rule is "if you have used any
// movement points during a turn, the unit will not start healing until the next
// turn", so the heal / fortify gates must compare against what the unit was
// GRANTED, not against its type's base moves — the aura makes the granted pool
// vary per turn. (the GPU asks it the same way, off the same two
// numbers — it kept a parallel `acted` boolean until the two were proven
// identical and the boolean was deleted.)

function newGame(): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 0, opponents: 1,
  });
  settleFirstCity(state, 0);
  state.autoResearch = false;
  return state;
}

/** A free, spawnable LAND tile at exactly `dist` from `ctr`. */
function tileAt(state: GameState, ctr: number, dist: number): number {
  const c = state.map.tiles[ctr];
  for (const t of state.map.tiles) {
    if (t.index === ctr) continue;
    if (isWater(t) || isImpassable(t)) continue; // land units cannot spawn here
    if (hexDistance(c.col, c.row, t.col, t.row) !== dist) continue;
    if (state.units.some((u) => u.tileIndex === t.index)) continue;
    return t.index;
  }
  return -1;
}

describe('general aura: +1 movement', () => {
  it('grants +1 MP inside the aura and nothing outside it', () => {
    const state = newGame();
    const ctr = seatOf(state, 0)!.cities[0].centerIndex;
    const near = tileAt(state, ctr, 1);
    const far = tileAt(state, ctr, 5);
    const warriorIn = spawnUnit(state, 'WARRIOR', near, 0)!;
    const warriorOut = spawnUnit(state, 'WARRIOR', far, 0)!;
    const base = UNITS.WARRIOR.moves ?? 2;

    expect(generalAuraMP(state, warriorIn)).toBe(0); // no general yet
    spawnUnit(state, 'GENERAL', ctr, 0);

    expect(generalAuraMP(state, warriorIn)).toBe(GENERAL_AURA_MP);
    expect(generalAuraMP(state, warriorOut)).toBe(0);

    refreshUnits(state);
    expect(warriorIn.movesFull).toBe(base + GENERAL_AURA_MP);
    expect(warriorIn.movesLeft).toBe(base + GENERAL_AURA_MP);
    expect(warriorOut.movesFull).toBe(base);
    expect(warriorOut.movesLeft).toBe(base);
  });

  it('never reaches civilians (the general itself included)', () => {
    const state = newGame();
    const ctr = seatOf(state, 0)!.cities[0].centerIndex;
    const gen = spawnUnit(state, 'GENERAL', ctr, 0)!;
    const builder = spawnUnit(state, 'BUILDER', tileAt(state, ctr, 1), 0)!;
    expect(inGeneralAura(state, gen, gen.tileIndex)).toBe(false);
    expect(generalAuraMP(state, builder)).toBe(0);
  });

  it('an aura unit that SPENT MP does not heal; one that sat still does', () => {
    const state = newGame();
    const ctr = seatOf(state, 0)!.cities[0].centerIndex;
    spawnUnit(state, 'GENERAL', ctr, 0);
    const moved = spawnUnit(state, 'WARRIOR', tileAt(state, ctr, 1), 0)!;
    const still = spawnUnit(state, 'WARRIOR', tileAt(state, ctr, 2), 0)!;
    refreshUnits(state); // both granted base+1, movesFull recorded
    const granted = moved.movesFull!;
    expect(granted).toBe((UNITS.WARRIOR.moves ?? 2) + GENERAL_AURA_MP);

    moved.hp = 50;
    still.hp = 50;
    moved.movesLeft = granted - 1; // spent one point this turn
    // `still` keeps its full granted pool — it never moved.

    refreshUnits(state);
    // The heal gate must read movesFull, not the type's base moves: a unit
    // granted an aura bonus and then moved once still sits at base, and would
    // heal as though it had stood still all turn.
    expect(moved.hp).toBe(50);
    expect(still.hp).toBeGreaterThan(50);
  });

  it('fortify accrues only for the unit that spent nothing', () => {
    const state = newGame();
    const ctr = seatOf(state, 0)!.cities[0].centerIndex;
    spawnUnit(state, 'GENERAL', ctr, 0);
    const moved = spawnUnit(state, 'WARRIOR', tileAt(state, ctr, 1), 0)!;
    const still = spawnUnit(state, 'WARRIOR', tileAt(state, ctr, 2), 0)!;
    refreshUnits(state);
    moved.movesLeft = moved.movesFull! - 1;
    refreshUnits(state);
    expect(moved.fortifyTurns).toBe(0);
    expect(still.fortifyTurns).toBe(2); // one per refresh, capped at 2
  });

  // A NAVAL unit never digs in (real Civ 6 has no naval
  // fortify), and that now matters for BARBARIANS too — coastal camps field
  // GALLEY/QUADRIREME raiders. The GPU's barb pool was missing this gate, so
  // every idle hull collected +6 defense TS never granted it.
  it('a naval unit never fortifies — barbarian hulls included', () => {
    const state = newGame();
    const ctr = seatOf(state, 0)!.cities[0].centerIndex;
    const water = state.map.tiles[tileAt(state, ctr, 1)];
    water.terrain = 'COAST';
    const hull = spawnUnit(state, 'GALLEY', water.index, BARB_SEAT)!;
    const land = spawnUnit(state, 'WARRIOR', tileAt(state, ctr, 2), BARB_SEAT)!;
    refreshUnits(state);
    refreshUnits(state);
    refreshUnits(state);
    expect(hull.fortifyTurns ?? 0).toBe(0);
    expect(land.fortifyTurns).toBe(2); // the land control: same idleness, digs in
  });

  it('units that never refreshed fall back to their base moves (no NaN gate)', () => {
    const state = newGame();
    const w = spawnUnit(state, 'WARRIOR', tileAt(state, seatOf(state, 0)!.cities[0].centerIndex, 3), 0)!;
    expect(w.movesFull).toBeUndefined();
    w.hp = UNIT_HP - 20;
    refreshUnits(state); // `?? full` path
    expect(w.hp).toBeGreaterThan(UNIT_HP - 20);
    expect(w.movesFull).toBe(UNITS.WARRIOR.moves ?? 2);
  });
});
