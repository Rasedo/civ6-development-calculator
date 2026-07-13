# Hunt tooling reference

Moved out of gpu/AUDIT.md (chapter F) 2026-07-13 — this is IMPLEMENTED
machinery, not an open gap. /parity-hunt is the procedure that uses it.

**RAW CHECKPOINTS — one mechanism for diagnosis AND verification.**
Shipped: rollout `--ckpt` (default 25; parent clears the transient dir
per run) dumps snapshot()+rngs+paths per shard; the replay dumps
wrapped serialize(state) per game via CIV6_CKPT; `gpu/ckptdiff.py
--rng` is the JIT bracket finder; `--resume-t`/CIV6_RESUME_T resume
both engines from any checkpoint (validated bit-faithful);
scripts/ckpt-lines.ts is the TS JIT reader. CB lines carry k
(call-site tag), t (target tile), c (pre-draw rng counter).
Forced-compaction knobs: CIV6_RECLAIM_AT (u/v/p unit pools) +
CIV6_RC_RECLAIM_AT (rc city slots) — run the off-script gate under
them to stress slot-layout invariants (four real catches to date).
- RAW state has no frozen-vs-fresh ambiguity; a JIT diff tool loads
  both engines' checkpoints at turn t and runs the existing
  tsStateLines/gpu_state_lines on the loaded states — new diagnostics
  = new readers over old dumps, not engine changes + reruns.
- Determinism + the saved action log make every turn reachable:
  binary-search checkpoints for the first divergent one, replay
  forward ≤K turns single-game computing full lines JIT.
- The same checkpoints ARE the resume points for fix-verification
  (full-batch only — BLAS association is batch-shape-dependent; resume
  checks can false-green fixes with pre-checkpoint effects — the
  pre-commit bar stays the FULL BATTERY, whose gpu-gate lane IS the
  gate; never chain a standalone gate then the battery on the same
  code).
- What checkpoint INSPECTION cannot give: intra-turn EVENTS (the CB
  combat-roll log stays) and MID-TURN TRANSIENTS — both recovered via
  INSTRUMENTED REPLAY: resume from the nearest checkpoint with an
  event flag or a pure-read probe; probes are bit-faithful (pure reads
  replay the exact original trajectory — no false-green caveat,
  unlike fixes).
- GPU resume needs `--shard K --shards 4` to match batch layout, and
  a resume run OVERWRITES rollout.json — for TS-side instrumentation
  of one off-script game, extract a one-game rollout file
  (`{...roll, games: [g]}`) and full-replay it (seconds, no resume).

Phase-1 statelog: `rollout.py --shards 4 --log <rng>` +
`CIV6_LOG=<rng> npm run gpu:replay` + `python gpu/logdiff.py` → first
divergent line. Fields: PC loy; RC cb/til/hp; RU hp+a (acted); RT fai
+ tsum (territory checksum); TI carries rp (live resource priority);
CB lines = every damage roll from the damageRoll/_damage_roll
chokepoints. Probe at the exact batch shape of the failing run.
PYTHONUTF8=1 on piped Windows runs. Never edit engine/TS sources while
a gate/battery pipeline is in flight.
