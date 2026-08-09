import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { indexOfSeat, seatOf, setWar } from '../../../cpu/core/seats';
import { createGame, endTurn } from '../../../cpu/core/game';
import { declareWar } from '../../../cpu/core/phase';
import { settleFirstCity } from '../helpers';
import { WARMONGER_DOW, WARMONGER_GANG, DIPLO_FAVOR_PER_SUZERAIN } from '../../../cpu/data/seats';
import { diplomaticFavorPerTurn } from '../../../cpu/core/seatTurn';
import { GOVERNMENTS } from '../../../cpu/data/policies';

// SEAT 0's WARMONGER score (grievances) — the exact twin of
// Seat.warmonger, which #55/S3 landed for opponents only. Real Civ 6 prices
// aggression in grievances: declaring war and taking cities make a civ shunned
// and ganged up on. Grows on declaring (+4) and on taking a foreign city (+3),
// decays 1/turn while at peace with EVERY civ, floor 0. Past
// WARMONGER_GANG a civ may declare on seat 0 WITHOUT the usual
// strength advantage.
//
// MEASURED live in the gate: seat 0's score peaks at exactly the gang
// threshold (6) with 192 civ-turns at or over it across the 24 scripted seeds,
// so the changed DoW gate is genuinely exercised and `warmonger` is a compared
// HEAD trace column. These pokes pin the accrual and decay rules themselves.

function newGame(opponents = 1) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, opponents,
  });
  settleFirstCity(state, 0);
  state.autoResearch = false;
  return state;
}

describe('B-22 diplomatic favor', () => {
  // Real Civ 6 (GS): a civ earns favor per turn equal to its GOVERNMENT TIER,
  // plus +1 per city-state it is Suzerain of. Chiefdom is tier 0 and pays
  // nothing, which is why an early game accrues favor only through envoys.
  it('pays the government TIER per turn', () => {
    expect(diplomaticFavorPerTurn('CHIEFDOM', 0)).toBe(0); // tier 0
    expect(diplomaticFavorPerTurn('MONARCHY', 0)).toBe(GOVERNMENTS.MONARCHY.tier);
    expect(GOVERNMENTS.MONARCHY.tier).toBe(2); // sourced: Monarchy is tier 2
  });

  it('pays per SUZERAINTY on top of the tier', () => {
    const tier = GOVERNMENTS.MONARCHY.tier;
    expect(diplomaticFavorPerTurn('MONARCHY', 3)).toBe(tier + 3 * DIPLO_FAVOR_PER_SUZERAIN);
  });

  it('no government pays nothing but suzerainties still count', () => {
    expect(diplomaticFavorPerTurn(null, 0)).toBe(0);
    expect(diplomaticFavorPerTurn(null, 2)).toBe(2 * DIPLO_FAVOR_PER_SUZERAIN);
  });

  it('accrues on seat 0 each turn', () => {
    const state = newGame(1);
    seatOf(state, 0)!.diplomaticFavor = 0;
    seatOf(state, 0)!.government.current = 'MONARCHY';
    endTurn(state, 0);
    // no suzerainties in a fresh game -> exactly the tier
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(GOVERNMENTS.MONARCHY.tier);
  });
});

describe('B-22 seat-0 grievances', () => {
  it('declaring war earns grievances', () => {
    const state = newGame(1);
    expect(seatOf(state, 0)!.warmonger ?? 0).toBe(0);
    expect(declareWar(state, indexOfSeat((state.seats[(0) + 1] as Seat).seat), 0).ok).toBe(true);
    expect(seatOf(state, 0)!.warmonger).toBe(WARMONGER_DOW);
  });

  it('grievances do NOT decay while a war is still running', () => {
    const state = newGame(1);
    declareWar(state, indexOfSeat((state.seats[(0) + 1] as Seat).seat), 0);
    const before = seatOf(state, 0)!.warmonger!;
    endTurn(state, 0);
    expect(seatOf(state, 0)!.warmonger).toBe(before); // still at war -> no decay
  });

  it('grievances decay by 1 per turn once at peace with every civ', () => {
    const state = newGame(1);
    declareWar(state, indexOfSeat((state.seats[(0) + 1] as Seat).seat), 0);
    setWar(state, (state.seats[(0) + 1] as Seat).seat, 0, false); // peace on every axis
    const before = seatOf(state, 0)!.warmonger!;
    endTurn(state, 0);
    expect(seatOf(state, 0)!.warmonger).toBe(before - 1);
  });

  it('decay floors at zero and never goes negative', () => {
    const state = newGame(1);
    seatOf(state, 0)!.warmonger = 1;
    endTurn(state, 0);
    expect(seatOf(state, 0)!.warmonger).toBe(0);
    endTurn(state, 0);
    expect(seatOf(state, 0)!.warmonger).toBe(0); // stays put, never negative
  });

  it('the gang threshold is a real bar the score can reach', () => {
    // Two declarations put seat 0 at 8, past the gang threshold of 6 —
    // the point at which opponents stop needing a strength advantage.
    const state = newGame(2);
    declareWar(state, indexOfSeat((state.seats[(0) + 1] as Seat).seat), 0);
    declareWar(state, indexOfSeat((state.seats[(1) + 1] as Seat).seat), 0);
    expect(seatOf(state, 0)!.warmonger).toBe(2 * WARMONGER_DOW);
    expect(seatOf(state, 0)!.warmonger!).toBeGreaterThanOrEqual(WARMONGER_GANG);
  });
});
