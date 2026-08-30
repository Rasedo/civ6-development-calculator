import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, grantTechs } from '../helpers';
import { emptySeat, setWar, setTileOwner, tileSeat } from '../../../cpu/core/seats';
import {
  spawnUnit, refreshUnits, unitFullMoves, tileFreeForUnit, findPath, gdrJump,
} from '../../../cpu/core/units';
import { defenderCS, cityRangedStrength, gdrNavalCS, meleeAttack } from '../../../cpu/core/combat';
import { airDefenseOf, antiAirAt, antiAirOf } from '../../../cpu/core/air';
import { formUp } from '../../../cpu/core/game';
import {
  UNITS, GDR_UPGRADES, GDR_DRONE_AA, GDR_PARTICLE_BEAM_CS, GDR_ENHANCED_MOVES,
  GDR_ARMOR_PLATING_CS, GDR_NAVAL_PENALTY, RANGED_CITY_PENALTY,
} from '../../../cpu/data/units';
import { MP_SCALE } from '../../../cpu/data/constants';
import { RESOURCES } from '../../../world/resources';

// CIV6 (Giant Death Robot), Gathering Storm. Nothing here is gate-reachable —
// the chassis needs Robotics and its upgrades the Future era — so every clause
// is pinned directly.

const BOT = 'GIANT_DEATH_ROBOT';

function world() {
  const state = makeState(makeMap(16, 14));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
  setWar(state, 0, 1, true);
  return state;
}

/** the robot, standing well clear of the city, with a full turn in hand */
function bot(state: ReturnType<typeof world>, col = 10, row = 8) {
  const u = spawnUnit(state, BOT, tileAtCoords(state.map, col, row).index, 0)!;
  u.hp = 100;
  return u;
}

describe('the chassis itself', () => {
  it('carries the four Future-era upgrades, each behind its own tech', () => {
    expect(GDR_UPGRADES.map((g) => [g.id, g.tech])).toEqual([
      ['DRONE_AIR_DEFENSE', 'ADVANCED_AI'],
      ['PARTICLE_BEAM', 'ADVANCED_POWER_CELLS'],
      ['ENHANCED_MOBILITY', 'CYBERNETICS'],
      ['REINFORCED_ARMOR', 'SMART_MATERIALS'],
    ]);
    expect(UNITS[BOT].gdr).toBe(true);
  });

  it('earns no experience from a fight it wins', () => {
    const state = world();
    const b = bot(state, 10, 8);
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 8).index, 1)!;
    foe.hp = 100;
    expect(meleeAttack(state, b.id, foe.tileIndex, 0).ok).toBe(true);
    // CIV6: "Cannot earn experience or Promotions."
    expect(b.xp ?? 0).toBe(0);
  });

  it('forms no Corps and no Army', () => {
    const state = world();
    const b = bot(state, 10, 8);
    spawnUnit(state, BOT, tileAtCoords(state.map, 11, 8).index, 0);
    // CIV6: "Cannot form Corps or Armies by any means" — refused before any
    // civic or tier question is asked.
    const r = formUp(state, b, tileAtCoords(state.map, 11, 8).index);
    expect(r.ok).toBe(false);
  });

  it('heals on its own ground and nowhere else', () => {
    const state = world();
    const home = tileAtCoords(state.map, 10, 8);
    const away = tileAtCoords(state.map, 12, 8);
    setTileOwner(home, 0);
    // CIV6 (Resource): a chassis with no continuous access to its strategic
    // "won't be able to Heal" — that bar is not the one under test here.
    home.resource = 'URANIUM';
    home.improvement = RESOURCES.URANIUM.improvement;
    const mine = bot(state, 10, 8);
    const out = bot(state, 12, 8);
    expect(tileSeat(away)).not.toBe(0);
    mine.hp = 40;
    out.hp = 40;
    // the heal asks for a turn spent standing still
    for (const u of [mine, out]) {
      u.movesFull = unitFullMoves(state, u);
      u.movesLeft = u.movesFull;
    }
    refreshUnits(state);
    // CIV6: "Can only heal in friendly territory."
    expect(mine.hp).toBeGreaterThan(40);
    expect(out.hp).toBe(40);
  });

  it('takes -17 Ranged Strength against a naval hull and none against a land unit', () => {
    const state = world();
    const b = bot(state, 10, 8);
    const archer = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 10, 9).index, 0)!;
    // CIV6: "-17 Ranged Strength against District defenses and naval units" —
    // the district half is the penalty every land ranged unit already pays, so
    // what the chassis adds is the naval half, and it needs no upgrade.
    expect(gdrNavalCS(b, 'FRIGATE')).toBe(-GDR_NAVAL_PENALTY);
    expect(gdrNavalCS(b, 'WARRIOR')).toBe(0);
    expect(gdrNavalCS(archer, 'FRIGATE')).toBe(0);
    // and the district half is unchanged for this chassis
    expect(cityRangedStrength(state, b, 100))
      .toBe(UNITS[BOT].ranged!.strength - RANGED_CITY_PENALTY);
  });
});

