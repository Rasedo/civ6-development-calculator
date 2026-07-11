/**
 * §F hunt tooling: print the canonical statelog lines for a TS state
 * CHECKPOINT (gpu/fixtures/ckpt/ts_<rng>_t<turn>.json, written by the
 * replay every CIV6_CKPT turns) — the JIT twin of gpu/ckptdiff.py's
 * GPU-side reader. No re-simulation: the lines are computed on demand
 * from the raw dumped state (fresh-stats semantics, same as tsStateLines
 * at trace time).
 *
 *   npx vite-node scripts/ckpt-lines.ts gpu/fixtures/ckpt/ts_2026006084_t100.json
 */
import { readFileSync } from 'fs';
import { deserialize } from '../src/core/game';
import { tsStateLines } from './statelog';

const path = process.argv[2];
if (!path) {
  console.error('usage: vite-node scripts/ckpt-lines.ts <ts_ckpt.json> [rollout.json]');
  process.exit(1);
}
const roll = JSON.parse(readFileSync(process.argv[3] ?? 'gpu/fixtures/rollout.json', 'utf8'));
const wrapped = JSON.parse(readFileSync(path, 'utf8'));
const state = deserialize(wrapped.state);
for (const line of tsStateLines(state, roll.unitIds)) console.log(line);
