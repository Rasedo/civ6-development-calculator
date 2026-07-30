/**
 * THE SEAT MODEL. One id space for everyone who acts: the player is seat 0,
 * rival r is seat r+1. City-states and barbarians act too, so they get ids
 * ABOVE the civs (`seatOfCityState`, `BARB_SEAT`) rather than being special
 * cases outside the numbering.
 *
 * #51: this module is the wedge for destroying the player/rival asymmetry. It
 * is the single place that answers "who owns this?", so later stages widen the
 * MODEL by changing accessors here instead of re-finding call sites. Everything
 * in it is behaviour-preserving today: the state fields are unchanged
 * (tile.cityId / tile.csId / tile.rivalId, unit.owner + unit.civId) and every
 * accessor reproduces the exact pre-existing field test, including precedence.
 *
 * This module is the single place that answers "who owns this?", so the
 * C1 stages (symmetric rivals → per-seat self-play) can widen the model
 * by changing accessors instead of re-finding call sites. A1 is
 * behavior-preserving: the state fields themselves (tile.cityId /
 * tile.csId / tile.rivalId, unit.owner + unit.civId) are unchanged, the
 * accessors reproduce the exact pre-C1 field tests (including field
 * precedence), and the GPU exporter and all fixtures stay byte-identical.
 */

import type { City, GameState, RivalCity, RivalCiv, Tile, Unit } from './types';
import { RESOURCES } from '../data/resources';

/** The human/agent seat in the unified civ space. */
export const PLAYER_CIV = 0;

/** Rival r's id in the unified civ space. */
export const civOfRival = (rivalId: number): number => rivalId + 1;

/** The rival id behind a (non-player) civ id. */
export const rivalOfCiv = (civ: number): number => civ - 1;

/**
 * Civ owning this tile: PLAYER_CIV, civOfRival(r), or null — unowned or
 * city-state land (city-states hold territory without being civs).
 */
export function tileOwnerCiv(t: Tile): number | null {
  if (t.cityId !== -1) return PLAYER_CIV;
  const r = t.rivalId ?? -1;
  return r !== -1 ? civOfRival(r) : null;
}

/** The rival CIV id claiming this tile, or null (reads only the rival field). */
export function tileRivalCiv(t: Tile): number | null {
  const r = t.rivalId ?? -1;
  return r !== -1 ? civOfRival(r) : null;
}

/**
 * Is this tile claimed by exactly this civ? Reads the civ's OWN field
 * (player → cityId, rival → rivalId) with no precedence assumption, so it
 * is bit-equivalent to the pre-C1 per-field tests.
 */
export function tileOwnedByCiv(t: Tile, civ: number): boolean {
  if (civ === PLAYER_CIV) return t.cityId !== -1;
  return (t.rivalId ?? -1) === rivalOfCiv(civ);
}

/** Any territorial claim at all — a civ's or a city-state's. */
export function tileClaimed(t: Tile): boolean {
  return t.cityId !== -1 || (t.csId ?? -1) !== -1 || (t.rivalId ?? -1) !== -1;
}

/**
 * Claimed by someone other than `civ` (city-states are foreign to every
 * civ). For the player this is exactly the pre-C1 `csId || rivalId` test.
 */
export function tileForeignTo(t: Tile, civ: number): boolean {
  if ((t.csId ?? -1) !== -1) return true;
  if (civ === PLAYER_CIV) return (t.rivalId ?? -1) !== -1;
  const owner = tileOwnerCiv(t);
  return owner !== null && owner !== civ;
}

/**
 * AUDIT B-9: does civ `civ` (unified space: PLAYER_CIV or civOfRival(r)) have
 * ACCESS to a strategic resource? True iff some tile it OWNS carries that
 * resource AND its completed, unpillaged matching improvement (PASTURE on
 * horses, MINE on iron — read from the resource catalog). Improvements are
 * instant in this engine, so `tile.improvement === imp` means built. No
 * stockpile / count / maintenance draw — access is a pure boolean gate on
 * build and purchase. Mirrors the GPU res_id/res_imp/improvement scan.
 */
export function civHasStrategic(state: GameState, civ: number, resourceId: string): boolean {
  const imp = RESOURCES[resourceId]?.improvement;
  if (!imp) return false;
  for (const t of state.map.tiles) {
    if (t.resource !== resourceId || t.pillaged || t.improvement !== imp) continue;
    if (tileOwnedByCiv(t, civ)) return true;
  }
  return false;
}

