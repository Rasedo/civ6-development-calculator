// The majors' diplomatic sending (ai/major/diploActions.ts) on a stub view:
// the savings' shares and cap, the threat and trust terms, the desires of the
// missions, the friendship, the alliance and the surprise war, the can-do's
// savings and spacing, the perform's spend and a refusal's refund.
import { describe, expect, it } from 'vitest';
import {
  ACTION_ALLIANCE, ACTION_DELEGATION, ACTION_FRIENDSHIP, ACTION_SURPRISE_WAR, actionCost, dealStruck, desire, focusTurn,
  newDiploActionGaps, newDiploActionMemory, performAction, pickActions, recordAnswer, savingsTurn, threat, threatTerm,
  trustTerm,
} from '../../../ai/major/diploActions';
import type { MajorView } from '../../../ai/major/view';

function view(over: Partial<MajorView> = {}): MajorView {
  return {
    turn: 70, majors: () => [0, 1], metTurn: () => 1, atWar: () => false, treasury: () => 90,
    militaryStrength: (s: number) => (s === 0 ? 600 : 50), playerEra: () => 1, leaderType: () => null,
    strategies: () => new Set(), yieldWeight: () => Math.round(0.6 * 256),
    missionOpen: () => ACTION_DELEGATION, warOpen: () => true, ...over,
  } as unknown as MajorView;
}

const inputs = (state: string) => ({ state, delegationPrice: 10, embassyPrice: 25, distance: null, nearVictory: false,
  warOperation: false });

describe('the savings (0x687bf0)', () => {
  it('shares the treasury\'s change by the DefaultSavings weights and holds PLOTS at 150', () => {
    const mem = newDiploActionMemory();
    savingsTurn(view({ treasury: () => 90 }), mem, 1);
    const s = mem.seats.get(1)!;
    // 3 / 4 / 1 / 1 of 9, each fraction truncated to 1/256
    expect(s.savings.map((x) => x / 256)).toEqual([(90 * 85) / 256, (90 * 113) / 256, (90 * 28) / 256, (90 * 28) / 256]
      .map((x) => Math.floor(x * 256) / 256));
    savingsTurn(view({ treasury: () => 90 + 2000 }), mem, 1);
    expect(s.savings[2]).toBe(150 * 256);
  });
});

describe('the threat and trust terms (0x671b80 / 0x671ef0)', () => {
  it('T is the weight at rank 1 of two majors met, negated without the flag, 0 where the preference rules it out', () => {
    expect(threatTerm(view(), 1, 0, 0, true, 0) / 256).toBe(10);
    expect(threatTerm(view(), 1, 0, 1, false, 0) / 256).toBe(-20);
    expect(threatTerm(view(), 1, 0, 1, false, 1)).toBe(0);
    expect(threatTerm(view(), 1, 0, 1, true, -1)).toBe(0);
    // no threat read in the weaker major
    expect(threatTerm(view(), 0, 1, 0, true, 0)).toBe(0);
  });
  it('U is the trust x 0.02 x the weight: a struck deal\'s 2 gives 0.78 in mode 1', () => {
    const mem = newDiploActionMemory();
    expect(trustTerm(mem, 0, 1, 1, true, 0)).toBe(0);
    dealStruck(mem, 0, 1);
    expect(trustTerm(mem, 0, 1, 1, true, 0)).toBe(200);
    expect(trustTerm(mem, 1, 0, 1, false, 0)).toBe(-200);
    // with the flag matching the trust's sign a disfavoured action takes none
    expect(trustTerm(mem, 1, 0, 1, true, -1)).toBe(0);
  });
});

