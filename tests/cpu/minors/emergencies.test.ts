import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { civsAtWar, seatOf } from '../../../cpu/core/seats';
import { createGame } from '../../../cpu/core/game';
import { loyaltyDelta, transferCity, worldCongress } from '../../../cpu/core/phase';
import { settleFirstCity } from '../helpers';
import {
  EMERGENCIES, EMERGENCY_MILITARY, EMERGENCY_MEMBER_FAVOR, EMERGENCY_TARGET_FAVOR,
  EMERGENCY_MEMBER_CS, EMERGENCY_MEMBER_MP, EMERGENCY_TARGET_LOYALTY,
  EMERGENCY_MEMBER_HEAL, EMERGENCY_TARGET_STRIKE_CS, EMERGENCY_ENVOY_GOLD,
  EMERGENCY_CS_ROUTE_GOLD, SPECIAL_SESSION_COST, SPECIAL_SESSION_GAP, CONGRESS_INTERVAL,
  EMERGENCY_SLOTS, EMERGENCY_NUCLEAR, EMERGENCY_NUKE_TARGET_CS, EMERGENCY_NUKE_LOYALTY_CUT,
} from '../../../cpu/data/seats';
import {
  EMG_CALLED, EMG_PENDING, EMG_RUNNING, EMERGENCY_CITY_STATE, emergencies, emergencyAttackCS,
  emergencyCsRouteGold, emergencyEnvoyGold, emergencyHeal, emergencyLoyalty, emergencyMoveBonus,
  emergencyPressureCut, emergencyStrikeCS, raiseEmergency,
} from '../../../cpu/core/emergency';
import { grievancesAgainst } from '../../../cpu/core/grievance';
import { rangedAttack } from '../../../cpu/core/combat';
import { spawnUnit, unitPassable } from '../../../cpu/core/units';
import { neighbors } from '../../../world/hex';

// EMERGENCIES (GS) run as SPECIAL SESSIONS of the World Congress. Sourced at
// the catalog: a sponsor pays 30 favor, the previous session must be 15 turns
// back, the session sits the turn AFTER the call, members are the seats that
// voted for it, they go to war with the target WITHOUT grievances, the limit
// is 30 turns, and the reward is 100 favor to the members or 200 to the target.
//
// REACHABILITY: the gate reaches a conquest, so the MILITARY trigger fires
// there; the rest of the ladder — the sponsorship, the vote, the deadline and
// every reward — is these pokes' bar.

function twoCivs() {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, opponents: 1,
  });
  settleFirstCity(state, 0);
  settleFirstCity(state, 1);
  state.autoResearch = false;
  // Medieval, so the Congress sits at all
  for (const sx of state.seats) sx.research.techs.push('APPRENTICESHIP');
  return state;
}

/** Seat 0 takes seat 1's only city; the record that follows is the emergency. */
function conquer(state: ReturnType<typeof twoCivs>) {
  const a = seatOf(state, 0)!, b = state.seats[1] as Seat;
  transferCity(state, b.seat, a, b.cities[0], 'conquered');
  return a.cities[a.cities.length - 1];
}

