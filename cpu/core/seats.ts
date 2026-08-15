
import type { City, GameState, Seat, Tile, Unit } from './types';
import type { SeatCaps, SeatClass } from '../data/seats';
import { SEAT_CAPS } from '../data/seats';
import { RESOURCES } from '../../world/resources';
import { GREAT_PEOPLE } from '../data/greatPeople';

import { NO_SEAT } from './types';
export { NO_SEAT };
const CITY_STATE_SEAT_BASE = 100;
export const BARB_SEAT = 200;

export const seatOfCityState = (cityStateId: number): number => CITY_STATE_SEAT_BASE + cityStateId;
export const cityStateOfSeat = (seat: number): number => seat - CITY_STATE_SEAT_BASE;


export function tileSeat(t: Tile): number {
  return t.ownerSeat;
}

export function setTileOwner(t: Tile, seat: number, city = -1): void {
  t.ownerSeat = seat;
  t.ownerCity = isCityStateSeat(seat) || seat === NO_SEAT ? -1 : city;
}

export function tileCity(t: Tile): number {
  return t.ownerCity;
}

export function tileBelongsTo(t: Tile, city: { seat: number; id: number }): boolean {
  return tileSeat(t) === city.seat && tileCity(t) === city.id;
}

export function cityAtTile(state: GameState, t: Tile): City | undefined {
  const seat = tileSeat(t);
  if (seat === NO_SEAT || isCityStateSeat(seat)) return undefined;
  const id = tileCity(t);
  return citiesOf(state, seat).find((c) => c.id === id);
}

export function tileOwnedByCiv(t: Tile, civ: number): boolean {
  return tileSeat(t) === civ;
}

export function tileClaimed(t: Tile): boolean {
  return tileSeat(t) !== NO_SEAT;
}

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

export function prophetsOf(seat: Seat): number {
  return seat.gpEarned.filter((id) => GREAT_PEOPLE.PROPHET.some((p) => p.id === id)).length;
}

export function emptySeat(seat: number): Seat {
  return {
    seat,
    cities: [], nextCityId: 0,
    name: '', color: '', aggression: 0,
    warmonger: 0, ww: {}, wwTurn: {}, diplomaticFavor: 0, diplomaticPoints: 0,
    wars: [], formalWars: [], denounced: {}, allies: [],
    influencePoints: 0, envoysAvailable: 0,
    peaceTurns: 0,
    treasury: 0, scienceTotal: 0, cultureTotal: 0, faith: 0, tourism: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    government: { current: null, policies: [] },
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    gpp: {}, gpEarned: [],
    buildersTrained: 0, bestMeleeCS: 0, tilesPurchased: 0,
    spaceProjects: [], camps: [], explored: [],
  };
}

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

export const isBarbSeat = (seat: number): boolean => seat === BARB_SEAT;

export const isCiv = (seat: number): boolean => seat >= 0 && seat < CITY_STATE_SEAT_BASE;

/** Is this a city-state? They hold territory and act, but are never civs. */
export const isCityStateSeat = (seat: number): boolean => seat >= CITY_STATE_SEAT_BASE && seat < BARB_SEAT;

export function seatClass(seat: number): SeatClass {
  if (isBarbSeat(seat)) return 'hostile';
  if (isCityStateSeat(seat)) return 'minor';
  return 'major';
}

export function capsOf(seat: number): SeatCaps {
  return SEAT_CAPS[seatClass(seat)];
}

export function unitSeat(u: { seat: number }): number {
  return u.seat;
}

export function citiesOf(state: GameState, seat: number): City[] {
  return seatOf(state, seat)?.cities ?? [];
}

export function allCities(state: GameState): City[] {
  return state.seats.flatMap((s) => s.cities);
}

export function unitsOf(state: GameState, seat: number): Unit[] {
  return state.units.filter((u) => unitSeat(u) === seat);
}

export function civsAtWar(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  return seatOf(state, a)?.wars.includes(b) ?? false;
}

export function atWarWithAny(state: GameState, seat: number): boolean {
  return (seatOf(state, seat)?.wars.length ?? 0) > 0;
}

export function warsOf(state: GameState, seat: number): number[] {
  return seatOf(state, seat)?.wars ?? [];
}

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

export function warClockKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

export function warTurnsWith(state: GameState, a: number, b: number): number {
  if (a === b) return 0;
  return state.warTurns?.[warClockKey(a, b)] ?? 0;
}

export function setWarTurnsWith(state: GameState, a: number, b: number, v: number): void {
  if (a === b) return;
  if (!state.warTurns) state.warTurns = {};
  state.warTurns[warClockKey(a, b)] = v;
}

export function warIsFormal(state: GameState, a: number, b: number): boolean {
  return seatOf(state, a)?.formalWars.includes(b) ?? false;
}

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

export function seatsAllied(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  return seatOf(state, a)?.allies.includes(b) ?? false;
}

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
