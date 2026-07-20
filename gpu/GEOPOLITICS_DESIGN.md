# GEOPOLITICS design — A-19/B-33 rival-rival wars + B-22 casus belli slice (task #55)

2026-07-20. Brief-first (the task's standing requirement). SERIAL
main-session stages — this restructures the rival-core war state,
the class of work the #41 rule keeps out of parallel worktrees —
plus ONE Opus coverage agent at the end (the B6/B9 pattern). ONE
battery at round END.

## Current state (verified against live code)

`RivalCiv.atWar` is a single war-with-the-player boolean;
`unitsHostile` (units.ts) hard-returns false for rival-vs-rival;
`declareWar`/`sueForPeace` (rivals.ts) + the auto-DoW in `rivalPhase`
are player-relative; GPU `r_atwar` is [B,R] vs seat 0. 23 TS `.atWar`
readers, 48 GPU `r_atwar` sites — ALL keep their current meaning
(war-with-the-player) untouched; the pair matrix is NEW state beside
them, not a rewrite.

## S1 — per-pair war substrate, INERT

- TS: `RivalCiv.atWarRivals: number[]` (rival ids currently at war
  with this rival; symmetric by construction — helper
  `setRivalWar(state, a, b, on)` writes both sides). Helper
  `civsAtWar(state, a, b)` with unified ids (0 = player, r+1 =
  rival): the (0, r+1) pair reads the EXISTING `atWar` boolean.
- GPU: `rr_war` [B, R, R] bool, `_MUTABLE`-registered, symmetric,
  diagonal false; snapshot/reclaim untouched (civ-level, no slot
  compaction exposure).
- NOTHING reads the new state yet. Bar: fixtures byte-identical
  (md5 over seed*.json), full ladder green with zero behavior
  change. No trace change in S1 (trace shape changes fixtures — it
  lands with S2 where the gates arbitrate it).

## S2 — rival-rival hostility LIVE (+ per-pair peace)

- `unitsHostile` goes symmetric off `civsAtWar` (barbarian arms
  unchanged). The rival war-act target scans (`hostileUnitAct` for
  the shared verb machinery, `attackTargets`, the rival war-march
  target pick, GPU `_rival_unit_war_act` + the war-target planes)
  include at-war RIVALS' units and cities; city capture uses the
  EXISTING `transferRivalCityToRival`/`_transfer_rc_to_rc` (B-30
  infra-carry + POOL-END + _eff_version discipline already in
  place). Tie-break: when both the player and a rival are valid
  targets, the existing player-target logic wins ties (lowest
  unified civ id — document at the pick).
- **DoW policy (ZERO-DRAW)**: mirror the existing player-relative
  auto-DoW conditions PAIRWISE — evaluate the same
  military/score/proximity thresholds rival-vs-rival; deterministic
  scan order (lower rival id declares first, one new war per civ
  per turn max). Whatever the current auto-DoW draws (verify —
  if it rolls RNG, the pairwise mirror must add draws at IDENTICAL
  sites both engines; prefer re-deriving it zero-draw if the
  existing conditions are already deterministic).
- **Per-pair peace**: generalize the peace path — a warring pair
  sues out when EITHER side's warWeariness exceeds a threshold or
  one side has lost ≥2 cities of the pair's war (deterministic,
  zero-draw; both engines at the same phase position). The
  (0, r+1) pair keeps the existing player-war peace semantics
  untouched THIS stage.
- Trace: the rival block's `atWar` column stays; add ONE new
  per-rival column `rrWarMask` (bitmask over rival ids) — BOTH
  trace harnesses in the same stage (the D-10 lesson).
- B-33 resolves here; A-19 resolves S1+S2.

## S3 — B-22 casus belli slice (+ B-15 magnitude, evidence-gated)

- Per-pair `warKind`: SURPRISE (default) vs FORMAL. A FORMAL war
  requires a prior DENOUNCEMENT ≥5 turns earlier (`denouncedTurn`
  per pair; deterministic: a civ denounces the pair partner whose
  score-rivalry condition fires — the same threshold family as the
  DoW policy, zero-draw). War-weariness accrual: SURPRISE ×2,
  FORMAL ×1 (the modeled casus-belli benefit; real Civ 6 reduces
  grievances/ww for justified wars).
- B-15 magnitude rides ONLY IF peace actually fires in-gate
  (measure S2's gate evidence): raise ww to −1 per 4 war-turns cap
  −4. If in-gate wars never end, keep the gentle magnitude and
  record the residual explicitly (fixture-collapse risk was the
  original reason for gentleness).
- Alliances / World Congress / warmonger diplomacy STAY OPEN
  (recorded residuals on B-22).

## S4 — coverage agent + close

One Opus agent: poke file `gpu/geopolitics_test.py` (pair-matrix
symmetry, rival-rival DoW/peace flips, a scripted rival-rival
capture via `_transfer_rc_to_rc`, casus-belli ww multiplier, the
S2 tie-break) + battery lane `geopolitics` + TS vitest pokes;
existing-lane recheck BEFORE the battery; then the ONE battery,
AUDIT close-out (A-19 RESOLVED, B-33 RESOLVED, B-22 → ~50%, B-15 →
per S3 evidence), HANDOFF/memory.

## Standing rules

Identical to gpu/ROUND_B7.md's section (gates ladder per stage,
draw-count discipline, _MUTABLE/dtype/reclaim/POOL-END,
_eff_version on yield-bearing writes, AUDIT by SYMBOL,
statelog-first hunts, budget a hunt per behavior stage — S2
reshuffles EVERY war trajectory and WILL surface old latents).
