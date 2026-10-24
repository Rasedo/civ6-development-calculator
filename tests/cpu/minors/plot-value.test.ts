import { describe, expect, it } from 'vitest';
import { featureRemovalValue, improvementValue, type PlotValueFacts } from '../../../cpu/core/aiPlotValue';
import { FX, type AiValueView } from '../../../cpu/core/aiValue';

/** a player with no yield weights: every yield and pseudo-yield at its
 *  DefaultValue */
const view = { yieldWeight: () => 0, pseudoYieldWeight: () => 0 } as unknown as AiValueView;

const plot = (over: Partial<PlotValueFacts> = {}): PlotValueFacts => ({
  view, seat: 0, improvement: null, pillaged: false, resource: null, feature: null,
  floodTurns: null, eruptionTurns: null, appeal: 0, besideHousingDistrict: false,
  unitCost: () => 25, buildsUnit: () => true, extraCharges: () => 0, progressPct: 0, escalation: 1000,
  speedScaled: (n) => Math.floor(n / 2), adjacency: () => 0, housingValue: () => 0, resourceValue: () => 0,
  accumulationPct: 0,
  ...over,
});

const at = (v: number): number => Math.round((v / FX) * 100) / 100;

describe('the improvement value (0x7a58f0)', () => {
  it('a Farm landing now: a turn of Food 1.0 and PSEUDOYIELD_IMPROVEMENT 3.0 to the horizon, less a charge of a 25 Builder', () => {
    // runs/h1_duelv1127 t2 Hattusa: 72.45 on its plain and Floodplains farmland
    expect(at(improvementValue(plot(), 'IMPROVEMENT_FARM', 0, 50))).toBe(72.45);
    expect(at(improvementValue(plot({ feature: 'FEATURE_FLOODPLAINS_GRASSLAND' }), 'IMPROVEMENT_FARM', 0, 50))).toBe(72.45);
  });

  it('a Mine landing in 4 turns; beside a volcano the AI expects to erupt in 31 its yields end there', () => {
    // runs/h1_duelv1127 t2: 62.51 on the minors' hills, 48.44 beside the volcanoes at (7,13) and (43,18)
    expect(at(improvementValue(plot(), 'IMPROVEMENT_MINE', 4, 50))).toBe(62.51);
    expect(at(improvementValue(plot({ eruptionTurns: 31 * FX }), 'IMPROVEMENT_MINE', 4, 50))).toBe(48.44);
  });

  it('a flood the AI expects next turn leaves a Farm only its charge', () => {
    expect(at(improvementValue(plot({ floodTurns: FX }), 'IMPROVEMENT_FARM', 0, 50))).toBe(-8);
  });

  it('clearing a Woods for a Farm: its 20 Production at half speed (escalated by the game progress percent), a charge, the Production it paid', () => {
    // runs/h1_duelv1127 t2: 54.34 on Woods and Rainforest (72.45 - 18.11), none held
    expect(at(featureRemovalValue(plot(), 'FEATURE_FOREST', 0, 50))).toBe(-18.11);
    expect(at(featureRemovalValue(plot({ progressPct: 6 }), 'FEATURE_FOREST', 0, 50))).toBe(-13.11);
    expect(at(improvementValue(plot({ feature: 'FEATURE_FOREST' }), 'IMPROVEMENT_FARM', 0, 50))).toBe(54.34);
  });

  it('nothing to add where the improvement stands; a resource it neither works nor harvests leaves it at 0', () => {
    expect(improvementValue(plot({ improvement: 'IMPROVEMENT_FARM' }), 'IMPROVEMENT_FARM', 0, 50)).toBe(0);
    expect(improvementValue(plot({ resource: 'RESOURCE_HORSES' }), 'IMPROVEMENT_FARM', 0, 50)).toBe(0);
  });
});
