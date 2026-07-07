---
name: parity-hunt
description: Diagnose a TS/GPU parity-gate failure down to the exact divergent decision. Use whenever parity_test or the rollout/replay gate reports a mismatch.
---

# Parity hunt — from mismatch to the exact divergent decision

A gate failure is a real semantic difference. The hunt ends when you can
name the single decision (turn, actor, rule) where the engines disagree —
then fix the engine that is WRONG relative to TS-as-spec.

## Read the failure first

- `parity_test` prints (column, TS, GPU) at the first bad turn per seed.
  Column names live in `gpu/parity_test.py` (head + per-CS + per-rival +
  per-city blocks). `rng` diverging FIRST = a draw-count difference — an
  action happened in one engine only (fights are 2 draws; lone-civilian
  kills are roll-free; war/peace rolls are conditional).
- The replay gate (`REPLAY_DEBUG=1 npm run gpu:replay`) prints ALL
  differing columns; "no player unit at tile X (civ f)" means positions
  drifted earlier — f is the CIVILIAN FLAG, not a civ id.
- Sums can match while distributions diverge (popSum hid a per-city split
  once). Aggregate columns are not proof of alignment.

## Paired probes (the core tool)

- **TS side**: a guarded print inside the phase under suspicion, run
  through the REAL harness — `RIVAL_DEBUG=<seed> npx vite-node
  scripts/export-gpu.ts 24 100 5` for scripted worlds, or a
  `(globalThis).__rdbg` flag set per-game in `scripts/replay-gpu.ts` for
  off-script games (guard by game RNG, not seed — three games share each
  seed and interleave).
- **GPU side**: a B=1 sim stepped scripted, or replay-fed with the logged
  actions from `gpu/fixtures/rollout.json` (resolve units by tile +
  charges-flag; do NOT reseed — the rollout never reseeds the world rng).
- **Alignment discipline** (three false positives came from this):
  compare END-OF-TURN states only. TS phase-internal prints show
  pre-growth / mid-phase values and `state.turn` increments early; when
  in doubt print at the end of `endTurn` and after `sim.step()`.
- Strip every probe before committing (`grep -rn RIVAL_DEBUG src scripts`).

## Escalation ladder

1. Bit-level accumulator diff per turn (print `.toPrecision(20)` vs
   python `repr`) → find the FIRST differing turn, then decompose that
   turn's sum term by term. Association and dtype are the usual culprits.
2. Position diff: dump all unit tiles per turn on both sides
   (end-of-turn), find the first split, then dump that turn's decision
   inputs (blocking planes, target keys, tie-breaks) at each candidate.
3. B=1 vs B=24: if a seed diverges only in the batch, hunt a
   batch-collapsed reduction (a `.sum()` missing `dim=1` did this).
4. When the engines agree and the TRACE disagrees, the trace/tolerance
   harness itself is stale (a queue-kind it can't price, a widened block)
   — fix the harness, note it as a false positive.

## Verify the fix

Full battery, and say in the commit what the divergence WAS (turn, seed,
rule) — the stage log is the program's memory.
