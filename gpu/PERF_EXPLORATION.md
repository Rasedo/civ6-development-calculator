# PERF_EXPLORATION — next test-loop speedups (2026-07-18)

Exploration-only scouting for the next `python gpu/battery.py --no-eval` round.
No source touched. All anchors are by SYMBOL (line numbers drift — the main
session was editing `engine.py` concurrently during this pass: 9168→9292 lines,
rivals/cityStates work in flight, so treat every percentage as "from the
version at session start", structurally still valid).

## How the wall clock is spent

`wall = stage0 + max(lane)`. Latest run's heavy lanes:

| lane        |  s   | nature                                    |
|-------------|------|-------------------------------------------|
| gpu-gate    | 287.5| rollout (4 shards) + pipelined TS replay  |
| parity      | 265.3| 24 seeds × 250t, ONE batch (B=24), f64    |
| mcts-search | 244.9| many short rollouts through `step()`      |
| mcts-plan   | 113.5| "                                         |

The top three are within ~40s of each other and **all three are
`engine.step()`-bound and share `_rival_phase`**. That is the single most
important fact for prioritisation: a p% cut to `step()` reduces gpu-gate, parity
AND mcts-search by ~p%×(their engine share, which is ~90% for parity). Engine
work is far higher leverage than any per-lane trick. Lane rebalancing only pays
off *after* an engine cut flattens the three-way tie.

## Profiles (uncontended, taken before the main session started editing)

Two throwaway cProfile drivers (scratchpad, not committed): scripted/f64 mirror
of `parity_test` (6 seeds, B=6, 71.3s/250t) and the off-script rollout core
(9 games, B=9, 104.5s/250t, OMP=4).

**Scripted / parity path** — cumulative % of the 71.3s run:

| symbol                          | cum %  | tottime % | note |
|---------------------------------|--------|-----------|------|
| `step`                          | 90.4   | 2.6       | (rest is `trace_row`) |
| `_rival_phase`                  | 68.9   | 14.3      | dominates; the Python glue itself is 14% |
| `_rival_city_yields`            | 24.6   | 6.0       | called per-(r,j) from the economy loop |
| `trace_row`                     | 9.6    | —         | required output |
| `_barbarian_phase`              | 7.7    | 3.7       | |
| `_city_totals`                  | 7.2    | 1.5       | already `_eff_version`-cached |
| `rival_empire_score`            | 5.8    | —         | via batched `_rival_city_yields_all` |
| `_belief_feat_plane`            | 4.8    | 2.1       | recomputed per-j |
| `_rival_route_income`           | 3.5    | 2.3       | recomputed per-j, only col `j` used |
| `_gov_policy_mods`              | 3.4    | 1.8       | recomputed per-j |
| `_bel_add`                      | —      | 2.4       | 28.7k calls (perF/perC/featY per-j) |

**Rollout / gpu-gate path** — cumulative % of the 104.5s run:

| symbol                | cum %  | tottime % |
|-----------------------|--------|-----------|
| `step`                | 90.0   | 2.9       |
| `_rival_phase`        | 53.4   | 10.8      |
| `_rival_city_yields`  | 18.8   | 4.4       |
| `_apply_unit_actions` | 17.9   | **12.3**  | rollout-only (attack-preferring orders) |
| `trace_row`           | 7.0    | —         |
| `_barbarian_phase`    | 6.9    | 3.2       |
| `_rival_route_income` | 3.0    | 2.1       |
| `production_mask`     | 1.9    | 1.3       |

### The four requested measurements

- **(a) `_rival_route_income`**: 3.5% (parity) / 3.0% (rollout) of the run.
  Called ~16×/turn (RC per rival × R). It returns the full `[B, RC]` origin
  income but each caller consumes only column `j` → **O(RC²)** where O(RC)
  suffices. ~15/16 of those calls are redundant within an `_eff_version` epoch.
- **(b) `rc_tile_id` maintenance (A-17)**: **NOT a distinct hotspot.** The
  registry scatter-writes are folded into `_rival_border_growth` (~3.3%),
  `_rival_try_found` (~2%) and `_place_district_rival` (<1%); the id ring
  gather in border growth is the only non-trivial read. The registry itself is
  not a cost centre — do not spend effort here.
- **(c) trace / statelog path**: `trace_row` is 9.6% (parity) / 7.0% (rollout),
  dominated by `rival_empire_score`→`_rival_city_yields_all` (5.8%). It is
  required gate output and already de-duped (D-1/the "compute once, reuse for
  leader + column" note). `statelog`/`gpu_state_lines` runs only under `--log`
  for ONE game — absent from the battery, ~0%.
- **(d) mcts engine-vs-search split**: NOT separately profiled (mcts_test not
  instrumented within the quiet-window budget). But the mcts lanes drive the
  same `sim.step()` core; since `_rival_phase` dominates `step()` and `step()`
  dominates any rollout-based search, engine cuts propagate to mcts-search
  (244.9s) and mcts-plan (113.5s). **Recommended follow-up**: a cProfile of
  `mcts_test.py --part search` to confirm the engine:tree ratio before betting
  the mcts lanes on engine work specifically.

---

## Ranked proposals

### P1 — Hoist per-r sub-computations out of `_rival_city_yields`'s per-j path (caching cluster)  ★ top pick
**Symbols**: `_rival_route_income`, `_belief_feat_plane`, `_gov_policy_mods`,
`_bel_add`/`_bel_add_pf` (the `perF`/`perC`/`featY`/`fpw` reads) — all invoked
inside `_rival_city_yields`, which `_rival_phase`'s economy loop calls once per
city `j`.
**Waste**: each returns a per-r (or `[B,RC]`) quantity that is IDENTICAL for
every `j` within an `_eff_version` epoch, yet is rebuilt RC (~6–7) times per
rival per turn. The only mid-loop event that can change any of them (a rival
district or wonder completing → dest specialty count / feature-strip planes)
**already bumps `_eff_version`** — verified at the district-done and wonder-done
branches inside `_rival_phase` (`district_complete[...] = True; _eff_version +=
1` and the `built_wonder_complete` twin). So an `_eff_version`-keyed memo is
legal, exactly the D-5 / D-11 `gw_cache` pattern already used for `_rcy_globals`,
`_food_cache`, `_bld_cache`.
**Fix shape**: one `_eff_version`-keyed cache per function, mirroring
`_rcy_globals`. `_bel_add`/`_gov_policy_mods` depend only on per-turn-static
adoption state (beliefs/civics change on adoption, rare, not mid-loop) — a
per-turn memo cleared at `step()` top, or `_eff_version`-keyed to be safe.
**Expected win**: route 3.0–3.5% + belief_feat 4.8% + gov_mods 3.4% + bel_add
residual ≈ **9–11% of parity `step()`, ~6–8% of rollout**. Propagates to all
three heavy lanes.
**Risk**: **needs-gate-equivalence** (values are bit-identical; only cache-key
soundness is at stake). ONE edge to prove: `_rival_route_income` also reads
`rc_alive` (dest resolved among living cities) — if a city can found mid-economy-
loop via `_rival_try_found`, confirm that path bumps `_eff_version`; if not,
exclude route from the epoch cache (or key it on `_eff_version` + a founding
counter) and still cache belief/gov which don't read `rc_alive`. Draw-count-
neutral (no RNG touched).
**Agent-safety**: **parallel-agent-safe** — self-contained, each cache
independently gate-checkable. Best first task for the next round.

### P2 — Batch `_rival_phase`'s economy over the rival dimension R
**Symbols**: `_rival_phase`'s `for r in range(self.R)` loop;
`_rival_city_yields_all`, `_rival_amenity`, `_rival_border_growth`.
**Waste**: the economy sub-phase (yields, growth, queue progress/completion) is
independent across rivals within a turn — only the later war/peace acts read
cross-rival state — yet runs as R separate Python passes, each rebuilding
`[B, RC, …]` tensors. `_rival_phase` body tottime alone is 10–11s (14–17% of
`step()`). Folding R into the batch collapses R passes into one.
**Fix shape**: promote R to a batch dim (`[B*R, RC, …]` or `[B, R, RC, …]`) for
the economy block; keep the war/peace act loop rival-sequential (it draws RNG in
id order — a parity + draw-count contract that must NOT be reshaped).
**Expected win**: R=2 → ~1.4–1.7× on the economy portion (~40% of `step()`) ⇒
**~15–20% of `step()`**; scales up as R grows (self-play with more rivals).
Largest single win available.
**Risk**: **needs-gate-equivalence (HIGH) + draw-count-risk.** This is exactly
the batch-shape change the perf memory flags: BLAS float association is
batch-shape-dependent, so the ±2 milli-unit parity tolerance must be re-verified,
and the D-9 per-j accumulation ORDER must stay bit-identical for scores. Getting
the economy/war split wrong reorders RNG draws.
**Agent-safety**: **main-session**, `/gate-stage`, single owner. NOT a parallel
task.

### P3 — Vectorize the per-slot pick sub-loops in `_rival_phase` over j
**Symbols**: `_rival_phase`'s inner `for j in range(self.RC)` with the nested
`for si` (scaffold districts), `for bi2` (req-buildings), `for wi` (wonders).
**Waste**: the cheapest-building and district picks are per-city-independent
(a non-capital city's choice depends on siblings only through the civ-level
settler/spec/army counters). Each `j` redoes full `[B, NB]` unlock gathers +
argmin. The `bool(x.any())` guard storm lives here (447k `.any()` calls, 2.66s
in parity).
**Fix shape**: compute building/district eligibility+pick for ALL `j` at once
(`[B, RC, NB]`), then fold in the civ-level sequential counters (settler
one-per-civ, specialty cap) as a cheap post-pass. Keep capital-only branches
(wonder, settler preference) special-cased.
**Expected win**: ~5–8% of `step()` (removes most of the `_rival_phase` glue
tottime). Medium.
**Risk**: **needs-gate-equivalence** — the TS across-j pick order and the
sequential counters (`spec_cnt`, `settler_q`) must be reproduced exactly; that
coupling is the hard part. Draw-count-neutral (picks are deterministic).
**Agent-safety**: parallel-agent-safe if scoped to the **building-pick block
only**; the settler/spec coupling makes the full loop main-session-preferred.
Overlaps P2 (do P2 OR P3 on the same code, not both blindly).

### P4 — Pre-filter `_apply_unit_actions`'s slot loop (gpu-gate / rollout lane)
**Symbol**: `_apply_unit_actions`'s `for p in p_live`.
**Waste**: 12.3% tottime in rollout — the biggest rollout-only cost and it hits
the **wall-bottleneck lane (gpu-gate)** directly. The loop iterates every slot
alive in SOME game (the D-14 live-slot set) and runs ~30 tensor ops per slot
even when `actions[:, p]` is HOLD/-1 in all games this turn.
**Fix shape**: tighten `p_live` to slots with a non-hold, in-range order in at
least one game this turn — `((actions[:, p] != HOLD) & (actions[:, p] >= 0)).any()`,
vectorised once over the whole `[B, P]` action tensor before the loop.
**Expected win**: parity ~0 (scripted rarely orders units); rollout/gpu-gate
~3–6% depending on order density (the attack-preferring policy keeps many slots
active, bounding the win). Targets the actual wall bottleneck.
**Risk**: **needs-gate-equivalence** (prove a HOLD/invalid slot's body is a true
no-op — the D-14 comment already argues every mutation sits under a mask ⊆ alive;
this just tightens that set). Draw-count-safe: a HOLD unit never rolls, so no
skipped slot would have drawn RNG.
**Agent-safety**: parallel-agent-safe.

### P5 — Battery lane rebalancing (AFTER the engine cuts land)
**Symbols**: `gpu/battery.py` `lanes`; `gpu/parity_test.py` (single-process,
B=24 today); `gpu/rollout.py` `--shards` (the model to copy).
**Waste**: with gpu-gate ≈ parity ≈ mcts-search all within 40s, no single lane
cut helps the wall until the tie is broken. Once P1–P3 shave ~10–15% off
`step()`, gpu-gate falls toward the others and the **single-process parity lane
becomes the reducible tail** — its 24 seeds could split into 2 processes
(mirroring rollout's shard+merge) to reclaim cores freed as lighter lanes finish.
**Fix shape**: (a) after engine wins, add an optional `--shards` split to
`parity_test` analogous to rollout; (b) then — and only then — re-measure the
OMP×shard allocation.
**Expected win**: 0 until the engine cuts rebalance the lanes; then ~10–20s off
the parity tail.
**Risk**: **draw-count-risk / needs-gate-equivalence** — SHARDING PARITY CHANGES
B PER PROCESS → BLAS float association changes → the ±2 milli-unit drift MUST be
re-verified (rollout survives this; parity's tol is the same ±2, so likely fine
but not assume-able). Do **NOT** change OMP/shard counts blindly — the memory
pins 4×4 as measured-optimal for the CURRENT lane mix; a changed mix needs a
fresh sweep on a quiet box.
**Agent-safety**: main-session (orchestration + a measured sweep).

---

## Non-findings / do-not-bother

- **`rc_tile_id` (A-17) is not a hotspot** — see measurement (b). Skip.
- **`trace_row` is required gate output and already de-duped** — the 9.6% is
  `rival_empire_score`, which is the batched (D-9) path already. No cheap win.
- **OMP/shard counts**: unchanged pending measurement (memory: 4×4 optimal;
  never read perf off a contended box — and the box IS contended now that the
  main session resumed).
- **torch.compile**: ruled out previously (perf memory); not re-opened.

## Suggested sequencing for the next round

1. **P1** first (parallel-agent-safe, ~9–11%, low logic risk) — the clean win.
2. **P4** in parallel with P1 (different code, targets gpu-gate) — small but on
   the bottleneck lane.
3. Then **P2 or P3** as a main-session `/gate-stage` (pick one; they touch the
   same `_rival_phase` economy). P2 is the bigger prize but the higher
   association risk — verify the ±2 tol and D-9 accumulation order carefully.
4. **P5** last, once the lane tie is broken.
5. Before committing to mcts-specific work, run the measurement (d) follow-up.

Verification bar for every one of these: the battery IS the gate (never chain a
green gate then the battery). P1/P3/P4 need gate-equivalence only (values
identical); P2/P5 additionally need the ±2 milli-unit drift re-checked because
they change batch shape / association.

---

## Stage-0 baselines (2026-07-18, quiet box — gpu/PERF_PLAN.md execution)

Committed drivers: `gpu/profile_step.py` (both parts, OMP/MKL=4, cProfile) and
`scripts/perf-rivals.ts` (TS headless, 3 seeds × 250t). These reproduce the
throwaway-driver numbers above almost exactly (70.1 vs 71.3s; 104.7 vs 104.5s),
so per-stage before/after deltas are attributable.

- **parity part**: 70.1s / 250t (3.6 t/s). `step` 63.3s cum (90.3%),
  `_rival_phase` 48.3s (68.9%), `_rival_city_yields` 18.1s,
  `_belief_feat_plane` 3.1s, `_rival_route_income` 2.5s, `_gov_policy_mods`
  2.4s, `_bel_add` 1.7s (28.7k calls). Guard storm: `Tensor.any` 449,421
  calls / 2.62s.
- **rollout part**: 104.7s / 250t (2.4 t/s). `step` 94.3s cum (90.1%),
  `_rival_phase` 56.5s (53.9%), `_rival_city_yields` 20.5s,
  `_apply_unit_actions` 18.3s cum / **12.5s tottime**. `Tensor.any` 721,448
  calls / 4.25s.
- **TS `perf-rivals.ts`**: 286 t/s total (232 / 316 / 334 on seeds
  9001/9014/9029; one-city passive player, rivals grow to 5–9 cities). The
  plan's ~840 t/s guess is superseded by this measured baseline.
- **Measurement (d) RESOLVED**: `mcts_test.py --part search` under cProfile
  (166s tottime): `step()` = **96.8%** of the run cum, `_rival_phase` 61.4%,
  `search_production` glue ~0, `snapshot/restore` ~0. Tree overhead is
  negligible — engine cuts propagate ~1:1 to the mcts lanes; no
  mcts-specific perf work is warranted.
