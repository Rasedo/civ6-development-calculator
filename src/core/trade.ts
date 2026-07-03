/**
 * Trade routes (domestic only — you're alone in the world). The origin city
 * receives food + production based on the destination's development, roughly
 * following Civ 6's domestic-route feel.
 */

import { addYields, emptyYields, type City, type CityState, type GameState, type Yields } from './types';
import { hexDistance } from './hex';
import { isCivicComplete } from './effects';
import { DISTRICTS } from '../data/districts';
import { csTradeCapacityBonus } from './cityStates';
import { CS_TYPE_YIELD } from '../data/cityStates';
import type { RuleResult } from './rules';

export const TRADE_ROUTE_RANGE = 15;

/** Total route capacity: Foreign Trade civic, Markets, Lighthouses, wonders,
 * plus +1 per trade city-state you are suzerain of. */
export function tradeCapacity(state: GameState): number {
  let cap = 0;
  if (isCivicComplete(state, 'FOREIGN_TRADE')) cap += 1;
  for (const c of state.cities) {
    if (c.buildings.includes('MARKET')) cap += 1;
    if (c.buildings.includes('LIGHTHOUSE')) cap += 1;
    for (const w of c.wonders) {
      if (!state.map.tiles[w.tileIndex].builtWonderComplete) continue;
      if (w.id === 'COLOSSUS' || w.id === 'GREAT_ZIMBABWE') cap += 1;
    }
  }
  return cap + csTradeCapacityBonus(state);
}

function specialtyDistricts(state: GameState, city: City): number {
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

/** Yields from one route to a city-state: gold-forward plus its specialty. */
export function csRouteYields(cs: CityState): Yields {
  const out = emptyYields();
  out.gold += 3;
  out[CS_TYPE_YIELD[cs.type]] += 1;
  return out;
}

/** A route is suspended while barbarians prowl near either endpoint. */
export function routeRaidedAt(state: GameState, endpoints: number[]): boolean {
  if (!state.unitsMode) return false;
  for (const u of state.units) {
    if (u.owner !== 'barbarian') continue;
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
    const dest = state.cities.find((c) => c.id === route.to);
    if (dest && !routeRaided(state, city, dest)) addYields(out, routeYields(state, dest));
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
  state.tradeRoutes.push({ from, to });
  return { ok: true };
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
  state.tradeRoutes.push({ from, to: -1, toCs: csId });
  return { ok: true };
}

export function removeTradeRoute(state: GameState, index: number): void {
  state.tradeRoutes.splice(index, 1);
}

/** Drop routes that exceed capacity (e.g. after loading an edited save). */
export function enforceTradeCapacity(state: GameState): void {
  const cap = tradeCapacity(state);
  if (state.tradeRoutes.length > cap) state.tradeRoutes.length = cap;
}
