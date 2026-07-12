/**
 * Stdio bridge: exposes CivEnv to another language (the Python PPO trainer)
 * as a JSON-lines protocol on stdin/stdout. One process hosts one or more
 * environments; stdout carries protocol lines ONLY.
 *
 * Protocol (one JSON object per line):
 *   → {"cmd":"init","envs":1,"horizon":250,"objective":"balanced","seed":1}
 *     (omitting "horizon" defaults it to the game's TURN_LIMIT)
 *   ← {"ok":true,"obsSize":30,"candSize":29,"maxCands":24,"featureVersion":4}
 *   → {"cmd":"reset"}
 *   ← {"results":[{obs,cands,mask,reward:0,done:false}, …]}         (per env)
 *   → {"cmd":"step","actions":[3, …]}                               (per env)
 *   ← {"results":[{obs,cands,mask,reward,done,score?,turn}, …]}
 *   → {"cmd":"close"}
 *
 * `cands` is a flat maxCands×candSize array (zero-padded); `mask` marks the
 * valid prefix. Episodes auto-reset on done (the returned obs/cands belong
 * to the fresh episode; `score`/`turn` describe the finished one), matching
 * vectorized-env conventions.
 */

import { createInterface } from 'node:readline';
import {
  CivEnv,
  CANDIDATE_FEATURES,
  OBSERVATION_SIZE,
  MAX_CANDIDATES,
  FEATURE_VERSION,
  type StepResult,
} from '../src/core/rlenv';
import { TURN_LIMIT } from '../src/core/game';
import { empireScore } from '../src/core/empirePlanner';
import { spatialObservation, SPATIAL_PLANE_COUNT } from '../src/core/spatial';
import type { Objective } from '../src/core/planner';

interface EnvSlot {
  env: CivEnv;
  episodes: number;
  last: StepResult;
  /** Empire score at the current point (rewards telescope: Σ = final − start). */
  score: number;
}

let slots: EnvSlot[] = [];
let horizon = TURN_LIMIT;
let objective: Objective = 'balanced';
let baseSeed = 1;
/** When true, results carry a base64 uint8 map tensor for CNN policies. */
let spatial = false;
const MAP_W = 44;
const MAP_H = 26;

function envSeed(index: number, episode: number): number {
  // Deterministic, collision-free-enough seed schedule per env slot.
  return ((baseSeed + index * 7919 + episode * 104729) % 2_000_000_000) + 1;
}

function makeEnv(index: number, episode: number): CivEnv {
  return new CivEnv({
    seed: envSeed(index, episode),
    width: MAP_W,
    height: MAP_H,
    horizon,
    objective,
  });
}

interface WireResult {
  obs: number[];
  cands: number[];
  mask: number[];
  reward: number;
  done: boolean;
  score?: number;
  turn: number;
  /** base64 uint8 planes×h×w tensor (spatial mode only). */
  map?: string;
}

function encode(env: CivEnv, r: StepResult, reward: number, done: boolean, score?: number): WireResult {
  const cands = new Array<number>(MAX_CANDIDATES * CANDIDATE_FEATURES).fill(0);
  const mask = new Array<number>(MAX_CANDIDATES).fill(0);
  r.candidates.slice(0, MAX_CANDIDATES).forEach((c, i) => {
    mask[i] = 1;
    for (let j = 0; j < CANDIDATE_FEATURES; j++) cands[i * CANDIDATE_FEATURES + j] = c.features[j] ?? 0;
  });
  if (mask[0] === 0) mask[0] = 1; // never emit an all-invalid mask
  const out: WireResult = { obs: r.observation, cands, mask, reward, done, score, turn: r.turn };
  if (spatial) {
    out.map = Buffer.from(spatialObservation(env.state)).toString('base64');
  }
  return out;
}

function resetSlot(index: number): WireResult {
  const slot = slots[index];
  slot.env = makeEnv(index, slot.episodes);
  slot.last = slot.env.reset();
  slot.score = empireScore(slot.env.state, objective); // starting score level
  return encode(slot.env, slot.last, 0, false);
}

function stepSlot(index: number, action: number): WireResult {
  const slot = slots[index];
  const nCands = slot.last.candidates.length;
  const a = action >= 0 && action < nCands ? action : 0;
  const r = slot.env.step(a);
  if (r.done) {
    // CivEnv's terminal reward is the FULL final score; convert to a delta so
    // the PPO return telescopes cleanly to (final − start) with no spike.
    const finalScore = r.reward;
    const reward = finalScore - slot.score;
    slot.episodes += 1;
    const fresh = resetSlot(index);
    return { ...fresh, reward, done: true, score: finalScore, turn: r.turn };
  }
  slot.score += r.reward;
  slot.last = r;
  return encode(slot.env, r, r.reward, false);
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg: {
    cmd: string;
    envs?: number;
    horizon?: number;
    objective?: string;
    seed?: number;
    actions?: number[];
    spatial?: boolean;
  };
  try {
    msg = JSON.parse(trimmed);
  } catch {
    process.stdout.write(JSON.stringify({ error: 'bad json' }) + '\n');
    return;
  }
  try {
    switch (msg.cmd) {
      case 'init': {
        horizon = msg.horizon ?? TURN_LIMIT;
        objective = (msg.objective as Objective) ?? 'balanced';
        baseSeed = msg.seed ?? 1;
        spatial = msg.spatial === true;
        const n = Math.max(1, msg.envs ?? 1);
        slots = Array.from({ length: n }, (_, i) => {
          const env = makeEnv(i, 0);
          return { env, episodes: 0, last: env.reset(), score: 0 };
        });
        slots.forEach((slot) => {
          slot.score = empireScore(slot.env.state, objective);
        });
        process.stdout.write(
          JSON.stringify({
            ok: true,
            obsSize: OBSERVATION_SIZE,
            candSize: CANDIDATE_FEATURES,
            maxCands: MAX_CANDIDATES,
            featureVersion: FEATURE_VERSION,
            mapShape: spatial ? [SPATIAL_PLANE_COUNT, MAP_H, MAP_W] : null,
          }) + '\n',
        );
        break;
      }
      case 'reset': {
        const results = slots.map((_, i) => resetSlot(i));
        process.stdout.write(JSON.stringify({ results }) + '\n');
        break;
      }
      case 'step': {
        const actions = msg.actions ?? [];
        const results = slots.map((_, i) => stepSlot(i, actions[i] ?? 0));
        process.stdout.write(JSON.stringify({ results }) + '\n');
        break;
      }
      case 'close':
        process.exit(0);
        break;
      default:
        process.stdout.write(JSON.stringify({ error: `unknown cmd ${msg.cmd}` }) + '\n');
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: String(err) }) + '\n');
  }
});
rl.on('close', () => process.exit(0));
