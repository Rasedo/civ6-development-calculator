/**
 * THE AIR FIGHTER, AIR BOMBER, NAVAL RAIDER AND NAVAL CARRIER TREES, and the
 * air roll they finally speak into.
 *
 * CIV6 (Experience): "every time a unit enters and survives combat (whether it
 * attacks an enemy or itself suffers an attack), it will gain XP", and the
 * Aerodrome's own Hangar says "+25% combat experience for air units trained in
 * this city" — an aircraft is a unit that promotes like any other.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantTechs, settleAt } from '../helpers';
import { UNITS } from '../../../cpu/data/units';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { spawnUnit, refreshUnits } from '../../../cpu/core/units';
import { emptySeat, seatOf, setTileOwner, setWar } from '../../../cpu/core/seats';
import { RESOURCES } from '../../../world/resources';
import { airRange, airSlotsAt, airStrikeTargets } from '../../../cpu/core/air';
import { airStrike, awardCityXp } from '../../../cpu/core/combat';
import { promoCS, promoValue, promoFlag, promoAvailable, promoReady } from '../../../cpu/core/promotions';
import {
  CLASS_BIT, MASK_AIR, MASK_NAVAL, PROMO_CLASSES, UNIT_PROMO_CLASS, classBitOf, promoRows,
} from '../../../cpu/data/promotions';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { IMPROVEMENT_IDS, unitActionIndex } from '../../../cpu/core/unitActions';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';
import { DED_SKY, SKY_AIR_XP_PCT } from '../../../cpu/data/seats';
import type { GameState, Unit } from '../../../cpu/core/types';

const FIGHTER = 'BIPLANE';
const BOMBER = 'BOMBER';
const SHIP = 'BATTLESHIP';   // NAVAL_RANGED, and the one hull that answers a plane
const RAIDER = 'PRIVATEER';
const CARRIER = 'AIRCRAFT_CARRIER';

/** the bit a promotion holds in its own class list. */
function bit(cls: string, id: string): number {
  const k = promoRows(cls as never).findIndex((p) => p.id === id);
  expect(k).toBeGreaterThanOrEqual(0);
  return 1 << k;
}

/** CIV6 (Resource, GS): a chassis with no continuous access to its strategic
 *  source cannot heal — give the seat one owned, improved, unpillaged tile of
 *  whatever the chassis asks for. */
function grantStrategic(state: GameState, city: { id: number; seat: number }, type: string) {
  const need = UNITS[type]?.requiresResource;
  if (!need) return;
  const t = tileAtCoords(state.map, 7, 8);
  setTileOwner(t, city.seat, city.id);
  t.resource = need;
  t.improvement = RESOURCES[need]!.improvement!;
  t.pillaged = false;
}

/** A units-mode game with the capital at (8,8), an Aerodrome beside it and a
 *  sea tile at (2,2) — the air test's own scene. */
function airState() {
  const state = makeState(makeMap(24, 24));
  state.unitsMode = true;
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index);
  grantTechs(state, 'FLIGHT', 'ADVANCED_FLIGHT');
  const seat = seatOf(state, 0)!;
  seat.treasury = 10_000;
  seat.stockpile = STRATEGIC_IDS.map(() => 99);
  const pad = tileAtCoords(state.map, 8, 9);
  setTileOwner(pad, city.seat, city.id);
  pad.district = 'AERODROME';
  pad.districtComplete = true;
  city.districts.push({ type: 'AERODROME', tileIndex: pad.index });
  state.seats.push(emptySeat(1));
  const sea = tileAtCoords(state.map, 2, 2);
  sea.terrain = 'COAST';
  return { state, city, seat, pad, sea };
}

