/**
 * AIR DEFENSE INITIATIVE.
 *
 * CIV6 (AIR_DEFENSE_INITIATIVE_ANTI_AIR_BONUS,
 * MODIFIER_CITY_ADJUST_AIR_DEFENSE_BONUS, Amount 25): "+25 Combat Strength to
 * anti-air support units within the city's territory when defending against
 * aircraft and ICBMs." Victor's, level 3, behind Embrasure.
 *
 * Nothing here is new machinery: the anti-air strength already answers an air
 * strike, and the territory test is the one Garrison Commander uses. What the
 * row needed was its number, and the install publishes it.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, expandBorders } from '../helpers';
import { airDefenseOf } from '../../../cpu/core/air';
import { AIR_DEFENSE_INITIATIVE_CS, GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX, promotionBitValue } from '../../../cpu/data/governors';
import { governorsOf } from '../../../cpu/core/governors';
import { seatOf, setTileOwner } from '../../../cpu/core/seats';
import { UNITS } from '../../../cpu/data/units';
import type { City, GameState } from '../../../cpu/core/types';

const P_ADI = GOVERNOR_PROMOTION_INDEX.AIR_DEFENSE_INITIATIVE!;
/** the first chassis in the catalog with an anti-air strength of its own. */
const AA_UNIT = Object.values(UNITS).find((u) => (u.antiAir ?? 0) > 0)!;

function scene(): { state: GameState; city: City } {
  const state = makeState(makeMap(16, 16));
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  expandBorders(state, city, 2);
  return { state, city };
}

function seatGov(state: GameState, city: City) {
  const g = governorsOf(seatOf(state, city.seat)!)[GOVERNOR_INDEX.VICTOR];
  g.appointed = true;
  g.cityId = city.id;
  g.establishTurns = 0;
  g.promotions = promotionBitValue(P_ADI);
}

describe('the row carries the install amount', () => {
  it('is 25', () => {
    expect(AIR_DEFENSE_INITIATIVE_CS).toBe(25);
  });
});

describe('what the promotion defends', () => {
  it('pays an ANTI-AIR unit inside the governed territory', () => {
    const { state, city } = scene();
    const t = tileAtCoords(state.map, 9, 8);
    const u = { type: AA_UNIT.id, seat: 0, tileIndex: t.index };
    const plain = airDefenseOf(state, u);
    expect(plain).toBeGreaterThan(0);
    seatGov(state, city);
    expect(airDefenseOf(state, u)).toBe(plain + AIR_DEFENSE_INITIATIVE_CS);
  });

  it('pays nothing outside the seat\u2019s own ground', () => {
    const { state, city } = scene();
    seatGov(state, city);
    const far = tileAtCoords(state.map, 14, 14);
    setTileOwner(far, 1, 0);
    const u = { type: AA_UNIT.id, seat: 0, tileIndex: far.index };
    expect(airDefenseOf(state, u)).toBe(airDefenseOf(state, { type: AA_UNIT.id, seat: 0 }));
  });

  it('pays nothing to a unit with no anti-air strength of its own', () => {
    const { state, city } = scene();
    seatGov(state, city);
    const t = tileAtCoords(state.map, 9, 8);
    const w = { type: 'WARRIOR', seat: 0, tileIndex: t.index };
    expect(UNITS.WARRIOR?.antiAir ?? 0).toBe(0);
    expect(airDefenseOf(state, w)).toBe(UNITS.WARRIOR!.combat);
  });
});
