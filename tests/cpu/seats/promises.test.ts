/** THE PROMISES, TypeScript half.
 *
 * Sourced from the install (`DiplomaticActions_XP2`, the four
 * `DIPLOACTION_KEEP_PROMISE_*` rows): FavorCost 30, GrievancesForRefusal 25,
 * GrievancesPerIncursion 25; "All Deals, Demands, and Promises last for 30
 * turns"; a broken promise generates 100 Grievances; the War of Retribution
 * (`RequiresBrokenPromise`) is open against "a player who has broken a
 * promise to you within the past 30 turns".
 *
 * The GPU twin is `tests/gpu/promises_test.py`.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { seatPhase } from '../../../cpu/core/phase';
import { dealPhase } from '../../../cpu/core/deals';
import { emptySeat, setTileOwner, setWar } from '../../../cpu/core/seats';
import { warConditionHolds, warKindAllowed } from '../../../cpu/core/casusBelli';
import {
  grievanceWith, promiseBrokenWith, promiseIncursion, promiseWith, settlePromises,
} from '../../../cpu/core/grievance';
import {
  PROMISES, PROMISE_BROKEN_GRIEVANCE, PROMISE_CONVERT, PROMISE_DIG, PROMISE_SPY, PROMISE_TURNS, RETRIBUTION_TURNS,
} from '../../../cpu/data/promises';
import { WAR_KINDS } from '../../../cpu/data/warKinds';
import { tilesWithin } from '../../../world/hex';
import type { City, GameState, Seat, SeatActionRecord } from '../../../cpu/core/types';

const RETRIBUTION = WAR_KINDS.findIndex((k) => k.id === 'retribution');

function addSeat(state: GameState, seat: number, col: number, row: number): Seat {
  const s: Seat = { ...emptySeat(seat), name: `Seat${seat}` };
  state.seats[seat] = s;
  const tile = tileAtCoords(state.map, col, row);
  const city: City = {
    id: s.nextCityId++, name: `City${seat}`, seat, centerIndex: tile.index,
    population: 4, foodBox: 0, cultureBox: 0, tilesAcquired: 0, focus: 'balanced',
    queue: [], isCapital: true, buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [], hp: 200, foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seat, city.id);
  s.cities.push(city);
  s.diplomaticFavor = 100;
  return s;
}

function table(): GameState {
  const state = makeState(makeMap(24, 14, 'GRASSLAND'));
  state.seats = [];
  state.turn = 100;
  addSeat(state, 0, 3, 5);
  addSeat(state, 1, 12, 5);
  addSeat(state, 2, 20, 5);
  return state;
}

describe('the promise rows', () => {
  it('carries the install row on every kind', () => {
    expect(PROMISES.map((p) => [p.favorCost, p.refusal, p.incursion])).toEqual([
      [30, 25, 25], [30, 25, 25], [30, 25, 25], [30, 25, 25]]);
    expect([PROMISE_TURNS, PROMISE_BROKEN_GRIEVANCE, RETRIBUTION_TURNS]).toEqual([30, 100, 30]);
  });
});

describe('asking, keeping, refusing', () => {
  it('a kept promise costs the asker its favor and runs 30 turns', () => {
    const state = table();
    settlePromises(state, [[0, 1, PROMISE_SPY]], [[1, 0, PROMISE_SPY]]);
    expect(state.seats[0].diplomaticFavor).toBe(70);
    expect(promiseWith(state, 0, 1, PROMISE_SPY)).toBe(PROMISE_TURNS);
    expect(promiseWith(state, 1, 0, PROMISE_SPY)).toBe(0);
    expect(grievanceWith(state, 0, 1)).toBe(0);
  });

  it('a refusal refunds the favor and earns GrievancesForRefusal', () => {
    const state = table();
    settlePromises(state, [[0, 1, PROMISE_CONVERT]], []);
    expect(state.seats[0].diplomaticFavor).toBe(100);
    expect(promiseWith(state, 0, 1, PROMISE_CONVERT)).toBe(-PROMISE_TURNS);
    expect(grievanceWith(state, 0, 1)).toBe(25);
  });

  it('refuses an ask the asker cannot pay, one already standing, and one at war', () => {
    const state = table();
    state.seats[0].diplomaticFavor = 29;
    settlePromises(state, [[0, 1, PROMISE_SPY]], [[1, 0, PROMISE_SPY]]);
    expect(promiseWith(state, 0, 1, PROMISE_SPY)).toBe(0);
    state.seats[0].diplomaticFavor = 100;
    settlePromises(state, [[0, 1, PROMISE_SPY]], []);
    settlePromises(state, [[0, 1, PROMISE_SPY]], [[1, 0, PROMISE_SPY]]);
    expect(promiseWith(state, 0, 1, PROMISE_SPY)).toBe(-PROMISE_TURNS);
    expect(grievanceWith(state, 0, 1)).toBe(25);
    setWar(state, 0, 2, true);
    settlePromises(state, [[0, 2, PROMISE_DIG]], [[2, 0, PROMISE_DIG]]);
    expect(promiseWith(state, 0, 2, PROMISE_DIG)).toBe(0);
  });

  it('a keep with no ask standing makes nothing', () => {
    const state = table();
    settlePromises(state, [], [[1, 0, PROMISE_SPY]]);
    expect(state.promises ?? {}).toEqual({});
  });

  it('rides the record through seatPhase', () => {
    const state = table();
    const rec = (over: Partial<SeatActionRecord>): SeatActionRecord =>
      ({ production: [], tech: null, civic: null, units: [], ...over });
    state.seatActions = { [state.turn - 1]: {
      0: rec({ askPromise: [[1, PROMISE_SPY]] }),
      1: rec({ keepPromise: [[0, PROMISE_SPY]] }),
      2: rec({ askPromise: [[1, PROMISE_DIG]] }),
    } };
    seatPhase(state);
    // the ledger ticked once in dealPhase before the table was set
    expect(promiseWith(state, 0, 1, PROMISE_SPY)).toBe(PROMISE_TURNS);
    expect(promiseWith(state, 2, 1, PROMISE_DIG)).toBe(-PROMISE_TURNS);
    // the refusal's 25, less the turn's own grievance decay
    expect(grievanceWith(state, 2, 1)).toBeGreaterThan(0);
    expect(grievanceWith(state, 2, 1)).toBeLessThanOrEqual(25);
  });
});

describe('the incursion', () => {
  it('a refusal standing earns GrievancesPerIncursion for each one', () => {
    const state = table();
    settlePromises(state, [[0, 1, PROMISE_CONVERT]], []);
    promiseIncursion(state, 0, 1, PROMISE_CONVERT, 2);
    expect(grievanceWith(state, 0, 1)).toBe(25 + 50);
    expect(promiseBrokenWith(state, 0, 1)).toBe(0);
  });

  it('breaks a kept promise: 100 Grievances, the promise ends, the War of Retribution opens', () => {
    const state = table();
    settlePromises(state, [[0, 1, PROMISE_SPY]], [[1, 0, PROMISE_SPY]]);
    expect(warConditionHolds(state, 0, 1, 'brokenPromise')).toBe(false);
    promiseIncursion(state, 0, 1, PROMISE_SPY, 3);
    expect(promiseWith(state, 0, 1, PROMISE_SPY)).toBe(0);
    expect(grievanceWith(state, 0, 1)).toBe(PROMISE_BROKEN_GRIEVANCE);
    expect(promiseBrokenWith(state, 0, 1)).toBe(RETRIBUTION_TURNS);
    expect(warConditionHolds(state, 0, 1, 'brokenPromise')).toBe(true);
    expect(warConditionHolds(state, 1, 0, 'brokenPromise')).toBe(false);
    // the kind still asks its civic and a five-turn denouncement
    state.seats[0].research.civics.push('EARLY_EMPIRE');
    expect(warKindAllowed(state, 0, 1, RETRIBUTION)).toBe(false);
    state.seats[0].denounced[1] = state.turn - 5;
    expect(warKindAllowed(state, 0, 1, RETRIBUTION)).toBe(true);
    // a second incursion finds nothing standing
    promiseIncursion(state, 0, 1, PROMISE_SPY, 1);
    expect(grievanceWith(state, 0, 1)).toBe(PROMISE_BROKEN_GRIEVANCE);
  });

  it('nothing standing, nothing owed', () => {
    const state = table();
    promiseIncursion(state, 0, 1, PROMISE_DIG, 1);
    expect(grievanceWith(state, 0, 1)).toBe(0);
  });
});

describe('the clock', () => {
  it('runs promises, refusals and the window toward 0', () => {
    const state = table();
    settlePromises(state, [[0, 1, PROMISE_SPY], [0, 2, PROMISE_CONVERT]], [[1, 0, PROMISE_SPY]]);
    promiseIncursion(state, 0, 1, PROMISE_SPY, 1);
    settlePromises(state, [[0, 1, PROMISE_DIG]], [[1, 0, PROMISE_DIG]]);
    dealPhase(state);
    expect(promiseWith(state, 0, 1, PROMISE_DIG)).toBe(PROMISE_TURNS - 1);
    expect(promiseWith(state, 0, 2, PROMISE_CONVERT)).toBe(-(PROMISE_TURNS - 1));
    expect(promiseBrokenWith(state, 0, 1)).toBe(RETRIBUTION_TURNS - 1);
    for (let t = 1; t < PROMISE_TURNS; t++) dealPhase(state);
    expect(state.promises ?? {}).toEqual({});
    expect(state.promiseBroken ?? {}).toEqual({});
    expect(warConditionHolds(state, 0, 1, 'brokenPromise')).toBe(false);
  });
});
