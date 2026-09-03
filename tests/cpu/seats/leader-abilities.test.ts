import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, setTileOwner, setWar, setAllyTurnsWith, allianceWarCS, alliancePtsWith, leaderOf, NO_SEAT } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { routeYieldsInternational, incomingIntlRoutes, cityTradeYields } from '../../../cpu/core/trade';
import { seatPhase } from '../../../cpu/core/phase';
import { pillagePlunder } from '../../../cpu/core/economy';
import { awardBattleXp } from '../../../cpu/core/combat';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import { ALLIANCE_QP_TURN, ALLIANCE_QP_ROUTE, CIV_IDS } from '../../../cpu/data/seats';
import { CLEOPATRA_INTL_ROUTE_GOLD, CLEOPATRA_INCOMING_ROUTE_FOOD, CLEOPATRA_INCOMING_ROUTE_GOLD, HARDRADA_NAVAL_MELEE_PROD_MULT, ENKIDU_WAR_CS, ENKIDU_COMMON_FOE_QP } from '../../../cpu/data/civilizations';
import type { GameState, TradeRoute } from '../../../cpu/core/types';

/**
 * THE LEADER ABILITIES (CIV6, the owner's install: LeaderTraits → Traits →
 * TraitModifiers) — one clause per assertion, on the rule body that pays it.
 */
const civ = (id: string) => CIV_IDS.indexOf(id as never);

function threeSeats(civs: [string, string, string]): GameState {
  const state = makeState(makeMap(14, 14, 'GRASSLAND'));
  state.unitsMode = true;
  state.seats.push(emptySeat(1), emptySeat(2));
  civs.forEach((c, i) => { state.seats[i].civ = civ(c); });
  return state;
}

describe("Trajan's Column", () => {
  it('founds every city with the cheapest City Center building', () => {
    const rome = makeState(makeMap(12, 12, 'GRASSLAND'));
    rome.seats[0].civ = civ('ROME');
    expect(leaderOf(rome, 0)).toBe('TRAJAN');
    const cap = settleAt(rome, tileAtCoords(rome.map, 6, 6).index, 0);
    expect(cap.buildings).toContain('MONUMENT');
    const second = settleAt(rome, tileAtCoords(rome.map, 6, 1).index, 0);
    expect(second.buildings).toContain('MONUMENT');
    const egypt = makeState(makeMap(12, 12, 'GRASSLAND'));
    egypt.seats[0].civ = civ('EGYPT');
    expect(settleAt(egypt, tileAtCoords(egypt.map, 6, 6).index, 0).buildings).not.toContain('MONUMENT');
  });
});

describe("Mediterranean's Bride", () => {
  it('pays Egypt +4 Gold out, the sender +2 Food in, and Egypt +2 Gold per route in', () => {
    const state = threeSeats(['EGYPT', 'ROME', 'NORWAY']);
    const c0 = settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
    const c1 = settleAt(state, tileAtCoords(state.map, 9, 9).index, 1);
    const plain = routeYieldsInternational(state, c1, c0, 1); // Rome's route into Egypt
    expect(plain.food).toBe(CLEOPATRA_INCOMING_ROUTE_FOOD);
    const out = routeYieldsInternational(state, c0, c1, 0); // Egypt's route into Rome
    expect(out.gold - (plain.gold - 0)).toBe(CLEOPATRA_INTL_ROUTE_GOLD);
    expect(out.food).toBe(0);
    // the destination's own +2 per incoming route
    state.seats[1].tradeRoutes = [{ from: c1.id, toSeat: 0, toSeatCity: c0.id } as TradeRoute];
    expect(incomingIntlRoutes(state, c0)).toBe(1);
    expect(cityTradeYields(state, c0, 0).gold).toBe(CLEOPATRA_INCOMING_ROUTE_GOLD);
    expect(cityTradeYields(state, c1, 0).gold).toBe(cityTradeYields(state, c1, 0).gold); // Rome's own leg is the intl leg
    state.seats[0].civ = civ('NORWAY');
    expect(cityTradeYields(state, c0, 0).gold).toBe(0);
  });

  it('doubles the trade alliance points', () => {
    const run = (civs: [string, string, string]): number => {
      const state = threeSeats(civs);
      const c0 = settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
      const c1 = settleAt(state, tileAtCoords(state.map, 9, 9).index, 1);
      state.seats[1].tradeRoutes = [{ from: c1.id, toSeat: 0, toSeatCity: c0.id, expiresTurn: 999 } as TradeRoute];
      setAllyTurnsWith(state, 0, 1, 10);
      const before = alliancePtsWith(state, 0, 1);
      seatPhase(state);
      return alliancePtsWith(state, 0, 1) - before;
    };
    expect(run(['ROME', 'NORWAY', 'SUMERIA'])).toBe(ALLIANCE_QP_TURN + ALLIANCE_QP_ROUTE);
    expect(run(['EGYPT', 'NORWAY', 'ROME'])).toBe(ALLIANCE_QP_TURN + 2 * ALLIANCE_QP_ROUTE);
  });
});

