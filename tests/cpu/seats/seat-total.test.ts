import { describe, it, expect } from 'vitest';
import { BARB_SEAT, seatOfCityState, seatOf, allSeats, emptySeat } from '../../../cpu/core/seats';
import { createGame, serialize, deserialize } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';
import type { GameState } from '../../../cpu/core/types';

// `seatOf` is TOTAL, and the barbarians hold their camps.
//
// A `seatOf` that answers only for civs leaves a function written against
// `Seat` unable to run over half the seat space — the asymmetry expressed in
// the type system rather than in a branch.
//
// The negative twins matter more than usual here: a total function is easy to
// fake by returning the same object for everything, so every case checks that
// the seat it got back is the RIGHT one.

function newGame(): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 909,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 3, opponents: 2,
  });
  settleFirstCity(state, 0);
  return state;
}

describe('#51/S6.12 seatOf is total', () => {
  it('answers for all four classes — and with a DIFFERENT object each time', () => {
    const state = newGame();
    const ids = [0, 1, 2, seatOfCityState(0), seatOfCityState(2), BARB_SEAT];
    const got = ids.map((id) => seatOf(state, id));
    expect(got.every((s) => s !== undefined)).toBe(true);
    expect(got.map((s) => s!.seat)).toEqual(ids); // each knows its own id
    expect(new Set(got).size).toBe(ids.length); // six distinct objects, not one
  });

  it('seat 0 and the barbarian seat are not the same object', () => {
    const state = newGame();
    expect(seatOf(state, 0)).toBe(seatOf(state, 0)!);
    expect(seatOf(state, BARB_SEAT)).toBe(state.barbSeat);
    expect(seatOf(state, BARB_SEAT)).not.toBe(seatOf(state, 0));
  });

  it('a seat id nobody holds still answers undefined — total is not "always yes"', () => {
    const state = newGame();
    expect(seatOf(state, 51)).toBeUndefined(); // no such civ
    expect(seatOf(state, seatOfCityState(50))).toBeUndefined(); // no such minor
  });

  it('allSeats walks every actor once, in seat order', () => {
    const state = newGame();
    const seats = allSeats(state);
    expect(seats.length).toBe(1 + 2 + 3 + 1); // civs + minors + barbs
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
    const cityState = seatOf(back, seatOfCityState(0));
    expect(cityState).toBeDefined();
    expect(cityState!.seat).toBe(seatOfCityState(0));
    expect(cityState!.camps).toEqual([]);
    expect(cityState!.research.techs).toEqual([]); // zero, and zero is the RULE
  });
});
