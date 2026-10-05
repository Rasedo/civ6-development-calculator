import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords, expandBorders, grantTechs } from '../helpers';
import { purchaseReligiousUnit, unitBuyOffPct, unitFaithCost, unitFaithPrice, unitsAcquired } from '../../../cpu/core/game';
import { purchaseStep } from '../../../cpu/core/effects';   // every price is floored to a multiple of five (measured)
import { spawnUnit } from '../../../cpu/core/units';
import { UNITS } from '../../../cpu/data/units';
import { FAITH_PURCHASE_MULT } from '../../../cpu/data/constants';
import type { GameState } from '../../../cpu/core/types';

// CIV6 (Units.xml, COST_PROGRESSION_PREVIOUS_COPIES): every copy a seat has
// already acquired raises the next one's Cost by that row's
// CostProgressionParam1 — Missionary 6, Apostle 15, Inquisitor 6, Rock Band 50,
// Naturalist 50 (the GS layer's Update, which replaces the Base row's 800/100).
// The Warrior Monk carries no progression row and stays flat forever.

function holyCity(): { state: GameState; cityId: number } {
  const state = makeState(makeMap(16, 16));
  state.unitsMode = true;
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  expandBorders(state, city, 2);
  grantTechs(state, 'ASTROLOGY');
  const hs = tileAtCoords(state.map, 9, 8);
  hs.district = 'HOLY_SITE';
  hs.districtComplete = true;
  city.districts.push({ type: 'HOLY_SITE', tileIndex: hs.index });
  city.buildings.push('SHRINE', 'TEMPLE');
  city.followedReligion = 0;
  const s = seatOf(state, 0)!;
  s.faith = 100000;
  s.religion = { ...s.religion, founded: true, follower: 'WARRIOR_MONKS' };
  return { state, cityId: city.id };
}

describe('the faith price climbs with the copies already acquired', () => {
  it('charges the Missionary its own CostProgressionParam1 per copy', () => {
    const { state, cityId } = holyCity();
    const s = seatOf(state, 0)!;
    const base = UNITS.MISSIONARY.cost * FAITH_PURCHASE_MULT;
    const step = UNITS.MISSIONARY.costStep! * FAITH_PURCHASE_MULT;
    expect(step).toBeGreaterThan(0);

    let purse = s.faith!;
    for (let n = 0; n < 3; n += 1) {
      expect(unitFaithCost('MISSIONARY', unitsAcquired(state, 0, 'MISSIONARY')))
        .toBe(base + n * step);
      expect(purchaseReligiousUnit(state, cityId, 'MISSIONARY', 0).ok).toBe(true);
      expect(s.faith).toBe(purse - purchaseStep(base + n * step));
      purse = s.faith!;
      // the live ones are disbanded so the chassis cap never refuses the next
      state.units = state.units.filter((u) => u.type !== 'MISSIONARY');
      expect(unitsAcquired(state, 0, 'MISSIONARY')).toBe(n + 1);
    }
  });

  it('counts a copy that was never bought — the Great Prophet\'s free Apostle', () => {
    const { state, cityId } = holyCity();
    const base = UNITS.APOSTLE.cost * FAITH_PURCHASE_MULT;
    // the online Cost after one copy is (200 + 15) / 2 floored ONCE: 107, so
    // the faith price is 214, not 200 + 2 x 7.5 (runs/h1_duelw1105, China's
    // second Apostle at 107)
    const next = 107 * FAITH_PURCHASE_MULT;
    expect(unitFaithCost('APOSTLE', unitsAcquired(state, 0, 'APOSTLE'))).toBe(base);

    // the free Apostle a founded seat's next Great Prophet grants: a copy
    // ACQUIRED, so it prices the next one, exactly as a purchase would
    spawnUnit(state, 'APOSTLE', tileAtCoords(state.map, 8, 8).index, 0);
    expect(unitsAcquired(state, 0, 'APOSTLE')).toBe(1);
    expect(unitFaithCost('APOSTLE', unitsAcquired(state, 0, 'APOSTLE'))).toBe(next);

    state.units = state.units.filter((u) => u.type !== 'APOSTLE');
    const s = seatOf(state, 0)!;
    const before = s.faith!;
    expect(purchaseReligiousUnit(state, cityId, 'APOSTLE', 0).ok).toBe(true);
    expect(s.faith).toBe(before - purchaseStep(next));
  });

  it('leaves the Warrior Monk flat, and keeps each chassis\' tally its own', () => {
    const { state, cityId } = holyCity();
    const s = seatOf(state, 0)!;
    const monk = UNITS.WARRIOR_MONK.cost * FAITH_PURCHASE_MULT;
    expect(UNITS.WARRIOR_MONK.costStep).toBeUndefined();

    for (let n = 0; n < 2; n += 1) {
      const before = s.faith!;
      expect(purchaseReligiousUnit(state, cityId, 'WARRIOR_MONK', 0).ok).toBe(true);
      expect(s.faith).toBe(before - monk);
    }
    // a Monk bought twice moves no other chassis' price
    expect(unitsAcquired(state, 0, 'MISSIONARY')).toBe(0);
    expect(unitFaithCost('MISSIONARY', unitsAcquired(state, 0, 'MISSIONARY')))
      .toBe(UNITS.MISSIONARY.cost * FAITH_PURCHASE_MULT);
  });

  it('takes an enhancer\'s percent off the climbed price', () => {
    // CIV6 (Holy Order): the belief discounts the Missionary's and the
    // Apostle's Cost, and the install progresses the Cost first — so the
    // percent comes off the climbed price, summed with the seat's others.
    const { state } = holyCity();
    const s = seatOf(state, 0)!;
    s.religion = { ...s.religion, enhancer: 'HOLY_ORDER' };
    expect(unitBuyOffPct(state, 0, 'MISSIONARY')).toBe(30);
    expect(unitBuyOffPct(state, 0, 'APOSTLE')).toBe(30);
    expect(unitBuyOffPct(state, 0, 'INQUISITOR')).toBe(0);
    s.unitsAcquired = { MISSIONARY: 2 };
    const climbed = unitFaithCost('MISSIONARY', 2);
    expect(climbed).toBe(Math.round((UNITS.MISSIONARY.cost + 2 * UNITS.MISSIONARY.costStep!) * FAITH_PURCHASE_MULT));
    expect(unitFaithPrice(state, 0, 'MISSIONARY')).toBe(purchaseStep(climbed * 0.7));
  });
});
