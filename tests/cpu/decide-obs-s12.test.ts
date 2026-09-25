/**
 * THE NEUTRAL OBSERVATION'S PURCHASE AND ROUTE GROUPS, TS side: `buy` and
 * `route` (cpu/core/decideObsBuy.ts over cpu/core/buyCandidates.ts), each in
 * the shape `gpu/core/neutral.py` `seat_obs` emits and the gate compares
 * every turn.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { foundCity } from '../../cpu/core/game';
import { emptySeat, setWar } from '../../cpu/core/seats';
import { seatGroups } from '../../cpu/core/decideObs';
import { SEAT_GROUPS } from '../../cpu/core/decideObsBuy';
import { patronageCandidate } from '../../cpu/core/buyCandidates';
import { GP_CLASSES } from '../../cpu/data/greatPeople';
import { UNITS } from '../../cpu/data/units';
import type { CityState, GameState, Unit } from '../../cpu/core/types';

const SCHEMA = JSON.parse(readFileSync('shared/decide.schema.json', 'utf-8')) as {
  seat: Record<string, [string, string, string][]>;
};

function scene(): GameState {
  const state = makeState(makeMap(20, 20));
  state.seats.push(emptySeat(1));
  const at = (c: number, r: number) => tileAtCoords(state.map, c, r).index;
  expect(foundCity(state, at(5, 5), 0).city).toBeTruthy();
  expect(foundCity(state, at(14, 14), 1).city).toBeTruthy();
  return state;
}

type Buy = Record<string, number | boolean>;

describe('purchase and route groups', () => {
  it('registers the GPU group names, every field in schema order', () => {
    expect(Object.keys(SEAT_GROUPS)).toEqual(['buy', 'route']);
    const state = scene();
    const g = seatGroups(state, 0);
    for (const name of ['buy', 'route']) {
      expect(Object.keys(g[name] as object)).toEqual(SCHEMA.seat[name].map((f) => f[0]));
      for (const [field, kind] of SCHEMA.seat[name]) {
        const v = (g[name] as Buy)[field];
        expect(typeof v, `${name}.${field}`).toBe(kind === 'bool' ? 'boolean' : 'number');
        if (typeof v === 'number') expect(Number.isInteger(v), `${name}.${field}`).toBe(true);
      }
    }
  });

  it('a seat with no city offers nothing and spawns nowhere', () => {
    const state = scene();
    state.seats[1].cities = [];
    const b = SEAT_GROUPS.buy(state, 1) as Buy;
    expect(b.bldg_city).toBe(-1);
    expect(b.can_building).toBe(false);
    expect(b.spawn_city).toBe(-1);
    for (const [field, kind] of SCHEMA.seat.buy) {
      if (kind === 'bool') expect(b[field], field).toBe(false);
    }
    expect(SEAT_GROUPS.route(state, 1)).toEqual({ from: -1, dest: -1 });
  });

  it('the gold settler: the capital spawns it and pays the pop', () => {
    const state = scene();
    const cap = state.seats[0].cities[0];
    cap.population = 2;
    state.seats[0].treasury = 10_000;
    let b = SEAT_GROUPS.buy(state, 0) as Buy;
    expect(b.spawn_city).toBe(cap.centerIndex);
    expect(b.settler_ok).toBe(true);
    cap.population = 1;
    b = SEAT_GROUPS.buy(state, 0) as Buy;
    expect(b.settler_ok).toBe(false);
    state.seats[0].treasury = 0;
    cap.population = 2;
    expect((SEAT_GROUPS.buy(state, 0) as Buy).settler_ok).toBe(false);
  });

  it('patronage: the affordable standing offer with the fewest missing points, never the passer', () => {
    const state = scene();
    state.gpOffer = GP_CLASSES.map((_c, i) => (i < 3 ? i : -1));
    state.gpPrice = GP_CLASSES.map((_c, i) => (i < 3 ? 100 : 0));
    state.gpPassedBy = GP_CLASSES.map(() => -1);
    const s0 = state.seats[0];
    s0.gpp[GP_CLASSES[0]] = 10;
    s0.gpp[GP_CLASSES[1]] = 90;
    s0.gpp[GP_CLASSES[2]] = 90;
    s0.faith = 10_000;
    s0.treasury = 0;
    expect(patronageCandidate(state, s0, false)).toEqual({ ok: true, cls: 1 });
    expect(patronageCandidate(state, s0, true)).toEqual({ ok: false, cls: -1 });
    state.gpPassedBy[1] = 0;
    const b = SEAT_GROUPS.buy(state, 0) as Buy;
    expect([b.pat_f_ok, b.pat_f_cls, b.pat_g_ok, b.pat_g_cls]).toEqual([true, 2, false, -1]);
  });

  it('the levy: a city-state it is suzerain of with an army standing, lowest id, only at war', () => {
    const state = scene();
    state.seats[0].treasury = 10_000;
    state.cityStates.push(
      { id: 4, seat: 104, type: 'scientific', met: [0], envoys: { 0: 3 }, centerIndex: 0 } as unknown as CityState,
      { id: 2, seat: 102, type: 'militaristic', met: [0], envoys: { 0: 3 }, centerIndex: 1 } as unknown as CityState,
      // suzerain of it too, but it fields no army to levy
      { id: 1, seat: 101, type: 'trade', met: [0], envoys: { 0: 3 }, centerIndex: 2 } as unknown as CityState,
    );
    for (const seat of [104, 102]) {
      state.units.push({ id: 900 + seat, type: 'WARRIOR', seat, tileIndex: 0, movesLeft: 0, hp: 100, charges: null } as Unit);
    }
    expect((SEAT_GROUPS.buy(state, 0) as Buy).levy_ok).toBe(false);
    setWar(state, 0, 1, true);
    const b = SEAT_GROUPS.buy(state, 0) as Buy;
    expect([b.levy_ok, b.levy_cs]).toEqual([true, 2]);
  });

  it('the Rock Band and the Naturalist: behind their civics, at the spawn city', () => {
    const state = scene();
    const s0 = state.seats[0];
    s0.faith = 100_000;
    let b = SEAT_GROUPS.buy(state, 0) as Buy;
    expect([b.band_ok, b.nat_ok]).toEqual([false, false]);
    s0.research.civics.push(UNITS.ROCK_BAND.requiresCivic!, UNITS.NATURALIST.requiresCivic!);
    b = SEAT_GROUPS.buy(state, 0) as Buy;
    const cap = s0.cities[0].centerIndex;
    expect([b.band_ok, b.band_city, b.nat_ok, b.nat_city]).toEqual([true, cap, true, cap]);
  });

  it('no governor promotion, no district buy; no faith grant, no land unit', () => {
    const state = scene();
    state.seats[0].treasury = 100_000;
    state.seats[0].faith = 100_000;
    const b = SEAT_GROUPS.buy(state, 0) as Buy;
    expect([b.dist_g_ok, b.dist_g_tile, b.dist_g_row, b.dist_f_ok]).toEqual([false, -1, -1, false]);
    expect([b.ucls_ok, b.ucls_city, b.ucls_unit, b.cls_ok, b.cls_bldg]).toEqual([false, -1, -1, false, -1]);
  });

});
