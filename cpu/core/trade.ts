/**
 * Trade routes. Domestic routes pay the origin food + production based on
 * the destination's development (Civ 6's domestic-route feel); routes to
 * met city-states pay gold plus the city-state's specialty yield.
 */

import { addYields, emptyYields, type City, type CityState, type GameState, type Yields } from './types';
import { isBarbSeat, seatOf, citiesOf, civsAtWar } from './seats';
import { hexDistance } from '../../world/hex';
import { layTradeRoad } from './units'; // B-23 (#71): Traders lay road
import { DISTRICTS } from '../data/districts';
import { cityStateTradeCapacityBonus, hasMet } from './cityStates';
import { CITY_STATE_TYPE_YIELD } from '../data/cityStates';
import { ENHANCER_BELIEFS } from '../data/religion';
import type { RuleResult } from './rules';

export const TRADE_ROUTE_RANGE = 15;

/** every trade route (domestic, city-state, international) expires this
 * many turns after it starts; the owner re-picks next turn via the existing
 * deterministic pickers (real-ish 21-turn land route trimmed to the model's
 * online pace). Expiry is arithmetic — zero RNG draws. */
export const TRADE_ROUTE_DURATION = 20;

/**
 * Total route capacity for ANY seat: the Foreign Trade civic, Markets and
 * Lighthouses (non-cumulative per city), Colossus/Great Zimbabwe, plus
 * +1 per trade city-state this seat is suzerain of.
 *
 */
export function tradeCapacity(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  let cap = 0;
  if (s?.research.civics.includes('FOREIGN_TRADE')) cap += 1;
  for (const c of citiesOf(state, seat)) {
    if (c.buildings.includes('MARKET') || c.buildings.includes('LIGHTHOUSE')) cap += 1;
    for (const w of c.wonders ?? []) {
      if (!state.map.tiles[w.tileIndex].builtWonderComplete) continue;
      if (w.id === 'COLOSSUS' || w.id === 'GREAT_ZIMBABWE') cap += 1;
    }
  }
  return cap + cityStateTradeCapacityBonus(state, seat);
}

/** Count of completed, limit-counting (specialty) districts in a city — the
 * shared basis for domestic and international route yields. Exported so the
 * scripted/seat pickers score international destinations off the same count. */
export function specialtyDistricts(state: GameState, city: City): number {
  return city.districts.filter(
    (d) => DISTRICTS[d.type].countsTowardLimit && state.map.tiles[d.tileIndex].districtComplete,
  ).length;
}

/** Yields the origin receives from one route to `dest`. */
export function routeYields(state: GameState, dest: City): Yields {
  const out = emptyYields();
  addYields(out, { food: 1, production: 1 }); // city center
  const bonus = Math.floor(specialtyDistricts(state, dest) / 2);
  addYields(out, { food: bonus, production: bonus });
  return out;
}

/** cityStateRouteYields' flat gold / specialty amounts — exported for the GPU
 * rules dump (seat CS routes mirror these exactly). */
export const CITY_STATE_ROUTE_GOLD = 3;
export const CITY_STATE_ROUTE_SPEC = 1;

/** International routes are gold-heavy: +INTL_ROUTE_GOLD base +1 gold per
 * destination completed specialty district. No food/production (that is the
 * domestic-only channel). Exported for the GPU rules dump. */
export const INTL_ROUTE_GOLD = 3;

/** Yields the origin receives from one INTERNATIONAL route to `dest` (a met
 * seat's city, or — from a seat's seat — a seat-0 city). Gold only. */
export function routeYieldsInternational(state: GameState, dest: City): Yields {
  const out = emptyYields();
  out.gold += INTL_ROUTE_GOLD + specialtyDistricts(state, dest);
  return out;
}

/** Yields from one route to a city-state: gold-forward plus its specialty. */
export function cityStateRouteYields(cityState: CityState): Yields {
  const out = emptyYields();
  out.gold += CITY_STATE_ROUTE_GOLD;
  out[CITY_STATE_TYPE_YIELD[cityState.type]] += CITY_STATE_ROUTE_SPEC;
  return out;
}

/**
 * A route is suspended while units HOSTILE TO ITS OWNER prowl within 3 of
 * either endpoint.
 *
 * merged the both seats twins behind a flag, because neither
 * covered CIV-SEAT-vs-CIV-SEAT and turning it on is a behaviour change that Round 2
 * was forbidden to make. #51/S7.1 is Round 7, and turns it on: the flag
 * ONE predicate — "is this unit hostile to the route's owner" — answers for
 * every seat pair. A seat at war with another interdicts its trade, which is
 * how war works in Civ 6.
 */
