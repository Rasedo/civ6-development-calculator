---
name: parity-hunt
description: Diagnose a TS/GPU parity-gate failure down to the exact divergent decision. Use whenever parity_test or the rollout/replay gate reports a mismatch.
---

# Parity hunt — from mismatch to the exact divergent decision

A gate failure is a real semantic difference. The hunt ends when you can
name the single decision (turn, actor, rule) where the engines disagree —
then fix the engine that is WRONG. TS is the spec — unless TS itself is
farther from real Civ 6 than the GPU (owner rule): then fix TS.

## Step 0 — the checkpoint bracket (gpu/HUNTING.md: no re-simulation)

Every gate run dumps RAW state checkpoints every 25 turns for ALL games
(transient gpu/fixtures/ckpt/, both engines, on by default).

**When the gate failure already NAMES the turn (it usually does), skip
the search entirely**: the bracket is [floor((turn−1)/25)·25, +25] —
resume both engines from that earlier checkpoint with --log/CIV6_LOG
and you have the statelog diff after simulating a handful of turns.
(Owner catch 2026-07-12: the full `--log` re-simulation of all 72 games
costs ~5 min and re-derives what the dumps already hold — NEVER start
there while checkpoints exist. GPU dumps are per SHARD, keyed by the
shard's first-game rng; your game is batch index rng − first_rng.)

Only when no turn is known (an end-state drift) binary-search first:

```
PYTHONUTF8=1 python gpu/tools/ckptdiff.py --rng <rng>
```
It JIT-computes both statelog line-sets from the raw dumps (no
re-simulation), prints per-checkpoint verdicts and the divergence
bracket, and emits the EXACT resume commands for step 1 — which then
re-simulates ~25 turns instead of 250 (GPU `--resume-t <T> --turns <n>
--ckpt 0`, TS `CIV6_RESUME_T=<T> CIV6_CKPT=0`). Resume is full-batch
(BLAS association preserved) and bit-faithful: the resumed trajectory IS
the original. Probes (pure reads) resume the same way — seconds per
iteration. Turn labels run 2..(turns+1); ckptdiff's printed --turns
already covers the far edge. DIAGNOSIS rides checkpoints; FIX
VERIFICATION never does (pre-checkpoint effects can false-green — the
full gate/battery stays the bar).

## Step 1 — the Phase-1 statelog (RESUMED over the bracket; full-run
--log ONLY when no checkpoints exist)

```
PYTHONUTF8=1 python gpu/rollout.py --shards 4 --log <rng>   # add --resume-t/--turns from ckptdiff
CIV6_LOG=<rng> npm run gpu:replay
python gpu/tools/logdiff.py          # prints the FIRST divergent line
```
- Run at the SAME shard/batch shape as the failing gate — BLAS float
  association is batch-shape-dependent; B=1 probes follow different
  trajectories.
- Statelog line N = state after the step labeled N−1 in the trace; the
  in-step probe label (self.turn / state.turn) is one MORE off. Align by
  values when in doubt, not labels.
- Current fields: PT (totals, gp, esc), PU/BU/RU (positions, hp, acted),
  TI/TD (tiles), CA (camp locations), PC (pop/progress/boxes/loy/
  yields), RT (rival totals, fai, terr + tsum shape-checksum), RC (queue
  kind/cost/progress, loy, cb, til, hp, yields), CB (EVERY damage roll:
  k = the TS call-site tag [mel/melc, rng, rngrc, rngcs, rcty/rctyc,
  csty/cstyc, pcty/pctyc], t = target tile, c = the rng counter BEFORE
  the draw — absolute stream position, aligns draws even when sequences
  slip — plus diff, rand·1e6, dmg; from the damageRoll/_damage_roll
  chokepoints; catches reordered/extra rolls invisible to the rng
  column).
- **If the log lacks the field you need, ADD IT PERMANENTLY** (both
  sides, same order, milli-ints for floats). Every field in the list
  above was added mid-hunt and immediately paid for itself. Aggregates
  hide splits — tsum exists because terr counts matched while shapes
  diverged.

## Step 2 — targeted temp probes (when the log localizes but can't explain)

- Gate GPU prints on a rollout-set batch attr (`sim._log_combat_b`
  pattern); gate TS prints on a `globalThis` flag set per-game in
  replay-gpu.ts (guard by game RNG — three games share each seed).
- Print the DECISION INPUTS (masks, keys, tie-breaks, strengths), not
  just outcomes. One probe generation should name the branch.
- Strip every temp probe before committing (`grep -rn 'TEMP\|_dbg' src
  scripts gpu`). If a probe class recurs twice, promote it into the
  statelog instead.

## Known divergence classes (check these FIRST — all were paid for)

1. **city_seq / array-vs-column order**: TS iterates and tie-breaks by
   array/id order (acquisition order); GPU columns stop matching it once
   a hole-reuse founding lands a new city in a low column. Any
   order-coupled mirror or id-ascending tie-break must compare
   `city_seq`. Three shipped instances: loyalty pop-mix, luxury-grant
   ties, trace cityIds.
2. **Slot hygiene**: a dead pooled entity's queue/registries leak into
   civ-wide readers (has_q phantom builder; reused-slot progress). Clear
   on kill AND alive-mask readers.
3. **Post-walk freshness**: TS trace/score-time stats recompute LIVE
   (fresh luxury ranking with post-walk pops); GPU caches must be
   invalidated after the city walk.
4. **Draw-count vs draw-value**: same count + different values is
   invisible to the rng column — that's what CB lines catch. Unconditional
   rolls with gated OUTCOMES keep draw parity (the peace-roll pattern).
5. Association/dtype: non-dyadic quanta (0.05 gold, 0.7 science, ×0.95
   amenity) round differently across sum orders; milli-round at shared
   thresholds (`goldAffordable`/`_afford`), replicate TS association in
   scores.
6. Acted/heal gating: any executed action must block the D-2 heal on
   BOTH sides (TS movesLeft spend = GPU acted flag); rejected orders
   must NOT set flags.
7. Stale trace/tolerance harness: when both engines agree and the trace
   disagrees, fix the harness (4 instances: static queue pricing, etc.).

## Verify

Cost model first: the standalone gate (`PYTHONUTF8=1 python
gpu/rollout.py --shards 4 --pipeline-replay`) is ~190s; the full battery
walls at ~230s BECAUSE the gpu-gate lane is its critical path — the
gate is only ~15-20% cheaper than the whole battery. Policy:

- **Iterations you EXPECT to fail**: run the standalone gate. It saves
  ~40s each and avoids the battery's skip-cascade (a known-broken
  vitest pin mid-stage fails the cheap lane and SKIPS the gate — a
  wasted run). Re-export first if TS/data changed (stale-fixture trap;
  the standalone gate does NOT export).
- **The check you believe is FINAL**: go straight to the battery — its
  gpu-gate lane IS the full gate. Never chain a green standalone gate
  then the battery on the same code state: that near-doubles the cost
  for zero information.

Then say in the commit what the divergence WAS (turn, seed, rule) — the
stage log is the program's memory. Expect the NEXT stage's reshuffle to
expose a new latent: hunts are part of every stage's budget.
