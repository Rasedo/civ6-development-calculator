import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeState, settleAt, tileAtCoords } from '../helpers';
import { endTurn } from '../../../cpu/core/game';
import { spawnUnit } from '../../../cpu/core/units';
import { bankruptDisband } from '../../../cpu/core/phase';
import { computeCityStats } from '../../../cpu/core/city';
import { getModifiers } from '../../../cpu/core/effects';
import { bankruptAmenities, bankruptDisbands } from '../../../cpu/data/seats';

// BANKRUPTCY (GOLD_NEGATIVE_BALANCE_*). CIV6 (the Gold pedia): "-1 penalty to
// your Amenities per every 10 Gold you drop below 0 ... at -10 Gold you will
// automatically disband a unit, at -20 two units". Every city loses 0
// amenities above 0 gold, else 1 + floor(-treasury / 10); the seat disbands 0
// units above -10 gold, else 1 + floor((-10 - treasury) / 10), the priciest
// first, a tie to the earliest spawned. The GPU twin is
// tests/gpu/bankruptcy_test.py.
describe('bankruptcy', () => {
  it('counts the lines and steps on the milli-rounded treasury', () => {
    expect([5, 0.001, 0.0006, 0.0004, 0, -0.5, -9.99, -10, -10.5, -25].map(bankruptAmenities))
      .toEqual([0, 0, 0, 0, 0, 1, 1, 2, 2, 3]);
    expect([5, 0, -9.999, -9.9996, -10, -19.99, -20, -35].map(bankruptDisbands))
      .toEqual([0, 0, 0, 1, 1, 1, 2, 3]);
  });

  it('disbands the count: the priciest first, a tie to the earliest spawned, never a free unit', () => {
    const cases: [number, boolean[]][] = [
      // [treasury, standing after: horseman A, spearman, horseman B, warrior]
      [-5, [true, true, true, true]],
      [-10, [false, true, true, true]],
      [-20, [false, true, false, true]],
      [-45, [false, false, false, true]],
    ];
    for (const [treasury, standing] of cases) {
      const state = makeState();
      state.unitsMode = true;
      settleAt(state, tileAtCoords(state.map, 3, 3).index);
      const ids = [
        spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 5, 5).index, 0)!.id, // maint 2
        spawnUnit(state, 'SPEARMAN', tileAtCoords(state.map, 8, 5).index, 0)!.id, // maint 1
        spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 11, 5).index, 0)!.id, // maint 2
        spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 8).index, 0)!.id, // maint 0
      ];
      seatOf(state, 0)!.treasury = treasury;
      bankruptDisband(state, 0, getModifiers(state, 0));
      expect(ids.map((id) => state.units.some((u) => u.id === id)), `treasury ${treasury}`).toEqual(standing);
      expect(seatOf(state, 0)!.treasury, 'a disband refunds nothing').toBe(treasury);
    }
  });

  it('the seat turn disbands what the treasury after upkeep counts', () => {
    const state = makeState();
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    for (const [c, r] of [[5, 5], [8, 5], [11, 5]]) spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, c, r).index, 0);
    seatOf(state, 0)!.treasury = -25;
    endTurn(state);
    const left = state.units.filter((u) => u.seat === 0).length;
    expect(3 - left).toBe(Math.min(3, bankruptDisbands(seatOf(state, 0)!.treasury)));
    expect(left).toBeLessThan(3);
  });

  it('disbands nothing while the treasury stands above the line', () => {
    const state = makeState();
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 5, 5).index, 0);
    seatOf(state, 0)!.treasury = 100;
    endTurn(state);
    expect(state.units.filter((u) => u.seat === 0).length).toBe(1);
  });

  it('every city loses amenities to the treasury', () => {
    const state = makeState();
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    const city = seatOf(state, 0)!.cities[0];
    const at = (t: number) => {
      seatOf(state, 0)!.treasury = t;
      return computeCityStats(state, city).amenities.balance;
    };
    const rich = at(100);
    expect(at(0.5)).toBe(rich);
    expect(at(0), "a seat standing at 0 loses none").toBe(rich);
    expect(at(-0.5)).toBe(rich - 1);
    expect(at(-15)).toBe(rich - 2);
    expect(at(-30)).toBe(rich - 4);
  });
});
