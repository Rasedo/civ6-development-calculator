import { describe, it, expect } from 'vitest';
import { emptySeat, seatOfCityState } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { researchAnalysis, researchChoice, researchCompletionChoice, techValue } from '../../../cpu/core/aiResearch';
import { detectBoosts } from '../../../cpu/core/boosts';
import { seatGovernment } from '../../../cpu/core/effects';
import { FREE_SEAT } from '../../../cpu/core/seats';
import type { CityState, GameState } from '../../../cpu/core/types';

// THE RESEARCH AI (tools/civ6lab/dll_readings.md "H-1: the research AI");
// the numbers below are the GPU twin's too (tests/gpu/research_ai_test.py)

function minor(state: GameState): CityState {
  const cs: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length, name: 'CS', type: 'scientific',
    centerIndex: tileAtCoords(state.map, 5, 5).index, population: 3, envoys: {}, met: [],
  };
  state.cityStates.push(cs);
  return cs;
}

describe('the research value (0x7b3e50)', () => {
  it('is a yield a turn from landing to the horizon, in 24.8 fixed point', () => {
    const st = { gameEra: 0 } as unknown as GameState;
    // the row's own 5, a building's share, a district's and a wonder's, at
    // the 4% discount: Pottery at 12 turns 78.3 as every city-state of
    // runs/h1_duelw1124 logs it at t1, Mining 60.3
    expect(techValue(st, 0, 'POTTERY', 12, new Map())).toBe(20056);
    expect(techValue(st, 0, 'MINING', 12, new Map())).toBe(15424);
    expect(techValue(st, 0, 'ASTROLOGY', 25, new Map())).toBe(11713);
    // an Ancient player's district weight, 0.5 x ChronologyIndex 1: runs/h1_duelw1124 t2 minor 3's Astrology 124.0 at 10 turns
    expect(techValue(st, 0, 'ASTROLOGY', 25, new Map([['PSEUDOYIELD_DISTRICT', 128]]))).toBe(13091);
    expect(techValue(st, 0, 'WRITING', 37, new Map())).toBe(4159);
    // EmbarkAll adds 5
    expect(techValue(st, 0, 'SHIPBUILDING', 4, new Map())).toBe(48958);
    // at the horizon the value is one discounted turn; past it -9999
    expect(techValue(st, 0, 'MINING', 50, new Map())).toBe(35);
    expect(techValue(st, 0, 'MINING', 51, new Map())).toBe(-9999 * 256);
  });

  it("adds 1.0 for an EmbarkUnitType, a project's 1.0, the install's buildings", () => {
    const st = { gameEra: 0 } as unknown as GameState;
    // runs/h1_duelv1127 t22 minor 3: Sailing at 1 turn 120.7, its own 6.0 a
    // turn (Builders embark)
    expect(techValue(st, 0, 'SAILING', 1, new Map())).toBe(30893);
    // Industrialization: Factory, Coal Power Plant, Ruhr Valley, Convert Reactor
    // to Coal (each city-state at 1 turn 20.1 above the buildings' shares)
    expect(techValue(st, 0, 'INDUSTRIALIZATION', 1, new Map())).toBe(41184);
    // Advanced Flight: the Airport (Buildings PrereqTech)
    expect(techValue(st, 0, 'ADVANCED_FLIGHT', 1, new Map())).toBe(28316);
  });

  it("counts an older era's row once per era between, plus one", () => {
    const st = { gameEra: 2 } as unknown as GameState;
    expect(techValue(st, 0, 'POTTERY', 12, new Map())).toBe(50905);
    expect(techValue(st, 0, 'MINING', 1, new Map())).toBe(77233);
  });
});

