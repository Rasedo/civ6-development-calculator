import { describe, it, expect } from 'vitest';
import { seatOf, setBorderTurnsFrom } from '../../../cpu/core/seats';
import { createGame } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';
import { tourismIntlPct } from '../../../cpu/core/city';
import { seatAccumulators } from '../../../cpu/core/seatTurn';
import { computeAdoption } from '../../../cpu/core/effects';
import {
  TOURISM_OPEN_BORDERS_PCT, TOURISM_ROUTE_PCT, GOV_INTOLERANCE, TOURISM_GOV_MULT, ENLIGHTENMENT_CIVIC,
} from '../../../cpu/data/seats';
import { POLICIES } from '../../../cpu/data/policies';
import { RELIC_TOURISM } from '../../../cpu/data/greatPeople';
import type { GameState, Seat } from '../../../cpu/core/types';

// INTERNATIONAL MODIFIERS. CIV6 (Tourism): "After national modifiers have been
// applied to generate the national Tourism output, further modifiers affect
// the output to each individual civilization. International Modifiers are
// SUMMED (not compounded) and calculated per each foreign civilization" —
// +25% Open Borders, +25% a trade route (+50% more with Online Communities),
// and -(intolerance) per government pair that disagrees.
//
// REACHABILITY: the gate reaches the ACCUMULATOR every turn (tourismTo is a
// compared field on both engines), but a driven 250-turn game rarely runs a
// government pair with intolerance on both sides; these pokes are the bar for
// the per-rival percent itself.

function newGame(opponents = 1) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, opponents,
  });
  settleFirstCity(state, 0);
  state.autoResearch = false;
  return state;
}

/** put seat `from` on a government whose intolerance is `n`. */
function govern(state: GameState, from: number, civic: string): void {
  seatOf(state, from)!.research.civics.push(civic);
  expect(computeAdoption(seatOf(state, from)!.research).government).toBeTruthy();
}

describe('the per-rival international percent', () => {
  it('an untouched pair of seats modifies nothing', () => {
    const state = newGame(1);
    expect(tourismIntlPct(state, 0, 1)).toBe(0);
  });

  it('OPEN BORDERS the RIVAL granted pays the sender', () => {
    const state = newGame(1);
    setBorderTurnsFrom(state, 1, 0, 30); // seat 1 hosts seat 0
    expect(tourismIntlPct(state, 0, 1)).toBe(TOURISM_OPEN_BORDERS_PCT);
    // and it is the GRANTOR's side of the pair that counts, not the sender's
    expect(tourismIntlPct(state, 1, 0)).toBe(0);
  });

  it('a TRADE ROUTE to the rival pays, and ONLINE_COMMUNITIES raises that clause alone', () => {
    const state = newGame(1);
    const own = seatOf(state, 0)!;
    own.tradeRoutes = [{ from: own.cities[0].id, toSeat: 1 }];
    expect(tourismIntlPct(state, 0, 1)).toBe(TOURISM_ROUTE_PCT);

    const bonus = POLICIES.ONLINE_COMMUNITIES.effects.tourismRouteBonus!;
    expect(bonus).toBe(50);
    // the card, plus a government to slot it in — and the SAME one on the
    // rival, so the pair agrees and no intolerance joins the sum
    own.research.civics.push('SOCIAL_MEDIA', 'SUFFRAGE');
    (state.seats[1] as Seat).research.civics.push('SUFFRAGE');
    const adopted = computeAdoption(own.research).policies;
    expect(adopted).toContain('ONLINE_COMMUNITIES');
    expect(tourismIntlPct(state, 0, 1)).toBe(TOURISM_ROUTE_PCT + bonus);

    // a route to SOMEONE ELSE pays nothing toward this rival
    own.tradeRoutes = [{ from: own.cities[0].id, toSeat: 0 }];
    expect(tourismIntlPct(state, 0, 1)).toBe(0);
  });

  it('the two clauses SUM rather than compounding', () => {
    const state = newGame(1);
    const own = seatOf(state, 0)!;
    setBorderTurnsFrom(state, 1, 0, 30);
    own.tradeRoutes = [{ from: own.cities[0].id, toSeat: 1 }];
    expect(tourismIntlPct(state, 0, 1)).toBe(TOURISM_OPEN_BORDERS_PCT + TOURISM_ROUTE_PCT);
  });

  it('DISAGREEING governments charge BOTH sides’ intolerance', () => {
    // Only the three late governments are intolerant; the seven earlier ones
    // are 0, so an early pair that disagrees still pays nothing.
    expect(GOV_INTOLERANCE.DEMOCRACY).toBe(20);
    expect(GOV_INTOLERANCE.MONARCHY).toBe(0);

    const early = newGame(1);
    govern(early, 0, 'POLITICAL_PHILOSOPHY'); // a Classical government, intolerance 0
    expect(GOV_INTOLERANCE[computeAdoption(seatOf(early, 0)!.research).government!]).toBe(0);
    expect(tourismIntlPct(early, 0, 1)).toBe(0);

    const late = newGame(1);
    govern(late, 0, 'SUFFRAGE'); // DEMOCRACY, intolerance 20
    // the rival is still on the tolerant starting government: 20 + 0
    expect(tourismIntlPct(late, 0, 1)).toBe(-20 * TOURISM_GOV_MULT);

    const both = newGame(1);
    govern(both, 0, 'SUFFRAGE');
    govern(both, 1, 'CLASS_STRUGGLE'); // COMMUNISM, intolerance 20
    expect(tourismIntlPct(both, 0, 1)).toBe(-40 * TOURISM_GOV_MULT);

    const same = newGame(1);
    govern(same, 0, 'SUFFRAGE');
    govern(same, 1, 'SUFFRAGE'); // the SAME government charges nothing
    expect(tourismIntlPct(same, 0, 1)).toBe(0);
  });
});

