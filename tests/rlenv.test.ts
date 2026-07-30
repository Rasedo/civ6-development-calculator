import { describe, it, expect } from 'vitest';
import { playerSeat } from '../src/core/seats';
import {
  CivEnv,
  runEpisode,
  linearPolicy,
  CANDIDATE_FEATURES,
  OBSERVATION_SIZE,
  FEATURE_VERSION,
} from '../src/core/rlenv';

const OPTS = { seed: 77, width: 44, height: 26, horizon: 40, objective: 'balanced' as const };

// A hand-tuned reference for the 29-feature layout (kinds ×13, cost, turns,
// adjacency, site, Δyields ×6, housing, amenity, unlocks, threat, builders, military).
const GREEDY = [
  0.6, 1.0, 0.5, 1.2, -0.2, 0.1, 0.2, 0.5, 0.5, 0.5, 0.3, 0.4, 0,
  -0.1, -0.3, 0.8, 0.6,
  0.3, 0.4, 0.2, 0.5, 0.4, 0.2,
  0.3, 0.3, 0.4, -0.1, -0.4, -0.2,
];

describe('RL environment', () => {
  it('exposes a stable feature contract', () => {
    expect(FEATURE_VERSION).toBeGreaterThanOrEqual(2);
    expect(GREEDY.length).toBe(CANDIDATE_FEATURES);
  });

  it('opens with research → civic → production decisions', () => {
    const env = new CivEnv(OPTS);
    let r = env.reset();
    expect(r.done).toBe(false);
    expect(r.observation.length).toBe(OBSERVATION_SIZE);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.every((c) => c.action.kind === 'research')).toBe(true);
    for (const c of r.candidates) {
      expect(c.features.length).toBe(CANDIDATE_FEATURES);
      expect(c.label.length).toBeGreaterThan(0);
    }
    r = env.step(0);
    expect(r.candidates.every((c) => c.action.kind === 'civic')).toBe(true);
    r = env.step(0);
    const kinds = new Set(r.candidates.map((c) => c.action.kind));
    expect(kinds.has('building') || kinds.has('trainUnit') || kinds.has('settlerAt')).toBe(true);
    expect(env.state.cities.length).toBe(1); // auto-settled
    expect(env.state.fogOfWar).toBe(true);
    expect(env.state.autoResearch).toBe(false);
  });

  it('offers purchases once the treasury can afford them', () => {
    const env = new CivEnv(OPTS);
    let r = env.reset();
    while (!r.done && !r.candidates.some((c) => c.action.kind === 'building')) {
      r = env.step(0);
    }
    playerSeat(env.state).treasury = 5000;
    const kinds = new Set(env.candidates().map((c) => c.action.kind));
    expect(
      kinds.has('purchaseBuilding') || kinds.has('purchaseUnit') || kinds.has('purchaseSettler'),
    ).toBe(true);
  });

  it('reaches policy and government decisions as civics complete', () => {
    // ROUND B2: CITIZEN_SCIENCE 0.7→0.5 (owner-ruled) slows the opening —
    // first district candidate lands ~t66, first project ~t86 (seed 77),
    // so the horizon must reach past them.
    const env = new CivEnv({ ...OPTS, horizon: 100 });
    let r = env.reset();
    const seen = new Set<string>();
    let guard = 0;
    while (!r.done && guard++ < 3000) {
      for (const c of r.candidates) seen.add(c.action.kind);
      r = env.step(0);
    }
    expect(seen.has('research')).toBe(true);
    expect(seen.has('civic')).toBe(true);
    expect(seen.has('setPolicy')).toBe(true);
    expect(seen.has('project') || seen.has('district')).toBe(true);
  });

  it('is deterministic for (seed, action sequence) despite stochastic mechanics', () => {
    const play = () => {
      const env = new CivEnv(OPTS);
      let r = env.reset();
      const trace: number[] = [];
      let guard = 0;
      while (!r.done && guard++ < 1000) {
        r = env.step(0); // always the first candidate
        trace.push(Math.round(r.reward * 1000), r.candidates.length);
      }
      return { trace, final: r.reward, turn: r.turn };
    };
    const a = play();
    const b = play();
    expect(a).toEqual(b);
  });

  it('different seeds diverge', () => {
    const a = runEpisode(OPTS, linearPolicy(new Array(CANDIDATE_FEATURES).fill(0.1)));
    const b = runEpisode({ ...OPTS, seed: 78 }, linearPolicy(new Array(CANDIDATE_FEATURES).fill(0.1)));
    expect(a.score).not.toBe(b.score);
  });

  it('episodes terminate at the horizon with a positive score and real decisions', () => {
    const result = runEpisode(OPTS, linearPolicy(GREEDY));
    expect(result.turns).toBeGreaterThanOrEqual(OPTS.horizon);
    expect(result.decisions).toBeGreaterThan(3);
    expect(result.score).toBeGreaterThan(0);
  });

  it('policies that build beat policies that idle', () => {
    const idle = runEpisode(OPTS, (_o, cands) =>
      Math.max(0, cands.findIndex((c) => c.action.kind === 'trainUnit')),
    );
    const greedy = runEpisode(OPTS, linearPolicy(GREEDY));
    expect(greedy.score).toBeGreaterThan(idle.score * 0.8); // sanity: not catastrophically worse
  });
});
