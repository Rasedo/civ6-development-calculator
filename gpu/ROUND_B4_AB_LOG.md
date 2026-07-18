# ROUND B4 — Slice AB log (B-30 conquest keeps infrastructure)

Round base: 18dff6d570830da4d8b6136a8a8e9a2df6076e3e

## Task
Capture/transfer keeps districts+buildings+wonders minus PALACE; ANCIENT_WALLS
kept at outerHp=0; razes unchanged. Four TS paths + GPU twins.

## Coordinator directive (mid-task)
- Do NOT run gpu/battery.py in the worktree. Ladder ends at rollout --pipeline-replay.
  The full battery runs once at merge (main session). Noted; battery not run.

## Progress log
- Anchor commit: worktree setup, fixtures copied, log created.
- Implemented all 4 TS paths + 3 GPU twins + vitest (2 new). tsc clean,
  vitest 261 pass, exporter clean.
- Scripted parity gate: seed 9118 diverges at t102 (bldgs3: GPU 3, TS 2 — one
  extra GPU building in founded city index 3). Turns 1-101 IDENTICAL (incl. the
  t81 infra-carrying capture of city 4 with a live district, and the t101 empty
  capture). Divergence is a cascade exposing an untraced production/progress
  boundary. DIAGNOSING.
