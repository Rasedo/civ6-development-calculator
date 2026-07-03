import { describe, it, expect } from 'vitest';
import { paramCount, scoreCandidate, makePolicy, type PolicySpec } from '../src/core/policy';
import { Lcg, centeredRanks, esGradient, makeAdam, adamStep, ema, linearTrend } from '../src/core/es';
import { runEpisode, CANDIDATE_FEATURES, OBSERVATION_SIZE } from '../src/core/rlenv';
import type { Candidate } from '../src/core/rlenv';

const OBS = 4;
const CAND = 3;

function cand(features: number[]): Candidate {
  return { action: { kind: 'none' }, label: 'x', features };
}

describe('policy architectures', () => {
  it('counts parameters correctly', () => {
    expect(paramCount({ arch: 'linear', obsSize: OBS, candSize: CAND })).toBe(3);
    expect(paramCount({ arch: 'bilinear', obsSize: OBS, candSize: CAND })).toBe(3 * 5);
    expect(paramCount({ arch: 'mlp', obsSize: OBS, candSize: CAND, hidden: 8 })).toBe(
      (OBS + CAND + 1) * 8 + 8 + 1,
    );
  });

  it('linear ignores the observation; bilinear uses it', () => {
    const linSpec: PolicySpec = { arch: 'linear', obsSize: OBS, candSize: CAND };
    const lin = new Array(paramCount(linSpec)).fill(0.5);
    const feat = [1, 0, 2];
    expect(scoreCandidate(linSpec, lin, [0, 0, 0, 0], feat)).toBeCloseTo(
      scoreCandidate(linSpec, lin, [9, 9, 9, 9], feat),
      12,
    );

    const biSpec: PolicySpec = { arch: 'bilinear', obsSize: OBS, candSize: CAND };
    const bi = new Array(paramCount(biSpec)).fill(0.1);
    const a = scoreCandidate(biSpec, bi, [0, 0, 0, 0], feat);
    const b = scoreCandidate(biSpec, bi, [1, 1, 1, 1], feat);
    expect(a).not.toBeCloseTo(b, 6);
  });

  it('mlp is deterministic and argmax breaks ties toward the first candidate', () => {
    const spec: PolicySpec = { arch: 'mlp', obsSize: OBS, candSize: CAND, hidden: 6 };
    const rng = new Lcg(7);
    const params = Array.from({ length: paramCount(spec) }, () => rng.gaussian() * 0.3);
    const policy = makePolicy(spec, params);
    const obs = [0.1, 0.2, 0.3, 0.4];
    const cands = [cand([1, 0, 0]), cand([0, 1, 0]), cand([1, 0, 0])];
    const pick = policy(obs, cands);
    expect(pick).toBe(policy(obs, cands)); // deterministic
    // identical candidates 0 and 2 tie → never pick 2 over 0
    expect(pick === 2).toBe(false);
  });

  it('drives a real episode end to end', () => {
    const spec: PolicySpec = {
      arch: 'mlp',
      obsSize: OBSERVATION_SIZE,
      candSize: CANDIDATE_FEATURES,
      hidden: 8,
    };
    const rng = new Lcg(11);
    const params = Array.from({ length: paramCount(spec) }, () => rng.gaussian() * 0.2);
    const result = runEpisode(
      { seed: 55, width: 44, height: 26, horizon: 25, objective: 'balanced' },
      makePolicy(spec, params),
    );
    expect(result.turns).toBeGreaterThanOrEqual(25);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe('evolution strategy machinery', () => {
  it('Lcg is deterministic and roughly uniform', () => {
    const a = new Lcg(99);
    const b = new Lcg(99);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    const c = new Lcg(1);
    const mean = Array.from({ length: 2000 }, () => c.next()).reduce((x, y) => x + y) / 2000;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('centered ranks span [-0.5, 0.5] in fitness order', () => {
    const ranks = centeredRanks([10, 30, 20]);
    expect(ranks[0]).toBe(-0.5);
    expect(ranks[1]).toBe(0.5);
    expect(ranks[2]).toBe(0);
  });

  it('ema smooths and linearTrend reads slopes', () => {
    const smoothed = ema([0, 10, 10, 10], 0.5);
    expect(smoothed[0]).toBe(0);
    expect(smoothed[1]).toBe(5);
    expect(smoothed[3]).toBeGreaterThan(smoothed[2]); // still approaching 10
    expect(linearTrend([1, 2, 3, 4])).toBeCloseTo(1, 9);
    expect(linearTrend([5, 5, 5])).toBeCloseTo(0, 9);
    expect(linearTrend([9, 7, 5])).toBeCloseTo(-2, 9);
    expect(linearTrend([3])).toBe(0);
  });

  it('ES with Adam climbs a toy quadratic', () => {
    // Maximize f(θ) = -Σ (θ - target)²
    const target = [1.5, -2, 0.5];
    const f = (t: number[]) => -t.reduce((s, x, i) => s + (x - target[i]) ** 2, 0);
    const theta = [0, 0, 0];
    const adam = makeAdam(3);
    const rng = new Lcg(5);
    const sigma = 0.1;
    for (let gen = 0; gen < 300; gen++) {
      const epsilons: number[][] = [];
      const fitness: number[] = [];
      for (let i = 0; i < 8; i++) {
        const eps = [rng.gaussian(), rng.gaussian(), rng.gaussian()];
        epsilons.push(eps);
        fitness.push(f(theta.map((t, j) => t + sigma * eps[j])));
        fitness.push(f(theta.map((t, j) => t - sigma * eps[j])));
      }
      adamStep(theta, esGradient(epsilons, fitness, sigma), adam, 0.05);
    }
    for (let j = 0; j < 3; j++) {
      expect(Math.abs(theta[j] - target[j])).toBeLessThan(0.25);
    }
  });
});
