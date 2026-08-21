import { describe, it, expect } from 'vitest';
import { BARB_SEAT, emptySeat, isBarbSeat, seatOf, setWar } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import { endTurn, foundCity, serialize, deserialize } from '../../../cpu/core/game';
import { seatPhase } from '../../../cpu/core/phase';
import { spawnUnit, builderRepair } from '../../../cpu/core/units';
import { meleeAttack, rangedAttack, attackTargets, terrainDefense, barbarianPhase, FLANKING_CS, SUPPORT_CS, XP_ATTACK, XP_DEFEND, XP_LEVELS, xpLevelBonus, unitLevel, awardDefenseXp, flankCount, supportCount, flankSupportLive, FLANK_SUPPORT_CIVIC, classMatchupCS, CLASS_MELEE_VS_ANTICAV, CLASS_ANTICAV_VS_CAV } from '../../../cpu/core/combat';
import { routePlunderer } from '../../../cpu/core/trade';
import { CITY_MAX_HP } from '../../../cpu/data/units';
import { neighbors } from '../../../world/hex';
import { isWater } from '../../../world/query';
import { unitPassable } from '../../../cpu/core/units';

function battlefield() {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
  return { state, city };
}

describe('combat', () => {
  it('terrain grants defense; melee deals mutual damage', () => {
    const { state } = battlefield();
    const hill = tileAtCoords(state.map, 12, 9);
    hill.elevation = 'HILLS';
    expect(terrainDefense(hill)).toBe(3);

    const atk = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 9).index, 0)!;
    atk.tileIndex = tileAtCoords(state.map, 11, 9).index;
    const def = spawnUnit(state, 'WARRIOR', hill.index, BARB_SEAT)!;
    def.tileIndex = hill.index;

    expect(meleeAttack(state, atk.id, hill.index, 0).ok).toBe(true);
    expect(def.hp).toBeLessThan(100);
    expect(atk.hp).toBeLessThan(100);
    expect(atk.movesLeft).toBe(0);
  });

  it('a fallen city takes its garrison with it', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index, 1);
    setWar(state, 0, 1, true);
    const garrison = spawnUnit(state, 'WARRIOR', city.centerIndex, 1)!;
    const civilian = spawnUnit(state, 'BUILDER', city.centerIndex, 1)!;
    const from = tileAtCoords(state.map, 8, 9);
    const atk = spawnUnit(state, 'WARRIOR', from.index, 0)!;
    city.hp = 1;

    // CITY-FIRST: the garrison is not a separate defender, so the blow lands
    // on the centre and the city falls with both units still standing on it.
    expect(meleeAttack(state, atk.id, city.centerIndex, 0).ok).toBe(true);
    expect(seatOf(state, 1)!.cities.length).toBe(0);
    expect(seatOf(state, 0)!.cities.some((c) => c.centerIndex === city.centerIndex)).toBe(true);
    expect(state.units.some((u) => u.id === garrison.id)).toBe(false);
    expect(state.units.some((u) => u.id === civilian.id)).toBe(false);
    expect(state.units.some((u) => u.id === atk.id)).toBe(true); // the captor never entered
    expect(state.map.tiles[city.centerIndex].antiquity).toBeFalsy(); // a centre carries a district
  });

  it('is reproducible from the serialized RNG state', () => {
    const setup = () => {
      const { state } = battlefield();
      const atk = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 9).index, 0)!;
      atk.tileIndex = tileAtCoords(state.map, 11, 9).index;
      const def = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 12, 9).index, BARB_SEAT)!;
      def.tileIndex = tileAtCoords(state.map, 12, 9).index;
      return { state, atk, def };
    };
    const a = setup();
    const b = { state: deserialize(serialize(a.state)), atkId: a.atk.id, defIdx: a.def.tileIndex };
    meleeAttack(a.state, a.atk.id, a.def.tileIndex, 0);
    meleeAttack(b.state, b.atkId, b.defIdx, 0);
    expect(serialize(a.state)).toBe(serialize(b.state));
  });

  it('a slain defender lets the victor advance; camps are cleared with reward', () => {
    const { state } = battlefield();
    const campTile = tileAtCoords(state.map, 12, 9);
    state.barbSeat.camps.push(campTile.index);
    const atk = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 11, 9).index, 0)!;
    atk.tileIndex = tileAtCoords(state.map, 11, 9).index;
    const def = spawnUnit(state, 'WARRIOR', campTile.index, BARB_SEAT)!;
    def.tileIndex = campTile.index;
    def.hp = 5;

    const gold = seatOf(state, 0)!.treasury;
    expect(meleeAttack(state, atk.id, campTile.index, 0).ok).toBe(true);
    expect(state.units.some((u) => u.id === def.id)).toBe(false);
    expect(atk.tileIndex).toBe(campTile.index);
    expect(state.barbSeat.camps.length).toBe(0);
    expect(seatOf(state, 0)!.treasury).toBe(gold + 50);
  });

  // NAVAL barbarians. Two invariants the GPU mirror got
  // wrong until t34 caught it — a hull spawns on WATER, and killing
  // an adjacent LAND unit never walks it ashore (tileFreeForUnit refuses land
  // to a naval unit, so meleeAttack's advance is skipped).
  it('a coastal camp fields a barbarian hull, on water', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 9, 9).index);
    // A reachable coast makes it a PIRATE camp; the raid rotation reaches its
    // CLASS slot when (campNo + turn) % 3 === 0.
    state.turn = 3;
    const camp1 = tileAtCoords(state.map, 15, 15);
    state.barbSeat.camps.push(camp1.index);
    for (const n of neighbors(state.map, camp1)) n.terrain = 'COAST';

    let galley: ReturnType<typeof spawnUnit> = null;
    for (let i = 0; i < 400 && !galley; i++) {
      barbarianPhase(state);
      galley = state.units.find((u) => isBarbSeat(u.seat) && u.type === 'GALLEY') ?? null;
    }
    expect(galley).not.toBeNull();
    expect(isWater(state.map.tiles[galley!.tileIndex])).toBe(true);
  });

  it('a barbarian hull kills ashore but never advances onto land', () => {
    const { state } = battlefield();
    const water = tileAtCoords(state.map, 11, 9);
    water.terrain = 'COAST';
    const galley = spawnUnit(state, 'GALLEY', water.index, BARB_SEAT)!;
    galley.tileIndex = water.index;
    const land = tileAtCoords(state.map, 12, 9);
    const builder = spawnUnit(state, 'BUILDER', land.index, 0)!;
    builder.tileIndex = land.index;

    expect(meleeAttack(state, galley.id, land.index, 0).ok).toBe(true);
    expect(state.units.some((u) => u.id === builder.id)).toBe(false); // the kill lands
    expect(galley.tileIndex).toBe(water.index); // ... the hull stays afloat
  });

  it('ranged attacks take no retaliation and civilians die to melee', () => {
    const { state } = battlefield();
    const archer = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 11, 9).index, 0)!;
    archer.tileIndex = tileAtCoords(state.map, 11, 9).index;
    const barb = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 13, 9).index, BARB_SEAT)!;
    barb.tileIndex = tileAtCoords(state.map, 13, 9).index;

    expect(attackTargets(state, archer)).toContain(barb.tileIndex); // range 2
    expect(rangedAttack(state, archer.id, barb.tileIndex, 0).ok).toBe(true);
    expect(barb.hp).toBeLessThan(100);
    expect(archer.hp).toBe(100);

    const builder = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 12, 9).index, 0)!;
    builder.tileIndex = tileAtCoords(state.map, 12, 9).index;
    barb.movesLeft = 2;
    expect(meleeAttack(state, barb.id, builder.tileIndex, 0).ok).toBe(true);
    expect(state.units.some((u) => u.id === builder.id)).toBe(false);
  });
});

