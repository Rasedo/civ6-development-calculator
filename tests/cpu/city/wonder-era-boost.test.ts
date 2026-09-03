import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { grantEraBoosts } from '../../../cpu/core/game';
import { getModifiers } from '../../../cpu/core/effects';
import { WONDER_ERA_BOOST_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { TECHS, ERAS } from '../../../cpu/data/techs';
import { CIVICS } from '../../../cpu/data/civics';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (Dynastic Cycle): "When completing a wonder receive a random Eureka
 * and Inspiration from the era of the wonder, IF AVAILABLE." The install
 * writes the two as separate modifiers, each Amount 1 (C-54).
 *
 * The GPU twin is tests/gpu/wonder_era_boost_test.py.
 */
const civRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);

function scene(row: number): GameState {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  return state;
}

describe("a wonder's era boost", () => {
  it('reads the install: one Eureka and one Inspiration, to China', () => {
    expect(WONDER_ERA_BOOST_ROWS.length).toBe(1);
    expect(WONDER_ERA_BOOST_ROWS[0].civ).toBe('CHINA');
    expect(WONDER_ERA_BOOST_ROWS[0].techs).toBe(1);
    expect(WONDER_ERA_BOOST_ROWS[0].civics).toBe(1);
  });

  it('grants one of each from the wonder`s own era', () => {
    const state = scene(civRow('CHINA'));
    const rsr = seatOf(state, 0)!.research;
    expect(rsr.boosted.length).toBe(0);
    grantEraBoosts(state, 0, 'Ancient');
    expect(rsr.boosted.length).toBe(2);
    // ...and BOTH came from that era, one of each kind
    const techs = rsr.boosted.filter((id) => TECHS[id]);
    const civics = rsr.boosted.filter((id) => CIVICS[id]);
    expect(techs.length).toBe(1);
    expect(civics.length).toBe(1);
    expect(TECHS[techs[0]].era).toBe('Ancient');
    expect(CIVICS[civics[0]].era).toBe('Ancient');
  });

  it('grants nothing where the era holds nothing unearned', () => {
    const state = scene(civRow('CHINA'));
    const rsr = seatOf(state, 0)!.research;
    // hold every Ancient tech and civic, so both pools are empty
    rsr.techs = Object.values(TECHS).filter((t) => t.era === 'Ancient').map((t) => t.id);
    rsr.civics = Object.values(CIVICS).filter((c) => c.era === 'Ancient').map((c) => c.id);
    grantEraBoosts(state, 0, 'Ancient');
    expect(rsr.boosted.length).toBe(0);
  });

  it('never draws for a seat the roster does not name', () => {
    // PLAIN = -1, and the rng must not move either — the GPU masks its draw
    const state = scene(-1);
    expect(getModifiers(state, 0).wonderEraBoost.length).toBe(0);
    const before = state.rngState;
    grantEraBoosts(state, 0, 'Ancient');
    expect(seatOf(state, 0)!.research.boosted.length).toBe(0);
    expect(state.rngState).toBe(before);
  });

  it('takes the era it is given, not the seat`s own progress', () => {
    const state = scene(civRow('CHINA'));
    const rsr = seatOf(state, 0)!.research;
    const later = ERAS[2];
    grantEraBoosts(state, 0, later);
    for (const id of rsr.boosted) {
      expect((TECHS[id] ?? CIVICS[id]).era).toBe(later);
    }
  });
});
