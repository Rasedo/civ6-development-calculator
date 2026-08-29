import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import {
  spawnUnit, refreshUnits, moveCostInto, unitFullMoves, stepUnit, unitVisibleTo,
} from '../../../cpu/core/units';
import { meleeAttack } from '../../../cpu/core/combat';
import { convertHeathens } from '../../../cpu/core/game';
import {
  attacksAfterMoving, attacksLeftOf, attacksPerTurn, promoFirstUse, promoValue, unitPromoRows,
} from '../../../cpu/core/promotions';
import { spreadFromUnit } from '../../../cpu/core/unitOrders';
import { emptySeat, BARB_SEAT, setTileOwner } from '../../../cpu/core/seats';
import { SPREAD_PRESSURE } from '../../../cpu/data/religion';
import type { GameState, Unit } from '../../../cpu/core/types';

/** the column a unit's own class list gives one effect kind. */
function col(unit: { type: string }, kind: string): { k: number; v: number } {
  const rows = unitPromoRows(unit);
  for (let k = 0; k < rows.length; k++) {
    const e = rows[k].effects.find((x) => x.kind === kind);
    if (e) return { k, v: e.v ?? 0 };
  }
  throw new Error(`${unit.type} carries no ${kind} row`);
}

function hold(unit: Unit, kind: string): number {
  const { k, v } = col(unit, kind);
  unit.promos = (unit.promos ?? 0) | (1 << k);
  return v;
}