describe('barbarians', () => {
  it('camps spawn deterministically and send raiders that pillage', () => {
    const { state } = battlefield();
    const farm = tileAtCoords(state.map, 10, 9);
    farm.improvement = 'FARM';
    for (let i = 0; i < 60 && state.barbSeat.camps.length === 0; i++) barbarianPhase(state);
    expect(state.barbSeat.camps.length).toBeGreaterThan(0);
    for (let i = 0; i < 120 && !farm.pillaged; i++) barbarianPhase(state);
    expect(farm.pillaged).toBe(true);

    // pillaged improvements are dead weight until repaired
    const builder = spawnUnit(state, 'BUILDER', farm.index, 0)!;
    builder.tileIndex = farm.index;
    expect(builderRepair(state, builder.id).ok).toBe(true);
    expect(farm.pillaged).toBe(false);
  });

  it('cities take siege damage, get sacked at 0, and heal when clear', () => {
    const { state, city } = battlefield();
    city.population = 8;
    seatOf(state, 0)!.treasury = 200;
    const barb = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 10, 9).index, BARB_SEAT)!;
    barb.tileIndex = tileAtCoords(state.map, 10, 9).index;

    let guard = 0;
    while (city.hp > 0 && city.population === 8 && guard++ < 60) {
      barb.movesLeft = 4;
      barb.hp = 100;
      meleeAttack(state, barb.id, city.centerIndex, 0);
    }
    expect(city.population).toBeLessThan(8); // sacked
    expect(city.hp).toBe(CITY_MAX_HP / 2);

    state.units = []; // barbarians gone
    seatPhase(state); // unbesieged cities heal in the SEAT phase
    expect(city.hp).toBe(CITY_MAX_HP / 2 + 20);
  });

  it('a barbarian ON the Trader tile plunders the route', () => {
    const { state } = battlefield();
    settleAt(state, tileAtCoords(state.map, 14, 9).index);
    const wt = tileAtCoords(state.map, 12, 9).index;
    expect(routePlunderer(state, wt, 0)).toBe(null);
    spawnUnit(state, 'WARRIOR', wt, BARB_SEAT);
    expect(routePlunderer(state, wt, 0)).toBe(BARB_SEAT);
  });

  it('the barbarian phase runs inside endTurn without disturbing peace-mode saves', () => {
    const { state } = battlefield();
    for (let i = 0; i < 5; i++) endTurn(state);
    expect(state.turn).toBe(6);
    const calm = makeState(makeMap(16, 16));
    foundCity(calm, tileAtCoords(calm.map, 8, 8).index, 0); // units mode off: no settler needed
    for (let i = 0; i < 5; i++) endTurn(calm);
    expect(calm.units.length).toBe(0); // units mode off => no barbarians
  });
});

