// THE MAJORS' MEETING (the players manager's meet, `meetMajors`): a pair of
// majors meets when one's look takes in a plot or a unit of the other's, or
// when one's unit steps onto a plot the other sees — a city-state's look is
// its suzerain's too. Until then neither can declare war nor send a mission.
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, majorsMet, metTurnWith, delegationWith, MISSION_DELEGATION } from '../../../cpu/core/seats';
import { declareWar, sendMission } from '../../../cpu/core/phase';
import { meetMajors, revealAround } from '../../../cpu/core/fog';
import { placeCityStateAt } from '../../../cpu/core/cityStates';
import { spawnUnit } from '../../../cpu/core/units';
import type { GameState } from '../../../cpu/core/types';

function twoMajors(): GameState {
  const map = makeMap(24, 16);
  const state = makeState(map);
  state.unitsMode = true;
  state.fogOfWar = true;
  state.seats.push(emptySeat(1));
  settleAt(state, tileAtCoords(map, 3, 3).index, 0);
  settleAt(state, tileAtCoords(map, 20, 12).index, 1);
  for (const s of state.seats) s.treasury = 1000;
  return state;
}

describe("the majors' meeting", () => {
  it('an unmet pair can neither declare war nor send a mission', () => {
    const state = twoMajors();
    expect(majorsMet(state, 0, 1)).toBe(false);
    expect(declareWar(state, 0, 1).ok).toBe(false);
    expect(sendMission(state, state.seats[0], 1)).toBe(false);
    expect(delegationWith(state, 0, 1)).toBe(0);
    meetMajors(state, 0, 1);
    expect(sendMission(state, state.seats[0], 1)).toBe(true);
    expect(delegationWith(state, 0, 1)).toBe(MISSION_DELEGATION);
    expect(declareWar(state, 0, 1).ok).toBe(true);
  });

  it('stamps the turn both ways, once', () => {
    const state = twoMajors();
    state.turn = 7;
    meetMajors(state, 1, 0);
    expect(metTurnWith(state, 0, 1)).toBe(7);
    expect(metTurnWith(state, 1, 0)).toBe(7);
    state.turn = 9;
    meetMajors(state, 0, 1);
    expect(metTurnWith(state, 0, 1)).toBe(7);
  });

  it("a look that takes in the other's unit meets it", () => {
    const state = twoMajors();
    const theirs = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 8).index, 1)!;
    expect(majorsMet(state, 0, 1)).toBe(false);
    revealAround(state, 0, tileAtCoords(state.map, 10, 8).index, 2, { seeThrough: false });
    expect(majorsMet(state, 0, 1)).toBe(true);
    expect(theirs.seat).toBe(1);
  });

  it("a city-state's look is its suzerain's", () => {
    const state = twoMajors();
    state.cityStateMax = 1;
    const cs = placeCityStateAt(state, 0, 'CS0', 'scientific', tileAtCoords(state.map, 12, 4).index);
    cs.suzerain = 1;
    cs.met = [0, 1];
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 8, 4).index, 0);
    expect(majorsMet(state, 0, 1)).toBe(false);
    // the city-state's unit looks over seat 0's Warrior: seat 1, its
    // suzerain, takes it in
    revealAround(state, cs.seat, tileAtCoords(state.map, 9, 4).index, 2, { seeThrough: false });
    expect(majorsMet(state, 1, 0)).toBe(true);
  });
});
