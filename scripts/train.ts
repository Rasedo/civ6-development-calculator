/**
 * OpenAI-style evolution-strategy trainer with antithetic sampling, rank
 * shaping, Adam, worker-thread parallelism and checkpoint/resume — built
 * for long unattended runs.
 *
 * Usage (bundled; run through npm so the build happens first):
 *   npm run rl:train -- --gens 300 --pop 32 --workers 7
 *   npm run rl:train -- --resume            # continue rl-checkpoint.json
 *
 * Flags (defaults): --gens 200  --pop 24  --sigma 0.15  --lr 0.05
 *   --seeds-per-gen 8  --horizon (default: the game's TURN_LIMIT)  --arch mlp|bilinear|linear (mlp)
 *   --hidden 24  --objective balanced  --workers <cpus-1>  --eval-every 10
 *   --resume  --dashboard 4650 (0 disables)
 *
 * Writes rl-weights.json (best held-out weights), rl-checkpoint.json
 * (full trainer state, saved every generation and on Ctrl+C) and
 * rl-history.jsonl (per-generation stats). While training, live charts
 * are served at http://localhost:4650.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { startDashboard, type GenStat } from './dashboard';
import {
  runEpisode,
  CANDIDATE_FEATURES,
  OBSERVATION_SIZE,
  FEATURE_VERSION,
  type EnvOptions,
} from '../src/core/rlenv';
import type { Objective } from '../src/core/planner';
import { TURN_LIMIT } from '../src/core/game';
import { makePolicy, paramCount, type PolicyArch, type PolicySpec } from '../src/core/policy';
import { Lcg, makeAdam, adamStep, esGradient, type AdamState } from '../src/core/es';

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[a.slice(2)] = argv[++i];
    } else {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const num = (key: string, dflt: number) => (args[key] !== undefined ? Number(args[key]) : dflt);

const GENS = num('gens', 200);
const POP = Math.max(2, Math.ceil(num('pop', 24) / 2) * 2); // even (antithetic pairs)
const SIGMA = num('sigma', 0.15);
const LR = num('lr', 0.05);
const SEEDS_PER_GEN = num('seeds-per-gen', 8);
const HORIZON = num('horizon', TURN_LIMIT);
const ARCH = (args.arch as PolicyArch) || 'mlp';
const HIDDEN = num('hidden', 24);
const OBJECTIVE = (args.objective as Objective) || 'balanced';
const EVAL_EVERY = num('eval-every', 10);
const RESUME = args.resume === true || args.resume === 'true';
/** Live chart server port (0 disables). */
const DASHBOARD_PORT = num('dashboard', 4650);

// Bundled runs can use worker threads; vite-node (TS) runs fall back inline.
const isBundled = !import.meta.url.endsWith('.ts');
const WORKERS = Math.max(0, num('workers', isBundled ? Math.max(1, availableParallelism() - 1) : 0));

const CHECKPOINT = 'rl-checkpoint.json';
const WEIGHTS = 'rl-weights.json';
const HISTORY_LOG = 'rl-history.jsonl';
const HELD_OUT_SEEDS = [7101, 7207, 7303, 7411, 7523, 7639, 7741, 7853];

const spec: PolicySpec = {
  arch: ARCH,
  obsSize: OBSERVATION_SIZE,
  candSize: CANDIDATE_FEATURES,
  hidden: HIDDEN,
};
const DIM = paramCount(spec);

const envOpts = (seed: number): EnvOptions => ({
  seed,
  width: 44,
  height: 26,
  horizon: HORIZON,
  objective: OBJECTIVE,
});

// --- episode execution (worker pool or inline) --------------------------------

interface Job {
  p: number;
  seed: number;
}

class Runner {
  private workers: Worker[] = [];
  private nextMsgId = 0;

  constructor(readonly threads: number) {
    if (threads > 0) {
      const url = new URL('./rl-worker.js', import.meta.url);
      for (let i = 0; i < threads; i++) {
        this.workers.push(new Worker(url, { workerData: { spec } }));
      }
    }
  }

