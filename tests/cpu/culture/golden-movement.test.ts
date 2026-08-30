import { seatOf } from '../../../cpu/core/seats';
import { MP_SCALE } from '../../../cpu/data/constants';
import { describe, it, expect } from 'vitest';
import { BARB_SEAT } from '../../../cpu/core/seats';
import { createGame, endTurn } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';
import { spawnUnit, refreshUnits, unitFullMoves } from '../../../cpu/core/units';
import { GOLDEN_MOVE_BONUS, DED_MONUMENTALITY, DED_EXODUS, DED_FREE_INQUIRY } from '../../../cpu/data/seats';
import { goldenBoostBonus } from '../../../cpu/core/eras';
import { effectiveResearchCostIn } from '../../../cpu/core/boosts';
import { TECHS } from '../../../cpu/data/techs';
import { UNITS } from '../../../cpu/data/units';
import type { GameState, Unit } from '../../../cpu/core/types';

// — the MOVEMENT half of the golden dedications.
//
// SOURCE (Civilopedia, Gathering Storm):
//   MONUMENTALITY: "If chosen at the start of a Golden Age, +2 Movement for
//     all Builders."
//   EXODUS OF THE EVANGELISTS: "If chosen at the start of a Golden Age, +2
//     Movement for all Missionaries, Apostles, and Inquisitors." (no
//     INQUISITOR in this roster).
//
// MP is one resident pool with one reset rule and one step contract on both
// engines, so the bonus has exactly one home each side. Model it twice and the
// off-script gate diverges on the rng DRAW COUNT, not on a yield.
// The GPU twin is gpu/golden_move_test.py.
//
// Every case has its negative twin, so the suite cannot pass by granting
// everyone +2.

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

/** Put `civ` into a Golden age committed to `kind`. */
function golden(state: GameState, civ: number, kind: number): void {
  seatOf(state, civ)!.age = 2;
  seatOf(state, civ)!.dedicationPicks = [kind];
}

function place(state: GameState, type: string, seat: number): Unit {
  const home = seatOf(state, 0)!.cities[0].centerIndex;
  const u = spawnUnit(state, type, home, seat);
  expect(u).toBeTruthy();
  return u!;
}

