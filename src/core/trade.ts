/**
 * Trade routes. Domestic routes pay the origin food + production based on
 * the destination's development (Civ 6's domestic-route feel); routes to
 * met city-states pay gold plus the city-state's specialty yield.
 */

import { addYields, emptyYields, type City, type CityState, type GameState, type RivalCiv, type Yields } from './types';
import { playerSeat } from './seats';
import { hexDistance } from './hex';
import { layTradeRoad } from './units'; // B-23 (#71): Traders lay road
import { isCivicComplete } from './effects';
import { DISTRICTS } from '../data/districts';
import { csTradeCapacityBonus, rivalIsSuzerain } from './cityStates';
import { CS_TYPE_YIELD } from '../data/cityStates';
import { ENHANCER_BELIEFS } from '../data/religion';
import type { RuleResult } from './rules';

export const TRADE_ROUTE_RANGE = 15;

/** B-23: every trade route (domestic, city-state, international) expires this
 * many turns after it starts; the owner re-picks next turn via the existing
 * deterministic pickers (real-ish 21-turn land route trimmed to the model's
 * online pace). Expiry is arithmetic — zero RNG draws. */
export const TRADE_ROUTE_DURATION = 20;

/** Total route capacity: Foreign Trade civic, Markets, Lighthouses, wonders,
 * plus +1 per trade city-state you are suzerain of. */
export function tradeCapacity(state: GameState): number {
  let cap = 0;
  if (isCivicComplete(state, 'FOREIGN_TRADE')) cap += 1;
  for (const c of state.cities) {
    // P4/D-7: real Civ 6 — a city with BOTH a Market and a Lighthouse
    // still grants only +1 capacity (non-cumulative per city).
    if (c.buildings.includes('MARKET') || c.buildings.includes('LIGHTHOUSE')) cap += 1;
    for (const w of c.wonders) {
      if (!state.map.tiles[w.tileIndex].builtWonderComplete) continue;
      if (w.id === 'COLOSSUS' || w.id === 'GREAT_ZIMBABWE') cap += 1;
    }
  }
  return cap + csTradeCapacityBonus(state);
}

/** AUDIT A-11/A-12b: the rival twin of tradeCapacity, off the rival's OWN
 * structures — FOREIGN_TRADE from its civic tree, Market/Lighthouse per
 * city (non-cumulative, the D-7 rule), Colossus/Great Zimbabwe, plus +1
 * per trade city-state this rival is suzerain of (the csTradeCapacityBonus
 * twin on the rival seat's strict-contest suzerainty). */
export function rivalTradeCapacity(state: GameState, rival: RivalCiv): number {
  let cap = 0;
  if (rival.research.civics.includes('FOREIGN_TRADE')) cap += 1;
  for (const rc of rival.cities) {
    if (rc.buildings.includes('MARKET') || rc.buildings.includes('LIGHTHOUSE')) cap += 1;
    for (const w of rc.wonders ?? []) {
      if (!state.map.tiles[w.tileIndex].builtWonderComplete) continue;
      if (w.id === 'COLOSSUS' || w.id === 'GREAT_ZIMBABWE') cap += 1;
    }
  }
  for (const cs of state.cityStates) {
    if (cs.type === 'trade' && rivalIsSuzerain(cs, rival.id)) cap += 1;
  }
  return cap;
}

/** AUDIT A-11: a rival route is suspended while units HOSTILE TO THAT
 * RIVAL prowl within 3 of either endpoint — barbarians always, player
 * units while at war (rival-rival war is impossible until A-19). The
 * routeRaidedAt twin from the rival's seat. */
export function rivalRouteRaidedAt(state: GameState, rival: RivalCiv, endpoints: number[]): boolean {
  if (!state.unitsMode) return false;
  for (const u of state.units) {
    const hostile = u.owner === 'barbarian' || (u.owner === 'player' && rival.atWar);
    if (!hostile) continue;
    const t = state.map.tiles[u.tileIndex];
    for (const index of endpoints) {
      const c = state.map.tiles[index];
      if (hexDistance(t.col, t.row, c.col, c.row) <= 3) return true;
    }
  }
  return false;
}

/** Count of completed, limit-counting (specialty) districts in a city — the
 * shared basis for domestic and international route yields. Exported so the
 * scripted/rival pickers score international destinations off the same count. */
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

/** csRouteYields' flat gold / specialty amounts — exported for the GPU
 * rules dump (A-12b: rival CS routes mirror these exactly). */
export const CS_ROUTE_GOLD = 3;
export const CS_ROUTE_SPEC = 1;

/** B-23 international routes are gold-heavy: +INTL_ROUTE_GOLD base +1 gold per
 * destination completed specialty district. No food/production (that is the
 * domestic-only channel). Exported for the GPU rules dump. */
export const INTL_ROUTE_GOLD = 3;