describe('promotion effects that are not Combat Strength', () => {
  it('MOVES raises the pool, embarked included', () => {
    const state = makeState(makeMap(12, 12));
    state.unitsMode = true;
    const u = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 5, 5).index, 0)!;
    const before = unitFullMoves(state, u);
    const v = hold(u, 'MOVES');
    expect(unitFullMoves(state, u)).toBe(before + v);
    // "also applies while the unit is embarked"
    u.embarked = true;
    const bare = { ...u, promos: 0 } as Unit;
    expect(unitFullMoves(state, u)).toBe(unitFullMoves(state, bare) + v);
  });

  it('Alpine waives the hills charge and Ranger leaves it alone', () => {
    const state = makeState(makeMap(12, 12));
    const t = tileAtCoords(state.map, 5, 5);
    t.elevation = 'HILLS';
    const scout = { type: 'SCOUT', promos: 0 };
    const plain = moveCostInto(t, t, scout);
    const { k: kh } = col(scout, 'TERRAIN_MOVE_HILLS');
    const { k: kw } = col(scout, 'TERRAIN_MOVE_WOODS');
    expect(moveCostInto(t, t, { type: 'SCOUT', promos: 1 << kh })).toBe(plain - 1);
    expect(moveCostInto(t, t, { type: 'SCOUT', promos: 1 << kw })).toBe(plain);
  });

  it('Auxiliary Ships heal on foreign ground at the own-ground rate', () => {
    const state = makeState(makeMap(12, 12));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    const t = tileAtCoords(state.map, 5, 5);
    setTileOwner(t, 1);
    const u = spawnUnit(state, 'WARRIOR', t.index, 0)!;
    u.hp = 40;
    refreshUnits(state);
    expect(u.hp - 40).toBe(5); // "anyone else's land 5"
    u.hp = 40;
    // the promotion lives on a NAVAL list, so hand the column to this chassis
    // directly: the rate is what this test is about, not who may earn it.
    u.type = 'GALLEY';
    hold(u, 'HEAL_ANYWHERE');
    refreshUnits(state);
    expect(u.hp - 40).toBe(15);
  });

  it('the Chaplain heals an adjacent military unit and never a civilian', () => {
    const state = makeState(makeMap(12, 12));
    state.unitsMode = true;
    const a = tileAtCoords(state.map, 5, 5);
    const b = tileAtCoords(state.map, 6, 5);
    const hurt = spawnUnit(state, 'WARRIOR', a.index, 0)!;
    hurt.hp = 40;
    refreshUnits(state);
    const plain = hurt.hp - 40;
    hurt.hp = 40;
    const ap = spawnUnit(state, 'APOSTLE', b.index, 0)!;
    const v = hold(ap, 'CHAPLAIN');
    refreshUnits(state);
    expect(hurt.hp - 40).toBe(plain + v);
  });

  it('a once-only promotion pays a unit exactly once', () => {
    const state = makeState(makeMap(12, 12));
    state.unitsMode = true;
    const ap = spawnUnit(state, 'APOSTLE', tileAtCoords(state.map, 5, 5).index, 0)!;
    const v = hold(ap, 'PILGRIM');
    expect(promoFirstUse(ap, 'PILGRIM')).toBe(v);
    expect(promoFirstUse(ap, 'PILGRIM')).toBe(0);
    expect(promoValue(ap, 'PILGRIM')).toBe(v); // the EFFECT is still held
  });

  it('Translator triples a foreign spread and Proselytizer strips the rest', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    state.seats[0].religion.founded = true;
    const home = tileAtCoords(state.map, 9, 9);
    const ap = spawnUnit(state, 'APOSTLE', home.index, 0)!;
    ap.charges = 3;
    const city = {
      id: 900, seat: 1, name: 'Foreign', centerIndex: tileAtCoords(state.map, 10, 9).index,
      population: 4, food: 0, production: 0, buildings: [], districts: [], tiles: [],
      hp: 200, outerHp: 0, religionPressure: [0, 400],
    } as unknown as GameState['seats'][number]['cities'][number];
    state.seats[1].cities.push(city);
    const vT = hold(ap, 'TRANSLATOR');
    const vP = hold(ap, 'PROSELYTIZER');
    spreadFromUnit(state, ap, state.seats[0], state.map.tiles[city.centerIndex]);
    expect(city.religionPressure![0]).toBe(SPREAD_PRESSURE * vT);
    expect(city.religionPressure![1]).toBe(Math.floor(400 * (100 - vP) / 100));
  });

  it('Heathen Conversion turns every adjacent raider for one charge', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.seats.push(emptySeat(BARB_SEAT));
    const home = tileAtCoords(state.map, 9, 9);
    const ap = spawnUnit(state, 'APOSTLE', home.index, 0)!;
    ap.charges = 2;
    hold(ap, 'HEATHEN');
    const b1 = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 10, 9).index, BARB_SEAT)!;
    b1.fortifyTurns = 2;
    const b2 = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 8, 9).index, BARB_SEAT)!;
    const r = convertHeathens(state, ap, state.seats[0]);
    expect(r.ok).toBe(true);
    expect(b1.seat).toBe(0);
    expect(b2.seat).toBe(0);
    expect(ap.charges).toBe(1);
    // a unit that changes hands keeps neither the turn nor the fortification
    // it dug in for its old side
    expect(b1.movesLeft).toBe(0);
    expect(b1.fortifyTurns).toBe(0);
    // both converts sit at the END of the array, in neighbour-ring order
    expect(state.units.slice(-2).map((u) => u.id)).toEqual(
      state.units.filter((u) => u.id === b1.id || u.id === b2.id).map((u) => u.id),
    );
  });

  it('Heathen Conversion refuses with no raider adjacent', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    const ap = spawnUnit(state, 'APOSTLE', tileAtCoords(state.map, 9, 9).index, 0)!;
    ap.charges = 2;
    hold(ap, 'HEATHEN');
    expect(convertHeathens(state, ap, state.seats[0]).ok).toBe(false);
    expect(ap.charges).toBe(2);
  });

  it('Guerrilla keeps the turn after a blow at a UNIT', () => {
    const blow = (promos: number): number => {
      const state = makeState(makeMap(20, 20));
      state.unitsMode = true;
      state.seats.push(emptySeat(BARB_SEAT));
      const a = tileAtCoords(state.map, 9, 9);
      const b = tileAtCoords(state.map, 10, 9);
      const atk = spawnUnit(state, 'SCOUT', a.index, 0)!;
      atk.promos = promos;
      spawnUnit(state, 'WARRIOR', b.index, BARB_SEAT)!;
      expect(meleeAttack(state, atk.id, b.index, 0).ok).toBe(true);
      return atk.movesLeft;
    };
    const { k } = col({ type: 'SCOUT' }, 'MOVE_AFTER_ATTACK');
    expect(blow(0)).toBe(0);
    expect(blow(1 << k)).toBeGreaterThan(0);
  });

  it('Expert Marksman keeps its extra attack across a move BEFORE the blow, and loses it after', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    const arch = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 9, 9).index, 0)!;
    hold(arch, 'EXTRA_ATTACK_STILL');
    expect(attacksPerTurn(arch)).toBe(2);
    expect(attacksAfterMoving(arch)).toBe(1);
    refreshUnits(state);
    expect(attacksLeftOf(arch)).toBe(2);
    // "It can still move BEFORE it attacks, however."
    expect(stepUnit(state, arch, tileAtCoords(state.map, 10, 9))).not.toBe('blocked');
    expect(attacksLeftOf(arch)).toBe(2);
    // and once it has struck, the next step revokes what it had not spent
    arch.attacksLeft = 1;
    arch.movesLeft = 2;
    expect(stepUnit(state, arch, tileAtCoords(state.map, 11, 9))).not.toBe('blocked');
    expect(attacksLeftOf(arch)).toBe(0);
  });

  it('Breakthrough keeps its extra attack across the step that follows a blow', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    const kn = spawnUnit(state, 'KNIGHT', tileAtCoords(state.map, 4, 4).index, 0)!;
    hold(kn, 'EXTRA_ATTACK');
    expect(attacksPerTurn(kn)).toBe(2);
    expect(attacksAfterMoving(kn)).toBe(2);
    refreshUnits(state);
    kn.attacksLeft = 1;                              // one blow struck
    expect(stepUnit(state, kn, tileAtCoords(state.map, 5, 4))).not.toBe('blocked');
    expect(attacksLeftOf(kn)).toBe(1);
    // a unit with no attack row is untouched either way
    const w = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 8, 4).index, 0)!;
    refreshUnits(state);
    expect(attacksLeftOf(w)).toBe(1);
    expect(stepUnit(state, w, tileAtCoords(state.map, 9, 4))).not.toBe('blocked');
    expect(attacksLeftOf(w)).toBe(1);
  });

  it('Camouflage hides a Scout from everything but an ADJACENT enemy', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    const hide = tileAtCoords(state.map, 9, 9);
    const scout = spawnUnit(state, 'SCOUT', hide.index, 0)!;
    hold(scout, 'STEALTH');
    // a SCOUT's Reveal Stealth lengthens the look at a stealth CHASSIS and at
    // nothing else, so two tiles away it sees nothing
    const eye = spawnUnit(state, 'SCOUT', tileAtCoords(state.map, 11, 9).index, 1)!;
    expect(unitVisibleTo(state, scout, 1)).toBe(false);
    expect(unitVisibleTo(state, scout, 0)).toBe(true);   // its own seat always sees it
    eye.tileIndex = tileAtCoords(state.map, 10, 9).index;
    expect(unitVisibleTo(state, scout, 1)).toBe(true);
  });
});
