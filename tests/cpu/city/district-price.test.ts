import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat } from '../../../cpu/core/seats';
import { districtCostIn, districtCost, districtDiscountMult, DISTRICT_SPECIALTY_COST } from '../../../cpu/core/game';
import { DISTRICTS } from '../../../cpu/data/districts';
import { GAME_SPEED } from '../../../cpu/data/constants';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (`Districts.Cost`): each row carries its OWN base — Aqueduct 36, Canal
 * and Dam 81, Government Plaza and Diplomatic Quarter 30, Spaceport 1800,
 * every specialty row 54 — where this engine priced them all as a Campus.
 * And `Districts.CostProgressionParam1` is the UNDER-REPRESENTED discount: 40
 * everywhere the install writes it, 25 for the two plaza rows (B-67).
 *
 * The GPU twin is tests/gpu/district_price_test.py.
 */
function scene(): GameState {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  return state;
}

describe('a district is priced off its own row', () => {
  it('reads the install: the bases this engine had flattened to one', () => {
    expect(DISTRICTS.AQUEDUCT.cost).toBe(36);
    expect(DISTRICTS.CANAL.cost).toBe(81);
    expect(DISTRICTS.DAM.cost).toBe(81);
    expect(DISTRICTS.GOVERNMENT_PLAZA.cost).toBe(30);
    expect(DISTRICTS.DIPLOMATIC_QUARTER.cost).toBe(30);
    expect(DISTRICTS.NEIGHBORHOOD.cost).toBe(54);
    expect(DISTRICTS.CAMPUS.cost).toBe(DISTRICT_SPECIALTY_COST);
  });

  it('scales each base by the SAME research factor', () => {
    const state = scene();
    const rs = state.seats[0].research;
    const campus = districtCostIn(rs, DISTRICTS.CAMPUS.cost);
    const aqueduct = districtCostIn(rs, DISTRICTS.AQUEDUCT.cost);
    const canal = districtCostIn(rs, DISTRICTS.CANAL.cost);
    // an Aqueduct is CHEAPER than a Campus and a Canal dearer — the whole
    // point of the per-row base
    expect(aqueduct).toBeLessThan(campus);
    expect(canal).toBeGreaterThan(campus);
    // and each is its own base through the one curve
    for (const [base, got] of [[36, aqueduct], [54, campus], [81, canal]] as const) {
      expect(got).toBe(Math.floor(Math.round(base * GAME_SPEED) * 1));  // no research yet
    }
  });

  it('takes 40% off a specialty row and 25% off the two plaza rows', () => {
    expect(districtDiscountMult('CAMPUS')).toBeCloseTo(0.6);
    expect(districtDiscountMult('HARBOR')).toBeCloseTo(0.6);
    expect(districtDiscountMult('GOVERNMENT_PLAZA')).toBeCloseTo(0.75);
    expect(districtDiscountMult('DIPLOMATIC_QUARTER')).toBeCloseTo(0.75);
    // the two that differ are the ONLY two, or the install's 40 is not the rule
    const odd = Object.values(DISTRICTS).filter((d) => (d.discountPct ?? 40) !== 40).map((d) => d.id);
    expect(odd.sort()).toEqual(['DIPLOMATIC_QUARTER', 'GOVERNMENT_PLAZA']);
  });

  it('keeps the Spaceport flat, discount and curve alike', () => {
    const state = scene();
    expect(DISTRICTS.SPACEPORT.fixedCost).toBe(true);
    const before = districtCost(state, 0, 'SPACEPORT');
    // research moves every other price and never this one
    state.seats[0].research.techs = ['POTTERY', 'WRITING'];
    expect(districtCost(state, 0, 'SPACEPORT')).toBe(before);
    expect(districtCost(state, 0, 'SPACEPORT')).toBe(Math.round(1800 * GAME_SPEED));
  });

  it('prices an untyped call at the SPECIALTY base, which the observation renders', () => {
    const state = scene();
    expect(districtCost(state, 0)).toBe(
      districtCostIn(state.seats[0].research, DISTRICT_SPECIALTY_COST));
  });
});
