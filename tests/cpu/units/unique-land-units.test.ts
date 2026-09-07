/**
 * THE TWENTY-TWO UNIQUE LAND UNITS. Every stat is the install's own Units.xml
 * row (layered Base <- Expansion1 <- Expansion2, scenario packs excluded) and
 * every ability is one UnitAbilities.xml clause, quoted at its catalog row.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, seatOf, setTileOwner, setWar } from '../../../cpu/core/seats';
import { spawnUnit, terrainMp } from '../../../cpu/core/units';
import { chassisAbilityCS, chassisFlankMult, woundPenalty, siegeMayShoot, defenderCS } from '../../../cpu/core/combat';
import { attacksPerTurn } from '../../../cpu/core/promotions';
import { routePlunderer } from '../../../cpu/core/trade';
import { unitKillEvent } from '../../../cpu/core/eras';
import { UNITS, UNIT_HP } from '../../../cpu/data/units';
import { GAME_SPEED } from '../../../cpu/data/constants';
import { MP_SCALE } from '../../../cpu/data/constants';
import type { GameState, Unit } from '../../../cpu/core/types';

/** id -> [civ, replaces|null, cost, moves, combat] straight off Units.xml. */
const ROWS: readonly (readonly [string, string, string | null, number, number, number])[] = [
  ['MAMLUK', 'ARABIA', 'KNIGHT', 180, 4, 50],
  ['MOUNTIE', 'CANADA', null, 290, 5, 62],
  ['CROUCHING_TIGER', 'CHINA', null, 140, 2, 30],
  ['OKIHTCITAW', 'CREE', 'SCOUT', 40, 3, 20],
  ['GARDE_IMPERIALE', 'FRANCE', 'LINE_INFANTRY', 360, 2, 70],
  ['KHEVSURETI', 'GEORGIA', 'MAN_AT_ARMS', 160, 2, 48],
  ['HOPLITE', 'GREECE', 'SPEARMAN', 65, 2, 28],
  ['HUSZAR', 'HUNGARY', 'CAVALRY', 335, 5, 65],
  ['WARAKAQ', 'INCA', 'SKIRMISHER', 165, 3, 20],
  ['VARU', 'INDIA', null, 120, 2, 40],
  ['SAMURAI', 'JAPAN', 'MAN_AT_ARMS', 160, 2, 48],
  ['NGAO_MBEBA', 'KONGO', 'SWORDSMAN', 110, 2, 38],
  ['HWACHA', 'KOREA', 'FIELD_CANNON', 250, 2, 45],
  ['MANDEKALU_CAVALRY', 'MALI', 'KNIGHT', 220, 4, 55],
  ['TOA', 'MAORI', 'SWORDSMAN', 120, 2, 38],
  ['MALON_RAIDER', 'MAPUCHE', null, 230, 4, 55],
  ['KESHIG', 'MONGOLIA', null, 160, 4, 35],
  ['COSSACK', 'RUSSIA', 'CAVALRY', 340, 5, 67],
  ['HIGHLANDER', 'SCOTLAND', 'RANGER', 380, 3, 50],
  ['CONQUISTADOR', 'SPAIN', 'MUSKETMAN', 250, 2, 58],
  ['CAROLEAN', 'SWEDEN', 'PIKE_AND_SHOT', 250, 3, 55],
  ['IMPI', 'ZULU', 'PIKEMAN', 125, 2, 45],
] as const;

function scene(): GameState {
  const state = makeState(makeMap(24, 24));
  state.unitsMode = true;
  return state;
}

/** put a unit of `type` at (col,row) for `seat`, bypassing the tech gates. */
function put(state: GameState, type: string, col: number, row: number, seat = 0): Unit {
  const u = spawnUnit(state, type, tileAtCoords(state.map, col, row).index, seat);
  expect(u, `${type} did not spawn`).toBeTruthy();
  return u!;
}

describe('the unique land unit catalog', () => {
  it('carries every row with the install’s own numbers', () => {
    for (const [id, civ, replaces, cost, moves, combat] of ROWS) {
      const d = UNITS[id];
      expect(d, `${id} has no catalog row`).toBeTruthy();
      expect(d.uniqueTo, `${id} names the wrong civilization`).toBe(civ);
      expect(d.replaces ?? null, `${id} replaces the wrong chassis`).toBe(replaces);
      expect(d.cost, `${id} cost`).toBe(Math.round(cost * GAME_SPEED));
      expect(d.moves, `${id} moves`).toBe(moves);
      expect(d.combat, `${id} combat`).toBe(combat);
      // a replacement keeps its chassis's own upgrade target
      if (replaces) expect(d.upgradesTo, `${id} upgrade`).toBe(UNITS[replaces].upgradesTo);
    }
  });

  it('gives one civilization at most one land replacement of a chassis', () => {
    const seen = new Set<string>();
    for (const d of Object.values(UNITS)) {
      if (!d.uniqueTo || !d.replaces) continue;
      const key = `${d.uniqueTo}/${d.replaces}`;
      expect(seen.has(key), `${key} is claimed twice`).toBe(false);
      seen.add(key);
    }
  });
});

