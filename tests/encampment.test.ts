import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { foundCity, purchaseUnit } from '../src/core/game';
import { spawnUnit } from '../src/core/units';
import { barbarianPhase, encampmentTrainXp } from '../src/core/combat';
import { citySpecialistSlots } from '../src/core/city';
import { SPECIALIST_YIELDS } from '../src/data/greatPeople';

// B-17 (ROUND B7) Encampment residuals — the TS twin of gpu/encampment_test.py.
// Scripted parity (gpu/parity_test.py, 24 seeds) is the primary correctness
// bar; these pin the three ruled items on the TS engine directly.

function battlefield() {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  const city = foundCity(state, tileAtCoords(state.map, 9, 9).index).city!;
  return { state, city };
}

/** Plant a COMPLETE unpillaged Encampment district on a tile near the city. */
function addEncampment(state: any, city: any, col: number, row: number) {
  const t = tileAtCoords(state.map, col, row);
  // B-17 (#71): real placement writes the TYPE onto the tile as well as into
  // city.districts (game.ts placeDistrict). The gates now read the type off the
  // tile — encampmentIntact folds type + complete + unpillaged + garrison into
  // one predicate — so the fixture has to be consistent the same way.
  t.district = 'ENCAMPMENT';
  t.districtComplete = true;
  t.districtPillaged = false;
  city.districts.push({ type: 'ENCAMPMENT', tileIndex: t.index });
  return t;
}

describe('B-17 Encampment', () => {
  it('specialist slot: SPECIALIST_YIELDS.ENCAMPMENT and citySpecialistSlots', () => {
    expect(SPECIALIST_YIELDS.ENCAMPMENT).toEqual({ production: 1, gold: 1 });
    const { state, city } = battlefield();
    const enc = addEncampment(state, city, 10, 9);
    city.buildings.push('BARRACKS'); // one Encampment building -> one specialist slot
    const slots = citySpecialistSlots(state, city);
    expect(slots.get(enc.index)).toBe(1);
    // a pillaged Encampment offers no working specialist
    enc.districtPillaged = true;
    expect(citySpecialistSlots(state, city).get(enc.index)).toBeUndefined();
  });

  it('training XP ladder: best military-building tier, not the sum', () => {
    expect(encampmentTrainXp([])).toBe(0);
    expect(encampmentTrainXp(['MONUMENT'])).toBe(0);
    expect(encampmentTrainXp(['BARRACKS'])).toBe(5);
    expect(encampmentTrainXp(['STABLE'])).toBe(5);
    expect(encampmentTrainXp(['BARRACKS', 'ARMORY'])).toBe(10); // best tier
    expect(encampmentTrainXp(['ARMORY', 'MILITARY_ACADEMY'])).toBe(15);
  });

  it('training XP end-to-end: a purchased military unit starts veteran', () => {
    const { state, city } = battlefield();
    city.buildings.push('BARRACKS');
    state.treasury = 9999;
    const before = state.units.length;
    const res = purchaseUnit(state, city.id, 'WARRIOR');
    expect(res.ok).toBe(true);
    expect(state.units.length).toBe(before + 1);
    expect(state.units[state.units.length - 1].xp).toBe(5);
  });

  it('the ADDITIONAL Encampment strike fires (and only when complete)', () => {
    const { state, city } = battlefield();
    addEncampment(state, city, 10, 9);
    state.rivals.push({ id: 0, atWar: true, cities: [] } as any);
    const center = state.map.tiles[city.centerIndex];
    const near = tileAtCoords(state.map, center.col - 1, center.row); // adjacent -> in range
    const rv = spawnUnit(state, 'SPEARMAN', near.index, 'rival', 0)!;
    rv.hp = 100;
    barbarianPhase(state);
    expect(rv.hp).toBeLessThan(100); // the Encampment strike landed
    expect(rv.xp).toBe(2); // survived -> +2 (attacker is the city)
  });

  it('control: an incomplete Encampment strikes nothing', () => {
    const { state, city } = battlefield();
    const enc = addEncampment(state, city, 10, 9);
    enc.districtComplete = false; // not yet built
    state.rivals.push({ id: 0, atWar: true, cities: [] } as any);
    const center = state.map.tiles[city.centerIndex];
    const near = tileAtCoords(state.map, center.col - 1, center.row);
    const rv = spawnUnit(state, 'SPEARMAN', near.index, 'rival', 0)!;
    rv.hp = 100;
    barbarianPhase(state);
    expect(rv.hp).toBe(100);
  });

  it('walls + Encampment rolls twice, walls first', () => {
    const { state, city } = battlefield();
    city.buildings.push('ANCIENT_WALLS');
    addEncampment(state, city, 10, 9);
    state.rivals.push({ id: 0, atWar: true, cities: [] } as any);
    const center = state.map.tiles[city.centerIndex];
    const near = tileAtCoords(state.map, center.col - 1, center.row);
    const rv = spawnUnit(state, 'SPEARMAN', near.index, 'rival', 0)!;
    rv.hp = 100;
    const log: string[] = [];
    (globalThis as any).__cbLog = log;
    try {
      barbarianPhase(state);
    } finally {
      delete (globalThis as any).__cbLog;
    }
    const ks = log.map((e) => e.split(' ')[0]).filter((k) => k === 'k:pcstk' || k === 'k:pestk');
    expect(ks).toContain('k:pcstk');
    expect(ks).toContain('k:pestk');
    expect(ks.indexOf('k:pcstk')).toBeLessThan(ks.indexOf('k:pestk')); // walls before Encampment
  });
});
