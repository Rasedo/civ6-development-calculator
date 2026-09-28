import { describe, it, expect } from 'vitest';
import { warWearinessBattle, warWearinessTurn, warWearinessPeace, warWearinessLosses, wwGet, wwSum, wwEraBase } from '../../../cpu/core/weariness';
import { WW_ERA_BASE_FORMAL, WW_ERA_BASE_SURPRISE, WW_ABROAD_MULT, WW_DEATH_MULT, WW_DECAY_AT_WAR, WW_DECAY_AT_PEACE, WW_PEACE_TREATY, WAR_WEARINESS_PER_AMENITY, warWearinessPenalty } from '../../../cpu/data/seats';
import { seededGame } from '../helpers';
import { seatOf, setTileOwner, setWar, BARB_SEAT, seatOfCityState } from '../../../cpu/core/seats';
import type { GameState, Seat } from '../../../cpu/core/types';

// War weariness is scored PER BATTLE.
//
//     WWP = (EraBase * Location) + Death
//
// Source: the Civ 6 wiki's War weariness page and its reference, CivFanatics
// thread 623207. The SHAPE is what matters: a declared war that nobody fights
// costs nothing and drains away, while one bloody turn is expensive.
//
// Every assertion below is on the SEAT-GENERIC entry points. There is no
// per-seat path to test separately.

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

describe('war weariness — the per-battle model', () => {
  it('scores BOTH sides, at the base for the era, with no discount for the aggressor', () => {
    const state = newGame();
    const { away } = tiles(state, 0);
    const civ = 1;
    warWearinessBattle(state, 0, civ, away);
    // Ancient, no casus belli anywhere: 16, doubled for fighting off both
    // civs' land. "Accumulated by both the attacker and the defender, without
    // any discrimination."
    const base = WW_ERA_BASE_SURPRISE[0];
    expect(wwGet(seatOf(state, 0)!, civ)).toBe(base * WW_ABROAD_MULT);
    expect(wwGet(seatOf(state, civ)!, 0)).toBe(base * WW_ABROAD_MULT);
  });

  it('fighting at HOME is half what fighting abroad is — per side, on the same battle', () => {
    const state = newGame();
    const { home } = tiles(state, 0); // SEAT 0's borders
    const civ = 1;
    warWearinessBattle(state, 0, civ, home);
    const base = WW_ERA_BASE_SURPRISE[0];
    // the defender is at home, the invader is not — one battle, two multipliers
    expect(wwGet(seatOf(state, 0)!, civ)).toBe(base);
    expect(wwGet(seatOf(state, civ)!, 0)).toBe(base * WW_ABROAD_MULT);
  });

  it('a CITY giving or receiving the attack forces the abroad column for both', () => {
    const state = newGame();
    const { home } = tiles(state, 0);
    const civ = 1;
    warWearinessBattle(state, 0, civ, home, { city: true });
    // same tile as the test above, where seat 0 scored a single base
    expect(wwGet(seatOf(state, 0)!, civ)).toBe(WW_ERA_BASE_SURPRISE[0] * WW_ABROAD_MULT);
  });

  it('a death costs the side that LOST the unit three more bases, and only that side', () => {
    const state = newGame();
    const { away } = tiles(state, 0);
    const civ = 1;
    warWearinessBattle(state, 0, civ, away, { dDied: true });
    const base = WW_ERA_BASE_SURPRISE[0];
    expect(wwGet(seatOf(state, 0)!, civ)).toBe(base * WW_ABROAD_MULT);
    expect(wwGet(seatOf(state, civ)!, 0)).toBe(base * WW_ABROAD_MULT + WW_DEATH_MULT * base);
  });

  it('the era table is the sourced one, and the surprise premium opens at Classical', () => {
    const state = newGame();
    const p = seatOf(state, 0)!;
    expect(wwEraBase(state, 0, 1)).toBe(WW_ERA_BASE_SURPRISE[0]);
    // Ancient is the one row where a casus belli buys nothing — 16 either way.
    expect(WW_ERA_BASE_FORMAL[0]).toBe(WW_ERA_BASE_SURPRISE[0]);
    for (let e = 1; e < WW_ERA_BASE_FORMAL.length; e++) {
      expect(WW_ERA_BASE_SURPRISE[e]).toBeGreaterThan(WW_ERA_BASE_FORMAL[e]);
    }
    // the seat's OWN era drives it: a Classical civ wearies at the Classical row
    p.research.techs = ['MINING', 'BRONZE_WORKING', 'CURRENCY', 'WRITING', 'ASTROLOGY', 'HORSEBACK_RIDING', 'IRON_WORKING'];
    const era = wwEraBase(state, 0, 1);
    expect(WW_ERA_BASE_SURPRISE as readonly number[]).toContain(era);
  });

  it('BARBARIANS neither accrue it nor inflict it', () => {
    const state = newGame();
    const { away } = tiles(state, 0);
    warWearinessBattle(state, 0, BARB_SEAT, away, { dDied: true });
    warWearinessBattle(state, BARB_SEAT, 0, away, { dDied: true });
    expect(wwSum(seatOf(state, 0)!)).toBe(0);
    // ...which is what keeps "at peace with everyone" reachable at all: every
    // seat is permanently hostile to barbarians.
    expect(wwSum(seatOf(state, BARB_SEAT))).toBe(0);
  });

  it('a CITY-STATE is a real opponent but keeps no accumulator of its own', () => {
    const state = newGame();
    const { away } = tiles(state, 0);
    const cityState = seatOfCityState(state.cityStates![0].id);
    warWearinessBattle(state, 0, cityState, away, { city: true });
    expect(wwGet(seatOf(state, 0)!, cityState)).toBeGreaterThan(0);
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
    const one = WW_ERA_BASE_SURPRISE[0] * WW_ABROAD_MULT;
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

  it('a war fought this turn does not decay; a phoney war sheds 50 and peace sheds 200', () => {
    const state = newGame(2);
    const { away } = tiles(state, 0);
    const a = 1;
    const b = 2;
    const p = seatOf(state, 0)!;
    p.ww = { [a]: 1000, [b]: 1000 };
    p.wwTurn = { [a]: state.turn }; // blood was spilled against `a` this turn
    setWar(state, (state.seats[a] as Seat).seat, 0, true); // seat 0 is at war with somebody
    warWearinessTurn(state, 0);
    expect(wwGet(p, a)).toBe(1000);
    expect(wwGet(p, b)).toBe(1000 - WW_DECAY_AT_WAR);

    // ...and with every war over, the drain is four times faster. The turn has
    // to move on for the `a` war to count as unfought — the stamp is what tells
    // a war being fought from a phoney one.
    state.turn += 1;
    setWar(state, (state.seats[a] as Seat).seat, 0, false);
    warWearinessTurn(state, 0);
    expect(wwGet(p, a)).toBe(1000 - WW_DECAY_AT_PEACE);
    expect(wwGet(p, b)).toBe(1000 - WW_DECAY_AT_WAR - WW_DECAY_AT_PEACE);
    expect(away).toBeGreaterThanOrEqual(0);
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
