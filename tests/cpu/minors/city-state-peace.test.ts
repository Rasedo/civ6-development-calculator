import { describe, it, expect } from 'vitest';
import { civsAtWar, emptySeat, seatOfCityState, setWar, setWarTurnsWith, warTurnsWith } from '../../../cpu/core/seats';
import { makeState, tileAtCoords } from '../helpers';
import { declareWarOnCityState, sueForPeaceWithCityState } from '../../../cpu/core/cityStates';
import { SUZERAIN_ENVOYS } from '../../../cpu/data/cityStates';
import { WAR_MIN_TURNS } from '../../../cpu/data/seats';
import type { CityState, GameState, Seat } from '../../../cpu/core/types';

// SEAT 0 <-> CITY-STATE PEACE. Sourced from the Civ 6 wiki:
//   - peace may be offered only 10 turns after the war began;
//   - a city-state "will always accept an offer of peace without preconditions";
//   - a city-state is dragged into its SUZERAIN's wars and cannot make separate
//     peace — it "automatically gets peace when you either stop being at war
//     with their suzerain or them switching".

function addCs(state: GameState, id: number): CityState {
  const t = tileAtCoords(state.map, 8, 8);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(id)), // the war axis keys on the CS's SEAT id
    id,
    name: 'Kandy',
    type: 'scientific',
    centerIndex: t.index,
    population: 4,
    envoys: {},
    met: [0],
  } as CityState;
  state.cityStates.push(cityState);
  return cityState;
}

function addCiv(state: GameState, id: number, atWar: boolean): Seat {
  const civ = {
    id,
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
    ww: {}, wwTurn: {},
    diplomaticFavor: 0,
    diplomaticPoints: 0,
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
    wars: [], formalWars: [], denounced: {}, allies: [],
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    settlers: 0,
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    spaceProjects: [],
  } as unknown as Seat;
  state.seats.push(civ);
  setWar(state, civ.seat, 0, atWar);
  if (atWar) setWarTurnsWith(state, civ.seat, 0, 20);
  return civ;
}

describe('seat 0 <-> city-state peace', () => {
  it('peace is refused before the sourced 10-turn floor, then always accepted', () => {
    const state = makeState();
    const cityState = addCs(state, 1);
    expect(declareWarOnCityState(state, cityState.id, 0).ok).toBe(true);
    expect(civsAtWar(state, cityState.seat, 0)).toBe(true);

    expect(sueForPeaceWithCityState(state, cityState.id, 0).ok).toBe(false); // 0 turns waited
    // the pair clock ticks at the LOWER seat's phase tail (the major's), and
    // this scene runs no seat-0 economy — write the clock it would have built
    setWarTurnsWith(state, cityState.seat, 0, WAR_MIN_TURNS - 1);
    expect(sueForPeaceWithCityState(state, cityState.id, 0).ok).toBe(false); // one short
    setWarTurnsWith(state, cityState.seat, 0, WAR_MIN_TURNS);
    // ... and at the floor it is accepted unconditionally (no gold, no roll)
    expect(sueForPeaceWithCityState(state, cityState.id, 0).ok).toBe(true);
    expect(civsAtWar(state, cityState.seat, 0)).toBe(false);
    expect(warTurnsWith(state, cityState.seat, 0)).toBe(0); // a re-declaration waits the floor out again
  });

  it('a city-state will NOT make separate peace while its suzerain is at war', () => {
    const state = makeState();
    const cityState = addCs(state, 1);
    const rome = addCiv(state, 0, true);
    cityState.envoys = { [1]: SUZERAIN_ENVOYS }; // Rome is suzerain
    expect(declareWarOnCityState(state, cityState.id, 0).ok).toBe(true);
    setWarTurnsWith(state, cityState.seat, 0, WAR_MIN_TURNS + 2);

    const r = sueForPeaceWithCityState(state, cityState.id, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('suzerain');
    expect(civsAtWar(state, cityState.seat, 0)).toBe(true);

    // ... and the way out is peace with the SUZERAIN, which forces it
    setWar(state, rome.seat, 0, false);
    expect(civsAtWar(state, cityState.seat, 0)).toBe(true); // not automatic until makePeace runs
  });
});
