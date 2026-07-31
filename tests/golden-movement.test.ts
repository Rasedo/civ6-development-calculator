import { describe, it, expect } from 'vitest';
import { PLAYER_CIV, BARB_SEAT, civOfRival, rivalsOf } from '../src/core/seats';
import { createGame, foundCity, endTurn } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import { spawnUnit, refreshUnits, unitFullMoves } from '../src/core/units';
import { GOLDEN_MOVE_BONUS, DED_MONUMENTALITY, DED_EXODUS, DED_FREE_INQUIRY } from '../src/data/rivals';
import { goldenBoostBonus } from '../src/core/eras';
import { effectiveResearchCostIn } from '../src/core/boosts';
import { TECHS } from '../src/data/techs';
import { UNITS } from '../src/data/units';
import type { GameState, Unit } from '../src/core/types';

// B-24 — the MOVEMENT half of the golden dedications.
//
// SOURCE (Civilopedia, Gathering Storm):
//   MONUMENTALITY: "If chosen at the start of a Golden Age, +2 Movement for
//     all Builders."
//   EXODUS OF THE EVANGELISTS: "If chosen at the start of a Golden Age, +2
//     Movement for all Missionaries, Apostles, and Inquisitors." (no
//     INQUISITOR in this roster).
//
// #79 shipped both, hunted them, and reverted: the off-script gate diverged on
// the rng DRAW COUNT because the two engines modelled movement points
// differently. #51/S5.1–S5.3 made MP one resident pool with one reset rule and
// one step contract on both engines, so the bonus now has exactly one home
// each side. The GPU twin is gpu/golden_move_test.py.
//
// Every case has its negative twin, so the suite cannot pass by granting
// everyone +2.

function newGame(): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 0, rivals: 1,
  });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  state.autoResearch = false;
  return state;
}

/** Put `civ` into a Golden age committed to `kind`. */
function golden(state: GameState, civ: number, kind: number): void {
  (state.civAges ??= [])[civ] = 2;
  (state.dedicationPicks ??= [])[civ] = [kind];
}

function place(state: GameState, type: string, seat: number): Unit {
  const home = state.cities[0].centerIndex;
  const u = spawnUnit(state, type, home, seat);
  expect(u).toBeTruthy();
  return u!;
}

