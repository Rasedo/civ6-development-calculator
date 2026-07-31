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

import type { City, GameState, RivalCity, RivalCiv, Seat, Tile, Unit } from './types';
import type { SeatCaps, SeatClass } from '../data/seats';
import { SEAT_CAPS } from '../data/seats';
import { RESOURCES } from '../data/resources';
import { GREAT_PEOPLE } from '../data/greatPeople';

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
  const s = tileSeat(t);
  return s === NO_SEAT || isCityStateSeat(s) ? null : s; // a city-state is not a civ
}

/**
 * #51/S1.3f: THE SEAT that owns this tile, or NO_SEAT.
 *
 * Four fields encoded this: `cityId` (player), `rivalId` (which rival),
 * `rivalCityId` (which rival city) and `csId` (which city-state) — with an
 * implicit precedence nobody had written down, and no way to say "this tile
 * belongs to seat X" without knowing first WHICH KIND of seat X was.
 *
 * Reads the old fields for now, in exactly the old precedence; the storage
 * collapses to `ownerSeat`/`ownerCity` once every reader goes through here.
 */
export function tileSeat(t: Tile): number {
  return t.ownerSeat;
}

/**
 * Give this tile to `seat` (and, for a civ, to one of its cities).
 * `NO_SEAT` releases it.
 *
 * #51/S1.3f: the ONE writer. It always clears the sibling tags, because a tile
 * carrying both `cityId` and `rivalId` is nonsense that `tileSeat`'s precedence
 * would silently resolve in the player's favour. Scattered single-field writes
 * could leave exactly that.
 */
export function setTileOwner(t: Tile, seat: number, city = -1): void {
  t.ownerSeat = seat;
  t.ownerCity = isCityStateSeat(seat) || seat === NO_SEAT ? -1 : city;
}

/** The CITY (within its seat) that works this tile, or -1. */
export function tileCity(t: Tile): number {
  return t.ownerCity;
}

/**
 * Does this tile belong to THIS city? #51/S1.3h: the player asked
 * `t.cityId === city.id` and a rival asked
 * `tileOwnedByCiv(t, civOfRival(r.id)) && t.rivalCityId === city.id` — two
 * spellings of one question, and the player's form could not even express
 * "which rival's city". One question now.
 */
export function tileBelongsTo(t: Tile, city: { seat: number; id: number }): boolean {
  return tileSeat(t) === city.seat && tileCity(t) === city.id;
}

/**
 * The CITY that owns this tile, whichever seat holds it (undefined = unowned,
 * or owned by a city-state). #51/S1.3h: every caller used to branch
 * player-vs-rival by hand and look the city up in a different collection.
 */
export function cityAtTile(state: GameState, t: Tile): City | RivalCity | undefined {
  const seat = tileSeat(t);
  if (seat === NO_SEAT || isCityStateSeat(seat)) return undefined;
  const id = tileCity(t);
  return citiesOf(state, seat).find((c) => c.id === id);
}

/** The rival CIV id claiming this tile, or null (reads only the rival field). */
export function tileRivalCiv(t: Tile): number | null {
  const s = tileSeat(t);
  return isRivalSeat(s) ? s : null;
}

/**
 * Is this tile claimed by exactly this civ? Reads the civ's OWN field
 * (player → cityId, rival → rivalId) with no precedence assumption, so it
 * is bit-equivalent to the pre-C1 per-field tests.
 */
export function tileOwnedByCiv(t: Tile, civ: number): boolean {
  return tileSeat(t) === civ;
}

/** Any territorial claim at all — a civ's or a city-state's. */
export function tileClaimed(t: Tile): boolean {
  return tileSeat(t) !== NO_SEAT;
}

/**
 * Claimed by someone other than `civ` (city-states are foreign to every
 * civ). For the player this is exactly the pre-C1 `csId || rivalId` test.
 */
export function tileForeignTo(t: Tile, civ: number): boolean {
  const s = tileSeat(t);
  return s !== NO_SEAT && s !== civ; // a city-state is foreign to every civ
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
  return isBarbSeat(u.seat) ? null : u.seat; // barbarians are not a civ
}

/** Civ owning this city (absent civId = the player, C1-A2). */
export function cityCiv(c: City): number {
  return c.seat;
}


// ---------------------------------------------------------------------------
// #51/S1.1 — the seat accessors. Every one branches on today's fields exactly
// as today's inline code does; nothing here changes behaviour.
// ---------------------------------------------------------------------------

