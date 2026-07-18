# Aggressive Rival-Phase Optimization — Both Engines

(Owner-approved ultraplan, 2026-07-18. This document is the round's source of
truth; gpu/PERF_EXPLORATION.md holds the measurements it builds on. Line
numbers below are from the planning pass — anchor by SYMBOL when editing.)

## Context

The rival phase is the single hottest code path in the project. Profiling
(gpu/PERF_EXPLORATION.md, dated today) shows `_rival_phase` at **68.9% of
`step()`** on the parity path and 53.4% on rollout, and all three heavy
battery lanes (gpu-gate 287.5s, parity 265.3s, mcts-search 244.9s) are
`step()`-bound — so every % cut here shrinks the whole test wall. The TS
mirror `rivalPhase` (src/core/rivals.ts:1353) has the same structure plus its
own waste (unmemoized `getRivalModifiers` rebuilt inside inner loops), and it
sits on the gpu-gate critical path via the pipelined TS replay.

**Hard constraint:** every optimization must be a **bit-identical refactor**
— same values, same RNG draw count/order, same float association
(`a + (b + c)` preserved token-for-token). TS is the spec; parity tolerances
(int exact, float ±2 milli-units) are never widened. All work lands as
gate-serialized stages per `.claude/skills/gate-stage`, validated with
`PYTHONUTF8=1 python gpu/battery.py --no-eval`, one battery per stage, never
editing sources while a battery runs, parity-hunt budgeted into every stage.

**Two cache-invalidation edges verified in code that PERF_EXPLORATION.md
missed** (both confirmed by reading engine.py):
1. The walled-city strike inside the economy loop can kill a barb/player unit
   (engine.py:7714-7717) **without bumping `_eff_version`**;
   `_rival_route_income` reads `u_alive`/`p_alive` (5571/5574) for the raided
   mask → a pure `_eff_version` key would serve city j+1 a stale raided-mask.
   Needs a dedicated kill counter in the key.
2. Belief claims (engine.py:~7946/7969/7997) happen post-economy-loop with no
   eff bump, but the same-turn trace (`rival_empire_score` →
   `_belief_feat_plane`/`_bel_add`) re-reads that civ → needs a
   `_bel_version` counter.

Also verified: `_rival_try_found` DOES bump `_eff_version` (engine.py:6313),
closing P1's open question — route income IS epoch-cacheable. And TS
`getRivalModifiers` (effects.ts:391-410) reads `seat = {followers: Σ pop,
cities: count}` — the TS cache key must include both.

## Stages (each independently gateable; one commit + one battery each)

### Stage 0 — Measurement infrastructure (no engine sources touched)
- Commit `gpu/profile_step.py`: cProfile driver with (a) scripted/f64
  parity-path mirror (6 seeds, B=6, 250t) and (b) rollout core (9 games,
  B=9, OMP=4); top-40 cumtime + a `Tensor.any` call-count/tottime counter
  (guard-storm metric).
- Commit `scripts/perf-rivals.ts`: headless TS driver, ~3 fixture seeds ×
  250 turns, runnable under `node --cpu-prof`; prints turns/sec (baseline
  ~840 t/s).
- Run `mcts_test.py --part search` under cProfile once to confirm the
  engine:tree ratio (PERF doc follow-up (d)).
- Record baselines in PERF_EXPLORATION.md. Validation: fixtures md5
  unchanged, one battery green.

### Stage G1 — GPU P1 cache cluster (parallel-agent-safe) — ~9-11% of parity step(), 6-8% rollout
Files: `gpu/civ6gpu/engine.py` — `_rival_route_income` (5539),
`_belief_feat_plane` (5511), `_bel_add`/`_bel_add_pf` (~5447/5464),
`_gov_policy_mods` (1801), `restore()` (~1282).
- New counters: `_bel_version` (bumped at the three belief-claim sites + in
  `restore()`) and `_rp_kill_version` (bumped in the strike-kill branch after
  7717 — verified as the only unit-death site inside the economy loop).
