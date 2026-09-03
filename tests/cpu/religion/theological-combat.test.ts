import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { spawnUnit, unitsAt, refreshUnits, religiousHeal, holySiteFaith, RELIGIOUS_HEAL_PER_FAITH } from '../../../cpu/core/units';
import { theoDefenseStrength, flankCount, supportCount, FLANK_SUPPORT_CIVIC, FORT_DEFENSE_CS, THEO_HOLY_GROUND_STRENGTH, THEO_HOLY_CITY_STRENGTH } from '../../../cpu/core/combat';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { neighbors } from '../../../world/hex';
import { isWater } from '../../../world/query';
import { endTurn } from '../../../cpu/core/game';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { UNITS } from '../../../cpu/data/units';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { THEO_PRESSURE_RANGE } from '../../../cpu/data/religion';
import type { City, GameState, Seat, Unit } from '../../../cpu/core/types';

// CIV6: "Theological combat and city combat damage calculation work the same
// way as normal combat" — the exponential roll on the RELIGIOUS-strength
// difference, wound penalty included.

function duel(atkHp = 100, defHp = 100, defType = 'APOSTLE'): { state: GameState; att: Unit; def: Unit } {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  const a = tileAtCoords(state.map, 9, 9);
  const b = tileAtCoords(state.map, 10, 9);
  const att = spawnUnit(state, 'APOSTLE', a.index, 0)!;
  const def = spawnUnit(state, defType, b.index, 1)!;
  att.hp = atkHp;
  def.hp = defHp;
  return { state, att, def };
}

describe('theological combat', () => {
  it('CIV6 religious strengths, exact: Apostle 110, Missionary 100', () => {
    expect(UNITS.APOSTLE.religiousStrength).toBe(110);
    expect(UNITS.MISSIONARY.religiousStrength).toBe(100);
  });

  it('the blows ROLL, on the same exponential curve a military fight uses', () => {
    // A Missionary cannot initiate, so this is ONE exchange. 110 vs 100 puts
    // the Apostle's blow at 30*e^0.4*[0.8, 1.2] and the reply at 30*e^-0.4*[...].
    const seen = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const { state, att, def } = duel(100, 100, 'MISSIONARY');
      state.rngState = seed * 7919 + 1;
      endTurn(state);
      const dealt = 100 - def.hp;
      const taken = 100 - att.hp;
      expect(dealt).toBeGreaterThanOrEqual(36);
      expect(dealt).toBeLessThanOrEqual(54);
      expect(taken).toBeGreaterThanOrEqual(16);
      expect(taken).toBeLessThanOrEqual(24);
      seen.add(dealt);
    }
    expect(seen.size).toBeGreaterThan(3); // a roll, not a constant
  });

  it('two Apostles both initiate, so an even pair trades twice a turn', () => {
    const { state, def } = duel();
    state.rngState = 12345;
    endTurn(state);
    expect(100 - def.hp).toBeGreaterThanOrEqual(48); // two even exchanges
    expect(100 - def.hp).toBeLessThanOrEqual(72);
  });

  it('the stronger side deals more and takes less', () => {
    let apostleDealt = 0;
    let missionaryDealt = 0;
    for (let seed = 0; seed < 20; seed++) {
      const { state, att, def } = duel(100, 100, 'MISSIONARY');
      state.rngState = seed * 104729 + 3;
      endTurn(state);
      apostleDealt += 100 - def.hp;
      missionaryDealt += 100 - att.hp;
    }
    expect(apostleDealt).toBeGreaterThan(missionaryDealt);
  });

  it('CIV6: a wounded unit fights at reduced RELIGIOUS strength', () => {
    let healthyTook = 0;
    let woundedTook = 0;
    for (let seed = 0; seed < 20; seed++) {
      {
        const { state, att } = duel(100, 100);
        state.rngState = seed * 15485863 + 11;
        endTurn(state);
        healthyTook += 100 - att.hp;
      }
      {
        // the DEFENDER is the wounded one, so its blow is the weaker of the two
        const { state, att } = duel(100, 40);
        state.rngState = seed * 15485863 + 11;
        endTurn(state);
        woundedTook += 100 - att.hp;
      }
    }
    expect(woundedTook).toBeLessThan(healthyTook);
  });

  it('CIV6: the duel sways cities within 10 tiles', () => {
    expect(THEO_PRESSURE_RANGE).toBe(10);
  });
});


// --- the terms the Theological combat page adds to the roll -----------------

