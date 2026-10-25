import { describe, expect, it } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import { majorView } from '../../../cpu/core/majorView';
import { choosePolicies, policyRecord } from '../../../ai/major/policies';
import { policyScores } from '../../../cpu/core/aiPolicyValue';
import { applySeatPolicies } from '../../../cpu/core/phase';
import { seatOf } from '../../../cpu/core/seats';
import { POLICY_LIST } from '../../../cpu/data/policies';
import type { GameState } from '../../../cpu/core/types';

/**
 * THE MAJORS' AI'S VIEW (cpu/core/majorView.ts): the engine read in the
 * game's type names, and the choice it reads leaving as the seat's action
 * record, which the engine lands as it lands any driver's.
 */
function scene(...civics: string[]): GameState {
  const state = makeState(makeMap(12, 12, 'GRASSLAND'));
  settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
  grantCivics(state, ...civics);
  return state;
}

describe('the majors\' AI view', () => {
  it('names the civics, the government and its slots as the game does', () => {
    const state = scene('CODE_OF_LAWS', 'DRAMA_AND_POETRY');
    const v = majorView(state);
    expect(v.civicsHeld(0).has('CIVIC_CODE_OF_LAWS')).toBe(true);
    expect(v.civicsHeld(0).has('CIVIC_DRAMA_POETRY')).toBe(true);
    expect(v.government(0)).toBe('GOVERNMENT_CHIEFDOM');
    expect(v.slots(0).map((x) => x.slot)).toEqual(['SLOT_MILITARY', 'SLOT_ECONOMIC']);
    expect(v.cities(0).filter((c) => c.capital)).toHaveLength(1);
    expect(v.policiesSlottableUnder(0, 'GOVERNMENT_CHIEFDOM').has('POLICY_URBAN_PLANNING')).toBe(true);
  });

  it('carries the choice to the engine through the action record', () => {
    const state = scene('CODE_OF_LAWS');
    const v = majorView(state);
    const choice = choosePolicies(v, 0, policyScores(v, 0), true);
    const rec = policyRecord(v, choice);
    applySeatPolicies(state, seatOf(state, 0)!, { production: [], tech: null, civic: null, units: [], ...rec });
    const cards = seatOf(state, 0)!.government.policies.filter((x): x is string => !!x).sort();
    expect(cards).toEqual((rec.policies ?? []).filter((i) => i >= 0).map((i) => POLICY_LIST[i].id).sort());
    // God King (+1 Gold, +1 Faith in the capital) over Urban Planning (+1
    // Production a city) with one city and every weight 0
    expect(cards).toContain('GOD_KING');
  });
});
