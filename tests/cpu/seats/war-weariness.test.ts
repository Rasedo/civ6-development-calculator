import { describe, it, expect } from 'vitest';
import { warWearinessBattle, warWearinessTurn, warWearinessPeace, warWearinessLosses, wwGet, wwSum, wwEraBase } from '../../../cpu/core/weariness';
import { WW_BASE, ERA_WARMONGER_POINTS, WW_HOME_MULT, WW_ABROAD_MULT, WW_DEATH_MULT, WW_DECAY_AT_WAR, WW_DECAY_AT_PEACE, WW_PEACE_TREATY, WAR_WEARINESS_PER_AMENITY, warWearinessPenalty } from '../../../cpu/data/seats';
import { WAR_KINDS, WAR_KIND_SURPRISE } from '../../../cpu/data/warKinds';
import { seededGame } from '../helpers';
import { seatOf, setTileOwner, setWar, setWarKind, BARB_SEAT, seatOfCityState } from '../../../cpu/core/seats';
import type { GameState, Seat } from '../../../cpu/core/types';

// War weariness per combat (Player_Diplomacy 0x1fb680): each side scores
// trunc(loc x base x (100 + pct) / 100), the attacker's base 16 + the game
// era's WarmongerPoints x the war's percent / 100, the defender's 16 - the
// war's percent; loc 1 on its own or an ally's plot with a unit, else 2, + 3
// where its unit died.

function newGame(opponents = 2): GameState {
  const state = seededGame(4210, 1 + opponents, 1);
  return state;
}

/** A tile owned by `seat`, and one owned by nobody. */
function tiles(state: GameState, seat: number): { home: number; away: number } {
  const home = state.map.tiles.find((t) => t.terrain !== 'OCEAN' && t.terrain !== 'COAST')!;
  setTileOwner(home, seat, -1);
  const away = state.map.tiles.find((t) => t.index !== home.index && t.terrain !== 'OCEAN')!;
  setTileOwner(away, -1, -1);
  return { home: home.index, away: away.index };
}

