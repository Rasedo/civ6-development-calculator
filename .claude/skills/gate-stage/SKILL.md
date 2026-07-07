---
name: gate-stage
description: Land an engine change as a gate-serialized stage — design, inert plumbing first, slices, battery, baselines, commit. Use for ANY change touching src/core or gpu/civ6gpu/engine.py.
---

# Gate-serialized engine stage

The only way engine changes land in this repo. TypeScript (`src/core`) is
the spec; the GPU engine mirrors it turn-exactly. Never widen tolerances.

## Procedure

1. **Scope on paper first.** For multi-slice rounds, write/extend a design
   note (BUILD_PLAN entry or a design doc — see `gpu/ARCHIVE.md` for the
   pattern). Name the slices; each slice must be independently gateable.
2. **Inert plumbing before behavior.** New state (tensors, planes, masks)
   lands in a slice that provably changes nothing: fixtures hash
   byte-identical (`cd gpu/fixtures && md5sum seed*.json | md5sum`), both
   gates green. Register new mutable tensors in `_MUTABLE` (snapshot/
   restore coverage — the mcts self-test verifies it).
3. **Edit via patch FILES, never shell heredocs.** Write a python patch
   script with the Write tool (Git Bash mangles heredoc quoting silently),
   `python patch.py`, then **`git diff --stat` BEFORE any battery** — a
   failed patch plus a green battery verifies nothing. Anchors must be
   verified with `grep -n` against the live file; prefer per-rep prints
   and immediate writes over assert-all-then-write-at-end.
4. **Both engines in lockstep.** RNG draws are mirrored draw-for-draw:
   never add/remove/reorder a draw on one side only; conditional draws
   gate on identical conditions. Float accumulation must match the TS
   ASSOCIATION exactly (`a += b + c` is `a + (b + c)`; one ulp flips
   completions when a cost lands inside it — it happened).
5. **Validate**: `export PYTHONUTF8=1 && python gpu/battery.py --no-eval`
   (~3 min; `--full` only when search code changed). Behavior-changing
   stages then re-baseline: `python gpu/eval.py --policy random|scripted
   --episodes 50`, recorded in `gpu/TRAINING.md` (all prior nets go
   stale — say so).
6. **Commit per stage, push**, with a message that names what the gates
   caught. Update the BUILD_PLAN status log. Poke self-tests for paths the
   random rollout can't reach organically (the purchase_test /
   occupancy_test / controlled_test pattern) and wire them into
   `gpu/battery.py`.

## Traps this repo has already paid for

- `cd` persists across shell calls — never `cd` into gpu/fixtures and
  then run repo-root commands in the same or later chain.
- The exported catalog/planes are the SPEC scope: check whether a plane
  already exists (`farm_flat`, `mine_ok`, `wh`, `riv`…) before adding one.
- Two id spaces: tiles use `civOfRival(r) = r+1`; rival UNITS carry the
  raw rival id.
- Unit positions/hp are untraced — a stage touching movement/stacking
  needs a position-diff probe (see the parity-hunt skill) even when the
  gates are green.
- CPU parity cannot see CUDA device-placement bugs; run the eval lane
  (full battery) before any training-facing commit.
