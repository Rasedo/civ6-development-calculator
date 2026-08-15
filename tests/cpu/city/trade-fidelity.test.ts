import { describe, it, expect } from 'vitest';
import { cityStateOfSeat, emptySeat, isCityStateSeat, setTileOwner, setWar, tileSeat } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, expandBorders } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { tilesWithin } from '../../../world/hex';
import { tradeCapacity, addTradeRoute, addIntlTradeRoute, canAddIntlTradeRoute, cityTradeYields, routeYieldsInternational, specialtyDistricts, TRADE_ROUTE_DURATION, INTL_ROUTE_GOLD } from '../../../cpu/core/trade';
import { seatPhase } from '../../../cpu/core/phase';
import type { City, GameState, Seat } from '../../../cpu/core/types';

// A sandbox of two seat-0 cities where the origin holds a Market (so
// tradeCapacity >= 1) and the destination holds a completed specialty district.
function twoCitySandbox() {
  const state = makeState(makeMap(24, 24));
  state.sandbox = true;
  const origin = foundCity(state, tileAtCoords(state.map, 6, 6).index, 0).city!;
  const dest = foundCity(state, tileAtCoords(state.map, 10, 6).index, 0).city!;
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

function addCiv(state: GameState, col: number, row: number, opts: Partial<Seat> = {}): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
    warmonger: 0,
    ww: {}, wwTurn: {},
    diplomaticFavor: 0,
    diplomaticPoints: 0,
    influencePoints: 0,
    envoysAvailable: 0,
    treasury: 0,
    scienceTotal: 0,
    cultureTotal: 0,
    faith: 0,
    tourism: 0,
    government: { current: null, policies: [] },
    cities: [],
    nextCityId: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    spaceProjects: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    ...opts,
  };
  const city: City = {
    id: civ.nextCityId++,
    name: 'Roma',
    seat: civ.seat,
    centerIndex: tile.index,
    population: 3,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: ['MARKET'], // +1 civ trade capacity
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: 200,
    foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  setTileOwner(tile, civ.seat, city.id);
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (tileSeat(t) !== 0 && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civ.seat, city.id);
    }
  }
  civ.cities.push(city);
  state.seats.push(civ);
  return civ;
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

  it('a seat-0 international route to a civ city pays gold only and is suspended at war', () => {
    const { state, origin } = twoCitySandbox();
    const civ = addCiv(state, 12, 6); // within TRADE_ROUTE_RANGE of origin
    addCompletedCampus(state, civ.cities[0], 12, 7);

    expect(tradeCapacity(state, 0)).toBeGreaterThanOrEqual(1);
    expect(canAddIntlTradeRoute(state, origin.id, civ.seat, civ.cities[0].id, 0).ok).toBe(true);
    expect(addIntlTradeRoute(state, origin.id, civ.seat, civ.cities[0].id, 0).ok).toBe(true);

    const peaceYields = cityTradeYields(state, origin);
    expect(peaceYields.gold).toBe(INTL_ROUTE_GOLD + 1); // 3 base + 1 specialty
    expect(peaceYields.food).toBe(0);
    expect(peaceYields.production).toBe(0);

    // Destination-civ interdiction: war with the civ kills the income.
    setWar(state, civ.seat, 0, true);
    expect(cityTradeYields(state, origin).gold).toBe(0);
  });
});

describe('B-23 route duration', () => {
  it('addTradeRoute / addCsTradeRoute stamp expiresTurn = turn + TRADE_ROUTE_DURATION', () => {
    const { state, origin, dest } = twoCitySandbox();
    state.turn = 7;
    expect(addTradeRoute(state, origin.id, dest.id, 0).ok).toBe(true);
    expect(state.seats[0].tradeRoutes![0].expiresTurn).toBe(7 + TRADE_ROUTE_DURATION);
  });

  it('the seatPhase loop drops routes at/after expiry, keeps the rest, zero draws', () => {
    const { state, origin, dest } = twoCitySandbox();
    state.turn = 1;
    addTradeRoute(state, origin.id, dest.id, 0); // expires at 1 + DURATION
    expect(state.seats[0].tradeRoutes!.length).toBe(1);

    state.turn = TRADE_ROUTE_DURATION; // still one turn short of expiry
    seatPhase(state);
    expect(state.seats[0].tradeRoutes!.length).toBe(1);

    state.turn = 1 + TRADE_ROUTE_DURATION; // expiry turn reached
    seatPhase(state);
    expect(state.seats[0].tradeRoutes!.length).toBe(0);
  });
});

describe('B-23 civ international pick + income', () => {
  it('a civ with spare capacity and no domestic/CS destination routes to the nearest seat-0 city', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    const pcity = foundCity(state, tileAtCoords(state.map, 10, 10).index, 0).city!;
    expandBorders(state, pcity, 2);
    addCompletedCampus(state, pcity, 11, 10);

    // Single-city civ (no domestic pair), no met CS, a MARKET for capacity,
    // placed within trade range of the seat-0 city.
    const civ = addCiv(state, 13, 10);
    expect(tradeCapacity(state, civ.seat)).toBeGreaterThanOrEqual(1);

    seatPhase(state);

    const routes = civ.tradeRoutes ?? [];
    const intl = routes.find((r) => r.toSeatCity !== undefined);
    expect(intl).toBeDefined();
    expect(intl!.toSeatCity).toBe(pcity.id);
    expect(intl!.expiresTurn).toBe(state.turn + TRADE_ROUTE_DURATION);
  });
});