describe("the research AI's analysis (0x761170, 0x7604e0)", () => {
  const setup = () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    cs.research.techs = ['POTTERY', 'ANIMAL_HUSBANDRY', 'MINING'];
    return { state, cs, by: (id: string) => researchAnalysis(state, cs.seat, 5).find((e) => e.tech === id)! };
  };

  it('walks the prerequisites three levels: the turns summed, the next step the last added', () => {
    const { by } = setup();
    expect(by('WRITING')).toMatchObject({ turns: 5, next: 'WRITING' });
    expect(by('CURRENCY')).toMatchObject({ turns: 20, next: 'WRITING' });
    expect(by('MATHEMATICS')).toMatchObject({ turns: 44, next: 'WRITING' });
    // past the horizon: -9999
    expect(by('APPRENTICESHIP')).toMatchObject({ turns: 76, next: 'ARCHERY', base: -9999 * 256 });
    // a third level still adding rows: out of reach, no value
    expect(by('EDUCATION')).toMatchObject({ turns: -1, base: 0, score: 0 });
    expect(by('POTTERY')).toMatchObject({ turns: -1, owned: true, base: 0 });
  });

  it("adds the unowned prerequisites' own values one and two levels up", () => {
    const { by } = setup();
    const m = by('MATHEMATICS');
    expect(m.score).toBe(m.base + by('CURRENCY').base + by('WRITING').base);
  });
});

describe("the research AI's choice (0x763020, 0x75d530)", () => {
  it("takes the best row's next step and holds the row as the goal", () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    cs.research.techs = ['POTTERY', 'ANIMAL_HUSBANDRY', 'MINING'];
    const ents = researchAnalysis(state, cs.seat, 5);
    const best = ents.filter((e) => !e.owned).reduce((a, b) => (b.score > a.score ? b : a));
    const c = researchChoice(state, cs.seat, ents, null, () => -1)!;
    expect(c.goal).toBe(best.tech);
    expect(c.tech).toBe(best.next);
  });

  it("passes a completed row's dependents over", () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    cs.research.techs = ['POTTERY', 'ANIMAL_HUSBANDRY', 'MINING'];
    const ents = researchAnalysis(state, cs.seat, 5);
    cs.research.techs.push('WRITING');
    const c = researchCompletionChoice(state, cs.seat, ents, 'WRITING', () => -1)!;
    expect(ents.find((e) => e.tech === c.goal)!.next).not.toBe('WRITING');
  });

  it('draws over the researchable rows where no row is in reach and no goal is held', () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    // before any analysis every row stands out of reach
    const ents = researchAnalysis(state, cs.seat, 0).map((e) => ({ ...e, turns: -1 }));
    const seen: number[] = [];
    const c = researchChoice(state, cs.seat, ents, null, (n) => (seen.push(n), 2))!;
    expect(seen).toEqual([5]);
    expect(c).toEqual({ tech: 'MINING', goal: null });
  });
});

describe("a city-state's boosts (detectBoosts at its turn)", () => {
  it("lands a civic's eureka on the item in hand and completes one it fills", () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    // runs/h1_duelw1117 t71: every city-state's Stirrups boosted by Feudalism
    cs.research.civics = ['FEUDALISM'];
    cs.research.tech = 'STIRRUPS';
    cs.research.techProgress = 10;
    // Banking's by Guilds, on progress kept a point short of the cost
    cs.research.civics.push('GUILDS');
    cs.research.techRetained.BANKING = 359;
    detectBoosts(state, cs.seat);
    expect(cs.research.boosted).toEqual(expect.arrayContaining(['STIRRUPS', 'BANKING']));
    expect(cs.research.techProgress).toBe(102);
    // filled to its cost, Banking is held and its kept progress spent
    expect(cs.research.techs).toContain('BANKING');
    expect(cs.research.techRetained.BANKING).toBeUndefined();
  });
});

describe("a city-state's government", () => {
  it('is Chiefdom whatever its civics unlock; the Free Cities hold none', () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    cs.research.civics = ['CODE_OF_LAWS', 'EARLY_EMPIRE', 'POLITICAL_PHILOSOPHY'];
    // runs/h1_duelw1124: every city-state's government row 0 at every turn
    expect(seatGovernment(state, cs.seat)).toBe('CHIEFDOM');
    expect(seatGovernment(state, FREE_SEAT)).toBeNull();
  });
});