describe('Drone Air Defense', () => {
  it('raises the Anti-Air Defense Strength to 130', () => {
    const state = world();
    const b = bot(state, 10, 8);
    expect(antiAirOf(BOT)).toBe(UNITS[BOT].antiAir);
    expect(antiAirAt(state, b)).toBe(UNITS[BOT].antiAir);
    grantTechs(state, 'ADVANCED_AI');
    // CIV6: "Anti-Air Defense Strength increased to 130."
    expect(antiAirAt(state, b)).toBe(GDR_DRONE_AA);
    expect(airDefenseOf(state, b)).toBe(GDR_DRONE_AA);
    // the seat's tech, not the unit's — a rival's robot is unmoved
    const theirs = spawnUnit(state, BOT, tileAtCoords(state.map, 12, 8).index, 1)!;
    expect(antiAirAt(state, theirs)).toBe(UNITS[BOT].antiAir);
    // and it reaches only this chassis
    expect(antiAirAt(state, { type: 'ANTI_AIR_GUN', seat: 0 })).toBe(antiAirOf('ANTI_AIR_GUN'));
  });
});

describe('the Particle Beam Siege Cannon', () => {
  it('waives the city penalty and adds +30', () => {
    const state = world();
    const b = bot(state, 10, 8);
    const base = UNITS[BOT].ranged!.strength;
    expect(cityRangedStrength(state, b, 100)).toBe(base - RANGED_CITY_PENALTY);
    grantTechs(state, 'ADVANCED_POWER_CELLS');
    // CIV6: "Ranged attacks against Cities and Encampments are 100% effective
    // and gain +30 Ranged Strength."
    expect(cityRangedStrength(state, b, 100)).toBe(base + GDR_PARTICLE_BEAM_CS);
    expect(cityRangedStrength(state, b, 0)).toBe(base + GDR_PARTICLE_BEAM_CS);
    // no other chassis moves
    expect(cityRangedStrength(state, { type: 'ARCHER', seat: 0 }, 100))
      .toBe(UNITS.ARCHER.ranged!.strength - RANGED_CITY_PENALTY);
  });
});

describe('Enhanced Mobility', () => {
  it('adds +3 Moves', () => {
    const state = world();
    const b = bot(state, 10, 8);
    const before = unitFullMoves(state, b);
    expect(before).toBe(MP_SCALE * UNITS[BOT].moves);
    grantTechs(state, 'CYBERNETICS');
    // CIV6: "+3 Moves."
    expect(unitFullMoves(state, b)).toBe(before + MP_SCALE * GDR_ENHANCED_MOVES);
  });

  it('opens a mountain hex to the jump, and to nothing else', () => {
    const state = world();
    const peak = tileAtCoords(state.map, 11, 8);
    peak.elevation = 'MOUNTAIN';
    const b = bot(state, 10, 8);
    const foot = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 10, 9).index, 0)!;
    expect(gdrJump(state, b, peak)).toBe(false);
    expect(tileFreeForUnit(state, peak.index, 0, b)).toBe(false);
    grantTechs(state, 'CYBERNETICS');
    // CIV6: "Can perform a Jump action to cross over mountain terrain."
    expect(gdrJump(state, b, peak)).toBe(true);
    expect(tileFreeForUnit(state, peak.index, 0, b)).toBe(true);
    expect(findPath(state, b, peak.index)).not.toBeNull();
    // the same research does nothing for any other chassis
    expect(gdrJump(state, foot, peak)).toBe(false);
    expect(tileFreeForUnit(state, peak.index, 0, foot)).toBe(false);
    // and ICE is not a mountain
    const ice = tileAtCoords(state.map, 9, 8);
    ice.terrain = 'OCEAN';
    ice.feature = 'ICE';
    expect(gdrJump(state, b, ice)).toBe(false);
  });
});

describe('Reinforced Armor Plating', () => {
  it('adds +10 defending against land and naval units, and nothing against a plane', () => {
    const state = world();
    const b = bot(state, 10, 8);
    const foot = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 8).index, 1)!;
    const plane = spawnUnit(state, 'FIGHTER', tileAtCoords(state.map, 12, 8).index, 1)!;
    const cold = defenderCS(state, b, b.tileIndex, { attacker: foot, melee: true });
    const coldAir = defenderCS(state, b, b.tileIndex, { attacker: plane, melee: false });
    grantTechs(state, 'SMART_MATERIALS');
    // CIV6: "+10 Combat Strength when defending against land and naval units."
    expect(defenderCS(state, b, b.tileIndex, { attacker: foot, melee: true }))
      .toBe(cold + GDR_ARMOR_PLATING_CS);
    expect(defenderCS(state, b, b.tileIndex, { attacker: plane, melee: false })).toBe(coldAir);
  });
});
