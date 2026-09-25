/**
 * A CITY-STATE'S TRADE ROUTES — its capacity, the destination its free Trader
 * takes, what a route pays its city, the walk and the round trip that brings
 * the Trader home, and the war that cancels it. The GPU twin is
 * tests/gpu/minor_trade_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { declareWarOnCityState, minorCity } from '../../../cpu/core/cityStates';
import {
  cityStateRouteYields, cityTradeYields, minorRouteCandidate, minorRouteYields, minorTrade, routeOriginCenter,
  tradeCapacity, tradeRouteMinDuration,
} from '../../../cpu/core/trade';
import { spawnUnit } from '../../../cpu/core/units';
import { tilesWithin } from '../../../world/hex';
import type { CityState, CityStateType, GameState, Yields } from '../../../cpu/core/types';

function addCs(state: GameState, col: number, row: number, type: CityStateType = 'scientific'): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length,
    name: `CS${state.cityStates.length}`,
    type,
    centerIndex: center.index,
    population: 3,
    envoys: {},
    met: [0],
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  center.district = 'CITY_CENTER';
  center.districtComplete = true;
  state.cityStates.push(cityState);
  return cityState;
}

const sum = (y: Yields) => y.food + y.production + y.gold + y.science + y.culture + y.faith;

function scene() {
  const state = makeState(makeMap(40, 40));
  state.unitsMode = true;
  const cs = addCs(state, 5, 5, 'scientific');
  const near = addCs(state, 15, 5, 'trade');
  const far = addCs(state, 34, 34, 'cultural');
  cs.research.civics = ['FOREIGN_TRADE'];
  return { state, cs, near, far };
}

describe("a city-state's trade capacity", () => {
  it('is its Foreign Trade civic and its city\'s Market or Lighthouse', () => {
    const { state, cs } = scene();
    expect(tradeCapacity(state, cs.seat)).toBe(1);
    cs.buildings = ['MARKET'];
    expect(tradeCapacity(state, cs.seat)).toBe(2);
    cs.research.civics = [];
    expect(tradeCapacity(state, cs.seat)).toBe(1);
  });
});

describe("a city-state's route", () => {
  it('its free Trader takes the best-paying destination in range and is spent on it', () => {
    const { state, cs, near, far } = scene();
    const cap = settleAt(state, tileAtCoords(state.map, 5, 14).index, 0);
    // the scorer: every new in-range destination, the highest yield sum, the
    // first on a tie — the minor out of range never competes
    const pick = minorRouteCandidate(state, cs)!;
    const toNear = sum(minorRouteYields(state, { from: -1, to: -1, toCs: near.id })!);
    const toCap = sum(minorRouteYields(state, { from: -1, to: -1, toSeat: 0, toSeatCity: cap.id })!);
    expect(toNear).toBe(sum(cityStateRouteYields(near)));
    if (toNear >= toCap) expect(pick.toCs).toBe(near.id);
    else expect(pick.toSeatCity).toBe(cap.id);
    expect(pick.toCs).not.toBe(far.id);

    const trader = spawnUnit(state, 'TRADER', cs.centerIndex, cs.seat)!;
    minorTrade(state, cs);
    expect(state.units.includes(trader)).toBe(false);
    expect(cs.tradeRoutes).toHaveLength(1);
    const r = cs.tradeRoutes![0];
    expect(r.from).toBe(-1);
    expect(routeOriginCenter(state, cs, r)).toBe(cs.centerIndex);
    expect(r.expiresTurn).toBe(state.turn + tradeRouteMinDuration(state));
    expect(r.chain).toEqual([]);
    // no free Trader, no second route; the one it runs is no candidate again
    minorTrade(state, cs);
    expect(cs.tradeRoutes).toHaveLength(1);
  });

  it("pays its city the destination's rows", () => {
    const { state, cs, near } = scene();
    spawnUnit(state, 'TRADER', cs.centerIndex, cs.seat);
    const before = cityTradeYields(state, minorCity(cs), 0);
    expect(sum(before)).toBe(0);
    minorTrade(state, cs);
    expect(cs.tradeRoutes![0].toCs).toBe(near.id);
    expect(cityTradeYields(state, minorCity(cs), 0)).toEqual(cityStateRouteYields(near));
  });

  it('walks toward its destination and comes home with its Trader at the end of its term', () => {
    const { state, cs } = scene();
    spawnUnit(state, 'TRADER', cs.centerIndex, cs.seat);
    minorTrade(state, cs);
    const r = cs.tradeRoutes![0];
    const exp = r.expiresTurn!;
    let moved = false;
    for (let turn = state.turn + 1; turn < exp + 40 && (cs.tradeRoutes ?? []).length > 0; turn++) {
      state.turn = turn;
      const at = r.walkTile;
      minorTrade(state, cs);
      if (r.walkTile !== at) moved = true;
    }
    expect(moved).toBe(true);
    expect(cs.tradeRoutes).toEqual([]);
    expect(state.turn).toBeGreaterThanOrEqual(exp);
    expect(state.units.filter((u) => u.seat === cs.seat && u.type === 'TRADER')).toHaveLength(1);
  });

  it("a war with the destination's holder cancels it, and a destination at war is never taken", () => {
    const { state, cs, near } = scene();
    near.centerIndex = tileAtCoords(state.map, 30, 30).index; // out of range: the major's city is the only one
    const cap = settleAt(state, tileAtCoords(state.map, 5, 14).index, 0);
    cs.met = [0];
    spawnUnit(state, 'TRADER', cs.centerIndex, cs.seat);
    minorTrade(state, cs);
    expect(cs.tradeRoutes![0].toSeatCity).toBe(cap.id);
    state.seats[0].treasury = 1000;
    expect(declareWarOnCityState(state, cs.id, 0).ok).toBe(true);
    expect(cs.tradeRoutes).toEqual([]);
    expect(state.units.filter((u) => u.seat === cs.seat && u.type === 'TRADER')).toHaveLength(1);
    expect(minorRouteCandidate(state, cs)).toBeNull();
  });
});
