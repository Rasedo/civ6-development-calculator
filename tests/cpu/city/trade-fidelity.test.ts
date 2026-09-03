import { describe, it, expect } from 'vitest';
import { cityStateOfSeat, civsAtWar, emptySeat, isCityStateSeat, seatOf, seatOfCityState, setTileOwner, tileSeat } from '../../../cpu/core/seats';
import { settleAt, makeMap, makeState, tileAtCoords, expandBorders } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { tilesWithin } from '../../../world/hex';
import { canAddTradeRoute, freeTrader, tradeCapacity, addTradeRoute, addIntlTradeRoute, canAddIntlTradeRoute, cityTradeYields, routeYieldsInternational, specialtyDistricts, cityMaritime, tradeRouteRange, routeInRange, routeChain, routeChainGold, stampTradingPost, routePostGold, wonderRouteOriginGold, ROUTE_CHAIN_MAX, TRADE_ROUTE_DURATION, TRADE_ROUTE_RANGE_LAND, TRADE_ROUTE_RANGE_SEA, INTL_ROUTE_GOLD } from '../../../cpu/core/trade';
import { computeCityStats } from '../../../cpu/core/city';
import { BUILT_WONDERS } from '../../../cpu/data/builtWonders';
import { GOVERNORS } from '../../../cpu/data/governors';
import { tradeWalkReachable, tradeWaterLevel, TRADE_WATER_NONE, TRADE_WATER_COAST } from '../../../cpu/core/units';
import { isWater } from '../../../world/query';
import { hexDistance } from '../../../world/hex';
import { applySeatActionRecord, declareWar, seatPhase, warTargets } from '../../../cpu/core/phase';
import { routeCandidateRow } from '../../../cpu/driver/driver';
import { spawnUnit, trainableUnits, traderCost } from '../../../cpu/core/units';
import { UNITS } from '../../../cpu/data/units';
import { TECHS } from '../../../cpu/data/techs';
import type { City, CityState, CityStateType, GameState, Seat } from '../../../cpu/core/types';

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
    government: { current: null, policies: [], held: 0 },
    cities: [],
    nextCityId: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    projectsDone: [],
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
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: ['MARKET'], // +1 civ trade capacity
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
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

describe('international route yields', () => {
  it('routeYieldsInternational pays INTL_ROUTE_GOLD + 1 gold per completed specialty district, gold only', () => {
    const { state, origin, dest } = twoCitySandbox();
    expect(specialtyDistricts(state, dest)).toBe(0);
    let y = routeYieldsInternational(state, origin, dest, 0);
    expect(y.gold).toBe(INTL_ROUTE_GOLD);
    expect(y.food).toBe(0);
    expect(y.production).toBe(0);

    addCompletedCampus(state, dest, 11, 6);
    expect(specialtyDistricts(state, dest)).toBe(1);
    y = routeYieldsInternational(state, origin, dest, 0);
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

    const peaceYields = cityTradeYields(state, origin, 0);
    expect(peaceYields.gold).toBe(INTL_ROUTE_GOLD + 1); // 3 base + 1 specialty
    expect(peaceYields.food).toBe(0);
    expect(peaceYields.production).toBe(0);

    // War CANCELS the pair's routes (real Civ 6 has no suspension) — the
    // income stops because the route is GONE.
    declareWar(state, 0, civ.seat);
    expect(state.seats[0].tradeRoutes!.length).toBe(0);
    expect(cityTradeYields(state, origin, 0).gold).toBe(0);
  });

  it('the WAR COLUMN cancels the routes between the pair and recalls the Trader', () => {
    const { state, origin } = twoCitySandbox();
    const civ = addCiv(state, 12, 6);
    addCompletedCampus(state, civ.cities[0], 12, 7);
    expect(addIntlTradeRoute(state, origin.id, civ.seat, civ.cities[0].id, 0).ok).toBe(true);

    const col = warTargets(state, 0).indexOf(civ.seat);
    expect(col).toBeGreaterThanOrEqual(0);
    state.unitsMode = true;
    applySeatActionRecord(state, seatOf(state, 0)!, {
      production: [], tech: null, civic: null, units: [], war: col,
    });

    expect(civsAtWar(state, 0, civ.seat)).toBe(true);
    expect(state.seats[0].tradeRoutes!.length).toBe(0);
    const recalled = state.units!.filter((u) => u.seat === 0 && u.type === 'TRADER');
    expect(recalled.length).toBe(1);
    expect(recalled[0]!.tileIndex).toBe(origin.centerIndex);
  });
});

