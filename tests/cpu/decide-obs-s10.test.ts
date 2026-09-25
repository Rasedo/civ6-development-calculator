/**
 * THE NEUTRAL OBSERVATION'S SEAT SCALARS, TS side: the `nuke`, `envoy`,
 * `congress`, `gp` and `belief` groups (cpu/core/decideObsSeat.ts), each in the shape
 * `gpu/core/neutral.py` `seat_obs` emits and the gate compares every turn.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { foundCity } from '../../cpu/core/game';
import { emptySeat } from '../../cpu/core/seats';
import { seatGroups } from '../../cpu/core/decideObs';
import { SEAT_GROUPS } from '../../cpu/core/decideObsSeat';
import { congressSessionDue, specialSessionDue } from '../../cpu/core/congress';
import { EMG_CALLED } from '../../cpu/core/emergency';
import { GP_CLASSES, GREAT_PEOPLE } from '../../cpu/data/greatPeople';
import { BELIEF_CATALOGS } from '../../cpu/data/religion';
import { TECHS, ERAS } from '../../cpu/data/techs';
import {
  CONGRESS_BORDER_CONTROL, CONGRESS_INTERVAL, CONGRESS_MERCENARY, CONGRESS_MIGRATION,
  CONGRESS_MIN_ERA, CONGRESS_VOTE_STEP,
} from '../../cpu/data/seats';
import type { CityState, GameState } from '../../cpu/core/types';

function scene(): GameState {
  const state = makeState(makeMap(20, 20));
  state.seats.push(emptySeat(1));
  const at = (c: number, r: number) => tileAtCoords(state.map, c, r).index;
  expect(foundCity(state, at(5, 5), 0).city).toBeTruthy();
  expect(foundCity(state, at(14, 14), 1).city).toBeTruthy();
  return state;
}

/** the last era's first tech: holding it puts the world past every era gate */
const LAST_TECH = Object.keys(TECHS).find((id) => TECHS[id].era === ERAS[ERAS.length - 1])!;

