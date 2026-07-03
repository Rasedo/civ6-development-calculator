/**
 * Policy evaluation battery: paired held-out seeds, bootstrap confidence
 * intervals, paired win-rates against the hand baseline, and (optionally)
 * the beam-search empire planner as a baseline.
 *
 * Usage:
 *   npm run rl:eval                       # random / greedy / trained on 50 seeds
 *   npm run rl:eval -- --seeds 100
 *   npm run rl:eval -- --planner          # adds the (slow) planner baseline
 *
 * Flags: --seeds 50  --horizon 100  --objective balanced
 *        --planner  --planner-seeds 10  --weights rl-weights.json
 */

import { existsSync, readFileSync } from 'node:fs';
import {
  CivEnv,
  runEpisode,
  playerAutoPhase,
  CANDIDATE_FEATURES,
  FEATURE_VERSION,
  type Candidate,
  type EnvOptions,
} from '../src/core/rlenv';
import { makePolicy, type PolicySpec } from '../src/core/policy';
import { Lcg } from '../src/core/es';
import { endTurn } from '../src/core/game';
import { searchEmpirePlan, adoptEmpirePlan, empireScore } from '../src/core/empirePlanner';
import type { Objective } from '../src/core/planner';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const num = (key: string, dflt: number) => (args[key] !== undefined ? Number(args[key]) : dflt);

const N_SEEDS = num('seeds', 50);
const HORIZON = num('horizon', 100);
const OBJECTIVE = (args.objective as Objective) || 'balanced';
const RUN_PLANNER = args.planner === true || args.planner === 'true';
const PLANNER_SEEDS = num('planner-seeds', 10);
const WEIGHTS_PATH = (args.weights as string) || 'rl-weights.json';

const EVAL_SEEDS = Array.from({ length: N_SEEDS }, (_, i) => 100 + i * 97);

const envOpts = (seed: number): EnvOptions => ({
  seed,
  width: 44,
  height: 26,
  horizon: HORIZON,
  objective: OBJECTIVE,
});

// --- policies -------------------------------------------------------------------

type Policy = (obs: number[], cands: Candidate[]) => number;

function randomPolicy(): Policy {
  const rng = new Lcg(123456789);
  return (_obs, cands) => (cands.length ? rng.int(cands.length) : 0);
}

// Hand baseline for the 29-feature layout (kinds ×13, cost, turns, adjacency,
// site, Δyields ×6, housing, amenity, unlocks, threat, builders, military).
const GREEDY = [
  0.6, 1.0, 0.5, 1.2, -0.2, 0.1, 0.2, 0.5, 0.5, 0.5, 0.3, 0.4, 0,
  -0.1, -0.3, 0.8, 0.6,
  0.3, 0.4, 0.2, 0.5, 0.4, 0.2,
  0.3, 0.3, 0.4, -0.1, -0.4, -0.2,
];

function greedyPolicy(): Policy {
  const spec: PolicySpec = { arch: 'linear', obsSize: 0, candSize: CANDIDATE_FEATURES };
  return makePolicy(spec, GREEDY);
}

function loadTrained(): { name: string; policy: Policy } | null {
  if (!existsSync(WEIGHTS_PATH)) return null;
  const data = JSON.parse(readFileSync(WEIGHTS_PATH, 'utf-8'));
  if (data.featureVersion !== FEATURE_VERSION) {
    console.log(`${WEIGHTS_PATH} ignored: stale feature layout — retrain with npm run rl:train\n`);
    return null;
  }
  if (data.spec && Array.isArray(data.params)) {
    return { name: `trained(${data.arch})`, policy: makePolicy(data.spec as PolicySpec, data.params) };
  }
  return null;
}

/** The beam-search empire planner driving the same game (no env decisions). */
function plannerScore(seed: number): number {
  const env = new CivEnv(envOpts(seed));
  env.reset(); // identical setup: map, auto-settle, fog, toggles
  const s = env.state;
  s.autoResearch = true; // the planner era predates manual research
  while (s.turn < HORIZON) {
    const anyIdle = s.cities.some((c) => c.queue.length === 0);
    if (anyIdle) {
      const plans = searchEmpirePlan(s, {
        horizon: Math.min(15, HORIZON - s.turn),
        objective: OBJECTIVE,
        beamWidth: 3,
        branch: 4,
        maxDecisions: 6,
      });
      if (plans.length > 0) adoptEmpirePlan(s, plans[0]);
    }
    playerAutoPhase(s);
    endTurn(s);
  }
  return empireScore(s, OBJECTIVE);
}

// --- stats ------------------------------------------------------------------------

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function bootstrapCI(xs: number[], iters = 1000): [number, number] {
  const rng = new Lcg(42424242);
  const means: number[] = [];
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let k = 0; k < xs.length; k++) s += xs[rng.int(xs.length)];
    means.push(s / xs.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(iters * 0.025)], means[Math.floor(iters * 0.975)]];
}

// --- run --------------------------------------------------------------------------

const policies: { name: string; policy: Policy }[] = [
  { name: 'random', policy: randomPolicy() },
  { name: 'greedy', policy: greedyPolicy() },
];
const trained = loadTrained();
if (trained) policies.push(trained);

const t0 = Date.now();
const results = new Map<string, number[]>();
for (const { name, policy } of policies) {
  results.set(
    name,
    EVAL_SEEDS.map((seed) => runEpisode(envOpts(seed), policy).score),
  );
}
if (RUN_PLANNER) {
  results.set(
    'planner',
    EVAL_SEEDS.slice(0, PLANNER_SEEDS).map((seed) => plannerScore(seed)),
  );
}
const secs = (Date.now() - t0) / 1000;

const greedyScores = results.get('greedy')!;
console.log(
  `Evaluated ${results.size} policies · ${N_SEEDS} paired seeds · horizon ${HORIZON} · ${secs.toFixed(0)}s\n`,
);
console.log('policy            mean   95% CI          win vs greedy');
for (const [name, scores] of results) {
  const m = mean(scores);
  const [lo, hi] = bootstrapCI(scores);
  const paired = scores.map((s, i) => s - greedyScores[i % greedyScores.length]);
  const wins = paired.filter((d) => d > 0).length;
  const winRate = name === 'greedy' ? '—' : `${((wins / scores.length) * 100).toFixed(0)}%`;
  console.log(
    `${name.padEnd(16)} ${m.toFixed(1).padStart(6)}  [${lo.toFixed(1)}, ${hi.toFixed(1)}]`.padEnd(48) + winRate,
  );
}
