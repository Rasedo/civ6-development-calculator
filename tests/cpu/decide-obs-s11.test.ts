/**
 * THE NEUTRAL OBSERVATION'S DECISION MASK GROUPS, TS side: `research` (the
 * open techs and civics at their effective cost), `policy` (the cards the
 * seat may slot and its government's slots) and `war` (the war head's open
 * columns and the kind each declaration takes). The gate compares each with
 * `gpu/core/neutral.py`'s group of the same name every turn.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, grantCivics, tileAtCoords } from './helpers';
import { researchObs, policyObs, warObs, SEAT_GROUPS } from '../../cpu/core/decideObsMasks';
import { TECHS } from '../../cpu/data/techs';
import { CIVICS } from '../../cpu/data/civics';
import { POLICY_LIST } from '../../cpu/data/policies';
import { BOOST_FRACTION } from '../../cpu/core/boosts';
import { WAR_MIN_TURNS, PEACE_GOLD_COST } from '../../cpu/data/seats';
import { WAR_KIND_SURPRISE } from '../../cpu/data/warKinds';
import { addEnvoys, placeCityStateAt } from '../../cpu/core/cityStates';
import { emptySeat, seatOf, seatOfCityState, setTreatyTurnsWith, setWar, setWarTurnsWith } from '../../cpu/core/seats';

describe('decision mask groups', () => {
  it('registers research, policy and war', () => {
    expect(Object.keys(SEAT_GROUPS)).toEqual(['research', 'policy', 'war']);
  });

  it('research: the open items at their effective cost, -1 elsewhere', () => {
    const state = makeState(makeMap(12, 12));
    const techs = Object.values(TECHS);
    const root = techs.find((t) => t.prereqs.length === 0)!;
    const locked = techs.find((t) => t.prereqs.length > 0)!;
    seatOf(state, 0)!.research.boosted.push(root.id);
    const obs = researchObs(state, 0);
    expect(obs.tech_cost).toHaveLength(techs.length);
    expect(obs.civic_cost).toHaveLength(Object.keys(CIVICS).length);
    expect(obs.tech_cost[techs.indexOf(root)]).toBe(Math.round(root.cost * (1 - BOOST_FRACTION)));
    expect(obs.tech_cost[techs.indexOf(locked)]).toBe(-1);
    const code = Object.keys(CIVICS).indexOf('CODE_OF_LAWS');
    expect(obs.civic_cost[code]).toBe(CIVICS.CODE_OF_LAWS.cost);
    grantCivics(state, 'CODE_OF_LAWS');
    expect(researchObs(state, 0).civic_cost[code]).toBe(-1);
  });

  it('policy: nothing without a government, then the Chiefdom cards and slots', () => {
    const state = makeState(makeMap(12, 12));
    expect(policyObs(state, 0)).toEqual({ unlocked: [], slots: [0, 0, 0, 0] });
    grantCivics(state, 'CODE_OF_LAWS');
    const want = ['URBAN_PLANNING', 'GOD_KING', 'DISCIPLINE', 'SURVEY']
      .map((id) => POLICY_LIST.findIndex((p) => p.id === id)).sort((a, b) => a - b);
    const obs = policyObs(state, 0);
    expect(obs.unlocked).toEqual(want);
    expect(obs.slots).toEqual([1, 1, 0, 0]);
  });

  it('war: the head columns, declare and sue gates, the kind per major column', () => {
    const state = makeState(makeMap(20, 20));
    state.seats.push(emptySeat(1), emptySeat(2));
    state.cityStateMax = 2;
    // city-state 0 met and at war; city-state 1 never placed (off the roster)
    const cs = placeCityStateAt(state, 0, 'CS0', 'scientific', tileAtCoords(state.map, 10, 10).index);
    cs.met = [0, 1];
    const csSeat = seatOfCityState(0);
    setWar(state, 0, csSeat, true);
    setWarTurnsWith(state, 0, csSeat, WAR_MIN_TURNS);
    // at war with seat 1 long enough, with the price in the treasury
    setWar(state, 0, 1, true);
    setWarTurnsWith(state, 0, 1, WAR_MIN_TURNS);
    seatOf(state, 0)!.treasury = PEACE_GOLD_COST(WAR_MIN_TURNS);
    let obs = warObs(state, 0);
    // columns: seat 1, seat 2, city-state 0, city-state 1
    expect(obs).toEqual({
      targets: 4, declare: [1], sue: [0, 2],
      kind_default: [-1, WAR_KIND_SURPRISE], kind_own: [-1, WAR_KIND_SURPRISE], at_war: true,
    });
    // a treaty shuts the declaration; a poor seat cannot buy peace; the minor
    // will not talk while its suzerain (seat 1) fights this seat
    setTreatyTurnsWith(state, 0, 2, 5);
    seatOf(state, 0)!.treasury = PEACE_GOLD_COST(WAR_MIN_TURNS) - 1;
    addEnvoys(state, cs, 1, 3);
    obs = warObs(state, 0);
    expect(obs.declare).toEqual([]);
    expect(obs.sue).toEqual([]);
    expect(obs.kind_default).toEqual([-1, -1]);
    // a seat at peace with everyone
    expect(warObs(state, 2).at_war).toBe(false);
  });
});
