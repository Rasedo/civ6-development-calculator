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
- A resume-check can VERIFY only fixes that leave the logged game's
  action stream unchanged (pure-read / state-init bugs). A
  BEHAVIOR-CHANGING fix (different pick, different walk) makes the
  recorded actions stale — the resumed pair explodes into PHANTOM
  mass-divergences that look like new bugs. For behavior-changing
  fixes: full fresh gate (or battery) only, never a resume-check.

Phase-1 statelog: `rollout.py --shards 4 --log <rng>` +
`CIV6_LOG=<rng> npm run gpu:replay` + `python gpu/logdiff.py` → first
divergent line. Fields: PC loy; RC cb/til/hp; RU hp+a (acted); RT fai
+ tsum (territory checksum); TI carries rp (live resource priority);
CB lines = every damage roll from the damageRoll/_damage_roll
chokepoints. Probe at the exact batch shape of the failing run.
PYTHONUTF8=1 on piped Windows runs. Never edit engine/TS sources while
a gate/battery pipeline is in flight.

**Lesson — positions are invisible to the scripted trace (only COUNTS
are compared).** The scripted parity trace records aggregate/count state
(empire techs/civics/settlers/city-count/treasury/science/culture/score;
per-city population, owned-tile count, buildings, tiles-acquired, food/
culture box) — NOT unit POSITIONS or improvement POSITIONS. So a
walker/movement phase-ORDER bug (e.g. `_scripted_builder` running before
vs after the production section in `step()`, so it sees a same-turn
paved/pillaged tile the other engine doesn't) produces NO divergent
trace row until the wrong position finally moves a COUNT — a farm landing
on a different tile shifts the citizen's worked tile, which shifts food
accrual, which crosses a growth boundary. Such bugs stay dormant for
dozens of turns. The #56 case: seed 9287's GPU walker saw tile 296 as a
job for ONE turn at t128 (production had just PAVED it; the walker's
static farm plane can't see same-turn paves), planted a farm on the
wrong tile, and the first VISIBLE divergence was a city-col4 growth/
worked-tile mismatch at t142 — a 14-turn dormancy. Countermeasure: the
statelog passes (above) surface positional state (RC til, TI rp, unit
tiles) directly, so a position desync shows the turn it happens, not the
turn it finally moves a count.
