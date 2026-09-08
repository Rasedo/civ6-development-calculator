/**
 * THE WORKED-TILE PICK, EXPOSED.
 *
 * `assignWorkedTiles` always ANSWERED which tiles a city works; nothing kept
 * the answer, so a divergence in the pick could only surface indirectly, as a
 * yield difference three buckets later, and the nuclear strike's "citizens working the
 * affected tiles are eliminated" had nothing to read.
 *
 * `workedTilesOf` is the one composer: it spells the citizen count ONCE
 * (population minus the effective specialists) and the yield walk calls it,
 * so the stored pick is by construction the pick the walk summed.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { computeCityStats, workedTilesOf, workableTiles } from '../../../cpu/core/city';
import type { City, GameState } from '../../../cpu/core/types';

function scene(pop: number): { state: GameState; city: City } {
  const state = makeState(makeMap(24, 24));
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  city.population = pop;
  return { state, city };
}

describe('the pick a city makes', () => {
  it('takes one tile per citizen, never the centre, and only workable ground', () => {
    const { state, city } = scene(3);
    const pick = workedTilesOf(state, city);
    expect(pick.length).toBe(3);
    expect(new Set(pick).size).toBe(3);
    expect(pick).not.toContain(city.centerIndex);
    const cand = new Set(workableTiles(state, city).map((t) => t.index));
    for (const i of pick) expect(cand.has(i)).toBe(true);
  });

  it('is capped by the candidate pool, not by population', () => {
    const { state, city } = scene(60);
    const cand = workableTiles(state, city).length;
    expect(workedTilesOf(state, city).length).toBe(cand);
  });

  it('takes a LOCKED plot first, whatever it scores', () => {
    const { state, city } = scene(1);
    const cand = workableTiles(state, city).map((t) => t.index).sort((a, b) => a - b);
    // the plot the free pick does NOT take, then locked
    const free = workedTilesOf(state, city)[0]!;
    const other = cand.find((i) => i !== free)!;
    state.map.tiles[other]!.locked = true;
    expect(workedTilesOf(state, city)).toEqual([other]);
  });

  it('loses a worker for every specialist the city diverts', () => {
    const { state, city } = scene(4);
    const before = workedTilesOf(state, city).length;
    expect(before).toBe(4);
    // `spent` is the citizen count the walk already computed — the ONE place
    // the subtraction is spelled, so a caller cannot spell it differently.
    expect(workedTilesOf(state, city, undefined, 2).length).toBe(2);
  });
});

describe('what the census reads', () => {
  it('is the walk\u2019s own pick, stored only when the walk asks to record', () => {
    const { state, city } = scene(2);
    expect(city.workedTiles).toBeUndefined();
    computeCityStats(state, city);
    expect(city.workedTiles, 'a pure read must not record').toBeUndefined();
    computeCityStats(state, city, undefined, undefined, true);
    expect(city.workedTiles).toEqual(workedTilesOf(state, city));
  });
});