describe('theological combat: location, flanking and the advance', () => {
  function holyScene(): { state: GameState; att: Unit; def: Unit; city: City; seat1: Seat } {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    const centre = tileAtCoords(state.map, 10, 10);
    settleAt(state, centre.index);
    const city = state.seats[0].cities[0];
    const seat1 = state.seats[1];
    seat1.religion.founded = true;
    const a = tileAtCoords(state.map, 8, 8);
    const b = tileAtCoords(state.map, 9, 8);
    const att = spawnUnit(state, 'APOSTLE', a.index, 0)!;
    const def = spawnUnit(state, 'APOSTLE', b.index, 1)!;
    return { state, att, def, city, seat1 };
  }

  it('the location bonuses are the DEFENDER\'s, and they stack in a Holy City', () => {
    const { state, def, city, seat1 } = holyScene();
    const tile = state.map.tiles[def.tileIndex];
    setTileOwner(tile, 0, city.id);
    expect(theoDefenseStrength(state, def, tile)).toBe(0); // the city follows nobody yet

    city.followedReligion = seat1.seat;
    expect(theoDefenseStrength(state, def, tile)).toBe(THEO_HOLY_GROUND_STRENGTH);

    // the same territory, now the religion's HOLY CITY: both bonuses
    seat1.religion.holyTile = city.centerIndex;
    expect(theoDefenseStrength(state, def, tile))
      .toBe(THEO_HOLY_GROUND_STRENGTH + THEO_HOLY_CITY_STRENGTH);

    // a FORT is an improvement, so it survives the "no physical terrain" rule;
    // a HILL is terrain, so it does not.
    tile.improvement = 'FORT';
    tile.elevation = 'HILLS';
    expect(theoDefenseStrength(state, def, tile))
      .toBe(THEO_HOLY_GROUND_STRENGTH + THEO_HOLY_CITY_STRENGTH + FORT_DEFENSE_CS);
  });

  it('the attacker enters the tile of the defender it kills', () => {
    const { state, att, def } = holyScene();
    const target = def.tileIndex;
    def.hp = 1;
    endTurn(state);
    expect(state.units.some((u) => u.id === def.id)).toBe(false);
    expect(att.tileIndex).toBe(target);
  });

  it('a surviving defender leaves the attacker where it stood', () => {
    const { state, att, def } = holyScene();
    const from = att.tileIndex;
    endTurn(state);
    expect(def.hp).toBeGreaterThan(0);
    expect(att.tileIndex).toBe(from);
  });

  it('flanking and support move the roll', () => {
    const { state, att, def, seat1 } = holyScene();
    state.seats[0].research.civics.push(FLANK_SUPPORT_CIVIC);
    seat1.research.civics.push(FLANK_SUPPORT_CIVIC);
    const dt = state.map.tiles[def.tileIndex];
    // a seat-0 warrior beside the DEFENDER flanks for the attacker
    spawnUnit(state, 'WARRIOR', neighbors(state.map, dt).find((t) => t.index !== att.tileIndex)!.index, 0);
    expect(flankCount(state, def.tileIndex, att)).toBe(1);
    // a seat-1 warrior beside the defender supports it
    spawnUnit(state, 'WARRIOR', neighbors(state.map, dt).find(
      (t) => t.index !== att.tileIndex && unitsAt(state, t.index).length === 0)!.index, 1);
    expect(supportCount(state, def.tileIndex, def)).toBe(1);
  });
});

describe('religious healing', () => {
  it('a religious unit heals only beside its own Holy Site, at 3x its faith', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    const centre = tileAtCoords(state.map, 10, 10);
    settleAt(state, centre.index);
    const city = state.seats[0].cities[0];
    const site = neighbors(state.map, centre).find((t) => !isWater(t))!;
    setTileOwner(site, 0, city.id);
    site.district = 'HOLY_SITE';
    site.districtComplete = true;
    city.districts.push({ type: 'HOLY_SITE', tileIndex: site.index });

    const ctx = makeYieldCtx(state, 0);
    const faith = holySiteFaith(state, site, ctx);
    expect(faith).toBeGreaterThanOrEqual(0);
    city.buildings.push('SHRINE'); // +2 faith, inside the Holy Site
    const withShrine = holySiteFaith(state, site, ctx);
    expect(withShrine).toBe(faith + 2);

    // a MISSIONARY on the site heals 3x that; the same unit far away heals 0
    const miss = spawnUnit(state, 'MISSIONARY', site.index, 0)!;
    expect(religiousHeal(state, miss, ctx)).toBe(RELIGIOUS_HEAL_PER_FAITH * withShrine);
    const next = neighbors(state.map, site).find((t) => t.index !== centre.index)!;
    miss.tileIndex = next.index;
    expect(religiousHeal(state, miss, ctx)).toBe(RELIGIOUS_HEAL_PER_FAITH * withShrine); // "next to"
    miss.tileIndex = tileAtCoords(state.map, 2, 2).index;
    expect(religiousHeal(state, miss, ctx)).toBe(0);

    // CIV6 (Stave Church): the unique building's Woods adjacency is the site's
    // faith the heal reads, exactly as the city's yield walk counts it
    miss.tileIndex = site.index;
    state.seats[0].civ = CIV_LEADERS.findIndex((l) => l.civ === 'NORWAY');
    const woods = neighbors(state.map, site).filter((t) => !isWater(t) && t.index !== centre.index && !t.district);
    for (const t of woods) t.feature = 'WOODS';
    const ctxN = makeYieldCtx(state, 0);
    const withWoods = holySiteFaith(state, site, ctxN); // the standard Woods adjacency
    city.buildings.push('TEMPLE'); // Norway's Temple is the Stave Church
    const stave = withWoods + woods.length + BUILDINGS.TEMPLE.yields!.faith!;
    expect(holySiteFaith(state, site, ctxN)).toBe(stave);
    expect(religiousHeal(state, miss, ctxN)).toBe(RELIGIOUS_HEAL_PER_FAITH * stave);

    // a pillaged site heals nobody
    miss.tileIndex = site.index;
    site.districtPillaged = true;
    expect(religiousHeal(state, miss, ctx)).toBe(0);
  });

  it('a MILITARY unit still heals by the ordinary rule', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 10, 10).index);
    const w = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 2, 2).index, 0)!;
    w.hp = 50;
    refreshUnits(state);
    expect(w.hp).toBeGreaterThan(50);
  });
});
