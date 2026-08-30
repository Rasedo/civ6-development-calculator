import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantTechs, settleAt } from '../helpers';
import { UNITS } from '../../../cpu/data/units';
import { spawnUnit, unitsAt } from '../../../cpu/core/units';
import { emptySeat, seatOf, setTileOwner, setWar } from '../../../cpu/core/seats';
import {
  CITY_CENTER_AIR_SLOTS, AERODROME_AIR_SLOTS,
  airSlotsAt, airBaseFree, airBasesOf, airTrainTile, canTrainAir,
  rebaseRange, canRebaseTo, rebaseAir, displaceAirFrom, carryAirWith,
  airStrikeTargets, rebaseTargets, airStrikeOffers, airDefenseOf, antiAirOf,
  antiAirCover, airCoverAgainst, AIR_COVER_MAX,
} from '../../../cpu/core/air';
import { airStrike } from '../../../cpu/core/combat';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';
import type { Unit } from '../../../cpu/core/types';

const FIGHTER = 'BIPLANE';
const BOMBER = 'BOMBER';
const CARRIER = 'AIRCRAFT_CARRIER';
const GUNNER = 'ANTI_AIR_GUN';
const SAM = 'MOBILE_SAM';
const HULL = 'BATTLESHIP';

/** A units-mode game with the capital at (8,8) and an Aerodrome beside it. */
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

describe('air bases and their slots', () => {
  it('each base type carries the count the source names', () => {
    // CIV6 (Air combat): a City Center has 1, an Aerodrome "has 2 slots
    // initially", an Aircraft Carrier "starts with 2".
    const { state, city, pad, sea } = airState();
    expect(airSlotsAt(state, 0, city.centerIndex)).toBe(CITY_CENTER_AIR_SLOTS);
    expect(airSlotsAt(state, 0, pad.index)).toBe(AERODROME_AIR_SLOTS);

    city.buildings.push('HANGAR', 'AIRPORT');
    expect(airSlotsAt(state, 0, pad.index)).toBe(AERODROME_AIR_SLOTS + 2);

    pad.districtPillaged = true;
    expect(airSlotsAt(state, 0, pad.index)).toBe(0);
    pad.districtPillaged = false;

    const hull = spawnUnit(state, CARRIER, sea.index, 0)!;
    expect(airSlotsAt(state, 0, sea.index)).toBe(UNITS[CARRIER].airSlots);
    expect(airSlotsAt(state, 1, sea.index)).toBe(0); // a hull bases its OWN seat alone
    expect(airBasesOf(state, 0)).toContain(hull.tileIndex);
  });

  it('a plot nobody based on bases nothing', () => {
    const { state } = airState();
    const bare = tileAtCoords(state.map, 3, 3);
    expect(airSlotsAt(state, 0, bare.index)).toBe(0);
    expect(airBaseFree(state, 0, bare.index)).toBe(false);
  });
});

describe('training an aircraft', () => {
  it('needs an Aerodrome with an empty slot, and the plane spawns in it', () => {
    // CIV6: aircraft "can only be built in a city with an Aerodrome. Newly
    // built aircraft will spawn in the Aerodrome, as long as it still has
    // empty slots."
    const state = makeState(makeMap(24, 24));
    state.unitsMode = true;
    const bare = settleAt(state, tileAtCoords(state.map, 8, 8).index);
    grantTechs(state, 'FLIGHT', 'ADVANCED_FLIGHT');
    expect(canTrainAir(state, 0, bare)).toBe(false);
    expect(airTrainTile(state, 0, bare)).toBeUndefined();

    const { state: s2, city, pad } = airState();
    expect(canTrainAir(s2, 0, city)).toBe(true);
    expect(airTrainTile(s2, 0, city)).toBe(pad.index);
    for (let i = 0; i < AERODROME_AIR_SLOTS; i += 1) spawnUnit(s2, FIGHTER, pad.index, 0);
    expect(airTrainTile(s2, 0, city)).toBeUndefined();
    expect(canTrainAir(s2, 0, city)).toBe(false);
  });
});

