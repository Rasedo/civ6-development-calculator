import { describe, it, expect } from 'vitest';
import type { RivalCiv } from '../src/core/types';
import { playerSeat } from '../src/core/seats';
import { createGame, endTurn, foundCity } from '../src/core/game';
import { declareWar } from '../src/core/rivals';
import { scoreSettleSites } from '../src/core/advisor';
import { RR_WARMONGER_DOW, RR_WARMONGER_GANG, DIPLO_FAVOR_PER_SUZERAIN } from '../src/data/rivals';
import { diploFavorPerTurn } from '../src/core/seatTurn';
import { GOVERNMENTS } from '../src/data/policies';

// B-22 (#74): the PLAYER's WARMONGER score (grievances) — the exact twin of
// RivalCiv.warmonger, which #55/S3 landed for rivals only. Real Civ 6 prices
// aggression in grievances: declaring war and taking cities make a civ shunned
// and ganged up on. Grows on declaring (+4) and on taking a rival city (+3),
// decays 1/turn while at peace with EVERY rival, floor 0. Past
// RR_WARMONGER_GANG a rival may declare on the player WITHOUT the usual
// strength advantage.
//
// MEASURED live in the gate: the player's score peaks at exactly the gang
// threshold (6) with 192 civ-turns at or over it across the 24 scripted seeds,
// so the changed DoW gate is genuinely exercised and `warmonger` is a compared
// HEAD trace column. These pokes pin the accrual and decay rules themselves.

function newGame(rivals = 1) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, rivals,
  });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  state.autoResearch = false;
  return state;
}

describe('B-22 diplomatic favor', () => {
  // Real Civ 6 (GS): a civ earns favor per turn equal to its GOVERNMENT TIER,
  // plus +1 per city-state it is Suzerain of. Chiefdom is tier 0 and pays
  // nothing, which is why an early game accrues favor only through envoys.
  it('pays the government TIER per turn', () => {
    expect(diploFavorPerTurn('CHIEFDOM', 0)).toBe(0); // tier 0
    expect(diploFavorPerTurn('MONARCHY', 0)).toBe(GOVERNMENTS.MONARCHY.tier);
    expect(GOVERNMENTS.MONARCHY.tier).toBe(2); // sourced: Monarchy is tier 2
  });

  it('pays per SUZERAINTY on top of the tier', () => {
    const tier = GOVERNMENTS.MONARCHY.tier;
    expect(diploFavorPerTurn('MONARCHY', 3)).toBe(tier + 3 * DIPLO_FAVOR_PER_SUZERAIN);
  });

  it('no government pays nothing but suzerainties still count', () => {
    expect(diploFavorPerTurn(null, 0)).toBe(0);
    expect(diploFavorPerTurn(null, 2)).toBe(2 * DIPLO_FAVOR_PER_SUZERAIN);
  });

  it('accrues on the player each turn', () => {
    const state = newGame(1);
    playerSeat(state).diploFavor = 0;
    playerSeat(state).government.current = 'MONARCHY';
    endTurn(state);
    // no suzerainties in a fresh game -> exactly the tier
    expect(playerSeat(state).diploFavor).toBe(GOVERNMENTS.MONARCHY.tier);
  });
});

describe('B-22 player grievances', () => {
  it('declaring war earns grievances', () => {
    const state = newGame(1);
    expect(playerSeat(state).warmonger ?? 0).toBe(0);
    expect(declareWar(state, (state.seats[(0) + 1] as RivalCiv).id).ok).toBe(true);
    expect(playerSeat(state).warmonger).toBe(RR_WARMONGER_DOW);
  });

  it('grievances do NOT decay while a war is still running', () => {
    const state = newGame(1);
    declareWar(state, (state.seats[(0) + 1] as RivalCiv).id);
    const before = playerSeat(state).warmonger!;
    endTurn(state);
    expect(playerSeat(state).warmonger).toBe(before); // still at war -> no decay
  });

  it('grievances decay by 1 per turn once at peace with every rival', () => {
    const state = newGame(1);
    declareWar(state, (state.seats[(0) + 1] as RivalCiv).id);
    (state.seats[(0) + 1] as RivalCiv).atWar = false; // peace on every axis
    const before = playerSeat(state).warmonger!;
    endTurn(state);
    expect(playerSeat(state).warmonger).toBe(before - 1);
  });

  it('decay floors at zero and never goes negative', () => {
    const state = newGame(1);
    playerSeat(state).warmonger = 1;
    endTurn(state);
    expect(playerSeat(state).warmonger).toBe(0);
    endTurn(state);
    expect(playerSeat(state).warmonger).toBe(0); // stays put, never negative
  });

  it('the gang threshold is a real bar the score can reach', () => {
    // Two declarations put the player at 8, past the gang threshold of 6 —
    // the point at which rivals stop needing a strength advantage.
    const state = newGame(2);
    declareWar(state, (state.seats[(0) + 1] as RivalCiv).id);
    declareWar(state, (state.seats[(1) + 1] as RivalCiv).id);
    expect(playerSeat(state).warmonger).toBe(2 * RR_WARMONGER_DOW);
    expect(playerSeat(state).warmonger!).toBeGreaterThanOrEqual(RR_WARMONGER_GANG);
  });
});
