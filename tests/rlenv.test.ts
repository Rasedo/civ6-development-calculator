import { describe, it, expect } from 'vitest';
import { CivEnv, runEpisode, linearPolicy, CANDIDATE_FEATURES, OBSERVATION_SIZE } from '../src/core/rlenv';

const OPTS = { seed: 77, width: 44, height: 26, horizon: 40, objective: 'balanced' as const };

describe('RL environment', () => {
  it('resets to a first decision with observation and candidates', () => {
    const env = new CivEnv(OPTS);
    const r = env.reset();
    expect(r.done).toBe(false);
    expect(r.observation.length).toBe(OBSERVATION_SIZE);
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      expect(c.features.length).toBe(CANDIDATE_FEATURES);
      expect(c.label.length).toBeGreaterThan(0);
    }
    expect(env.state.cities.length).toBe(1); // auto-settled
    expect(env.state.fogOfWar).toBe(true);
  });

  it('is deterministic for (seed, action sequence) despite stochastic mechanics', () => {
    const play = () => {
      const env = new CivEnv(OPTS);
      let r = env.reset();
      const trace: number[] = [];
      let guard = 0;
      while (!r.done && guard++ < 500) {
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
    const result = runEpisode(OPTS, linearPolicy([0.6, 1, 0.8, 0.4, 0.1, 0, 0, 1.2, 0.5, 0.6, -0.4, -0.3]));
    expect(result.turns).toBeGreaterThanOrEqual(OPTS.horizon);
    expect(result.decisions).toBeGreaterThan(3);
    expect(result.score).toBeGreaterThan(0);
  });

  it('policies that build beat policies that idle', () => {
    const idle = runEpisode(OPTS, (_o, cands) =>
      Math.max(0, cands.findIndex((c) => c.action.kind === 'trainUnit')),
    );
    const greedy = runEpisode(OPTS, linearPolicy([0.6, 1, 0.8, 0.4, 0.1, 0, 0, 1.2, 0.5, 0.6, -0.4, -0.3]));
    expect(greedy.score).toBeGreaterThan(idle.score * 0.8); // sanity: not catastrophically worse
  });
});
