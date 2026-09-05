import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { endTurn } from '../../../cpu/core/game';
import { getModifiers, unitUpkeep } from '../../../cpu/core/effects';
import type { GameState } from '../../../cpu/core/types';

/**
 * A BANKRUPTCY TIE GOES TO THE EARLIEST-SPAWNED UNIT, NOT THE LOWEST ID (A-7r).
 *
 * When a seat's treasury goes negative, the priciest unit is disbanded and a
 * tie is broken by SPAWN ORDER — the earliest in `state.units`, which is the
 * one order both engines own (the GPU's pool only appends, so its lowest
 * slot is the same unit). TS used to tie on the lowest UNIT ID, which equals
 * spawn order for a unit the seat trained and NOT for one it re-seated: a
 * converted barbarian keeps its barbarian-era id, lower than anything the
 * seat owns, and at seed 9053 t164 the two engines disbanded different units.
 *
 * The GPU twin is tests/gpu/bankruptcy_tie_test.py.
 */
function scene(): { state: GameState; early: number; late: number } {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  const seat = seatOf(state, 0)!;
  const early = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 8, 6).index, 0)!.id;
  const late = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 6, 8).index, 0)!.id;
  // the re-seat shape: the LATER-spawned unit carries the LOWER id
  const lateUnit = state.units.find((u) => u.id === late)!;
  const lowId = Math.min(...state.units.map((u) => u.id)) - 1;
  lateUnit.id = lowId;
  const m = getModifiers(state, 0);
  expect(unitUpkeep(m, 'ARCHER')).toBeGreaterThan(0);
  // broke beyond any single turn's income
  seat.treasury = -1000;
  return { state, early, late: lowId };
}

describe('the bankruptcy tie-break', () => {
  it('disbands the earliest-spawned of two equal-upkeep units, whatever their ids', () => {
    const { state, early, late } = scene();
    const order = state.units.filter((u) => u.seat === 0).map((u) => u.id);
    expect(order.indexOf(early)).toBeLessThan(order.indexOf(late));
    expect(late).toBeLessThan(early);
    endTurn(state);
    const ids = new Set(state.units.filter((u) => u.seat === 0).map((u) => u.id));
    expect(ids.has(early), 'the earlier-spawned unit should be the one disbanded').toBe(false);
    expect(ids.has(late), 'the later-spawned low-id unit must survive').toBe(true);
  });

  it('still takes the pricier unit before any tie is considered', () => {
    const state = makeState(makeMap(16, 16, 'GRASSLAND'));
    state.seats.push(emptySeat(1));
    settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
    const seat = seatOf(state, 0)!;
    const cheap = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 8, 6).index, 0)!.id;
    const m = getModifiers(state, 0);
    // any land chassis this scene can spawn that costs more than an Archer
    const dearType = ['SWORDSMAN', 'CATAPULT', 'HEAVY_CHARIOT', 'HORSEMAN', 'KNIGHT', 'MUSKETMAN']
      .find((t) => unitUpkeep(m, t) > unitUpkeep(m, 'ARCHER'));
    expect(dearType, 'no pricier chassis in the catalog').toBeDefined();
    const dearUnit = spawnUnit(state, dearType!, tileAtCoords(state.map, 6, 8).index, 0);
    expect(dearUnit, `${dearType} did not spawn`).not.toBeNull();
    const dear = dearUnit!.id;
    seat.treasury = -1000;
    endTurn(state);
    const ids = new Set(state.units.filter((u) => u.seat === 0).map((u) => u.id));
    expect(ids.has(dear)).toBe(false);
    expect(ids.has(cheap)).toBe(true);
  });
});