/** Yields the origin receives from one INTERNATIONAL route to `dest` (a met
 * rival's city, or — from a rival's seat — a player city). Gold only. */
export function routeYieldsInternational(state: GameState, dest: City): Yields {
  const out = emptyYields();
  out.gold += INTL_ROUTE_GOLD + specialtyDistricts(state, dest);
  return out;
}

/** Yields from one route to a city-state: gold-forward plus its specialty. */
export function csRouteYields(cs: CityState): Yields {
  const out = emptyYields();
  out.gold += CS_ROUTE_GOLD;
  out[CS_TYPE_YIELD[cs.type]] += CS_ROUTE_SPEC;
  return out;
}

/** A route is suspended while hostiles prowl near either endpoint —
 * barbarians always, and (A-11) AT-WAR rival units: the audit-named
 * one-sidedness fix (rivals interdict player trade like barbs do). */
export function routeRaidedAt(state: GameState, endpoints: number[]): boolean {
  if (!state.unitsMode) return false;
  for (const u of state.units) {
    const hostile =
      u.owner === 'barbarian' ||
      (u.owner === 'rival' && (state.rivals.find((r) => r.id === u.civId)?.atWar ?? false));
    if (!hostile) continue;
    const t = state.map.tiles[u.tileIndex];
    for (const index of endpoints) {
      const c = state.map.tiles[index];
      if (hexDistance(t.col, t.row, c.col, c.row) <= 3) return true;
    }
  }
  return false;
}

export function routeRaided(state: GameState, from: City, to: City): boolean {
  return routeRaidedAt(state, [from.centerIndex, to.centerIndex]);
}

/** All trade income for a city (sum of its outgoing, unraided routes). */
export function cityTradeYields(state: GameState, city: City): Yields {
  const out = emptyYields();
  for (const route of state.tradeRoutes) {
    if (route.from !== city.id) continue;
    if (route.toCs !== undefined) {
      const cs = state.cityStates.find((c) => c.id === route.toCs);
      if (cs && !routeRaidedAt(state, [city.centerIndex, cs.centerIndex])) {
        addYields(out, csRouteYields(cs));
      }
      continue;
    }
    if (route.toRivalCiv !== undefined) {
      // B-23 international: a player route to a met rival's city — gold only.
      // Suspended while at war with that rival (destination-civ interdiction)
      // or while hostiles prowl either endpoint.
      const rv = state.rivals.find((r) => r.id === route.toRivalCiv);
      const rc = rv?.cities.find((c) => c.id === route.toRivalCity);
      if (rv && rc && !rv.atWar && !routeRaidedAt(state, [city.centerIndex, rc.centerIndex])) {
        addYields(out, routeYieldsInternational(state, rc));
      }
      continue;
    }
    const dest = state.cities.find((c) => c.id === route.to);
    if (dest && !routeRaided(state, city, dest)) {
      addYields(out, routeYields(state, dest));
      // B6-S1 (Messenger of the Gods): extra yields when the destination city
      // follows the player's religion (religion id 0) — the rival twin's rule.
      const relT = playerSeat(state).religion;
      if (relT?.founded && relT.enhancer && dest.followedReligion === 0) {
        const tr = ENHANCER_BELIEFS[relT.enhancer]?.effects.tradeReligionYields;
        if (tr) addYields(out, tr);
      }
    }
  }
  return out;
}

export function canAddTradeRoute(state: GameState, from: number, to: number): RuleResult {
  if (from === to) return { ok: false, reason: 'Origin and destination must differ.' };
  const a = state.cities.find((c) => c.id === from);
  const b = state.cities.find((c) => c.id === to);
  if (!a || !b) return { ok: false, reason: 'No such city.' };
  if (state.tradeRoutes.length >= tradeCapacity(state)) {
    return { ok: false, reason: `No spare trading capacity (${tradeCapacity(state)} in use).` };
  }
  if (state.tradeRoutes.some((r) => r.from === from && r.to === to)) {
    return { ok: false, reason: 'That route already runs.' };
  }
  const ta = state.map.tiles[a.centerIndex];
  const tb = state.map.tiles[b.centerIndex];
  if (hexDistance(ta.col, ta.row, tb.col, tb.row) > TRADE_ROUTE_RANGE) {
    return { ok: false, reason: `Beyond trade range (${TRADE_ROUTE_RANGE} tiles).` };
  }
  return { ok: true };
}

export function addTradeRoute(state: GameState, from: number, to: number): RuleResult {
  const check = canAddTradeRoute(state, from, to);
  if (!check.ok) return check;
  state.tradeRoutes.push({ from, to, expiresTurn: state.turn + TRADE_ROUTE_DURATION });
  // B-23 (#71): the route's Trader lays road along its land path.
  layRouteRoad(state, from, state.cities.find((c) => c.id === to)?.centerIndex ?? -1);
  return { ok: true };
}