describe('the strike head', () => {
  it('a fighter answers land, a bomber answers cities and ships', () => {
    // CIV6: a FIGHTER's damage is "effective against land units, but not
    // against cities and naval units"; a BOMBER's is the mirror.
    const { state, pad } = airState();
    setWar(state, 0, 1, true);
    const fighter = spawnUnit(state, FIGHTER, pad.index, 0)!;
    const bomber = spawnUnit(state, BOMBER, pad.index, 0)!;
    const land = tileAtCoords(state.map, 8, 11);
    spawnUnit(state, GUNNER, land.index, 1);

    expect(airStrikeOffers(state, fighter, land.index)).toBe(true);
    expect(airStrikeOffers(state, bomber, land.index)).toBe(false);
    expect(airStrikeTargets(state, fighter, 12)).toContain(land.index);
    expect(airStrikeTargets(state, bomber, 12)).not.toContain(land.index);

    // a target outside the operational range is no target
    const far = tileAtCoords(state.map, 20, 20);
    spawnUnit(state, GUNNER, far.index, 1);
    expect(airStrikeOffers(state, fighter, far.index)).toBe(true);
    expect(airStrikeTargets(state, fighter, 12)).not.toContain(far.index);

    // and a seat at PEACE offers nothing at all
    const calm = airState();
    const f2 = spawnUnit(calm.state, FIGHTER, calm.pad.index, 0)!;
    spawnUnit(calm.state, GUNNER, tileAtCoords(calm.state.map, 8, 11).index, 1);
    expect(airStrikeTargets(calm.state, f2, 12)).toHaveLength(0);
  });

  it('reads tile-index ascending and cuts to the head width', () => {
    const { state, pad } = airState();
    setWar(state, 0, 1, true);
    const fighter = spawnUnit(state, FIGHTER, pad.index, 0)!;
    for (const [c, r] of [[8, 10], [7, 10], [9, 10], [8, 11]] as const) {
      spawnUnit(state, GUNNER, tileAtCoords(state.map, c, r).index, 1);
    }
    const all = airStrikeTargets(state, fighter, 12);
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect([...all]).toEqual([...all].sort((a, b) => a - b));
    expect(airStrikeTargets(state, fighter, 2)).toEqual(all.slice(0, 2));
  });
});

