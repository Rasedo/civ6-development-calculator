/**
 * A CITY-STATE'S CITY STRIKES. CIV6: walls give a city its ranged strike, and
 * a city-state's city is an ordinary city — so a walled minor fires at the
 * nearest unit at war with it, in its own turn, through the majors' own body
 * (`cityStrikes`), from its centre's standing strength (`centreStrength`).
 *
 * The GPU twin is tests/gpu/minor_builds_test.py's strike scene.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, seatOfCityState, setTileOwner, setWar } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { centreStrength } from '../../../cpu/core/combat';
import { minorPhase } from '../../../cpu/core/minorBuild';
import { minorCity } from '../../../cpu/core/cityStates';
import { cityStrikes } from '../../../cpu/core/phase';
import { WALLS_TIER_CS } from '../../../cpu/data/units';
import { PALACE_CITY_CS } from '../../../cpu/data/constants';
import { tilesWithin } from '../../../world/hex';
import type { CityState, GameState } from '../../../cpu/core/types';

function scene(walls: boolean): { state: GameState; cs: CityState } {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  while (state.seats.length < 2) state.seats.push(emptySeat(state.seats.length));
  const centre = tileAtCoords(state.map, 6, 6);
  const cs: CityState = {
    ...emptySeat(seatOfCityState(0)),
    id: 0, name: 'Strikeland', type: 'militaristic', centerIndex: centre.index,
    population: 3, envoys: {}, met: [1], suzerain: -1,
    buildings: walls ? ['ANCIENT_WALLS'] : [],
  };
  for (const t of tilesWithin(state.map, 6, 6, 1)) setTileOwner(t, cs.seat);
  state.cityStates.push(cs);
  state.cityStateMax = 1;
  return { state, cs };
}

describe("a city-state's ranged strike", () => {
  it('fires from its centre strength at the nearest unit at war with it', () => {
    const { state, cs } = scene(true);
    const near = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 8, 6).index, 1)!;
    expect(near).toBeTruthy();
    setWar(state, 1, cs.seat, true);
    const hp0 = near.hp;
    cityStrikes(state, minorCity(cs), centreStrength(state, minorCity(cs)));
    expect(near.hp).toBeLessThan(hp0);
    // the 15 floor (no melee fielded) + the Ancient Walls' tier + the Palace
    expect(centreStrength(state, minorCity(cs))).toBe(15 + (WALLS_TIER_CS[1] ?? 0) + PALACE_CITY_CS);
  });

  it('holds fire at peace, and without walls', () => {
    for (const [walls, war] of [[true, false], [false, true]] as const) {
      const { state, cs } = scene(walls);
      const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 6).index, 1)!;
      if (war) setWar(state, 1, cs.seat, true);
      const hp0 = u.hp;
      cityStrikes(state, minorCity(cs), centreStrength(state, minorCity(cs)));
      expect(u.hp, `walls ${walls} war ${war}`).toBe(hp0);
    }
  });

  it("fires in the minor's own turn", () => {
    const { state, cs } = scene(true);
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 6).index, 1)!;
    setWar(state, 1, cs.seat, true);
    const hp0 = u.hp;
    minorPhase(state);
    expect(u.hp).toBeLessThan(hp0);
  });
});