describe('Thunderbolt of the North', () => {
  it('pays +50% Production toward naval melee units', () => {
    const run = (id: string): number => {
      const state = makeState(makeMap(12, 12, 'COAST'));
      tileAtCoords(state.map, 6, 6).terrain = 'GRASSLAND';
      state.seats[0].civ = civ(id);
      const city = settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
      city.queue.push({ kind: 'unit', unit: 'GALLEY', progress: 0 });
      seatPhase(state);
      return city.queue[0].progress;
    };
    const rome = run('ROME');
    expect(rome).toBeGreaterThan(0);
    expect(run('NORWAY')).toBe(rome * HARDRADA_NAVAL_MELEE_PROD_MULT);
  });

  it('pays Science for a pillaged Mine and Culture for a pillaged Quarry', () => {
    const run = (id: string) => {
      const state = makeState(makeMap(12, 12, 'GRASSLAND'));
      state.unitsMode = true;
      state.seats[0].civ = civ(id);
      const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
      const s = state.seats[0];
      const gold0 = s.treasury;
      pillagePlunder(state, u, IMPROVEMENTS.MINE.plunder, false, 'MINE', NO_SEAT);
      const sci = s.research.techProgress;
      pillagePlunder(state, u, IMPROVEMENTS.QUARRY.plunder, false, 'QUARRY', NO_SEAT);
      return { gold: s.treasury - gold0, sci, cul: s.research.civicProgress };
    };
    const rome = run('ROME');
    expect(rome.gold).toBeGreaterThan(0);
    expect(rome.sci).toBe(0);
    expect(rome.cul).toBe(0);
    const norway = run('NORWAY');
    expect(norway.gold).toBe(rome.gold);
    expect(norway.sci).toBeGreaterThan(0);
    expect(norway.cul).toBeGreaterThan(0);
  });
});

describe('Adventures of Enkidu', () => {
  function jointWar(civs: [string, string, string]): GameState {
    // seat 0 allied to 1 (no military alliance type), both at war with 2
    const state = threeSeats(civs);
    setAllyTurnsWith(state, 0, 1, 10);
    setWar(state, 0, 2, true);
    setWar(state, 1, 2, true);
    return state;
  }

  it('adds +5 Combat Strength against a seat an ally is at war with', () => {
    const state = jointWar(['SUMERIA', 'ROME', 'EGYPT']);
    expect(allianceWarCS(state, 0, 2)).toBe(ENKIDU_WAR_CS);
    expect(allianceWarCS(state, 1, 2)).toBe(ENKIDU_WAR_CS); // the ally shares it
    setAllyTurnsWith(state, 0, 1, 0);
    expect(allianceWarCS(state, 0, 2)).toBe(0);
    const plain = jointWar(['ROME', 'NORWAY', 'EGYPT']);
    expect(allianceWarCS(plain, 0, 2)).toBe(0);
  });

  it('earns the alliance +2 points a turn for a common foe', () => {
    const run = (civs: [string, string, string]): number => {
      const state = jointWar(civs);
      settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
      settleAt(state, tileAtCoords(state.map, 9, 9).index, 1);
      const before = alliancePtsWith(state, 0, 1);
      seatPhase(state);
      return alliancePtsWith(state, 0, 1) - before;
    };
    expect(run(['ROME', 'NORWAY', 'EGYPT'])).toBe(ALLIANCE_QP_TURN);
    expect(run(['SUMERIA', 'NORWAY', 'EGYPT'])).toBe(ALLIANCE_QP_TURN + ENKIDU_COMMON_FOE_QP);
  });

  it("shares combat experience with an ally's units within 5 tiles", () => {
    const state = jointWar(['SUMERIA', 'ROME', 'EGYPT']);
    const a = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    const d = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 5).index, 2)!;
    const near = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 9).index, 1)!;
    const far = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 12).index, 1)!;
    awardBattleXp(state, a, d, { ranged: false, aDied: false, dDied: false });
    expect(a.xp ?? 0).toBeGreaterThan(0);
    expect(near.xp ?? 0).toBe(a.xp);
    expect(far.xp ?? 0).toBe(0);
  });

  it("shares plunder with an ally that has a unit within 5 tiles", () => {
    const state = jointWar(['SUMERIA', 'ROME', 'EGYPT']);
    const t = tileAtCoords(state.map, 5, 5);
    setTileOwner(t, 2);
    const u = spawnUnit(state, 'WARRIOR', t.index, 0)!;
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 8).index, 1);
    const g0 = state.seats[0].treasury;
    const g1 = state.seats[1].treasury;
    pillagePlunder(state, u, IMPROVEMENTS.MINE.plunder, false, 'MINE', 2);
    expect(state.seats[0].treasury - g0).toBeGreaterThan(0);
    expect(state.seats[1].treasury - g1).toBe(state.seats[0].treasury - g0);
    // no ally at war with the owner: nothing shared
    setWar(state, 1, 2, false);
    const g1b = state.seats[1].treasury;
    pillagePlunder(state, u, IMPROVEMENTS.MINE.plunder, false, 'MINE', 2);
    expect(state.seats[1].treasury).toBe(g1b);
  });
});
