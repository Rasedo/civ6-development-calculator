/**
 * Paired-seed policy evaluation on held-out seeds.
 * Usage: npm run rl:eval — compares random, greedy-adjacency, and (if
 * rl-weights.json exists) the trained linear policy on identical seeds.
 */

import { existsSync, readFileSync } from 'node:fs';
import { runEpisode, linearPolicy, CANDIDATE_FEATURES, FEATURE_VERSION, type Candidate, type EnvOptions } from '../src/core/rlenv';

const EVAL_SEEDS = [101, 202, 303, 404, 505, 606, 707, 808];

const envOpts = (seed: number): EnvOptions => ({
  seed,
  width: 44,
  height: 26,
  horizon: 80,
  objective: 'balanced',
});

// Baselines --------------------------------------------------------------------
let pick = 123456789;
function pseudoRandomPolicy(_obs: number[], cands: Candidate[]): number {
  pick = (pick * 1103515245 + 12345) >>> 0;
  return cands.length ? pick % cands.length : 0;
}

// Greedy hand baseline for the 29-feature layout (kinds ×13, cost, turns,
// adjacency, site, Δyields ×6, housing, amenity, unlocks, threat, builders, military).
const GREEDY = [
  0.6, 1.0, 0.5, 1.2, -0.2, 0.1, 0.2, 0.5, 0.5, 0.5, 0.3, 0.4, 0,
  -0.1, -0.3, 0.8, 0.6,
  0.3, 0.4, 0.2, 0.5, 0.4, 0.2,
  0.3, 0.3, 0.4, -0.1, -0.4, -0.2,
];

const policies: Record<string, (obs: number[], cands: Candidate[]) => number> = {
  random: pseudoRandomPolicy,
  greedy: linearPolicy(GREEDY),
};
if (existsSync('rl-weights.json')) {
  const data = JSON.parse(readFileSync('rl-weights.json', 'utf-8'));
  if (data.featureVersion === FEATURE_VERSION && data.weights?.length === CANDIDATE_FEATURES) {
    policies.trained = linearPolicy(data.weights);
  } else {
    console.log('rl-weights.json ignored: stale feature layout — retrain with npm run rl:train\n');
  }
}

const t0 = Date.now();
const results: Record<string, number[]> = {};
for (const [name, policy] of Object.entries(policies)) {
  pick = 123456789; // reset the random baseline for fairness
  results[name] = EVAL_SEEDS.map((seed) => runEpisode(envOpts(seed), policy).score);
}
const secs = (Date.now() - t0) / 1000;

console.log(`Evaluated ${Object.keys(policies).length} policies x ${EVAL_SEEDS.length} paired seeds in ${secs.toFixed(1)}s\n`);
console.log('policy     mean    per-seed');
for (const [name, scores] of Object.entries(results)) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log(
    `${name.padEnd(10)} ${mean.toFixed(1).padStart(6)}  [${scores.map((s) => s.toFixed(0)).join(', ')}]`,
  );
}
