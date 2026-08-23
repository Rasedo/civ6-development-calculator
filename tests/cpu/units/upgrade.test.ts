import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantTechs, settleAt } from '../helpers';
import { UNITS } from '../../../cpu/data/units';
import { spawnUnit, canUpgradeUnit, upgradeUnit } from '../../../cpu/core/units';
import { NO_SEAT, seatOf, setTileOwner } from '../../../cpu/core/seats';
import { upgradeGoldCost, upgradeResourceCost, chargeUnitUpkeep } from '../../../cpu/core/stockpile';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';

/** A units-mode game with the capital at (8,8) and one owned tile beside it. */
function upState(...techs: string[]) {
  const state = makeState(makeMap(16, 16));
  state.unitsMode = true;
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index);
  grantTechs(state, ...techs);
  const tile = tileAtCoords(state.map, 8, 9);
  setTileOwner(tile, city.seat, city.id);
  const seat = seatOf(state, 0)!;
  seat.treasury = 10_000;
  seat.stockpile = STRATEGIC_IDS.map(() => 99);
  return { state, city, tile, seat };
}

describe('the upgrade ladder', () => {
  it('every gate the source names has to be satisfied', () => {
    // CIV6 (Unit): friendly territory, more than 0 Movement, the Gold, and the
    // successor unlocked.
    const { state, tile, seat } = upState('MACHINERY');
    const u = spawnUnit(state, 'SCOUT', tile.index, 0)!;
    expect(UNITS.SCOUT.upgradesTo).toBe('SKIRMISHER');
    expect(canUpgradeUnit(state, u, 0)).toBe(true);

    setTileOwner(tile, NO_SEAT);
    expect(canUpgradeUnit(state, u, 0)).toBe(false); // not friendly territory
    setTileOwner(tile, 0, 1);

    u.movesLeft = 0;
    expect(canUpgradeUnit(state, u, 0)).toBe(false); // no movement left
    u.movesLeft = 3;

    const price = upgradeGoldCost(state, 0, 'SCOUT');
    expect(price).toBeGreaterThan(0);
    seat.treasury = price - 1;
    expect(canUpgradeUnit(state, u, 0)).toBe(false); // cannot pay
    seat.treasury = price;
    expect(canUpgradeUnit(state, u, 0)).toBe(true);
  });

  it('an unresearched successor is not an upgrade', () => {
    const { state, tile } = upState(); // no MACHINERY
    const u = spawnUnit(state, 'SCOUT', tile.index, 0)!;
    expect(canUpgradeUnit(state, u, 0)).toBe(false);
    grantTechs(state, 'MACHINERY');
    expect(canUpgradeUnit(state, u, 0)).toBe(true);
  });

  it('the unit keeps its promotions and its wounds, and spends the turn', () => {
    // CIV6: "Upgraded units retain all their Promotions and experience" and
    // "units do not Heal upon upgrading".
    const { state, tile, seat } = upState('MACHINERY');
    const u = spawnUnit(state, 'SCOUT', tile.index, 0)!;
    u.hp = 40;
    u.promos = 1 << 2;
    u.xp = 17;
    const gold0 = seat.treasury;
    const price = upgradeGoldCost(state, 0, 'SCOUT');
    expect(upgradeUnit(state, u, 0).ok).toBe(true);
    expect(u.type).toBe('SKIRMISHER');
    expect(u.hp).toBe(40);
    expect(u.promos).toBe(1 << 2);
    expect(u.xp).toBe(17);
    expect(u.movesLeft).toBe(0);
    expect(seat.treasury).toBe(gold0 - price);
  });

  it('the new chassis charges its own resource, and nothing when both ask for the same one', () => {
    // CIV6 (Unit, GS): the upgrade needs "the same [resources] you would
    // normally need to produce the next-level unit (unless the unit you're
    // upgrading also requires the same resource, in which case you don't need
    // any)".
    expect(UNITS.SWORDSMAN.requiresResource).toBe('IRON');
    expect(UNITS.MAN_AT_ARMS.requiresResource).toBe('IRON');
    expect(upgradeResourceCost('SWORDSMAN')).toBeUndefined(); // Iron -> Iron

    expect(UNITS.MUSKETMAN.requiresResource).toBe('NITER');
    expect(UNITS.LINE_INFANTRY.requiresResource).toBe('NITER');
    expect(upgradeResourceCost('MUSKETMAN')).toBeUndefined();

    // Knight (Iron) -> Cuirassier (Iron) is also free; Crossbowman (none) ->
    // Field Cannon (none) has nothing to charge either. The Horseman's rung
    // is the one that pays: Horses -> Horses is free, but Warrior -> Swordsman
    // moves from nothing to Iron.
    expect(UNITS.WARRIOR.requiresResource).toBeUndefined();
    expect(upgradeResourceCost('WARRIOR')).toEqual({ id: 'IRON', n: 20 });
  });

  it('the bank has to cover the new chassis, and the upgrade draws it down', () => {
    const { state, tile, seat } = upState('IRON_WORKING');
    const u = spawnUnit(state, 'WARRIOR', tile.index, 0)!;
    seat.stockpile = STRATEGIC_IDS.map((r) => (r === 'IRON' ? 19 : 0));
    expect(canUpgradeUnit(state, u, 0)).toBe(false); // 19 does not pay for a 20
    seat.stockpile = STRATEGIC_IDS.map((r) => (r === 'IRON' ? 20 : 0));
    expect(canUpgradeUnit(state, u, 0)).toBe(true);
    expect(upgradeUnit(state, u, 0).ok).toBe(true);
    expect(u.type).toBe('SWORDSMAN');
    expect(seat.stockpile[STRATEGIC_IDS.indexOf('IRON')]).toBe(0);
  });
});

