import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { seatOf } from '../../../cpu/core/seats';
import { createGame, endTurn } from '../../../cpu/core/game';
import { settleFirstCity } from '../helpers';
import { TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST, ENLIGHTENMENT_CIVIC, HOLY_CITY_TOURISM } from '../../../cpu/data/seats';
import { RELIC_TOURISM } from '../../../cpu/data/greatPeople';
import { seatTourism, seatTourismReligious } from '../../../cpu/core/city';
import { seatAccumulators } from '../../../cpu/core/seatTurn';

// CULTURE victory. Real Civ 6 (Gathering Storm): a civ's VISITING
// tourists come from the lifetime tourism it has sent TO EACH RIVAL (each
// cell divided by nCivs * 200 on its own) and its DOMESTIC tourists from its
// lifetime CULTURE (divided by 100); a civ wins the moment its visiting
// tourists exceed EVERY other civ's domestic tourists.
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

/** Bank `n` tourists' worth of GENERAL tourism from `s` toward rival `to`. */
function sendTo(s: Seat, to: number, n: number, nCivs: number) {
  s.tourismTo ??= [];
  s.tourismTo[to] = (s.tourismTo[to] ?? 0) + tourismFor(n, nCivs);
}

describe('culture victory', () => {
  it('seat 0 out-touring every civ wins the culture victory', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    sendTo(seatOf(state, 0)!, 1, 5, 2);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    civSeat.cultureTotal = cultureFor(4); // 5 visiting > 4 domestic
    endTurn(state);
    expect(state.victoryType).toBe(5);
    expect(state.victoryRow).toBe(0);
    expect(state.gameOver).toBe(true);
  });

  it('a civ out-touring everyone wins the SAME way — only the victor differs', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    sendTo(civSeat, 0, 9, 2);
    civSeat.cultureTotal = cultureFor(1);
    seatOf(state, 0)!.cultureTotal = cultureFor(3); // civ 9 visiting > seat-0 3 domestic
    endTurn(state);
    expect(state.victoryType).toBe(5);
    expect(state.victoryRow).toBe(1);
    expect(state.gameOver).toBe(true);
  });

  it('EQUAL counts do not win — the bar is strictly greater', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    sendTo(seatOf(state, 0)!, 1, 4, 2);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    civSeat.cultureTotal = cultureFor(4); // 4 visiting vs 4 domestic — not a win
    endTurn(state);
    expect(state.victoryType).not.toBe(5);
    expect(state.gameOver).toBe(false);
  });

  it('it must beat EVERY other civ, not just one', () => {
    const state = newGame(2);
    sendTo(seatOf(state, 0)!, 1, 3, 3);
    sendTo(seatOf(state, 0)!, 2, 3, 3); // 6 visiting in all
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    (state.seats[(0) + 1] as Seat).cultureTotal = cultureFor(2); // beaten
    (state.seats[(1) + 1] as Seat).cultureTotal = cultureFor(9); // NOT beaten
    endTurn(state);
    expect(state.victoryType).not.toBe(5);
    expect(state.gameOver).toBe(false);
  });

  it('the divisor scales with the number of civs', () => {
    // The SAME lifetime tourism buys fewer visiting tourists in a bigger game:
    // 6 tourists' worth at nCivs=2 is only 4 at nCivs=3.
    const two = newGame(1);
    sendTo(seatOf(two, 0)!, 1, 6, 2);
    seatOf(two, 0)!.cultureTotal = cultureFor(1);
    (two.seats[(0) + 1] as Seat).cultureTotal = cultureFor(5);
    endTurn(two);
    expect(two.victoryType).toBe(5); // 6 > 5

    const three = newGame(2);
    sendTo(seatOf(three, 0)!, 1, 6, 2); // the same raw tourism, in one cell
    seatOf(three, 0)!.cultureTotal = cultureFor(1);
    for (const civSeat of three.seats.slice(1)) civSeat.cultureTotal = cultureFor(5);
    endTurn(three);
    expect(three.victoryType).not.toBe(5); // only 4 visiting now — 4 < 5
  });

  it('each rival cell floors on its OWN — tourism has an address', () => {
    // Two cells one short of a tourist buy NOTHING; the same total in one
    // cell buys one. A lifetime SCALAR could not tell the two apart.
    const split = newGame(2);
    const div = 3 * TOURISM_PER_VISITOR_PER_CIV;
    const own = seatOf(split, 0)!;
    own.tourismTo = [];
    own.tourismTo[1] = div - 1;
    own.tourismTo[2] = div - 1;
    own.cultureTotal = cultureFor(1);
    for (const civSeat of split.seats.slice(1)) civSeat.cultureTotal = 0;
    endTurn(split);
    expect(split.victoryType).not.toBe(5); // 0 + 0 visiting, and 0 > 0 is false

    const whole = newGame(2);
    const mine = seatOf(whole, 0)!;
    mine.tourismTo = [];
    mine.tourismTo[1] = 2 * div - 2; // the same total, one address
    mine.cultureTotal = cultureFor(1);
    for (const civSeat of whole.seats.slice(1)) civSeat.cultureTotal = 0;
    endTurn(whole);
    expect(whole.victoryType).toBe(5); // 1 visiting > 0 domestic
  });

  it('a CITYLESS civ cannot win on tourism it banked while alive', () => {
    const state = newGame(1);
    const civSeat = (state.seats[(0) + 1] as Seat);
    sendTo(civSeat, 0, 9, 2);
    civSeat.cultureTotal = cultureFor(1);
    civSeat.cities = []; // wiped off the map, but its lifetime totals remain
    seatOf(state, 0)!.cultureTotal = cultureFor(3);
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
    sendTo(seatOf(state, 0)!, 1, 5, 2);
    seatOf(state, 0)!.cultureTotal = cultureFor(1);
    civSeat.cultureTotal = cultureFor(4);
    endTurn(state);
    expect(state.victoryType).toBe(4);
  });
});
describe('the RELIGIOUS half and its per-rival halvings', () => {
  // CIV6 (Tourism): "-50% (Religious Tourism only) if the foreign
  // civilization has The Enlightenment" — cancelled by Cristo Redentor —
  // and "-50% (Religious Tourism only) for Different Religions", which
  // "doesn't apply if you haven't founded a religion". Both are INTERNATIONAL
  // modifiers, so they are summed per rival at BANK time, not applied to a
  // lifetime total.
  const RELICS = 4;

  /** A 2-civ game whose seat 0 generates `RELICS * RELIC_TOURISM` religious
   *  tourism a turn and nothing general, with a fresh matrix. */
  function relicGame() {
    const state = newGame(1);
    const own = seatOf(state, 0)!;
    own.cities[0].relics = RELICS;
    own.tourismTo = [];
    own.tourismReligiousTo = [];
    return { state, own, rival: state.seats[1] as Seat };
  }

  const banked = (own: Seat) => own.tourismReligiousTo?.[1] ?? 0;

  it('an untouched rival banks the religious half in full', () => {
    const { state, own } = relicGame();
    seatAccumulators(state, 0);
    expect(banked(own)).toBe(RELICS * RELIC_TOURISM);
  });

  it('a rival with The Enlightenment halves the religious half only', () => {
    const { state, own, rival } = relicGame();
    rival.research.civics.push(ENLIGHTENMENT_CIVIC);
    const generalBefore = own.tourismTo?.[1] ?? 0;
    seatAccumulators(state, 0);
    expect(banked(own)).toBe(Math.floor(RELICS * RELIC_TOURISM / 2));
    expect(own.tourismTo?.[1] ?? 0).toBe(generalBefore); // the GENERAL half is untouched
  });

  it('Cristo Redentor shields the religious half from Enlightenment', () => {
    const { state, own, rival } = relicGame();
    rival.research.civics.push(ENLIGHTENMENT_CIVIC);
    const t = state.map.tiles[own.cities[0].centerIndex + 1];
    t.builtWonder = 'CRISTO_REDENTOR';
    t.builtWonderComplete = true;
    own.cities[0].wonders.push({ id: 'CRISTO_REDENTOR', tileIndex: t.index });
    seatAccumulators(state, 0);
    expect(banked(own)).toBe(RELICS * RELIC_TOURISM);
  });

  it('a rival following a DIFFERENT religion halves it — once founded', () => {
    const half = Math.floor(RELICS * RELIC_TOURISM / 2);
    const bank = (foundedOwn: boolean, civFollows: number | null): number => {
      const { state, own, rival } = relicGame();
      // founded WITHOUT a holy tile: the flag the penalty reads, minus the
      // pressure source that would otherwise pay a holy city too.
      if (foundedOwn) {
        own.religion.founded = true;
        own.religion.holyTile = null;
      }
      for (const c of rival.cities) c.followedReligion = civFollows;
      seatAccumulators(state, 0);
      return banked(own);
    };
    expect(bank(true, 1)).toBe(half);  // a majority religion that is not mine
    expect(bank(true, 0)).toBe(RELICS * RELIC_TOURISM);  // the SAME religion
    expect(bank(true, null)).toBe(RELICS * RELIC_TOURISM); // no majority religion
    expect(bank(false, 1)).toBe(RELICS * RELIC_TOURISM); // founded nothing: no penalty
  });

  it('the two halvings SUM to -100% and pay nothing', () => {
    // International modifiers are summed, not compounded — so the pair is
    // -100%, not a quarter, and a total below -100% still pays 0 rather than
    // draining the bank.
    const { state, own, rival } = relicGame();
    own.religion.founded = true;
    own.religion.holyTile = null;
    rival.research.civics.push(ENLIGHTENMENT_CIVIC);
    for (const c of rival.cities) c.followedReligion = 1;
    seatAccumulators(state, 0);
    expect(banked(own)).toBe(0);

    // and a third -50% cannot take the cell negative
    seatAccumulators(state, 0);
    expect(banked(own)).toBe(0);
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
