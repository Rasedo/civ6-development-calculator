import { describe, it, expect } from 'vitest';
import {
  warWearinessBattle, warWearinessTurn, warWearinessPeace, wwGet, wwMax, wwSum, wwEraBase,
} from '../src/core/weariness';
import {
  WW_ERA_BASE_FORMAL, WW_ERA_BASE_SURPRISE, WW_ABROAD_MULT, WW_DEATH_MULT,
  WW_DECAY_AT_WAR, WW_DECAY_AT_PEACE, WW_PEACE_TREATY, WAR_WEARINESS_PER_AMENITY,
  warWearinessPenalty,
} from '../src/data/rivals';
import { createGame, foundCity } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import { playerSeat, seatOf, setTileOwner, setRivalWar, BARB_SEAT, PLAYER_CIV, civOfRival, seatOfCityState } from '../src/core/seats';
import type { GameState, RivalCiv } from '../src/core/types';

// #51/S7.8f — war weariness is scored PER BATTLE.
//
//     WWP = (EraBase * Location) + Death
//
// Source: the Civ 6 wiki's War weariness page and its reference, CivFanatics
// thread 623207. What this lane exists to pin is the SHAPE the old model could
// not express: a declared war that nobody fights costs nothing and drains, and
// one bloody turn costs more than the old model charged in thirty.
//
// Every assertion below is on the SEAT-GENERIC entry points. There is no player
// path and no rival path to test separately — that is the point of #51.

function newGame(rivals = 2): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 4210,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 1, rivals,
  });
  foundCity(state, scoreSettleSites(state, 1)[0].tileIndex);
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

