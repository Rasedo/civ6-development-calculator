---
name: parity-hunt
description: Diagnose a TS/GPU parity-gate failure down to the exact divergent decision. Use whenever parity_test or the rollout/replay gate reports a mismatch.
---

# Parity hunt — from mismatch to the exact divergent decision

A gate failure is a real semantic difference. The hunt ends when you can
name the single decision (turn, actor, rule) where the engines disagree —
then fix the engine that is WRONG. TS is the spec — unless TS itself is
farther from real Civ 6 than the GPU (owner rule): then fix TS.

## Step 1 — the Phase-1 statelog (ALWAYS first)

```
PYTHONUTF8=1 python gpu/rollout.py --shards 4 --log <rng>
CIV6_LOG=<rng> npm run gpu:replay
python gpu/logdiff.py          # prints the FIRST divergent line
```
- Run at the SAME shard/batch shape as the failing gate — BLAS float
  association is batch-shape-dependent; B=1 probes follow different
  trajectories.
- Statelog line N = state after the step labeled N−1 in the trace; the
  in-step probe label (self.turn / state.turn) is one MORE off. Align by
  values when in doubt, not labels.
- Current fields: PT (totals, gp, esc), PU/BU/RU (positions, hp, acted),
  TI/TD (tiles), PC (pop/progress/boxes/loy/yields), RT (rival totals,
  fai, terr + tsum shape-checksum), RC (queue kind/cost/progress, cb,
  til, hp, yields), CB (EVERY damage roll: diff, rand·1e6, dmg — from
  the damageRoll/_damage_roll chokepoints; catches reordered/extra rolls
  invisible to the rng column).
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

**Re-run ONLY the failing gate after each fix** (`PYTHONUTF8=1 python
gpu/rollout.py --shards 4 --pipeline-replay`, ~3 min) and iterate there —
a hunt usually takes several fix→gate cycles and the battery would double
each one. The FULL battery runs ONCE at the end, before the commit: it
re-exports fixtures (mandatory if TS/data changed — the stale-fixture
trap) and covers the scripted gate + vitest + self-tests the off-script
gate doesn't. Then say in the commit what the divergence WAS (turn,
seed, rule) — the stage log is the program's memory. Expect the NEXT
stage's reshuffle to expose a new latent: hunts are part of every
stage's budget.