describe('the four new promotion classes', () => {
  it('every chassis of the class holds its tree, and no bit collides', () => {
    for (const c of ['AIR_FIGHTER', 'AIR_BOMBER', 'NAVAL_RAIDER', 'NAVAL_CARRIER'] as const) {
      expect(PROMO_CLASSES).toContain(c);
      expect(promoRows(c).length).toBe(7);
      // every prerequisite names a row of the SAME list, and an EARLIER one:
      // a cycle would make the whole branch unreachable.
      const ids = promoRows(c).map((p) => p.id);
      promoRows(c).forEach((p, k) => {
        for (const r of p.requires) {
          const j = ids.indexOf(r);
          expect(j).toBeGreaterThanOrEqual(0);
          expect(j).toBeLessThan(k);
        }
      });
    }
    expect(UNIT_PROMO_CLASS[FIGHTER]).toBe('AIR_FIGHTER');
    expect(UNIT_PROMO_CLASS[BOMBER]).toBe('AIR_BOMBER');
    expect(UNIT_PROMO_CLASS[RAIDER]).toBe('NAVAL_RAIDER');
    expect(UNIT_PROMO_CLASS[CARRIER]).toBe('NAVAL_CARRIER');
    // a target-class bit is a distinct power of two, and JS masks stay inside 32
    const bits = Object.values(CLASS_BIT);
    expect(new Set(bits).size).toBe(bits.length);
    for (const b of bits) expect(b & (b - 1)).toBe(0);
    expect(Math.max(...bits)).toBeLessThan(2 ** 31);
  });

  it('CIV6 groups every hull under "naval units", the raider included', () => {
    expect(MASK_NAVAL & classBitOf(RAIDER)).not.toBe(0);
    expect(MASK_NAVAL & classBitOf(CARRIER)).not.toBe(0);
    expect(MASK_NAVAL & classBitOf('BATTLESHIP')).not.toBe(0);
    expect(MASK_AIR & classBitOf(FIGHTER)).not.toBe(0);
    expect(MASK_AIR & classBitOf(BOMBER)).not.toBe(0);
    expect(MASK_AIR & classBitOf('WARRIOR')).toBe(0);
  });
});

describe('what the fighter and bomber trees add to a roll', () => {
  const fighter = (id: string): Unit =>
    ({ type: FIGHTER, promos: bit('AIR_FIGHTER', id) } as Unit);
  const bomber = (id: string): Unit =>
    ({ type: BOMBER, promos: bit('AIR_BOMBER', id) } as Unit);

  it('DOGFIGHTING answers fighters, INTERCEPTOR bombers, and neither the ground', () => {
    const dog = fighter('DOGFIGHTING');
    expect(promoCS(dog, { attacking: true, foeType: FIGHTER })).toBe(7);
    expect(promoCS(dog, { attacking: true, foeType: BOMBER })).toBe(0);
    expect(promoCS(dog, { attacking: true, foeType: 'WARRIOR' })).toBe(0);
    // the class term is not an ATTACK term: it answers on the way in too
    expect(promoCS(dog, { attacking: false, foeType: FIGHTER })).toBe(7);

    const icp = fighter('INTERCEPTOR');
    expect(promoCS(icp, { attacking: true, foeType: BOMBER })).toBe(7);
    expect(promoCS(icp, { attacking: true, foeType: FIGHTER })).toBe(0);
  });

  it('STRAFE spares cavalry and TANK_BUSTER answers only cavalry', () => {
    // CIV6 (Strafe): "+17 Combat Strength against non-cavalry land units";
    // (Tank Buster): "+17 Combat Strength against cavalry units".
    const str = fighter('STRAFE');
    expect(promoCS(str, { attacking: true, foeType: 'WARRIOR' })).toBe(17);
    expect(promoCS(str, { attacking: true, foeType: 'CATAPULT' })).toBe(17);
    expect(promoCS(str, { attacking: true, foeType: 'KNIGHT' })).toBe(0);
    expect(promoCS(str, { attacking: true, foeType: 'GALLEY' })).toBe(0);

    const tb = fighter('TANK_BUSTER');
    expect(promoCS(tb, { attacking: true, foeType: 'KNIGHT' })).toBe(17);
    expect(promoCS(tb, { attacking: true, foeType: 'HORSEMAN' })).toBe(17);
    expect(promoCS(tb, { attacking: true, foeType: 'WARRIOR' })).toBe(0);
  });

  it('the bomber answers land and sea by its own two rows', () => {
    const cas = bomber('CLOSE_AIR_SUPPORT');
    expect(promoCS(cas, { attacking: true, foeType: 'WARRIOR' })).toBe(12);
    expect(promoCS(cas, { attacking: true, foeType: SHIP })).toBe(0);

    const tor = bomber('TORPEDO_BOMBER');
    expect(promoCS(tor, { attacking: true, foeType: SHIP })).toBe(17);
    expect(promoCS(tor, { attacking: true, foeType: RAIDER })).toBe(17);
    expect(promoCS(tor, { attacking: true, foeType: 'WARRIOR' })).toBe(0);
  });

  it('the two DEFENSIVE kinds fire in their own roll and in no other', () => {
    // CIV6 (Proximity Fuses): "+7 Combat Strength when defending vs. air
    // attacks"; (Cockpit Armor / Evasive Maneuvers): "+7 Combat Strength when
    // defending against anti-air fire".
    const fuse = { type: SHIP, promos: bit('NAVAL_RANGED', 'PROXIMITY_FUSES') } as Unit;
    expect(promoCS(fuse, { attacking: false, vsAir: true })).toBe(7);
    expect(promoCS(fuse, { attacking: false })).toBe(0);
    expect(promoCS(fuse, { attacking: true, vsAir: true })).toBe(0);

    for (const u of [fighter('COCKPIT_ARMOR'), bomber('EVASIVE_MANEUVERS')]) {
      expect(promoCS(u, { attacking: false, vsAntiAir: true })).toBe(7);
      expect(promoCS(u, { attacking: false, vsAir: true })).toBe(0);
      expect(promoCS(u, { attacking: false })).toBe(0);
      expect(promoCS(u, { attacking: true, vsAntiAir: true })).toBe(0);
    }

    // BOX_FORMATION is the bomber's answer to a FIGHTER, defending only
    const box = bomber('BOX_FORMATION');
    expect(promoCS(box, { attacking: false, foeType: FIGHTER })).toBe(7);
    expect(promoCS(box, { attacking: true, foeType: FIGHTER })).toBe(0);
  });

  it('the RANGE rows reach further, and the head widens with them', () => {
    // CIV6 (Drop Tanks / Long Range): "+2 Operational Range".
    const base = airRange({ type: BOMBER });
    expect(base).toBe(UNITS[BOMBER].ranged!.range);
    const far = { type: BOMBER, promos: bit('AIR_BOMBER', 'LONG_RANGE') };
    expect(airRange(far)).toBe(base + 2);
    expect(airRange({ type: FIGHTER, promos: bit('AIR_FIGHTER', 'DROP_TANKS') }))
      .toBe(UNITS[FIGHTER].ranged!.range + 2);

    const { state, pad } = airState();
    setWar(state, 0, 1, true);
    const plane = spawnUnit(state, BOMBER, pad.index, 0)!;
    for (let d = 1; d <= base + 2; d++) {
      const t = tileAtCoords(state.map, 8, 9 + d);
      t.terrain = 'COAST';
      spawnUnit(state, SHIP, t.index, 1);
    }
    const near = airStrikeTargets(state, plane, 24).length;
    plane.promos = bit('AIR_BOMBER', 'LONG_RANGE');
    expect(airStrikeTargets(state, plane, 24).length).toBeGreaterThan(near);
  });
});