// flanking & support. The CB-log `diff` (q = round(Δstrength·10)) is
// the parity acceptance value, and it is independent of the RNG draw — so a
// clean way to test the CS terms is to read `diff` off the combat log with and
// without an adjacent unit. FLANKING_CS·1 = +2 attacker CS = +20 on the mel
// diff; SUPPORT_CS·1 = +2 defender CS = −20 on the mel/rng diff.
describe('flanking & support', () => {
  const rollDiff = (tag: string, fn: () => void): number => {
    const log: string[] = [];
    (globalThis as any).__cbLog = log;
    try {
      fn();
    } finally {
      delete (globalThis as any).__cbLog;
    }
    const line = log.find((l) => l.startsWith(`k:${tag} `));
    expect(line, `expected a ${tag} roll in ${JSON.stringify(log)}`).toBeDefined();
    return Number(line!.match(/diff(-?\d+)/)![1]);
  };

  // a passable neighbour of `at` other than the excluded tile
  const freeNeighbor = (state: ReturnType<typeof battlefield>['state'], atIdx: number, excludeIdx: number) => {
    const n = neighbors(state.map, state.map.tiles[atIdx]).find((t) => unitPassable(t) && t.index !== excludeIdx);
    expect(n).toBeDefined();
    return n!;
  };

  it('exports the +2 CS constants', () => {
    expect(FLANKING_CS).toBe(2);
    expect(SUPPORT_CS).toBe(2);
  });

  // The scenes below all grant MILITARY_TRADITION to seat 0, which is also what
  // switches the BARBARIANS on: with one major in the game, one researcher is
  // "at least half of the major civilizations".
  const armed = () => {
    const b = battlefield();
    grantCivics(b.state, FLANK_SUPPORT_CIVIC);
    return b;
  };

  it('CIV6: neither bonus exists before Military Tradition', () => {
    const { state } = battlefield();
    const atkTile = tileAtCoords(state.map, 11, 9).index;
    const defTile = tileAtCoords(state.map, 12, 9).index;
    const atk = spawnUnit(state, 'WARRIOR', atkTile, 0)!;
    const def = spawnUnit(state, 'WARRIOR', defTile, BARB_SEAT)!;
    const fn = freeNeighbor(state, defTile, atkTile);
    spawnUnit(state, 'WARRIOR', fn.index, 0);
    expect(flankSupportLive(state, 0)).toBe(false);
    expect(flankSupportLive(state, BARB_SEAT)).toBe(false);
    expect(flankCount(state, defTile, atk)).toBe(0);
    expect(supportCount(state, defTile, def)).toBe(0);
    grantCivics(state, FLANK_SUPPORT_CIVIC);
    expect(flankSupportLive(state, 0)).toBe(true);
    expect(flankSupportLive(state, BARB_SEAT)).toBe(true); // 1 of 1 majors is half
    expect(flankCount(state, defTile, atk)).toBe(1);
  });

  it('a melee attacker gains +2 CS per flanker adjacent to the defender', () => {
    const base = battlefield();
    const atkTile = tileAtCoords(base.state.map, 11, 9).index;
    const defTile = tileAtCoords(base.state.map, 12, 9).index;
    const setup = () => {
      const { state } = armed();
      const atk = spawnUnit(state, 'WARRIOR', atkTile, 0)!;
      atk.tileIndex = atkTile;
      const def = spawnUnit(state, 'WARRIOR', defTile, BARB_SEAT)!;
      def.tileIndex = defTile;
      return { state, atk };
    };

    const plain = setup();
    const d0 = rollDiff('mel', () => meleeAttack(plain.state, plain.atk.id, defTile, 0));

    const flanked = setup();
    const fn = freeNeighbor(flanked.state, defTile, atkTile); // a SECOND seat-0 unit next to the defender
    const flanker = spawnUnit(flanked.state, 'WARRIOR', fn.index, 0)!;
    flanker.tileIndex = fn.index;
    const d1 = rollDiff('mel', () => meleeAttack(flanked.state, flanked.atk.id, defTile, 0));

    expect(d1).toBe(d0 + FLANKING_CS * 10); // +2 CS -> +20 in diff·10
  });

  it('CIV6: only units the ATTACKER owns provide Flanking', () => {
    const { state } = armed();
    state.seats.push(emptySeat(1));
    const atkTile = tileAtCoords(state.map, 11, 9).index;
    const defTile = tileAtCoords(state.map, 12, 9).index;
    const atk = spawnUnit(state, 'WARRIOR', atkTile, 0)!;
    spawnUnit(state, 'WARRIOR', defTile, BARB_SEAT);
    const fn = freeNeighbor(state, defTile, atkTile);
    // hostile to the defender (barbarians are hostile to everyone) but NOT mine
    const third = spawnUnit(state, 'WARRIOR', fn.index, 1)!;
    third.tileIndex = fn.index;
    expect(flankCount(state, defTile, atk)).toBe(0);
    third.seat = 0;
    expect(flankCount(state, defTile, atk)).toBe(1);
  });

  it('CIV6: "units across a River from the targeted enemy do not provide Flanking"', () => {
    const { state } = armed();
    const atkTile = tileAtCoords(state.map, 11, 9).index;
    const defTile = tileAtCoords(state.map, 12, 9).index;
    const atk = spawnUnit(state, 'WARRIOR', atkTile, 0)!;
    spawnUnit(state, 'WARRIOR', defTile, BARB_SEAT);
    const fn = freeNeighbor(state, defTile, atkTile);
    spawnUnit(state, 'WARRIOR', fn.index, 0);
    expect(flankCount(state, defTile, atk)).toBe(1);
    state.map.tiles[defTile].riverMask = 0b111111; // a river on every edge
    expect(flankCount(state, defTile, atk)).toBe(0);
  });

  it('a melee defender gains +2 CS per adjacent friendly military (support)', () => {
    const atkC = { col: 11, row: 9 };
    const defC = { col: 12, row: 9 };
    const setup = () => {
      const { state } = armed();
      const atkTile = tileAtCoords(state.map, atkC.col, atkC.row).index;
      const defTile = tileAtCoords(state.map, defC.col, defC.row).index;
      const atk = spawnUnit(state, 'WARRIOR', atkTile, 0)!;
      atk.tileIndex = atkTile;
      const def = spawnUnit(state, 'WARRIOR', defTile, BARB_SEAT)!;
      def.tileIndex = defTile;
      return { state, atk, atkTile, defTile };
    };

    const plain = setup();
    const d0 = rollDiff('mel', () => meleeAttack(plain.state, plain.atk.id, plain.defTile, 0));

    const supported = setup();
    const sn = freeNeighbor(supported.state, supported.defTile, supported.atkTile);
    const helper = spawnUnit(supported.state, 'WARRIOR', sn.index, BARB_SEAT)!; // same side as the defender
    helper.tileIndex = sn.index;
    const d1 = rollDiff('mel', () => meleeAttack(supported.state, supported.atk.id, supported.defTile, 0));

    expect(d1).toBe(d0 - SUPPORT_CS * 10); // defender +2 CS -> −20 in diff·10
  });

  it('CIV6: "ranged attacks ignore any Support received by the defender"', () => {
    const setup = () => {
      const { state } = armed();
      const atkTile = tileAtCoords(state.map, 11, 9).index;
      const defTile = tileAtCoords(state.map, 13, 9).index; // range 2
      const archer = spawnUnit(state, 'ARCHER', atkTile, 0)!;
      archer.tileIndex = atkTile;
      const def = spawnUnit(state, 'WARRIOR', defTile, BARB_SEAT)!;
      def.tileIndex = defTile;
      return { state, archer, atkTile, defTile };
    };

    const plain = setup();
    const d0 = rollDiff('rng', () => rangedAttack(plain.state, plain.archer.id, plain.defTile, 0));

    const supported = setup();
    const sn = freeNeighbor(supported.state, supported.defTile, supported.atkTile);
    const helper = spawnUnit(supported.state, 'WARRIOR', sn.index, BARB_SEAT)!;
    helper.tileIndex = sn.index;
    // the support is REAL — a melee attack would feel it
    expect(supportCount(supported.state, supported.defTile, helper)).toBe(1);
    const d1 = rollDiff('rng', () => rangedAttack(supported.state, supported.archer.id, supported.defTile, 0));

    expect(d1).toBe(d0);
  });

  it('CIV6: a defender inside a defensible district gains no Support', () => {
    const { state, city } = armed();
    const def = spawnUnit(state, 'WARRIOR', city.centerIndex, 0)!;
    const sn = neighbors(state.map, state.map.tiles[city.centerIndex]).find((t) => unitPassable(t))!;
    spawnUnit(state, 'WARRIOR', sn.index, 0);
    expect(supportCount(state, city.centerIndex, def)).toBe(0);
    // the same pair one tile off the centre does get it
    expect(supportCount(state, sn.index, def)).toBeGreaterThan(0);
  });
});

