/**
 * Evolution-strategy trainer for the linear candidate-scoring policy.
 * Usage: npm run rl:train [-- generations] (default 20)
 * Writes the best weight vector to rl-weights.json.
 */

import { writeFileSync } from 'node:fs';
import { runEpisode, linearPolicy, CANDIDATE_FEATURES, FEATURE_VERSION, type EnvOptions } from '../src/core/rlenv';

const GENERATIONS = Number(process.argv[2] ?? 20);
const POPULATION = 12;
const SIGMA = 0.4;
const TRAIN_SEEDS = [11, 22, 33, 44, 55, 66];

const envOpts = (seed: number): EnvOptions => ({
  seed,
  width: 44,
  height: 26,
  horizon: 80,
  objective: 'balanced',
});

function fitness(weights: number[]): number {
  let total = 0;
  for (const seed of TRAIN_SEEDS) {
    total += runEpisode(envOpts(seed), linearPolicy(weights)).score;
  }
  return total / TRAIN_SEEDS.length;
}

// Deterministic pseudo-random for reproducible training runs.
let trainRng = 987654321;
function rand(): number {
  trainRng = (trainRng * 1664525 + 1013904223) >>> 0;
  return trainRng / 4294967296;
}
function gaussian(): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

let best = new Array(CANDIDATE_FEATURES).fill(0);
best[1] = 1; // seed heuristic: like districts
let bestFit = fitness(best);
console.log(`gen 0: mean score ${bestFit.toFixed(1)}`);

const t0 = Date.now();
for (let gen = 1; gen <= GENERATIONS; gen++) {
  for (let p = 0; p < POPULATION; p++) {
    const candidate = best.map((w) => w + gaussian() * SIGMA);
    const fit = fitness(candidate);
    if (fit > bestFit) {
      bestFit = fit;
      best = candidate;
    }
  }
  console.log(`gen ${gen}: best mean score ${bestFit.toFixed(1)}`);
}
const secs = (Date.now() - t0) / 1000;
console.log(`\nTrained ${GENERATIONS} generations x ${POPULATION} in ${secs.toFixed(1)}s`);
console.log(`Weights: [${best.map((w) => w.toFixed(3)).join(', ')}]`);
writeFileSync(
  'rl-weights.json',
  JSON.stringify({ featureVersion: FEATURE_VERSION, weights: best, meanScore: bestFit }, null, 2),
);
console.log('Wrote rl-weights.json — evaluate with: npm run rl:eval');
