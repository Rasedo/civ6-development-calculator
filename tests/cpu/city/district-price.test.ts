import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat } from '../../../cpu/core/seats';
import { districtCostIn, districtScaledBase, districtProgressAdd, districtCost, districtDiscountMult, DISTRICT_SPECIALTY_COST } from '../../../cpu/core/game';
import { DISTRICTS } from '../../../cpu/data/districts';
import { GAME_SPEED } from '../../../cpu/data/constants';
import { TECHS } from '../../../cpu/data/techs';
import { CIVICS } from '../../../cpu/data/civics';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (`Districts.Cost`): each row carries its OWN base — Aqueduct 36, Canal
 * and Dam 81, Government Plaza and Diplomatic Quarter 30, Spaceport 1800,
 * every specialty row 54 — where this engine priced them all as a Campus.
 * And `Districts.CostProgressionParam1` is the UNDER-REPRESENTED discount: 40
 * everywhere the install writes it, 25 for the two plaza rows.
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

  it('starts every row at its own base, whichever model it is on', () => {
    const state = scene();
    const rs = state.seats[0].research;
    const campus = districtScaledBase(rs, 'CAMPUS');
    const aqueduct = districtScaledBase(rs, 'AQUEDUCT');
    const canal = districtScaledBase(rs, 'CANAL');
    // an Aqueduct is CHEAPER than a Campus and a Canal dearer — the whole
    // point of the per-row base
    expect(aqueduct).toBeLessThan(campus);
    expect(canal).toBeGreaterThan(campus);
    // at zero research the two models AGREE, which is exactly why this test
    // could not tell them apart before: the specialty curve is
    // base x (1 + 9p) and the GAME_PROGRESS one base + floor(param x p),
    // and both are `base` at p = 0.
    for (const [base, got] of [[36, aqueduct], [54, campus], [81, canal]] as const) {
      expect(got).toBe(Math.round(base * GAME_SPEED));
      expect(districtProgressAdd(rs, 'CAMPUS')).toBe(0);
    }
  });

  it('parts the two models the moment research lands', () => {
    // CIV6 (`Districts.CostProgressionModel`): six rows take
    // COST_PROGRESSION_GAME_PROGRESS with Param1 1000 — the Aqueduct, Bath,
    // Neighborhood, Mbanza, Canal and Dam — and every other specialty row
    // takes NUM_UNDER_AVG_PLUS_TECH. The first climbs by a FLAT add on the
    // game's own progress; the second multiplies its base.
    const state = scene();
    const rs = state.seats[0].research;
    rs.techs.push(...Object.keys(TECHS).slice(0, Math.ceil(Object.keys(TECHS).length / 2)));
    const p = Math.max(rs.techs.length / Object.keys(TECHS).length,
      rs.civics.length / Object.keys(CIVICS).length);
    expect(p).toBeGreaterThan(0);

    // the specialty row MULTIPLIES
    expect(districtScaledBase(rs, 'CAMPUS'))
      .toBe(Math.floor(Math.round(54 * GAME_SPEED) * (1 + 9 * p)));
    expect(districtProgressAdd(rs, 'CAMPUS')).toBe(0);

    // ...and a GAME_PROGRESS row keeps its flat base and ADDS
    for (const [id, base] of [['AQUEDUCT', 36], ['CANAL', 81], ['DAM', 81],
      ['NEIGHBORHOOD', 54]] as const) {
      expect(districtScaledBase(rs, id)).toBe(Math.round(base * GAME_SPEED));
      expect(districtProgressAdd(rs, id))
        .toBe(Math.floor(Math.round(1000 * GAME_SPEED) * p));
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
