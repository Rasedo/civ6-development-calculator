import { describe, it, expect } from 'vitest';
import { makeState, tileAtCoords } from './helpers';
import { declareWarOnCityState, sueForPeaceWithCityState } from '../src/core/cityStates';
import { cityStatePhase } from '../src/core/cityStates';
import { SUZERAIN_ENVOYS } from '../src/data/cityStates';
import { PEACE_MIN_WAR_TURNS } from '../src/data/rivals';
import type { CityState, GameState, RivalCiv } from '../src/core/types';

// #50 (#79) PLAYER <-> CITY-STATE PEACE. Sourced from the Civ 6 wiki:
//   - peace may be offered only 10 turns after the war began;
//   - a city-state "will always accept an offer of peace without preconditions";
//   - a city-state is dragged into its SUZERAIN's wars and cannot make separate
//     peace — it "automatically gets peace when you either stop being at war
//     with their suzerain or them switching".

function addCs(state: GameState, id: number): CityState {
  const t = tileAtCoords(state.map, 8, 8);
  const cs: CityState = {
    id,
    name: 'Kandy',
    type: 'scientific',
    centerIndex: t.index,
    population: 4,
    envoys: 0,
    met: true,
    quest: null,
    questIssuedTurn: 0,
  } as CityState;
  state.cityStates.push(cs);
  return cs;
}

function addRival(state: GameState, id: number, atWar: boolean): RivalCiv {
  const rival = {
    id,
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
    warmonger: 0,
    warWeariness: 0,
    diploFavor: 0,
    diploPoints: 0,
    influencePoints: 0,
    envoysAvailable: 0,
    treasury: 0,
    scienceTotal: 0,
    cultureTotal: 0,
    faith: 0,
    tourism: 0,
    government: { current: null, policies: [] },
    cities: [],
    nextCityId: 0,
    atWar,
    warTurns: atWar ? 20 : 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
  } as unknown as RivalCiv;
  state.rivals.push(rival);
  return rival;
}

describe('#50: player <-> city-state peace', () => {
  it('peace is refused before the sourced 10-turn floor, then always accepted', () => {
    const state = makeState();
    const cs = addCs(state, 1);
    expect(declareWarOnCityState(state, cs.id).ok).toBe(true);
    expect(cs.atWar).toBe(true);

    expect(sueForPeaceWithCityState(state, cs.id).ok).toBe(false); // 0 turns waited
    for (let i = 0; i < PEACE_MIN_WAR_TURNS - 1; i++) cityStatePhase(state);
    expect(sueForPeaceWithCityState(state, cs.id).ok).toBe(false); // one short
    cityStatePhase(state);
    // ... and at the floor it is accepted unconditionally (no gold, no roll)
    expect(sueForPeaceWithCityState(state, cs.id).ok).toBe(true);
    expect(cs.atWar).toBe(false);
    expect(cs.csWarTurns).toBe(0); // a re-declaration waits the floor out again
  });

  it('a city-state will NOT make separate peace while its suzerain is at war', () => {
    const state = makeState();
    const cs = addCs(state, 1);
    const rome = addRival(state, 0, true);
    cs.rivalEnvoys = [SUZERAIN_ENVOYS]; // Rome is suzerain
    expect(declareWarOnCityState(state, cs.id).ok).toBe(true);
    for (let i = 0; i < PEACE_MIN_WAR_TURNS + 2; i++) cityStatePhase(state);

    const r = sueForPeaceWithCityState(state, cs.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('suzerain');
    expect(cs.atWar).toBe(true);

    // ... and the way out is peace with the SUZERAIN, which forces it
    rome.atWar = false;
    expect(cs.atWar).toBe(true); // not automatic until makePeace runs
  });
});