export function routeRaidedAt(state: GameState, endpoints: number[], seat: number): boolean {
  if (!state.unitsMode) return false;
  for (const u of state.units) {
    const hostile = isBarbSeat(u.seat) || (u.seat !== seat && civsAtWar(state, u.seat, seat));
    if (!hostile) continue;
    const t = state.map.tiles[u.tileIndex];
    for (const index of endpoints) {
      const c = state.map.tiles[index];
      if (hexDistance(t.col, t.row, c.col, c.row) <= 3) return true;
    }
  }
  return false;
}

export function routeRaided(state: GameState, from: City, to: City, seat: number): boolean {
  return routeRaidedAt(state, [from.centerIndex, to.centerIndex], seat);
}

/** All trade income for a city (sum of its outgoing, unraided routes).
 *  Routes live on the OWNING seat (`Seat.tradeRoutes`) — city ids are
 *  per-seat, so reading any other seat's list would collide. */
export function cityTradeYields(state: GameState, city: City): Yields {
  const seat = city.seat;
  const out = emptyYields();
  for (const route of seatOf(state, seat)?.tradeRoutes ?? []) {
    if (route.from !== city.id) continue;
    if (route.toCs !== undefined) {
      const cityState = state.cityStates.find((c) => c.id === route.toCs);
      if (cityState && !routeRaidedAt(state, [city.centerIndex, cityState.centerIndex], seat)) {
        addYields(out, cityStateRouteYields(cityState));
      }
      continue;
    }
    if (route.toSeat !== undefined) {
      // international: a route to another major seat's city — gold only.
      // Suspended while at war with that seat (destination-civ interdiction)
      // or while hostiles prowl either endpoint. `toSeat` is the ABSOLUTE
      // seat id, the one encoding every store uses.
      const civSeat = seatOf(state, route.toSeat);
      const civCity = civSeat?.cities.find((c) => c.id === route.toSeatCity);
      if (civSeat && civCity && !civsAtWar(state, civSeat.seat, seat) && !routeRaidedAt(state, [city.centerIndex, civCity.centerIndex], seat)) {
        addYields(out, routeYieldsInternational(state, civCity));
      }
      continue;
    }
    const dest = seatOf(state, seat)!.cities.find((c) => c.id === route.to);
    if (dest && !routeRaided(state, city, dest, seat)) {
      addYields(out, routeYields(state, dest));
      // Extra yields when the destination city follows the OWNER's
      // religion (religion ids are seat ids) — the enhancer belief's rule.
      const relT = seatOf(state, seat)!.religion;
      if (relT?.founded && relT.enhancer && dest.followedReligion === seat) {
        const tr = ENHANCER_BELIEFS[relT.enhancer]?.effects.tradeReligionYields;
        if (tr) addYields(out, tr);
      }
    }
  }
  return out;
}

export function canAddTradeRoute(state: GameState, from: number, to: number, seat: number): RuleResult {
  if (from === to) return { ok: false, reason: 'Origin and destination must differ.' };
  const a = seatOf(state, seat)!.cities.find((c) => c.id === from);
  const b = seatOf(state, seat)!.cities.find((c) => c.id === to);
  if (!a || !b) return { ok: false, reason: 'No such city.' };
  const routes = seatOf(state, seat)!.tradeRoutes ?? [];
  if (routes.length >= tradeCapacity(state, seat)) {
    return { ok: false, reason: `No spare trading capacity (${tradeCapacity(state, seat)} in use).` };
  }
  if (routes.some((r) => r.from === from && r.to === to)) {
    return { ok: false, reason: 'That route already runs.' };
  }
  const ta = state.map.tiles[a.centerIndex];
  const tb = state.map.tiles[b.centerIndex];
  if (hexDistance(ta.col, ta.row, tb.col, tb.row) > TRADE_ROUTE_RANGE) {
    return { ok: false, reason: `Beyond trade range (${TRADE_ROUTE_RANGE} tiles).` };
  }
  return { ok: true };
}

export function addTradeRoute(state: GameState, from: number, to: number, seat: number): RuleResult {
  const check = canAddTradeRoute(state, from, to, seat);
  if (!check.ok) return check;
  (seatOf(state, seat)!.tradeRoutes ??= []).push({ from, to, expiresTurn: state.turn + TRADE_ROUTE_DURATION });
  // The route's Trader lays road along its land path.
  layRouteRoad(state, from, seatOf(state, seat)!.cities.find((c) => c.id === to)?.centerIndex ?? -1, seat);
  return { ok: true };
}

