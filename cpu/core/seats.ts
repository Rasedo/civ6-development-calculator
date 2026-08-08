/**
 * THE SEAT MODEL. One id space for everyone who acts.
 *
 * Seats 0..R are the major civs; seat 0 is not special, it is simply the seat
 * the decision server drives first. City-states and barbarians act too, so they
 * get ids ABOVE the civs (`seatOfCityState`, `BARB_SEAT`) rather than living
 * outside the numbering as special cases.
 *
 * This module answers "who owns this?" in exactly one place, so a rule is
 * written once and asked per seat. Every accessor takes a SEAT and returns that
 * seat's answer; none of them branches on which seat is asking.
 */

import type { City, GameState, Seat, Tile, Unit } from './types';
import type { SeatCaps, SeatClass } from '../data/seats';
import { SEAT_CAPS } from '../data/seats';
import { RESOURCES } from '../../world/resources';
import { GREAT_PEOPLE } from '../data/greatPeople';

/**
 * ONE ABSOLUTE SEAT SPACE.
 *
 *      -1  unowned / nobody          (NO_SEAT)
 *    0..99 the major civs            (seat 0 is one of them)
 * 100..199 city-states               (seatOfCityState)
 *      200 barbarians                (BARB_SEAT)
 *
 * Every id is ABSOLUTE — none depends on how many civs are in the game, so a
 * seat id is safe to persist in tile ownership. `-1` means exactly one thing:
 * NOBODY.
 */
import { NO_SEAT } from './types';
export { NO_SEAT };
const CS_SEAT_BASE = 100;
export const BARB_SEAT = 200;

export const seatOfCityState = (csId: number): number => CS_SEAT_BASE + csId;
export const cityStateOfSeat = (seat: number): number => seat - CS_SEAT_BASE;

/**
 * Converts a 0-based civ index to a seat id, and back.
 *
 * A second numbering survives alongside the seat space: the per-civ PARALLEL
 * ARRAYS (`CityState.seatEnvoys`, `seatMet`, `seatQuest`) and the trace's
 * per-seat blocks are indexed 0-based, excluding seat 0. These two functions
 * are the only sanctioned crossing between the numberings — a bare `+1`/`-1`
 * on a seat id is a bug.
 */
export const seatOfIndex = (index: number): number => index + 1;
export const indexOfSeat = (seat: number): number => seat - 1;

/** The seat that owns this tile, or NO_SEAT. */
export function tileSeat(t: Tile): number {
  return t.ownerSeat;
}

/**
 * Give this tile to `seat`, and for a civ to one of its cities. `NO_SEAT`
 * releases it. The ONE writer of tile ownership: owner and owning-city move
 * together, so the pair can never disagree.
 */
export function setTileOwner(t: Tile, seat: number, city = -1): void {
  t.ownerSeat = seat;
  t.ownerCity = isCityStateSeat(seat) || seat === NO_SEAT ? -1 : city;
}

/** The CITY (within its seat) that works this tile, or -1. */
export function tileCity(t: Tile): number {
  return t.ownerCity;
}

/** Does this tile belong to THIS city? Matches both seat and city id. */
export function tileBelongsTo(t: Tile, city: { seat: number; id: number }): boolean {
  return tileSeat(t) === city.seat && tileCity(t) === city.id;
}

/**
 * The CITY that owns this tile, whichever seat holds it. Undefined when the
 * tile is unowned or held by a city-state.
 */
export function cityAtTile(state: GameState, t: Tile): City | undefined {
  const seat = tileSeat(t);
  if (seat === NO_SEAT || isCityStateSeat(seat)) return undefined;
  const id = tileCity(t);
  return citiesOf(state, seat).find((c) => c.id === id);
}

/** Is this tile claimed by exactly this civ? */
export function tileOwnedByCiv(t: Tile, civ: number): boolean {
  return tileSeat(t) === civ;
}

/** Any territorial claim at all — a civ's or a city-state's. */
export function tileClaimed(t: Tile): boolean {
  return tileSeat(t) !== NO_SEAT;
}

