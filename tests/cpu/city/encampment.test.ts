import { describe, it, expect } from 'vitest';
import { BARB_SEAT, seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { purchaseUnit } from '../../../cpu/core/game';
import { seatPhase } from '../../../cpu/core/phase';
import { spawnUnit } from '../../../cpu/core/units';
import { encampmentTrainXp } from '../../../cpu/core/combat';
import { citySpecialistSlots } from '../../../cpu/core/city';
import { SPECIALIST_YIELDS } from '../../../cpu/data/greatPeople';

// Encampment residuals — the TS twin of gpu/encampment_test.py.
// Scripted parity (gpu/parity_test.py, 24 seeds) is the primary correctness
// bar; these pin the three ruled items on the TS engine directly.

function battlefield() {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
  return { state, city };
}

/** Plant a COMPLETE unpillaged Encampment district on a tile near the city. */
function addEncampment(state: any, city: any, col: number, row: number) {
  const t = tileAtCoords(state.map, col, row);
  // Real placement writes the TYPE onto the tile as well as into
  // city.districts (game.ts placeDistrict). The gates now read the type off the
  // tile — encampmentIntact folds type + complete + unpillaged + garrison into
  // one predicate — so the fixture has to be consistent the same way.
  t.district = 'ENCAMPMENT';
  t.districtComplete = true;
  t.districtPillaged = false;
  city.districts.push({ type: 'ENCAMPMENT', tileIndex: t.index });
  return t;
}

describe('Encampment', () => {
  it('specialist slot: SPECIALIST_YIELDS.ENCAMPMENT and citySpecialistSlots', () => {
    expect(SPECIALIST_YIELDS.ENCAMPMENT).toEqual({ production: 1, gold: 2 }); // CIV6: Commanders +1 production +2 gold
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
    seatOf(state, 0)!.treasury = 9999;
    const before = state.units.length;
    const res = purchaseUnit(state, city.id, 'WARRIOR', 0);
    expect(res.ok).toBe(true);
    expect(state.units.length).toBe(before + 1);
    expect(state.units[state.units.length - 1].xp).toBe(5);
  });

  it('the ADDITIONAL Encampment strike fires (and only when complete)', () => {
    const { state, city } = battlefield();
    addEncampment(state, city, 10, 9);
    const center = state.map.tiles[city.centerIndex];
    const near = tileAtCoords(state.map, center.col - 1, center.row); // adjacent -> in range
    // a barbarian is hostile with no war bookkeeping and holds still through
    // seatPhase (barbarians act in barbarianPhase, which never runs here)
    const raider = spawnUnit(state, 'SPEARMAN', near.index, BARB_SEAT)!;
    raider.hp = 100;
    seatPhase(state);
    expect(raider.hp).toBeLessThan(100); // the Encampment strike landed
    expect(raider.xp).toBeUndefined(); // barbarians never accrue XP (capsOf)
  });

  it('control: an incomplete Encampment strikes nothing', () => {
    const { state, city } = battlefield();
    const enc = addEncampment(state, city, 10, 9);
    enc.districtComplete = false; // not yet built
    const center = state.map.tiles[city.centerIndex];
    const near = tileAtCoords(state.map, center.col - 1, center.row);
    const raider = spawnUnit(state, 'SPEARMAN', near.index, BARB_SEAT)!;
    raider.hp = 100;
    seatPhase(state);
    expect(raider.hp).toBe(100);
  });

  it('walls + Encampment rolls twice, walls first', () => {
    const { state, city } = battlefield();
    city.buildings.push('ANCIENT_WALLS');
    addEncampment(state, city, 10, 9);
    const center = state.map.tiles[city.centerIndex];
    const near = tileAtCoords(state.map, center.col - 1, center.row);
    const raider = spawnUnit(state, 'SPEARMAN', near.index, BARB_SEAT)!;
    raider.hp = 100;
    const log: string[] = [];
    (globalThis as any).__cbLog = log;
    try {
      seatPhase(state);
    } finally {
      delete (globalThis as any).__cbLog;
    }
    const ks = log.map((e) => e.split(' ')[0]).filter((k) => k === 'k:cstk' || k === 'k:estk');
    expect(ks).toContain('k:cstk');
    expect(ks).toContain('k:estk');
    expect(ks.indexOf('k:cstk')).toBeLessThan(ks.indexOf('k:estk')); // walls before Encampment
  });
});