/** lay the route's road between two CENTER tiles (either endpoint
 *  missing = nothing to walk). Kept here so all four creation sites — the three
 *  seat-0 verbs and the seat pick — call ONE thing. */
export function layRouteRoad(state: GameState, fromCityId: number, toCenterIndex: number, seat: number): void {
  const a = seatOf(state, seat)!.cities.find((c) => c.id === fromCityId);
  if (!a || toCenterIndex < 0) return;
  layTradeRoad(state, a.centerIndex, toCenterIndex);
}

export function canAddCsTradeRoute(state: GameState, from: number, cityStateId: number, seat: number): RuleResult {
  const a = seatOf(state, seat)!.cities.find((c) => c.id === from);
  const cityState = state.cityStates.find((c) => c.id === cityStateId);
  if (!a || !cityState) return { ok: false, reason: 'No such city / city-state.' };
  if (!hasMet(cityState, seat)) return { ok: false, reason: 'You have not met this city-state yet.' };
  const routes = seatOf(state, seat)!.tradeRoutes ?? [];
  if (routes.length >= tradeCapacity(state, seat)) {
    return { ok: false, reason: `No spare trading capacity (${tradeCapacity(state, seat)} in use).` };
  }
  if (routes.some((r) => r.from === from && r.toCs === cityStateId)) {
    return { ok: false, reason: 'That route already runs.' };
  }
  const ta = state.map.tiles[a.centerIndex];
  const tb = state.map.tiles[cityState.centerIndex];
  if (hexDistance(ta.col, ta.row, tb.col, tb.row) > TRADE_ROUTE_RANGE) {
    return { ok: false, reason: `Beyond trade range (${TRADE_ROUTE_RANGE} tiles).` };
  }
  return { ok: true };
}

export function addCsTradeRoute(state: GameState, from: number, cityStateId: number, seat: number): RuleResult {
  const check = canAddCsTradeRoute(state, from, cityStateId, seat);
  if (!check.ok) return check;
  (seatOf(state, seat)!.tradeRoutes ??= []).push({ from, to: -1, toCs: cityStateId, expiresTurn: state.turn + TRADE_ROUTE_DURATION });
  layRouteRoad(state, from, state.cityStates.find((c) => c.id === cityStateId)?.centerIndex ?? -1, seat); // B-23 (#71)
  return { ok: true };
}

/** International: can `seat` route from its own city `from` to major
 * `toSeat`'s city `seatCity`? Both ends are ABSOLUTE seats — the `toSeat`
 * field this writes has always stored one. */
export function canAddIntlTradeRoute(state: GameState, from: number, toSeat: number, seatCity: number, seat: number): RuleResult {
  const a = seatOf(state, seat)!.cities.find((c) => c.id === from);
  const civSeat = seatOf(state, toSeat);
  const civCity = civSeat?.cities.find((c) => c.id === seatCity);
  if (!a || !civSeat || !civCity) return { ok: false, reason: 'No such city / actor city.' };
  const routes = seatOf(state, seat)!.tradeRoutes ?? [];
  if (routes.length >= tradeCapacity(state, seat)) {
    return { ok: false, reason: `No spare trading capacity (${tradeCapacity(state, seat)} in use).` };
  }
  if (routes.some((r) => r.from === from && r.toSeat === toSeat && r.toSeatCity === seatCity)) {
    return { ok: false, reason: 'That route already runs.' };
  }
  const ta = state.map.tiles[a.centerIndex];
  const tb = state.map.tiles[civCity.centerIndex];
  if (hexDistance(ta.col, ta.row, tb.col, tb.row) > TRADE_ROUTE_RANGE) {
    return { ok: false, reason: `Beyond trade range (${TRADE_ROUTE_RANGE} tiles).` };
  }
  return { ok: true };
}

export function addIntlTradeRoute(state: GameState, from: number, toSeat: number, seatCity: number, seat: number): RuleResult {
  const check = canAddIntlTradeRoute(state, from, toSeat, seatCity, seat);
  if (!check.ok) return check;
  (seatOf(state, seat)!.tradeRoutes ??= []).push({ from, to: -1, toSeat, toSeatCity: seatCity, expiresTurn: state.turn + TRADE_ROUTE_DURATION });
  layRouteRoad(
    state,
    from,
    seatOf(state, toSeat)?.cities.find((c) => c.id === seatCity)?.centerIndex ?? -1,
    seat,
  );
  return { ok: true };
}