describe('the desires', () => {
  it('missions (0x66cd40): the state\'s Worth less the price\'s Gold value, + T, + 20 at the focus', () => {
    const gaps = newDiploActionGaps();
    const mem = newDiploActionMemory();
    // Neutral Worth 15, the price 10 at 0.5 x (1 + 0.6) = 8, T 10 (the owner's
    // strength trails by more than 100)
    expect(threat(view(), 1, 0)).toBeGreaterThan(0);
    const d = desire(view(), mem, 1, 0, ACTION_DELEGATION, { ...inputs('DIPLO_STATE_NEUTRAL'), pref: 0, focus: null }, gaps)!;
    expect(d / 256).toBeCloseTo(17, 1);
    const f = desire(view(), mem, 1, 0, ACTION_DELEGATION, { ...inputs('DIPLO_STATE_NEUTRAL'), pref: 0, focus: 0 }, gaps)!;
    expect((f - d) / 256).toBe(20);
  });

  it('the friendship (0x66c160) and the alliance (0x66d810), as runs/h1_duelv1127 Rome toward Qin at t100', () => {
    const gaps = newDiploActionGaps();
    const mem = newDiploActionMemory();
    dealStruck(mem, 0, 1);
    // Rome the stronger: no threat in Qin; Neutral Worth -10, U 0.78, the focus 20
    const v = view();
    const inp = { ...inputs('DIPLO_STATE_NEUTRAL'), pref: 0, focus: 1 };
    expect(desire(v, mem, 0, 1, ACTION_FRIENDSHIP, inp, gaps)).toBe(-10 * 256 + 200 + 20 * 256);
    expect(actionCost(v, mem, 0, 1, ACTION_FRIENDSHIP, inp)).toBe(10 * 256 - 200 - 20 * 256);
    // the alliance: no row in Neutral, U, 5 x (2 met - rank 1 + 1)
    expect(desire(v, mem, 0, 1, ACTION_ALLIANCE, inp, gaps)).toBe(200 + 10 * 256);
    // near a victory: 0, the cost 9999; unread: null
    expect(desire(v, mem, 0, 1, ACTION_FRIENDSHIP, { ...inp, nearVictory: true }, gaps)).toBe(0);
    expect(actionCost(v, mem, 0, 1, ACTION_FRIENDSHIP, { ...inp, nearVictory: true })).toBe(9999 * 256);
    expect(desire(v, mem, 0, 1, ACTION_FRIENDSHIP, { ...inp, nearVictory: null }, gaps)).toBe(null);
  });

  it('the surprise war (0x66e950): -1 at two wars, -9999 disfavoured, the war value unread', () => {
    const gaps = newDiploActionGaps();
    const mem = newDiploActionMemory();
    const inp = { ...inputs('DIPLO_STATE_NEUTRAL'), pref: 0, focus: null };
    expect(desire(view({ majors: () => [0, 1, 2, 3], atWar: (_a: number, b: number) => b !== 1 }), mem, 0, 1, ACTION_SURPRISE_WAR, inp, gaps)).toBe(-256);
    expect(desire(view(), mem, 0, 1, ACTION_SURPRISE_WAR, { ...inp, pref: -1 }, gaps)).toBe(-9999 * 256);
    expect(desire(view(), mem, 0, 1, ACTION_SURPRISE_WAR, inp, gaps)).toBe(null);
  });
});

describe('the pick, the perform and the answer', () => {
  it('sends a mission when the savings afford it, then waits out the spacing; a refusal refunds PLOTS', () => {
    const mem = newDiploActionMemory();
    const gaps = newDiploActionGaps();
    const v = view();
    savingsTurn(v, mem, 1);
    const ins = new Map([[0, inputs('DIPLO_STATE_NEUTRAL')]]);
    const picks = pickActions(v, mem, 1, ins, [], gaps);
    expect(picks.map((p) => p.action)).toEqual([ACTION_DELEGATION]);
    const rec = performAction(v, mem, 1, picks[0], 10, 25, 9);
    expect(rec.offer).toEqual([0, [[9, 0, 0]], []]);
    expect(pickActions(view({ turn: 73 }), mem, 1, ins, [], gaps)).toEqual([]);
    const plots = mem.seats.get(1)!.savings[2];
    recordAnswer(mem, 1, ACTION_DELEGATION, false, 10, 25);
    expect(mem.seats.get(1)!.savings[2]).toBe(plots + 10 * 256);
    expect(pickActions(view({ turn: 74 }), mem, 1, ins, [], gaps).length).toBe(1);
  });

  it('focuses the met major whose opinion of the owner is highest above 0', () => {
    const mem = newDiploActionMemory();
    focusTurn(view(), mem, 1, () => 3);
    expect(mem.seats.get(1)!.focus).toBe(0);
    focusTurn(view(), mem, 1, () => 0);
    expect(mem.seats.get(1)!.focus).toBe(null);
  });
});