describe('the per-rival bank', () => {
  const RELICS = 5;

  function relicGame(opponents: number) {
    const state = newGame(opponents);
    const own = seatOf(state, 0)!;
    own.cities[0].relics = RELICS; // a known RELIGIOUS half, nothing general
    own.tourismTo = [];
    own.tourismReligiousTo = [];
    return { state, own };
  }

  it('each rival gets its OWN cell, at its own percent', () => {
    const { state, own } = relicGame(2);
    setBorderTurnsFrom(state, 1, 0, 30); // +25% toward seat 1 only
    seatAccumulators(state, 0);
    const base = RELICS * RELIC_TOURISM;
    expect(own.tourismReligiousTo![1]).toBe(Math.floor(base * 125 / 100));
    expect(own.tourismReligiousTo![2]).toBe(base);
    expect(own.tourismReligiousTo![0] ?? 0).toBe(0); // never to itself
  });

  it('the SCALAR total still banks the undivided national output', () => {
    const { state, own } = relicGame(2);
    setBorderTurnsFrom(state, 1, 0, 30);
    seatAccumulators(state, 0);
    // the national figure is what the cities made, before any rival's percent
    expect(own.tourismReligious).toBe(RELICS * RELIC_TOURISM);
  });

  it('a percent below -100 pays nothing rather than draining the cell', () => {
    const { state, own } = relicGame(1);
    const rival = state.seats[1] as Seat;
    govern(state, 0, 'SUFFRAGE');
    govern(state, 1, 'CLASS_STRUGGLE'); // -40 …
    own.religion.founded = true;
    own.religion.holyTile = null;
    for (const c of rival.cities) c.followedReligion = 1; // … -50 …
    rival.research.civics.push(ENLIGHTENMENT_CIVIC); // … -50: -140 in all
    seatAccumulators(state, 0);
    expect(own.tourismReligiousTo![1]).toBe(0);
    seatAccumulators(state, 0);
    expect(own.tourismReligiousTo![1]).toBe(0); // and it stays at 0
  });
});
