import { describe, it, expect } from 'vitest';
import type { RivalCiv } from '../src/core/types';
import { playerSeat, rivalsOf } from '../src/core/seats';
import { createGame, endTurn, foundCity } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import { TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST } from '../src/data/rivals';

// B-25 (#72) CULTURE victory. Real Civ 6 (Gathering Storm): a civ's VISITING
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

function newGame(rivals = 1) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, rivals,
  });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
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
  it('the player out-touring every rival wins (victoryType 7)', () => {
    const state = newGame(1);
    const rv = (state.seats[(0) + 1] as RivalCiv);
    playerSeat(state).tourism = tourismFor(5, 2);
    playerSeat(state).cultureTotal = cultureFor(1);
    rv.cultureTotal = cultureFor(4); // 5 visiting > 4 domestic
    rv.tourism = 0;
    endTurn(state);
    expect(state.victoryType).toBe(7);
    expect(state.gameOver).toBe(true);
  });

  it('a rival out-touring everyone is a DEFEAT (victoryType 8)', () => {
    const state = newGame(1);
    const rv = (state.seats[(0) + 1] as RivalCiv);
    rv.tourism = tourismFor(9, 2);
    rv.cultureTotal = cultureFor(1);
    playerSeat(state).cultureTotal = cultureFor(3); // rival 9 visiting > player 3 domestic
    playerSeat(state).tourism = 0;
    endTurn(state);
    expect(state.victoryType).toBe(8);
    expect(state.gameOver).toBe(true);
  });

  it('EQUAL counts do not win — the bar is strictly greater', () => {
    const state = newGame(1);
    const rv = (state.seats[(0) + 1] as RivalCiv);
    playerSeat(state).tourism = tourismFor(4, 2);
    playerSeat(state).cultureTotal = cultureFor(1);
    rv.cultureTotal = cultureFor(4); // 4 visiting vs 4 domestic — not a win
    rv.tourism = 0;
    endTurn(state);
    expect(state.victoryType).not.toBe(7);
    expect(state.gameOver).toBe(false);
  });

  it('it must beat EVERY other civ, not just one', () => {
    const state = newGame(2);
    playerSeat(state).tourism = tourismFor(6, 3);
    playerSeat(state).cultureTotal = cultureFor(1);
    (state.seats[(0) + 1] as RivalCiv).cultureTotal = cultureFor(2); // beaten
    (state.seats[(1) + 1] as RivalCiv).cultureTotal = cultureFor(9); // NOT beaten
    for (const rv of rivalsOf(state)) rv.tourism = 0;
    endTurn(state);
    expect(state.victoryType).not.toBe(7);
    expect(state.gameOver).toBe(false);
  });

  it('the divisor scales with the number of civs', () => {
    // The SAME lifetime tourism buys fewer visiting tourists in a bigger game:
    // 6 tourists' worth at nCivs=2 is only 4 at nCivs=3.
    const two = newGame(1);
    playerSeat(two).tourism = tourismFor(6, 2);
    playerSeat(two).cultureTotal = cultureFor(1);
    (two.seats[(0) + 1] as RivalCiv).cultureTotal = cultureFor(5);
    (two.seats[(0) + 1] as RivalCiv).tourism = 0;
    endTurn(two);
    expect(two.victoryType).toBe(7); // 6 > 5

    const three = newGame(2);
    playerSeat(three).tourism = tourismFor(6, 2); // same raw tourism as above
    playerSeat(three).cultureTotal = cultureFor(1);
    for (const rv of rivalsOf(three)) {
      rv.cultureTotal = cultureFor(5);
      rv.tourism = 0;
    }
    endTurn(three);
    expect(three.victoryType).not.toBe(7); // only 4 visiting now — 4 < 5
  });

  it('a CITYLESS civ cannot win on tourism it banked while alive', () => {
    const state = newGame(1);
    const rv = (state.seats[(0) + 1] as RivalCiv);
    rv.tourism = tourismFor(9, 2);
    rv.cultureTotal = cultureFor(1);
    rv.cities = []; // wiped off the map, but its lifetime totals remain
    playerSeat(state).cultureTotal = cultureFor(3);
    playerSeat(state).tourism = 0;
    endTurn(state);
    expect(state.victoryType).not.toBe(8);
  });

  it('a RELIGIOUS victory outranks a culture one on the same turn', () => {
    const state = newGame(1);
    const rv = (state.seats[(0) + 1] as RivalCiv);
    // Rival religion predominant everywhere → victoryType 6 …
    rv.religion.founded = true;
    rv.religion.holyTile = rv.cities[0].centerIndex;
    const all = [...state.cities, ...rv.cities];
    for (const c of all) {
      const pres = new Array(2).fill(0);
      pres[1] = 500;
      c.religionPressure = pres;
    }
    // … while the player would ALSO win on culture this very turn.
    playerSeat(state).tourism = tourismFor(5, 2);
    playerSeat(state).cultureTotal = cultureFor(1);
    rv.cultureTotal = cultureFor(4);
    rv.tourism = 0;
    endTurn(state);
    expect(state.victoryType).toBe(6);
  });
});