describe('the sortie carries both trees', () => {
  /** the same scene twice: a bomber over an anti-air hull. */
  function sortie(planePromos: number, hullPromos: number) {
    const { state, pad, sea } = airState();
    setWar(state, 0, 1, true);
    const plane = spawnUnit(state, BOMBER, pad.index, 0)!;
    plane.promos = planePromos;
    const hull = spawnUnit(state, SHIP, sea.index, 1)!;
    hull.promos = hullPromos;
    expect(airStrike(state, plane.id, sea.index, 0).ok).toBe(true);
    return { dealt: 100 - hull.hp, taken: 100 - plane.hp };
  }

  it("the defender's PROXIMITY FUSES soften the blow it takes", () => {
    const bare = sortie(0, 0);
    const fused = sortie(0, bit('NAVAL_RANGED', 'PROXIMITY_FUSES'));
    expect(bare.dealt).toBeGreaterThan(0);
    expect(fused.dealt).toBeLessThan(bare.dealt);
  });

  it("the aircraft's EVASIVE MANEUVERS soften the anti-air burst", () => {
    const bare = sortie(0, 0);
    const evade = sortie(bit('AIR_BOMBER', 'EVASIVE_MANEUVERS'), 0);
    expect(bare.taken).toBeGreaterThan(0);
    expect(evade.taken).toBeLessThan(bare.taken);
  });

  it('TORPEDO BOMBER makes the same sortie bite harder', () => {
    const bare = sortie(0, 0);
    const torp = sortie(bit('AIR_BOMBER', 'TORPEDO_BOMBER'), 0);
    expect(torp.dealt).toBeGreaterThan(bare.dealt);
  });
});

