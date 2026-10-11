// The majors' World Congress AI (ai/major/congress.ts): the vote price and
// the votes a sum buys (0x527680 / 0x527d80), the allocation of the favor
// over the session (0x628450) against runs/h1_duelv1127's logged sessions,
// and the outcome the Resolutions lists name (0x622140).
import { describe, expect, it } from 'vitest';
import {
  CONGRESS_AI_STEP, allocateVotes, evaluateResolutions, resolutionPreference, voteCost, votesFor, type ResolutionEval,
} from '../../../ai/major/congress';
import type { MajorView } from '../../../ai/major/view';

const view = (over: Partial<MajorView> = {}): MajorView =>
  ({ leaderType: () => 'LEADER_QIN', strategies: () => new Set(), ...over }) as unknown as MajorView;

describe('the vote price (0x527680 / 0x527d80)', () => {
  it('is 5 through the online speed, whole: 2 x n x (n - 1)', () => {
    expect(CONGRESS_AI_STEP).toBe(2);
    expect(voteCost(1)).toBe(0);
    expect(voteCost(4)).toBe(24);
    expect(voteCost(9)).toBe(144);
  });
  it('buys the votes Qin cast with its whole favor in h1_duelv1127 (29 -> 4, 149 -> 9, 85 -> 7)', () => {
    expect(votesFor(29)).toBe(4);
    expect(votesFor(149)).toBe(9);
    expect(votesFor(85)).toBe(7);
    expect(votesFor(0)).toBe(1);
  });
});

describe('the allocation (0x628450)', () => {
  const e = (type: string, desire: number, listed = false): ResolutionEval =>
    ({ type, outcome: 1, desire: desire * 256, listed, values: [desire * 256, 0] });
  it('spends the favor by the shares of the desire, the listed resolution first: all of it where it alone is desired', () => {
    const v = allocateVotes([e('WC_RES_WORLD_RELIGION', 0), e('WC_RES_TRADE_TREATY', 30, true)], 29);
    expect(v.get('WC_RES_TRADE_TREATY')).toBe(4);
    expect(v.get('WC_RES_WORLD_RELIGION')).toBe(1);
  });
  it('takes half the desire where the favor covers every resolution', () => {
    const v = allocateVotes([e('A', 6), e('B', 4)], 1000);
    expect(v.get('A')).toBe(3);
    expect(v.get('B')).toBe(2);
  });
  it('casts one vote with no desire', () => {
    expect(allocateVotes([e('A', 0)], 500).get('A')).toBe(1);
  });
});

describe('the outcome (0x622140)', () => {
  it('takes the outcome the Resolutions lists name: Money Grubber favours the Trade Treaty, Airpower disfavours Mercenary Companies', () => {
    expect(resolutionPreference(view(), 1, ['AGENDA_MONEY_GRUBBER'], 'WC_RES_TRADE_TREATY')).toBe(1);
    expect(resolutionPreference(view(), 1, ['AGENDA_AIRPOWER'], 'WC_RES_MERCENARY_COMPANIES')).toBe(-1);
    const ev = evaluateResolutions(view(), 1, ['AGENDA_AIRPOWER'], ['WC_RES_MERCENARY_COMPANIES', 'WC_RES_WORLD_RELIGION']);
    expect(ev.map((x) => [x.outcome, x.listed])).toEqual([[2, true], [1, false]]);
  });
});
