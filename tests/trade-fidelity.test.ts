import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, expandBorders } from './helpers';
import { foundCity } from '../src/core/game';
import { tilesWithin } from '../src/core/hex';
import {
  tradeCapacity,
  addTradeRoute,
  addIntlTradeRoute,
  canAddIntlTradeRoute,
  cityTradeYields,
  routeYieldsInternational,
  specialtyDistricts,
  expirePlayerRoutes,
  rivalTradeCapacity,
  TRADE_ROUTE_DURATION,
  INTL_ROUTE_GOLD,
} from '../src/core/trade';
import { rivalPhase } from '../src/core/rivals';
import type { City, GameState, RivalCity, RivalCiv } from '../src/core/types';

// B-23: a two-player-city sandbox where the origin holds a Market (so
// tradeCapacity >= 1) and the destination holds a completed specialty district.
function twoCitySandbox() {
  const state = makeState(makeMap(24, 24));
  state.sandbox = true;
  const origin = foundCity(state, tileAtCoords(state.map, 6, 6).index).city!;
  const dest = foundCity(state, tileAtCoords(state.map, 10, 6).index).city!;
  expandBorders(state, origin, 2);
  expandBorders(state, dest, 2);
  origin.buildings.push('MARKET'); // +1 trade capacity
  return { state, origin, dest };
}

// Give a city one completed specialty district (CAMPUS) on an owned tile.
function addCompletedCampus(state: GameState, city: City, col: number, row: number) {
  const t = tileAtCoords(state.map, col, row);
  t.district = 'CAMPUS';
  t.districtComplete = true;
  city.districts.push({ type: 'CAMPUS', tileIndex: t.index });
}

function addRival(state: GameState, col: number, row: number, opts: Partial<RivalCiv> = {}): RivalCiv {
  const tile = tileAtCoords(state.map, col, row);
  const rival: RivalCiv = {
    id: state.rivals.length,
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    cities: [],
    nextCityId: 0,
    atWar: false,
    warTurns: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
    pantheonClaimed: true,
    religionFounded: true,
    ...opts,
  };
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: 'Roma',
    civId: rival.id + 1,
    centerIndex: tile.index,
    population: 3,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: ['MARKET'], // +1 rival trade capacity
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: 200,
    foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  tile.rivalId = rival.id;
  tile.rivalCityId = city.id;
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (t.cityId === -1 && (t.csId ?? -1) === -1) {
      t.rivalId = rival.id;
      t.rivalCityId = city.id;
    }
  }
  rival.cities.push(city);
  state.rivals.push(rival);
  return rival;
}

describe('B-23 international route yields', () => {
  it('routeYieldsInternational pays INTL_ROUTE_GOLD + 1 gold per completed specialty district, gold only', () => {
    const { state, dest } = twoCitySandbox();
    expect(specialtyDistricts(state, dest)).toBe(0);
    let y = routeYieldsInternational(state, dest);
    expect(y.gold).toBe(INTL_ROUTE_GOLD);
    expect(y.food).toBe(0);
    expect(y.production).toBe(0);

    addCompletedCampus(state, dest, 11, 6);
    expect(specialtyDistricts(state, dest)).toBe(1);
    y = routeYieldsInternational(state, dest);
    expect(y.gold).toBe(INTL_ROUTE_GOLD + 1);
    expect(y.food).toBe(0);
  });

  it('a player international route to a rival city pays gold only and is suspended at war', () => {
    const { state, origin } = twoCitySandbox();
    const rival = addRival(state, 12, 6); // within TRADE_ROUTE_RANGE of origin
    addCompletedCampus(state, rival.cities[0], 12, 7);

    expect(tradeCapacity(state)).toBeGreaterThanOrEqual(1);
    expect(canAddIntlTradeRoute(state, origin.id, rival.id, rival.cities[0].id).ok).toBe(true);
    expect(addIntlTradeRoute(state, origin.id, rival.id, rival.cities[0].id).ok).toBe(true);

    const peaceYields = cityTradeYields(state, origin);
    expect(peaceYields.gold).toBe(INTL_ROUTE_GOLD + 1); // 3 base + 1 specialty
    expect(peaceYields.food).toBe(0);
    expect(peaceYields.production).toBe(0);

    // Destination-civ interdiction: war with the rival kills the income.
    rival.atWar = true;
    expect(cityTradeYields(state, origin).gold).toBe(0);
  });
});

describe('B-23 route duration', () => {
  it('addTradeRoute / addCsTradeRoute stamp expiresTurn = turn + TRADE_ROUTE_DURATION', () => {
    const { state, origin, dest } = twoCitySandbox();
    state.turn = 7;
    expect(addTradeRoute(state, origin.id, dest.id).ok).toBe(true);
    expect(state.tradeRoutes[0].expiresTurn).toBe(7 + TRADE_ROUTE_DURATION);
  });

  it('expirePlayerRoutes drops routes at/after expiry, keeps the rest, zero draws', () => {
    const { state, origin, dest } = twoCitySandbox();
    state.turn = 1;
    addTradeRoute(state, origin.id, dest.id); // expires at 1 + DURATION
    expect(state.tradeRoutes.length).toBe(1);

    state.turn = TRADE_ROUTE_DURATION; // still one turn short of expiry
    expirePlayerRoutes(state);
    expect(state.tradeRoutes.length).toBe(1);

    state.turn = 1 + TRADE_ROUTE_DURATION; // expiry turn reached
    expirePlayerRoutes(state);
    expect(state.tradeRoutes.length).toBe(0);
  });
});

describe('B-23 rival international pick + income', () => {
  it('a rival with spare capacity and no domestic/CS destination routes to the nearest player city', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    const pcity = foundCity(state, tileAtCoords(state.map, 10, 10).index).city!;
    expandBorders(state, pcity, 2);
    addCompletedCampus(state, pcity, 11, 10);

    // Single-city rival (no domestic pair), no met CS, a MARKET for capacity,
    // placed within trade range of the player city.
    const rival = addRival(state, 13, 10);
    expect(rivalTradeCapacity(state, rival)).toBeGreaterThanOrEqual(1);

    rivalPhase(state);

    const routes = rival.tradeRoutes ?? [];
    const intl = routes.find((r) => r.toPlayer !== undefined);
    expect(intl).toBeDefined();
    expect(intl!.toPlayer).toBe(pcity.id);
    expect(intl!.expiresTurn).toBe(state.turn + TRADE_ROUTE_DURATION);
  });
});
