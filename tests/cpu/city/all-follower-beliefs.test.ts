import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import {
  getModifiers, withFollowerBelief, followerReligionsForCity, religionsPresent,
} from '../../../cpu/core/effects';
import { ALL_FOLLOWER_BELIEFS_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (Dharma, EFFECT_ADJUST_GAINS_ALL_FOLLOWER_BELIEFS): "Receives Follower
 * Belief bonuses in a city from each Religion that has at least 1 Follower."
 *
 * Every other seat pays exactly ONE follower belief — its city's own followed
 * religion. This is the QUANTIFIER, and it was the one half of the ability
 * with no reader: the row, the `Modifiers` field, the wire and the GPU row
 * list all shipped, and nothing consumed any of them (C-57).
 *
 * The GPU twin is tests/gpu/all_follower_beliefs_test.py.
 */
const civRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);

/** Two rival religions, each with a follower belief that pays a SHRINE a
 *  different yield, so which beliefs landed is readable off one building. */
function scene(row: number): GameState {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats.push(emptySeat(2));
  state.seats[0].civ = row;
  settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  for (const [s, follower] of [[0, 'FEED_THE_WORLD'], [1, 'CHORAL_MUSIC']] as const) {
    const rel = seatOf(state, s as number)!.religion;
    rel.founded = true;
    rel.follower = follower;
  }
  const city = seatOf(state, 0)!.cities[0];
  city.followedReligion = 0;
  city.religionPressure = [10, 4];      // both present, seat 0's the stronger
  return state;
}

const shrineOf = (state: GameState) => {
  const base = getModifiers(state, 0);
  const city = seatOf(state, 0)!.cities[0];
  const m = withFollowerBelief(state, base, followerReligionsForCity(base, city));
  return m.buildingYieldAdd.SHRINE ?? {};
};

describe('a city pays every present religion`s follower belief only for Dharma', () => {
  it('reads the install: one row, and it is India', () => {
    expect(ALL_FOLLOWER_BELIEFS_ROWS.length).toBe(1);
    expect(ALL_FOLLOWER_BELIEFS_ROWS[0].civ).toBe('INDIA');
  });

  it('pays a plain seat its ONE followed religion, with the rival present', () => {
    const state = scene(civRow('AMERICA'));
    const city = seatOf(state, 0)!.cities[0];
    // the rival really IS present — or this lane proves nothing
    expect(religionsPresent(city)).toEqual([0, 1]);
    expect(getModifiers(state, 0).allFollowerBeliefs).toBe(false);
    expect(followerReligionsForCity(getModifiers(state, 0), city)).toEqual([0]);
    const shrine = shrineOf(state);
    expect(shrine.food).toBe(1);          // Feed the World, the followed one
    expect(shrine.culture ?? 0).toBe(0);  // and NOT the rival's Choral Music
  });

  it('pays India both, from one shrine', () => {
    const state = scene(civRow('INDIA'));
    const city = seatOf(state, 0)!.cities[0];
    expect(getModifiers(state, 0).allFollowerBeliefs).toBe(true);
    expect(followerReligionsForCity(getModifiers(state, 0), city)).toEqual([0, 1]);
    const shrine = shrineOf(state);
    expect(shrine.food).toBe(1);          // its own
    expect(shrine.culture).toBe(2);       // AND the rival's
  });

  it('never pays a religion with no pressure', () => {
    const state = scene(civRow('INDIA'));
    const city = seatOf(state, 0)!.cities[0];
    city.religionPressure = [10, 0];      // the rival has no follower here
    expect(religionsPresent(city)).toEqual([0]);
    const shrine = shrineOf(state);
    expect(shrine.food).toBe(1);
    expect(shrine.culture ?? 0).toBe(0);
  });

  it('pays nothing at all where no religion has pressure', () => {
    const state = scene(civRow('INDIA'));
    const city = seatOf(state, 0)!.cities[0];
    city.religionPressure = [0, 0];
    const base = getModifiers(state, 0);
    expect(followerReligionsForCity(base, city)).toEqual([]);
    // ...and the composer hands back the SAME object, having cloned nothing
    expect(withFollowerBelief(state, base, followerReligionsForCity(base, city))).toBe(base);
  });

  it('leaves the base modifiers unmutated, both quantifiers alike', () => {
    // GEO-H: the composer deep-clones because applyBeliefEffects mutates in
    // place; stacking TWO beliefs runs that clone twice as hard.
    const state = scene(civRow('INDIA'));
    const base = getModifiers(state, 0);
    const before = JSON.stringify(base.buildingYieldAdd);
    shrineOf(state);
    shrineOf(state);
    expect(JSON.stringify(base.buildingYieldAdd)).toBe(before);
  });
});