describe('emergencies: the trigger and the call', () => {
  it('a conquest records a pending Military Emergency, and names the loser as affected', () => {
    const state = twoCivs();
    const taken = conquer(state);
    const list = emergencies(state);
    expect(list.length).toBe(1);
    expect(list[0].kind).toBe(EMERGENCY_MILITARY);
    expect(list[0].target).toBe(0);      // the conqueror is the target
    expect(list[0].city).toBe(taken.id);
    expect(list[0].phase).toBe(EMG_PENDING);
    expect(list[0].affected).toEqual([1]);
    expect(list[0].members).toEqual([]);
  });

  it('the same outrage is not recorded twice, and the table is finite', () => {
    const state = twoCivs();
    const taken = conquer(state);
    raiseEmergency(state, EMERGENCY_MILITARY, 0, taken.id, [1]);
    expect(emergencies(state).length).toBe(1);
    raiseEmergency(state, EMERGENCY_MILITARY, 0, taken.id + 1, [1]);
    raiseEmergency(state, EMERGENCY_MILITARY, 0, taken.id + 2, [1]);
    expect(emergencies(state).length).toBe(EMERGENCY_SLOTS);
    // and nobody left to bring it is no record at all
    raiseEmergency(state, EMERGENCY_CITY_STATE, 0, taken.id + 3, []);
    expect(emergencies(state).length).toBe(EMERGENCY_SLOTS);
  });

  it('a sponsor pays 30 favor and the session sits the turn AFTER', () => {
    const state = twoCivs();
    conquer(state);
    const b = state.seats[1] as Seat;
    b.diplomaticFavor = SPECIAL_SESSION_COST + 5;
    state.turn = 7;
    worldCongress(state);
    const e = emergencies(state)[0];
    expect(e.phase).toBe(EMG_CALLED);
    expect(e.act).toBe(8);
    expect(b.diplomaticFavor).toBe(5);
  });

  it('no sponsor with the favor, no call', () => {
    const state = twoCivs();
    conquer(state);
    (state.seats[1] as Seat).diplomaticFavor = SPECIAL_SESSION_COST - 1;
    state.turn = 7;
    worldCongress(state);
    expect(emergencies(state)[0].phase).toBe(EMG_PENDING);
    expect((state.seats[1] as Seat).diplomaticFavor).toBe(SPECIAL_SESSION_COST - 1);
  });

  it('a session 15 turns back blocks the call, and a quiet gap unblocks it', () => {
    const state = twoCivs();
    conquer(state);
    (state.seats[1] as Seat).diplomaticFavor = 200;
    state.lastSessionTurn = 10;
    state.turn = 10 + SPECIAL_SESSION_GAP - 1;
    worldCongress(state);
    expect(emergencies(state)[0].phase).toBe(EMG_PENDING);
    state.turn = 10 + SPECIAL_SESSION_GAP;
    worldCongress(state);
    expect(emergencies(state)[0].phase).toBe(EMG_CALLED);
  });

  it('a pre-Medieval world records the condition and calls nothing', () => {
    const state = twoCivs();
    for (const sx of state.seats) sx.research.techs = [];
    conquer(state);
    (state.seats[1] as Seat).diplomaticFavor = 200;
    state.turn = 7;
    worldCongress(state);
    expect(emergencies(state)[0].phase).toBe(EMG_PENDING);   // it does not expire
  });
});

