import { describe, it, expect } from 'vitest';
import { BARB_SEAT, isBarbSeat, seatOf, seatOfIndex } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { foundCity, endTurn, serialize, deserialize } from '../../../cpu/core/game';
import { spawnUnit, builderRepair } from '../../../cpu/core/units';
import { meleeAttack, rangedAttack, attackTargets, terrainDefense, barbarianPhase, FLANKING_CS, SUPPORT_CS, XP_ATTACK, XP_DEFEND, XP_LEVELS, xpLevelBonus, unitLevel, awardDefenseXp } from '../../../cpu/core/combat';
import { routeRaided } from '../../../cpu/core/trade';
import { CITY_MAX_HP } from '../../../cpu/data/units';
import { neighbors } from '../../../world/hex';
import { isWater } from '../../../world/query';
import { unitPassable } from '../../../cpu/core/units';

function battlefield() {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  const city = foundCity(state, tileAtCoords(state.map, 9, 9).index, 0).city!;
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
  it('B-26: a coastal camp fields a barbarian hull, on water', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    foundCity(state, tileAtCoords(state.map, 9, 9).index, 0);
    // campNo % 4 === 1 is the naval camp, so camp 0 is a landlocked decoy.
    state.barbSeat.camps.push(tileAtCoords(state.map, 3, 3).index);
    const camp1 = tileAtCoords(state.map, 15, 15);
    state.barbSeat.camps.push(camp1.index);
    for (const n of neighbors(state.map, camp1)) n.terrain = 'COAST';

    let galley: ReturnType<typeof spawnUnit> = null;
    for (let i = 0; i < 400 && !galley; i++) {
      barbarianPhase(state, 0);
      galley = state.units.find((u) => isBarbSeat(u.seat) && u.type === 'GALLEY') ?? null;
    }
    expect(galley).not.toBeNull();
    expect(isWater(state.map.tiles[galley!.tileIndex])).toBe(true);
  });

  it('B-26: a barbarian hull kills ashore but never advances onto land', () => {
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
    for (let i = 0; i < 60 && state.barbSeat.camps.length === 0; i++) barbarianPhase(state, 0);
    expect(state.barbSeat.camps.length).toBeGreaterThan(0);
    for (let i = 0; i < 120 && !farm.pillaged; i++) barbarianPhase(state, 0);
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
    barbarianPhase(state, 0);
    expect(city.hp).toBe(CITY_MAX_HP / 2 + 20);
  });

  it('barbarians near a trade endpoint suspend the route', () => {
    const { state, city } = battlefield();
    const b = foundCity(state, tileAtCoords(state.map, 14, 9).index, 0).city!;
    expect(routeRaided(state, city, b, 0)).toBe(false);
    const barb = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 15, 9).index, BARB_SEAT)!;
    barb.tileIndex = tileAtCoords(state.map, 15, 9).index;
    expect(routeRaided(state, city, b, 0)).toBe(true);
  });

  it('the barbarian phase runs inside endTurn without disturbing peace-mode saves', () => {
    const { state } = battlefield();
    for (let i = 0; i < 5; i++) endTurn(state, 0);
    expect(state.turn).toBe(6);
    const calm = makeState(makeMap(16, 16));
    foundCity(calm, tileAtCoords(calm.map, 8, 8).index, 0);
    for (let i = 0; i < 5; i++) endTurn(calm, 0);
    expect(calm.units.length).toBe(0); // units mode off => no barbarians
  });
});

// flanking & support. The CB-log `diff` (q = round(Δstrength·10)) is
// the parity acceptance value, and it is independent of the RNG draw — so a
// clean way to test the CS terms is to read `diff` off the combat log with and
// without an adjacent unit. FLANKING_CS·1 = +2 attacker CS = +20 on the mel
// diff; SUPPORT_CS·1 = +2 defender CS = −20 on the mel/rng diff.
describe('B-7 flanking & support', () => {
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

  it('a melee attacker gains +2 CS per flanker adjacent to the defender', () => {
    const base = battlefield();
    const atkTile = tileAtCoords(base.state.map, 11, 9).index;
    const defTile = tileAtCoords(base.state.map, 12, 9).index;
    const setup = () => {
      const { state } = battlefield();
      const atk = spawnUnit(state, 'WARRIOR', atkTile, 0)!;
      atk.tileIndex = atkTile;
      const def = spawnUnit(state, 'WARRIOR', defTile, BARB_SEAT)!;
      def.tileIndex = defTile;
      return { state, atk };
    };

    const plain = setup();
    const d0 = rollDiff('mel', () => meleeAttack(plain.state, plain.atk.id, defTile, 0));

    const flanked = setup();
    const fn = freeNeighbor(flanked.state, defTile, atkTile); // a SECOND player unit next to the defender
    const flanker = spawnUnit(flanked.state, 'WARRIOR', fn.index, 0)!;
    flanker.tileIndex = fn.index;
    const d1 = rollDiff('mel', () => meleeAttack(flanked.state, flanked.atk.id, defTile, 0));

    expect(d1).toBe(d0 + SUPPORT_CS * 0 + FLANKING_CS * 10); // +2 CS -> +20 in diff·10
  });

  it('a melee defender gains +2 CS per adjacent friendly military (support)', () => {
    const atkC = { col: 11, row: 9 };
    const defC = { col: 12, row: 9 };
    const setup = () => {
      const { state } = battlefield();
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

  it('support also aids the defender against a ranged attack (no flanking there)', () => {
    const setup = () => {
      const { state } = battlefield();
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
    const d1 = rollDiff('rng', () => rangedAttack(supported.state, supported.archer.id, supported.defTile, 0));

    expect(d1).toBe(d0 - SUPPORT_CS * 10);
  });
});

describe('B-4 XP & levels', () => {
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

  it('a fresh player/civ unit starts at 0 xp; a barbarian carries none', () => {
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
    state.seats.push({ id: 0, atWar: true, cities: [] } as any);
    const center = state.map.tiles[city.centerIndex];
    const near = tileAtCoords(state.map, center.col + 1, center.row); // adjacent → in range 1..2
    const rv = spawnUnit(state, 'SPEARMAN', near.index, seatOfIndex(0))!;
    rv.tileIndex = near.index;
    rv.hp = 100; // survives the strike (defense 25 vs city ~15)
    expect(rv.xp).toBe(0);
    barbarianPhase(state, 0);
    expect(rv.hp).toBeLessThan(100); // the walls strike landed
    expect(rv.xp).toBe(2); // survived → +2 (attacker is the city, no attacker xp)
  });
});
