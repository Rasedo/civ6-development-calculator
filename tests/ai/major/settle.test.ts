// The majors' settle site evaluation (ai/major/settle.ts) and danger map
// (ai/major/danger.ts): the lists merged as the game's loader merges them,
// and a unit's danger.
import { describe, expect, it } from 'vitest';
import { unitDanger } from '../../../ai/major/danger';
import { bestSettleSite, firstTurnSettlePlot, plotEvalEntries, type SettleRegions } from '../../../ai/major/settle';
import { AI_FEATURES, AI_PLOT_EVAL_CONDITIONS } from '../../../ai/major/tables';

const entry = (leader: string, cond: string, strategies: string[] = []) =>
  plotEvalEntries(leader, null, new Set(strategies))[AI_PLOT_EVAL_CONDITIONS.indexOf(cond)];

describe('the PlotEvaluations lists (0x6dd310)', () => {
  it('sums StandardSettlePlot for a major, a Favored row into the threshold', () => {
    expect(entry('LEADER_QIN', 'Nearest Friendly City').value).toBe(-10);
    expect(entry('LEADER_QIN', 'Foreign Continent').threshold).toBe(-2);
    expect(entry('LEADER_QIN', 'Total Yield').yields.get('YIELD_PRODUCTION')).toBe(2);
    expect(entry('LEADER_QIN', 'Cultural Pressure')).toMatchObject({ threshold: -6, value: 1 });
  });
  it('adds a followed strategy\'s list', () => {
    expect(entry('LEADER_QIN', 'Nearest Friendly City', ['STRATEGY_NAVAL']).value).toBe(-6);
    expect(entry('LEADER_QIN', 'Coastal', ['STRATEGY_NAVAL']).value).toBe(22);
  });
  it('puts the natural wonder row on its own feature, once per natural wonder', () => {
    const f = entry('LEADER_QIN', 'Specific Feature').features;
    expect(f.get('FEATURE_DEAD_SEA')).toBe(6 * AI_FEATURES.filter((x) => x.naturalWonder).length);
    expect(f.get('FEATURE_MATTERHORN')).toBeUndefined();
    expect(f.get('FEATURE_ICE')).toBe(-3);
  });
});

describe('the site choices', () => {
  const sr: SettleRegions = {
    regions: [
      { region: 0, plots: [{ plot: 5, score: 512 }, { plot: 6, score: 256 }], any: true },
      { region: 1, plots: [{ plot: 9, score: 512 }], any: true },
      { region: 2, plots: [{ plot: 12, score: 0 }], any: false },
    ],
    score: new Map([[5, 512], [6, 256], [9, 512], [12, 0]]),
  };
  it('takes the best region top, the first region on a tie, none at 0', () => {
    expect(bestSettleSite(sr)?.plot).toBe(5);
    expect(bestSettleSite(sr, 5)?.plot).toBe(9);
  });
  it('moves the first turn settler to the best plot of this turn\'s reach', () => {
    expect(firstTurnSettlePlot(sr, [{ plot: 12, turns: 1, moves: 0 }, { plot: 6, turns: 1, moves: 0 }, { plot: 5, turns: 2, moves: 0 }])).toBe(6);
    expect(firstTurnSettlePlot(sr, [{ plot: 12, turns: 1, moves: 0 }])).toBeNull();
  });
});

describe('a unit\'s danger (0x716400)', () => {
  it('takes the larger strength, a bombard less the modifier', () => {
    expect(unitDanger(20, 0, 0)).toBe(20);
    expect(unitDanger(5, 15, 0)).toBe(15);
    expect(unitDanger(25, 0, 35)).toBe(25);
    expect(unitDanger(15, 0, 35)).toBe(18);
  });
});