describe('the naval raider tree', () => {
  it('LOOT pays its flat gold on a COASTAL RAID and on nothing else', () => {
    // CIV6 (Loot): "+50 Gold from coastal raids."
    const PILLAGE = unitActionIndex(IMPROVEMENT_IDS).PILLAGE;
    /** a raider afloat beside an enemy farm — `target` says whether the farm
     *  is there at all, `loot` whether the hull holds the row. */
    function raid(loot: boolean, target: boolean) {
      const state = makeState(makeMap(16, 16));
      state.unitsMode = true;
      settleAt(state, tileAtCoords(state.map, 3, 3).index);
      // a hull needs the water it floats on to be enterable
      grantTechs(state, 'SAILING', 'CARTOGRAPHY', 'SHIPBUILDING');
      state.seats.push(emptySeat(1));
      setWar(state, 0, 1, true);
      const land = tileAtCoords(state.map, 10, 10);
      if (target) {
        setTileOwner(land, 1, 1);
        land.improvement = 'FARM';
        land.pillaged = false;
      }
      const here = tileAtCoords(state.map, 10, 11);
      here.terrain = 'COAST';
      const u = spawnUnit(state, RAIDER, here.index, 0)!;
      Object.assign(u, { tileIndex: here.index, movesLeft: 4, movesFull: 4 });
      if (loot) u.promos = bit('NAVAL_RAIDER', 'LOOT');
      const seat = seatOf(state, 0)!;
      seat.treasury = 0;
      const units = state.units.filter((x) => x.seat === 0);
      const row = units.map((x) => (x === u ? PILLAGE : -1));
      applySeatUnitOrders(state, seat, [row]);
      expect(!!land.pillaged).toBe(target);
      return seat.treasury;
    }
    expect(raid(true, true) - raid(false, true)).toBe(promoValue(
      { type: RAIDER, promos: bit('NAVAL_RAIDER', 'LOOT') }, 'RAID_GOLD',
    ));
    expect(raid(true, true) - raid(false, true)).toBe(50);
    // a raid that wrecked nothing loots nothing
    expect(raid(true, false)).toBe(0);
  });

  it('the raider rows carry the effects the source names', () => {
    const u = (id: string) => ({ type: RAIDER, promos: bit('NAVAL_RAIDER', id) });
    expect(promoValue(u('SWIFT_KEEL'), 'MOVES')).toBe(1);
    expect(promoValue(u('OBSERVATION'), 'SIGHT')).toBe(1);
    expect(promoValue(u('WOLFPACK'), 'EXTRA_ATTACK')).toBe(1);
    expect(promoFlag(u('SILENT_RUNNING'), 'MOVE_AFTER_ATTACK')).toBe(true);
    expect(promoCS(u('HOMING_TORPEDOES') as Unit, { attacking: true, foeType: SHIP })).toBe(10);
  });

  it('CREEPING ATTACK finally has a class to name', () => {
    // CIV6 (Creeping Attack): "+14 Combat Strength against Naval Raider units."
    const dd = { type: 'DESTROYER', promos: bit('NAVAL_MELEE', 'CREEPING_ATTACK') } as Unit;
    expect(promoCS(dd, { attacking: true, foeType: RAIDER })).toBe(14);
    expect(promoCS(dd, { attacking: true, foeType: 'SUBMARINE' })).toBe(14);
    expect(promoCS(dd, { attacking: true, foeType: SHIP })).toBe(0);
  });
});

describe('the naval carrier tree', () => {
  it('each deck row bases one more aircraft, and they stack', () => {
    const { state, sea } = airState();
    const hull = spawnUnit(state, CARRIER, sea.index, 0)!;
    const base = UNITS[CARRIER].airSlots!;
    expect(airSlotsAt(state, 0, sea.index)).toBe(base);
    // CIV6 (Flight Deck, Hangar Deck, Folding Wings): "+1 additional aircraft
    // slot" apiece — three rows saying one thing, so the hull that takes the
    // whole branch bases three more planes than it was launched with.
    const decks = ['FLIGHT_DECK', 'HANGAR_DECK', 'FOLDING_WINGS'];
    decks.forEach((id, k) => {
      hull.promos = (hull.promos ?? 0) | bit('NAVAL_CARRIER', id);
      expect(airSlotsAt(state, 0, sea.index)).toBe(base + k + 1);
    });
    expect(airSlotsAt(state, 1, sea.index)).toBe(0); // a hull bases its OWN seat alone
  });

  it('the carrier rows carry the effects the source names, and none is inert', () => {
    const u = (id: string) => ({ type: CARRIER, promos: bit('NAVAL_CARRIER', id) });
    expect(promoValue(u('SCOUT_PLANES'), 'SIGHT')).toBe(1);
    expect(promoValue(u('ADVANCED_ENGINES'), 'MOVES')).toBe(1);
    expect(promoValue(u('FLIGHT_DECK'), 'AIR_SLOTS')).toBe(1);
    expect(promoFlag(u('DECK_CREWS'), 'HEAL_AFTER_ATTACK')).toBe(true);
    expect(promoFlag(u('SUPERCARRIER'), 'HEAL_ANYWHERE')).toBe(true);
    for (const r of promoRows('NAVAL_CARRIER')) expect(r.effects).not.toEqual([{ kind: 'NONE' }]);
  });
});

