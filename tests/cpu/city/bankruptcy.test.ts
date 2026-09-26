import { describe, it, expect } from 'vitest';
import { FREE_SEAT, seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { endTurn } from '../../../cpu/core/game';
import { spawnUnit } from '../../../cpu/core/units';
import { bankruptcy, flipCity, freeCitiesPhase } from '../../../cpu/core/phase';
import { computeCityStats } from '../../../cpu/core/city';
import { getModifiers, unitUpkeep } from '../../../cpu/core/effects';
import { minorAccrue } from '../../../cpu/core/minorBuild';
import { placeCityStateAt } from '../../../cpu/core/cityStates';
import { bankruptAmenities, bankruptDisbands, goldShortfall } from '../../../cpu/data/seats';
import { UNITS } from '../../../cpu/data/units';

// BANKRUPTCY on the turn's SHORTFALL (GOLD_NEGATIVE_BALANCE_*,
// runs/bankrupt_*.jsonl). The treasury clamps at 0 every turn; S is the whole
// Gold the balance would have stood below 0. Every city of the seat loses
// 1 + floor(S / 10) amenities while S > 0, and one unit disbands a turn while
// S >= 10 — the first of the seat's roster with upkeep. Every seat alike. The
// GPU twin is tests/gpu/bankruptcy_test.py.
describe('bankruptcy', () => {
  it('reads the shortfall in whole Gold off the milli-rounded balance', () => {
    expect([5, 0, -0.0004, -0.0006, -0.5, -9.3, -10, -12.3, -35].map(goldShortfall))
      .toEqual([0, 0, 0, 1, 1, 10, 10, 13, 35]);
    expect([0, 1, 5, 9, 10, 17, 21, 30, 35].map(bankruptAmenities)).toEqual([0, 1, 1, 1, 2, 2, 3, 4, 4]);
    expect([0, 5, 9, 10, 11, 35, 100].map(bankruptDisbands)).toEqual([0, 0, 0, 1, 1, 1, 1]);
  });

  it('clamps the treasury at 0 and disbands ONE unit a turn: the first with upkeep in roster order', () => {
    const cases: [number, boolean[]][] = [
      // [balance, standing after: warrior, spearman, horseman A, horseman B]
      [-5, [true, true, true, true]],
      [-10, [true, false, true, true]],
      [-45, [true, false, true, true]],
    ];
    for (const [balance, standing] of cases) {
      const state = makeState();
      state.unitsMode = true;
      settleAt(state, tileAtCoords(state.map, 3, 3).index);
      const ids = [
        spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 8).index, 0)!.id, // maint 0
        spawnUnit(state, 'SPEARMAN', tileAtCoords(state.map, 8, 5).index, 0)!.id, // maint 1
        spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 5, 5).index, 0)!.id, // maint 2
        spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 11, 5).index, 0)!.id, // maint 2
      ];
      const s = seatOf(state, 0)!;
      s.treasury = balance;
      const m = getModifiers(state, 0);
      bankruptcy(state, s, (t) => unitUpkeep(m, t));
      expect(ids.map((id) => state.units.some((u) => u.id === id)), `balance ${balance}`).toEqual(standing);
      expect(s.treasury, 'the treasury clamps at 0').toBe(0);
      expect(s.goldShortfall).toBe(-balance);
    }
  });

  it('the seat turn charges the upkeep, records the shortfall and disbands one unit', () => {
    const state = makeState();
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    for (let k = 0; k < 12; k++) spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 2 + k, 8).index, 0);
    const s = seatOf(state, 0)!;
    s.treasury = 0;
    endTurn(state);
    const left = state.units.filter((u) => u.seat === 0 && u.type === 'HORSEMAN').length;
    expect(s.treasury).toBe(0);
    expect(s.goldShortfall).toBeGreaterThanOrEqual(10);
    expect(left).toBe(11);
  });

  it('disbands nothing and records no shortfall while the treasury covers the upkeep', () => {
    const state = makeState();
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 5, 5).index, 0);
    const s = seatOf(state, 0)!;
    s.treasury = 100;
    endTurn(state);
    expect(state.units.filter((u) => u.seat === 0).length).toBe(1);
    expect(s.goldShortfall).toBe(0);
  });

  it('every city loses amenities to the shortfall, not the balance', () => {
    const state = makeState();
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    const s = seatOf(state, 0)!;
    const city = s.cities[0];
    const at = (short: number) => {
      s.goldShortfall = short;
      return computeCityStats(state, city).amenities.balance;
    };
    const rich = at(0);
    s.treasury = -50;
    expect(at(0), 'a balance below 0 alone costs nothing').toBe(rich);
    expect(at(5)).toBe(rich - 1);
    expect(at(15)).toBe(rich - 2);
    expect(at(30)).toBe(rich - 4);
  });

  it('a city-state meets the same bankruptcy', () => {
    const state = makeState(makeMap(24, 16));
    state.unitsMode = true;
    const cs = placeCityStateAt(state, 0, 'CS0', 'militaristic', tileAtCoords(state.map, 8, 8).index);
    const spear = spawnUnit(state, 'SPEARMAN', tileAtCoords(state.map, 10, 8).index, cs.seat)!;
    for (let k = 0; k < 12; k++) spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 3 + k, 12).index, cs.seat);
    const upkeep = state.units.filter((u) => u.seat === cs.seat).reduce((a, u) => a + (UNITS[u.type]?.maintenance ?? 0), 0);
    cs.treasury = 0;
    minorAccrue(state, cs);
    expect(cs.treasury).toBe(0);
    expect(cs.goldShortfall).toBeGreaterThanOrEqual(10);
    expect(cs.goldShortfall).toBeLessThanOrEqual(upkeep);
    expect(state.units.some((u) => u.id === spear.id), 'the first unit with upkeep goes').toBe(false);
    expect(state.units.filter((u) => u.seat === cs.seat).length).toBe(12);
  });

  it('the Free Cities meet the same bankruptcy', () => {
    const state = makeState(makeMap(24, 16));
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    const border = settleAt(state, tileAtCoords(state.map, 12, 8).index);
    border.loyalty = 0;
    flipCity(state, border);
    const free = state.freeSeat!;
    const mods = getModifiers(state, FREE_SEAT);
    const first = spawnUnit(state, 'SPEARMAN', tileAtCoords(state.map, 2, 12).index, FREE_SEAT)!;
    for (let k = 0; k < 12; k++) spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 3 + k, 13).index, FREE_SEAT);
    expect(unitUpkeep(mods, 'SPEARMAN')).toBeGreaterThan(0);
    free.treasury = 0;
    freeCitiesPhase(state);
    expect(free.treasury).toBe(0);
    expect(free.goldShortfall).toBeGreaterThanOrEqual(10);
    expect(state.units.some((u) => u.id === first.id), 'the first unit with upkeep goes').toBe(false);
    expect(state.units.filter((u) => u.seat === FREE_SEAT && u.type === 'HORSEMAN').length).toBe(12);
  });
});
