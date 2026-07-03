/**
 * Worker-thread episode runner. The trainer sends parameter sets and
 * (params, seed) jobs; the worker replies with scores in job order.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { runEpisode, type EnvOptions } from '../src/core/rlenv';
import { makePolicy, type PolicySpec } from '../src/core/policy';

interface WorkerJob {
  /** Index into the message's paramsSets. */
  p: number;
  seed: number;
}

interface WorkerMessage {
  id: number;
  paramsSets: number[][];
  jobs: WorkerJob[];
  env: Omit<EnvOptions, 'seed'>;
}

const spec = workerData.spec as PolicySpec;

parentPort!.on('message', (msg: WorkerMessage) => {
  const policies = msg.paramsSets.map((p) => makePolicy(spec, p));
  const scores = msg.jobs.map((job) =>
    runEpisode({ ...msg.env, seed: job.seed }, policies[job.p]).score,
  );
  parentPort!.postMessage({ id: msg.id, scores });
});