describe('emergencies: the session, the war and the clock', () => {
  function called(state: ReturnType<typeof twoCivs>) {
    conquer(state);
    (state.seats[1] as Seat).diplomaticFavor = 200;
    state.turn = 7;
    worldCongress(state);          // sponsored
    state.turn = 8;
    worldCongress(state);          // held
    return emergencies(state)[0];
  }

  it('the session passes, the members go to war, and the target never joins', () => {
    const state = twoCivs();
    const e = called(state);
    expect(e.phase).toBe(EMG_RUNNING);
    expect(e.members).toEqual([1]);
    expect(e.act).toBe(8 + EMERGENCIES[EMERGENCY_MILITARY].turns);
    expect(civsAtWar(state, 0, 1)).toBe(true);
    // CIV6: the emergency's war "won't accrue Grievances"
    expect(grievancesAgainst(state, 1)).toBe(0);
    expect(state.lastSessionTurn).toBe(8);
  });

  it('while it runs: +2 CS for a member, -2 for the target attacking one, +1 MP on the target ground, +20 loyalty in the city', () => {
    const state = twoCivs();
    const e = called(state);
    expect(emergencyAttackCS(state, 1, 0)).toBe(EMERGENCY_MEMBER_CS);
    // CIV6 (MILITARY_EMERGENCY_MEMBER_COMBAT_STRENGTH_DEFEND): the target
    // attacking a member takes the -2 itself
    expect(emergencyAttackCS(state, 0, 1)).toBe(-EMERGENCY_MEMBER_CS);
    expect(emergencyMoveBonus(state, 1, 0)).toBe(EMERGENCY_MEMBER_MP);
    expect(emergencyMoveBonus(state, 1, 1)).toBe(0);  // its own ground
    expect(emergencyLoyalty(state, 0, e.city)).toBe(EMERGENCY_TARGET_LOYALTY);
    expect(emergencyLoyalty(state, 0, e.city + 999)).toBe(0);
    // the City-State emergency's running buff is the loyalty alone
    e.kind = EMERGENCY_CITY_STATE;
    expect(emergencyAttackCS(state, 1, 0)).toBe(0);
    expect(emergencyAttackCS(state, 0, 1)).toBe(0);
    expect(emergencyMoveBonus(state, 1, 0)).toBe(0);
    expect(emergencyLoyalty(state, 0, e.city)).toBe(EMERGENCY_TARGET_LOYALTY);
  });

  it('the running term reaches an ordered RANGED shot, both halves', () => {
    const shot = (shooter: number, victim: number, member: boolean): number => {
      const state = twoCivs();
      const e = called(state);
      if (!member) e.members = [];
      const free = (i: number) => unitPassable(state.map.tiles[i])
        && !state.units.some((u) => u.tileIndex === i);
      const a = state.map.tiles.find((t) => free(t.index)
        && neighbors(state.map, t).some((n) => free(n.index)))!;
      const b = neighbors(state.map, a).find((n) => free(n.index))!;
      const archer = spawnUnit(state, 'ARCHER', a.index, shooter)!;
      archer.tileIndex = a.index;
      spawnUnit(state, 'WARRIOR', b.index, victim)!.tileIndex = b.index;
      const log: string[] = [];
      (globalThis as any).__cbLog = log;
      try {
        expect(rangedAttack(state, archer.id, b.index).ok).toBe(true);
      } finally {
        delete (globalThis as any).__cbLog;
      }
      const line = log.find((l) => l.startsWith('k:rng '));
      expect(line, JSON.stringify(log)).toBeDefined();
      return Number(line!.match(/diff(-?\d+)/)![1]);
    };
    expect(shot(1, 0, true) - shot(1, 0, false)).toBe(EMERGENCY_MEMBER_CS * 10);
    expect(shot(0, 1, true) - shot(0, 1, false)).toBe(-EMERGENCY_MEMBER_CS * 10);
  });

  it('losing the contested city pays the MEMBERS, and their reward is permanent', () => {
    const state = twoCivs();
    const e = called(state);
    const a = seatOf(state, 0)!, b = state.seats[1] as Seat;
    const before = b.diplomaticFavor ?? 0;
    a.cities = a.cities.filter((c) => c.id !== e.city);   // liberated
    state.turn = 9;
    worldCongress(state);
    expect(emergencies(state).length).toBe(0);
    expect(b.diplomaticFavor).toBe(before + EMERGENCY_MEMBER_FAVOR);
    expect(b.emgHeal?.[0]).toBe(1);
    expect(emergencyHeal(state, 1, 0)).toBe(EMERGENCY_MEMBER_HEAL);
    expect(emergencyHeal(state, 1, 1)).toBe(0);
    expect(emergencyStrikeCS(state, 0, 1)).toBe(0);
  });

  it('the deadline pays the TARGET, and its reward is permanent too', () => {
    const state = twoCivs();
    const e = called(state);
    const a = seatOf(state, 0)!;
    const before = a.diplomaticFavor ?? 0;
    state.turn = e.act;
    worldCongress(state);
    expect(emergencies(state).length).toBe(0);
    expect(a.diplomaticFavor).toBe(before + EMERGENCY_TARGET_FAVOR);
    expect(a.emgStrike?.[1]).toBe(1);
    expect(emergencyStrikeCS(state, 0, 1)).toBe(EMERGENCY_TARGET_STRIKE_CS);
    expect(emergencyStrikeCS(state, 0, 0)).toBe(0);
    expect(emergencyHeal(state, 1, 0)).toBe(0);
  });

  it('a target that votes it down keeps its city and the record dies', () => {
    const state = twoCivs();
    conquer(state);
    (state.seats[1] as Seat).diplomaticFavor = 200;
    state.turn = 7;
    worldCongress(state);
    // seat 0 buys enough weight that the NO side outvotes the lone member
    seatOf(state, 0)!.diplomaticFavor = 10 + 20 + 30;
    seatOf(state, 0)!.congressVote = [null, null, null, [1, 0, 3]];
    state.turn = 8;
    worldCongress(state);
    expect(emergencies(state).length).toBe(0);
    expect(civsAtWar(state, 0, 1)).toBe(false);
    // the losing side is refunded whole — here the lone yes vote spent nothing
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(0);
  });
});