// CIV6 (Combat, "Unit class modifiers"): "Melee units receive a +5 CS bonus
// against anti-cavalry units. Anti-cavalry units receive a +10 CS bonus against
// light cavalry, heavy cavalry, or ranged cavalry units."
describe('unit class modifiers', () => {
  it('pays +5 melee-vs-anti-cavalry and +10 anti-cavalry-vs-cavalry, and nothing else', () => {
    expect(classMatchupCS('WARRIOR', 'SPEARMAN')).toBe(CLASS_MELEE_VS_ANTICAV);
    expect(classMatchupCS('MUSKETMAN', 'PIKEMAN')).toBe(CLASS_MELEE_VS_ANTICAV);
    expect(classMatchupCS('SPEARMAN', 'HORSEMAN')).toBe(CLASS_ANTICAV_VS_CAV);
    expect(classMatchupCS('PIKEMAN', 'KNIGHT')).toBe(CLASS_ANTICAV_VS_CAV);
    // the pairings that do NOT exist
    expect(classMatchupCS('SPEARMAN', 'WARRIOR')).toBe(0);   // anti-cav vs melee
    expect(classMatchupCS('HORSEMAN', 'SPEARMAN')).toBe(0);  // cavalry vs anti-cav
    expect(classMatchupCS('WARRIOR', 'KNIGHT')).toBe(0);     // melee vs cavalry
    expect(classMatchupCS('ARCHER', 'SPEARMAN')).toBe(0);    // ranged is neither
  });

  it('both sides of one melee roll carry their own class term', () => {
    const rollDiff = (tag: string, fn: () => void): number => {
      const log: string[] = [];
      (globalThis as any).__cbLog = log;
      try { fn(); } finally { delete (globalThis as any).__cbLog; }
      return Number(log.find((l) => l.startsWith(`k:${tag} `))!.match(/diff(-?\d+)/)![1]);
    };
    const scene = (atkType: string, defType: string) => {
      const state = makeState(makeMap(20, 20));
      state.unitsMode = true;
      settleAt(state, tileAtCoords(state.map, 9, 9).index);
      const atkTile = tileAtCoords(state.map, 11, 9).index;
      const defTile = tileAtCoords(state.map, 12, 9).index;
      const atk = spawnUnit(state, atkType, atkTile, 0)!;
      spawnUnit(state, defType, defTile, BARB_SEAT);
      return rollDiff('mel', () => meleeAttack(state, atk.id, defTile, 0));
    };
    const SPEAR_OVER_ARCHER = 25 - 15; // the two defenders' own Combat Strength
    // a Warrior into a Spearman: +5 to me, nothing to it
    expect(scene('WARRIOR', 'SPEARMAN') - scene('WARRIOR', 'ARCHER'))
      .toBe((CLASS_MELEE_VS_ANTICAV - SPEAR_OVER_ARCHER) * 10);
    // a Horseman into a Spearman: nothing to me, +10 to it
    expect(scene('HORSEMAN', 'ARCHER') - scene('HORSEMAN', 'SPEARMAN'))
      .toBe((SPEAR_OVER_ARCHER + CLASS_ANTICAV_VS_CAV) * 10);
  });
});

