import { describe, it, expect } from 'vitest';
import { makeState, settleFirstCity } from '../helpers';
import { availableCivicsIn, availableTechsIn, getModifiers } from '../../../cpu/core/effects';
import { TECHS } from '../../../cpu/data/techs';
import { CIVICS } from '../../../cpu/data/civics';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import { POLICIES } from '../../../cpu/data/policies';
import { unitProdCost } from '../../../cpu/core/game';
import { CONGRESS_MERCENARY, CONGRESS_GLOBAL_ENERGY } from '../../../cpu/data/seats';
import { CONGRESS_CUR_PRODUCTION, congressEnergyBlocked, congressEnergyProdMult } from '../../../cpu/core/congress';
import { POWER_PLANT_IDS } from '../../../cpu/data/buildings';
import { startTileMoves } from '../../../cpu/core/units';

describe('the late tree', () => {
  it('Future Tech and Future Civic stay researchable once complete', () => {
    const state = makeState();
    const r = state.seats[0].research;
    r.techs = Object.keys(TECHS);
    r.civics = Object.keys(CIVICS);
    expect(availableTechsIn(r).map((t) => t.id)).toEqual(['FUTURE_TECH']);
    expect(availableCivicsIn(r).map((c) => c.id)).toEqual(['FUTURE_CIVIC']);
  });

  it('carries the install rows: costs, awards, the Seastead', () => {
    expect(TECHS.FUTURE_TECH.repeatable).toBe(true);
    expect(TECHS.FUTURE_TECH.effects).toContainEqual({ kind: 'award', projectPct: 5 });
    expect(TECHS.SEASTEADS.effects).toContainEqual({ kind: 'award', dvp: 1 });
    expect(TECHS.SEASTEADS.effects).toContainEqual({ kind: 'unlockImprovement', improvement: 'SEASTEAD' });
    expect(CIVICS.FUTURE_CIVIC.effects).toContainEqual({ kind: 'award', favor: 50, titles: 1 });
    expect(IMPROVEMENTS.SEASTEAD.housing).toBe(2);
    expect(IMPROVEMENTS.SEASTEAD.tourismFrom).toBe('culture');
    expect(IMPROVEMENTS.SEASTEAD.tourismTech).toBeUndefined();
  });
});

describe('Mercenary Companies on Production and the Global Energy Treaty', () => {
  it('B on Production halves a military unit\'s production cost, not a Builder\'s', () => {
    const state = makeState();
    state.congress = [{ res: CONGRESS_MERCENARY, outcome: 1, target: CONGRESS_CUR_PRODUCTION }];
    expect(unitProdCost(state, 0, 'WARRIOR', 215)).toBe(108);
    expect(unitProdCost(state, 0, 'BUILDER', 215)).toBe(215);
  });

  it('A bans the named plant, B boosts its production', () => {
    const state = makeState();
    const plant = POWER_PLANT_IDS[1];
    state.congress = [{ res: CONGRESS_GLOBAL_ENERGY, outcome: 0, target: 1 }];
    expect(congressEnergyBlocked(state)).toBe(plant);
    expect(congressEnergyProdMult(state, plant)).toBe(1);
    state.congress = [{ res: CONGRESS_GLOBAL_ENERGY, outcome: 1, target: 1 }];
    expect(congressEnergyBlocked(state)).toBe(null);
    expect(congressEnergyProdMult(state, plant)).toBe(2);
  });
});

describe('the two military cards', () => {
  it('After Action Reports and Logistics', () => {
    expect(POLICIES.AFTER_ACTION_REPORTS.effects.xpPct).toBe(50);
    const state = makeState();
    const city = settleFirstCity(state, 0);
    const unit = { type: 'WARRIOR', seat: 0, tileIndex: city.centerIndex };
    const before = startTileMoves(state, unit);
    const s0 = state.seats[0];
    s0.research.civics.push('CODE_OF_LAWS', 'MERCANTILISM');
    s0.government.chosen = 'CHIEFDOM';
    s0.government.policies = ['LOGISTICS'];
    expect(getModifiers(state, 0).homeStartMoves).toBe(1);
    expect(startTileMoves(state, unit)).toBe(before + 1);
  });
});