describe('B-24 golden movement dedications', () => {
  it('grants nothing outside a Golden age', () => {
    const state = newGame();
    const b = place(state, 'BUILDER', PLAYER_CIV);
    const m = place(state, 'MISSIONARY', civOfRival(0));
    expect(unitFullMoves(state, b)).toBe(UNITS.BUILDER.moves);
    expect(unitFullMoves(state, m)).toBe(UNITS.MISSIONARY.moves);
  });

  it('MONUMENTALITY lifts Builders — for a rival exactly as for the player', () => {
    const state = newGame();
    golden(state, PLAYER_CIV, DED_MONUMENTALITY);
    golden(state, civOfRival(0), DED_MONUMENTALITY);
    const pb = place(state, 'BUILDER', PLAYER_CIV);
    const rb = place(state, 'BUILDER', civOfRival(0));
    const rw = place(state, 'WARRIOR', civOfRival(0));
    const rm = place(state, 'MISSIONARY', civOfRival(0));
    expect(unitFullMoves(state, pb)).toBe(UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS);
    expect(unitFullMoves(state, rb)).toBe(UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS);
    expect(unitFullMoves(state, rw)).toBe(UNITS.WARRIOR.moves);
    expect(unitFullMoves(state, rm)).toBe(UNITS.MISSIONARY.moves);
  });

  it('EXODUS lifts Missionaries and Apostles, not Builders', () => {
    const state = newGame();
    golden(state, civOfRival(0), DED_EXODUS);
    const m = place(state, 'MISSIONARY', civOfRival(0));
    const a = place(state, 'APOSTLE', civOfRival(0));
    const b = place(state, 'BUILDER', civOfRival(0));
    expect(unitFullMoves(state, m)).toBe(UNITS.MISSIONARY.moves + GOLDEN_MOVE_BONUS);
    expect(unitFullMoves(state, a)).toBe(UNITS.APOSTLE.moves + GOLDEN_MOVE_BONUS);
    expect(unitFullMoves(state, b)).toBe(UNITS.BUILDER.moves);
  });

  it('a NORMAL age holding the same dedication pays nothing', () => {
    const state = newGame();
    golden(state, civOfRival(0), DED_EXODUS);
    const m = place(state, 'MISSIONARY', civOfRival(0));
    expect(unitFullMoves(state, m)).toBe(UNITS.MISSIONARY.moves + GOLDEN_MOVE_BONUS);
    state.civAges![civOfRival(0)] = 1;
    expect(unitFullMoves(state, m)).toBe(UNITS.MISSIONARY.moves);
  });

  it('barbarians hold no dedications', () => {
    const state = newGame();
    for (let c = 0; c < 4; c++) golden(state, c, DED_MONUMENTALITY);
    const b = place(state, 'BUILDER', BARB_SEAT);
    expect(unitFullMoves(state, b)).toBe(UNITS.BUILDER.moves);
  });

  it('an embarked unit keeps the flat embark pool', () => {
    const state = newGame();
    golden(state, civOfRival(0), DED_MONUMENTALITY);
    const b = place(state, 'BUILDER', civOfRival(0));
    expect(unitFullMoves(state, b)).toBe(UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS);
    b.embarked = true;
    // embarkation speed is not a unit's own movement, so the dedication drops
    expect(unitFullMoves(state, b)).toBeLessThan(UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS);
  });

  it('a unit trained during the Golden age starts on the raised pool', () => {
    const state = newGame();
    golden(state, PLAYER_CIV, DED_MONUMENTALITY);
    const b = place(state, 'BUILDER', PLAYER_CIV);
    expect(b.movesLeft).toBe(UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS);
  });

  it('refreshUnits grants the raised pool and records it as movesFull', () => {
    const state = newGame();
    golden(state, PLAYER_CIV, DED_MONUMENTALITY);
    const b = place(state, 'BUILDER', PLAYER_CIV);
    b.movesLeft = 0;
    refreshUnits(state);
    expect(b.movesLeft).toBe(UNITS.BUILDER.moves + GOLDEN_MOVE_BONUS);
    expect(b.movesFull).toBe(b.movesLeft);
  });
});

// ---------------------------------------------------------------------------
// #51/S5.5 — the OTHER three golden faces were wired with a hardcoded civ 0,
// so a rival in a Golden age got the research discount, the prophet points and
// the culture of a civ that was not it. These are CALL-SITE tests: the helpers
// were always civ-keyed; what was broken was who they were asked about.
// ---------------------------------------------------------------------------

describe('B-24 golden dedications reach the rival that committed them', () => {
  function rivalRun(kind: number | null, turns: number): GameState {
    const state = newGame();
    if (kind !== null) golden(state, civOfRival(0), kind);
    for (let t = 0; t < turns; t++) {
      if (kind !== null) golden(state, civOfRival(0), kind); // survive era boundaries
      endTurn(state);
    }
    return state;
  }

  it('EXODUS pays a RIVAL +4 Great Prophet points a turn', () => {
    const T = 6;
    const withDed = rivalRun(DED_EXODUS, T);
    const without = rivalRun(null, T);
    const a = rivalsOf(withDed)[0].gpp.PROPHET ?? 0;
    const b = rivalsOf(without)[0].gpp.PROPHET ?? 0;
    expect(a - b).toBe(4 * T);
  });

  it('FREE_INQUIRY discounts a RIVAL boosted tech by an extra 10%', () => {
    const state = newGame();
    const rival = rivalsOf(state)[0];
    const id = rival.research.techs.length ? null : Object.keys(TECHS)[0];
    expect(id).toBeTruthy();
    rival.research.boosted.push(id!);
    const base = TECHS[id!].cost;
    const plain = effectiveResearchCostIn(rival.research, id!, base);
    golden(state, civOfRival(0), DED_FREE_INQUIRY);
    const g = goldenBoostBonus(state, civOfRival(0), false);
    expect(g).toBeGreaterThan(0);
    expect(effectiveResearchCostIn(rival.research, id!, base, g)).toBeLessThan(plain);
    // ...and the PLAYER's Golden age does not pay for the rival
    const other = newGame();
    golden(other, 0, DED_FREE_INQUIRY);
    expect(goldenBoostBonus(other, civOfRival(0), false)).toBe(0);
  });
});
