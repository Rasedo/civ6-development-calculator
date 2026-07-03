import { describe, it, expect } from 'vitest';
import { makeState, tileAtCoords } from './helpers';
import { foundCity } from '../src/core/game';
import { loadPolicyJson, adviseAll } from '../src/core/aiAdvisor';
import { applyEnvAction, CANDIDATE_FEATURES, OBSERVATION_SIZE, FEATURE_VERSION, MAX_CANDIDATES } from '../src/core/rlenv';
import { paramCount, type PolicySpec } from '../src/core/policy';
import { sb3Logits, type Sb3MlpPolicy } from '../src/core/sb3';

function esWeightsJson(): string {
  const spec: PolicySpec = { arch: 'mlp', obsSize: OBSERVATION_SIZE, candSize: CANDIDATE_FEATURES, hidden: 8 };
  const params = Array.from({ length: paramCount(spec) }, (_, i) => Math.sin(i) * 0.3);
  return JSON.stringify({ featureVersion: FEATURE_VERSION, arch: 'mlp', spec, params, meanScore: 300 });
}

describe('sb3 forward pass', () => {
  it('computes tanh-MLP logits exactly', () => {
    // 2 inputs → 2 hidden (tanh) → 2 logits, hand-checkable numbers.
    const p: Sb3MlpPolicy = {
      kind: 'sb3-mlp',
      featureVersion: FEATURE_VERSION,
      obsSize: 1,
      candSize: 1,
      maxCands: 1,
      activation: 'tanh',
      hidden: [{ w: [[1, 0], [0, -1]], b: [0, 0.5] }],
      action: { w: [[1, 1], [2, 0]], b: [0.1, 0] },
    };
    const [l0, l1] = sb3Logits(p, [0.5, 1]);
    const h0 = Math.tanh(0.5);
    const h1 = Math.tanh(-1 + 0.5);
    expect(l0).toBeCloseTo(h0 + h1 + 0.1, 10);
    expect(l1).toBeCloseTo(2 * h0, 10);
  });
});

describe('AI advisor', () => {
  it('loads ES weights and ranks open decisions', () => {
    const policy = loadPolicyJson(esWeightsJson());
    expect(policy.compatible).toBe(true);
    expect(policy.label).toContain('mlp');

    const state = makeState();
    foundCity(state, tileAtCoords(state.map, 5, 5).index);
    const recs = adviseAll(state, policy);
    expect(recs.length).toBeGreaterThan(0);
    // Fresh game: research is unset and the city queue is empty.
    expect(recs.some((r) => r.decision.type === 'research')).toBe(true);
    const production = recs.find((r) => r.decision.type === 'production');
    expect(production).toBeDefined();
    for (const rec of recs) {
      for (let i = 1; i < rec.options.length; i++) {
        expect(rec.options[i - 1].score).toBeGreaterThanOrEqual(rec.options[i].score);
      }
    }
  });

  it('applying the top production pick fills the queue', () => {
    const policy = loadPolicyJson(esWeightsJson());
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index).city!;
    const recs = adviseAll(state, policy);
    const production = recs.find((r) => r.decision.type === 'production')!;
    const before = city.queue.length + state.settlers;
    applyEnvAction(state, production.decision, production.options[0].candidate.action);
    const after =
      city.queue.length + state.settlers + (city.buildings.length > 1 ? 1 : 0) + state.units.length;
    expect(after).toBeGreaterThan(before);
  });

  it('loads an exported PPO policy and scores candidates via logits', () => {
    const hiddenDim = 4;
    const inDim = OBSERVATION_SIZE + MAX_CANDIDATES * CANDIDATE_FEATURES;
    const p: Sb3MlpPolicy = {
      kind: 'sb3-mlp',
      featureVersion: FEATURE_VERSION,
      obsSize: OBSERVATION_SIZE,
      candSize: CANDIDATE_FEATURES,
      maxCands: MAX_CANDIDATES,
      activation: 'tanh',
      hidden: [
        {
          w: Array.from({ length: hiddenDim }, (_, o) =>
            Array.from({ length: inDim }, (_, i) => Math.sin(o + i * 0.01) * 0.05),
          ),
          b: new Array(hiddenDim).fill(0.01),
        },
      ],
      action: {
        w: Array.from({ length: MAX_CANDIDATES }, (_, o) =>
          Array.from({ length: hiddenDim }, (_, i) => Math.cos(o + i) * 0.2),
        ),
        b: new Array(MAX_CANDIDATES).fill(0),
      },
    };
    const policy = loadPolicyJson(JSON.stringify(p));
    expect(policy.compatible).toBe(true);
    const state = makeState();
    foundCity(state, tileAtCoords(state.map, 5, 5).index);
    const recs = adviseAll(state, policy);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].options.length).toBeGreaterThan(0);
  });

  it('rejects weights with the wrong parameter count', () => {
    const spec: PolicySpec = { arch: 'linear', obsSize: OBSERVATION_SIZE, candSize: CANDIDATE_FEATURES };
    const bad = JSON.stringify({ featureVersion: FEATURE_VERSION, arch: 'linear', spec, params: [1, 2, 3] });
    expect(() => loadPolicyJson(bad)).toThrow(/params/);
  });
});