/** Claimed by someone other than `civ`. City-states are foreign to every civ. */
export function tileForeignTo(t: Tile, civ: number): boolean {
  const s = tileSeat(t);
  return s !== NO_SEAT && s !== civ;
}

/**
 * Does this seat have ACCESS to a strategic resource? True iff some tile it
 * OWNS carries that resource AND its completed, unpillaged matching improvement
 * (PASTURE on horses, MINE on iron — read from the resource catalog).
 * Improvements are instant here, so `tile.improvement === imp` means built.
 *
 * No stockpile, count or maintenance draw: access is a pure boolean gate on
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

/** How many PROPHET-class great people this seat recruited, from its own
 *  `gpEarned`, so every seat can answer it. */
export function prophetsOf(seat: Seat): number {
  return seat.gpEarned.filter((id) => GREAT_PEOPLE.PROPHET.some((p) => p.id === id)).length;
}

/**
 * An EMPTY seat — every field of `Seat` at its zero.
 *
 * The ONE constructor, shared by a civ, a city-state and the barbarians. A
 * field added to `Seat` therefore has exactly one place that can forget it, and
 * `tests/cpu/seat-total.test.ts` asserts this covers the whole interface.
 */
export function emptySeat(seat: number): Seat {
  return {
    seat,
    cities: [], nextCityId: 0,
    name: '', color: '', aggression: 0,
    warmonger: 0, ww: {}, wwTurn: {}, diplomaticFavor: 0, diplomaticPoints: 0,
    wars: [], formalWars: [], denounced: {}, allies: [],
    influencePoints: 0, envoysAvailable: 0,
    warTurns: 0, peaceTurns: 0,
    treasury: 0, scienceTotal: 0, cultureTotal: 0, faith: 0, tourism: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    government: { current: null, policies: [] },
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    gpp: {}, gpEarned: [],
    buildersTrained: 0, bestMeleeCS: 0, tilesPurchased: 0,
    spaceProjects: [], camps: [], explored: [],
  };
}

/**
 * The seat record for ANY seat id — civ, city-state or barbarian. TOTAL over
 * the whole seat space: the three storages differ, the answer does not, so a
 * rule written against `Seat` runs for every actor.
 */
export function seatOf(state: GameState, seat: number): Seat | undefined {
  // BY ID, not by array position: conquering a city-state removes it from
  // `state.cityStates`, and every survivor after it would otherwise answer as
  // its neighbour. The roster is a handful of entries, so the scan is free.
  if (isCityStateSeat(seat)) {
    const id = cityStateOfSeat(seat);
    return state.cityStates?.find((c) => c.id === id);
  }
  if (isBarbSeat(seat)) return state.barbSeat;
  return state.seats[seat];
}

/**
 * Every actor in the game in SEAT ORDER: the civs, then the city-states, then
 * the barbarians. That is seat-id order, the same order the GPU's `_seat_row`
 * uses, so "walk every seat" means the same sequence on both engines.
 */
export function allSeats(state: GameState): Seat[] {
  return [...state.seats, ...(state.cityStates ?? []), ...(state.barbSeat ? [state.barbSeat] : [])];
}

/** Is this a barbarian? They act but hold no territory, research or diplomacy. */
export const isBarbSeat = (seat: number): boolean => seat === BARB_SEAT;

/** A MAJOR CIV — the seats that settle, research, trade and fight wars.
 *  City-states and barbarians sit above this range. */
export const isCiv = (seat: number): boolean => seat >= 0 && seat < CS_SEAT_BASE;

/** Is this a city-state? They hold territory and act, but are never civs. */
export const isCityStateSeat = (seat: number): boolean => seat >= CS_SEAT_BASE && seat < BARB_SEAT;

/**
 * Which KIND of actor this seat is. The absolute seat space already encodes it,
 * so this reads the id rather than storing a duplicate. `NO_SEAT` is not an
 * actor and never reaches here.
 */