/** B-23 (#71): lay the route's road between two CENTER tiles (either endpoint
 *  missing = nothing to walk). Kept here so all four creation sites — the three
 *  player verbs and the rival pick — call ONE thing. */
export function layRouteRoad(state: GameState, fromCityId: number, toCenterIndex: number): void {
  const a = state.cities.find((c) => c.id === fromCityId);
  if (!a || toCenterIndex < 0) return;
  layTradeRoad(state, a.centerIndex, toCenterIndex);
}

export function canAddCsTradeRoute(state: GameState, from: number, csId: number): RuleResult {
  const a = state.cities.find((c) => c.id === from);
  const cs = state.cityStates.find((c) => c.id === csId);
  if (!a || !cs) return { ok: false, reason: 'No such city / city-state.' };
  if (!cs.met) return { ok: false, reason: 'You have not met this city-state yet.' };
  if (state.tradeRoutes.length >= tradeCapacity(state)) {
    return { ok: false, reason: `No spare trading capacity (${tradeCapacity(state)} in use).` };
  }
  if (state.tradeRoutes.some((r) => r.from === from && r.toCs === csId)) {
    return { ok: false, reason: 'That route already runs.' };
  }
  const ta = state.map.tiles[a.centerIndex];
  const tb = state.map.tiles[cs.centerIndex];
  if (hexDistance(ta.col, ta.row, tb.col, tb.row) > TRADE_ROUTE_RANGE) {
    return { ok: false, reason: `Beyond trade range (${TRADE_ROUTE_RANGE} tiles).` };
  }
  return { ok: true };
}

export function addCsTradeRoute(state: GameState, from: number, csId: number): RuleResult {
  const check = canAddCsTradeRoute(state, from, csId);
  if (!check.ok) return check;
  state.tradeRoutes.push({ from, to: -1, toCs: csId, expiresTurn: state.turn + TRADE_ROUTE_DURATION });
  layRouteRoad(state, from, state.cityStates.find((c) => c.id === csId)?.centerIndex ?? -1); // B-23 (#71)
  return { ok: true };
}

/** B-23 international: can the player route from own city `from` to met rival
 * civ `rivalCiv`'s city `rivalCity`? */
export function canAddIntlTradeRoute(state: GameState, from: number, rivalCiv: number, rivalCity: number): RuleResult {
  const a = state.cities.find((c) => c.id === from);
  const rv = state.rivals.find((r) => r.id === rivalCiv);
  const rc = rv?.cities.find((c) => c.id === rivalCity);
  if (!a || !rv || !rc) return { ok: false, reason: 'No such city / rival city.' };
  if (state.tradeRoutes.length >= tradeCapacity(state)) {
    return { ok: false, reason: `No spare trading capacity (${tradeCapacity(state)} in use).` };
  }
  if (state.tradeRoutes.some((r) => r.from === from && r.toRivalCiv === rivalCiv && r.toRivalCity === rivalCity)) {
    return { ok: false, reason: 'That route already runs.' };
  }
  const ta = state.map.tiles[a.centerIndex];
  const tb = state.map.tiles[rc.centerIndex];
  if (hexDistance(ta.col, ta.row, tb.col, tb.row) > TRADE_ROUTE_RANGE) {
    return { ok: false, reason: `Beyond trade range (${TRADE_ROUTE_RANGE} tiles).` };
  }
  return { ok: true };
}

export function addIntlTradeRoute(state: GameState, from: number, rivalCiv: number, rivalCity: number): RuleResult {
  const check = canAddIntlTradeRoute(state, from, rivalCiv, rivalCity);
  if (!check.ok) return check;
  state.tradeRoutes.push({ from, to: -1, toRivalCiv: rivalCiv, toRivalCity: rivalCity, expiresTurn: state.turn + TRADE_ROUTE_DURATION });
  layRouteRoad(
    state,
    from,
    state.rivals.find((r) => r.id === rivalCiv)?.cities.find((c) => c.id === rivalCity)?.centerIndex ?? -1,
  ); // B-23 (#71)
  return { ok: true };
}

/** B-23 duration: drop the player's routes whose expiresTurn has arrived; the
 * owner re-picks next turn. Called from endTurn AFTER the turn's production so
 * a route freed this turn is re-pickable next turn (zero draws). */
export function expirePlayerRoutes(state: GameState): void {
  state.tradeRoutes = state.tradeRoutes.filter(
    (r) => r.expiresTurn === undefined || r.expiresTurn > state.turn,
  );
}

export function removeTradeRoute(state: GameState, index: number): void {
  state.tradeRoutes.splice(index, 1);
}

/** Drop routes that exceed capacity (e.g. after loading an edited save). */
export function enforceTradeCapacity(state: GameState): void {
  const cap = tradeCapacity(state);
  if (state.tradeRoutes.length > cap) state.tradeRoutes.length = cap;
}
