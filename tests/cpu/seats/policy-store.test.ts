import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import { seatOf } from '../../../cpu/core/seats';
import { applySeatActionRecord } from '../../../cpu/core/phase';
import { computeAdoption, unlockedPolicyIds, fitPolicies, governmentSlots, inDarkAge, wonderExtraSlots } from '../../../cpu/core/effects';
import { congressPolicyBlocked } from '../../../cpu/core/congress';
import { POLICY_LIST, POLICIES } from '../../../cpu/data/policies';
import type { GameState, SeatActionRecord } from '../../../cpu/core/types';

/**
 * THE SLOTTED-CARD STORE (C-75, step 1 — inert plumbing).
 *
 * Which cards a seat slots is becoming a DRIVER decision on the wire. This
 * step lays the plumbing and pays nothing off it: `unlockedPolicyIds` is the
 * one gate the greedy fill and the record's validator share, `fitPolicies`
 * lays a set into the slots or refuses it whole, and `applySeatActionRecord`
 * stores an accepted set in `government.policies`. `computeAdoption` still
 * pays the effects from its own greedy fill.
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
});
