import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { endTurn, foundCity } from '../../../cpu/core/game';
import { killUnit, markAntiquitySite, clearCampFor } from '../../../cpu/core/combat';
import { spawnUnit } from '../../../cpu/core/units';
import { BARB_SEAT, emptySeat, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { ERA_LENGTH } from '../../../cpu/data/seats';
import { ERAS } from '../../../cpu/data/techs';
import { CIVICS } from '../../../cpu/data/civics';
import { tilesWithin } from '../../../world/hex';
import type { CityState, GameState } from '../../../cpu/core/types';

/** a minor whose suzerain perk is the one under test, with `seat` holding it. */
function suzerainOf(state: GameState, name: string, seat: number): CityState {
  const centre = tileAtCoords(state.map, 9, 9);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length,
    name,
    type: 'cultural',
    centerIndex: centre.index,
    population: 3,
    envoys: { [seat]: 6 },
    met: [seat],
  };
  for (const t of tilesWithin(state.map, 9, 9, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  return cityState;
}

function boardAtEraEdge(): GameState {
  const state = makeState(makeMap(20, 20));
  state.seats.push(emptySeat(1));
  foundCity(state, tileAtCoords(state.map, 3, 3).index, 0);
  foundCity(state, tileAtCoords(state.map, 15, 15).index, 1);
  state.turn = ERA_LENGTH - 1; // one endTurn away from the boundary
  return state;
}

describe("Vilnius's era Inspiration", () => {
  it('boosts exactly one civic of the era just entered, for the suzerain alone', () => {
    const state = boardAtEraEdge();
    suzerainOf(state, 'Vilnius', 0);
    const before = state.seats.map((s) => [...s.research.boosted]);
    endTurn(state);
    expect(state.turn % ERA_LENGTH).toBe(0);
    const era = ERAS[Math.min(Math.floor(state.turn / ERA_LENGTH), ERAS.length - 1)];

    const fresh = state.seats[0].research.boosted.filter((id) => !before[0].includes(id));
    // the era edge also runs detectBoosts elsewhere in the turn, so the draw is
    // identified by its ERA rather than by being the only new entry
    const drawn = fresh.filter((id) => CIVICS[id]?.era === era);
    expect(drawn.length).toBe(1);

    const rival = state.seats[1].research.boosted.filter((id) => !before[1].includes(id));
    expect(rival.filter((id) => CIVICS[id]?.era === era).length).toBe(0);
  });

  it('pays nothing when nobody is the suzerain', () => {
    const state = boardAtEraEdge();
    const cityState = suzerainOf(state, 'Vilnius', 0);
    cityState.envoys = {}; // met, but nobody has envoys
    const before = state.seats.map((s) => [...s.research.boosted]);
    endTurn(state);
    const era = ERAS[Math.min(Math.floor(state.turn / ERA_LENGTH), ERAS.length - 1)];
    for (let s = 0; s < 2; s++) {
      const fresh = state.seats[s].research.boosted.filter((id) => !before[s].includes(id));
      expect(fresh.filter((id) => CIVICS[id]?.era === era).length).toBe(0);
    }
  });
});

describe("an artifact's civilization is the event's own", () => {
  it("a death stamps the DEAD unit's seat, not the killer's", () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    const t = tileAtCoords(state.map, 5, 5);
    const dead = spawnUnit(state, 'WARRIOR', t.index, 1)!;
    killUnit(state, dead, 0); // seat 0 struck the blow
    expect(t.antiquity).toBe(true);
    expect(t.antiquitySeat).toBe(1);
  });

  it('a razed outpost stamps the barbarians', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    const t = tileAtCoords(state.map, 5, 5);
    state.barbSeat.camps.push(t.index);
    const razer = spawnUnit(state, 'WARRIOR', t.index, 0)!;
    clearCampFor(state, razer, t.index, 0);
    expect(t.antiquity).toBe(true);
    expect(t.antiquitySeat).toBe(BARB_SEAT);
  });

  it('dates the dig by the ACTING seat, whoever is buried', () => {
    const state = makeState(makeMap(20, 20));
    state.seats.push(emptySeat(1));
    state.seats[0].research.techs.push('POTTERY', 'ANIMAL_HUSBANDRY');
    const t = tileAtCoords(state.map, 5, 5);
    markAntiquitySite(state, t.index, 0, 1);
    expect(t.antiquitySeat).toBe(1);
    expect(t.antiquityEra).toBe(0); // seat 0 is still Ancient
  });
});
