import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import { seatOf } from '../../../cpu/core/seats';
import { applySeatPolicies } from '../../../cpu/core/phase';
import { computeAdoption, unlockedPolicyIds, governmentSlots, darkAgeEra, wonderExtraSlots, slottedPolicyIndices,
  policyLayoutOf, policyWireOf } from '../../../cpu/core/effects';
import { POLICY_LIST } from '../../../cpu/data/policies';
import type { GameState, SeatActionRecord } from '../../../cpu/core/types';

/**
 * THE SLOTTED-CARD STORE.
 *
 * Which card a seat slots in which slot is a DRIVER decision on the wire, the
 * slot layout (`policyLayoutOf`): `unlockedPolicyIds` is the one gate the
 * greedy reference, the record's validator and the effects share,
 * `applySeatPolicies` stores an accepted layout in `government.policies`, the
 * effects, the congress voter, the Policy Treaty and the boost detector read
 * the STORE through `slottedPolicyIndices`.
 */
const REC = (policies?: number[]): SeatActionRecord => ({ production: [], tech: null, civic: null, units: [], policies });

function scene(): { state: GameState; open: Set<string>; layout: (string | null)[] } {
  const state = makeState(makeMap(12, 12, 'GRASSLAND'));
  settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
  grantCivics(state, 'CODE_OF_LAWS', 'CRAFTSMANSHIP', 'FOREIGN_TRADE');
  const s = seatOf(state, 0)!;
  const adoption = computeAdoption(s.research, wonderExtraSlots(state, 0), darkAgeEra(state, 0), s.government.held);
  expect(adoption.government).not.toBeNull();
  const open = unlockedPolicyIds(s.research, darkAgeEra(state, 0), s.government.held, adoption.government!);
  expect(adoption.policies.some((p) => p !== null)).toBe(true);
  return { state, open, layout: adoption.policies };
}

describe('the slotted-card store', () => {
  it('shares ONE unlock gate with the greedy fill', () => {
    const { open, layout } = scene();
    for (const id of layout) if (id) expect(open.has(id), `${id} slotted but not unlocked`).toBe(true);
  });

  it('carries a layout on the wire and back, and refuses one off its slots', () => {
    const { state, layout } = scene();
    const slots = governmentSlots(state, 0);
    const wire = policyWireOf(slots, layout);
    expect(policyLayoutOf(slots, wire)).toEqual(layout);
    expect(policyLayoutOf(slots, wire.slice(1))).toBeNull();
    const card = wire.find((c) => c >= 0)!;
    expect(policyLayoutOf(slots, wire.map(() => card))).toBeNull();
  });

  it('stores an accepted layout from the record and leaves the store alone on a refused one', () => {
    const { state, open, layout } = scene();
    const s = seatOf(state, 0)!;
    const slots = governmentSlots(state, 0);
    s.government.policies = slots.map(() => null);
    applySeatPolicies(state, s, REC(policyWireOf(slots, layout)));
    expect(s.government.policies).toEqual(layout);
    const before = [...s.government.policies];
    const locked = POLICY_LIST.findIndex((p) => !open.has(p.id) && p.kind === 'wildcard');
    if (locked >= 0) {
      const wire = policyWireOf(slots, layout);
      wire[wire.length - 1] = locked;
      applySeatPolicies(state, s, REC(wire));
      expect(s.government.policies).toEqual(before);
    }
    applySeatPolicies(state, s, REC());
    expect(s.government.policies).toEqual(before);
    expect(slottedPolicyIndices(state, 0).length).toBe(layout.filter((p) => p !== null).length);
  });

  it('a lapsed card moved to another slot pays again; left in its slot it stays lapsed', () => {
    const { state, layout } = scene();
    const s = seatOf(state, 0)!;
    const slots = governmentSlots(state, 0);
    s.government.policies = [...layout];
    const w = slots.indexOf('wildcard');
    const i = layout.findIndex((c, j) => c !== null && j !== w);
    if (w < 0 || i < 0 || layout[w] !== null) return;
    s.government.lapsed = [layout[i]!];
    applySeatPolicies(state, s, REC(policyWireOf(slots, layout)));
    expect(s.government.lapsed).toEqual([layout[i]]);
    const moved = [...layout];
    moved[w] = moved[i];
    moved[i] = null;
    applySeatPolicies(state, s, REC(policyWireOf(slots, moved)));
    expect(s.government.policies).toEqual(moved);
    expect(s.government.lapsed).toEqual([]);
  });
});
