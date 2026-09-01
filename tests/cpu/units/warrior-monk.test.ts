import { describe, it, expect } from 'vitest';
import { MP_SCALE } from '../../../cpu/data/constants';
import { allCities, seatOf, setWar, emptySeat } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs, expandBorders } from '../helpers';
import { purchaseReligiousUnit, unitFaithCost } from '../../../cpu/core/game';
import { spawnUnit, trainableUnits, unitVisibleTo } from '../../../cpu/core/units';
import { meleeAttack, rangedAttack, siegeAssist, ASSIST_RAM } from '../../../cpu/core/combat';
import { refreshUnits } from '../../../cpu/core/units';
import { attacksLeftOf, attacksPerTurn, unitPromoRows } from '../../../cpu/core/promotions';
import { KILL_SPREAD_PRESSURE, UNIT_PROMO_CLASS } from '../../../cpu/data/promotions';
import { SUZERAIN_ENVOYS, CITY_STATE_SUZERAIN_BONUS } from '../../../cpu/data/cityStates';
import { GP_ABILITY, GP_PERM } from '../../../cpu/data/greatPeople';
import { UNITS } from '../../../cpu/data/units';
import { hexDistance } from '../../../world/hex';
import type { CityState, GameState, Seat, Unit } from '../../../cpu/core/types';

// THE WARRIOR MONK and its own promotion table, plus the ATTACK BUDGET the
// tree's Sweeping Wind row needed. Nothing here is gate-reachable: no scripted
// seed founds a religion with the Warrior Monks belief, so every rule below is
// poked directly.

/** `unit.promos` is a bitmask over the unit's OWN class table, in the order
 *  `promoRows` lists it — the same column index the PROMOTE head uses. */
const promo = (u: Unit, ...ids: string[]): Unit => {
  const rows = unitPromoRows(u);
  for (const id of ids) {
    const k = rows.findIndex((r) => r.id === id);
    expect(k, `${id} is not in ${u.type}'s table`).toBeGreaterThanOrEqual(0);
    u.promos = (u.promos ?? 0) | (1 << k);
  }
  return u;
};

function battlefield(): { state: GameState; enemy: Seat } {
  const state = makeState(makeMap(24, 24));
  settleAt(state, tileAtCoords(state.map, 5, 5).index);
  state.unitsMode = true;
  const enemy: Seat = { ...emptySeat(1), seat: 1 };
  state.seats.push(enemy);
  setWar(state, 0, 1, true);
  return { state, enemy };
}

