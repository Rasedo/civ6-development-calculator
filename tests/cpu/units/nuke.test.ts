import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, setTileOwner, civsAtWar, seatOf } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { detonate, nukeReach, nukeTargets, plotDefenseModifier, siloReaches, siloTargets, siloTiles } from '../../../cpu/core/combat';
import { addWmd, irradiated, nukeBlast, nukeInterceptor, nukeInterceptStrength, nukeOffers, nukeVictims, wmdHeld } from '../../../cpu/core/nuclear';
import { NUCLEAR_DEVICES, NUKE_ROBOT_DAMAGE, NUKE_COVER_RANGE, NUKE_SILO_DEFENSE, NUKE_SUB_DEFENSE, NUKE_INTERCEPT_DAMAGE } from '../../../cpu/data/nuclear';
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
    // the LAUNCHER's own robot: a rival's would INTERCEPT (AntiAirCombat 90)
    const bot = spawnUnit(state, 'GIANT_DEATH_ROBOT', tileAtCoords(state.map, 11, 8).index, 0)!;
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
    nb.districtComplete = true;   // a COMPLETE district is pillaged; an unfinished one is removed
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

// Interception, measured live (lab 3): one anti-air attack on the warhead,
// one draw, cancelled iff the damage is above 50. On the test map the aim
// plot is flat grassland, so the ICBM channels' plot term is 0.
describe('what stops one', () => {
  function scene() {
    const state = world();
    const at = tileAtCoords(state.map, 10, 8);
    const victim = spawnUnit(state, 'WARRIOR', at.index, 1)!;
    addWmd(state, 0, DEV, 3);
    expect(plotDefenseModifier(at)).toBe(0);
    return { state, at, victim };
  }

  it('the anti-air side: the strongest fires at its health-scaled strength, the rest support by theirs', () => {
    const { state, at } = scene();
    expect(nukeInterceptStrength(state, 0, at.index)).toBe(0);
    const sam = spawnUnit(state, 'MOBILE_SAM', tileAtCoords(state.map, 11, 8).index, 1)!;
    expect(nukeInterceptStrength(state, 0, at.index)).toBe(100);
    expect(nukeInterceptor(state, 0, at.index)).toBe(sam.id);
    const second = spawnUnit(state, 'MOBILE_SAM', tileAtCoords(state.map, 9, 8).index, 1)!;
    expect(nukeInterceptStrength(state, 0, at.index)).toBe(105);       // +5 support
    second.hp = 50;
    expect(nukeInterceptStrength(state, 0, at.index)).toBe(102.5);     // a half-dead supporter gives +2.5
    sam.hp = 50;
    second.hp = 100;
    expect(nukeInterceptStrength(state, 0, at.index)).toBe(102.5);     // the healthy one fires now
    expect(nukeInterceptor(state, 0, at.index)).toBe(second.id);
    // a weapon of the LAUNCHER's own seat is not an interceptor
    spawnUnit(state, 'MOBILE_SAM', tileAtCoords(state.map, 10, 9).index, 0);
    expect(nukeInterceptStrength(state, 0, at.index)).toBe(102.5);
    // ...nor is anything beyond the cover range
    expect(NUKE_COVER_RANGE).toBe(1);
    const far = world();
    spawnUnit(far, 'MOBILE_SAM', tileAtCoords(far.map, 13, 8).index, 1);
    expect(nukeInterceptStrength(far, 0, at.index)).toBe(0);
  });

  it('a Missile Cruiser beside the aim stops a silo shot on flat ground at every roll, and spends the device', () => {
    const { state, at, victim } = scene();
    const sea = tileAtCoords(state.map, 11, 8);
    sea.terrain = 'COAST';
    const ship = spawnUnit(state, 'MISSILE_CRUISER', sea.index, 1)!;
    // S 110 against D 75: the weakest roll deals round(24 × 1.04^35) = 95
    expect(nukeInterceptStrength(state, 0, at.index)).toBe(110);
    expect(NUKE_SILO_DEFENSE).toBe(75);
    for (let i = 0; i < 3; i++) detonate(state, 0, DEV, at.index);
    expect(wmdHeld(state, 0, DEV)).toBe(0);
    expect(state.units.some((u) => u.id === victim.id)).toBe(true);
    expect(irradiated(at)).toBe(false);
    expect(ship.hp).toBe(100);   // a silo launcher is never hurt, and neither is the interceptor
  });

  it('an Anti-Air Gun at 1 HP stops nothing: S 80.1 against D 75 never clears 50', () => {
    const { state, at, victim } = scene();
    const gun = spawnUnit(state, 'ANTI_AIR_GUN', tileAtCoords(state.map, 11, 8).index, 1)!;
    gun.hp = 1;
    expect(nukeInterceptStrength(state, 0, at.index)).toBeCloseTo(80.1, 6);
    detonate(state, 0, DEV, at.index);
    expect(irradiated(at)).toBe(true);
    expect(state.units.some((u) => u.id === victim.id)).toBe(false);
  });

  it('a bomber takes the hit: a Missile Cruiser downs the strike and wounds the plane, a lone gun only wounds it', () => {
    const { state, at, victim } = scene();
    const pad = tileAtCoords(state.map, 5, 5);
    setTileOwner(pad, 0);
    const bomber = spawnUnit(state, 'BOMBER', pad.index, 0)!;
    const sea = tileAtCoords(state.map, 11, 8);
    sea.terrain = 'COAST';
    const ship = spawnUnit(state, 'MISSILE_CRUISER', sea.index, 1)!;
    // the warhead defends at the bomber's own Combat 85: S 110 deals 64..93
    detonate(state, 0, DEV, at.index, bomber);
    expect(irradiated(at)).toBe(false);
    expect(bomber.hp).toBeGreaterThan(0);
    expect(bomber.hp).toBeLessThanOrEqual(100 - 64);
    // against an Anti-Air Gun (90) the same bomber takes 29..43 and the strike lands
    state.units.splice(state.units.indexOf(ship), 1);
    bomber.hp = 100;
    spawnUnit(state, 'ANTI_AIR_GUN', tileAtCoords(state.map, 9, 8).index, 1);
    detonate(state, 0, DEV, at.index, bomber);
    expect(irradiated(at)).toBe(true);
    expect(state.units.some((u) => u.id === victim.id)).toBe(false);
    expect(bomber.hp).toBeGreaterThanOrEqual(100 - 43);
    expect(bomber.hp).toBeLessThanOrEqual(100 - 29);
    expect(NUKE_INTERCEPT_DAMAGE).toBe(50);
    expect(NUKE_SUB_DEFENSE).toBe(80);
  });

  it('rough ground under the aim plot is what an ICBM loses: hills and a feature read +6, marsh −2', () => {
    const state = world();
    const t = tileAtCoords(state.map, 10, 8);
    t.elevation = 'HILLS';
    t.feature = 'RAINFOREST';
    expect(plotDefenseModifier(t)).toBe(6);
    t.elevation = 'FLAT';
    t.feature = 'MARSH';
    expect(plotDefenseModifier(t)).toBe(-2);
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

// Measured live (lab 3, fifteen strikes, fifteen exact): the population rule
// and the rest of the blast.
describe('what the citizens pay', () => {
  function scene() {
    const state = world();
    const mine = seatOf(state, 0)!.cities[0];
    const aim = tileAtCoords(state.map, 6, 4);   // two east of the centre at (4,4)
    const blast = nukeBlast(state, aim.index, DEV).map((t) => t.index);
    expect(blast).not.toContain(mine.centerIndex);
    const inside = blast.filter((i) => i !== aim.index).slice(0, 2);
    const outside = tileAtCoords(state.map, 1, 1).index;
    addWmd(state, 0, DEV, 3);
    return { state, mine, aim, blast, inside, outside };
  }

  it('a city loses the citizens working tiles inside the blast; its centre never counts', () => {
    const { state, mine, aim, inside, outside } = scene();
    mine.population = 5;
    mine.workedTiles = [...inside, outside, mine.centerIndex];
    detonate(state, 0, DEV, aim.index);
    expect(mine.population).toBe(3);
    // the pick stands until the next walk re-seats the survivors
    expect(mine.workedTiles).toEqual([...inside, outside, mine.centerIndex]);
  });

  it('kills nobody when every citizen it has stands inside the blast, and an idle citizen voids the pass', () => {
    const { state, mine, aim, inside } = scene();
    mine.population = 2;
    mine.workedTiles = [...inside];
    detonate(state, 0, DEV, aim.index);
    expect(mine.population).toBe(2);
    mine.population = 3;   // two workers, one citizen on no tile
    detonate(state, 0, DEV, aim.index);
    expect(mine.population).toBe(1);
  });

  it('a neighbouring city pays for its own citizen standing in the blast', () => {
    const { state, aim, inside } = scene();
    const foe = seatOf(state, 1)!.cities[0];
    foe.population = 4;
    foe.workedTiles = [inside[0]];
    detonate(state, 0, DEV, aim.index);
    expect(foe.population).toBe(3);
  });

  it('removes an unfinished district, only pillages a complete one, and never shortens fallout', () => {
    const { state, aim, blast } = scene();
    const ud = state.map.tiles[blast.find((i) => i !== aim.index)!];
    const cd = state.map.tiles[blast.filter((i) => i !== aim.index)[1]];
    ud.district = 'CAMPUS';
    ud.districtComplete = false;
    cd.district = 'CAMPUS';
    cd.districtComplete = true;
    aim.falloutTurns = 20;
    detonate(state, 0, DEV, aim.index);
    expect(ud.district).toBeNull();
    expect(ud.districtPillaged).toBeFalsy();
    expect(cd.district).toBe('CAMPUS');
    expect(cd.districtPillaged).toBe(true);
    expect(aim.falloutTurns).toBe(20);
    expect(ud.falloutTurns).toBe(NUCLEAR_DEVICES[DEV].fallout);
  });

  it('a silo cannot aim inside its own blast radius, nor at a plot the seat has not revealed', () => {
    const state = world();
    const silo = tileAtCoords(state.map, 6, 6);
    setTileOwner(silo, 0);
    silo.improvement = 'MISSILE_SILO';
    addWmd(state, 0, DEV, 1);
    const adjacent = tileAtCoords(state.map, 7, 6);
    const clear = tileAtCoords(state.map, 8, 6);
    expect(siloReaches(state, 0, DEV, adjacent.index)).toBe(false);
    expect(siloReaches(state, 0, DEV, clear.index)).toBe(true);
    state.fogOfWar = true;
    seatOf(state, 0)!.explored = new Array(state.map.tiles.length).fill(0);
    expect(siloReaches(state, 0, DEV, clear.index)).toBe(false);
    seatOf(state, 0)!.explored[clear.index] = 1;
    expect(siloReaches(state, 0, DEV, clear.index)).toBe(true);
  });
});
