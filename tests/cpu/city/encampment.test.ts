import { describe, it, expect } from 'vitest';
import { BARB_SEAT, seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { purchaseUnit } from '../../../cpu/core/game';
import { seatPhase } from '../../../cpu/core/phase';
import { spawnUnit } from '../../../cpu/core/units';
import { trainXpPct } from '../../../cpu/core/combat';
import { citySpecialistSlots } from '../../../cpu/core/city';
import { SPECIALIST_YIELDS } from '../../../cpu/data/greatPeople';
import { EMERGENCY_TARGET_STRIKE_CS } from '../../../cpu/data/seats';

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

  it('training XP: the Encampment lines are a PERCENTAGE, and they stack', () => {
    const { state, city } = battlefield();
    expect(trainXpPct(state, { ...city, buildings: [] }, 'MELEE')).toBe(0);
    expect(trainXpPct(state, { ...city, buildings: ['MONUMENT'] }, 'MELEE')).toBe(0);
    expect(trainXpPct(state, { ...city, buildings: ['BARRACKS'] }, 'MELEE')).toBe(25);
    expect(trainXpPct(state, { ...city, buildings: ['STABLE'] }, 'HEAVY_CAV')).toBe(25);
    expect(trainXpPct(state, { ...city, buildings: ['BARRACKS', 'ARMORY'] }, 'MELEE')).toBe(50);
    expect(trainXpPct(state, { ...city, buildings: ['ARMORY', 'MILITARY_ACADEMY'] }, 'MELEE')).toBe(50);
  });

  it('training XP end-to-end: a purchased military unit carries the percentage for life', () => {
    const { state, city } = battlefield();
    city.buildings.push('BARRACKS');
    seatOf(state, 0)!.treasury = 9999;
    const before = state.units.length;
    const res = purchaseUnit(state, city.id, 'WARRIOR', 0);
    expect(res.ok).toBe(true);
    expect(state.units.length).toBe(before + 1);
    const u = state.units[state.units.length - 1];
    expect(u.xp).toBe(0); // the line is a MULTIPLIER, never a lump of starting XP
    expect(u.xpPct).toBe(25);
  });

  /** The roll-log lines a `seatPhase` fires at a raider standing next to the city. */
  function strikeLog(state: any, city: any): string[] {
    const center = state.map.tiles[city.centerIndex];
    const near = tileAtCoords(state.map, center.col - 1, center.row); // adjacent -> in range
    // a barbarian is hostile with no war bookkeeping and holds still through
    // seatPhase (barbarians act in barbarianPhase, which never runs here)
    const raider = spawnUnit(state, 'SPEARMAN', near.index, BARB_SEAT)!;
    raider.hp = 100;
    const log: string[] = [];
    (globalThis as any).__cbLog = log;
    try {
      seatPhase(state);
    } finally {
      delete (globalThis as any).__cbLog;
    }
    expect(raider.xp).toBeUndefined(); // barbarians never accrue XP (capsOf)
    return log.filter((e) => e.startsWith('k:cstk ') || e.startsWith('k:estk '));
  }
  const strikeKeys = (state: any, city: any): string[] => strikeLog(state, city).map((e) => e.split(' ')[0]);
  /** each strike key's logged strength diff, in the log's tenths */
  function strikeDiffs(state: any, city: any): Record<string, number> {
    const out: Record<string, number> = {};
    for (const line of strikeLog(state, city)) out[line.split(' ')[0]] = Number(/ diff(-?\d+) /.exec(line)![1]);
    return out;
  }

  it('walls + Encampment rolls twice, walls first', () => {
    const { state, city } = battlefield();
    city.buildings.push('ANCIENT_WALLS');
    addEncampment(state, city, 10, 9);
    const ks = strikeKeys(state, city);
    expect(ks).toContain('k:cstk');
    expect(ks).toContain('k:estk');
    expect(ks.indexOf('k:cstk')).toBeLessThan(ks.indexOf('k:estk')); // walls before Encampment
  });

  it('CIV6: a survived Military Emergency pays its +2 on the Encampment shot as on the centre', () => {
    // Expansion1_Emergencies.xml gates the reward on COMBAT_DISTRICT_VS_UNIT.
    // Each shot is measured ALONE at a full-HP raider: the centre's harder
    // hit would otherwise step the integer wound penalty the district reads.
    const diffs = (survived: boolean, encampmentOnly: boolean) => {
      const { state, city } = battlefield();
      city.buildings.push('ANCIENT_WALLS');
      if (encampmentOnly) {
        city.outerHp = 0; // the CITY perimeter beaten down; the district's own stands
        addEncampment(state, city, 10, 9);
      }
      if (survived) seatOf(state, 0)!.emgStrike = Object.assign([], { [BARB_SEAT]: 1 });
      return strikeDiffs(state, city);
    };
    expect(diffs(true, false)['k:cstk'] - diffs(false, false)['k:cstk']).toBe(EMERGENCY_TARGET_STRIKE_CS * 10);
    expect(diffs(true, true)['k:estk'] - diffs(false, true)['k:estk']).toBe(EMERGENCY_TARGET_STRIKE_CS * 10);
  });

  it('control: an incomplete Encampment strikes nothing', () => {
    const { state, city } = battlefield();
    city.buildings.push('ANCIENT_WALLS');
    const enc = addEncampment(state, city, 10, 9);
    enc.districtComplete = false; // not yet built
    expect(strikeKeys(state, city)).toEqual(['k:cstk']);
  });

  it('CIV6: the Encampment strikes only while ITS OWN perimeter stands', () => {
    const { state, city } = battlefield();
    addEncampment(state, city, 10, 9);
    expect(strikeKeys(state, city)).toEqual([]); // no walls -> no outer defense at all

    // the pools are SEPARATE: the city's breach does not silence the district
    const walled = battlefield();
    walled.city.buildings.push('ANCIENT_WALLS');
    walled.city.outerHp = 0; // the CITY perimeter beaten down
    addEncampment(walled.state, walled.city, 10, 9);
    expect(strikeKeys(walled.state, walled.city)).toEqual(['k:estk']);

    // ...and the DISTRICT's own breach does
    const breached = battlefield();
    breached.city.buildings.push('ANCIENT_WALLS');
    const benc = addEncampment(breached.state, breached.city, 10, 9);
    benc.encampOuterHp = 0;
    expect(strikeKeys(breached.state, breached.city)).toEqual(['k:cstk']);
  });
});
