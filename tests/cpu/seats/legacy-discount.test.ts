import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { seatOf } from '../../../cpu/core/seats';
import { applySeatActionRecord } from '../../../cpu/core/phase';
import { computeAdoption, goldPrice, faithPrice, governmentBit, governmentIndex, legacyBonusPct } from '../../../cpu/core/effects';
import { unitPurchaseCost } from '../../../cpu/core/game';
import { GOVERNMENT_LIST, POLICY_LIST } from '../../../cpu/data/policies';
import { CIVICS } from '../../../cpu/data/civics';
import type { GameState } from '../../../cpu/core/types';

/**
 * THE LEGACY PURCHASE DISCOUNTS (C-73's last two channels).
 *
 * CIV6: the Merchant Republic's legacy accrues a percent off GOLD purchases
 * (BonusType goldPurchases) and Theocracy's off FAITH purchases
 * (faithPurchases), +1 per 15 turns held. `goldPrice` / `faithPrice` apply the
 * accrued percent where a purchase is priced and paid; an upgrade, a tile and
 * a patronage pay full price (a reading). The GPU twins are `_gold_price` /
 * `_faith_price`, pinned in tests/gpu/legacy_accrual_test.py.
 */
function scene(gov: 'MERCHANT_REPUBLIC' | 'THEOCRACY', turns: number): GameState {
  const state = makeState(makeMap(12, 12, 'GRASSLAND'));
  settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
  const s = seatOf(state, 0)!;
  s.research.civics = Object.keys(CIVICS);
  s.government.held = GOVERNMENT_LIST.reduce((m, g) => m | governmentBit(g.id), 0);
  s.government.govTurns = GOVERNMENT_LIST.map(() => 0);
  s.government.govTurns[governmentIndex(gov)] = turns;
  expect(computeAdoption(s.research).government).not.toBe(gov);
  const legIdx = POLICY_LIST.findIndex((p) => p.id === `LEGACY_${gov}`);
  expect(legIdx).toBeGreaterThanOrEqual(0);
  applySeatActionRecord(state, s, { production: [], tech: null, civic: null, units: [], policies: [legIdx] });
  return state;
}

describe('the legacy purchase discounts', () => {
  it("Merchant Republic's legacy takes its accrued percent off a gold purchase, and nothing off faith", () => {
    const state = scene('MERCHANT_REPUBLIC', 30);
    expect(legacyBonusPct(state, 0, 'MERCHANT_REPUBLIC'), '30 turns at 1%/15').toBe(2);
    expect(goldPrice(state, 0, 100)).toBeCloseTo(98, 9);
    expect(faithPrice(state, 0, 100)).toBe(100);
    // the raw price composer is untouched — the discount lands at the purchase
    expect(unitPurchaseCost(state, 'WARRIOR', 0)).toBe(unitPurchaseCost(scene('MERCHANT_REPUBLIC', 0), 'WARRIOR', 0));
  });

  it("Theocracy's legacy takes its accrued percent off a faith purchase, and nothing off gold", () => {
    const state = scene('THEOCRACY', 45);
    expect(legacyBonusPct(state, 0, 'THEOCRACY'), '45 turns at 1%/15').toBe(3);
    expect(faithPrice(state, 0, 200)).toBeCloseTo(194, 9);
    expect(goldPrice(state, 0, 200)).toBe(200);
  });

  it('pays nothing before the first interval is held', () => {
    const state = scene('MERCHANT_REPUBLIC', 14);
    expect(goldPrice(state, 0, 100)).toBe(100);
  });
});