/** City-states act, so they get seat ids above the civs. */
/**
 * ONE ABSOLUTE SEAT SPACE (#51/S1.3e, task #54).
 *
 *      -1  unowned / nobody          (NO_SEAT)
 *       0  the player                (PLAYER_CIV)
 *   1..99  rivals                    (civOfRival)
 * 100..199 city-states               (seatOfCityState)
 *      200 barbarians                (BARB_SEAT)
 *
 * Every id is ABSOLUTE. The previous scheme put city-states at
 * `1 + rivalCount + csId`, so a seat id depended on a RUNTIME value — tolerable
 * while it lived only in memory, but the tile ownership tags are about to store
 * seats, and a persisted id that shifts with the rival count is a trap. It also
 * freed `-1`, which barbarians used to occupy, to mean exactly one thing:
 * NOBODY. That is what lets a tile say "unowned" without colliding with a
 * barbarian, which owns no territory anyway.
 */
export const NO_SEAT = -1;
const CS_SEAT_BASE = 100;
export const seatOfCityState = (csId: number): number => CS_SEAT_BASE + csId;
export const cityStateOfSeat = (seat: number): number => seat - CS_SEAT_BASE;
export const BARB_SEAT = 200;

/**
 * #51/S1.2f: how many PROPHET-class great people this seat recruited.
 *
 * Was `RivalCiv.prophets`, a shadow counter that existed only because the one
 * shared `earned` array could not answer "how many did I get?". Now that every
 * seat records its own recruits, it is derived — and the player can answer the
 * same question, which it never could.
 */
export function prophetsOf(seat: Seat): number {
  return seat.gpEarned.filter((id) => GREAT_PEOPLE.PROPHET.some((p) => p.id === id)).length;
}

/** The PLAYER's seat. #51/S1.2: the player's own civ-level state lives here,
 *  in exactly the shape a rival's does — read it through this, never as a
 *  special case on GameState. */
export function playerSeat(state: GameState): Seat {
  return state.seats[PLAYER_CIV];
}

/**
 * #51/S6.12: an EMPTY seat — every field of `Seat` at its zero.
 *
 * The one constructor. `deserialize` used to carry this as a 700-character
 * inline literal, which meant a field added to `Seat` had exactly one place
 * that could forget it and no way to notice. Three call sites share it now
 * (the player fallback, a city-state, the barbarians).
 */
export function emptySeat(seat: number): Seat {
  return {
    seat,
    warmonger: 0, ww: {}, wwTurn: {}, diploFavor: 0, diploPoints: 0,
    influencePoints: 0, envoysAvailable: 0,
    treasury: 0, scienceTotal: 0, cultureTotal: 0, faith: 0, tourism: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    government: { current: null, policies: [] },
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    gpp: {}, gpEarned: [],
    settlers: 0, buildersTrained: 0, bestMeleeCS: 0, tilesPurchased: 0,
    spaceProjects: [], camps: [],
  };
}

/**
 * The seat record for ANY seat id — player, rival, city-state or barbarian.
 *
 * #51/S6.12: this used to be `state.seats[seat]`, which answered `undefined`
 * for the whole minor range and for the barbarians. A generic function written
 * against `Seat` therefore could not run for half the seat space, which is the
 * asymmetry this task destroys, expressed in the type system. It is TOTAL now:
 * the three storages differ, the answer does not.
 */
export function seatOf(state: GameState, seat: number): Seat | undefined {
  if (isCityStateSeat(seat)) return state.cityStates?.[cityStateOfSeat(seat)];
  if (isBarbSeat(seat)) return state.barbSeat;
  return state.seats[seat];
}

/**
 * Every actor in the game, in SEAT ORDER: the player, the rivals, the
 * city-states, the barbarians. The order is the seat-id order, which is the
 * same order the GPU's `_seat_row` uses, so "walk every seat" means the same
 * sequence on both engines.
 */
export function allSeats(state: GameState): Seat[] {
  return [...state.seats, ...(state.cityStates ?? []), ...(state.barbSeat ? [state.barbSeat] : [])];
}

/** Is this the human/agent seat? */
export const isPlayerSeat = (seat: number): boolean => seat === PLAYER_CIV;

/** Is this a barbarian? They act but hold no territory, research or diplomacy. */
export const isBarbSeat = (seat: number): boolean => seat === BARB_SEAT;

/**
 * #51/S6.11: which KIND of actor this seat is. The absolute seat space encodes
 * it already (task #54), so this reads the id rather than storing a duplicate.
 * `NO_SEAT` is not an actor and never reaches here.
 */