describe('seat scalar groups', () => {
  it('registers the GPU group names', () => {
    expect(Object.keys(SEAT_GROUPS)).toEqual(['nuke', 'envoy', 'congress', 'gp', 'belief']);
    expect(Object.keys(seatGroups(scene(), 0))).toEqual(expect.arrayContaining(['nuke', 'envoy', 'congress', 'gp', 'belief']));
  });

  it('nuke: -1 each without a device', () => {
    expect(SEAT_GROUPS.nuke(scene(), 0)).toEqual({ device: -1, tile: -1 });
  });

  it('envoy: the bank, and the store per roster index, -1 unmet or gone', () => {
    const state = scene();
    state.seats[0].envoysAvailable = 3;
    state.cityStateMax = 4;
    state.cityStates.push(
      { id: 0, met: [0, 1], envoys: { 0: 2, 1: 5 } } as unknown as CityState,
      { id: 1, met: [1], envoys: { 1: 1 } } as unknown as CityState,
      { id: 3, met: [0], envoys: {} } as unknown as CityState,
    );
    // id 2 is gone (captured): -1 like an unmet one
    expect(SEAT_GROUPS.envoy(state, 0)).toEqual({ avail: 3, held: [2, -1, -1, 0] });
    expect(SEAT_GROUPS.envoy(state, 1)).toEqual({ avail: 0, held: [5, 1, -1, -1] });
  });

  it('gp: offer, passer, frozen price and floored points per class', () => {
    const state = scene();
    const n = GP_CLASSES.length;
    state.gpOffer = GP_CLASSES.map((_c, i) => (i === 0 ? 4 : i === 1 ? -2 : -1));
    state.gpPrice = GP_CLASSES.map((_c, i) => (i === 0 ? 60 : 0));
    state.gpPassedBy = GP_CLASSES.map((_c, i) => (i === 0 ? 1 : -1));
    state.seats[0].gpp[GP_CLASSES[0]] = 12.75;
    expect(SEAT_GROUPS.gp(state, 0)).toEqual({
      offer: [4, -2, ...Array(n - 2).fill(-1)],
      passed_by: [1, ...Array(n - 1).fill(-1)],
      price: [60, ...Array(n - 1).fill(0)],
      points: [12, ...Array(n - 1).fill(0)],
    });
  });

  it('belief: the founding and enhancing gates, the held rows, each class\'s open rows', () => {
    const state = scene();
    const all = (c: number) => Object.keys(BELIEF_CATALOGS[c]).map((_id, i) => i);
    expect(SEAT_GROUPS.belief(state, 0)).toEqual({
      found: false, enhance: false, held: [-1, -1, -1, -1],
      follower: all(0), worship: all(1), founder: all(2), enhancer: all(3),
    });
    // a pantheon, a completed Holy Site, an activated prophet: founding opens
    const s = state.seats[0];
    s.religion.pantheon = 'GOD_OF_THE_SEA';
    const hs = tileAtCoords(state.map, 6, 5);
    s.cities[0].districts.push({ type: 'HOLY_SITE', tileIndex: hs.index });
    hs.district = 'HOLY_SITE';
    hs.districtComplete = true;
    s.gpActivated = [GREAT_PEOPLE.PROPHET[0].id];
    expect((SEAT_GROUPS.belief(state, 0) as Record<string, unknown>).found).toBe(true);
    // another religion's Mosque leaves the Worship pool; a founded religion
    // holds its rows and needs a second prophet to enhance
    const worship = Object.keys(BELIEF_CATALOGS[1]);
    state.claimedBeliefs.push('MOSQUE', 'CHORAL_MUSIC', 'TITHE');
    s.religion.founded = true;
    s.religion.follower = 'CHORAL_MUSIC';
    s.religion.founder = 'TITHE';
    const g = SEAT_GROUPS.belief(state, 0) as Record<string, unknown>;
    expect([g.found, g.enhance]).toEqual([false, false]);
    expect(g.held).toEqual([Object.keys(BELIEF_CATALOGS[0]).indexOf('CHORAL_MUSIC'), -1,
      Object.keys(BELIEF_CATALOGS[2]).indexOf('TITHE'), -1]);
    expect(g.worship).toEqual(all(1).filter((i) => worship[i] !== 'MOSQUE'));
    s.gpActivated.push(GREAT_PEOPLE.PROPHET[1].id);
    expect((SEAT_GROUPS.belief(state, 0) as Record<string, unknown>).enhance).toBe(true);
  });

  it('congress: nothing sits off a session turn or before the era', () => {
    const state = scene();
    state.turn = CONGRESS_INTERVAL - 1;      // the coming step is a session turn...
    state.seats[0].diplomaticFavor = 7.9;
    state.congressSlate = [CONGRESS_MIGRATION, CONGRESS_BORDER_CONTROL];
    // ...but the world is Ancient: the Congress is closed
    expect(SEAT_GROUPS.congress(state, 0)).toEqual({
      slate: [-1, -1], pref_outcome: [-1, -1], pref_target: [-1, -1], dv: false,
      leader: -1, special: false, favor: 7, vote_step: CONGRESS_VOTE_STEP,
    });
    expect(congressSessionDue(CONGRESS_INTERVAL, CONGRESS_MIN_ERA - 1)).toBe(false);
    expect(congressSessionDue(CONGRESS_INTERVAL + 1, CONGRESS_MIN_ERA)).toBe(false);
    expect(congressSessionDue(2 * CONGRESS_INTERVAL, CONGRESS_MIN_ERA)).toBe(true);
  });

  it('congress: the announced slate, the preference per slot, the DV leader', () => {
    const state = scene();
    state.seats[1].research.techs.push(LAST_TECH);
    state.turn = CONGRESS_INTERVAL - 1;
    state.congressSlate = [CONGRESS_MIGRATION, CONGRESS_MERCENARY];
    state.seats[1].faith = 50;
    state.seats[1].treasury = 10;
    state.seats[1].diplomaticPoints = 3;
    const g = SEAT_GROUPS.congress(state, 1) as Record<string, unknown>;
    expect(g.slate).toEqual([CONGRESS_MIGRATION, CONGRESS_MERCENARY]);
    // Migration: A on yourself; Mercenary Companies: B on the currency held most
    expect(g.pref_outcome).toEqual([0, 1]);
    expect(g.pref_target).toEqual([1, 1]);
    expect(g.dv).toBe(true);
    expect(g.leader).toBe(1);
    // before the first announcement the slate is empty: nothing to prefer
    state.congressSlate = undefined;
    const g0 = SEAT_GROUPS.congress(state, 0) as Record<string, unknown>;
    expect([g0.slate, g0.pref_outcome, g0.pref_target]).toEqual([[-1, -1], [-1, -1], [-1, -1]]);
  });

  it('congress: a Special Session sits once a called emergency is due', () => {
    const state = scene();
    state.seats[0].research.techs.push(LAST_TECH);
    state.turn = 10;
    state.emergencies = [{ kind: 0, target: 1, city: 0, phase: EMG_CALLED, act: 12, affected: [0], members: [] }];
    expect((SEAT_GROUPS.congress(state, 0) as Record<string, unknown>).special).toBe(false);
    state.turn = 11;
    expect((SEAT_GROUPS.congress(state, 0) as Record<string, unknown>).special).toBe(true);
    // the Congress closed: no session of either kind
    expect(specialSessionDue(state, 12, CONGRESS_MIN_ERA - 1)).toBe(false);
  });
});
