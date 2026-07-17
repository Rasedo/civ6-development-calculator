# #56 scripted-250t — survival heuristics + horizon flip (design note)

Owner-decided 2026-07-17 (heuristics, NOT a net-driven export — see task
#56). Goal: all 24 scripted seeds alive and non-degenerate at t250, so
the late-game content Round B2 landed (space race, late GP rungs, war
weariness, Atomic+ techs) becomes organically gate-covered.

## Slice A — survival heuristics (behavior change at 100t, gateable alone)

**H1 army scaling.** New branch in BOTH scripted chains, per city,
AFTER the warrior/district branches and BEFORE cheapest-building:
- quota = 2 × alive player cities (evaluated fresh, both sides).
- count = alive player units with combat>0 + queued military across
  all city queues (kind='unit', combat>0; GPU: current codes whose
  `_p_combat` > 0).
- pick = highest-combat trainable unit (tech-gated), strict > so ties
  keep UNITS table order (GPU scans unit index order — argmax-first
  matches).
- SEQUENTIAL COUPLING: TS's single per-city else-if loop means city i's
  count sees queues pushed by cities 0..i-1 THIS turn (warrior branch
  included). GPU mirror: snapshot mil_q BEFORE the warrior branch, then
  in city_seq walk order allow the j-th army candidate iff
  base_k + j < quota, where base_k = mil_alive + mil_q_snapshot +
  exclusive-cumsum(want_w) at that rank. Non-decreasing ⇒ the allowed
  set is a prefix ⇒ pure cumsum vectorization, no loop.
- cost: `_p_cost[pick]` at queue time (TS queue items carry no cost for
  non-builders — completion reads the def, as with warriors today).

**H2 builder replacement + repair.**
- The once-ever `builderTrained`/`builder_trained` flag is REPLACED by
  a dynamic gate: capital queues a BUILDER (escalated builderCost, as
  today) when pop ≥ 2 AND no player builder is alive or queued AND a
  builder job exists. Job := player-owned tile that is (unimproved AND
  FARM-valid under player unlocks) OR pillaged. First-builder timing is
  unchanged (no builder alive + jobs exist at pop 2 ⇒ same turn).
  The flags stay in _MUTABLE/state for snapshot compat but become
  write-only legacy (removed from the decision).
- Scripted builder walker (both engines): standing on an owned PILLAGED
  tile → repair first (clear flag, spend the turn, no charge — the
  rival A-13 semantics), else the existing FARM branch; the walk
  target set adds pillaged owned tiles.

**H3 war-time priority flip — NOT in this stage.** Only if A+B leave
seeds dying; record the decision either way.

RNG: zero new draws (production queuing is deterministic). Trajectory
reshuffle is total — fixtures regen, expect SEED_OVERRIDES churn and
a hunt.

## Slice B — horizon flip

- `N_TURNS` default 100 → 250 (scripts/export-gpu.ts argv[3] default).
- The no-cities throw at export is the alive assert; goal is ZERO new
  overrides — tune H1 quota (2→3×) before adding one; existing
  overrides (9028, 9054) re-checked at 250t.
- parity_test reads trace length — no change. Battery: parity lane
  ~63→~160s, still under the mcts-search/gpu-gate lanes — no re-tune.
- t250 hits TURN_LIMIT (score victory fires on the last recorded turn)
  — both engines already model it; watch the final-turn semantics in
  the hunt.
- Poke/coverage follow-ups unlocked (SEPARATE stages): GPU space-race
  sim (B-25), real war-weariness magnitudes (B-15), CS envoy re-keying
  (B-21), G-2 coverage.

## Status log
- 2026-07-17: note written; slice A implementation begins.
- 2026-07-17: slice A GREEN at 100t after one hunt catch — the H2 gate
  inputs must be snapshotted PRE-WALKER (TS production loop runs before
  the builder walker; the GPU walker runs first; seeds 9092/9274).
- 2026-07-17: slice B in flight. 250t export: all 24 seeds alive;
  override 4:9054 KEPT (9053's death is loyalty-structural, not
  army-fixable — Egypt war t21, Brightwater defects t54). 250t scripted
  gate: seed 9287 t142 city-col4 divergence UNDER HUNT. Findings so
  far: NOT amenities (both engines balance −1: loc/reg/lux all 0, pops
  align once probe labels are value-matched); t141→t142 food accrual
  is TS +8.5 vs GPU +5.95 = a ×0.7 growth factor on the GPU side only.
  NEXT: print TS computeHousing(city id4) vs GPU _city_totals
  housing/growth_f (col4) t140-144 — suspect housing threshold (H2's
  replacement builder was planting 0.5-housing farms right then) or
  the growth-factor mapping at the boundary.
  TEMP PROBES LIVE (strip before commit): gpu/_probe9287.py; the AMEN
  block + luxuryAmenities/localBuildingAmenities/regionalEffects
  imports in scripts/export-gpu.ts.
- 2026-07-17 (cont.): seed-9287 hunt CLOSED — the growth-factor lead
  was a red herring layer; the chain was worked-tile shift ← farm on
  246-vs-290 ← builder walk desync at t128 ← the GPU walker saw tile
  296 as a job for ONE turn because `_scripted_builder` ran BEFORE the
  production section while the EXPORTER runs envoys → production →
  walker, and t128's production loop PAVED 296 (district/wonder pave;
  validImprovements returns [] on paves — the walker's static farm
  plane can't see same-turn paves). A PRE-EXISTING latent of the
  walker's phase position, exposed by the 250t horizon. FIX
  (structural): moved the scripted walker call AFTER the production
  section (TS order exactly); the slice-A pre-walker snapshot became
  unnecessary and was replaced by live reads (production now precedes
  the walker, so live = TS's view). Slice-A seeds re-proven by the
  gates. 250t scripted gate GREEN (24×250, 0.0 milli); forced gate
  GREEN; probes stripped. Poke-test note: the heuristics' only surface
  IS the scripted path — the 24×250 scripted gate exercises every
  branch organically (H1 fills/replacements, H2 re-queues/repairs
  across all seeds), so no separate poke lane was added.