- Caches, mirroring the existing `_rcy_globals`/`_food_cache`/`gw_cache`
  pattern:
  - `_rival_route_income`: key `(turn, r, _eff_version, _rp_kill_version)` →
    stored `[B,RC]` tensor. Kills the O(RC²) waste (~15/16 calls redundant).
  - `_belief_feat_plane`: key `(r, _eff_version, _bel_version)`.
  - `_bel_add`/`_bel_add_pf`: memo keyed `(fn, key, r, _bel_version)` —
    collapses 28.7k calls/run.
  - `_gov_policy_mods`: thin keyed wrapper `(seat_tag, _eff_version)` at call
    sites (don't hash the tensor). **Verify during implementation** that
    player civic completion bumps eff (the `_rcy_globals` docstring asserts
    it; confirm at the ~3765-3959 completion cluster).
- Clear all new caches in `restore()` (mcts snapshot self-test covers this).
  Draw-count-neutral.
- Proof obligation: per cache, enumerate every tensor read and show each
  write site bumps a key component or cannot run between same-key reads.
- Expected parity-hunt failure class if wrong: class 3 (post-walk freshness —
  trace columns drifting only on turns with a mid-loop claim/kill).

### Stage G2 — P4: pre-filter `_apply_unit_actions` slot loop (parallel-agent-safe) — ~3-6% rollout / gpu-gate wall
Not rival-phase, but the biggest rollout-only cost (12.3% tottime) on the
wall-bottleneck lane, and cheap: tighten `p_live` with one vectorized
`((actions[:, p] != HOLD) & (actions[:, p] >= 0)).any()` pass over `[B,P]`
before the loop. Proof: every mutation in the body is masked ⊆
alive∧ordered (the D-14 argument); a HOLD unit never draws. Watch for an
`acted`/heal flag write escaping the mask (class 6). Serialize with G1
(same file).

### Stage T1 — TS modifier cache + trace-path hoists (parallel-agent-safe) — est. 30-50% off TS rivalPhase; shrinks gpu-gate TS-replay wall
Files: `src/core/effects.ts`, `src/core/empirePlanner.ts`,
`src/core/rivals.ts`.
1. **Self-validating value-key cache** in `getRivalModifiers`
   (effects.ts:391): `WeakMap<RivalCiv, {key, mods}>` with key =
   `techs.length : civics.length : pantheon : religionFounded :
   founderBelief : enhancerBelief : Σpop : cities.length`. Sound because
   techs/civics are append-only (pushes at rivals.ts:1872/1901; nothing
   removes), and the key covers every input incl. the seat — so writes
   outside rivals.ts (combat captures, transfers) are captured with zero
   call-site changes. Kills the worst waste: 2 rebuilds per border-growth
   `while` iteration (rivals.ts:1781) + 3-4 per city per turn
   (1034/1131/1708).
2. Mutation audit: consumers never write into the returned `Modifiers`
   (`withFollowerBelief` clones, effects.ts:448-466; yields.ts grep-clean).
   During validation only, `Object.freeze` the cached object under a temp
   flag, run battery, strip the flag.
3. **Trace-path amenity hoist** (`empirePlanner.ts:~73-83`):
   `rivalEmpireScore` calls `rivalCityYields` per city with no tier →
   full-map `rivalAmenityTiers` luxury sweep per city per turn. Hoist one
   `rivalAmenityTiers(state, rival)` call before the loop, pass tiers in.
4. Micro-hoists (iteration order unchanged): share `rivalUnits(state,
   rival.id)` across the CS-meet loop (~1382) and the adjacent 1433/1440
   pair. Do NOT hoist across the buy block or war/peace loops
   (spawns/disbands occur there).
5. **Deferred** (measure first): O(cities²) loyalty/trade-route loops (n
   small, timing is live semantics), builder full-map scans, city-strike
   all-tiles targeting. Revisit only if Stage 0's TS profile says they
   matter.
- Validation: `npx vitest run` + battery (its gpu-gate lane replays the real
  TS engine — both gate and beneficiary).

### Stage G3 — Guard-storm batching + P3 building-pick vectorization (main-session, two slices) — ~5-8% of step()
P2 and P3 do NOT conflict when P3 is scoped to the pick loop (engine.py:7075)
and P2 to the economy loop (7441) — they are different `for j` loops. Do P3
first (draw-free).
- **Slice A — guard batching** (447k `bool(x.any())` calls, 2.66s):
  precompute `idle_all` `[B,RC]` before the pick loop, sync once via
  `.any(dim=0).tolist()`, per-j guard becomes a list read (exactness:
  iteration j writes only column j; later iterations read untouched
  columns). Same for the economy loop's `cact` guard. Hoist compound guards
  (`rem`/`remw` re-tests in the `for si`/`for wi` sub-loops) behind Python
  bools updated only on reassignment.
- **Slice B — vectorize the req-building pick block** (engine.py:7119-7153)
  over j: `[B,RC,NB]` eligibility + per-(B,RC) argmin, applied under the
  surviving `rem` mask in a sequential post-pass. This block reads only
  per-city state + civ techs (no cross-j writes feed it). Keep
  scaffold-district, wonder, settler branches **sequential** (global tile
  planes, one-per-world races, `spec_cnt`/`settler_q` counters — that's
  where the order bugs live). Hoist j-invariant `d_cost`/`t_pct`/`c_pct`
  (7090-7092). Keep the `* 1024 + arNB` tie-break key form verbatim.
- Failure classes to expect: 1 (across-j pick order), 2 (hole-slot state
  entering batched eligibility — alive-mask like the buy block at 7328).

### Stage G4 — P2′: narrowed rival-dim batching (main-session moonshot, go/no-go) — up to 15-20% of step(), or aborted on evidence
The PERF doc's "economy is independent across rivals" premise has three real
couplings: loyalty reads other rivals' pops live (7461-7473),
flips/transfers mutate other rivals' city sets (7744-7776), `tooClose` in
founding reads all centers live (~6221). So full R-batching is out; the
narrowed version batches only the provably-uncoupled interior — per-(r,j)
yield/window math (`_rival_city_yields` masks, gathers, topk;
`_rival_amenity`) as `[B,R,…]`, keeping r-major sequencing for loyalty,
growth commits, completions, border growth, strike.
- Load-bearing lemma to write down: rival r₁'s candidate masks test
  `rival_at == r₁`, which no r₀ same-turn write can produce.
- **Association constraint:** reductions whose shape changes reorder BLAS
  sums, and economy float progress feeds integer completions (needs
  bit-identity, not ±2). Either keep every reduction at its original `[B,M]`
  shape per r (batch only elementwise/gather stages — smaller, exact win) or
  budget a full ±2-drift re-verification + multi-day hunt.
- **Go/no-go:** after G1+G3, re-profile with Stage 0's driver. If
  `_rival_city_yields`'s residual cost < ~10% of step(), abort G4 and take
  Stage 5 instead. Decide on numbers.

### Stage 5 — Re-measure + P5 lane rebalance
Re-run Stage 0 drivers on a quiet box; update PERF_EXPLORATION.md with
per-stage before/after. Then, only if the lane tie is broken, add
`--shards` to parity_test (mirrors rollout's shard+merge; re-verify ±2
drift since per-process B changes association). No blind OMP×shard changes
(4×4 pinned for the old mix).

## Sequencing & ownership

| # | Stage | Risk | Expected win |
|---|-------|------|--------------|
| 0 | Measurement drivers | none | attribution |
| 1 | G1: GPU P1 caches + 2 edge fixes | low | 9-11% parity / 6-8% rollout step() |
| 2 | G2: P4 slot pre-filter | low | 3-6% rollout (wall lane) |
| 3 | T1: TS mods cache + hoists | low | 30-50% of TS rivalPhase |
| 4 | G3: guards + P3 building block | medium | 5-8% step() |
| 5 | G4: P2′ narrowed (go/no-go on data) | HIGH | up to 15-20% step() or aborted |
| 6 | Re-measure + P5 parity shards | medium | 10-20s parity tail |

Combined realistic target: **~25-35% off `step()`** (stages 1+4, plus 5 if
it survives its gate), which cuts all three heavy battery lanes nearly
proportionally, plus an independent TS-replay speedup on the gpu-gate wall.

## Critical files
- `gpu/civ6gpu/engine.py` — `_rival_phase` 6995, `_rival_route_income` 5539,
  `_belief_feat_plane` 5511, `_gov_policy_mods` 1801, founding eff-bump
  6313, strike-kill 7714-7717, belief claims ~7946-7997, `restore()` ~1282,
  pick loop 7075, economy loop 7441
- `src/core/effects.ts` — `getRivalModifiers` 391-410, `withFollowerBelief`
  448-466
- `src/core/rivals.ts` — `rivalPhase` 1353, call sites
  479/548/1034/1131/1708/1781, write sites 597-645/1712-1715/1872/1901
- `src/core/empirePlanner.ts` — `rivalEmpireScore` ~73-83
- `gpu/PERF_EXPLORATION.md` — baselines; update per stage

## Verification (every stage)
1. `git diff --stat` before any battery; edit via patch files.
2. `PYTHONUTF8=1 python gpu/battery.py --no-eval` (~3 min) — the battery IS
   the gate; never chain a green standalone gate then the battery on the
   same state. During iteration on an expected-red state, use
   `python gpu/rollout.py --shards 4 --pipeline-replay` alone.
3. TS stages additionally: `npx vitest run`; fixtures re-exported before any
   standalone gate iteration; fixture md5 must be byte-identical for
   pure-refactor stages.
4. Behavior must be provably unchanged — if any gate reddens, run the
   parity-hunt skill to the exact divergent (turn, actor, rule) before
   touching code further.
5. Stage 0/Stage 5 profiles bracket the whole effort so each stage's win is
   attributable and recorded in PERF_EXPLORATION.md.
