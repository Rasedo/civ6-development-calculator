import { describe, it, expect } from 'vitest';
import { makeState } from './helpers';
import { goldenBoostBonus, goldenCulturePerDistrict, goldenProphetPoints } from '../src/core/eras';
import { DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS } from '../src/data/rivals';
import type { GameState } from '../src/core/types';

// B-24 (#79) GOLDEN-AGE DEDICATION BONUSES, sourced from the Civ 6 dedication
// catalog. A Golden age trades the Dark/Normal era-score payout for a standing
// bonus, so each fires ONLY at civAges === 2 and only for a committed pick.
//
// The two MOVEMENT halves (Monumentality's +2 Builders, Exodus's +2 religious
// units) are DEFERRED to the seat unification (task #51, Round 5) — they need
// ONE movement-point model to be expressible on both engines at all. See the
// note above goldenDedication in src/core/eras.ts.

function golden(kind: number): GameState {
  const state = makeState();
  state.civAges = [2];
  state.dedicationPicks = [[kind]];
  return state;
}

describe('B-24: golden-age dedication bonuses', () => {
  it('FREE_INQUIRY deepens TECH boosts, PEN_BRUSH deepens CIVIC boosts', () => {
    const fi = golden(DED_FREE_INQUIRY);
    expect(goldenBoostBonus(fi, 0, false)).toBeCloseTo(0.1); // techs
    expect(goldenBoostBonus(fi, 0, true)).toBe(0); // not civics
    const pb = golden(DED_PEN_BRUSH_AND_VOICE);
    expect(goldenBoostBonus(pb, 0, true)).toBeCloseTo(0.1); // civics
    expect(goldenBoostBonus(pb, 0, false)).toBe(0); // not techs
  });

  it('PEN_BRUSH pays +1 Culture per specialty district; others do not', () => {
    expect(goldenCulturePerDistrict(golden(DED_PEN_BRUSH_AND_VOICE), 0)).toBe(1);
    expect(goldenCulturePerDistrict(golden(DED_FREE_INQUIRY), 0)).toBe(0);
  });

  it('EXODUS pays +4 Great Prophet points per turn', () => {
    expect(goldenProphetPoints(golden(DED_EXODUS), 0)).toBe(4);
    expect(goldenProphetPoints(golden(DED_FREE_INQUIRY), 0)).toBe(0);
  });

  it('nothing fires outside a GOLDEN age', () => {
    const s = golden(DED_EXODUS);
    for (const age of [0, 1]) {
      s.civAges = [age];
      expect(goldenProphetPoints(s, 0)).toBe(0);
      expect(goldenBoostBonus(s, 0, false)).toBe(0);
    }
  });

  it('a civ that did not commit the dedication gets nothing', () => {
    const s = golden(DED_FREE_INQUIRY);
    s.dedicationPicks = [[DED_EXODUS]];
    expect(goldenBoostBonus(s, 0, false)).toBe(0);
    expect(goldenCulturePerDistrict(s, 0)).toBe(0);
  });
});