  async run(paramsSets: number[][], jobs: Job[]): Promise<number[]> {
    if (this.workers.length === 0) {
      const policies = paramsSets.map((p) => makePolicy(spec, p));
      return jobs.map((j) => runEpisode(envOpts(j.seed), policies[j.p]).score);
    }
    const chunks: Job[][] = this.workers.map(() => []);
    jobs.forEach((j, i) => chunks[i % chunks.length].push(j));
    const results = await Promise.all(
      this.workers.map((w, i) => {
        if (chunks[i].length === 0) return Promise.resolve({ jobs: chunks[i], scores: [] as number[] });
        const id = this.nextMsgId++;
        return new Promise<{ jobs: Job[]; scores: number[] }>((resolve, reject) => {
          const onMessage = (msg: { id: number; scores: number[] }) => {
            if (msg.id !== id) return;
            w.off('message', onMessage);
            w.off('error', onError);
            resolve({ jobs: chunks[i], scores: msg.scores });
          };
          const onError = (err: Error) => {
            w.off('message', onMessage);
            reject(err);
          };
          w.on('message', onMessage);
          w.on('error', onError);
          w.postMessage({
            id,
            paramsSets,
            jobs: chunks[i],
            env: { width: 44, height: 26, horizon: HORIZON, objective: OBJECTIVE },
          });
        });
      }),
    );
    // Scores arrive per-chunk; scatter them back into job order.
    const jobIndex = new Map<Job, number>();
    jobs.forEach((j, i) => jobIndex.set(j, i));
    const out = new Array<number>(jobs.length).fill(0);
    for (const { jobs: chunk, scores } of results) {
      chunk.forEach((j, k) => {
        out[jobIndex.get(j)!] = scores[k];
      });
    }
    return out;
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

// --- checkpointing -------------------------------------------------------------

interface Checkpoint {
  featureVersion: number;
  spec: PolicySpec;
  theta: number[];
  adam: AdamState;
  rngState: number;
  gen: number;
  bestHeldOut: number;
  bestTheta: number[];
  config: { sigma: number; lr: number; pop: number; seedsPerGen: number; horizon: number; objective: string };
  /** Per-generation stats (drives the dashboard across resumes). */
  history?: GenStat[];
}

function saveCheckpoint(cp: Checkpoint): void {
  writeFileSync(CHECKPOINT, JSON.stringify(cp));
}

function saveWeights(theta: number[], meanScore: number, gen: number): void {
  writeFileSync(
    WEIGHTS,
    JSON.stringify(
      { featureVersion: FEATURE_VERSION, arch: spec.arch, spec, params: theta, meanScore, gen },
      null,
      2,
    ),
  );
}

// --- main ----------------------------------------------------------------------

async function main(): Promise<void> {
  let theta = new Array<number>(DIM).fill(0);
  let adam = makeAdam(DIM);
  let rng = new Lcg(987654321);
  let startGen = 0;
  let bestHeldOut = -Infinity;
  let bestTheta = [...theta];
  let history: GenStat[] = [];

  if (RESUME && existsSync(CHECKPOINT)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT, 'utf-8')) as Checkpoint;
    if (cp.featureVersion !== FEATURE_VERSION || paramCount(cp.spec) !== DIM || cp.spec.arch !== ARCH) {
      console.error('Checkpoint is for a different feature layout / architecture — start fresh.');
      process.exit(1);
    }
    theta = cp.theta;
    adam = cp.adam;
    rng = new Lcg(cp.rngState);
    startGen = cp.gen;
    bestHeldOut = cp.bestHeldOut;
    bestTheta = cp.bestTheta;
    history = cp.history ?? [];
    console.log(`Resumed at generation ${startGen} (best held-out ${bestHeldOut.toFixed(1)})`);
  }
  // Rebuild the JSONL log to match the in-memory history, then append live.
  writeFileSync(HISTORY_LOG, history.map((h) => JSON.stringify(h) + '\n').join(''));

  const dashboard =
    DASHBOARD_PORT > 0
      ? startDashboard(DASHBOARD_PORT, () => ({
          history,
          gens: GENS,
          bestHeldOut: bestHeldOut === -Infinity ? null : bestHeldOut,
          arch: ARCH,
          dim: DIM,
          config: { sigma: SIGMA, lr: LR, pop: POP, seedsPerGen: SEEDS_PER_GEN, horizon: HORIZON, objective: OBJECTIVE },
        }))
      : null;

  console.log(
    `ES training: arch=${ARCH} params=${DIM} pop=${POP} sigma=${SIGMA} lr=${LR} ` +
      `seeds/gen=${SEEDS_PER_GEN} horizon=${HORIZON} objective=${OBJECTIVE} workers=${WORKERS}` +
      (isBundled ? '' : ' (vite-node: inline, no threads)'),
  );