describe('route duration', () => {
  it('addTradeRoute / addCsTradeRoute stamp expiresTurn = turn + TRADE_ROUTE_DURATION', () => {
    const { state, origin, dest } = twoCitySandbox();
    state.turn = 7;
    expect(addTradeRoute(state, origin.id, dest.id, 0).ok).toBe(true);
    expect(state.seats[0].tradeRoutes![0].expiresTurn).toBe(7 + TRADE_ROUTE_DURATION);
  });

  it('a PARKED (sea) route drops exactly at the term — the walker is always home', () => {
    const { state, origin, dest } = twoCitySandbox();
    state.turn = 1;
    addTradeRoute(state, origin.id, dest.id, 0); // expires at 1 + DURATION
    expect(state.seats[0].tradeRoutes!.length).toBe(1);
    state.seats[0].tradeRoutes![0].walkLeg = -1; // the sea shape: parked at origin

    state.turn = TRADE_ROUTE_DURATION; // still one turn short of expiry
    seatPhase(state);
    expect(state.seats[0].tradeRoutes!.length).toBe(1);

    state.turn = 1 + TRADE_ROUTE_DURATION; // expiry turn reached
    seatPhase(state);
    expect(state.seats[0].tradeRoutes!.length).toBe(0);
  });

  it('a WALKING route holds past the term until its Trader completes the round trip', () => {
    const { state, origin, dest } = twoCitySandbox();
    state.turn = 1;
    addTradeRoute(state, origin.id, dest.id, 0);
    const r = state.seats[0].tradeRoutes![0];
    expect(r.walkLeg).toBe(0); // a land pair walks
    state.turn = 1 + TRADE_ROUTE_DURATION;
    seatPhase(state); // the term arrives with the walker OUT: the route holds
    expect(state.seats[0].tradeRoutes!.length).toBe(1);
    let steps = 0;
    while (state.seats[0].tradeRoutes!.length > 0 && steps < 3 * TRADE_ROUTE_DURATION) {
      state.turn += 1;
      seatPhase(state);
      steps += 1;
    }
    expect(state.seats[0].tradeRoutes!.length).toBe(0); // home after the term
  });
});

describe('civ international pick + income', () => {
  it('a civ with spare capacity routes to an explored seat-0 city', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    const pcity = foundCity(state, tileAtCoords(state.map, 10, 10).index, 0).city!;
    expandBorders(state, pcity, 2);
    addCompletedCampus(state, pcity, 11, 10);

    // Single-city civ (no domestic pair), no met CS, a MARKET for capacity,
    // placed within trade range of the seat-0 city.
    const civ = addCiv(state, 13, 10);
    expect(tradeCapacity(state, civ.seat)).toBeGreaterThanOrEqual(1);

    // the pick is the DECIDER's now: the candidate row names an explored
    // seat-0 city, and the wire intent lands it through seatPhase.
    const cand = routeCandidateRow(state, civ);
    expect(cand[0]).toBe(civ.cities[0].centerIndex);
    expect(cand[1]).toBe(pcity.centerIndex);
    ((state.seatActions ??= {})[state.turn - 1] ??= {})[civ.seat] = {
      production: [], tech: null, civic: null, units: [], route: [cand[0], cand[1]],
    };
    seatPhase(state);

    const routes = civ.tradeRoutes ?? [];
    const intl = routes.find((r) => r.toSeatCity !== undefined);
    expect(intl).toBeDefined();
    expect(intl!.toSeatCity).toBe(pcity.id);
    expect(intl!.expiresTurn).toBe(state.turn + TRADE_ROUTE_DURATION);
  });
});