describe('the ground and neighbour clauses', () => {
  it('pays the Khevsureti on hills and the Highlander on hills and forest', () => {
    const state = scene();
    const hill = tileAtCoords(state.map, 6, 6);
    hill.elevation = 'HILLS';
    const wood = tileAtCoords(state.map, 10, 10);
    wood.feature = 'WOODS';
    const flat = tileAtCoords(state.map, 14, 14);
    const kh = put(state, 'KHEVSURETI', 6, 6);
    expect(chassisAbilityCS(state, kh, hill.index)).toBe(7);
    expect(chassisAbilityCS(state, kh, flat.index)).toBe(0);
    expect(chassisAbilityCS(state, kh, wood.index)).toBe(0); // hills only
    const hl = put(state, 'HIGHLANDER', 10, 10);
    expect(chassisAbilityCS(state, hl, hill.index)).toBe(5);
    expect(chassisAbilityCS(state, hl, wood.index)).toBe(5);
    expect(chassisAbilityCS(state, hl, flat.index)).toBe(0);
  });

  it('waives the movement penalty the same clause names', () => {
    const hill = { elevation: 'HILLS', feature: null } as never;
    const wood = { elevation: 'FLAT', feature: 'WOODS' } as never;
    expect(terrainMp(hill, { type: 'WARRIOR' })).toBe(2 * MP_SCALE);
    expect(terrainMp(hill, { type: 'KHEVSURETI' })).toBe(MP_SCALE);
    expect(terrainMp(wood, { type: 'WARRIOR' })).toBe(2 * MP_SCALE);
    expect(terrainMp(wood, { type: 'NGAO_MBEBA' })).toBe(MP_SCALE);
    expect(terrainMp(hill, { type: 'NGAO_MBEBA' })).toBe(2 * MP_SCALE); // woods only
  });

  it('pays a Hoplite for a Hoplite beside it, once', () => {
    const state = scene();
    const a = put(state, 'HOPLITE', 6, 6);
    expect(chassisAbilityCS(state, a, a.tileIndex)).toBe(0);
    put(state, 'HOPLITE', 7, 6);
    expect(chassisAbilityCS(state, a, a.tileIndex)).toBe(10);
    put(state, 'HOPLITE', 6, 7);
    expect(chassisAbilityCS(state, a, a.tileIndex)).toBe(10); // one clause, not two
  });

  it('lets a Varu weaken the enemy beside it, and nobody else', () => {
    const state = scene();
    state.seats.push(emptySeat(1));
    const foe = put(state, 'WARRIOR', 6, 6, 1);
    expect(chassisAbilityCS(state, foe, foe.tileIndex)).toBe(0);
    put(state, 'VARU', 7, 6, 0);
    expect(chassisAbilityCS(state, foe, foe.tileIndex)).toBe(0); // not at war yet
    setWar(state, 0, 1, true);
    expect(chassisAbilityCS(state, foe, foe.tileIndex)).toBe(-5);
    // the Varu's own side is untouched
    const mine = put(state, 'WARRIOR', 8, 6, 0);
    expect(chassisAbilityCS(state, mine, mine.tileIndex)).toBe(0);
  });

  it('shields the Ngao Mbeba from a ranged strike alone', () => {
    const state = scene();
    const u = put(state, 'NGAO_MBEBA', 6, 6);
    expect(chassisAbilityCS(state, u, u.tileIndex, { defendingRanged: true })).toBe(10);
    expect(chassisAbilityCS(state, u, u.tileIndex, { defendingRanged: false })).toBe(0);
  });
});

describe('the empire clauses', () => {
  it('pays the Carolean per unused Movement', () => {
    const state = scene();
    const u = put(state, 'CAROLEAN', 6, 6);
    u.movesLeft = 3 * MP_SCALE;
    expect(chassisAbilityCS(state, u, u.tileIndex)).toBe(9);
    u.movesLeft = 0;
    expect(chassisAbilityCS(state, u, u.tileIndex)).toBe(0);
  });

  it('pays the Cossack and the Malón Raider by their distance from home', () => {
    const state = scene();
    const own = tileAtCoords(state.map, 6, 6);
    setTileOwner(own, 0);
    const co = put(state, 'COSSACK', 7, 6);
    expect(chassisAbilityCS(state, co, co.tileIndex)).toBe(5); // adjacent
    expect(chassisAbilityCS(state, co, tileAtCoords(state.map, 9, 6).index)).toBe(0);
    const mr = put(state, 'MALON_RAIDER', 10, 6);
    // four hexes out still pays, five does not
    expect(chassisAbilityCS(state, mr, tileAtCoords(state.map, 10, 6).index)).toBe(5);
    expect(chassisAbilityCS(state, mr, tileAtCoords(state.map, 12, 6).index)).toBe(0);
  });

  it('pays the Garde on the capital’s own continent', () => {
    const state = scene();
    settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
    const g = put(state, 'GARDE_IMPERIALE', 7, 6);
    expect(chassisAbilityCS(state, g, g.tileIndex)).toBe(10);
  });

  it('pays the Conquistador beside a religious unit of its own', () => {
    const state = scene();
    const c = put(state, 'CONQUISTADOR', 6, 6);
    expect(chassisAbilityCS(state, c, c.tileIndex)).toBe(0);
    put(state, 'MISSIONARY', 7, 6, 0);
    expect(chassisAbilityCS(state, c, c.tileIndex)).toBe(10);
  });

  it('pays the Huszár per active alliance', () => {
    const state = scene();
    const h = put(state, 'HUSZAR', 6, 6);
    expect(chassisAbilityCS(state, h, h.tileIndex)).toBe(0);
  });
});

