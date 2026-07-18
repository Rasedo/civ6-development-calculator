# ROUND P — rival-phase perf round 1: P1 (caching) + P4 (HOLD pre-filter)

Owner-approved aggressive perf round (2026-07-18). Two parallel worktree
agents off base sha **ef9f9f1** (`ROUND_P` commit's parent chain — verify with
`git rev-parse HEAD` and `git reset --hard <base>` if your worktree is stale).
Source of truth for the why/expected-win: `gpu/PERF_EXPLORATION.md` (P1, P4).
Scopes are DISJOINT — do not touch the other agent's symbols.

## Ground rules (both agents)

- GPU-only round: edit `gpu/civ6gpu/engine.py` ONLY. No TS changes, no
  export, no `src/core` edits, no AUDIT edits (main session updates docs at
  merge). Do not touch RNG draw sites — both tasks are draw-count-neutral by
  design; keep them that way.
- **Fixtures are gitignored** — copy them into your worktree first:
  `gpu/fixtures/`, `gpu/fixtures_o4/` from the main checkout
  `C:\civ6-development-calculator\gpu\`.
- Verification bar = **gate-equivalence**: results byte-identical to base.
  Run, in order: scripted `PYTHONUTF8=1 python gpu/parity_test.py` (24×250,
  0.0 milli), forced-compaction prefix `CIV6_RECLAIM_AT=12
  CIV6_RC_RECLAIM_AT=3` + same, off-script `python gpu/rollout.py --shards 4
  --pipeline-replay` (REPLAY PARITY OK), then the FULL battery
  `python gpu/battery.py --no-eval` (green). The battery is the bar; never
  substitute a green gate for it.
- The box is CONTENDED (two agents + main session). Note lane timings for
  reference but do NOT tune or claim wins off them — the main session
  re-measures on a quiet box at merge. Your bar is green + equivalence, not
  a measured speedup.
- Commit in your worktree with a clear message when green. Report: what you
  cached/filtered, the equivalence argument, gate+battery results, any edge
  you had to exclude. Do NOT end your turn idle-waiting on a background
  pipeline — run gates in the foreground and stay active until done.

## Agent P1 — hoist per-r sub-computations out of `_rival_city_yields`'s per-j path

Symbols: `_rival_route_income`, `_belief_feat_plane`, `_gov_policy_mods`,
`_bel_add`/`_bel_add_pf` (the `perF`/`perC`/`featY`/`fpw` reads) — all
rebuilt once per city `j` inside `_rival_phase`'s economy loop though their
values are identical within an `_eff_version` epoch (~15/16 calls redundant).

Fix shape: one `_eff_version`-keyed memo per function, exactly the existing
`_rcy_globals` / `_food_cache` / `_bld_cache` pattern (D-5/D-11 `gw_cache`).
The only mid-loop invalidators (rival district/wonder completion) already
bump `_eff_version` — verify that claim at the district-done and wonder-done
branches before relying on it.

**The ONE edge to prove**: `_rival_route_income` also reads `rc_alive`
(dest resolution among living cities). If `_rival_try_found` can fire inside
the economy loop WITHOUT bumping `_eff_version`, the route cache is unsound —
then either key it on `(_eff_version, founding counter)` or exclude route
from the cache and still land belief/gov/bel_add (which don't read
`rc_alive`). State which branch you took and why in your report.

Also mind: `_rival_route_income` mid-loop district completion raises later
dests' bonuses — the A-11 commit deliberately did NOT cache it across the
city loop. Your cache is legal ONLY because completion bumps `_eff_version`
(that is the whole soundness argument — make it explicit in a comment at the
cache site, matching the `_rcy_globals` comment style).

Expected: ~9–11% of parity `step()`, ~6–8% of rollout. If the memo shows no
win, still land it if green (main session re-measures).

## Agent P4 — pre-filter `_apply_unit_actions`'s slot loop

Symbol: `_apply_unit_actions`'s `for p in p_live` (the D-14 live-slot set).
12.3% tottime in rollout; hits the wall-bottleneck gpu-gate lane.

Fix shape: before the loop, vectorize once over the whole `[B, P]` action
tensor and tighten `p_live` to slots with a non-HOLD, valid (`>= 0`) order
in at least one game this turn:
`((actions[:, p] != HOLD) & (actions[:, p] >= 0)).any()` computed batched,
not per-p.

**Prove the no-op**: a slot that is HOLD/invalid in ALL games must have a
loop body that mutates nothing — the D-14 comment argues every mutation
sits under a mask ⊆ alive∧ordered; verify that argument line by line for the
current body (it has grown since D-14: A-18 verbs, B-29 combat, capture
paths). If ANY body statement mutates outside an ordered-mask (e.g. a
fortify decay, a heal, a flag clear), it is NOT a no-op — then either keep
those statements outside the filtered loop or include their trigger in the
pre-filter predicate. State the proof in your report.

Draw-count: a HOLD unit never rolls, so no skipped slot would have drawn
RNG — re-verify no RNG call sits above the order masks in the body.

Expected: rollout/gpu-gate ~3–6%; parity ~0 (scripted rarely orders units).