describe('war weariness — per combat', () => {
  it('a war of no kind scores both sides at the base 16', () => {
    const state = newGame();
    const { away } = tiles(state, 0);
    warWearinessBattle(state, 0, 1, away);
    expect(wwGet(seatOf(state, 0)!, 1)).toBe(WW_BASE * WW_ABROAD_MULT);
    expect(wwGet(seatOf(state, 1)!, 0)).toBe(WW_BASE * WW_ABROAD_MULT);
  });

  it('in a Surprise war the attacker scores 16 + the game era\'s points x 150%, the defender nothing', () => {
    const state = newGame();
    const { away } = tiles(state, 0);
    setWar(state, 0, 1, true);
    setWarKind(state, 0, 1, WAR_KIND_SURPRISE);
    state.gameEra = 4;
    const base = WW_BASE + Math.trunc((ERA_WARMONGER_POINTS[4] * WAR_KINDS[WAR_KIND_SURPRISE].pct[0]) / 100);
    expect(wwEraBase(state, 0, 1)).toBe(52);
    warWearinessBattle(state, 0, 1, away, { dDied: true });
    expect(wwGet(seatOf(state, 0)!, 1)).toBe(base * WW_ABROAD_MULT);
    expect(wwGet(seatOf(state, 1)!, 0)).toBe(0);
  });

  it('a unit on its own plot scores the home loc; a city side scores abroad', () => {
    const state = newGame();
    const { home } = tiles(state, 0);
    warWearinessBattle(state, 1, 0, home);
    expect(wwGet(seatOf(state, 0)!, 1)).toBe(WW_BASE * WW_HOME_MULT);
    expect(wwGet(seatOf(state, 1)!, 0)).toBe(WW_BASE * WW_ABROAD_MULT);
    warWearinessBattle(state, 1, 0, home, { dCity: true });
    expect(wwGet(seatOf(state, 0)!, 1)).toBe(WW_BASE * (WW_HOME_MULT + WW_ABROAD_MULT));
  });

  it('a death adds three to the loc of the side that lost the unit', () => {
    const state = newGame();
    const { away } = tiles(state, 0);
    warWearinessBattle(state, 0, 1, away, { dDied: true });
    expect(wwGet(seatOf(state, 0)!, 1)).toBe(WW_BASE * WW_ABROAD_MULT);
    expect(wwGet(seatOf(state, 1)!, 0)).toBe(WW_BASE * (WW_ABROAD_MULT + WW_DEATH_MULT));
  });

  it('BARBARIANS and CITY-STATES neither accrue it nor inflict it', () => {
    const state = newGame();
    const { away } = tiles(state, 0);
    warWearinessBattle(state, 0, BARB_SEAT, away, { dDied: true });
    warWearinessBattle(state, BARB_SEAT, 0, away, { dDied: true });
    const cityState = seatOfCityState(state.cityStates![0].id);
    warWearinessBattle(state, 0, cityState, away, { dCity: true });
    expect(wwSum(seatOf(state, 0)!)).toBe(0);
    expect(wwSum(seatOf(state, BARB_SEAT))).toBe(0);
    expect(wwSum(seatOf(state, cityState))).toBe(0);
  });

  it('wars score SEPARATELY', () => {
    const state = newGame(2);
    const { away } = tiles(state, 0);
    const a = 1;
    const b = 2;
    warWearinessBattle(state, 0, a, away);
    warWearinessBattle(state, 0, a, away);
    warWearinessBattle(state, 0, b, away);
    const one = WW_BASE * WW_ABROAD_MULT;
    expect(wwGet(seatOf(state, 0)!, a)).toBe(one * 2);
    expect(wwGet(seatOf(state, 0)!, b)).toBe(one);
    expect(wwSum(seatOf(state, 0)!)).toBe(one * 3);
  });

  it('each opponent\'s WWP // 400 goes to the cities it founded, then third parties\', then the seat\'s own, capped by need', () => {
    const state = newGame(3);
    const s = seatOf(state, 0)!;
    const cap = s.cities[0];
    // [founder, population]: two of the seat's own, one each of the at-war
    // opponent 1, the at-peace opponent 2, and a third seat 3 with no weariness
    const rows: [number, number][] = [[0, 6], [0, 4], [1, 5], [2, 2], [3, 3]];
    s.cities = rows.map(([f, pop], i) => ({ ...cap, id: 100 + i, founderSeat: f, population: pop }));
    s.ww = { 1: WAR_WEARINESS_PER_AMENITY * 10, 2: WAR_WEARINESS_PER_AMENITY * 3 + 399 };
    setWar(state, 0, 1, true);
    setWar(state, 0, 2, false);
    // opponent 1: 10 to its city, need 3 + 3 = 6, 4 left; opponent 2: 3, need
    // 1 + 1 = 2, 1 left; the pool 5 to the third party's city (need 2 + 1),
    // 2 to the seat's most populous city (need 3 + 0)
    const loss = warWearinessLosses(state, 0);
    expect([100, 101, 102, 103, 104].map((id) => loss.get(id))).toEqual([2, 0, 6, 2, 3]);
    // at peace with 1 its city is capped at need + 1: 4, the pool 6 + 1
    setWar(state, 0, 1, false);
    const peace = warWearinessLosses(state, 0);
    expect([100, 101, 102, 103, 104].map((id) => peace.get(id))).toEqual([3, 1, 4, 2, 3]);
    // opponent 3 alone: its city need + 1, the cities 1 and 2 founded are
    // third parties' now (need + 1), a founded city loses at most its need,
    // and the rest is lost
    s.ww = { 3: WAR_WEARINESS_PER_AMENITY * 50 };
    const flood = warWearinessLosses(state, 0);
    expect([100, 101, 102, 103, 104].map((id) => flood.get(id))).toEqual([3, 2, 4, 2, 3]);
  });

  it('each opponent sheds 50 while at war with it, 200 otherwise', () => {
    const state = newGame(2);
    const a = 1;
    const b = 2;
    const p = seatOf(state, 0)!;
    p.ww = { [a]: 1000, [b]: 1000 };
    setWar(state, (state.seats[a] as Seat).seat, 0, true);
    warWearinessTurn(state, 0);
    expect(wwGet(p, a)).toBe(1000 - WW_DECAY_AT_WAR);
    expect(wwGet(p, b)).toBe(1000 - WW_DECAY_AT_PEACE);
    setWar(state, (state.seats[a] as Seat).seat, 0, false);
    warWearinessTurn(state, 0);
    expect(wwGet(p, a)).toBe(1000 - WW_DECAY_AT_WAR - WW_DECAY_AT_PEACE);
  });

  it('a peace treaty sheds 2000 from THAT war only, and never below zero', () => {
    const state = newGame(2);
    const a = 1;
    const b = 2;
    const p = seatOf(state, 0)!;
    p.ww = { [a]: 900, [b]: 900 };
    warWearinessPeace(state, 0, a);
    expect(wwGet(p, a)).toBe(0); // 900 - 2000, floored
    expect(wwGet(p, b)).toBe(900);
    expect(WW_PEACE_TREATY).toBeGreaterThan(WW_DECAY_AT_PEACE);
  });

  it('400 points buy one amenity and the remainder buys nothing', () => {
    expect(warWearinessPenalty(0)).toBe(0);
    expect(warWearinessPenalty(WAR_WEARINESS_PER_AMENITY - 1)).toBe(0);
    expect(warWearinessPenalty(WAR_WEARINESS_PER_AMENITY)).toBe(1);
    expect(warWearinessPenalty(WAR_WEARINESS_PER_AMENITY * 3 + 399)).toBe(3);
    // deleted the ceiling: a long, bloody war keeps costing.
    expect(warWearinessPenalty(WAR_WEARINESS_PER_AMENITY * 12)).toBe(12);
  });

  it('a war DECLARED but not fought costs nothing', () => {
    const state = newGame();
    const civ = 1;
    setWar(state, 0, civ, true);
    for (let i = 0; i < 30; i++) {
      state.turn += 1;
      warWearinessTurn(state, 0);
      warWearinessTurn(state, civ);
    }
    expect(wwSum(seatOf(state, 0)!)).toBe(0);
    expect(wwSum(seatOf(state, civ))).toBe(0);
  });
});
