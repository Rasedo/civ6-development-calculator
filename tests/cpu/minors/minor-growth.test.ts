/**
 * A CITY-STATE'S CITY GROWS AND CLAIMS LIKE ANY OTHER (C-38).
 *
 * CIV6 (City-state): the install has ONE city rule, so the minor's city fills
 * a FOOD BOX and takes ground on a CULTURE BOX exactly as a major's does.
 * Before this it moved +1 population every twelve turns and never claimed a
 * tile at all.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, seatOfCityState, setTileOwner, tileSeat } from '../../../cpu/core/seats';
import { minorPhase } from '../../../cpu/core/minorBuild';
import { cityStatePhase, minorCity, resolveSuzerain } from '../../../cpu/core/cityStates';
import { tilesWithin } from '../../../world/hex';
import type { CityState, CityStateType, GameState } from '../../../cpu/core/types';

function addCs(state: GameState, col: number, row: number, opts: Partial<CityState> & { type?: CityStateType } = {}): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length,
    name: `CS${state.cityStates.length}`,
    type: 'scientific',
    centerIndex: center.index,
    population: 3,
    envoys: {},
    met: [0],
    ...opts,
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  resolveSuzerain(state, cityState);
  return cityState;
}

function scene(opts: Partial<CityState> = {}): { state: GameState; cs: CityState } {
  const state = makeState(makeMap(24, 24));
  const cs = addCs(state, 8, 8, opts);
  return { state, cs };
}

describe("a minor's city keeps a real food box", () => {
  it('carries the boxes on the record, not zeroes in the view', () => {
    const { cs } = scene({ foodBox: 7, cultureBox: 3, tilesAcquired: 2 });
    const view = minorCity(cs);
    expect(view.foodBox).toBe(7);
    expect(view.cultureBox).toBe(3);
    expect(view.tilesAcquired).toBe(2);
  });

  it('grows on the box and never on a twelve-turn clock', () => {
    const { state, cs } = scene();
    const pop0 = cs.population;
    // the clock's old trigger: turns 12, 24 and 36 moved the population by
    // themselves. `cityStatePhase` must no longer touch it at all.
    for (const t of [12, 24, 36]) {
      state.turn = t;
      cityStatePhase(state);
    }
    expect(cs.population).toBe(pop0);
  });

  it('fills the box from its own surplus', () => {
    const { state, cs } = scene();
    expect(cs.foodBox ?? 0).toBe(0);
    minorPhase(state);
    expect(cs.foodBox ?? 0).toBeGreaterThan(0);
  });

  it('takes the population up when the box covers the need', () => {
    // a box already past any first-growth price: the shared rule spends it
    const { state, cs } = scene({ foodBox: 10_000 });
    const pop0 = cs.population;
    minorPhase(state);
    expect(cs.population).toBe(pop0 + 1);
    expect(cs.foodBox ?? 0).toBeLessThan(10_000);
  });
});

describe("a minor's culture box banks and buys nothing", () => {
  // CIV6 (`CivilizationLevels`): `CanAnnexTilesWithCulture` is FALSE for
  // CITY_STATE. The box still fills off the same walk a major's does — the
  // rule is at the SPEND, exactly where the Border Control Treaty puts it.
  it('fills the box from its own culture', () => {
    const { state, cs } = scene();
    expect(cs.cultureBox ?? 0).toBe(0);
    minorPhase(state);
    expect(cs.cultureBox ?? 0).toBeGreaterThan(0);
  });

  it('claims no ground however full the box is', () => {
    const { state, cs } = scene({ cultureBox: 10_000 });
    const owned0 = state.map.tiles.filter((t) => tileSeat(t) === cs.seat).length;
    minorPhase(state);
    expect(cs.tilesAcquired ?? 0).toBe(0);
    expect(cs.cultureBox ?? 0).toBeGreaterThanOrEqual(10_000);
    expect(state.map.tiles.filter((t) => tileSeat(t) === cs.seat).length).toBe(owned0);
  });

  it('claims nothing on an empty box either', () => {
    const { state, cs } = scene();
    const owned0 = state.map.tiles.filter((t) => tileSeat(t) === cs.seat).length;
    minorPhase(state);
    expect(state.map.tiles.filter((t) => tileSeat(t) === cs.seat).length).toBe(owned0);
    expect(cs.tilesAcquired ?? 0).toBe(0);
  });
});
