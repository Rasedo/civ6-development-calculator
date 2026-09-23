import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import { seatOf } from '../../../cpu/core/seats';
import { applySeatActionRecord } from '../../../cpu/core/phase';
import { computeAdoption, goldPrice, faithPrice, governmentBit, getModifiers, slottedPolicyIndices } from '../../../cpu/core/effects';
import { unitPurchaseCost } from '../../../cpu/core/game';
import { GOVERNMENTS, GOVERNMENT_LIST, POLICY_LIST } from '../../../cpu/data/policies';
import { CIVICS } from '../../../cpu/data/civics';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (Gathering Storm): a government's SECOND bonus is flat — eight
 * MODIFIER_PLAYER_GOVERNMENT_FLAT_BONUS rows (Expansion1_Governments.xml,
 * re-shipped by Expansion2) and Communism's COMMUNISM_SCIENCE — paid while
 * the seat is IN the government. Gathering Storm deletes the base game's
 * accumulating rows (`*_ACCUMULATING`, Expansion2_RemoveData.xml) and
 * CAPABILITY_GOVERNMENTS_LEGACY_BONUSES with them. A legacy card pays the
 * government's INHERENT bonus (its `PolicyModifiers`), never the flat one.
 *
 * The purchase discounts land where a purchase is priced and paid
 * (`goldPrice` / `faithPrice`); the GPU twins are `_gold_price` /
 * `_faith_price`, pinned in tests/gpu/government_bonus_test.py.
 */
function scene(...civics: string[]): GameState {
  const state = makeState(makeMap(12, 12, 'GRASSLAND'));
  settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
  grantCivics(state, ...civics);
  return state;
}

describe('the flat government bonus', () => {
  it('is one row per government but the Chiefdom, and no legacy card carries it', () => {
    for (const g of GOVERNMENT_LIST) {
      if (g.tier === 0) {
        expect(g.bonus, 'the Chiefdom has no flat bonus').toBeUndefined();
        continue;
      }
      expect(g.bonus, `${g.id} has no flat bonus`).toBeDefined();
      const card = POLICY_LIST.find((p) => p.legacyOf === g.id)!;
      for (const k of Object.keys(g.bonus!)) expect(card.effects, `${g.id}'s legacy card pays ${k}`).not.toHaveProperty(k);
    }
    expect(GOVERNMENTS.AUTOCRACY.bonus).toEqual({ prodBoost: { target: 'wonder', classes: [], eraMax: -1, pct: 0.1 } });
    expect(GOVERNMENTS.FASCISM.bonus).toEqual({ prodBoost: { target: 'anyUnit', classes: [], eraMax: -1, pct: 0.5 } });
    expect(GOVERNMENTS.MERCHANT_REPUBLIC.bonus).toEqual({ districtProdMult: 1.15 });
    expect(GOVERNMENTS.COMMUNISM.bonus).toEqual({ yieldMult: { science: 1.1 } });
  });

  it("Democracy takes 15% off a gold purchase, and nothing off faith", () => {
    const state = scene('SUFFRAGE');
    expect(computeAdoption(seatOf(state, 0)!.research).government).toBe('DEMOCRACY');
    expect(goldPrice(state, 0, 100)).toBe(85);
    expect(faithPrice(state, 0, 100)).toBe(100);
    // the raw price composer is untouched — the discount lands at the purchase
    expect(unitPurchaseCost(state, 'WARRIOR', 0)).toBe(unitPurchaseCost(scene(), 'WARRIOR', 0));
  });

  it("Theocracy takes 15% off a faith purchase, and nothing off gold", () => {
    const state = scene('REFORMED_CHURCH');
    expect(computeAdoption(seatOf(state, 0)!.research).government).toBe('THEOCRACY');
    expect(faithPrice(state, 0, 200)).toBe(170);
    expect(goldPrice(state, 0, 200)).toBe(200);
  });

  it('is paid only while the seat is in the government', () => {
    const state = scene('POLITICAL_PHILOSOPHY');
    expect(computeAdoption(seatOf(state, 0)!.research).government).toBe('AUTOCRACY');
    expect(getModifiers(state, 0).prodBoosts).toContainEqual(GOVERNMENTS.AUTOCRACY.bonus!.prodBoost);
    const later = scene('SUFFRAGE');
    expect(getModifiers(later, 0).prodBoosts).not.toContainEqual(GOVERNMENTS.AUTOCRACY.bonus!.prodBoost);
  });
});

describe('what a legacy card pays', () => {
  it("its government's inherent bonus, and never the flat one", () => {
    const state = scene(...Object.keys(CIVICS));
    const s = seatOf(state, 0)!;
    s.government.held = GOVERNMENT_LIST.reduce((m, g) => m | governmentBit(g.id), 0);
    expect(computeAdoption(s.research).government).not.toBe('AUTOCRACY');
    const before = getModifiers(state, 0);
    const legIdx = POLICY_LIST.findIndex((p) => p.id === 'LEGACY_AUTOCRACY');
    applySeatActionRecord(state, s, { production: [], tech: null, civic: null, units: [], policies: [legIdx] });
    expect(slottedPolicyIndices(state, 0), 'the store did not take the legacy card').toContain(legIdx);
    const after = getModifiers(state, 0);
    expect(after.yieldsPerGovBuilding - before.yieldsPerGovBuilding).toBe(GOVERNMENTS.AUTOCRACY.effects.yieldsPerGovBuilding);
    expect(after.prodBoosts).not.toContainEqual(GOVERNMENTS.AUTOCRACY.bonus!.prodBoost);
  });
});