describe('the Trader unit', () => {
  it('the route verb SPENDS a free Trader; capacity gates training; the ended route returns it', () => {
    const state = makeState(makeMap(24, 24));
    state.unitsMode = true;
    const origin = settleAt(state, tileAtCoords(state.map, 6, 6).index);
    const dest = settleAt(state, tileAtCoords(state.map, 10, 6).index);
    state.seats[0].research.civics.push('FOREIGN_TRADE'); // capacity 1
    expect(tradeCapacity(state, 0)).toBe(1);

    // no Trader, no route
    expect(canAddTradeRoute(state, origin.id, dest.id, 0).ok).toBe(false);
    expect(trainableUnits(state, 0).some((d) => d.id === 'TRADER')).toBe(true);

    const t = spawnUnit(state, 'TRADER', origin.centerIndex, 0)!;
    expect(freeTrader(state, 0)?.id).toBe(t.id);
    // owning a free Trader at capacity blocks training another
    expect(trainableUnits(state, 0).some((d) => d.id === 'TRADER')).toBe(false);

    expect(addTradeRoute(state, origin.id, dest.id, 0).ok).toBe(true);
    expect(freeTrader(state, 0)).toBeUndefined(); // spent into the route
    // the active route still counts against capacity for training
    expect(trainableUnits(state, 0).some((d) => d.id === 'TRADER')).toBe(false);

    // force the parked shape and run out the term: the Trader comes home
    const r = state.seats[0].tradeRoutes![0];
    r.walkLeg = -1;
    state.turn = (r.expiresTurn ?? 0);
    seatPhase(state);
    expect(state.seats[0].tradeRoutes!.length).toBe(0);
    const back = freeTrader(state, 0);
    expect(back).toBeDefined();
    expect(back!.tileIndex).toBe(origin.centerIndex);
  });

  it('traderCost is progressive with game progress', () => {
    const state = makeState(makeMap(8, 8));
    const base = traderCost(state, 0);
    expect(base).toBe(UNITS.TRADER.cost); // no research: base price
    const nT = Object.keys(TECHS).length;
    for (const id of Object.keys(TECHS).slice(0, Math.ceil(nT / 2))) state.seats[0].research.techs.push(id);
    const p = Math.floor(100 * (state.seats[0].research.techs.length / nT)) / 100;
    expect(traderCost(state, 0)).toBe(Math.round(UNITS.TRADER.cost * (1 + 4 * p)));
  });

  // CIV6: "The base range for land trade routes is 15 tiles ... The base range
  // for sea trade routes is 30 tiles", and "both the origin city and the
  // destination city require maritime access ... in order to establish sea
  // Trade Routes".
  it('a sea route reaches twice as far, and only with maritime access at both ends', () => {
    const state = makeState(makeMap(40, 12));
    state.sandbox = true;
    const origin = foundCity(state, tileAtCoords(state.map, 2, 6).index, 0).city!;
    const far = foundCity(state, tileAtCoords(state.map, 24, 6).index, 0).city!;
    origin.buildings.push('MARKET');
    const d = hexDistance(
      state.map.tiles[origin.centerIndex].col, state.map.tiles[origin.centerIndex].row,
      state.map.tiles[far.centerIndex].col, state.map.tiles[far.centerIndex].row,
    );
    expect(d).toBeGreaterThan(TRADE_ROUTE_RANGE_LAND);
    expect(d).toBeLessThanOrEqual(TRADE_ROUTE_RANGE_SEA);
    expect(canAddTradeRoute(state, origin.id, far.id, 0).ok).toBe(false);

    // give both centres a coastal neighbour...
    tileAtCoords(state.map, 2, 5).terrain = 'COAST';
    tileAtCoords(state.map, 24, 5).terrain = 'COAST';
    expect(cityMaritime(state, origin.centerIndex, origin)).toBe(true);
    expect(cityMaritime(state, far.centerIndex, far)).toBe(true);
    // ...which is still not enough without Celestial Navigation
    expect(canAddTradeRoute(state, origin.id, far.id, 0).ok).toBe(false);
    seatOf(state, 0)!.research.techs.push('CELESTIAL_NAVIGATION');
    expect(tradeRouteRange(state, 0, origin.centerIndex, far.centerIndex))
      .toBe(TRADE_ROUTE_RANGE_SEA);
    expect(canAddTradeRoute(state, origin.id, far.id, 0).ok).toBe(true);

    // a HARBOR gives the access a landlocked centre lacks
    const inland = foundCity(state, tileAtCoords(state.map, 12, 9).index, 0).city!;
    expect(cityMaritime(state, inland.centerIndex, inland)).toBe(false);
    const ht = tileAtCoords(state.map, 12, 8);
    ht.district = 'HARBOR';
    ht.districtComplete = true;
    inland.districts.push({ type: 'HARBOR', tileIndex: ht.index });
    expect(cityMaritime(state, inland.centerIndex, inland)).toBe(true);
  });

  it('a Trader embarks the sea leg and lays no road on water', () => {
    const state = makeState(makeMap(20, 8));
    state.sandbox = true;
    state.unitsMode = true;
    // a one-tile channel splits the map; only a sea leg crosses it
    for (let r = 0; r < 8; r++) tileAtCoords(state.map, 9, r).terrain = 'COAST';
    const origin = foundCity(state, tileAtCoords(state.map, 4, 4).index, 0).city!;
    const across = foundCity(state, tileAtCoords(state.map, 14, 4).index, 0).city!;
    origin.buildings.push('MARKET');
    const s = seatOf(state, 0)!;
    spawnUnit(state, 'TRADER', origin.centerIndex, 0);

    // WITHOUT Celestial Navigation the descent stops at the water and the
    // Trader parks at the origin.
    expect(tradeWalkReachable(state, origin.centerIndex, across.centerIndex, TRADE_WATER_NONE)).toBe(false);
    expect(addTradeRoute(state, origin.id, across.id, 0).ok).toBe(true);
    expect(s.tradeRoutes![0].walkLeg).toBe(-1);

    // WITH it, the same pair walks.
    s.tradeRoutes = [];
    s.research.techs.push('CELESTIAL_NAVIGATION');
    expect(tradeWaterLevel(state, 0)).toBe(TRADE_WATER_COAST);
    expect(tradeWalkReachable(state, origin.centerIndex, across.centerIndex, TRADE_WATER_COAST)).toBe(true);
    spawnUnit(state, 'TRADER', origin.centerIndex, 0);
    expect(addTradeRoute(state, origin.id, across.id, 0).ok).toBe(true);
    const route = s.tradeRoutes![0];
    expect(route.walkLeg).toBe(0);

    // walk it across the channel: the water tile it stands on takes NO road
    let onWater = false;
    for (let i = 0; i < 20 && route.walkTile !== across.centerIndex; i++) {
      seatPhase(state);
      const t = state.map.tiles[route.walkTile!];
      if (isWater(t)) {
        onWater = true;
        expect(t.road).toBeFalsy();
      }
    }
    expect(onWater).toBe(true);
    expect(route.walkTile).toBe(across.centerIndex);
  });
});