/** Civ owning this unit: PLAYER_CIV, civOfRival(r), or null (barbarian). */
export function unitCiv(u: Unit): number | null {
  if (u.owner === 'player') return PLAYER_CIV;
  if (u.owner === 'rival') return civOfRival(u.civId ?? 0);
  return null;
}

/** Civ owning this city (absent civId = the player, C1-A2). */
export function cityCiv(c: City): number {
  return c.civId ?? PLAYER_CIV;
}


// ---------------------------------------------------------------------------
// #51/S1.1 — the seat accessors. Every one branches on today's fields exactly
// as today's inline code does; nothing here changes behaviour.
// ---------------------------------------------------------------------------

/** City-states act, so they get seat ids above the civs. */
export const seatOfCityState = (csId: number, rivalCount: number): number => 1 + rivalCount + csId;

/** Barbarians act too. -1 keeps them sortable-last and distinct from every civ. */
export const BARB_SEAT = -1;

/** The seat that owns this unit: 0 player, r+1 rival, BARB_SEAT barbarian. */
export function unitSeat(u: { owner: Unit['owner']; civId?: number }): number {
  if (u.owner === 'player') return PLAYER_CIV;
  if (u.owner === 'rival') return civOfRival(u.civId ?? 0);
  return BARB_SEAT;
}

/** The RivalCiv behind a seat, or undefined for the player/city-states/barbs. */
export function rivalOfSeat(state: GameState, seat: number): RivalCiv | undefined {
  return seat === PLAYER_CIV ? undefined : state.rivals.find((r) => r.id === rivalOfCiv(seat));
}

/** Every city this seat holds. Player cities and rival cities are different
 *  TYPES today (City vs RivalCity), so the union is what callers get until
 *  S1.3 collapses them. */
export function citiesOf(state: GameState, seat: number): (City | RivalCity)[] {
  if (seat === PLAYER_CIV) return state.cities;
  return rivalOfSeat(state, seat)?.cities ?? [];
}

/** Every city in the game, PLAYER FIRST then rivals in id order — reproducing
 *  by construction the `[...state.cities, ...rivals.flatMap(r => r.cities)]`
 *  order the existing scans build by hand. */
export function allCities(state: GameState): (City | RivalCity)[] {
  return [...state.cities, ...state.rivals.flatMap((r) => r.cities)];
}

/** Every unit this seat owns, in state.units order. */
export function unitsOf(state: GameState, seat: number): Unit[] {
  return state.units.filter((u) => unitSeat(u) === seat);
}

/** This seat's capital(s) — a list because a seat can briefly hold none. */
export function caps(state: GameState, seat: number): (City | RivalCity)[] {
  return citiesOf(state, seat).filter((c) => (c as City).isCapital ?? false);
}

/**
 * #51/S1.1: WAR lives in the seat module — it is a property of a PAIR of seats,
 * not of a rival. Moved verbatim from rivals.ts (`civsAtWar`/`setRivalWar`);
 * the three separate stores it reads (the player<->rival boolean, the
 * rival<->rival list) are what S1.2 collapses into one symmetric matrix.
 */
export function civsAtWar(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  // A player pair (one side is civ 0) reads the rival's war-with-player bool.
  if (a === 0 || b === 0) {
    const rivalUnified = a === 0 ? b : a;
    return state.rivals.find((r) => r.id === rivalUnified - 1)?.atWar ?? false;
  }
  // A rival↔rival pair: membership in either side's list (symmetric).
  return state.rivals.find((r) => r.id === a - 1)?.atWarRivals?.includes(b - 1) ?? false;
}

/** Set the war state between unified civs `a` and `b` (both sides written). */
export function setRivalWar(state: GameState, a: number, b: number, on: boolean): void {
  if (a === b) return;
  if (a === 0 || b === 0) {
    // The player pair rides the existing single boolean (both engines).
    const rival = state.rivals.find((r) => r.id === (a === 0 ? b : a) - 1);
    if (rival) rival.atWar = on;
    return;
  }
  const ra = state.rivals.find((r) => r.id === a - 1);
  const rb = state.rivals.find((r) => r.id === b - 1);
  if (!ra || !rb) return;
  const add = (r: RivalCiv, otherRivalId: number) => {
    const list = (r.atWarRivals ??= []);
    if (on) {
      if (!list.includes(otherRivalId)) list.push(otherRivalId);
    } else {
      r.atWarRivals = list.filter((x) => x !== otherRivalId);
    }
  };
  add(ra, b - 1);
  add(rb, a - 1);
}
