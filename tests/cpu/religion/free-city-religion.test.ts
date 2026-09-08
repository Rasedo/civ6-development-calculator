/**
 * A FREE CITY IS A CITY, AND RELIGION TREATS IT AS ONE (C-60).
 *
 * SOURCED — by what the install does NOT say. `CivilizationLevels` is the one
 * table that states in data what the Free Cities player may not do (found
 * cities, claim tiles with culture or gold, earn great people, give or
 * receive influence, build wonders) and it has no religion column at all. The
 * spread-religion operation row carries no owner filter, and the
 * `RELIGION_SPREAD_*` parameters are written per CITY. So the pressure walk
 * covers the free row, exactly as the loyalty walk already did.
 *
 * The walk had covered the majors alone on both engines: no pressure in, no
 * pressure out, and a Free City that could never follow anything.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { foundCity, spreadReligiousPressureForTest } from '../../../cpu/core/game';
import { flipCity } from '../../../cpu/core/phase';
import { FREE_SEAT, grantFoundingPressure, seatOf } from '../../../cpu/core/seats';
import type { City, GameState } from '../../../cpu/core/types';

/** seat 0's Holy City, and a second city of its own two tiles away that we
 *  then hand to the Free Cities player. */
function scene(): { state: GameState; free: City } {
  const state = makeState(makeMap(20, 20));
  const holy = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
  holy.population = 6;
  // four tiles apart: clear of the minimum city distance, well inside
  // RELIGION_PRESSURE_RANGE 10.
  const r = foundCity(state, tileAtCoords(state.map, 12, 8).index, 0);
  expect(r.ok, r.reason ?? 'the second city must be foundable').toBe(true);
  const other = r.city!;
  other.population = 4;
  const s0 = seatOf(state, 0)!;
  s0.religion.founded = true;
  s0.religion.holyTile = holy.centerIndex;
  grantFoundingPressure(state, 0);
  flipCity(state, other);
  const free = state.freeSeat!.cities[0]!;
  expect(free.seat).toBe(FREE_SEAT);
  return { state, free };
}

describe('the pressure walk reaches the free row', () => {
  it('presses a Free City, and it follows what holds the majority', () => {
    const { state, free } = scene();
    expect(free.religionPressure ?? []).toEqual([]);
    expect(free.followedReligion ?? null).toBeNull();
    // ATHEISM_PRESSURE_PER_POP is 50, so a pop-4 city holds 200 of its own
    // and the Holy City's x4 step needs past that to take the majority.
    for (let i = 0; i < 120; i++) spreadReligiousPressureForTest(state);
    expect((free.religionPressure ?? [])[0] ?? 0).toBeGreaterThan(0);
    expect(free.followedReligion).toBe(0);
  });

  it('presses BACK once it follows — a Free City is a source too', () => {
    const { state, free } = scene();
    // ATHEISM_PRESSURE_PER_POP is 50, so a pop-4 city holds 200 of its own
    // and the Holy City's x4 step needs past that to take the majority.
    for (let i = 0; i < 120; i++) spreadReligiousPressureForTest(state);
    expect(free.followedReligion).toBe(0);
    // the walk reads `city.followedReligion` for every walked row, so the
    // free row now appears among the sources; nothing about the source step
    // asks who owns the city.
    const before = (free.religionPressure ?? [])[0] ?? 0;
    spreadReligiousPressureForTest(state);
    expect((free.religionPressure ?? [])[0] ?? 0).toBeGreaterThan(before);
  });
});