describe('emergencies: the nuclear terms', () => {
  // CIV6 (Nuclear Emergency): success — "Target units have -3 CS when
  // fighting Member units"; failure — "Member cities exert one less Loyalty
  // pressure". Neither outcome pays the Military rows.
  function nuclear(state: ReturnType<typeof twoCivs>) {
    const cap = seatOf(state, 0)!.cities[0];
    raiseEmergency(state, EMERGENCY_NUCLEAR, 0, cap.id, [1]);
    (state.seats[1] as Seat).diplomaticFavor = 200;
    state.turn = 7;
    worldCongress(state);          // sponsored
    state.turn = 8;
    worldCongress(state);          // held
    const e = emergencies(state)[0];
    expect(e.kind).toBe(EMERGENCY_NUCLEAR);
    expect(e.phase).toBe(EMG_RUNNING);
    return e;
  }

  it('taking the capital leaves the target at -3 CS against every member, both ways', () => {
    const state = twoCivs();
    const e = nuclear(state);
    const a = seatOf(state, 0)!, b = state.seats[1] as Seat;
    a.cities = a.cities.filter((c) => c.id !== e.city);
    state.turn = 9;
    worldCongress(state);
    expect(emergencies(state).length).toBe(0);
    expect(b.emgNukeCS?.[0]).toBe(1);
    expect(b.emgHeal).toBeUndefined();
    expect(emergencyAttackCS(state, 1, 0)).toBe(EMERGENCY_NUKE_TARGET_CS);
    expect(emergencyAttackCS(state, 0, 1)).toBe(-EMERGENCY_NUKE_TARGET_CS);
    expect(emergencyPressureCut(state, 1)).toBe(0);
  });

  it('a target that holds out leaves every member city pressing one citizen lighter', () => {
    const state = twoCivs();
    const e = nuclear(state);
    const a = seatOf(state, 0)!, b = state.seats[1] as Seat;
    const home = b.cities[0];
    const tier = 'CONTENT';
    state.turn = e.act;
    worldCongress(state);
    expect(emergencies(state).length).toBe(0);
    expect(b.emgNukeCut).toBe(1);
    expect(a.emgNukeCut).toBeUndefined();
    expect(a.emgStrike).toBeUndefined();
    expect(emergencyPressureCut(state, 1)).toBe(EMERGENCY_NUKE_LOYALTY_CUT);
    expect(emergencyPressureCut(state, 0)).toBe(0);
    expect(emergencyAttackCS(state, 0, 1)).toBe(0);
    // a lone citizen pressing one lighter presses nothing on its own city
    home.population = 1;
    b.emgNukeCut = 0;
    const whole = loyaltyDelta(state, home, tier);
    b.emgNukeCut = 1;
    expect(loyaltyDelta(state, home, tier)).toBeLessThan(whole);
  });
});

describe('emergencies: the city-state rewards', () => {
  it('the envoy income and the minor-leg gold read their counters', () => {
    const state = twoCivs();
    const b = state.seats[1] as Seat;
    expect(emergencyEnvoyGold(state, 1, 4)).toBe(0);
    b.emgEnvoyGold = 2;
    expect(emergencyEnvoyGold(state, 1, 4)).toBe(2 * EMERGENCY_ENVOY_GOLD * 4);
    expect(emergencyCsRouteGold(state, 1)).toBe(0);
    b.emgRouteGold = 3;
    expect(emergencyCsRouteGold(state, 1)).toBe(3 * EMERGENCY_CS_ROUTE_GOLD);
  });

  it('a Regular Session stamps the quiet clock the Special Session reads', () => {
    const state = twoCivs();
    state.turn = CONGRESS_INTERVAL;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
    expect(state.lastSessionTurn).toBe(CONGRESS_INTERVAL);
  });
});
