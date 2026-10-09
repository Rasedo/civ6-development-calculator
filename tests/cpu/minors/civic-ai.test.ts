import { describe, it, expect } from 'vitest';
import { emptySeat, seatOfCityState } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { civicAnalysis, civicChoice, civicValue } from '../../../cpu/core/aiCivics';
import type { CityState, GameState } from '../../../cpu/core/types';

// THE CIVICS AI (tools/civ6lab/dll_readings.md "H-1: the civics AI"); the
// numbers below are the GPU twin's too (tests/gpu/civic_ai_test.py)

function minor(state: GameState): CityState {
  const cs: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length, name: 'CS', type: 'cultural',
    centerIndex: tileAtCoords(state.map, 5, 5).index, population: 3, envoys: {}, met: [],
  };
  state.cityStates.push(cs);
  return cs;
}

describe('the civic value (0x7a9a10)', () => {
  it("is the civic's own 5 from landing to the horizon at 4%, the policy floor 20", () => {
    const st = { gameEra: 0 } as unknown as GameState;
    // runs/h1_duelw1124 t1, every player: Code of Laws 85.2 at 10 turns,
    // Craftsmanship 123.7 at 30 = its own 38.5 and Code of Laws'
    expect(civicValue(st, 'CODE_OF_LAWS', 10)).toBe(21819);
    expect(civicValue(st, 'CRAFTSMANSHIP', 30)).toBe(9848);
    // at the horizon or past it -9999
    expect(civicValue(st, 'CODE_OF_LAWS', 49)).toBe(5411);
    expect(civicValue(st, 'CODE_OF_LAWS', 50)).toBe(-9999 * 256);
  });

  it("counts an older era's civic once per era between, plus one", () => {
    // runs/h1_duelw1124 t61 Rome: Craftsmanship at 1 turn 331.7, favored x1.5
    expect(civicValue({ gameEra: 1 } as unknown as GameState, 'CRAFTSMANSHIP', 1)).toBe(56608);
  });
});

describe("the civics AI's analysis (0x621a20, 0x61ee30)", () => {
  const setup = () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    cs.research.civics = ['CODE_OF_LAWS', 'CRAFTSMANSHIP'];
    const ents = civicAnalysis(state, cs.seat, 5);
    return { state, cs, ents, by: (id: string) => ents.find((e) => e.civic === id)! };
  };

  it('walks the prerequisites three levels: the turns summed, the next step the last added', () => {
    const { by } = setup();
    expect(by('MILITARY_TRADITION')).toMatchObject({ next: 'MILITARY_TRADITION' });
    // Military Training: Military Tradition, then Games and Recreation, whose
    // State Workforce is added last
    expect(by('MILITARY_TRAINING').next).toBe('STATE_WORKFORCE');
    // its turns: its own and every walked row's (Games and Recreation's
    // entry already holds State Workforce's)
    expect(by('MILITARY_TRAINING').turns).toBeGreaterThan(by('MILITARY_TRADITION').turns + by('GAMES_AND_RECREATION').turns);
    expect(by('CODE_OF_LAWS')).toMatchObject({ turns: -1, owned: true, base: 0, score: 0 });
  });

  it("scores the row's own value and its prerequisites', a negative one counting nothing", () => {
    const { by } = setup();
    const mt = by('MILITARY_TRAINING');
    const parts = ['MILITARY_TRAINING', 'MILITARY_TRADITION', 'GAMES_AND_RECREATION', 'STATE_WORKFORCE'].map((id) => Math.max(0, by(id).base));
    expect(mt.score).toBe(parts.reduce((a, b) => a + b, 0));
  });
});

describe("the civics AI's choice (0x626600, 0x6182e0)", () => {
  it("takes the best row's next step", () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    cs.research.civics = ['CODE_OF_LAWS'];
    const ents = civicAnalysis(state, cs.seat, 5);
    const inReach = ents.filter((e) => !e.owned && e.turns > 0);
    const best = inReach.reduce((a, b) => (b.score > a.score ? b : a));
    expect(civicChoice(state, cs.seat, ents, null, () => -1)).toBe(best.next);
  });

  it('passes over the rows leading through the completed civic', () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    // the analysis before Code of Laws completed: every row in reach leads
    // through it
    const ents = civicAnalysis(state, cs.seat, 5);
    expect(ents.filter((e) => !e.owned && e.turns > 0).every((e) => e.next === 'CODE_OF_LAWS')).toBe(true);
    cs.research.civics = ['CODE_OF_LAWS'];
    const seen: number[] = [];
    const pick = civicChoice(state, cs.seat, ents, 'CODE_OF_LAWS', (n) => (seen.push(n), 0));
    expect(pick).not.toBe('CODE_OF_LAWS');
    expect(seen).toEqual([]);
  });

  it("draws over the researchable rows where the best row's next step is not researchable", () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    const ents = civicAnalysis(state, cs.seat, 5).map((e) => (e.civic === 'CRAFTSMANSHIP' ? e : { ...e, owned: true, turns: -1 }));
    cs.research.civics = ['CODE_OF_LAWS'];
    const seen: number[] = [];
    // Craftsmanship's next step, Code of Laws, is held: the open rows in
    // table order are Craftsmanship and Foreign Trade
    expect(civicChoice(state, cs.seat, ents, null, (n) => (seen.push(n), 1))).toBe('FOREIGN_TRADE');
    expect(seen).toEqual([2]);
  });
});
