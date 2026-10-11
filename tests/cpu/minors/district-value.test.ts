// The AI's district value (cpu/core/aiDistrictValue.ts), the project value
// (cpu/core/aiProjectValue.ts) and the Economic AI's savings and unit
// purchases (cpu/core/aiEconomic.ts) on stub facts, against the city-states'
// logged values (AI_CityBuild.csv) of the verbose duels.
import { describe, expect, it } from 'vitest';
import { districtValue, type DistrictValueFacts } from '../../../cpu/core/aiDistrictValue';
import { projectValue, type ProjectValueFacts } from '../../../cpu/core/aiProjectValue';
import {
  SLOT_PLOTS, SLOT_SLUSH, SLOT_UNITS, newEconomicMemory, purchasePick, purchaseTurn, savingsTurn, tryPurchaseUnits,
  type PurchaseCity,
} from '../../../cpu/core/aiEconomic';
import { FX, type AiValueView } from '../../../cpu/core/aiValue';

/** a city-state of the Ancient era: every yield at its DefaultValue, the
 *  district pseudo-yield's weight 0.5 x the era's chronology 1 */
const view = {
  yieldWeight: () => 0,
  pseudoYieldWeight: (_s: number, p: string) => (p === 'PSEUDOYIELD_DISTRICT' ? FX / 2 : 0),
} as unknown as AiValueView;

const at = (v: number): number => Math.round((v / FX) * 100) / 100;

/** a plot of runs/h1_duelv1127 t2 player 3 (Hattusa's neighbour), the Campus
 *  landing in 15 turns (2 to build, 13 to Writing) */
const plot = (over: Partial<DistrictValueFacts> = {}): DistrictValueFacts => ({
  view, seat: 0, improvement: null, pillaged: false, resource: null, feature: null,
  floodTurns: null, eruptionTurns: null, appeal: 0, besideHousingDistrict: false,
  unitCost: () => 25, buildsUnit: () => true, extraCharges: () => 0, progressCount: 0, escalation: 1000,
  speedScaled: (n) => Math.floor(n / 2), adjacency: () => 0, housingValue: () => 0, resourceValue: () => 0,
  owned: false, purchaseCost: 25, lake: false, keepsFeature: () => false, district: null, districtPillaged: false,
  isCity: false, districtAdjacency: () => 0, rowsAdjacency: () => 0, otherDistricts: () => [], chronology: 1,
  districtCount: 0, districtCap: 1, regionalCities: () => 0, cityTrains: () => true, playerTrains: () => true,
  domainUnitsValue: () => 0, riverPlots: () => ({ improved: 0, districted: 0 }), canalTrade: 0, projectValue: () => 0,
  spaceRace: () => false, favoured: () => false, districtsOf: () => 0,
  ...over,
});

const science = (n: number) => (_d: string, y: string) => (y === 'YIELD_SCIENCE' ? n : 0);

describe('the district value (0x7a51f0 -> 0x7aaf80)', () => {
  it('a Campus on an owned plot counts its adjacency twice: the whole (0x366df0) and its rows', () => {
    expect(at(districtValue(plot({ owned: true, purchaseCost: 0, districtAdjacency: science(1), rowsAdjacency: science(1) }),
      'DISTRICT_CAMPUS', 15, 50))).toBe(109.41);
  });

  it('on a plot without an owner only its rows, less the plot\'s price discounted', () => {
    expect(at(districtValue(plot({ districtAdjacency: science(1), rowsAdjacency: science(1) }), 'DISTRICT_CAMPUS', 15, 50))).toBe(91.75);
    expect(at(districtValue(plot(), 'DISTRICT_CAMPUS', 15, 50))).toBe(81.8);
  });

  it('a plot the city cannot buy prices at -1', () => {
    expect(at(districtValue(plot({ purchaseCost: -1 }), 'DISTRICT_CAMPUS', 15, 50))).toBe(89.82);
  });

  it('an Industrial Zone\'s regional reach halves its turn with no other city to serve', () => {
    const one = districtValue(plot(), 'DISTRICT_INDUSTRIAL_ZONE', 20, 50);
    const two = districtValue(plot({ regionalCities: () => 1 }), 'DISTRICT_INDUSTRIAL_ZONE', 20, 50);
    expect(two).toBeGreaterThan(one);
  });
});