describe('the route candidate weighs every destination at once', () => {
  it('an international city competes with a domestic one, it is not a fallback', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    // a two-city seat 0 — a DOMESTIC pair exists, so the old scan would never
    // have looked abroad at all
    const origin = foundCity(state, tileAtCoords(state.map, 6, 6).index, 0).city!;
    const near = foundCity(state, tileAtCoords(state.map, 10, 6).index, 0).city!;
    expandBorders(state, origin, 2);
    expandBorders(state, near, 2);
    origin.buildings.push('MARKET');
    const civ = addCiv(state, 14, 6);

    const cand = routeCandidateRow(state, state.seats[0]);
    expect(cand[0]).toBe(origin.centerIndex);
    // the foreign city pays INTL_ROUTE_GOLD + its districts; the domestic one
    // pays 2 + 2*floor(districts/2), and the higher total takes the route
    const intlSum = INTL_ROUTE_GOLD + specialtyDistricts(state, civ.cities[0]);
    const domSum = 2 + 2 * Math.floor(specialtyDistricts(state, near) / 2);
    expect(cand[1]).toBe(intlSum > domSum ? civ.cities[0].centerIndex : near.centerIndex);
    expect(intlSum).toBeGreaterThan(domSum);
  });

  it('a foreign city out of trade range is no candidate at all', () => {
    const state = makeState(makeMap(40, 24));
    state.sandbox = true;
    const origin = foundCity(state, tileAtCoords(state.map, 2, 6).index, 0).city!;
    const near = foundCity(state, tileAtCoords(state.map, 6, 6).index, 0).city!;
    expandBorders(state, origin, 2);
    expandBorders(state, near, 2);
    origin.buildings.push('MARKET');
    const far = addCiv(state, 38, 20);
    expect(hexDistance(
      state.map.tiles[origin.centerIndex].col, state.map.tiles[origin.centerIndex].row,
      state.map.tiles[far.cities[0].centerIndex].col,
      state.map.tiles[far.cities[0].centerIndex].row)).toBeGreaterThan(TRADE_ROUTE_RANGE_LAND);
    const cand = routeCandidateRow(state, state.seats[0]);
    expect(cand[1]).toBe(near.centerIndex);
  });
});
/** a city-state from the REAL catalog — `suzerainEffect` keys on the name. */
function addNamedCs(state: GameState, name: string, type: CityStateType, col: number, row: number, envoys: Record<number, number> = {}): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cs: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length,
    name,
    type,
    centerIndex: center.index,
    population: 3,
    envoys,
    met: [0, 1],
  };
  setTileOwner(center, seatOfCityState(cs.id));
  state.cityStates.push(cs);
  return cs;
}