export function seatClass(seat: number): SeatClass {
  if (isBarbSeat(seat)) return 'hostile';
  if (isCityStateSeat(seat)) return 'minor';
  return 'major'; // the player and the rivals
}

/**
 * #51/S6.11: what this seat MAY do — see src/data/seats.ts for the table and
 * for the ten proposed bits the admissibility rule threw out.
 *
 * Ask this, never `isBarbSeat`, when the question is a RULE ("do its units
 * promote?"). Ask `isBarbSeat` when the question is IDENTITY ("which units are
 * the barbarians'?"). Conflating the two is how one rule ended up spelled four
 * different ways.
 */
export function capsOf(seat: number): SeatCaps {
  return SEAT_CAPS[seatClass(seat)];
}

/**
 * Is this a rival civ? Rival seats are 1..R.
 *
 * City-states get ids ABOVE the rivals (`seatOfCityState`) and own no units
 * today, so `>= 1` is exact. If a city-state is ever given units, THIS is the
 * one place to widen — which is the point of the predicate: the old
 * `owner === 'rival'` string could not express a city-state unit at all.
 */
export const isRivalSeat = (seat: number): boolean => seat >= 1 && seat < CS_SEAT_BASE;

/** Is this a city-state? They hold territory and act, but are never civs. */
export const isCityStateSeat = (seat: number): boolean => seat >= CS_SEAT_BASE && seat < BARB_SEAT;

/** The seat that owns this unit: 0 player, r+1 rival, BARB_SEAT barbarian. */
export function unitSeat(u: { seat: number }): number {
  return u.seat; // #51/S1.3b: the unit STORES its seat now; this is the last shim
}

/**
 * The rival seats, in id order. #51/S1.3j: `state.rivals` is gone — the seats
 * array IS the storage, and a rival is simply a seat above the player.
 * Use `rivalCount` when you only need the number; this allocates.
 */
export function rivalsOf(state: GameState): RivalCiv[] {
  return state.seats.slice(1) as RivalCiv[];
}

/** How many rival seats exist (no allocation — this is called in hot loops). */
export function rivalCount(state: GameState): number {
  return state.seats.length - 1;
}

/** The RivalCiv behind a seat, or undefined for the player/city-states/barbs. */
export function rivalOfSeat(state: GameState, seat: number): RivalCiv | undefined {
  return isRivalSeat(seat) ? (state.seats[seat] as RivalCiv | undefined) : undefined;
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
  return [...state.cities, ...rivalsOf(state).flatMap((r) => r.cities)];
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
  // #51/S6.3: a CITY-STATE pair. The GPU answers every pair from one matrix
  // (S6.0); this used to fall through the rival branches and report PEACE for
  // a city-state whose `atWar` was true. Player<->CS is `CityState.atWar`.
  // Rival<->CS war is NOT MODELLED — a rival can conquer a city-state (A-12b)
  // without any war state between them ever existing — so it answers false and
  // says so, rather than guessing a suzerain-drag rule nothing writes.
  if (isCityStateSeat(a) || isCityStateSeat(b)) {
    const csSeat = isCityStateSeat(a) ? a : b;
    const other = csSeat === a ? b : a;
    if (isCityStateSeat(other)) return false; // two minors never fight
    if (other !== PLAYER_CIV) return false; // rival<->CS: not modelled
    const cs = (state.cityStates ?? []).find((c) => seatOfCityState(c.id) === csSeat);
    return cs?.atWar ?? false;
  }
  // A player pair (one side is civ 0) reads the rival's war-with-player bool.
  if (a === 0 || b === 0) {
    const rivalUnified = a === 0 ? b : a;
    return rivalOfSeat(state, rivalUnified)?.atWar ?? false;
  }
  // A rival↔rival pair: membership in either side's list (symmetric).
  return rivalOfSeat(state, a)?.atWarRivals?.includes(rivalOfCiv(b)) ?? false;
}

/** Set the war state between unified civs `a` and `b` (both sides written). */
export function setRivalWar(state: GameState, a: number, b: number, on: boolean): void {
  if (a === b) return;
  if (a === 0 || b === 0) {
    // The player pair rides the existing single boolean (both engines).
    const rival = rivalOfSeat(state, a === 0 ? b : a);
    if (rival) rival.atWar = on;
    return;
  }
  const ra = rivalOfSeat(state, a);
  const rb = rivalOfSeat(state, b);
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
