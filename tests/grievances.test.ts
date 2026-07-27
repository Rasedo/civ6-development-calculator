import { describe, it, expect } from 'vitest';
import { createGame, endTurn, foundCity } from '../src/core/game';
import { declareWar } from '../src/core/rivals';
import { scoreSettleSites } from '../src/core/advisor';
import { RR_WARMONGER_DOW, RR_WARMONGER_GANG } from '../src/data/rivals';

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

describe('B-22 player grievances', () => {
  it('declaring war earns grievances', () => {
    const state = newGame(1);
    expect(state.warmonger ?? 0).toBe(0);
    expect(declareWar(state, state.rivals[0].id).ok).toBe(true);
    expect(state.warmonger).toBe(RR_WARMONGER_DOW);
  });

  it('grievances do NOT decay while a war is still running', () => {
    const state = newGame(1);
    declareWar(state, state.rivals[0].id);
    const before = state.warmonger!;
    endTurn(state);
    expect(state.warmonger).toBe(before); // still at war -> no decay
  });

  it('grievances decay by 1 per turn once at peace with every rival', () => {
    const state = newGame(1);
    declareWar(state, state.rivals[0].id);
    state.rivals[0].atWar = false; // peace on every axis
    const before = state.warmonger!;
    endTurn(state);
    expect(state.warmonger).toBe(before - 1);
  });

  it('decay floors at zero and never goes negative', () => {
    const state = newGame(1);
    state.warmonger = 1;
    endTurn(state);
    expect(state.warmonger).toBe(0);
    endTurn(state);
    expect(state.warmonger).toBe(0); // stays put, never negative
  });

  it('the gang threshold is a real bar the score can reach', () => {
    // Two declarations put the player at 8, past the gang threshold of 6 —
    // the point at which rivals stop needing a strength advantage.
    const state = newGame(2);
    declareWar(state, state.rivals[0].id);
    declareWar(state, state.rivals[1].id);
    expect(state.warmonger).toBe(2 * RR_WARMONGER_DOW);
    expect(state.warmonger!).toBeGreaterThanOrEqual(RR_WARMONGER_GANG);
  });
});