describe('golden movement dedications', () => {
  it('grants nothing outside a Golden age', () => {
    const state = newGame();
    const b = place(state, 'BUILDER', 0);
    const m = place(state, 'MISSIONARY', 1);
    expect(unitFullMoves(state, b)).toBe(MP_SCALE * UNITS.BUILDER.moves);
    expect(unitFullMoves(state, m)).toBe(MP_SCALE * UNITS.MISSIONARY.moves);
  });

  it('MONUMENTALITY lifts Builders — for a civ seat exactly as for seat 0', () => {
    const state = newGame();
    golden(state, 0, DED_MONUMENTALITY);
    golden(state, 1, DED_MONUMENTALITY);
    const pb = place(state, 'BUILDER', 0);
    const rb = place(state, 'BUILDER', 1);
    const rw = place(state, 'WARRIOR', 1);
    const rm = place(state, 'MISSIONARY', 1);
    expect(unitFullMoves(state, pb)).toBe(MP_SCALE * (UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS));
    expect(unitFullMoves(state, rb)).toBe(MP_SCALE * (UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS));
    expect(unitFullMoves(state, rw)).toBe(MP_SCALE * UNITS.WARRIOR.moves);
    expect(unitFullMoves(state, rm)).toBe(MP_SCALE * UNITS.MISSIONARY.moves);
  });

  it('EXODUS lifts Missionaries and Apostles, not Builders', () => {
    const state = newGame();
    golden(state, 1, DED_EXODUS);
    const m = place(state, 'MISSIONARY', 1);
    const a = place(state, 'APOSTLE', 1);
    const b = place(state, 'BUILDER', 1);
    expect(unitFullMoves(state, m)).toBe(MP_SCALE * (UNITS.MISSIONARY.moves + GOLDEN_MOVE_BONUS));
    expect(unitFullMoves(state, a)).toBe(MP_SCALE * (UNITS.APOSTLE.moves + GOLDEN_MOVE_BONUS));
    expect(unitFullMoves(state, b)).toBe(MP_SCALE * UNITS.BUILDER.moves);
  });

  it('a NORMAL age holding the same dedication pays nothing', () => {
    const state = newGame();
    golden(state, 1, DED_EXODUS);
    const m = place(state, 'MISSIONARY', 1);
    expect(unitFullMoves(state, m)).toBe(MP_SCALE * (UNITS.MISSIONARY.moves + GOLDEN_MOVE_BONUS));
    seatOf(state, 1)!.age = 1;
    expect(unitFullMoves(state, m)).toBe(MP_SCALE * UNITS.MISSIONARY.moves);
  });

  it('barbarians hold no dedications', () => {
    const state = newGame();
    for (const s of state.seats) golden(state, s.seat, DED_MONUMENTALITY); // every MAJOR golden
    const b = place(state, 'BUILDER', BARB_SEAT);
    expect(unitFullMoves(state, b)).toBe(MP_SCALE * UNITS.BUILDER.moves);
  });

  it('an embarked unit keeps the flat embark pool', () => {
    const state = newGame();
    golden(state, 1, DED_MONUMENTALITY);
    const b = place(state, 'BUILDER', 1);
    expect(unitFullMoves(state, b)).toBe(MP_SCALE * (UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS));
    b.embarked = true;
    // embarkation speed is not a unit's own movement, so the dedication drops
    expect(unitFullMoves(state, b)).toBeLessThan(MP_SCALE * (UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS));
  });

  it('a unit trained during the Golden age starts on the raised pool', () => {
    const state = newGame();
    golden(state, 0, DED_MONUMENTALITY);
    const b = place(state, 'BUILDER', 0);
    expect(b.movesLeft).toBe(MP_SCALE * (UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS));
  });

  it('refreshUnits grants the raised pool and records it as movesFull', () => {
    const state = newGame();
    golden(state, 0, DED_MONUMENTALITY);
    const b = place(state, 'BUILDER', 0);
    b.movesLeft = 0;
    refreshUnits(state);
    expect(b.movesLeft).toBe(MP_SCALE * (UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS));
    expect(b.movesFull).toBe(b.movesLeft);
  });
});

// ---------------------------------------------------------------------------
// The golden faces are CALL-SITE tests: the helpers are civ-keyed, so what
// these pin is WHO each call site asks about. A hardcoded seat here hands one
// civ's research discount, prophet points and culture to another.
// ---------------------------------------------------------------------------

describe('golden dedications reach the civ that committed them', () => {
  function civRun(kind: number | null, turns: number): GameState {
    const state = newGame();
    if (kind !== null) golden(state, 1, kind);
    for (let t = 0; t < turns; t++) {
      if (kind !== null) golden(state, 1, kind); // survive era boundaries
      endTurn(state);
    }
    return state;
  }

  it('EXODUS pays a CIV SEAT +4 Great Prophet points a turn', () => {
    const T = 6;
    const withDed = civRun(DED_EXODUS, T);
    const without = civRun(null, T);
    const a = withDed.seats.slice(1)[0].gpp.PROPHET ?? 0;
    const b = without.seats.slice(1)[0].gpp.PROPHET ?? 0;
    expect(a - b).toBe(4 * T);
  });

  it('FREE_INQUIRY discounts a CIV SEAT boosted tech by an extra 10%', () => {
    const state = newGame();
    const civ = state.seats.slice(1)[0];
    const id = civ.research.techs.length ? null : Object.keys(TECHS)[0];
    expect(id).toBeTruthy();
    civ.research.boosted.push(id!);
    const base = TECHS[id!].cost;
    const plain = effectiveResearchCostIn(civ.research, id!, base);
    golden(state, 1, DED_FREE_INQUIRY);
    const g = goldenBoostBonus(state, 1, false);
    expect(g).toBeGreaterThan(0);
    expect(effectiveResearchCostIn(civ.research, id!, base, g)).toBeLessThan(plain);
    // ...and SEAT 0's Golden age does not pay for the civ
    const other = newGame();
    golden(other, 0, DED_FREE_INQUIRY);
    expect(goldenBoostBonus(other, 1, false)).toBe(0);
  });
});