describe('an aircraft earns what it fights for', () => {
  it('a sortie banks XP on both sides, and a promotion column opens', () => {
    const { state, pad, sea } = airState();
    setWar(state, 0, 1, true);
    const plane = spawnUnit(state, BOMBER, pad.index, 0)!;
    const hull = spawnUnit(state, SHIP, sea.index, 1)!;
    expect(airStrike(state, plane.id, sea.index, 0).ok).toBe(true);
    expect(plane.xp ?? 0).toBeGreaterThan(0);
    expect(hull.xp ?? 0).toBeGreaterThan(0);

    plane.xp = 99;
    expect(promoReady(plane)).toBe(true);
    const open = promoRows('AIR_BOMBER')
      .map((_, k) => k)
      .filter((k) => promoAvailable(plane, k));
    expect(open).toEqual([0, 1]);  // the two roots, and nothing deeper yet
  });

  it("Sky and Stars doubles an aircraft's XP and leaves the ground alone", () => {
    // CIV6 (Sky and Stars, Golden face): "+100% XP earned for all Air Units."
    expect(SKY_AIR_XP_PCT).toBe(100);
    function banked(type: string, golden: boolean) {
      const { state } = airState();
      const seat = seatOf(state, 0)!;
      seat.age = 2;
      seat.dedicationPicks = golden ? [DED_SKY] : [];
      const u = spawnUnit(state, type, tileAtCoords(state.map, 8, 8).index, 0)!;
      u.xp = 0;
      awardCityXp(state, u, 3);
      return u.xp ?? 0;
    }
    expect(banked(BOMBER, true)).toBe(2 * banked(BOMBER, false));
    expect(banked('WARRIOR', true)).toBe(banked('WARRIOR', false));
  });

  it('the Aerodrome buildings hand a new plane the head start they promise', () => {
    // CIV6 (Hangar): "+25% combat experience for air units trained in this
    // city"; (Airport): "+50%".
    expect(BUILDINGS.HANGAR.trainXpPct).toBe(25);
    expect(BUILDINGS.AIRPORT.trainXpPct).toBe(50);
    for (const b of ['HANGAR', 'AIRPORT'] as const) {
      expect(BUILDINGS[b].trainXpClasses).toEqual(['AIR_FIGHTER', 'AIR_BOMBER']);
    }
    // CIV6 (Shipyard/Seaport): "for all naval units", the raider included
    for (const b of ['SHIPYARD', 'SEAPORT'] as const) {
      expect(BUILDINGS[b].trainXpClasses).toContain('NAVAL_RAIDER');
    }
  });
});

describe('TACTICAL MAINTENANCE', () => {
  it('lets the bomber heal on the turn it struck, and nobody else', () => {
    // CIV6 (Tactical Maintenance): "Can heal after attacking."
    function fly(promos: number): number {
      const { state, city, pad, sea } = airState();
      setWar(state, 0, 1, true);
      grantStrategic(state, city, BOMBER);
      const plane = spawnUnit(state, BOMBER, pad.index, 0)!;
      plane.promos = promos;
      plane.hp = 40;
      spawnUnit(state, 'GALLEY', sea.index, 1);
      expect(airStrike(state, plane.id, sea.index, 0).ok).toBe(true);
      expect(plane.movesLeft).toBe(0);          // the sortie spent the turn
      const before = plane.hp;
      refreshUnits(state);
      return plane.hp - before;
    }
    expect(fly(0)).toBe(0);
    expect(fly(bit('AIR_BOMBER', 'TACTICAL_MAINTENANCE'))).toBeGreaterThan(0);
  });
});

describe('the rows that ship inert, and say so', () => {
  it('GROUND CREWS, SUPERFORTRESS and BOARDING carry no effect yet', () => {
    // Each waits on a mechanic neither engine has: a PATROL order, an air
    // pillage, and a published magnitude for "obtain Gold from naval
    // victories". They exist so the tree's shape and its prerequisites are
    // the source's, not so they do anything.
    for (const [cls, id] of [
      ['AIR_FIGHTER', 'GROUND_CREWS'], ['AIR_BOMBER', 'SUPERFORTRESS'],
      ['NAVAL_RAIDER', 'BOARDING'],
    ] as const) {
      const row = promoRows(cls).find((p) => p.id === id)!;
      expect(row.effects).toEqual([{ kind: 'NONE' }]);
    }
  });
});
