import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { seatOf } from '../../../cpu/core/seats';
import { createGame, endTurn } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';
import { TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST } from '../../../cpu/data/seats';

// CULTURE victory. Real Civ 6 (Gathering Storm): a civ's VISITING
// tourists come from its lifetime TOURISM (divided by nCivs * 200) and its
// DOMESTIC tourists from its lifetime CULTURE (divided by 100); a civ wins the
// moment its visiting tourists exceed EVERY other civ's domestic tourists.
//
// MEASURED gate-unreachable: across the 24 scripted seeds at 250 turns the
// best any civ manages is a gap of -12 (visiting peaks at 7, domestic reaches
// 97) — tourism in this model is still missing relics, artifacts, National
// Parks and Great Works of Art, so the two populations are orders apart. The
// scripted gate therefore proves only the ACCUMULATOR (rCulture is a compared
// trace column); these pokes are the bar for the CHECK.

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

/** Tourism that yields exactly `n` visiting tourists for a game of nCivs. */
function tourismFor(n: number, nCivs: number) {
  return n * nCivs * TOURISM_PER_VISITOR_PER_CIV;
}

/** Culture that yields exactly `n` domestic tourists. */
function cultureFor(n: number) {
  return n * CULTURE_PER_DOMESTIC_TOURIST;
}

describe('B-25 culture victory', () => {
  it('the player out-touring every civ wins (victoryType 7)', () => {
    const state = newGame(1);
    const rv = (state.seats[(0) + 1] as Seat);
    seatOf(state, 0)!.tourism = tourismFor(5, 2);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    rv.cultureTotal = cultureFor(4); // 5 visiting > 4 domestic
    rv.tourism = 0;
    endTurn(state, 0);
    expect(state.victoryType).toBe(7);
    expect(state.gameOver).toBe(true);
  });

  it('a civ out-touring everyone is a DEFEAT (victoryType 8)', () => {
    const state = newGame(1);
    const rv = (state.seats[(0) + 1] as Seat);
    rv.tourism = tourismFor(9, 2);
    rv.cultureTotal = cultureFor(1);
    seatOf(state, 0)!.cultureTotal = cultureFor(3); // civ 9 visiting > player 3 domestic
    seatOf(state, 0)!.tourism = 0;
    endTurn(state, 0);
    expect(state.victoryType).toBe(8);
    expect(state.gameOver).toBe(true);
  });

  it('EQUAL counts do not win — the bar is strictly greater', () => {
    const state = newGame(1);
    const rv = (state.seats[(0) + 1] as Seat);
    seatOf(state, 0)!.tourism = tourismFor(4, 2);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    rv.cultureTotal = cultureFor(4); // 4 visiting vs 4 domestic — not a win
    rv.tourism = 0;
    endTurn(state, 0);
    expect(state.victoryType).not.toBe(7);
    expect(state.gameOver).toBe(false);
  });

  it('it must beat EVERY other civ, not just one', () => {
    const state = newGame(2);
    seatOf(state, 0)!.tourism = tourismFor(6, 3);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    (state.seats[(0) + 1] as Seat).cultureTotal = cultureFor(2); // beaten
    (state.seats[(1) + 1] as Seat).cultureTotal = cultureFor(9); // NOT beaten
    for (const rv of state.seats.slice(1)) rv.tourism = 0;
    endTurn(state, 0);
    expect(state.victoryType).not.toBe(7);
    expect(state.gameOver).toBe(false);
  });

  it('the divisor scales with the number of civs', () => {
    // The SAME lifetime tourism buys fewer visiting tourists in a bigger game:
    // 6 tourists' worth at nCivs=2 is only 4 at nCivs=3.
    const two = newGame(1);
    seatOf(two, 0)!.tourism = tourismFor(6, 2);
    seatOf(two, 0)!.cultureTotal = cultureFor(1);
    (two.seats[(0) + 1] as Seat).cultureTotal = cultureFor(5);
    (two.seats[(0) + 1] as Seat).tourism = 0;
    endTurn(two, 0);
    expect(two.victoryType).toBe(7); // 6 > 5

    const three = newGame(2);
    seatOf(three, 0)!.tourism = tourismFor(6, 2); // same raw tourism as above
    seatOf(three, 0)!.cultureTotal = cultureFor(1);
    for (const rv of three.seats.slice(1)) {
      rv.cultureTotal = cultureFor(5);
      rv.tourism = 0;
    }
    endTurn(three, 0);
    expect(three.victoryType).not.toBe(7); // only 4 visiting now — 4 < 5
  });

  it('a CITYLESS civ cannot win on tourism it banked while alive', () => {
    const state = newGame(1);
    const rv = (state.seats[(0) + 1] as Seat);
    rv.tourism = tourismFor(9, 2);
    rv.cultureTotal = cultureFor(1);
    rv.cities = []; // wiped off the map, but its lifetime totals remain
    seatOf(state, 0)!.cultureTotal = cultureFor(3);
    seatOf(state, 0)!.tourism = 0;
    endTurn(state, 0);
    expect(state.victoryType).not.toBe(8);
  });

  it('a RELIGIOUS victory outranks a culture one on the same turn', () => {
    const state = newGame(1);
    const rv = (state.seats[(0) + 1] as Seat);
    // Civ religion predominant everywhere → victoryType 6 …
    rv.religion.founded = true;
    rv.religion.holyTile = rv.cities[0].centerIndex;
    const all = [...seatOf(state, 0)!.cities, ...rv.cities];
    for (const c of all) {
      const pres = new Array(2).fill(0);
      pres[1] = 500;
      c.religionPressure = pres;
    }
    // … while the player would ALSO win on culture this very turn.
    seatOf(state, 0)!.tourism = tourismFor(5, 2);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    rv.cultureTotal = cultureFor(4);
    rv.tourism = 0;
    endTurn(state, 0);
    expect(state.victoryType).toBe(6);
  });
});
