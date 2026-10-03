import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords, expandBorders, grantTechs } from '../helpers';
import { purchaseReligiousUnit, guruHeal } from '../../../cpu/core/game';
import { buyContext } from '../../../cpu/core/buyCandidates';
import { spawnUnit } from '../../../cpu/core/units';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { maskCtx, unitMask } from '../../../cpu/core/unitMask';
import { IMPROVEMENT_IDS, unitActionIndex } from '../../../cpu/core/unitActions';
import { UNITS, UNIT_HP } from '../../../cpu/data/units';
import { GURU_CAP, GURU_HEAL } from '../../../cpu/data/religion';
import type { GameState, Unit } from '../../../cpu/core/types';

/**
 * THE GURU (Units.xml UNIT_GURU): faith-only behind a Temple, ReligiousStrength
 * 90, 4 Movement, three ReligiousHealCharges. "May use a charge to heal itself
 * and all adjacent friendly religious units. May not initiate theological
 * combat with units of other Religions (but can defend)." One charge heals
 * COMBAT_HEAL_RELIGIOUS_CHARGE 40.
 *
 * The GPU twin is tests/gpu/guru_test.py.
 */
const HEAL = unitActionIndex(IMPROVEMENT_IDS).HEAL_RELIGIOUS;

function holyCity(temple = true): { state: GameState; cityId: number } {
  const state = makeState(makeMap(16, 16));
  state.unitsMode = true;
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  expandBorders(state, city, 2);
  grantTechs(state, 'ASTROLOGY');
  const hs = tileAtCoords(state.map, 9, 8);
  hs.district = 'HOLY_SITE';
  hs.districtComplete = true;
  city.districts.push({ type: 'HOLY_SITE', tileIndex: hs.index });
  city.buildings.push('SHRINE');
  if (temple) city.buildings.push('TEMPLE');
  city.followedReligion = 0;
  const s = seatOf(state, 0)!;
  s.faith = 100000;
  s.religion = { ...s.religion, founded: true };
  return { state, cityId: city.id };
}

const order = (state: GameState, u: Unit, col: number) => applySeatUnitOrders(
  state, seatOf(state, 0) as never, [state.units.filter((x) => x.seat === 0).map((x) => (x === u ? col : -1))]);

describe('the Guru', () => {
  it('reads the install', () => {
    const g = UNITS.GURU;
    expect(g.faithOnly).toBe(true);
    expect(g.religiousStrength).toBe(90);
    expect(g.moves).toBe(4);
    expect(g.charges).toBe(3);
    expect(g.combat).toBe(0);
    expect(GURU_HEAL).toBe(40);
  });

  it('is bought with faith in a city with a Temple, up to the cap', () => {
    const none = holyCity(false);
    expect(buyContext(none.state, 0).guru_ok).toBe(false);
    expect(purchaseReligiousUnit(none.state, none.cityId, 'GURU', 0).ok).toBe(false);
    const { state, cityId } = holyCity();
    const ctx = buyContext(state, 0);
    expect(ctx.guru_ok).toBe(true);
    expect(ctx.guru_city).toBe(tileAtCoords(state.map, 8, 8).index);
    expect(purchaseReligiousUnit(state, cityId, 'GURU', 0).ok).toBe(true);
    const g = state.units.find((u) => u.type === 'GURU')!;
    expect(g.charges).toBe(3);
    expect(state.units.filter((u) => u.type === 'GURU').length).toBe(GURU_CAP);
    expect(buyContext(state, 0).guru_ok).toBe(false);
  });

  it('heals itself and the adjacent friendly religious units with a charge', () => {
    const { state } = holyCity();
    const at = tileAtCoords(state.map, 7, 7).index;
    const g = spawnUnit(state, 'GURU', at, 0)!;
    const m = spawnUnit(state, 'MISSIONARY', tileAtCoords(state.map, 6, 7).index, 0)!;
    const far = spawnUnit(state, 'APOSTLE', tileAtCoords(state.map, 4, 7).index, 0)!;
    // nothing wounded: no heal on offer
    expect(unitMask(maskCtx(state, 0), g)).not.toContain(HEAL);
    g.hp = 30;
    m.hp = 80;
    far.hp = 10;
    expect(unitMask(maskCtx(state, 0), g)).toContain(HEAL);
    order(state, g, HEAL);
    expect(g.hp).toBe(30 + GURU_HEAL);
    expect(m.hp).toBe(UNIT_HP);
    expect(far.hp).toBe(10);
    expect(g.charges).toBe(2);
    expect(g.movesLeft).toBe(0);
  });

  it('spends no charge where nothing is wounded, and none once it has none', () => {
    const { state } = holyCity();
    const g = spawnUnit(state, 'GURU', tileAtCoords(state.map, 7, 7).index, 0)!;
    expect(guruHeal(state, g).ok).toBe(false);
    g.hp = 50;
    g.charges = 0;
    expect(unitMask(maskCtx(state, 0), g)).not.toContain(HEAL);
    expect(guruHeal(state, g).ok).toBe(false);
    expect(g.hp).toBe(50);
  });
});