  const runner = new Runner(WORKERS);
  let interrupted = false;
  const checkpointNow = (gen: number) =>
    saveCheckpoint({
      featureVersion: FEATURE_VERSION,
      spec,
      theta,
      adam,
      rngState: rng.state,
      gen,
      bestHeldOut,
      bestTheta,
      config: { sigma: SIGMA, lr: LR, pop: POP, seedsPerGen: SEEDS_PER_GEN, horizon: HORIZON, objective: OBJECTIVE },
      history,
    });
  process.on('SIGINT', () => {
    interrupted = true;
    console.log('\nInterrupted — finishing this generation, then checkpointing…');
  });

  const t0 = Date.now();
  let episodes = 0;

  for (let gen = startGen + 1; gen <= GENS; gen++) {
    const genT0 = Date.now();
    // Fresh training seeds each generation (same for the whole population).
    const seeds = Array.from({ length: SEEDS_PER_GEN }, () => 1000 + rng.int(1_000_000));

    const half = POP / 2;
    const epsilons: number[][] = [];
    const paramsSets: number[][] = [];
    for (let i = 0; i < half; i++) {
      const eps = Array.from({ length: DIM }, () => rng.gaussian());
      epsilons.push(eps);
      paramsSets.push(theta.map((t, j) => t + SIGMA * eps[j]));
      paramsSets.push(theta.map((t, j) => t - SIGMA * eps[j]));
    }

    const jobs: Job[] = [];
    for (let p = 0; p < paramsSets.length; p++) {
      for (const seed of seeds) jobs.push({ p, seed });
    }
    const scores = await runner.run(paramsSets, jobs);
    episodes += jobs.length;

    const fitness = new Array<number>(paramsSets.length).fill(0);
    jobs.forEach((j, i) => {
      fitness[j.p] += scores[i] / SEEDS_PER_GEN;
    });

    const grad = esGradient(epsilons, fitness, SIGMA);
    adamStep(theta, grad, adam, LR);

    const mean = fitness.reduce((a, b) => a + b, 0) / fitness.length;
    const max = Math.max(...fitness);
    const std = Math.sqrt(fitness.reduce((s, f) => s + (f - mean) ** 2, 0) / fitness.length);
    const elapsed = (Date.now() - t0) / 1000;
    const epsPerSec = episodes / elapsed;
    const remaining = ((GENS - gen) * jobs.length) / Math.max(0.1, epsPerSec);
    let line = `gen ${gen}/${GENS}  fit ${mean.toFixed(1)} (max ${max.toFixed(1)})  ${epsPerSec.toFixed(1)} eps/s  ETA ${(remaining / 60).toFixed(0)}m`;

    let genEpisodes = jobs.length;
    let held: number | null = null;
    if (gen % EVAL_EVERY === 0 || gen === GENS) {
      const evalJobs: Job[] = HELD_OUT_SEEDS.map((seed) => ({ p: 0, seed }));
      const evalScores = await runner.run([theta], evalJobs);
      episodes += evalJobs.length;
      genEpisodes += evalJobs.length;
      held = evalScores.reduce((a, b) => a + b, 0) / evalScores.length;
      line += `  held-out ${held.toFixed(1)}`;
      if (held > bestHeldOut) {
        bestHeldOut = held;
        bestTheta = [...theta];
        saveWeights(bestTheta, bestHeldOut, gen);
        line += '  ★ saved';
      }
    }

    const stat: GenStat = {
      gen,
      fit: Math.round(mean * 10) / 10,
      fitMax: Math.round(max * 10) / 10,
      fitStd: Math.round(std * 10) / 10,
      held: held === null ? null : Math.round(held * 10) / 10,
      best: bestHeldOut === -Infinity ? 0 : Math.round(bestHeldOut * 10) / 10,
      gnorm: Math.round(Math.sqrt(grad.reduce((s, g) => s + g * g, 0)) * 1000) / 1000,
      tnorm: Math.round(Math.sqrt(theta.reduce((s, v) => s + v * v, 0)) * 100) / 100,
      eps: Math.round((genEpisodes / Math.max(0.05, (Date.now() - genT0) / 1000)) * 10) / 10,
      t: Math.round(elapsed),
    };
    history.push(stat);
    appendFileSync(HISTORY_LOG, JSON.stringify(stat) + '\n');

    console.log(line);
    checkpointNow(gen);
    if (interrupted) break;
  }

  if (bestHeldOut === -Infinity) {
    // Never evaluated (short run): save the final weights anyway.
    saveWeights(theta, NaN, GENS);
  }
  await runner.close();
  dashboard?.close();
  console.log(
    `\nDone in ${((Date.now() - t0) / 60000).toFixed(1)} min · best held-out ${bestHeldOut.toFixed(1)} → ${WEIGHTS}`,
  );
  console.log('Evaluate with: npm run rl:eval');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