describe('the sortie', () => {
  it('matches Ranged Strength against Anti-Air Strength', () => {
    // CIV6: "the attacking unit's Ranged Strength will be matched against the
    // defending unit's Anti-Air Strength (even if its Combat Strength is
    // higher) or Combat Strength if it doesn't have any Anti-Air Strength."
    expect(antiAirOf(GUNNER)).toBeGreaterThan(0);
    expect(airDefenseOf(GUNNER)).toBe(UNITS[GUNNER].antiAir);
    expect(airDefenseOf('WARRIOR')).toBe(UNITS.WARRIOR.combat);

    const { state, pad } = airState();
    setWar(state, 0, 1, true);
    const fighter = spawnUnit(state, FIGHTER, pad.index, 0)!;
    const land = tileAtCoords(state.map, 8, 11);
    const gun = spawnUnit(state, GUNNER, land.index, 1)!;
    const r = airStrike(state, fighter.id, land.index, 0);
    expect(r.ok).toBe(true);
    expect(gun.hp).toBeLessThan(100);
    expect(fighter.movesLeft).toBe(0);

    // a target with no Anti-Air Strength answers nothing
    const s2 = airState();
    setWar(s2.state, 0, 1, true);
    const f2 = spawnUnit(s2.state, FIGHTER, s2.pad.index, 0)!;
    const soft = tileAtCoords(s2.state.map, 8, 11);
    spawnUnit(s2.state, 'WARRIOR', soft.index, 1);
    expect(airStrike(s2.state, f2.id, soft.index, 0).ok).toBe(true);
    expect(f2.hp).toBe(100);
  });

  it('a parked weapon covers its own hex and the ring around it', () => {
    // CIV6 (Anti-Air Gun, Mobile SAM): "Provides cover from air attacks up to
    // 1 hex away from the weapon", Range 1.
    expect(antiAirCover(GUNNER)).toBe(1);
    expect(antiAirCover(SAM)).toBe(1);
    expect(AIR_COVER_MAX).toBe(1);
    // a hull covers nothing: its Anti-Air Strength is its own close-range
    // defence, which is a different sentence of the same page
    expect(antiAirCover(HULL)).toBeLessThan(0);

    /** strike (8,11); `gunAt` says where the weapon stands, or none, and
     *  `covers` what the scan is expected to answer with. */
    function strike(gunAt: [number, number] | null, covers: boolean) {
      const { state, pad } = airState();
      setWar(state, 0, 1, true);
      const fighter = spawnUnit(state, FIGHTER, pad.index, 0)!;
      const land = tileAtCoords(state.map, 8, 11);
      spawnUnit(state, 'WARRIOR', land.index, 1);
      let gun: Unit | undefined;
      if (gunAt) {
        const at = tileAtCoords(state.map, gunAt[0], gunAt[1]);
        gun = spawnUnit(state, GUNNER, at.index, 1)!;
        gun.tileIndex = at.index;
      }
      expect(airCoverAgainst(state, fighter, land.index)).toBe(covers ? gun : undefined);
      expect(airStrike(state, fighter.id, land.index, 0).ok).toBe(true);
      return 100 - fighter.hp;
    }
    expect(strike(null, false)).toBe(0);
    expect(strike([8, 11], true)).toBeGreaterThan(0);   // the struck hex itself
    expect(strike([8, 12], true)).toBeGreaterThan(0);   // one hex away
    expect(strike([8, 14], false)).toBe(0);             // out of cover

    // the STRONGEST weapon in reach is the one that answers
    const { state, pad } = airState();
    setWar(state, 0, 1, true);
    const fighter = spawnUnit(state, FIGHTER, pad.index, 0)!;
    const land = tileAtCoords(state.map, 8, 11);
    spawnUnit(state, 'WARRIOR', land.index, 1);
    const weak = spawnUnit(state, GUNNER, land.index, 1)!;
    const strong = spawnUnit(state, SAM, tileAtCoords(state.map, 8, 12).index, 1)!;
    strong.tileIndex = tileAtCoords(state.map, 8, 12).index;
    expect(UNITS[SAM].antiAir!).toBeGreaterThan(UNITS[GUNNER].antiAir!);
    expect(airCoverAgainst(state, fighter, land.index)).toBe(strong);
    expect(weak).toBeTruthy();
  });

  it('the one exception the source names: an anti-air SHIP answers', () => {
    // CIV6: "the only exceptions to this rule are ships with the Anti-Air
    // Strength stat - they have additional close-range defenses, which
    // activate when they are attacked by an aircraft, and damage it in return."
    expect(UNITS[HULL].naval).toBe(true);
    expect(antiAirOf(HULL)).toBeGreaterThan(0);
    const { state, pad, sea } = airState();
    setWar(state, 0, 1, true);
    const bomber = spawnUnit(state, BOMBER, pad.index, 0)!;
    const ship = spawnUnit(state, HULL, sea.index, 1)!;
    expect(airStrikeTargets(state, bomber, 12)).toContain(sea.index);
    expect(airStrike(state, bomber.id, sea.index, 0).ok).toBe(true);
    expect(ship.hp).toBeLessThan(100);
    expect(bomber.hp).toBeLessThan(100);
  });

  it('refuses a tile the aircraft does not answer, and spends nothing doing it', () => {
    const { state, pad } = airState();
    setWar(state, 0, 1, true);
    const bomber = spawnUnit(state, BOMBER, pad.index, 0)!;
    const land = tileAtCoords(state.map, 8, 11);
    spawnUnit(state, GUNNER, land.index, 1);
    const mp = bomber.movesLeft;
    expect(airStrike(state, bomber.id, land.index, 0).ok).toBe(false);
    expect(bomber.movesLeft).toBe(mp);
  });
});

