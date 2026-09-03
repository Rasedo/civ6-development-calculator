import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeMap, makeState, tileAtCoords, settleAt, grantCivics } from '../helpers';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { workableTiles, computeCityStats } from '../../../cpu/core/city';
import { getModifiers } from '../../../cpu/core/effects';
import { cityTradeYields, cityMountainCount } from '../../../cpu/core/trade';
import { standingLoyalty } from '../../../cpu/core/phase';
import { rosterCS } from '../../../cpu/core/combat';
import { spawnUnit } from '../../../cpu/core/units';
import { formUp } from '../../../cpu/core/game';
import { emptyGovernors } from '../../../cpu/core/governors';
import { neighbors } from '../../../world/hex';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { WORK_IMPASSABLE_ROWS, ROUTE_TERRAIN_ROWS, GOVERNOR_YIELD_ROWS, GOVERNOR_LOYALTY_ROWS, GARRISON_LOYALTY_ROWS, FORMATION_ROWS } from '../../../cpu/data/civilizations';
import type { City, GameState } from '../../../cpu/core/types';

/**
 * THE MOUNTAIN, THE GOVERNOR AND THE FORMATION (CIV6, the install's
 * TraitModifiers): Mit'a's worked mountains, Qhapaq Ñan's route Food, the
 * Toqui's governed-city percentages and loyalty reach, Isibongo's garrison,
 * and the formation civics and strength of Shaka and Spain.
 */
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function sceneAs(row: number): GameState {
  const state = makeState(makeMap(14, 14, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  state.seats[1].civ = seatRow('AMERICA');
  return state;
}

/** Raise the city's whole first ring to MOUNTAIN and hand it to the city. */
function ringOfMountains(state: GameState, city: City): number {
  let n = 0;
  for (const t of neighbors(state.map, state.map.tiles[city.centerIndex])) {
    setTileOwner(t, city.seat, city.id);
    t.elevation = 'MOUNTAIN';
    t.feature = null;
    n += 1;
  }
  return n;
}

describe("Mit'a", () => {
  it('lets an Inca citizen work a mountain, and nobody else', () => {
    expect(WORK_IMPASSABLE_ROWS.length).toBe(1);
    const workable = (row: number): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      const n = ringOfMountains(state, city);
      expect(n).toBeGreaterThan(0);
      return workableTiles(state, city).length;
    };
    const inca = workable(seatRow('INCA'));
    const plain = workable(seatRow('AMERICA'));
    expect(plain).toBe(0);
    expect(inca).toBe(6);
    expect(getModifiers(sceneAs(seatRow('INCA')), 0).workMountains).toBe(true);
    expect(getModifiers(sceneAs(seatRow('AMERICA')), 0).workMountains).toBe(false);
  });
});

describe('Qhapaq Ñan', () => {
  it("pays Pachacuti Food per mountain of a domestic route's origin city", () => {
    expect(ROUTE_TERRAIN_ROWS.length).toBe(1);
    const foodOf = (row: number): number => {
      const state = sceneAs(row);
      const from = settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
      const to = settleAt(state, tileAtCoords(state.map, 10, 10).index, 0);
      const n = ringOfMountains(state, from);
      expect(cityMountainCount(state, from)).toBe(n);
      state.seats[0].tradeRoutes = [{ from: from.id, to: to.id, turnsLeft: 20 } as never];
      return cityTradeYields(state, from, 0).food;
    };
    expect(foodOf(leaderRow('PACHACUTI'))).toBe(foodOf(seatRow('AMERICA')) + 6);
  });
});

describe('the Toqui', () => {
  it('pays a governed city 5% more Culture, and 15% in one it did not found', () => {
    expect(GOVERNOR_YIELD_ROWS.length).toBe(4);
    const cultureOf = (row: number, governed: boolean, founded: boolean): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      city.buildings.push('MONUMENT'); // something to scale
      if (!founded) city.founderSeat = 1;
      if (governed) {
        state.seats[0].governors = emptyGovernors();
        state.seats[0].governors[0].appointed = true;
        state.seats[0].governors[0].cityId = city.id;
        state.seats[0].governors[0].establishTurns = 0;
      }
      return computeCityStats(state, city).total.culture;
    };
    const plain = cultureOf(seatRow('AMERICA'), true, true);
    expect(cultureOf(seatRow('MAPUCHE'), false, true)).toBeCloseTo(plain, 9); // no governor, no row
    expect(cultureOf(seatRow('MAPUCHE'), true, true)).toBeCloseTo(plain * 1.05, 9);
    expect(cultureOf(seatRow('MAPUCHE'), true, false)).toBeCloseTo(plain * 1.15, 9);
  });

  it('sends +4 Loyalty to its own cities within 9 tiles of a governed one', () => {
    expect(GOVERNOR_LOYALTY_ROWS.length).toBe(1);
    const loyaltyOf = (row: number): number => {
      const state = sceneAs(row);
      const seat = settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
      const other = settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
      state.seats[0].governors = emptyGovernors();
      state.seats[0].governors[0].appointed = true;
      state.seats[0].governors[0].cityId = seat.id;
      state.seats[0].governors[0].establishTurns = 0;
      return standingLoyalty(state, other);
    };
    expect(loyaltyOf(seatRow('MAPUCHE'))).toBe(loyaltyOf(seatRow('AMERICA')) + 4);
  });
});