export function seatClass(seat: number): SeatClass {
  if (isBarbSeat(seat)) return 'hostile';
  if (isCityStateSeat(seat)) return 'minor';
  return 'major';
}

/**
 * What this seat MAY do — the capability table lives in data/seats.ts.
 *
 * Ask this, never `isBarbSeat`, when the question is a RULE ("do its units
 * promote?"). Ask `isBarbSeat` when the question is IDENTITY ("whose units are
 * these?"). Conflating the two spells one rule several different ways.
 */
export function capsOf(seat: number): SeatCaps {
  return SEAT_CAPS[seatClass(seat)];
}

/** The seat that owns this unit. */
export function unitSeat(u: { seat: number }): number {
  return u.seat;
}

/** Every city this seat holds. */
export function citiesOf(state: GameState, seat: number): City[] {
  return seatOf(state, seat)?.cities ?? [];
}

/** Every city in the game, in SEAT ORDER. */
export function allCities(state: GameState): City[] {
  return state.seats.flatMap((s) => s.cities);
}

/** Every unit this seat owns, in state.units order. */
export function unitsOf(state: GameState, seat: number): Unit[] {
  return state.units.filter((u) => unitSeat(u) === seat);
}

/**
 * WAR is a property of a PAIR of seats, and `Seat.wars` is its one storage —
 * the same question, the same answer, for every kind of pair.
 */
export function civsAtWar(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  return seatOf(state, a)?.wars.includes(b) ?? false;
}

/** Is this seat fighting anybody? */
export function atWarWithAny(state: GameState, seat: number): boolean {
  return (seatOf(state, seat)?.wars.length ?? 0) > 0;
}

/** Every seat this one is fighting, in the order war was declared. */
export function warsOf(state: GameState, seat: number): number[] {
  return seatOf(state, seat)?.wars ?? [];
}

/**
 * Set the war state between seats `a` and `b`. Both sides are written, so the
 * relation cannot end up half-recorded — the invariant a matrix gets for free
 * and a pair of lists has to be given.
 */
export function setWar(state: GameState, a: number, b: number, on: boolean): void {
  if (a === b) return;
  const sa = seatOf(state, a);
  const sb = seatOf(state, b);
  if (!sa || !sb) return;
  const put = (s: Seat, other: number) => {
    if (on) {
      if (!s.wars.includes(other)) s.wars.push(other);
    } else {
      s.wars = s.wars.filter((x) => x !== other);
    }
  };
  put(sa, b);
  put(sb, a);
}

/** Is this war FORMAL (denounced first) rather than a surprise attack? */
export function warIsFormal(state: GameState, a: number, b: number): boolean {
  return seatOf(state, a)?.formalWars.includes(b) ?? false;
}

/** Mark the war between `a` and `b` formal or surprise (both sides written). */
export function setWarFormal(state: GameState, a: number, b: number, on: boolean): void {
  if (a === b) return;
  const sa = seatOf(state, a);
  const sb = seatOf(state, b);
  if (!sa || !sb) return;
  const put = (s: Seat, other: number) => {
    if (on) {
      if (!s.formalWars.includes(other)) s.formalWars.push(other);
    } else {
      s.formalWars = s.formalWars.filter((x) => x !== other);
    }
  };
  put(sa, b);
  put(sb, a);
}

/** Are these two seats allied? */
export function seatsAllied(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  return seatOf(state, a)?.allies.includes(b) ?? false;
}

/** Set the alliance between `a` and `b` (both sides written). */
export function setAllied(state: GameState, a: number, b: number, on: boolean): void {
  if (a === b) return;
  const sa = seatOf(state, a);
  const sb = seatOf(state, b);
  if (!sa || !sb) return;
  const put = (s: Seat, other: number) => {
    if (on) {
      if (!s.allies.includes(other)) s.allies.push(other);
    } else {
      s.allies = s.allies.filter((x) => x !== other);
    }
  };
  put(sa, b);
  put(sb, a);
}