describe('fuel upkeep', () => {
  it('a fuel unit bills its resource every turn, and a production one never does', () => {
    // CIV6 (Resource, GS): "each turn, the unit will consume a certain amount
    // of that resource as fuel".
    const { state, tile, seat } = upState('COMBUSTION');
    const oil = STRATEGIC_IDS.indexOf('OIL');
    seat.stockpile = STRATEGIC_IDS.map(() => 10);
    spawnUnit(state, 'TANK', tile.index, 0);
    spawnUnit(state, 'TANK', tileAtCoords(state.map, 7, 9).index, 0);
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 8).index, 0);
    chargeUnitUpkeep(state, 0);
    expect(seat.stockpile[oil]).toBe(8); // two Tanks at 1 Oil each
    chargeUnitUpkeep(state, 0);
    expect(seat.stockpile[oil]).toBe(6);
  });

  it('the GDR bills three, and an empty bank floors at zero', () => {
    const { state, tile, seat } = upState('ROBOTICS');
    const ur = STRATEGIC_IDS.indexOf('URANIUM');
    expect(UNITS.GIANT_DEATH_ROBOT.resourceUpkeep).toBe(3);
    seat.stockpile = STRATEGIC_IDS.map(() => 0);
    seat.stockpile[ur] = 4;
    spawnUnit(state, 'GIANT_DEATH_ROBOT', tile.index, 0);
    chargeUnitUpkeep(state, 0);
    expect(seat.stockpile[ur]).toBe(1);
    chargeUnitUpkeep(state, 0);
    expect(seat.stockpile[ur]).toBe(0); // the bill outruns the bank
  });

  it("another seat's units are not this seat's bill", () => {
    const { state, tile, seat } = upState('COMBUSTION');
    const oil = STRATEGIC_IDS.indexOf('OIL');
    seat.stockpile = STRATEGIC_IDS.map(() => 10);
    spawnUnit(state, 'TANK', tile.index, 1);
    chargeUnitUpkeep(state, 0);
    expect(seat.stockpile[oil]).toBe(10);
  });
});