describe('Isibongo', () => {
  it('pays a garrisoned Zulu city +3 Loyalty, +5 for a Corps or Army', () => {
    expect(GARRISON_LOYALTY_ROWS.length).toBe(2);
    const loyaltyOf = (row: number, garrison: 'none' | 'unit' | 'corps'): number => {
      const state = sceneAs(row);
      state.unitsMode = true;
      const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      if (garrison !== 'none') {
        const u = spawnUnit(state, 'WARRIOR', city.centerIndex, 0)!;
        if (garrison === 'corps') u.formation = 1;
      }
      return standingLoyalty(state, city);
    };
    const base = loyaltyOf(seatRow('ZULU'), 'none');
    expect(loyaltyOf(seatRow('ZULU'), 'unit')).toBe(base + 3);
    expect(loyaltyOf(seatRow('ZULU'), 'corps')).toBe(base + 5);
    expect(loyaltyOf(seatRow('AMERICA'), 'corps')).toBe(loyaltyOf(seatRow('AMERICA'), 'none'));
  });
});

describe('the formation rows', () => {
  it("Shaka's land Corps at Mercenaries, and +5 Combat Strength for it", () => {
    expect(FORMATION_ROWS.length).toBe(4);
    const form = (row: number, civics: string[]): boolean => {
      const state = sceneAs(row);
      state.unitsMode = true;
      settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
      grantCivics(state, ...civics);
      const host = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
      const join = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 6).index, 0)!;
      join.movesLeft = 100;
      return formUp(state, join, host.tileIndex).ok && (host.formation ?? 0) === 1;
    };
    expect(form(leaderRow('SHAKA'), ['CODE_OF_LAWS', 'CRAFTSMANSHIP', 'MILITARY_TRADITION', 'MILITARY_TRAINING', 'FEUDALISM', 'MERCENARIES'])).toBe(true);
    expect(form(seatRow('AMERICA'), ['CODE_OF_LAWS', 'CRAFTSMANSHIP', 'MILITARY_TRADITION', 'MILITARY_TRAINING', 'FEUDALISM', 'MERCENARIES'])).toBe(false);
    // every GATE reads the same row: the merge (formUp), the trained
    // formation (the queue's FORM arm) and the mask that offers it
    const src = readFileSync(new URL('../../../cpu/core/phase.ts', import.meta.url), 'utf8');
    expect(src).toContain('r.tier === tier && r.naval === !!def.naval');
    // the strength that formation carries
    const state = sceneAs(leaderRow('SHAKA'));
    state.unitsMode = true;
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    expect(rosterCS(state, u, 1, 100, false)).toBe(0);
    u.formation = 1;
    expect(rosterCS(state, u, 1, 100, false)).toBe(5);
    u.formation = 2;
    expect(rosterCS(state, u, 1, 100, false)).toBe(5);
    const plain = sceneAs(seatRow('AMERICA'));
    plain.unitsMode = true;
    const w = spawnUnit(plain, 'WARRIOR', tileAtCoords(plain.map, 5, 5).index, 0)!;
    w.formation = 1;
    expect(rosterCS(plain, w, 1, 100, false)).toBe(0);
  });
});