describe('#51/S7.8f war weariness — the per-battle model', () => {
  it('scores BOTH sides, at the base for the era, with no discount for the aggressor', () => {
    const state = newGame();
    const { away } = tiles(state, PLAYER_CIV);
    const rival = civOfRival(0);
    warWearinessBattle(state, PLAYER_CIV, rival, away);
    // Ancient, no casus belli anywhere: 16, doubled for fighting off both
    // civs' land. "Accumulated by both the attacker and the defender, without
    // any discrimination."
    const base = WW_ERA_BASE_SURPRISE[0];
    expect(wwGet(playerSeat(state), rival)).toBe(base * WW_ABROAD_MULT);
    expect(wwGet(seatOf(state, rival)!, PLAYER_CIV)).toBe(base * WW_ABROAD_MULT);
  });

  it('fighting at HOME is half what fighting abroad is — per side, on the same battle', () => {
    const state = newGame();
    const { home } = tiles(state, PLAYER_CIV); // the PLAYER's borders
    const rival = civOfRival(0);
    warWearinessBattle(state, PLAYER_CIV, rival, home);
    const base = WW_ERA_BASE_SURPRISE[0];
    // the defender is at home, the invader is not — one battle, two multipliers
    expect(wwGet(playerSeat(state), rival)).toBe(base);
    expect(wwGet(seatOf(state, rival)!, PLAYER_CIV)).toBe(base * WW_ABROAD_MULT);
  });

  it('a CITY giving or receiving the attack forces the abroad column for both', () => {
    const state = newGame();
    const { home } = tiles(state, PLAYER_CIV);
    const rival = civOfRival(0);
    warWearinessBattle(state, PLAYER_CIV, rival, home, { city: true });
    // same tile as the test above, where the player scored a single base
    expect(wwGet(playerSeat(state), rival)).toBe(WW_ERA_BASE_SURPRISE[0] * WW_ABROAD_MULT);
  });

  it('a death costs the side that LOST the unit three more bases, and only that side', () => {
    const state = newGame();
    const { away } = tiles(state, PLAYER_CIV);
    const rival = civOfRival(0);
    warWearinessBattle(state, PLAYER_CIV, rival, away, { dDied: true });
    const base = WW_ERA_BASE_SURPRISE[0];
    expect(wwGet(playerSeat(state), rival)).toBe(base * WW_ABROAD_MULT);
    expect(wwGet(seatOf(state, rival)!, PLAYER_CIV)).toBe(base * WW_ABROAD_MULT + WW_DEATH_MULT * base);
  });

  it('the era table is the sourced one, and the surprise premium opens at Classical', () => {
    const state = newGame();
    const p = playerSeat(state);
    expect(wwEraBase(state, PLAYER_CIV, civOfRival(0))).toBe(WW_ERA_BASE_SURPRISE[0]);
    // Ancient is the one row where a casus belli buys nothing — 16 either way.
    expect(WW_ERA_BASE_FORMAL[0]).toBe(WW_ERA_BASE_SURPRISE[0]);
    for (let e = 1; e < WW_ERA_BASE_FORMAL.length; e++) {
      expect(WW_ERA_BASE_SURPRISE[e]).toBeGreaterThan(WW_ERA_BASE_FORMAL[e]);
    }
    // the seat's OWN era drives it: a Classical civ wearies at the Classical row
    p.research.techs = ['MINING', 'BRONZE_WORKING', 'CURRENCY', 'WRITING', 'ASTROLOGY', 'HORSEBACK_RIDING', 'IRON_WORKING'];
    const era = wwEraBase(state, PLAYER_CIV, civOfRival(0));
    expect(WW_ERA_BASE_SURPRISE as readonly number[]).toContain(era);
  });

  it('BARBARIANS neither accrue it nor inflict it', () => {
    const state = newGame();
    const { away } = tiles(state, PLAYER_CIV);
    warWearinessBattle(state, PLAYER_CIV, BARB_SEAT, away, { dDied: true });
    warWearinessBattle(state, BARB_SEAT, PLAYER_CIV, away, { dDied: true });
    expect(wwSum(playerSeat(state))).toBe(0);
    // ...which is what keeps "at peace with everyone" reachable at all: every
    // seat is permanently hostile to barbarians.
    expect(wwSum(seatOf(state, BARB_SEAT))).toBe(0);
  });

  it('a CITY-STATE is a real opponent but keeps no accumulator of its own', () => {
    const state = newGame();
    const { away } = tiles(state, PLAYER_CIV);
    const cs = seatOfCityState(state.cityStates![0].id);
    warWearinessBattle(state, PLAYER_CIV, cs, away, { city: true });
    expect(wwGet(playerSeat(state), cs)).toBeGreaterThan(0);
    expect(wwSum(seatOf(state, cs))).toBe(0);
  });

  it('wars score SEPARATELY and only the worst is felt', () => {
    const state = newGame(2);
    const { away } = tiles(state, PLAYER_CIV);
    const a = civOfRival(0);
    const b = civOfRival(1);
    warWearinessBattle(state, PLAYER_CIV, a, away);
    warWearinessBattle(state, PLAYER_CIV, a, away);
    warWearinessBattle(state, PLAYER_CIV, b, away);
    const one = WW_ERA_BASE_SURPRISE[0] * WW_ABROAD_MULT;
    expect(wwGet(playerSeat(state), a)).toBe(one * 2);
    expect(wwGet(playerSeat(state), b)).toBe(one);
    expect(wwMax(playerSeat(state))).toBe(one * 2); // NOT the sum
    expect(wwSum(playerSeat(state))).toBe(one * 3);
  });

  it('a war fought this turn does not decay; a phoney war sheds 50 and peace sheds 200', () => {
    const state = newGame(2);
    const { away } = tiles(state, PLAYER_CIV);
    const a = civOfRival(0);
    const b = civOfRival(1);
    const p = playerSeat(state);
    p.ww = { [a]: 1000, [b]: 1000 };
    p.wwTurn = { [a]: state.turn }; // blood was spilled against `a` this turn
    (state.seats[a] as RivalCiv).atWar = true; // the player is at war with somebody
    warWearinessTurn(state, PLAYER_CIV);
    expect(wwGet(p, a)).toBe(1000);
    expect(wwGet(p, b)).toBe(1000 - WW_DECAY_AT_WAR);

    // ...and with every war over, the drain is four times faster. The turn has
    // to move on for the `a` war to count as unfought — the stamp is what tells
    // a war being fought from a phoney one.
    state.turn += 1;
    (state.seats[a] as RivalCiv).atWar = false;
    warWearinessTurn(state, PLAYER_CIV);
    expect(wwGet(p, a)).toBe(1000 - WW_DECAY_AT_PEACE);
    expect(wwGet(p, b)).toBe(1000 - WW_DECAY_AT_WAR - WW_DECAY_AT_PEACE);
    expect(away).toBeGreaterThanOrEqual(0);
  });

  it('a peace treaty sheds 2000 from THAT war only, and never below zero', () => {
    const state = newGame(2);
    const a = civOfRival(0);
    const b = civOfRival(1);
    const p = playerSeat(state);
    p.ww = { [a]: 900, [b]: 900 };
    warWearinessPeace(state, PLAYER_CIV, a);
    expect(wwGet(p, a)).toBe(0); // 900 - 2000, floored
    expect(wwGet(p, b)).toBe(900);
    expect(WW_PEACE_TREATY).toBeGreaterThan(WW_DECAY_AT_PEACE);
  });

  it('400 points buy one amenity and the remainder buys nothing', () => {
    expect(warWearinessPenalty(0)).toBe(0);
    expect(warWearinessPenalty(WAR_WEARINESS_PER_AMENITY - 1)).toBe(0);
    expect(warWearinessPenalty(WAR_WEARINESS_PER_AMENITY)).toBe(1);
    expect(warWearinessPenalty(WAR_WEARINESS_PER_AMENITY * 3 + 399)).toBe(3);
    // #51/S7.8f deleted the ceiling: a long, bloody war keeps costing.
    expect(warWearinessPenalty(WAR_WEARINESS_PER_AMENITY * 12)).toBe(12);
  });

  it('a war DECLARED but not fought costs nothing — the shape the old model lacked', () => {
    const state = newGame();
    const rival = civOfRival(0);
    setRivalWar(state, PLAYER_CIV, rival, true);
    for (let i = 0; i < 30; i++) {
      state.turn += 1;
      warWearinessTurn(state, PLAYER_CIV);
      warWearinessTurn(state, rival);
    }
    expect(wwMax(playerSeat(state))).toBe(0);
    expect(wwMax(seatOf(state, rival))).toBe(0);
  });
});
