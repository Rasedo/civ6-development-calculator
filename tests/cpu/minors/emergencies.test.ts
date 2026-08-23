import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { civsAtWar, seatOf } from '../../../cpu/core/seats';
import { createGame } from '../../../cpu/core/game';
import { transferCity, worldCongress } from '../../../cpu/core/phase';
import { settleFirstCity } from '../helpers';
import {
  EMERGENCIES, EMERGENCY_MILITARY, EMERGENCY_MEMBER_FAVOR, EMERGENCY_TARGET_FAVOR,
  EMERGENCY_MEMBER_CS, EMERGENCY_MEMBER_MP, EMERGENCY_TARGET_LOYALTY,
  EMERGENCY_MEMBER_HEAL, EMERGENCY_TARGET_STRIKE_CS, EMERGENCY_ENVOY_GOLD,
  EMERGENCY_CS_ROUTE_GOLD, SPECIAL_SESSION_COST, SPECIAL_SESSION_GAP, CONGRESS_INTERVAL,
  EMERGENCY_SLOTS,
} from '../../../cpu/data/seats';
import {
  EMG_CALLED, EMG_PENDING, EMG_RUNNING, EMERGENCY_CITY_STATE, emergencies, emergencyAttackCS,
  emergencyCsRouteGold, emergencyEnvoyGold, emergencyHeal, emergencyLoyalty, emergencyMoveBonus,
  emergencyStrikeCS, raiseEmergency,
} from '../../../cpu/core/emergency';
import { grievancesAgainst } from '../../../cpu/core/grievance';

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

  it('while it runs: +2 CS for a member, +1 MP on the target ground, +20 loyalty in the city', () => {
    const state = twoCivs();
    const e = called(state);
    expect(emergencyAttackCS(state, 1, 0)).toBe(EMERGENCY_MEMBER_CS);
    expect(emergencyAttackCS(state, 0, 1)).toBe(0);   // not a member of anything
    expect(emergencyMoveBonus(state, 1, 0)).toBe(EMERGENCY_MEMBER_MP);
    expect(emergencyMoveBonus(state, 1, 1)).toBe(0);  // its own ground
    expect(emergencyLoyalty(state, 0, e.city)).toBe(EMERGENCY_TARGET_LOYALTY);
    expect(emergencyLoyalty(state, 0, e.city + 999)).toBe(0);
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
