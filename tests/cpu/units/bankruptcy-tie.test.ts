import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { bankruptcy } from '../../../cpu/core/phase';
import { getModifiers, unitUpkeep } from '../../../cpu/core/effects';
import type { GameState } from '../../../cpu/core/types';

/**
 * BANKRUPTCY'S VICTIM IS THE FIRST UNIT WITH UPKEEP IN ROSTER ORDER.
 *
 * The live game disbanded the first unit of the seat's list that pays upkeep,
 * not the priciest: a Crossbowman went before four Musketmen, a Warrior with
 * none was skipped (runs/bankrupt_m15_20260926T083048Z.jsonl). The roster
 * order is SPAWN ORDER — the earliest in `state.units`, the one order both
 * engines own (the GPU's pool only appends, so its lowest slot is the same
 * unit). The lowest UNIT ID is NOT that order: a converted barbarian keeps
 * its barbarian-era id, lower than anything the seat owns.
 *
 * The GPU twin is tests/gpu/bankruptcy_tie_test.py.
 */
function scene(): { state: GameState; early: number; late: number } {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  const early = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 8, 6).index, 0)!.id;
  const late = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 6, 8).index, 0)!.id;
  // the re-seat shape: the LATER-spawned unit carries the LOWER id
  const lateUnit = state.units.find((u) => u.id === late)!;
  const lowId = Math.min(...state.units.map((u) => u.id)) - 1;
  lateUnit.id = lowId;
  expect(unitUpkeep(getModifiers(state, 0), 'ARCHER')).toBeGreaterThan(0);
  seatOf(state, 0)!.treasury = -10;
  return { state, early, late: lowId };
}

describe('the bankruptcy victim', () => {
  it('is the earliest-spawned unit with upkeep, whatever the ids', () => {
    const { state, early, late } = scene();
    const order = state.units.filter((u) => u.seat === 0).map((u) => u.id);
    expect(order.indexOf(early)).toBeLessThan(order.indexOf(late));
    expect(late).toBeLessThan(early);
    const m = getModifiers(state, 0);
    bankruptcy(state, seatOf(state, 0)!, (t) => unitUpkeep(m, t));
    const ids = new Set(state.units.filter((u) => u.seat === 0).map((u) => u.id));
    expect(ids.has(early), 'the earlier-spawned unit should be the one disbanded').toBe(false);
    expect(ids.has(late), 'the later-spawned low-id unit must survive').toBe(true);
  });

  it('is not the priciest: a cheaper unit spawned first goes before a dearer one', () => {
    const state = makeState(makeMap(16, 16, 'GRASSLAND'));
    state.seats.push(emptySeat(1));
    settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
    const seat = seatOf(state, 0)!;
    const cheap = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 8, 6).index, 0)!.id;
    const m = getModifiers(state, 0);
    const dearType = ['SWORDSMAN', 'CATAPULT', 'HEAVY_CHARIOT', 'HORSEMAN', 'KNIGHT', 'MUSKETMAN']
      .find((t) => unitUpkeep(m, t) > unitUpkeep(m, 'ARCHER'));
    expect(dearType, 'no pricier chassis in the catalog').toBeDefined();
    const dearUnit = spawnUnit(state, dearType!, tileAtCoords(state.map, 6, 8).index, 0);
    expect(dearUnit, `${dearType} did not spawn`).not.toBeNull();
    const dear = dearUnit!.id;
    seat.treasury = -10;
    bankruptcy(state, seat, (t) => unitUpkeep(m, t));
    const ids = new Set(state.units.filter((u) => u.seat === 0).map((u) => u.id));
    expect(ids.has(cheap)).toBe(false);
    expect(ids.has(dear)).toBe(true);
  });
});
