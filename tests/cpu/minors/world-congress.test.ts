import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { seatOf } from '../../../cpu/core/seats';
import { createGame, endTurn } from '../../../cpu/core/game';
import { worldCongress } from '../../../cpu/core/phase';
import { settleFirstCity } from '../helpers';
import { CONGRESS_INTERVAL, CONGRESS_MIN_ERA, DVP_PER_RESOLUTION, DIPLO_VICTORY_POINTS } from '../../../cpu/data/seats';

// WORLD CONGRESS. Sourced (Civilopedia GS): the Congress begins
// meeting once the game reaches the MEDIEVAL era and convenes every 30 turns;
// resolutions are voted on with Diplomatic Favor; Diplomatic Victory needs 20
// Diplomatic Victory Points.
//
// MEASURED in the gate: the Congress convenes 5-6 times per seed and awards
// 102 DVP across the 24 seeds (max 6 to any one civ) — so the SESSION and the
// AWARD are genuinely exercised, and congressSessions/diplomaticPoints are compared
// trace columns. The 20-point WIN is NOT reachable at 250 turns (6 of 20 is
// the best any civ manages), so these pokes are the bar for the victory.

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

/** Force every civ past the Medieval gate by handing them a Medieval tech. */
function medieval(state: ReturnType<typeof newGame>) {
  seatOf(state, 0)!.research.techs.push('APPRENTICESHIP'); // Medieval
  for (const civSeat of state.seats.slice(1)) civSeat.research.techs.push('APPRENTICESHIP');
}

describe('B-22 world congress', () => {
  it('does not convene before the MEDIEVAL era', () => {
    const state = newGame(1);
    state.turn = CONGRESS_INTERVAL; // a session turn ...
    seatOf(state, 0)!.diplomaticFavor = 50;
    worldCongress(state);
    expect(state.congressSessions ?? 0).toBe(0); // ... but nobody is Medieval
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(50); // favor untouched
  });

  it('convenes only on interval turns', () => {
    const state = newGame(1);
    medieval(state);
    state.turn = CONGRESS_INTERVAL + 1;
    worldCongress(state);
    expect(state.congressSessions ?? 0).toBe(0);
    state.turn = CONGRESS_INTERVAL * 2;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
  });

  it('the largest favor commitment wins the resolution and all favor is spent', () => {
    const state = newGame(1);
    medieval(state);
    state.turn = CONGRESS_INTERVAL;
    seatOf(state, 0)!.diplomaticFavor = 10;
    (state.seats[(0) + 1] as Seat).diplomaticFavor = 40; // the civ outspends seat 0
    worldCongress(state);
    expect((state.seats[(0) + 1] as Seat).diplomaticPoints).toBe(DVP_PER_RESOLUTION);
    expect(seatOf(state, 0)!.diplomaticPoints ?? 0).toBe(0);
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(0); // spent regardless of the outcome
    expect((state.seats[(0) + 1] as Seat).diplomaticFavor).toBe(0);
  });

  it('a TIE goes to the lower civ id (seat 0)', () => {
    const state = newGame(1);
    medieval(state);
    state.turn = CONGRESS_INTERVAL;
    seatOf(state, 0)!.diplomaticFavor = 25;
    (state.seats[(0) + 1] as Seat).diplomaticFavor = 25;
    worldCongress(state);
    expect(seatOf(state, 0)!.diplomaticPoints).toBe(DVP_PER_RESOLUTION);
    expect((state.seats[(0) + 1] as Seat).diplomaticPoints ?? 0).toBe(0);
  });

  it('a civ with NO favor casts no vote and cannot win', () => {
    const state = newGame(1);
    medieval(state);
    state.turn = CONGRESS_INTERVAL;
    seatOf(state, 0)!.diplomaticFavor = 0;
    (state.seats[(0) + 1] as Seat).diplomaticFavor = 0;
    worldCongress(state);
    expect(state.congressSessions).toBe(1); // the session still happened
    expect(seatOf(state, 0)!.diplomaticPoints ?? 0).toBe(0); // ... and awarded nothing
    expect((state.seats[(0) + 1] as Seat).diplomaticPoints ?? 0).toBe(0);
  });

  it('the Medieval gate reads ANY civ, not just seat 0', () => {
    const state = newGame(1);
    (state.seats[(0) + 1] as Seat).research.techs.push('APPRENTICESHIP'); // only the civ
    state.turn = CONGRESS_INTERVAL;
    seatOf(state, 0)!.diplomaticFavor = 5;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
    expect(CONGRESS_MIN_ERA).toBe(2); // sourced: Medieval
  });
});

describe('B-22/B-25 diplomatic victory', () => {
  it('20 points wins for seat 0 (victoryType 9)', () => {
    const state = newGame(1);
    seatOf(state, 0)!.diplomaticPoints = DIPLO_VICTORY_POINTS;
    endTurn(state, 0);
    expect(state.victoryType).toBe(9);
    expect(state.gameOver).toBe(true);
  });

  it('a civ reaching 20 is a DEFEAT (victoryType 10)', () => {
    const state = newGame(1);
    (state.seats[(0) + 1] as Seat).diplomaticPoints = DIPLO_VICTORY_POINTS;
    endTurn(state, 0);
    expect(state.victoryType).toBe(10);
    expect(state.gameOver).toBe(true);
  });

  it('19 points is not a win — the bar is the full threshold', () => {
    const state = newGame(1);
    seatOf(state, 0)!.diplomaticPoints = DIPLO_VICTORY_POINTS - 1;
    endTurn(state, 0);
    expect(state.victoryType).not.toBe(9);
    expect(state.gameOver).toBe(false);
  });

  it('a CULTURE victory outranks a diplomatic one on the same turn', () => {
    const state = newGame(1);
    // seat 0 would win on culture ...
    seatOf(state, 0)!.tourism = 5 * 2 * 200;
    seatOf(state, 0)!.cultureTotal = 100;
    (state.seats[(0) + 1] as Seat).cultureTotal = 400;
    (state.seats[(0) + 1] as Seat).tourism = 0;
    // ... and on diplomacy
    seatOf(state, 0)!.diplomaticPoints = DIPLO_VICTORY_POINTS;
    endTurn(state, 0);
    expect(state.victoryType).toBe(7); // culture ranks first
  });
});
