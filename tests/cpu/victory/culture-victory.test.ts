import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { seatOf } from '../../../cpu/core/seats';
import { createGame, endTurn } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';
import { TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST, ENLIGHTENMENT_CIVIC, HOLY_CITY_TOURISM } from '../../../cpu/data/seats';
import { RELIC_TOURISM } from '../../../cpu/data/greatPeople';
import { seatTourism, seatTourismReligious } from '../../../cpu/core/city';

// CULTURE victory. Real Civ 6 (Gathering Storm): a civ's VISITING
// tourists come from its lifetime TOURISM (divided by nCivs * 200) and its
// DOMESTIC tourists from its lifetime CULTURE (divided by 100); a civ wins the
// moment its visiting tourists exceed EVERY other civ's domestic tourists.
//
// MEASURED gate-unreachable: across the 24 scripted seeds at 250 turns the
// best any civ manages is a gap of -12 (visiting peaks at 7, domestic reaches
// 97) — every tourism source ships, but a driven game never closes the gap,
// so the scripted gate proves only the ACCUMULATOR (rCulture is a compared
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

describe('culture victory', () => {
  it('seat 0 out-touring every civ wins the culture victory', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    seatOf(state, 0)!.tourism = tourismFor(5, 2);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    civSeat.cultureTotal = cultureFor(4); // 5 visiting > 4 domestic
    civSeat.tourism = 0;
    endTurn(state);
    expect(state.victoryType).toBe(5);
    expect(state.victoryRow).toBe(0);
    expect(state.gameOver).toBe(true);
  });

  it('a civ out-touring everyone wins the SAME way — only the victor differs', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    civSeat.tourism = tourismFor(9, 2);
    civSeat.cultureTotal = cultureFor(1);
    seatOf(state, 0)!.cultureTotal = cultureFor(3); // civ 9 visiting > seat-0 3 domestic
    seatOf(state, 0)!.tourism = 0;
    endTurn(state);
    expect(state.victoryType).toBe(5);
    expect(state.victoryRow).toBe(1);
    expect(state.gameOver).toBe(true);
  });

  it('EQUAL counts do not win — the bar is strictly greater', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    seatOf(state, 0)!.tourism = tourismFor(4, 2);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    civSeat.cultureTotal = cultureFor(4); // 4 visiting vs 4 domestic — not a win
    civSeat.tourism = 0;
    endTurn(state);
    expect(state.victoryType).not.toBe(5);
    expect(state.gameOver).toBe(false);
  });

  it('it must beat EVERY other civ, not just one', () => {
    const state = newGame(2);
    seatOf(state, 0)!.tourism = tourismFor(6, 3);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    (state.seats[(0) + 1] as Seat).cultureTotal = cultureFor(2); // beaten
    (state.seats[(1) + 1] as Seat).cultureTotal = cultureFor(9); // NOT beaten
    for (const civSeat of state.seats.slice(1)) civSeat.tourism = 0;
    endTurn(state);
    expect(state.victoryType).not.toBe(5);
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
    endTurn(two);
    expect(two.victoryType).toBe(5); // 6 > 5

    const three = newGame(2);
    seatOf(three, 0)!.tourism = tourismFor(6, 2); // same raw tourism as above
    seatOf(three, 0)!.cultureTotal = cultureFor(1);
    for (const civSeat of three.seats.slice(1)) {
      civSeat.cultureTotal = cultureFor(5);
      civSeat.tourism = 0;
    }
    endTurn(three);
    expect(three.victoryType).not.toBe(5); // only 4 visiting now — 4 < 5
  });

  it('a CITYLESS civ cannot win on tourism it banked while alive', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    civSeat.tourism = tourismFor(9, 2);
    civSeat.cultureTotal = cultureFor(1);
    civSeat.cities = []; // wiped off the map, but its lifetime totals remain
    seatOf(state, 0)!.cultureTotal = cultureFor(3);
    seatOf(state, 0)!.tourism = 0;
    endTurn(state);
    expect(state.victoryType).not.toBe(5);
  });

  it('a RELIGIOUS victory outranks a culture one on the same turn', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    // Civ religion predominant everywhere → victoryType 4 (religion) …
    civSeat.religion.founded = true;
    civSeat.religion.holyTile = civSeat.cities[0].centerIndex;
    const all = [...seatOf(state, 0)!.cities, ...civSeat.cities];
    for (const c of all) {
      const pres = new Array(2).fill(0);
      pres[1] = 500;
      c.religionPressure = pres;
    }
    // … while seat 0 would ALSO win on culture this very turn.
    seatOf(state, 0)!.tourism = tourismFor(5, 2);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    civSeat.cultureTotal = cultureFor(4);
    civSeat.tourism = 0;
    endTurn(state);
    expect(state.victoryType).toBe(4);
  });
});
describe('the RELIGIOUS half and its per-rival halvings', () => {
  // CIV6 (Tourism): "-50% (Religious Tourism only) if the foreign
  // civilization has The Enlightenment" — cancelled by Cristo Redentor —
  // and "-50% (Religious Tourism only) for Different Religions", which
  // "doesn't apply if you haven't founded a religion".
  it('a rival with The Enlightenment halves the religious half only', () => {
    const win = (civCulture: number, enlightened: boolean): boolean => {
      const state = newGame(1);
      const civSeat = state.seats[1] as Seat;
      seatOf(state, 0)!.tourism = tourismFor(2, 2);
      seatOf(state, 0)!.tourismReligious = tourismFor(6, 2);
      seatOf(state, 0)!.cultureTotal = cultureFor(1);
      civSeat.cultureTotal = cultureFor(civCulture);
      civSeat.tourism = 0;
      if (enlightened) civSeat.research.civics.push(ENLIGHTENMENT_CIVIC);
      endTurn(state);
      return state.victoryType === 5;
    };
    expect(win(4, false)).toBe(true);  // 2 + 6 = 8 > 4
    expect(win(4, true)).toBe(true);   // 2 + 3 = 5 > 4 — the GENERAL half is untouched
    expect(win(6, false)).toBe(true);  // 8 > 6
    expect(win(6, true)).toBe(false);  // 2 + 3 = 5 <= 6 — the halving costs the win
  });

  it('Cristo Redentor shields the religious half from Enlightenment', () => {
    const state = newGame(1);
    const civSeat = state.seats[1] as Seat;
    civSeat.research.civics.push(ENLIGHTENMENT_CIVIC);
    civSeat.cultureTotal = cultureFor(6);
    civSeat.tourism = 0;
    const own = seatOf(state, 0)!;
    own.tourism = tourismFor(2, 2);
    own.tourismReligious = tourismFor(6, 2);
    own.cultureTotal = cultureFor(1);
    const t = state.map.tiles[own.cities[0].centerIndex + 1];
    t.builtWonder = 'CRISTO_REDENTOR';
    t.builtWonderComplete = true;
    own.cities[0].wonders.push({ id: 'CRISTO_REDENTOR', tileIndex: t.index });
    endTurn(state);
    expect(state.victoryType).toBe(5); // all 8 kept: 8 > 6
  });

  it('a rival following a DIFFERENT religion halves it — once founded', () => {
    const win = (foundedOwn: boolean, civFollows: number | null): boolean => {
      const state = newGame(1);
      const civSeat = state.seats[1] as Seat;
      const own = seatOf(state, 0)!;
      own.tourism = tourismFor(2, 2);
      own.tourismReligious = tourismFor(6, 2);
      own.cultureTotal = cultureFor(1);
      // founded WITHOUT a holy tile: the flag the penalty reads, minus the
      // pressure source — with no source the turn spreads nothing, so the
      // hand-set followers survive and no RELIGIOUS victory can outrank the
      // culture check this test is about.
      if (foundedOwn) {
        own.religion.founded = true;
        own.religion.holyTile = null;
      }
      for (const c of civSeat.cities) c.followedReligion = civFollows;
      civSeat.cultureTotal = cultureFor(6);
      civSeat.tourism = 0;
      endTurn(state);
      return state.victoryType === 5;
    };
    expect(win(true, 1)).toBe(false);  // majority religion 1 != 0: 5 <= 6
    expect(win(true, 0)).toBe(true);   // the SAME religion: 8 > 6
    expect(win(true, null)).toBe(true); // no majority religion: 8 > 6
    expect(win(false, 1)).toBe(true);  // seat 0 founded nothing: no penalty
  });

  it('both halvings stack to a quarter', () => {
    const state = newGame(1);
    const civSeat = state.seats[1] as Seat;
    const own = seatOf(state, 0)!;
    own.tourism = tourismFor(2, 2);
    own.tourismReligious = tourismFor(8, 2);
    own.cultureTotal = cultureFor(1);
    own.religion.founded = true;
    own.religion.holyTile = null;
    civSeat.research.civics.push(ENLIGHTENMENT_CIVIC);
    for (const c of civSeat.cities) c.followedReligion = 1;
    civSeat.cultureTotal = cultureFor(3);
    civSeat.tourism = 0;
    endTurn(state);
    // 2 + 8/4 = 4 visiting vs 3 domestic: still a win at a quarter …
    expect(state.victoryType).toBe(5);
    // … and one more domestic tourist would block what 2 + 8 would have beaten
    const again = newGame(1);
    const rival = again.seats[1] as Seat;
    const me = seatOf(again, 0)!;
    me.tourism = tourismFor(2, 2);
    me.tourismReligious = tourismFor(8, 2);
    me.cultureTotal = cultureFor(1);
    me.religion.founded = true;
    me.religion.holyTile = null;
    rival.research.civics.push(ENLIGHTENMENT_CIVIC);
    for (const c of rival.cities) c.followedReligion = 1;
    rival.cultureTotal = cultureFor(4);
    rival.tourism = 0;
    endTurn(again);
    expect(again.victoryType).not.toBe(5); // 4 <= 4
  });
});

describe('the religious-tourism BANK', () => {
  it('relics and holy cities accrue to tourismReligious, never to tourism', () => {
    const state = newGame(1);
    const own = seatOf(state, 0)!;
    const city = own.cities[0];
    const generalBefore = seatTourism(state, 0);
    city.relics = 2;
    own.religion.founded = true;
    own.religion.holyTile = city.centerIndex;
    expect(seatTourism(state, 0)).toBe(generalBefore); // relics left the general body
    expect(seatTourismReligious(state, 0)).toBe(2 * RELIC_TOURISM + HOLY_CITY_TOURISM);
    // a religion's Holy City pays its CURRENT owner
    const civSeat = state.seats[1] as Seat;
    own.religion.holyTile = civSeat.cities[0].centerIndex;
    expect(seatTourismReligious(state, 0)).toBe(2 * RELIC_TOURISM);
    expect(seatTourismReligious(state, 1)).toBe(HOLY_CITY_TOURISM);
    // and the turn banks the halves apart
    own.religion.holyTile = city.centerIndex;
    const r0 = own.tourismReligious ?? 0;
    endTurn(state);
    expect((own.tourismReligious ?? 0) - r0).toBe(2 * RELIC_TOURISM + HOLY_CITY_TOURISM);
  });
});