describe('the turn-order clauses', () => {
  it('spares the Samurai the wound penalty', () => {
    expect(woundPenalty({ hp: 50, type: 'WARRIOR' })).toBeGreaterThan(0);
    expect(woundPenalty({ hp: 50, type: 'SAMURAI' })).toBe(0);
    expect(woundPenalty({ hp: UNIT_HP, type: 'WARRIOR' })).toBe(0);
  });

  it('doubles the Impi’s flanking and raises its experience rate', () => {
    expect(chassisFlankMult({ type: 'IMPI' })).toBe(2);
    expect(chassisFlankMult({ type: 'PIKEMAN' })).toBe(1);
    expect(UNITS.IMPI.xpRate).toBe(1.25);
  });

  it('gives the Warak’aq a second attack', () => {
    expect(attacksPerTurn({ type: 'WARAKAQ' })).toBe(2);
    expect(attacksPerTurn({ type: 'SKIRMISHER' })).toBe(1);
  });

  it('makes the Hwacha set up before it shoots', () => {
    const state = scene();
    const h = put(state, 'HWACHA', 6, 6);
    expect(siegeMayShoot(state, h)).toBe(true); // it has not moved
    h.movesLeft = MP_SCALE;
    expect(siegeMayShoot(state, h)).toBe(false);
    const r = put(state, 'FIELD_CANNON', 8, 6);
    r.movesLeft = MP_SCALE;
    expect(siegeMayShoot(state, r)).toBe(true); // the plain chassis may
  });

  it('lets the Cossack keep its movement after an attack', () => {
    expect(UNITS.COSSACK.moveAfterAttack).toBe(true);
    expect(UNITS.CAVALRY.moveAfterAttack).toBeUndefined();
  });

  it('gives the Okihtcitaw the experience of its free promotion', () => {
    const state = scene();
    const u = put(state, 'OKIHTCITAW', 6, 6);
    const plain = put(state, 'SCOUT', 8, 6);
    expect(u.xp).toBeGreaterThan(0);
    expect(plain.xp).toBe(0);
  });
});

describe('the reward and protection clauses', () => {
  it('pays the Mandekalu gold and the Garde Great General points on a kill', () => {
    const state = scene();
    state.seats.push(emptySeat(1));
    const me = seatOf(state, 0)!;
    const gold0 = me.treasury;
    unitKillEvent(state, 0, { type: 'MANDEKALU_CAVALRY' }, { type: 'WARRIOR', seat: 1 });
    expect(me.treasury - gold0).toBe(UNITS.WARRIOR.combat);
    const gp0 = me.gpp.GENERAL ?? 0;
    unitKillEvent(state, 0, { type: 'GARDE_IMPERIALE' }, { type: 'WARRIOR', seat: 1 });
    expect((me.gpp.GENERAL ?? 0) - gp0).toBe(10);
  });

  it('lets the Mandekalu shield a Trader from plunder', () => {
    const state = scene();
    state.seats.push(emptySeat(1));
    setWar(state, 0, 1, true);
    const road = tileAtCoords(state.map, 6, 6);
    put(state, 'WARRIOR', 6, 6, 1); // a raider standing on the Trader
    expect(routePlunderer(state, road.index, 0)).toBe(1);
    put(state, 'MANDEKALU_CAVALRY', 7, 6, 0);
    expect(routePlunderer(state, road.index, 0)).toBe(null);
  });

  it('lets the Mountie found a park off a charge and ride on', () => {
    const state = scene();
    const m = put(state, 'MOUNTIE', 6, 6);
    expect(m.charges).toBe(2);
    expect(UNITS.MOUNTIE.parkBuilder).toBe(true);
  });
});

describe('the defender takes its chassis clauses', () => {
  it('adds the ground bonus to a real defence', () => {
    const state = scene();
    state.seats.push(emptySeat(1));
    const hill = tileAtCoords(state.map, 6, 6);
    hill.elevation = 'HILLS';
    const kh = put(state, 'KHEVSURETI', 6, 6);
    const flatTile = tileAtCoords(state.map, 12, 12);
    const kh2 = put(state, 'KHEVSURETI', 12, 12);
    expect(defenderCS(state, kh, hill.index) - defenderCS(state, kh2, flatTile.index))
      .toBe(7 + (hill.elevation === 'HILLS' ? 3 : 0) - 0);
  });
});
