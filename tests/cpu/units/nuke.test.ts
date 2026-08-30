import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, setTileOwner, civsAtWar, seatOf } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { detonate, nukeReach, nukeTargets, siloReaches, siloTargets, siloTiles } from '../../../cpu/core/combat';
import { addWmd, irradiated, nukeBlast, nukeOffers, nukeVictims, wmdHeld } from '../../../cpu/core/nuclear';
import { NUCLEAR_DEVICES, NUKE_ROBOT_DAMAGE } from '../../../cpu/data/nuclear';
import { EMERGENCY_NUCLEAR } from '../../../cpu/data/seats';
import { wwGet } from '../../../cpu/core/weariness';
import { UNITS } from '../../../cpu/data/units';

// CIV6 (Nuclear weapons), Gathering Storm. A device needs the Manhattan
// Project, which needs Nuclear Fission, so nothing here is gate-reachable and
// every clause is pinned directly.

const DEV = 0;   // Nuclear Device — blast radius 1, 10 turns of fallout
const THERMO = 1;

function world() {
  const map = makeMap(20, 16);
  const state = makeState(map);
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  settleAt(state, tileAtCoords(map, 4, 4).index, 0);
  settleAt(state, tileAtCoords(map, 14, 10).index, 1);
  return state;
}

describe('the blast', () => {
  it('covers the target tile and everything within the device radius', () => {
    const state = world();
    const at = tileAtCoords(state.map, 10, 8);
    expect(nukeBlast(state, at.index, DEV).length).toBe(7);          // the hex and its ring
    expect(nukeBlast(state, at.index, THERMO).length).toBe(19);      // two rings
    expect(nukeBlast(state, at.index, DEV).map((t) => t.index))
      .toEqual([...nukeBlast(state, at.index, DEV).map((t) => t.index)].sort((a, b) => a - b));
  });

  it('is offered only where it reaches somebody else', () => {
    const state = world();
    const mine = tileAtCoords(state.map, 10, 8);
    setTileOwner(mine, 0);
    expect(nukeOffers(state, 0, DEV, mine.index)).toBe(false);
    const theirs = tileAtCoords(state.map, 11, 8);
    setTileOwner(theirs, 1);
    // the ring reaches their plot now, so the same hex is a target
    expect(nukeOffers(state, 0, DEV, mine.index)).toBe(true);
    expect(nukeVictims(state, 0, nukeBlast(state, mine.index, DEV))).toEqual([1]);
  });

  it('destroys what stands in it, and leaves the robot standing at 50 damage', () => {
    const state = world();
    const at = tileAtCoords(state.map, 10, 8);
    setTileOwner(at, 1);
    addWmd(state, 0, DEV, 1);
    const foot = spawnUnit(state, 'WARRIOR', at.index, 1)!;
    const bot = spawnUnit(state, 'GIANT_DEATH_ROBOT', tileAtCoords(state.map, 11, 8).index, 1)!;
    bot.hp = 100;
    detonate(state, 0, DEV, at.index);
    expect(state.units.some((u) => u.id === foot.id)).toBe(false);
    // CIV6 (Giant Death Robot): "A Nuclear Device or Thermonuclear Device does
    // 50 damage to it"
    expect(state.units.some((u) => u.id === bot.id)).toBe(true);
    expect(bot.hp).toBe(100 - NUKE_ROBOT_DAMAGE);
    // and the device is gone
    expect(wmdHeld(state, 0, DEV)).toBe(0);
  });

  it('pillages what the ground carries and contaminates every tile of it', () => {
    const state = world();
    const at = tileAtCoords(state.map, 10, 8);
    setTileOwner(at, 1);
    at.improvement = 'FARM';
    const nb = tileAtCoords(state.map, 11, 8);
    nb.district = 'CAMPUS';
    addWmd(state, 0, DEV, 1);
    detonate(state, 0, DEV, at.index);
    expect(at.pillaged).toBe(true);
    expect(nb.districtPillaged).toBe(true);
    for (const t of nukeBlast(state, at.index, DEV)) {
      expect(t.falloutTurns).toBe(NUCLEAR_DEVICES[DEV].fallout);
      expect(irradiated(t)).toBe(true);
    }
  });

  it('empties a city centre of HP and defences without ever capturing it', () => {
    const state = world();
    const foe = seatOf(state, 1)!.cities[0];
    const at = state.map.tiles[foe.centerIndex];
    foe.hp = 200;
    foe.outerHp = 100;
    addWmd(state, 0, DEV, 1);
    detonate(state, 0, DEV, at.index);
    // CIV6: "their HP and Defense Strength reduced to 0" — the centre floors
    // where every non-melee blow floors it, and the city stays its owner's
    expect(foe.hp).toBe(1);
    expect(foe.outerHp).toBe(0);
    expect(seatOf(state, 1)!.cities.some((c) => c.id === foe.id)).toBe(true);
  });
});

