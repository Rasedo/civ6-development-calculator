import { describe, it, expect } from 'vitest';
import {
  PLAYER_CIV, BARB_SEAT, civOfRival, seatOfCityState,
  seatOf, allSeats, emptySeat, playerSeat,
} from '../src/core/seats';
import { createGame, foundCity, serialize, deserialize } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import type { GameState } from '../src/core/types';

// #51/S6.12 + S6.13 — `seatOf` is TOTAL, and the barbarians hold their camps.
//
// `seatOf` used to be `state.seats[seat]`, which answered `undefined` for the
// whole city-state range and for the barbarians. A function written against
// `Seat` therefore could not run for half the seat space — the player/rival
// asymmetry this task destroys, one level up and expressed in the type system.
//
// The negative twins matter more than usual here: a total function is easy to
// fake by returning the same object for everything, so every case checks that
// the seat it got back is the RIGHT one.

function newGame(): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 909,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 3, rivals: 2,
  });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  return state;
}

describe('#51/S6.12 seatOf is total', () => {
  it('answers for all four classes — and with a DIFFERENT object each time', () => {
    const state = newGame();
    const ids = [PLAYER_CIV, civOfRival(0), civOfRival(1), seatOfCityState(0), seatOfCityState(2), BARB_SEAT];
    const got = ids.map((id) => seatOf(state, id));
    expect(got.every((s) => s !== undefined)).toBe(true);
    expect(got.map((s) => s!.seat)).toEqual(ids); // each knows its own id
    expect(new Set(got).size).toBe(ids.length); // six distinct objects, not one
  });

  it('the player seat and the barbarian seat are not the same object', () => {
    const state = newGame();
    expect(seatOf(state, PLAYER_CIV)).toBe(playerSeat(state));
    expect(seatOf(state, BARB_SEAT)).toBe(state.barbSeat);
    expect(seatOf(state, BARB_SEAT)).not.toBe(seatOf(state, PLAYER_CIV));
  });

  it('a seat id nobody holds still answers undefined — total is not "always yes"', () => {
    const state = newGame();
    expect(seatOf(state, civOfRival(50))).toBeUndefined(); // no such rival
    expect(seatOf(state, seatOfCityState(50))).toBeUndefined(); // no such minor
  });

  it('allSeats walks every actor once, in seat order', () => {
    const state = newGame();
    const seats = allSeats(state);
    expect(seats.length).toBe(1 + 2 + 3 + 1); // player + rivals + minors + barbs
    const ids = seats.map((s) => s.seat);
    expect(ids).toEqual([...ids].sort((a, b) => a - b)); // ascending = seat order
    expect(new Set(ids).size).toBe(ids.length); // no actor twice
  });

  it('emptySeat gives every Seat field — a new field cannot be half-added', () => {
    const a = emptySeat(7);
    const b = emptySeat(9);
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a.seat).toBe(7);
    // and the arrays are not SHARED between two seats
    a.camps.push(1);
    expect(b.camps).toEqual([]);
  });
});

describe('#51/S6.13 the camps belong to the barbarian seat', () => {
  it('a fresh game puts them on the seat and nowhere else', () => {
    const state = newGame();
    expect(Array.isArray(state.barbSeat.camps)).toBe(true);
    expect((state as unknown as { barbCamps?: number[] }).barbCamps).toBeUndefined();
    // the negative twin: no OTHER seat holds camps
    for (const s of allSeats(state)) {
      if (s.seat !== BARB_SEAT) expect(s.camps).toEqual([]);
    }
  });

  it('survives a save/load round trip', () => {
    const state = newGame();
    state.barbSeat.camps.push(42, 77);
    const back = deserialize(serialize(state));
    expect(back.barbSeat.camps).toEqual([42, 77]);
    expect(seatOf(back, BARB_SEAT)).toBe(back.barbSeat);
  });

  it('a save from BEFORE the move keeps its camps', () => {
    const state = newGame();
    const old = JSON.parse(serialize(state)) as Record<string, unknown>;
    delete old.barbSeat;
    old.barbCamps = [11, 12]; // the field as it was written then
    const back = deserialize(JSON.stringify(old));
    expect(back.barbSeat.camps).toEqual([11, 12]);
  });

  it('a city-state reloads as a Seat, not a bare record', () => {
    const state = newGame();
    const back = deserialize(serialize(state));
    const cs = seatOf(back, seatOfCityState(0));
    expect(cs).toBeDefined();
    expect(cs!.seat).toBe(seatOfCityState(0));
    expect(cs!.camps).toEqual([]);
    expect(cs!.research.techs).toEqual([]); // zero, and zero is the RULE
  });
});