describe('XP & levels', () => {
  const rollDiff = (tag: string, fn: () => void): number => {
    const log: string[] = [];
    (globalThis as any).__cbLog = log;
    try {
      fn();
    } finally {
      delete (globalThis as any).__cbLog;
    }
    const line = log.find((l) => l.startsWith(`k:${tag} `));
    expect(line, `expected a ${tag} roll in ${JSON.stringify(log)}`).toBeDefined();
    return Number(line!.match(/diff(-?\d+)/)![1]);
  };

  const atkTile = (s: ReturnType<typeof battlefield>['state']) => tileAtCoords(s.map, 11, 9).index;
  const defTile = (s: ReturnType<typeof battlefield>['state']) => tileAtCoords(s.map, 12, 9).index;

  it('exports the XP constants and level helper', () => {
    expect(XP_ATTACK).toBe(5);
    expect(XP_DEFEND).toBe(2);
    expect(XP_LEVELS).toEqual([15, 45, 90]);
    expect(unitLevel({ xp: 0 })).toBe(0);
    expect(unitLevel({ xp: 14 })).toBe(0);
    expect(unitLevel({ xp: 15 })).toBe(1);
    expect(unitLevel({ xp: 44 })).toBe(1);
    expect(unitLevel({ xp: 45 })).toBe(2);
    expect(unitLevel({ xp: 89 })).toBe(2);
    expect(unitLevel({ xp: 90 })).toBe(3);
    expect(xpLevelBonus({ xp: 0 })).toBe(0);
    expect(xpLevelBonus({ xp: 15 })).toBe(5);
    expect(xpLevelBonus({ xp: 45 })).toBe(10);
    expect(xpLevelBonus({ xp: 90 })).toBe(15);
    expect(xpLevelBonus({})).toBe(0); // undefined xp reads as 0
  });

  it('a fresh seat-0/civ unit starts at 0 xp; a barbarian carries none', () => {
    const { state } = battlefield();
    const p = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    expect(p.xp).toBe(0);
    const b = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 15, 15).index, BARB_SEAT)!;
    expect(b.xp).toBeUndefined();
  });

  it('an attacker gains +5 per attack; a barbarian attacker accrues nothing', () => {
    const { state } = battlefield();
    const atk = spawnUnit(state, 'WARRIOR', atkTile(state), 0)!;
    atk.tileIndex = atkTile(state);
    const def = spawnUnit(state, 'WARRIOR', defTile(state), BARB_SEAT)!;
    def.tileIndex = defTile(state);
    def.hp = 100; // survives the single hit
    meleeAttack(state, atk.id, def.tileIndex, 0);
    expect(atk.xp).toBe(5);
    expect(def.xp).toBeUndefined(); // barbarians never accrue

    // a second attack stacks (the heal / MP aside — force another strike)
    atk.movesLeft = 2;
    meleeAttack(state, atk.id, def.tileIndex, 0);
    expect(atk.xp).toBe(10);
  });

  it('a surviving military defender gains +2; a barbarian defender does not', () => {
    const { state } = battlefield();
    const barb = spawnUnit(state, 'WARRIOR', atkTile(state), BARB_SEAT)!;
    barb.tileIndex = atkTile(state);
    barb.movesLeft = 2;
    const def = spawnUnit(state, 'WARRIOR', defTile(state), 0)!;
    def.tileIndex = defTile(state);
    def.hp = 100; // survives
    meleeAttack(state, barb.id, def.tileIndex, 0);
    expect(def.xp).toBe(2); // survived the defense
    expect(barb.xp).toBeUndefined();
  });

  it('awardDefenseXp: military survivor +2, civilian and killed unit none', () => {
    const { state } = battlefield();
    const mil = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 3).index, 0)!;
    mil.hp = 100;
    awardDefenseXp(mil);
    expect(mil.xp).toBe(2);
    const civ = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 4, 4).index, 0)!;
    civ.hp = 100;
    awardDefenseXp(civ);
    expect(civ.xp).toBe(0); // civilians never fight
    const dead = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    dead.hp = 0;
    awardDefenseXp(dead);
    expect(dead.xp).toBe(0); // no XP for a killed defender
  });

  it('each level adds +5 CS at ATTACK (mel diff rises 5 CS per level)', () => {
    const run = (atkXp: number): number => {
      const { state } = battlefield();
      const atk = spawnUnit(state, 'WARRIOR', atkTile(state), 0)!;
      atk.tileIndex = atkTile(state);
      atk.xp = atkXp;
      const def = spawnUnit(state, 'WARRIOR', defTile(state), BARB_SEAT)!;
      def.tileIndex = defTile(state);
      def.hp = 100;
      return rollDiff('mel', () => meleeAttack(state, atk.id, def.tileIndex, 0));
    };
    const base = run(0);
    expect(run(15)).toBe(base + 5 * 10); // level 1 → +5 CS → +50 in diff·10
    expect(run(45)).toBe(base + 10 * 10); // level 2 → +10 CS
    expect(run(90)).toBe(base + 15 * 10); // level 3 → +15 CS
  });

  it('each level adds +5 CS at DEFENSE (mel diff drops 5 CS per defender level)', () => {
    const run = (defXp: number): number => {
      const { state } = battlefield();
      const barb = spawnUnit(state, 'WARRIOR', atkTile(state), BARB_SEAT)!;
      barb.tileIndex = atkTile(state);
      barb.movesLeft = 2;
      const def = spawnUnit(state, 'WARRIOR', defTile(state), 0)!;
      def.tileIndex = defTile(state);
      def.hp = 100;
      def.xp = defXp;
      return rollDiff('mel', () => meleeAttack(state, barb.id, def.tileIndex, 0));
    };
    const base = run(0);
    expect(run(15)).toBe(base - 5 * 10); // defender level 1 → def_e +5 → atk-def diff −50
    expect(run(90)).toBe(base - 15 * 10); // defender level 3 → −15 CS
  });

  it('a city walls strike grants a surviving civ defender +2', () => {
    const { state, city } = battlefield();
    city.buildings.push('ANCIENT_WALLS');
    // a CITYLESS civ at war: the seat loop skips it, so its spearman holds
    // still while seat 0's walls strike (seatPhase, 'cstk') targets it
    state.seats.push(emptySeat(1));
    setWar(state, 0, 1, true);
    const center = state.map.tiles[city.centerIndex];
    const near = tileAtCoords(state.map, center.col + 1, center.row); // adjacent → in range 1..2
    const defender = spawnUnit(state, 'SPEARMAN', near.index, 1)!;
    defender.tileIndex = near.index;
    defender.hp = 100; // survives the strike (defense 25 vs city ~15)
    expect(defender.xp ?? 0).toBe(0);
    seatPhase(state);
    expect(defender.hp).toBeLessThan(100); // the walls strike landed
    expect(defender.xp).toBe(2); // survived → +2 (attacker is the city, no attacker xp)
  });
});