describe('re-basing', () => {
  it('reaches twice its Moves, and only a base of its own with room', () => {
    // CIV6: "the maximum re-base distance is twice the Moves of that air unit."
    const { state, city, pad } = airState();
    const fighter = spawnUnit(state, FIGHTER, city.centerIndex, 0)!;
    expect(rebaseRange(FIGHTER)).toBe(2 * UNITS[FIGHTER].moves);
    expect(canRebaseTo(state, fighter, pad.index)).toBe(true);
    expect(canRebaseTo(state, fighter, city.centerIndex)).toBe(false); // already here
    expect(canRebaseTo(state, fighter, tileAtCoords(state.map, 3, 3).index)).toBe(false);

    const targets = rebaseTargets(state, fighter, 6);
    expect(targets).toContain(pad.index);
    expect([...targets]).toEqual([...targets].sort((a, b) => a - b));

    expect(rebaseAir(state, fighter, pad.index)).toBe(true);
    expect(fighter.tileIndex).toBe(pad.index);
    expect(fighter.movesLeft).toBe(0);
    expect(rebaseAir(state, fighter, city.centerIndex)).toBe(false); // the turn is gone
  });
});

describe('losing a base', () => {
  it('a pillaged base scatters, and destroys when nothing is in reach', () => {
    // CIV6: "should your airbase be pillaged, your aircraft stationed within
    // will scatter to nearby valid bases instead of being destroyed. If there
    // are no nearby valid bases, the aircraft will be destroyed."
    const { state, city, pad } = airState();
    const fighter = spawnUnit(state, FIGHTER, pad.index, 0)!;
    pad.districtPillaged = true;
    displaceAirFrom(state, pad.index);
    expect(state.units).toContain(fighter);
    expect(fighter.tileIndex).toBe(city.centerIndex);

    const stranded = spawnUnit(state, FIGHTER, pad.index, 0)!;
    displaceAirFrom(state, pad.index);
    expect(state.units).not.toContain(stranded);
  });

  it('a sunk carrier takes its aircraft down with it', () => {
    // CIV6: "should your Aircraft Carrier be destroyed, your aircraft
    // stationed within will be destroyed."
    const { state, sea } = airState();
    spawnUnit(state, CARRIER, sea.index, 0);
    const aboard = spawnUnit(state, FIGHTER, sea.index, 0)!;
    displaceAirFrom(state, sea.index, false);
    expect(state.units).not.toContain(aboard);
  });

  it('a moving carrier carries its aircraft along', () => {
    const { state, sea: from } = airState();
    const to = tileAtCoords(state.map, 3, 2);
    to.terrain = 'COAST';
    const hull = spawnUnit(state, CARRIER, from.index, 0)!;
    const aboard = spawnUnit(state, FIGHTER, from.index, 0)!;
    const stayer = spawnUnit(state, FIGHTER, from.index, 1)!;
    hull.tileIndex = to.index;
    carryAirWith(state, hull, from.index);
    expect(aboard.tileIndex).toBe(to.index);
    expect(stayer.tileIndex).toBe(from.index); // another seat's plane is not cargo
  });
});

describe('an aircraft is not a tile occupant', () => {
  it('several share one base and none of them blocks it', () => {
    const { state, pad } = airState();
    const a = spawnUnit(state, FIGHTER, pad.index, 0)!;
    const b = spawnUnit(state, FIGHTER, pad.index, 0)!;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(unitsAt(state, pad.index)).toHaveLength(2);
    // and a ground unit still fits on the same plot
    expect(spawnUnit(state, 'WARRIOR', pad.index, 0)).toBeTruthy();
  });
});