/** a city-state at 9% of the game's progress */
const project = (over: Partial<ProjectValueFacts> = {}): ProjectValueFacts => ({
  view, seat: 0, cityId: 1, capital: true, advanced: () => 0, buildTurns: () => 10, progressPct: 9,
  spaceRaceStanding: 0, defenceRepairs: 0, population: 3, districts: 1, loyaltyFalling: false,
  buildingValue: () => 0, hasBuilding: () => false, ...over,
});

describe('the project value (0x7b28c0)', () => {
  it('Campus Research Grants: its Great Scientist points escalated by the progress, x4, discounted', () => {
    // runs/h1_duelv1124 t32 .. t34 player 4: 29 / 30 / 31 at 3 / 2 / 1 turns (10 + 70 x 9% = 16 points)
    expect(at(projectValue(project(), 'PROJECT_ENHANCE_DISTRICT_CAMPUS', 3, 50))).toBe(29);
    expect(at(projectValue(project(), 'PROJECT_ENHANCE_DISTRICT_CAMPUS', 1, 50))).toBe(31);
  });

  it('a project consuming a building the city lacks values -9999; held, its value comes off', () => {
    expect(at(projectValue(project(), 'PROJECT_DECOMMISSION_COAL_POWER_PLANT', 3, 50))).toBe(-9999);
    const held = project({ hasBuilding: (b) => b === 'BUILDING_COAL_POWER_PLANT', buildingValue: () => 40 * FX });
    expect(at(projectValue(held, 'PROJECT_DECOMMISSION_COAL_POWER_PLANT', 3, 50))).toBe(-40);
  });

  it('a project the player has completed its most of values -9999', () => {
    expect(at(projectValue(project({ advanced: () => 1 }), 'PROJECT_MANHATTAN_PROJECT', 3, 50))).toBe(-9999);
  });
});

describe('the savings (0x687bf0) and the unit purchases (0x68be60)', () => {
  it('shares the treasury\'s change by the DefaultSavings weights and holds PLOTS at 150', () => {
    const e = newEconomicMemory();
    savingsTurn(e, 90 * FX);
    // 3 / 4 / 1 / 1 of 9, each fraction truncated to 1/256
    expect(e.savings.map((x) => x / FX)).toEqual([(90 * 85) / 256, (90 * 113) / 256, (90 * 28) / 256, (90 * 28) / 256]
      .map((x) => Math.floor(x * 256) / 256));
    savingsTurn(e, (90 + 2000) * FX);
    expect(e.savings[SLOT_PLOTS]).toBe(150 * FX);
  });

  const city = (threat: number, cost = 40): PurchaseCity => ({ id: 1, goldCost: () => cost, threat, canPurchase: () => true });

  it('buys where the UNITS slot holds half the price, spending UNITS then SLUSH', () => {
    const e = newEconomicMemory();
    e.savings = [30 * FX, 25 * FX, 0, 0];
    e.balance = 55 * FX;
    expect(tryPurchaseUnits(e, [city(0)], 'UNIT_WARRIOR', () => {})?.id).toBe(1);
    expect(e.savings[SLOT_UNITS]).toBe(0);
    expect(e.savings[SLOT_SLUSH]).toBe(15 * FX);
    expect(e.balance).toBe(15 * FX);
  });

  it('a threatened city buys on the balance alone, from the slots in order', () => {
    const e = newEconomicMemory();
    e.savings = [10 * FX, 5 * FX, 20 * FX, 0];
    e.balance = 60 * FX;
    expect(tryPurchaseUnits(e, [city(0)], 'UNIT_WARRIOR', () => {})).toBeNull();
    expect(tryPurchaseUnits(e, [city(2)], 'UNIT_WARRIOR', () => {})?.id).toBe(1);
    expect(e.savings).toEqual([0, 0, 0, 0]);
    expect(e.balance).toBe(20 * FX);
  });

  it('the city buys its list\'s first trainable unit while the purchases succeed', () => {
    const e = newEconomicMemory();
    e.savings = [0, 0, 0, 0];
    e.balance = 100 * FX;
    const entries = [
      { unit: 'UNIT_SLINGER', valid: false, rank: 5, subRank: 0 },
      { unit: 'UNIT_WARRIOR', valid: true, rank: 5, subRank: 0 },
      { unit: 'UNIT_ARCHER', valid: true, rank: 4, subRank: 0 },
    ];
    const pick = () => purchasePick(entries, () => true, () => true, () => 'DOMAIN_LAND', null);
    expect(purchaseTurn(e, city(1), false, pick, () => {})).toEqual(['UNIT_WARRIOR', 'UNIT_WARRIOR']);
    expect(purchaseTurn(e, city(-1), false, pick, () => {})).toEqual([]);
  });
});
