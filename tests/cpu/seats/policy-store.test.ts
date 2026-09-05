import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import { seatOf } from '../../../cpu/core/seats';
import { applySeatActionRecord } from '../../../cpu/core/phase';
import { computeAdoption, unlockedPolicyIds, fitPolicies, fitPoliciesLoose, governmentSlots, inDarkAge, wonderExtraSlots, slottedPolicyIndices } from '../../../cpu/core/effects';
import { congressPolicyBlocked } from '../../../cpu/core/congress';
import { POLICY_LIST, POLICIES } from '../../../cpu/data/policies';
import type { GameState, SeatActionRecord } from '../../../cpu/core/types';

/**
 * THE SLOTTED-CARD STORE (C-75).
 *
 * Which cards a seat slots is a DRIVER decision on the wire: `unlockedPolicyIds`
 * is the one gate the greedy reference, the record's validator and the effects
 * share, `fitPolicies` lays a set into the slots or refuses it whole,
 * `applySeatActionRecord` stores an accepted set in `government.policies`, the
 * effects (`applyGovernment`), the congress voter, the Policy Treaty and the
 * boost detector read the STORE through `slottedPolicyIndices`, and a changed
 * government keeps what still fits (`fitPoliciesLoose`).
 *
 * The GPU twin is tests/gpu/policy_store_test.py.
 */
const IDX = new Map(POLICY_LIST.map((p, i) => [p.id, i] as const));
const REC = (policies?: number[]): SeatActionRecord => ({ production: [], tech: null, civic: null, units: [], policies });

function scene(): { state: GameState; open: Set<string>; greedy: string[] } {
  const state = makeState(makeMap(12, 12, 'GRASSLAND'));
  settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
  grantCivics(state, 'CODE_OF_LAWS', 'CRAFTSMANSHIP', 'FOREIGN_TRADE');
  const s = seatOf(state, 0)!;
  const adoption = computeAdoption(s.research, wonderExtraSlots(state, 0), congressPolicyBlocked(state), inDarkAge(state, 0), s.government.held);
  expect(adoption.government).not.toBeNull();
  const open = unlockedPolicyIds(s.research, congressPolicyBlocked(state), inDarkAge(state, 0), s.government.held, adoption.government!);
  const greedy = adoption.policies.filter((p): p is string => p !== null);
  expect(greedy.length).toBeGreaterThan(0);
  return { state, open, greedy };
}

describe('the slotted-card store', () => {
  it('shares ONE unlock gate with the greedy fill', () => {
    const { open, greedy } = scene();
    for (const id of greedy) expect(open.has(id), `${id} slotted but not unlocked`).toBe(true);
    expect(open.size).toBeGreaterThanOrEqual(greedy.length);
  });

  it('lays a set into the slots by kind, wildcards taking the overflow, and refuses one that does not fit', () => {
    const { state, open, greedy } = scene();
    const slots = governmentSlots(state, 0);
    const fit = fitPolicies(slots, greedy);
    expect(fit).not.toBeNull();
    expect(fit!.filter((p) => p !== null).sort()).toEqual([...greedy].sort());
    for (let i = 0; i < slots.length; i++) {
      const id = fit![i];
      if (id) expect(slots[i] === 'wildcard' || POLICIES[id].kind === slots[i]).toBe(true);
    }
    // every unlocked card at once is more than the slots hold whenever the
    // greedy fill left one out
    const all = [...open];
    if (all.length > greedy.length) expect(fitPolicies(slots, all)).toBeNull();
    expect(fitPolicies(slots, ['NO_SUCH_CARD'])).toBeNull();
  });

  it('stores an accepted set from the record and leaves the store alone on a refused one', () => {
    const { state, open, greedy } = scene();
    const s = seatOf(state, 0)!;
    s.government.policies = [];
    applySeatActionRecord(state, s, REC(greedy.map((id) => IDX.get(id)!)));
    expect(s.government.policies.filter((p) => p !== null).sort()).toEqual([...greedy].sort());
    const locked = POLICY_LIST.findIndex((p) => !open.has(p.id));
    expect(locked).toBeGreaterThanOrEqual(0);
    const before = [...s.government.policies];
    applySeatActionRecord(state, s, REC([...greedy.map((id) => IDX.get(id)!), locked]));
    expect(s.government.policies).toEqual(before);
    // and no decision at all touches nothing
    applySeatActionRecord(state, s, REC());
    expect(s.government.policies).toEqual(before);
  });

  it('a government with fewer slots keeps the table-earliest cards and drops the rest', () => {
    const { state, greedy } = scene();
    const slots = governmentSlots(state, 0);
    const fewer = slots.slice(0, Math.max(1, slots.length - 1));
    const kept = fitPoliciesLoose(fewer, greedy).filter((p): p is string => p !== null);
    expect(kept.length).toBeLessThan(greedy.length);
    for (const id of kept) expect(greedy).toContain(id);
    // the store, filtered by the live unlock, is what the effects and the boost detector read
    seatOf(state, 0)!.government.policies = fitPoliciesLoose(slots, greedy);
    expect(slottedPolicyIndices(state, 0).length).toBe(greedy.length);
  });
});