// ---------------------------------------------------------------------------
describe('the attack budget', () => {
  it('one attack a turn, whatever movement is left', () => {
    const { state } = battlefield();
    const atk = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 10, 10).index, 0)!;
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 10).index, 1)!;
    foe.hp = 100;
    atk.attacksLeft = attacksPerTurn(atk);
    expect(attacksLeftOf(atk)).toBe(1);
    expect(meleeAttack(state, atk.id, foe.tileIndex, 0).ok).toBe(true);
    expect(attacksLeftOf(atk)).toBe(0);
    atk.movesLeft = 2 * MP_SCALE; // movement alone is not permission to swing again
    expect(meleeAttack(state, atk.id, foe.tileIndex, 0).reason).toBe('The attack is spent.');
    const arch = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 10, 12).index, 0)!;
    arch.attacksLeft = 0;
    expect(rangedAttack(state, arch.id, foe.tileIndex).reason).toBe('The attack is spent.');
  });

  it('MOVE_AFTER_ATTACK keeps the movement and still spends the attack', () => {
    const { state } = battlefield();
    const atk = promo(spawnUnit(state, 'SCOUT', tileAtCoords(state.map, 10, 10).index, 0)!, 'GUERRILLA');
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 10).index, 1)!;
    foe.hp = 100;
    atk.attacksLeft = attacksPerTurn(atk);
    expect(meleeAttack(state, atk.id, foe.tileIndex, 0).ok).toBe(true);
    expect(atk.movesLeft).toBeGreaterThan(0);   // the promotion's whole point
    expect(attacksLeftOf(atk)).toBe(0);          // and it is not a second blow
    expect(meleeAttack(state, atk.id, foe.tileIndex, 0).reason).toBe('The attack is spent.');
  });

  it('SWEEPING_WIND buys exactly one more, and the refresh hands them back', () => {
    const { state } = battlefield();
    const monk = promo(spawnUnit(state, 'WARRIOR_MONK', tileAtCoords(state.map, 10, 10).index, 0)!,
      'SHADOW_STRIKE', 'EXPLODING_PALMS', 'SWEEPING_WIND');
    expect(attacksPerTurn(monk)).toBe(2);
    monk.attacksLeft = attacksPerTurn(monk);
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 10).index, 1)!;
    foe.hp = 100;
    const home = monk.tileIndex;
    expect(meleeAttack(state, monk.id, foe.tileIndex, 0)).toEqual({ ok: true });
    // the first blow felled it and the victor advanced; step back and swing again
    monk.tileIndex = home;
    monk.movesLeft = 3 * MP_SCALE; // "if Movement allows"
    const foe2 = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 10).index, 1)!;
    expect(meleeAttack(state, monk.id, foe2.tileIndex, 0)).toEqual({ ok: true });
    expect(attacksLeftOf(monk)).toBe(0);
    monk.tileIndex = home;
    monk.movesLeft = 3 * MP_SCALE;
    expect(meleeAttack(state, monk.id, foe2.tileIndex, 0).reason).toBe('The attack is spent.');
    refreshUnits(state);
    expect(attacksLeftOf(monk)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe('Twilight Veil', () => {
  it('only an ADJACENT enemy reveals it — Reveal Stealth does not reach', () => {
    const { state } = battlefield();
    const monk = promo(spawnUnit(state, 'WARRIOR_MONK', tileAtCoords(state.map, 12, 10).index, 0)!,
      'TWILIGHT_VEIL');
    const eye = spawnUnit(state, 'SCOUT', tileAtCoords(state.map, 15, 10).index, 1)!;
    expect(UNITS.SCOUT.revealStealth).toBe(true);
    expect(unitVisibleTo(state, monk, 1)).toBe(false);
    // the Scout's Reveal Stealth lengthens the look at a stealth CHASSIS only
    eye.tileIndex = tileAtCoords(state.map, 14, 10).index;
    expect(unitVisibleTo(state, monk, 1)).toBe(false);
    eye.tileIndex = tileAtCoords(state.map, 13, 10).index;   // adjacent
    expect(unitVisibleTo(state, monk, 1)).toBe(true);
    // and its owner always sees it
    expect(unitVisibleTo(state, monk, 0)).toBe(true);
  });

  it('a blow gives it away for the turn', () => {
    const { state } = battlefield();
    const monk = promo(spawnUnit(state, 'WARRIOR_MONK', tileAtCoords(state.map, 12, 10).index, 0)!,
      'TWILIGHT_VEIL');
    monk.attacksLeft = 1;
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 13, 10).index, 1)!;
    foe.hp = 1;   // it dies, so only the FAR scout is left to look
    spawnUnit(state, 'SCOUT', tileAtCoords(state.map, 17, 10).index, 1);
    expect(meleeAttack(state, monk.id, foe.tileIndex, 0).ok).toBe(true);
    expect(monk.revealedTurn).toBe(state.turn);
    expect(unitVisibleTo(state, monk, 1)).toBe(true);
    state.turn += 1;
    expect(unitVisibleTo(state, monk, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('Disciples', () => {
  function scenario(): { state: GameState; monk: Unit; foe: Unit } {
    const { state } = battlefield();
    seatOf(state, 0)!.religion.founded = true;
    const monk = promo(spawnUnit(state, 'WARRIOR_MONK', tileAtCoords(state.map, 6, 5).index, 0)!,
      'SHADOW_STRIKE', 'DISCIPLES');
    monk.attacksLeft = 1;
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 5).index, 1)!;
    foe.hp = 1;
    return { state, monk, foe };
  }

  const pressureNear = (state: GameState, seat: number): number => {
    const c = allCities(state)[0];
    return c.religionPressure?.[seat] ?? 0;
  };

  it('a non-barbarian kill pays 250 pressure to cities within 10 hexes', () => {
    const { state, monk, foe } = scenario();
    const city = allCities(state)[0];
    const ct = state.map.tiles[city.centerIndex];
    const ft = state.map.tiles[foe.tileIndex];
    expect(hexDistance(ct.col, ct.row, ft.col, ft.row)).toBeLessThanOrEqual(10);
    expect(meleeAttack(state, monk.id, foe.tileIndex, 0).ok).toBe(true);
    expect(foe.hp).toBeLessThanOrEqual(0);
    expect(pressureNear(state, 0)).toBe(KILL_SPREAD_PRESSURE);
  });

  it('a BARBARIAN kill pays nothing, and neither does a monk without the row', () => {
    const { state, monk } = scenario();
    monk.promos = 0;
    promo(monk, 'SHADOW_STRIKE');   // no Disciples
    const foe = state.units.find((u) => u.seat === 1)!;
    expect(meleeAttack(state, monk.id, foe.tileIndex, 0).ok).toBe(true);
    expect(pressureNear(state, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('the Warrior Monk itself', () => {
  function monkCity() {
    const state = makeState(makeMap(16, 16));
    settleAt(state, tileAtCoords(state.map, 8, 8).index);
    state.unitsMode = true;
    const city = seatOf(state, 0)!.cities[0];
    expandBorders(state, city, 2);
    grantTechs(state, 'ASTROLOGY');
    const hs = tileAtCoords(state.map, 9, 8);
    hs.district = 'HOLY_SITE';
    hs.districtComplete = true;
    city.districts.push({ type: 'HOLY_SITE', tileIndex: hs.index });
    city.buildings.push('SHRINE', 'TEMPLE');
    seatOf(state, 0)!.faith = 1000;
    return { state, city };
  }

  it('is faith-only and never joins a production column', () => {
    const { state, city } = monkCity();
    expect(UNITS.WARRIOR_MONK.faithOnly).toBe(true);
    expect(UNITS.WARRIOR_MONK.combat).toBe(40);
    expect(UNIT_PROMO_CLASS.WARRIOR_MONK).toBe('MONK');
    expect(trainableUnits(state, 0, city)).not.toContain('WARRIOR_MONK');
  });

  it('needs the CITY\'s majority religion to hold the belief, plus Temple and Holy Site', () => {
    const { state, city } = monkCity();
    expect(purchaseReligiousUnit(state, city.id, 'WARRIOR_MONK', 0).reason)
      .toBe('The city follows no religion.');
    city.followedReligion = 0;
    expect(purchaseReligiousUnit(state, city.id, 'WARRIOR_MONK', 0).reason)
      .toBe('The majority religion has no Warrior Monks belief.');
    seatOf(state, 0)!.religion.follower = 'WARRIOR_MONKS';
    const faith0 = seatOf(state, 0)!.faith!;
    expect(purchaseReligiousUnit(state, city.id, 'WARRIOR_MONK', 0).ok).toBe(true);
    expect(seatOf(state, 0)!.faith).toBe(faith0 - unitFaithCost('WARRIOR_MONK'));
    expect(state.units.some((u) => u.type === 'WARRIOR_MONK' && u.seat === 0)).toBe(true);
  });

  it('the belief may be a RIVAL religion the city happens to follow', () => {
    const { state, city } = monkCity();
    const other: Seat = { ...emptySeat(1), seat: 1 };
    other.religion = { ...other.religion, founded: true, follower: 'WARRIOR_MONKS' };
    state.seats.push(other);
    city.followedReligion = 1;
    expect(seatOf(state, 0)!.religion.founded).toBe(false);
    expect(purchaseReligiousUnit(state, city.id, 'WARRIOR_MONK', 0).ok).toBe(true);
  });

  it('a Temple alone is not enough — the Holy Site must stand', () => {
    const { state, city } = monkCity();
    city.followedReligion = 0;
    seatOf(state, 0)!.religion.follower = 'WARRIOR_MONKS';
    state.map.tiles[city.districts.find((d) => d.type === 'HOLY_SITE')!.tileIndex].districtPillaged = true;
    expect(purchaseReligiousUnit(state, city.id, 'WARRIOR_MONK', 0).reason)
      .toBe('Needs a complete, unpillaged Holy Site.');
  });
});

// ---------------------------------------------------------------------------
describe("Akkad's suzerain bonus", () => {
  function suzerainOfAkkad(state: GameState): void {
    state.cityStates = [{
      id: 0, name: 'Akkad', type: 'militaristic', centerIndex: tileAtCoords(state.map, 2, 2).index,
      envoys: { 0: SUZERAIN_ENVOYS }, hp: 150, pop: 3, questTurn: -1, quest: null,
    } as unknown as CityState];
  }

  it('gives a melee or anti-cavalry attacker the ram bit at EVERY walls tier', () => {
    const { state } = battlefield();
    expect(CITY_STATE_SUZERAIN_BONUS.Akkad.suz).toBe('wallsFullDamage');
    const target = tileAtCoords(state.map, 11, 10).index;
    const sword = spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, 10, 10).index, 0)!;
    const archer = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 10, 11).index, 0)!;
    expect(siegeAssist(state, sword, target, 3)).toBe(0);   // no suzerain, no ram
    suzerainOfAkkad(state);
    expect(siegeAssist(state, sword, target, 3) & ASSIST_RAM).toBe(ASSIST_RAM);
    expect(siegeAssist(state, sword, target, 4) & ASSIST_RAM).toBe(ASSIST_RAM);
    // "melee and anti-cavalry units' attacks" — a ranged chassis is not helped
    expect(siegeAssist(state, archer, target, 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('the retired general and the retired admiral', () => {
  it('Zhukov lifts LAND flanking and Nelson lifts NAVAL flanking, each alone', () => {
    expect(GP_PERM).toContain('flankPctLand');
    expect(GP_PERM).toContain('flankPctNaval');
    expect(GP_ABILITY.GP_GEORGY_ZHUKOV.perm).toEqual({ flankPctLand: 50 });
    expect(GP_ABILITY.GP_HORATIO_NELSON.perm).toEqual({ flankPctNaval: 50 });
    // CIV6 (Nelson, GS): "Instantly builds a Lighthouse and Shipyard in this
    // district" — the Harbor his retirement stands in.
    expect(GP_ABILITY.GP_HORATIO_NELSON.siteDistrict).toBe('HARBOR');
    expect(GP_ABILITY.GP_HORATIO_NELSON.buildings).toEqual(['LIGHTHOUSE', 'SHIPYARD']);
  });
});