describe('what a launch costs', () => {
  it('declares war on whoever the blast lands on, and bills the launcher', () => {
    const state = world();
    const at = tileAtCoords(state.map, 10, 8);
    setTileOwner(at, 1);
    addWmd(state, 0, DEV, 1);
    expect(civsAtWar(state, 0, 1)).toBe(false);
    detonate(state, 0, DEV, at.index);
    // CIV6: "Using nuclear weapons counts as a declaration of war against any
    // civilization or city-state whose territory or units are in the blast"
    expect(civsAtWar(state, 0, 1)).toBe(true);
    // CIV6 (War weariness): 12x the era base, and the LAUNCHER pays it
    expect(wwGet(seatOf(state, 0)!, 1)).toBeGreaterThan(0);
    expect(wwGet(seatOf(state, 1)!, 0)).toBe(0);
  });

  it('raises a Nuclear Emergency against the launcher, over its own capital', () => {
    const state = world();
    const at = tileAtCoords(state.map, 10, 8);
    setTileOwner(at, 1);
    addWmd(state, 0, DEV, 1);
    detonate(state, 0, DEV, at.index);
    const e = (state.emergencies ?? []).find((x) => x.kind === EMERGENCY_NUCLEAR);
    expect(e).toBeDefined();
    expect(e!.target).toBe(0);
    // CIV6: "capture their Capital in 60 turns!"
    expect(e!.city).toBe(seatOf(state, 0)!.cities[0].id);
    expect(e!.affected).toEqual([1]);
  });
});

describe('who throws it', () => {
  it('the Missile Silo launches for the SEAT, at the device own range', () => {
    const state = world();
    const silo = tileAtCoords(state.map, 6, 6);
    setTileOwner(silo, 0);
    const target = tileAtCoords(state.map, 10, 8);
    setTileOwner(target, 1);
    addWmd(state, 0, DEV, 1);
    expect(siloTiles(state, 0)).toEqual([]);
    expect(siloTargets(state, 0, DEV, 12)).toEqual([]);
    silo.improvement = 'MISSILE_SILO';
    expect(siloTiles(state, 0).map((t) => t.index)).toEqual([silo.index]);
    expect(siloReaches(state, 0, DEV, target.index)).toBe(true);
    expect(siloTargets(state, 0, DEV, 12)).toContain(target.index);
    // a pillaged silo throws nothing
    silo.pillaged = true;
    expect(siloTargets(state, 0, DEV, 12)).toEqual([]);
  });

  it('a bomber carries it out to its own range; a submarine throws the device its own', () => {
    const state = world();
    const pad = tileAtCoords(state.map, 5, 5);
    setTileOwner(pad, 0);
    const bomber = spawnUnit(state, 'BOMBER', pad.index, 0)!;
    expect(nukeReach(bomber, DEV)).toBe(UNITS.BOMBER.ranged!.range);
    const sea = tileAtCoords(state.map, 6, 5);
    sea.terrain = 'COAST';
    const sub = spawnUnit(state, 'NUCLEAR_SUBMARINE', sea.index, 0)!;
    expect(nukeReach(sub, DEV)).toBe(NUCLEAR_DEVICES[DEV].range);
    expect(nukeReach(sub, THERMO)).toBe(NUCLEAR_DEVICES[THERMO].range);
    // CIV6: the list is bombers, Nuclear Submarines and the silo — nobody else
    const foot = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 5).index, 0)!;
    expect(nukeReach(foot, DEV)).toBe(-1);
    // and an empty arsenal offers nothing
    const theirs = tileAtCoords(state.map, 8, 5);
    setTileOwner(theirs, 1);
    expect(nukeTargets(state, bomber, DEV, 12)).toEqual([]);
    addWmd(state, 0, DEV, 1);
    expect(nukeTargets(state, bomber, DEV, 12)).toContain(theirs.index);
  });
});