describe('trading posts', () => {
  // CIV6 (Trading Post): "created in a city when a civilization finishes a
  // Trade Route to that city for the first time" — and one at home, "in the
  // origin and destination cities".
  it('stampTradingPost keeps the list sorted and append-once', () => {
    const owner = { ...emptySeat(0) };
    stampTradingPost(owner, 40);
    stampTradingPost(owner, 12);
    stampTradingPost(owner, 40);
    stampTradingPost(owner, -1);
    expect(owner.tradingPosts).toEqual([12, 40]);
  });

  it('a route completing its FULL term stamps posts at BOTH endpoints', () => {
    const { state, origin, dest } = twoCitySandbox();
    state.turn = 1;
    addTradeRoute(state, origin.id, dest.id, 0);
    state.seats[0].tradeRoutes![0].walkLeg = -1; // parked: always home
    state.turn = 1 + TRADE_ROUTE_DURATION;
    seatPhase(state);
    expect(state.seats[0].tradeRoutes!.length).toBe(0);
    expect(state.seats[0].tradingPosts).toEqual(
      [origin.centerIndex, dest.centerIndex].sort((a, b) => a - b));
  });

  it('a route cut short (destination gone) stamps nothing', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    const pcity = foundCity(state, tileAtCoords(state.map, 10, 10).index, 0).city!;
    const civ = addCiv(state, 13, 10);
    civ.cities[0].buildings.push('MARKET');
    expect(addIntlTradeRoute(state, civ.cities[0].id, 0, pcity.id, civ.seat).ok).toBe(true);
    state.seats[0].cities = []; // the destination city dies mid-term
    seatPhase(state);
    expect(civ.tradeRoutes!.length).toBe(0);
    expect(civ.tradingPosts ?? []).toEqual([]);
  });

  // CIV6 (Trading Post): "If a Trade Route reaches a city with a Trading
  // Post, it may then continue up to 15 additional tiles to reach another
  // city" — and a civilization "cannot make use of Trading Posts established
  // by other civilizations".
  it('routeInRange chains one leg-range at a time through the seat OWN posts', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    const origin = foundCity(state, tileAtCoords(state.map, 2, 6).index, 0).city!;
    const mid = foundCity(state, tileAtCoords(state.map, 11, 6).index, 0).city!;
    const far = foundCity(state, tileAtCoords(state.map, 20, 6).index, 0).city!;
    origin.buildings.push('MARKET');
    expect(routeInRange(state, 0, origin.centerIndex, far.centerIndex)).toBe(false); // 18 > 15
    expect(canAddTradeRoute(state, origin.id, far.id, 0).ok).toBe(false);
    stampTradingPost(state.seats[0], mid.centerIndex);
    expect(routeInRange(state, 0, origin.centerIndex, far.centerIndex)).toBe(true);
    expect(canAddTradeRoute(state, origin.id, far.id, 0).ok).toBe(true);
    // the chain reads the OWNER's posts alone
    expect(routeInRange(state, 1, origin.centerIndex, far.centerIndex)).toBe(false);
    // a post whose city has died chains nothing
    state.seats[0].cities = state.seats[0].cities.filter((c) => c.id !== mid.id);
    expect(routeInRange(state, 0, origin.centerIndex, far.centerIndex)).toBe(false);
  });

  it('a post at the origin own centre never extends the chain', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    const origin = foundCity(state, tileAtCoords(state.map, 2, 6).index, 0).city!;
    foundCity(state, tileAtCoords(state.map, 20, 6).index, 0);
    stampTradingPost(state.seats[0], origin.centerIndex);
    expect(routeInRange(state, 0, origin.centerIndex,
      tileAtCoords(state.map, 20, 6).index)).toBe(false);
  });

  // CIV6 (Trading Post): "Each foreign Trading Post also adds +1 Gold to the
  // yields of every Trade Route which passes through this city"; Bandar
  // Brunei's suzerain: "+1 Gold to your Trade Routes passing through or
  // going to the city".
  it('routePostGold pays +1 at a posted destination, +1 more under Bandar Brunei', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    const pcity = foundCity(state, tileAtCoords(state.map, 10, 10).index, 0).city!;
    const civ = addCiv(state, 13, 10);
    civ.cities[0].buildings.push('MARKET');
    expect(addIntlTradeRoute(state, civ.cities[0].id, 0, pcity.id, civ.seat).ok).toBe(true);
    const gold = () => cityTradeYields(state, civ.cities[0], 0).gold;
    const bare = gold();
    expect(routePostGold(state, civ.seat, pcity.centerIndex)).toBe(0);
    stampTradingPost(civ, pcity.centerIndex);
    expect(routePostGold(state, civ.seat, pcity.centerIndex)).toBe(1);
    expect(gold()).toBe(bare + 1);
    // seat 0 holds no post there — the post pays its OWNER only
    expect(routePostGold(state, 0, pcity.centerIndex)).toBe(0);
    addNamedCs(state, 'Bandar Brunei', 'trade', 3, 3, { [civ.seat]: 3 });
    expect(routePostGold(state, civ.seat, pcity.centerIndex)).toBe(2);
    expect(gold()).toBe(bare + 2);
  });

  it('routeChain returns the course: first discovery, endpoints excluded, and the commit stores it', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    const origin = foundCity(state, tileAtCoords(state.map, 2, 6).index, 0).city!;
    const mid = foundCity(state, tileAtCoords(state.map, 11, 6).index, 0).city!;
    const mid2 = foundCity(state, tileAtCoords(state.map, 13, 10).index, 0).city!;
    const far = foundCity(state, tileAtCoords(state.map, 20, 6).index, 0).city!;
    origin.buildings.push('MARKET');
    // a direct leg has no course; an unreachable pair has no chain at all
    expect(routeChain(state, 0, origin.centerIndex, mid.centerIndex)).toEqual([]);
    expect(routeChain(state, 0, origin.centerIndex, far.centerIndex)).toBeNull();
    stampTradingPost(state.seats[0], mid.centerIndex);
    stampTradingPost(state.seats[0], mid2.centerIndex);
    // both posts bridge; the FIFO walk over the SORTED list makes the lower
    // centre the first discovery — the course both engines must store
    const lower = Math.min(mid.centerIndex, mid2.centerIndex);
    expect(routeChain(state, 0, origin.centerIndex, far.centerIndex)).toEqual([lower]);
    expect(addTradeRoute(state, origin.id, far.id, 0).ok).toBe(true);
    expect(state.seats[0].tradeRoutes![0].chain).toEqual([lower]);
  });

  it('the course is capped at ROUTE_CHAIN_MAX posts', () => {
    const state = makeState(makeMap(80, 8));
    state.sandbox = true;
    // nine centres in a 9-tile-apart row — a seat holds at most six cities,
    // so rivals own the middle ones; the POSTS are seat 0's regardless
    const a = addCiv(state, 11, 4, { seat: 1 });
    const b = addCiv(state, 65, 4, { seat: 2 });
    const centres: number[] = [];
    for (let k = 0; k <= 8; k++) {
      const x = 2 + 9 * k;
      if (k === 0 || k === 8) centres.push(foundCity(state, tileAtCoords(state.map, x, 4).index, 0).city!.centerIndex);
      else if (k === 1) centres.push(a.cities[0].centerIndex);
      else if (k === 7) centres.push(b.cities[0].centerIndex);
      else centres.push(foundCity(state, tileAtCoords(state.map, x, 4).index, a.seat).city!.centerIndex);
    }
    for (let k = 1; k <= 7; k++) stampTradingPost(state.seats[0], centres[k]);
    // six posts deep is the longest legal course; the seventh hop is refused
    const chain = routeChain(state, 0, centres[0], centres[7]);
    expect(chain).toEqual([1, 2, 3, 4, 5, 6].map((k) => centres[k]));
    expect(chain!.length).toBe(ROUTE_CHAIN_MAX);
    expect(routeChain(state, 0, centres[0], centres[8])).toBeNull();
  });

  it('routeChainGold pays each LIVE chain city: the own post plus the other civs standing there', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    const origin = foundCity(state, tileAtCoords(state.map, 2, 6).index, 0).city!;
    const mid = foundCity(state, tileAtCoords(state.map, 11, 6).index, 0).city!;
    const far = foundCity(state, tileAtCoords(state.map, 20, 6).index, 0).city!;
    origin.buildings.push('MARKET');
    stampTradingPost(state.seats[0], mid.centerIndex);
    expect(addTradeRoute(state, origin.id, far.id, 0).ok).toBe(true);
    const r = state.seats[0].tradeRoutes![0];
    expect(r.chain).toEqual([mid.centerIndex]);
    expect(routeChainGold(state, 0, r)).toBe(1);
    const gold0 = cityTradeYields(state, origin, 0).gold;
    const civ = addCiv(state, 21, 10);
    stampTradingPost(civ, mid.centerIndex); // a rival's post at the SAME chain city
    expect(routeChainGold(state, 0, r)).toBe(2);
    expect(cityTradeYields(state, origin, 0).gold).toBe(gold0 + 1);
    // the chain city dies: its entry pays nothing
    state.seats[0].cities = state.seats[0].cities.filter((c) => c.id !== mid.id);
    expect(routeChainGold(state, 0, r)).toBe(0);
  });

  // CIV6 (Land Acquisition): "+3 Gold per turn from each foreign Trade Route
  // passing through the city" — the stored course is what "passing through"
  // reads; the seat's own routes never count.
  it('Land Acquisition pays +3 per FOREIGN route whose course crosses the city', () => {
    const state = makeState(makeMap(24, 24));
    state.sandbox = true;
    const mine = foundCity(state, tileAtCoords(state.map, 11, 6).index, 0).city!;
    const civ = addCiv(state, 2, 6);
    const rfar = foundCity(state, tileAtCoords(state.map, 20, 6).index, civ.seat).city!;
    civ.cities[0].buildings.push('MARKET');
    stampTradingPost(civ, mine.centerIndex); // the rival's own post at MY centre
    expect(addTradeRoute(state, civ.cities[0].id, rfar.id, civ.seat).ok).toBe(true);
    expect(civ.tradeRoutes![0].chain).toEqual([mine.centerIndex]);
    const bare = computeCityStats(state, mine).breakdown.bonuses.gold;
    // Reyna established at `mine` — Land Acquisition is her BASE ability
    seatOf(state, 0)!.governors = GOVERNORS.map((_, i) => (
      { appointed: i === 0, cityId: i === 0 ? mine.id : -1, minorId: -1, establishTurns: 0, outTurns: 0, promotions: 0 }));
    expect(computeCityStats(state, mine).breakdown.bonuses.gold).toBe(bare + 3);
    // ...and the seat's own route through its own city counts for nothing
    civ.tradeRoutes = [];
    expect(computeCityStats(state, mine).breakdown.bonuses.gold).toBe(bare);
  });
});
describe('wonder route terms', () => {
  it('Colossus grants a Trader at completion', () => {
    expect(BUILT_WONDERS.COLOSSUS.effects?.grantUnit).toBe('TRADER');
  });

  // CIV6 (Great Zimbabwe): "Your Trade Routes from this city get +2 Gold for
  // every Bonus resource within 3 tiles of the city and in this city's
  // territory."
  it('Great Zimbabwe pays +2 per owned bonus resource within 3 on every outgoing route', () => {
    const { state, origin, dest } = twoCitySandbox();
    const wt = tileAtCoords(state.map, 7, 7);
    wt.builtWonder = 'GREAT_ZIMBABWE';
    wt.builtWonderComplete = true;
    origin.wonders.push({ id: 'GREAT_ZIMBABWE', tileIndex: wt.index });
    addTradeRoute(state, origin.id, dest.id, 0);
    expect(wonderRouteOriginGold(state, origin)).toBe(0);
    const bare = cityTradeYields(state, origin, 0).gold;
    tileAtCoords(state.map, 6, 7).resource = 'WHEAT';
    tileAtCoords(state.map, 7, 6).resource = 'DEER';
    tileAtCoords(state.map, 1, 1).resource = 'WHEAT'; // out of range AND territory
    expect(wonderRouteOriginGold(state, origin)).toBe(4);
    expect(cityTradeYields(state, origin, 0).gold).toBe(bare + 4);
    // incomplete wonder: nothing
    wt.builtWonderComplete = false;
    expect(wonderRouteOriginGold(state, origin)).toBe(0);
  });

  // CIV6 (University of Sankore): "+2 Science for every Trade Route to this
  // city. Domestic Trade Routes give an additional +1 Faith to this city."
  // and "Other Civilizations' Trade Routes to this city provide +1 Science
  // and +1 Gold for them."
  it('University of Sankore reads its incoming routes and pays the foreign sender', () => {
    const { state, origin, dest } = twoCitySandbox();
    const wt = tileAtCoords(state.map, 11, 7);
    wt.builtWonder = 'UNIVERSITY_OF_SANKORE';
    wt.builtWonderComplete = true;
    dest.wonders.push({ id: 'UNIVERSITY_OF_SANKORE', tileIndex: wt.index });
    const b0 = computeCityStats(state, dest).breakdown.bonuses;
    addTradeRoute(state, origin.id, dest.id, 0); // one DOMESTIC incoming route
    const b1 = computeCityStats(state, dest).breakdown.bonuses;
    expect(b1.science - b0.science).toBe(2);
    expect(b1.faith - b0.faith).toBe(1);
    // a rival's route to the same city: the SENDER earns +1 science +1 gold
    const civ = addCiv(state, 14, 10);
    civ.cities[0].buildings.push('MARKET');
    expect(addIntlTradeRoute(state, civ.cities[0].id, 0, dest.id, civ.seat).ok).toBe(true);
    const withW = cityTradeYields(state, civ.cities[0], 0);
    const b2 = computeCityStats(state, dest).breakdown.bonuses;
    expect(b2.science - b0.science).toBe(4); // two routes to it now
    expect(b2.faith - b0.faith).toBe(1);     // only one is domestic
    dest.wonders = [];
    const withoutW = cityTradeYields(state, civ.cities[0], 0);
    expect(withW.science - withoutW.science).toBe(1);
    expect(withW.gold - withoutW.gold).toBe(1);
  });
});
