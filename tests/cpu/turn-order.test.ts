/**
 * THE TURN'S ORDER, as Civ 6 runs it (tools/civ6lab/turn_order_civ6.md,
 * runs/turnorder/): a seat's economy before its cities, each city's production
 * before its growth, one heal of every city at the turn's end, the Congress
 * before the counter moves. The GPU twin is tests/gpu/turn_order_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from './helpers';
import { BARB_SEAT, seatOf } from '../../cpu/core/seats';
import { healCities, seatPhase } from '../../cpu/core/phase';
import { computeCityStats } from '../../cpu/core/city';
import { spawnUnit } from '../../cpu/core/units';
import { placeCityStateAt } from '../../cpu/core/cityStates';
import { amenityTierIndex } from '../../cpu/data/constants';
import { CITY_STATE_MAX_HP } from '../../cpu/data/cityStates';
import { neighbors } from '../../world/hex';

describe("the seat's economy runs before its cities", () => {
  it("a shortfall's amenity penalty reaches the same turn's cities", () => {
    const state = makeState();
    settleAt(state, tileAtCoords(state.map, 5, 5).index);
    const s = seatOf(state, 0)!;
    const city = s.cities[0];
    // the balance stays below 0 after the turn's gold: the shortfall lands in
    // the economy, before the walk reads the city
    s.treasury = -50;
    seatPhase(state);
    expect(s.goldShortfall).toBeGreaterThan(0);
    const now = computeCityStats(state, city).amenities.tier.name;
    expect(city.amenityTier).toBe(amenityTierIndex(now));
    const short = s.goldShortfall;
    s.goldShortfall = 0;
    const rich = computeCityStats(state, city).amenities.balance;
    s.goldShortfall = short;
    expect(computeCityStats(state, city).amenities.balance).toBeLessThan(rich);
  });
});

describe("a city's production comes before its growth", () => {
  it('a Settler takes its citizen first, and the city grows on what is left', () => {
    const state = makeState();
    const city = settleAt(state, tileAtCoords(state.map, 5, 5).index);
    city.population = 6;
    city.queue = [{ kind: 'settler', progress: 10_000, cost: 1 }];
    city.foodBox = 0;
    seatPhase(state);
    expect(city.population).toBe(5);
    // the box took the pop-5 city's surplus, the one standing after the
    // completion
    expect(city.foodBox).toBeCloseTo(computeCityStats(state, city).effectiveFoodSurplus, 9);
  });
});

describe('every city heals once, at the turn\'s end', () => {
  it("a city-state's centre heals +20, and none while besieged", () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 3).index);
    const cs = placeCityStateAt(state, 0, 'CS0', 'militaristic', tileAtCoords(state.map, 12, 12).index);
    cs.hp = 100;
    healCities(state);
    expect(cs.hp).toBe(120);
    cs.hp = CITY_STATE_MAX_HP - 5;
    healCities(state);
    expect(cs.hp).toBe(CITY_STATE_MAX_HP);
    // every passable neighbour held by a hostile unit exerting its zone of
    // control: no heal
    cs.hp = 100;
    for (const n of neighbors(state.map, state.map.tiles[cs.centerIndex])) spawnUnit(state, 'WARRIOR', n.index, BARB_SEAT);
    healCities(state);
    expect(cs.hp).toBe(100);
  });
});
