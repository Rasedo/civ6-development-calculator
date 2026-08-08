# UNIFY SEATS — destroying the player/rival asymmetry

OWNER MANDATE (2026-07-29): "we need to destroy player/rivals assymetry at the
root... ideally i would want them to be objects of same class (generic player,
which can make certain actions)... YOU MUST RECONCILE PLAYER AND RIVALS, YOU CAN
DESTROY RL INTERFACE TO THE GROUND IF YOU WANT."

WHY. The player seat and the rival seats are represented differently in BOTH
engines, and that asymmetry — not the features built on it — is the recurring
source of divergence. Round #79 alone hit it four times: the golden movement
bonus (TS keeps movesLeft as STATE, the GPU recomputes per walk, and the GPU
player pool has no MP counter at all), the Archaeologist civic/slot gate, the
museum unlock, and `owned_d` existing on only one branch of `_city_totals`.

STATUS: PLAN ONLY — no migration stage has started. This document is the output
of a 12-agent mapping + design pass over both engines, the export schema, the
trace columns and the gates. Everything below is anchored to real symbols.

NOTE ON PRECEDENT: the unified civ index ALREADY EXISTS in this codebase —
`GameState.eraScore` / `civAges` / `prevAges` / `dedications` / `dedicationPicks`
/ `capitalTiles` are all documented as "UNIFIED civ ids (0 = player, r+1 = rival
r)" and B-24 shipped them on both engines. And nearly every `RivalCiv` field is
annotated in-source as "the player's twin". This is finishing a migration the
codebase already began, not inventing a convention.

---

# THE PLAN — Destroying the player/rival asymmetry

**Repo:** `C:/civ6-development-calculator` · **Written against HEAD** `2633275` (branch `claude/eloquent-mayer-si4ggq`)
Every symbol below was read in this session unless marked `[from map]`.

---

## 0. The decision

**Approach: "Firewall → Alias → Reconcile", R/B-typed, order-preserving.**

A defensible hybrid of the three candidates, taking one idea from each and rejecting the parts each candidate's own strongest objection kills:

| Taken from | What | Why |
|---|---|---|
| **Candidate A** (one civ axis) | The **exporter as firewall**: the whole TypeScript side is rewritten with `gpu/fixtures/seed*.json` **byte-identical**. | Byte-identical fixtures is a strictly stronger proof than a green parity run, and it is free. It removes ~40% of the migration from the re-export circularity entirely. |
| **Candidate B** (alias-first strangler) | **GPU tensor-view aliasing** for the plane merges, and the **R-stage / B-stage taxonomy**. | Python has no `tsc`. 764 `self.p_*` references cannot be mechanically found. A verified basic-index slice view (`base[:, 0]._base is base` → True, writes propagate) makes the pool/city/scalar merges *bit-identical* stages against unchanged fixtures. |
| **Candidate C** (capability seats) | **Unify the CODE, not the ORDER**, plus the capability table with C's own guardrail. | Verified: both engines call `barbarianPhase → disasterPhase → cityStatePhase → seatPhase` (`src/core/game.ts:941-945`, `gpu/civ6gpu/engine.py:14730-14734`). Keeping those call positions while making them call one body means representation unification costs **zero RNG reordering**. This converts most stages from B to R. |

**Rejected:**

- **TS aliasing via `Object.defineProperty`** (Candidate B). Rejected outright. `tsc` already gives the "find every call site" guarantee that aliasing exists to avoid needing, and non-enumerable accessors interact badly with `game.ts:serialize` (`JSON.stringify(state)`), object spreads, and the rival-determinism round-trip test. On the TS side, do the honest field move and let the type checker and byte-identical fixtures be the proof.
- **A dense `[B, NCIV, ...]` unit pool.** Units become **one flat pool with a `unit_seat` tag**; cities become **dense `[B, NS, MAXC]`**. Different shapes for a reason (§5.3).
- **"Destination-within-reach" movement** (Candidate C). Rejected: it requires a GPU pathfinder and destroys the "one logged order = one TS primitive call" property that makes the replay oracle diagnosable — while pathing is *simultaneously* the thing being merged from seven copies. Take MP-costed single steps (§5.5).
- **Merging `computeCityStats` with `rivalCityYields` inside the byte-identical TS rounds.** It needs ~9 divergence flags. That is not a merge, it is a set of decisions. It moves to the reconciliation round (§5.7).

### Justification against the strongest objection

The strongest objection to any of these plans — and it is the same objection for all three — is:

> The plan pays its entire cost before it earns any correctness signal, and it rebuilds the gate's own reference six times. Every divergence this project has ever caught (`rFaith` #71, `rGScore1` #79, `rWarWeariness` #78, the dead PILLAGE verb) was a hole in the *reference*, not in the engines.

Three answers, in order of load-bearing-ness:

**(a) A frozen, non-regenerated behaviour baseline.** `scripts/statelog.ts:tsStateLines` / `gpu/tools/statelog.py:gpu_state_lines` / `gpu/tools/logdiff.py` produce a full per-turn per-seed state dump that is *text, not a fixture*. Stage 0.4 captures it and freezes it. From then on:

- an **R-stage** diffs against the standing baseline with an **empty allowed-delta set** — zero lines may move;
- a **B-stage** declares its allowed-delta set **in the AUDIT entry before implementation**, diffs, and any line outside the set is a regression, not a re-baseline. Only then is the baseline re-captured.

That is the mechanism that converts "re-export = re-baseline = hope" into "re-export = declared delta = check". None of the three candidates made this the spine; it is the single change that makes the objection survivable.

**(b) The re-export count is not six, it is five, and none of them is unaudited.** TS Rounds 1–2 re-export **nothing** (byte-identical fixture proof). GPU Rounds 3–4 re-export **nothing** (aliasing makes them bit-identical). The stages that genuinely move fixture values are S0.2 (pure widening, overlapping columns must be byte-identical), S0.3 (pillage), S3.3 (capture ordering), S5.2 (player MP), S6 (city-states/barbarians), S7.x (one declared reconciliation each), S8 (rollout schema). Each carries exactly one named delta.

**(c) The aliasing invariants get a machine check before the first alias.** Candidate B's fatal weakness is three unenforced disciplines. S0.4 lands `CIV6_ALIAS_CHECK=1`: an alias registry `{name: (base, index_expr)}` asserted after every `step()` that `getattr(sim, name).data_ptr()` still equals the freshly recomputed slice's `data_ptr()` and shape. A detached rebind fails loudly instead of drifting silently. This runs as a battery lane and under every poke lane for the whole migration.

**Residual honesty:** this does not make the plan safe, it makes it *bisectable*. If a bug lands and hides, the frozen statelog plus the per-stage declared deltas make it a bisect over ~26 commits, not an archaeology dig.

---

## 1. What must NOT change

These are invariants, not preferences. A stage that violates one without an explicit line in its AUDIT entry saying so is wrong.

1. **Turn-exactness between the two engines is THE correctness bar.** Not "TS is right", not "the GPU is right". Every stage ends with `gpu/parity_test.py` at **0.0 milli** and `gpu/rollout.py` → `scripts/replay-gpu.ts` at **72/72**. A green gate proves the engines agree with each other; it never proves either agrees with Civ 6 (§7).
2. **Phase call order.** `src/core/game.ts:941-945`: `barbarianPhase(state)` → `disasterPhase(state)` → `cityStatePhase(state)` → `seatPhase(state)`; `gpu/civ6gpu/engine.py:14730-14734` mirrors it. **Unify the phase BODY, never the phase CALL SITES.** No stage before Round 7 may fuse a per-seat phase loop.
3. **RNG draw order and count.** One shared `nextRandom` stream. Exactly **two** stages in the whole plan are permitted to change the draw count, each alone in its commit: S7.11 (city-state quest rule — `cityStates.ts:issueQuest` burns two draws, `phase.ts:issueRivalQuest` is deliberately zero-draw) and S7.12 (goody huts for non-player seats). The `rng` column at `gpu/parity_test.py:HEAD[9]` is the tripwire and fails on the very next row.
4. **Iteration order within a phase.** `state.units` array order — including `combat.ts:meleeAttack`'s B-31 splice-to-end, which stays until S3.3 removes it *deliberately*. `state.cities` array order. The player-first-then-rivals splice in `game.ts:spreadReligiousPressure`, `religiousVictor`, `cultureVictor`, `phase.ts:theologicalCombat`, `defectRivalCity`.
5. **Wire index stability outside a declared renumbering stage.** `scripts/export-gpu.ts:175 IMPROVEMENT_IDS` ("FORT appended LAST — the GPU resolves by name, but order is the index"), `rules.combat.unitCombat` (the barb `u_type` space), `projects.rows` key `g`, and the trace column order. Renumbering is legal **only** in the stage that declares it: S0.3 (action enum), S3.2 (barb ladder), S0.2 (trace).
6. **The global race pools stay global.** `gp_earned`, `pantheon_claimed_n`, `claimed_f_n/o_n/e_n`, `pan_claimed/fol_claimed/fou_claimed/enh_claimed`, `congress_sessions` are **denial sets**, not duplication. Making them per-seat breaks the claim race. The one exception is a genuine bug fix, declared: `state.greatPeople.earned` splits into per-seat `earned` + a global `claimed` set (S1.2).
7. **The barbarian CAMP stays a distinct entity.** `GameState.barbCamps: number[]` / `camp_tile [B,K]` is an improvement-like spawner, which is what it is in real Civ 6. It re-homes onto the barbarian seat; it does **not** become a City.
8. **`_reclaim_pool`'s stable compaction contract** (living first, relative order preserved) is the mechanism that keeps GPU slot order equal to TS array order. Every pool/slot stage runs the forced-compaction gate `CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3`.
9. **`N_SEEDS = 24` for every B-stage.** `scripts/export-gpu.ts:192` is currently `Number(process.argv[2] ?? 12)` — a temporary owner decision. 12 is permitted for the R-stage inner loop only. Restore to 24 at S0.2 and gate every behaviour stage at 24. Measured: parity 281s@24 / 159s@12, rollout 334s@24 / 195s@12. Dropped seeds are never caught; both #78 latents were single-seed reds.

---

## 2. The verification machinery (land this first, use it every stage)

**R-stage** — values are bit-identical. Gate: `tsc` + touched vitest + `gpu/parity_test.py` and rollout/replay **against UNCHANGED fixtures**, plus `logdiff` with an **empty** allowed-delta set. *A red R-stage is always a real bug* — there is no legitimate value change to argue about, so diagnosis is near-free.

**B-stage** — one named behaviour delta. Gate: declared delta written into `gpu/AUDIT.md` **before** implementation → re-export → parity 0.0 → fresh rollout/replay → `logdiff` showing only the declared lines → the poke lane that actually **reaches** the mechanic (`[[gate-reachability]]`: scripted parity green does not prove rival↔rival paths moved correctly; the batch-2 hunt found both bugs in the rollout).

**Round structure.** Per `[[verify-loop-cost]]` rule 8, a *round* gets ONE `gpu/battery.py` at the end; stages inside a round get the cheap ladder (`tsc` → touched vitest → re-export-or-not → scripted parity **first and alone** → rollout, then confirm gates concurrently). This is what makes a 26-stage plan cost ~8 batteries, not 26. That collapses most of the schedule objection to Candidate B.

**Never** chain a green gate then a battery — the battery contains the gate. After a behaviour round's re-export, sweep all poke lanes **standalone** before the battery (the poke group serial-aborts).

### How to actually check "fixtures byte-identical" (corrected at S0.1)

`gpu/fixtures/` **is not tracked by git** (`git ls-files gpu/fixtures/` is empty — they are generated artifacts). So `git diff --stat gpu/fixtures/seed*.json`, which this plan originally prescribed, is **vacuously empty for every change** and proves nothing. It would have passed a stage that corrupted every fixture. Twenty-odd stages below say "byte-identical"; they all mean this procedure:

```sh
npx vite-node scripts/export-gpu.ts            # with your change applied
md5sum gpu/fixtures/seed*.json | sort > /tmp/hash_new.txt
git stash push -q src/ scripts/ gpu/civ6gpu/engine.py gpu/parity_test.py
npx vite-node scripts/export-gpu.ts            # baseline, from the last commit
md5sum gpu/fixtures/seed*.json | sort > /tmp/hash_base.txt
git stash pop -q
diff /tmp/hash_base.txt /tmp/hash_new.txt      # empty = byte-identical
npx vite-node scripts/export-gpu.ts            # leave the tree exporting YOUR code
```

The last re-export is not optional: `git stash pop` restores the source but the fixtures on disk are still the baseline's, and parity would then run your engine against the wrong reference. A vacuous pass is the failure mode this whole plan exists to avoid — see the `REPLAY VACUOUS` guard in `scripts/replay-gpu.ts` for the same lesson already learned once.

---

## 3. The target shape (end state, for reference)

**TypeScript** — `src/core/seats.ts` (absorbs and widens `src/core/civs.ts`):

```
SeatClass = Major | Minor | Hostile
Seat { id, cls, caps, source: 'external'|'scripted',
       name, color, aggression,
       research, government, religion,
       treasury, faith, science, culture, tourism,
       greatPeople {points, earned},
       cities: City[], nextCityId, tradeRoutes,
       influencePoints, envoysAvailable, diploFavor, diploPoints,
       warmonger, warWeariness, spaceProjects,
       buildersTrained, bestMeleeCS, tilesPurchased, settlers,
       explored, camps }
GameState { seats: Seat[], war: Uint8Array(NS*NS), warTurns, peaceTurns,
            warKindFormal, denouncedTurn, allied, claimed{...} }
Unit.seat: number        (replaces owner + civId)
Tile.ownerSeat, .ownerCity   (replaces cityId + rivalId + rivalCityId + csId)
City.seat, .hp, .foundedTurn (absorbs GameState.cityHp; RivalCity deleted)
```

**GPU** — three families:

- **units**: one flat pool `unit_{alive,seat,type,tile,hp,mp,mp_full,fortify,xp,charges,aura_mp,emb}` at `[B, 768]`, one `unit_next`, two occupancy maps `occ_mil`/`occ_civ [B,T]`. `p_acted`/`v_acted`/`u_acted` **deleted** (derived: `unit_mp < unit_mp_full`, which is TS's own gate in `units.ts:refreshUnits`).
- **cities**: dense `city_* [B, NS, MAXC=24]`, `city_id` for identity (the rival design — compaction needs no tile remap), `tile_city [B,T]` slot map for O(1) lookup (the player design). `dist [B,C,T]` **deleted**, not densified.
- **per-seat scalars**: `civ_* [B, NS, ...]` for all 26 `x`/`r_x` pairs; `war [B, NS, NS]`; capability tensors `cap_* [NS]` loaded from `rules.seats`; `seat_external [B, NS]` (the generalisation of `self.controlled`, `engine.py:772`).

**Seat space:** `PLAYER_SEAT = 0`, `seatOfRival(r) = 1+r`, `seatOfCityState(s) = 1+R+s`, `BARB_SEAT = 1+R+S`. `NS = 1+R+S+1` = 7 at gate scale.

### Why units are flat and cities are dense

Not stylistic. Cities are bounded per seat and the whole point of the merge is to compute **all seats' economy in one vectorized call**, deleting the 14 `for r in range(self.R)` loops. A dense `[B, NS, MAXC]` does that; a flat pool would need a mask per seat and do 7× the work per seat. Units already live in three flat 256-slot pools sharing one tile-indexed occupancy space, their count per seat varies wildly (barbarians many, city-states few), and the win from merging them is that **capture becomes an in-place `unit_seat` write** — which needs a flat pool, not a dense one. Different wins, different shapes.

The dense city axis wastes ~4/7 of the block (city-states hold one city, barbarians none). At `city_bldg [B,7,24,NB]` that is tens of KB — irrelevant. The one plane that must **not** be densified is `dist [B,C,T]` int16; it is deleted in favour of the rival side's live `tiles_from_offsets(center, _off3)` + `pair_dist` walk.

### The capability table, and its hard bound

**Rule: a capability bit is admissible only where the empty/zero data value would be WRONG.**

- `units.ts:ownerTechs`'s three-way branch needs **no bit** — a barbarian seat carries `research.techs = []`, so `canEmbark`/`waterEnterable` fall out correct.
- `cap.xp` **does** need a bit — 0 xp would still accumulate (`combat.ts:gainXp` early-returns on barbarians today).
- `cap.alwaysHostile` **does** — it is a genuine rule, already one line in `units.ts:unitsHostile`.

**Hard cap: 12 bits.** `research, found, expandBorders, produce, greatPeople, trade, diplomacy, envoys, suzerainable, victory, xp, alwaysHostile`. A stage that wants a 13th is a signal the taxonomy is wrong for that mechanic — it belongs in the DECISION list (§7), not the cap table.

---

## 4. Stages that FORCE trace-column / fixture-schema changes

Called out explicitly, because each invalidates the parity baseline and must be deliberate.

| Stage | What breaks | Declared delta | Check that makes it safe |
|---|---|---|---|
| **S0.2** | Trace **widens** (per-rival-city columns + missing one-sided columns). All 12→24 `seed*.json` re-exported. | **NONE** — pure widening. | The **overlapping** columns of the re-exported fixture must be **byte-identical** to the old fixture. Assert this mechanically. |
| **S0.3** | `rules.json` gains `rules.actions`; `rollout.json` re-recorded. | Player PILLAGE becomes live (currently a verified no-op). | `logdiff` shows only pillage lines; a recorded code-25 order must change map state on **both** engines. |
| **S3.2** | `rules.json` barb ladder collapses into the roster; every live `u_type` renumbers. | **NONE** — same unit chosen at every spawn. | `seed*.json` trace values byte-identical after re-export. `naval` lane is the specific tripwire for `barbNavalTypes`. |
| **S3.3** | `state.units` splice order changes (B-31 splice-to-end removed). | Unit **ordering only** at capture events. | `logdiff` must show deltas at capture events and only in unit ORDER. Any yield/HP delta is a regression. |
| **S4.1** | Merged city block takes `self.dtype`; `city_seq`/`city_seq_next` deleted. | f32 eval-lane score bands re-baseline. | parity + rollout construct **float64** (verified: `rollout.py:167`, `parity_test.py:62`), so the 0.0-milli gates are untouched. Only `gpu/eval/eval.py:40` is f32. |
| **S5.2** | Player MP live. `rollout.json` re-recorded (order semantics change meaning). | Player units move >1 tile; pay terrain/river/road; halt in ZOC. | Hand-audit one game's diff. Record the first seed/turn a moves>1 player unit actually covers >1 tile — if no gate seed reaches it, that is a reachability failure to fix before closing. |
| **S6** | City-states/barbarians join the seat axis; `cs_*` family deleted. | CS bombardment, CS max HP 150→200, CS heal rate, one meeting rule. | `cs_war`/`cs_verbs`/`cs_bonus` standalone; reachability count in the AUDIT entry. |
| **S7.1–S7.13** | One re-export each. | One named channel each. | `logdiff` shows ONLY the declared columns moving. |
| **S8** | `rollout.json` gains a seat axis; `replay-gpu.ts` decode ladder rewritten. | Every seat's decisions logged and replayed. | 72/72 with rivals driven — the first TS oracle over rival decisions in the project's history. |

Everything else in the plan runs **against unchanged fixtures**.

---

## 5. The ordered stage list

Each stage: **[R]** or **[B]**, what, gate. Rounds get one battery at the end.

### ROUND 0 — Gate hardening *(nothing is unified; the gate learns to see)*

**S0.1 — Name-keyed trace comparison. [R]**
`scripts/gpu-trace.ts` currently has `traceRow` (184 lines, positional) and `rowTolerance`, whose own comment is stale on two counts: it says *"HEAD is 24 … HEAD is 25 now"* and *"Each rival is 19 … = 20"* while the real widths are **28** and **23** (`gpu/parity_test.py:23-29`). `parity_test.py:columns` maintains a byte-parallel `atol` literal by convention only; nothing asserts they agree, and a wrong width silently shifts every later column's tolerance.
Refactor `traceRow` so its column set is generated from **one table** (`HEAD_COLS`, `PER_CS_COLS`, `PER_RIVAL_COLS`, `PER_CITY_COLS` — each entry `{name, tol, get}`), add `export function traceColumns(cMax, csMax, rMax): {names, tol}`, and **delete `rowTolerance`** (consumers: `scripts/replay-gpu.ts:42,108`). Ship the names+tolerances in a new `rules.trace` key from `scripts/export-gpu.ts`. Add `BatchSim.trace_columns()` generated from the same code that builds `trace_row`'s `cols` list (`engine.py:15063`). `parity_test.py` loads both, **asserts the two name lists are identical**, and applies tolerance by name.
*Gate:* full ladder with `seed*.json` **byte-identical** — only the comparison machinery moved. This validates the new comparator against the OLD reference before the reference is ever rebuilt. **Do not skip or shorten this; it is the circularity-breaker.**

**S0.2 — Symmetric + per-city trace coverage. [B: schema only, no behaviour]**
Restore `N_SEEDS` to 24 (`scripts/export-gpu.ts:192`). Add per-**rival-city** columns (pop, owned, bldgs, acquired, foodBox, cultureBox, hp, loyalty, followed, current, progress, cost) — today rival cities exist only as the civ-level sums `rPop/rNBldg/rQProg/rQCost/rNDist/rFollowedSum`, which is exactly the hole that let #71 `rFaith` and #79 `rGScore1` survive multiple green gates (`rFollowedSum` is already an after-the-fact checksum invented for this reason). Add the missing one-sided columns **both directions**: rival `science` (no twin exists — `grep -c r_science` = 0), rival `influence`/`envoysAvail`/`warmonger`/`tilesPurchased` (planes exist, untraced); player `techProg`/`civicProg`/`faith`/`warWeariness`/`nDistricts`.
*Gate:* re-export at 24; **the overlapping columns must be byte-identical to the old fixture** (assert mechanically); parity 0.0 at the new width; rollout clean; forced-compaction pair.
**Measure and record parity wall-time at the new width.** Today's trace is 137 columns at S=3,R=2,C=6; the widened one is ~380. If this pushes parity out of the affordable inner loop, the fallback is per-city checksums for the pure-sum columns (`rFollowedSum` is the existing precedent) — but take the full-width version first and only retreat on measurement.
**Expect reds.** Widening the trace with per-rival-city columns will very likely surface pre-existing divergences the sums were cancelling. That is the stage doing its job; budget for a multi-red hunt here *before* a single line of unification is written.

**LANDED 2026-07-30 — and there were ZERO reds.** Trace 137 -> 412 columns; scripted parity 12x250 came back 0.0 milli first try. Recorded because a no-red widening is itself a result: the per-city distributions already agreed, so the civ-level sums were not hiding anything on the SCRIPTED path.
- **The join is LIVING ORDER, not slot index.** TS `rival.cities[]` is dense; the GPU's `rc_*` slots keep holes (a new city lands at last-alive+1, and `_reclaim_rc` compacts only when the alive high-water hits `RC-8`, then for the whole batch at once). The k-th LIVING slot in ascending slot order is TS's `rival.cities[k]` — an invariant `_rival_try_found` and `_reclaim_rc`'s stable argsort both already preserve. Every column is alive-masked because dead slots keep STALE values (`_capture_rival_city` clears `rc_alive` and the queue planes but not `rc_pop`/`rc_acquired`/`rc_loyalty`/`rc_hp`) and `rc_id` is zero-initialised, colliding with the capital's id.
- **Width:** `rivalCityMax = 12`, chosen from a MEASURED max of 8 rival cities over 12 seeds x 250 turns, with a hard assert on BOTH engines so a 13th city fails loudly instead of silently losing coverage.
- **REACHABILITY of the 286 new columns** (the gate-reachability rule wants this, not just a green): 185 carry data. Rival-city slots k=0..7 are all exercised (64.5k nonzero values at k=0 falling to 1.5k at k=7); k=8..11 are the asserted headroom. 11 columns are genuinely unexercised (`r0c7.*` — rival 0 never reaches 8 cities, rival 1 does). Player `techProg`/`civicProg` fire on every turn of every seed, `warWeariness` 2006 times; rival `warmonger` 378/455, `influence` 1538/1708, `tilesPurchased` 2918/2916.
- **`envoysAvail` is structurally 0 at the trace point on both engines** — the rival earns envoys and spends them to zero inside the same turn. Kept anyway: it pins the drain-to-zero invariant, which is real signal if one engine ever fails to drain.
- **Pre-existing columns proved unchanged BY NAME**, not by position: 411,000 old values across 12 seeds, 0 drifted.
- **Cost:** scripted parity 256s at 412 columns (12 seeds) — no meaningful regression, so the full-width version stands and the per-city-checksum fallback is not needed.
- **THREE proposed columns were rejected on investigation, and each is now a recorded gap rather than an invented mirror:** rival `science` (NEITHER engine tracks lifetime rival science), per-city `current` (a GPU-only encoding; TS has no single-integer front-item form, and a one-sided column is rejected by S0.1's name assertion by design), and player `faith` (the GPU player has no faith ECONOMY at all — task #53).
- **`nDistricts` for the player was also rejected**: the TS tile-scan and the GPU registry-scan disagree after a raze-then-claim, because razing frees tiles while leaving `district`/`districtComplete` set with `cityId === -1`. Tracing it as proposed would have been a self-inflicted red; it needs a guard first.

**S0.3 — Exported action enum; the dead PILLAGE verb. [B]**
**Verified this session:** `engine.py:5255` builds `_res_cols` with `for _k in range(3, self._imp_unlock.numel())`; `_imp_unlock` is sized `nI` = `len(IMPROVEMENT_IDS)` = **10** (`scripts/export-gpu.ts:175`, FORT appended LAST at #78), so `_res_cols` has **7** entries at columns 18–24. `engine.py:5290` returns `cat([move(6), attack(6), hold(1), build_f, build_m, build_l, chop, repair] + _res_cols(7) + [pillage])` = **26 columns**, pillage at **25**. `engine.py:6544` dispatches `ok_pl = (a == 24)`. `engine.py:6583` dispatches resources with `_ok2 = (a == (18 + _k - 3))`, so `a == 24` is **double-bound** to FORT. `scripts/replay-gpu.ts:160` tests `if (a === 24)` for pillage and `:169` has a 6-entry `RES_IDS`, so `a === 25` falls to `RES_IDS[7] === undefined` and is skipped. **A shipped verb (A-21) is a no-op on both engines, and `gpu/fixtures/rollout.json` replays green because both engines no-op identically.**
Export `rules.actions.unit` and `rules.actions.prod` as name→index tables from `scripts/export-gpu.ts`, the way buildings/techs/units already ship. Repoint all four consumers to index **by name**: `unit_action_mask`'s `torch.cat` order, `_apply_unit_actions`' `a == 24`/`a == 17`/`a == 16` literals, `replay-gpu.ts`'s ladder, and `gpu/eval/train_ppo.py:53 N_UNIT_ACTS = 17` + `gpu/civ6gpu/env.py:29 N_UNIT_ACTS = 17` (both derive from the enum and are deleted as constants).
*Gate:* re-export + re-record `rollout.json`; a recorded code-25 order must **change map state on both engines**. **NEW battery lane `unit_head`**: build `train_ppo.Policy` against the live env and call `sample_heads` — this raises `RuntimeError: size of tensor a (26) must match b (17)` today, and `gpu/battery.py`'s 37 lanes contain no train_ppo/mcts/gumbel lane, which is exactly why both this and the pillage break sit in a green tree.

**S0.4 — Frozen baseline + alias-check harness. [R]**
Capture the 24-seed `scripts/statelog.ts` + `gpu/tools/statelog.py` dump and commit it as the frozen behaviour baseline. Land `CIV6_ALIAS_CHECK=1`: an alias registry `{name: (base_name, slice_expr)}` on `BatchSim`, asserted after every `step()` that `getattr(sim,name).data_ptr()` and `.shape` still equal the freshly recomputed slice. Empty registry today; it exists so it can never be added *after* the first alias. Add it as a battery lane and enable under every poke lane.
~~Also land the `_MUTABLE` discipline check: no `_MUTABLE` tensor's `data_ptr()` may change across a `step()`.~~ **CORRECTED at implementation (2026-07-29): that rule is FALSE for this engine.** Measured before writing the check: **48 of the 230 `_MUTABLE` tensors are legitimately rebound every step** (`current`, `cur_cost`, `progress`, `settlers`, `science_total`, `cur_tech`, `tech_prog`, `rng_state`, ...), because `self.x = torch.where(...)` is the normal update idiom here. The blanket rule would have failed on turn 1. What is actually invariant, and is what `snapshot()`/`restore()` rely on when they copy by name, is **shape and dtype** — 0 of 230 drift across a step. So: ALIASED names are held to the no-rebind rule (that is the Round 3 hazard), everything else to shape/dtype.
*Gate:* battery. **ROUND 0 BATTERY.**

---

### ROUND 1 — TS seat model *(exporter as firewall; fixtures byte-identical)*

**S1.1 — Accessor completeness. [R]**
Widen `src/core/civs.ts` → `src/core/seats.ts`: add `seatOfCityState`, `BARB_SEAT`, `caps(state, seat)`, `citiesOf`, `unitsOf`, `atWar(a,b)`, `setWar(a,b,v)`, `allCities(state)`. Every accessor branches on today's fields exactly as today's code does — the same behaviour-preserving contract `civs.ts`'s own header describes.
**Adopt `unitCiv` at all six inline re-derivation sites.** Verified this session: `unitCiv(` and `cityCiv(` have **ZERO call sites** outside `civs.ts`. The inline ternaries at `units.ts:473/693/757`, `combat.ts:236-252`, `combat.ts:1232/1291`, `phase.ts:1543/1557/1558/1581` disagree (`?? 0` vs `?? -1` for an undefined rival civId) — resolving that is the one semantic decision in this stage and it **must be proven inert by byte-identity**.
Route every `state.cities`/`rival.cities` scan through `citiesOf`/`allCities` (which reproduces today's `[...state.cities, ...rivals.flatMap(...)]` order **by construction**), and every `rival.atWar`/`atWarRivals`/`cs.atWar` read through `atWar`.
**Do not merge a single loop.** `game.ts:941-945`'s order and the player-first splices stay literal.
*Gate:* `tsc` + full vitest + parity/rollout **against unchanged fixtures**. Fixtures byte-identical is the bar.

**S1.2 — Storage flip to `state.seats: Seat[]`. [R]**

**COMPLETE 2026-07-30 — SPLIT INTO SIX BLOCKS, one byte-identical gate each.** `GameState` now holds NO per-civ state; everything a civ owns lives on a `Seat` and `RivalCiv extends Seat`. ~330 references moved, every block proven byte-identical.

**Two of the stage's predictions were wrong and are corrected below:** the great-people split needed NO behaviour delta (the global claim ORDER is the faithful index, so per-seat `gpEarned` is purely additive), and the rival-determinism test failure was a REAL defect (seat/rival object aliasing does not survive a JSON round-trip) rather than the expected save-shape complaint.

Original in-progress note: The
stage as written is ~400 player-field references in one pass; that is a bet, not
a migration. Landed so far, each with its own battery:
- **S1.2a diplomacy** (`b8c7012`): warmonger, warWeariness, diploFavor,
  diploPoints, influencePoints, envoysAvailable.
- **S1.2b economy** (`9fcd365`): treasury, scienceTotal, cultureTotal, plus the
  two-names-one-quantity collapses `faithTotal`->`faith`,
  `tourismTotal`->`tourism`. `scienceTotal` gains the rival field that never
  existed (storage only; the mechanic gap stays recorded).
- **S1.2c research** (`88d7e2e`): the largest single block, and the easiest —
  player and rival already shared the exact `ResearchState` type.
- **S1.2d government** (`3cdab4d`): rivals gain a STORED government that nothing
  reads yet; replacing their per-read derivation with one write is the
  precondition for merging `getModifiers`/`getRivalModifiers`.
- **S1.2e religion** (`a6c5009`): the rival's EIGHT flat fields become the
  player's ONE `ReligionState`, and the rival gains `worship`/`name`, which it
  never had. The dropped `pantheonClaimed`/`enhancerClaimed` booleans were
  provably redundant with the ids they guarded.
- **S1.2f great people** (`b0a8fbe`): `gpp` + per-seat `gpEarned`; the
  `prophets` SHADOW COUNTER is derived away.

**A FOURTH METHOD RULE, learned at S1.2e:** replacing a boolean field with a
COMPARISON breaks every `!` in front of it. `!rival.pantheonClaimed` became
`!rival.religion.pantheon !== null`, i.e. `(!pantheon) !== null` — always true —
so rivals re-claimed a pantheon every turn. `tsc` gave 0 errors and all 463 tests
passed; only fixture byte-identity caught it. Grep `![\w.]+ [!=]== ` after any
such replacement, and prefer a named helper, which survives `!` unharmed.

`state.seats[r+1]` IS the same object as `state.rivals[r]` during the migration
so both views see every mutation; `rivals` goes when the last field has moved.

**THREE METHOD RULES LEARNED THE HARD WAY HERE — apply them to every remaining
block:**
1. **`tsc` does NOT cover `scripts/`** (`include` was `["src","tests"]`), and
   `scripts/` is the whole parity harness. A field move left `gpu-trace.ts`
   writing `null` into all 12 fixtures and silently stopped the scripted policy
   assigning envoys. **Grep `scripts/` by hand after every block.** Only
   `gpu-trace.ts` and `gpu-actions.ts` are typechecked (the rest needs
   `@types/node`, not installed).
2. **Never regex a field out of an interface.** Doing so left five dangling
   `/**` openers in the committed `types.ts` that `tsc` could not see. Delete by
   exact line.
3. **`` matches after a dot** — `env.state.research` became
   `env.playerSeat(state).research`. Use `(?<![.\w])` on the receiver.

Remaining, and each is a SHAPE reconciliation rather than a move, so each needs
its own declared delta: `religion` (72 refs; the rival's eight flat fields vs the
player's one `ReligionState`), `greatPeople` (29; the shared-array/`prophets`
shadow counter), `government` (47; rivals DERIVE it per read instead of storing).

---

ORIGINAL STAGE TEXT:
Move every player-level `GameState` field and every `RivalCiv` field onto `Seat`. Delete `GameState.rivals` (becomes a derived view) and `RivalCiv`. Resolve the shape mismatches now:
- Rival religion's **eight flat fields** (`pantheonClaimed/pantheon/religionFounded/followerBelief/founderBelief/enhancerClaimed/enhancerBelief/holyTile`) become one `ReligionState`, gaining the missing `worship` and `name`.
- `faithTotal`/`faith` → one `faith`. `tourismTotal`/`tourism` → one. `scienceTotal` gains a rival field (it has never existed).
- **Kill the optionality**: every `RivalCiv.x?` becomes a required `Seat.x`. `?? 0` is exactly what would silently swallow a dropped field.
- **Per-seat `greatPeople.earned` + a global `claimed` denial set.** Today `phase.ts:claimGreatPeople` pushes into and `game.ts:greatPeopleEarned` counts the *same* array, which is why `RivalCiv.prophets` exists as a shadow counter and why `game.ts:canFoundReligion` counts rival prophets. **This is a declared behaviour delta** — it must show in `logdiff` and be explained.
- **Every seat stores a `GovernmentState`**; the scripted policy calls `effects.ts:computeAdoption` to *set* it rather than deriving on every read. This is the precondition for merging `getModifiers`/`getRivalModifiers`.
`game.ts:serialize`/`deserialize` migrate.
*Gate:* `tsc` + vitest + fixtures **byte-identical** (except the two declared deltas above, which must be isolated in their own commits with their own `logdiff` lines) + rollout clean. The rival-determinism test switches from byte-for-byte `serialize` comparison to structural deep-equality — the save *shape* legitimately changed, the values did not — plus a new `serialize(deserialize(serialize(s)))` stability test.

**S1.3 — One owner tag on units, cities, tiles. [R]**
`Unit.owner` + `Unit.civId` → `Unit.seat`. `Tile.cityId`/`rivalId`/`rivalCityId`/`csId` → `Tile.ownerSeat` + `Tile.ownerCity`. `City.seat` required, `City.hp` inline (deleting `GameState.cityHp`, `combat.ts:getCityHp`, and one of `CITY_MAX_HP`/`RIVAL_CITY_MAX_HP`), `RivalCity` deleted. Unify the `TradeRoute` record to `{fromSeat, fromCity, toSeat, toCity|toCs, expiresTurn}` (today the player uses `toRivalCiv`+`toRivalCity` and the rival uses `toPlayer`, and rival→rival routes are structurally unrepresentable).
Delete `civs.ts:tileRivalCiv/tileClaimed/tileOwnedByCiv/tileForeignTo`, `phase.ts:tileOwned`, `units.ts:tileOwnerSide/tileOwnedByUnitOwner/ownerTechs`, `phase.ts:assertRivalRegistryCoherent` (the A-17/A-24 registry-coherence bug **category**). Delete the provably dead clause at `units.ts:385` (`side === 'rival' && u.civId !== unit?.civId` — `unitSide` returns `rival:0`, never bare `'rival'`, so it is unreachable *unconditionally*, not merely "inert for the all-military world" as its comment claims).
**Keep** `combat.ts:meleeAttack`'s B-31 splice-to-end for now — it is a GPU-pool artefact removed deliberately at S3.3.
*Gate:* `tsc` + vitest + fixtures byte-identical + rollout clean. **ROUND 1 BATTERY.**

---

### ROUND 2 — TS code de-duplication *(still byte-identical)*

**The merge rule.** A twin merge is legal in this round only if it needs **≤3 divergence flags**. More than three means it is not a merge, it is a set of decisions — defer it to Round 7. This is the escape hatch that prevents Round 2 from collapsing into an enormous un-gated slice, which is the failure mode Candidate A's own objection identifies.

**S2.1 — One mover. [R]**
Factor `units.ts:stepUnit(state, unit, target, {occupancy, stop})` owning the whole MP contract (`moveCostInto` + `riverCharge`, the "a full-MP unit always affords one step" rule, embark/disembark all-MP transition, cliff block, encampment block, `clearCampFor`, `inEnemyZoc` halt). Rewrite the **seven** copies as target-choosers passing their *current* predicates: `units.ts:walkPath`, `combat.ts:hostileUnitAct`'s march (1341-1381), `phase.ts:patrol` (1059-1090), `rivalBuilderActions` (1471-1499), `rivalMissionaryActions` (1702-1728), `rivalGeneralActions` (1778-1804), and the scripted builder walk in `scripts/export-gpu.ts` (1862-1877).
The four divergent occupancy tests are **injected predicates, not flags**: `tileFreeForUnit`; `walkPath`'s extra `unitsAt(...).some(u => u.owner !== unit.owner)` (keys on owner, ignores civId, inconsistent with `unitSide`); `patrol`'s `unitsAt(...).length === 0`; `export-gpu.ts:blockedForBuilder`. They converge in Round 7, not here.
*Gate:* **one copy per commit, least-reachable first.** Per commit: `tsc` + vitest + fixtures byte-identical + the lane that reaches THAT walker (`war` for the march, `cs_verbs`/`builder_gain` for builders, `religion2` for missionaries, `gp_aura` for generals). Scripted parity alone is **not** sufficient — it cannot reach rival↔rival paths.

**S2.2 — One modifier head. [R, 1 flag]**
`effects.ts:getModifiers(state, seat)` absorbs `getRivalModifiers` + `rivalModCache`. Pick **one home for the city-state channel** — today it is *inside* `getModifiers` for the player and re-added by hand inside `phase.ts:rivalCityYields` for the rival. Choose inside; carry a `csChannel: boolean` flag bound to reproduce today's behaviour, to be flipped in Round 7.
*Gate:* `tsc` + vitest + byte-identical + `government` lane.

**S2.3 — The zero-flag twins. [R]**
Each of these is byte-identical arithmetic differing only in a scalar or a list, and merges with **zero** flags once seats exist:
`combat.ts:cityDefenseStrength` ← `rivalCityDefense` · `yields.ts:regionalEffects` ← `phase.ts:rivalRegionalEffects` ("the same body verbatim") · `city.ts:empireGrowthMult` ← `rivalGrowthAllMult` · `city.ts:cityMaintenance` ← `rivalCityMaintenance` · `city.ts:playerTourism` ← `city.ts:rivalTourism` (already 90% there — both delegate to `wonderTourism`/`resortTourism`/`civEraIndex` and differ only in the injected `owns` predicate; **this is the template**) · `trade.ts:tradeCapacity` ← `rivalTradeCapacity` · `trade.ts:routeRaidedAt` ← `rivalRouteRaidedAt` · `cityStates.ts:isSuzerain` ← `rivalIsSuzerain`, `csEnvoyBonuses` ← `csRivalEnvoyBonuses`, `csSuzerainCapitalBonus` ← `csRivalSuzerainCapitalBonus` · `city.ts:pickBorderTile`+`borderCandidates` ← `phase.ts:pickRivalBorderTile` (**verified**: `data/constants.ts:24 BORDER_MAX_RADIUS = 5`, matching the rival picker's hardcoded literal `5` — zero flags) · `boosts.ts:detectBoosts` ← `detectRivalBoosts` (1 flag: the `policies` kind, which `rivalCheckSatisfied` returns false for — becomes a cap read) · `combat.ts:attackCity` ← `attackRivalCity` (0 flags; `attackCityState` stays for Round 6).
Collapse the `…In(research)` / state-taking wrapper split (`effects.ts:computeUnlocksIn`, `availableTechsIn`, `availableCivicsIn`, `rules.ts:canPlaceDistrictIn`, `validImprovementsIn`) into the `In` cores taking `(state, seat)` — they are already seat-agnostic; only the wrappers hardcode the player.
*Gate:* per commit: `tsc` + vitest + byte-identical + the reaching lane.

**S2.4 — One turn body, same call sites. [R]**
Factor `src/core/seatTurn.ts:seatTurn(state, seat)` absorbing `game.ts:endTurn`'s player block and the per-rival body of `phase.ts:seatPhase` (3547 lines — the biggest single win). **The phase driver keeps calling them from today's positions** (`game.ts:941-945`), so draw order is untouched. Anything that still cannot merge stays as an explicitly-named branch inside `seatTurn` with a TODO pointing at its Round 7 slice.
*Gate:* `tsc` + full vitest + fixtures byte-identical + rollout clean. **ROUND 2 BATTERY.**

> **Explicitly NOT merged in Round 2:** `computeCityStats` ← `rivalCityYields` (~9 flags), `rangedAttack` ← `hostileRangedStrike` (2 flags but both are real fidelity gaps), the queue loop, citizen assignment, `foundCity` ← `foundRivalCity` (settler bank decision). All → Round 7.

*Rounds 1–2 and stages S3.1–S3.2 are independent and are good candidates for the proven parallel-subagent workflow — but both tracks touch `scripts/export-gpu.ts`, so coordinate that file.*

---

### ROUND 3 — GPU unit unification *(aliasing; unchanged fixtures)*

**S3.1 — In-place + reshape sweep. [R]** *(prerequisite for aliasing; worth landing alone)*
Convert every `self.X = <expr involving self.X>` after `__init__` to an in-place write (`.copy_`, `.add_`, `torch.where(...)` into `.copy_`). Watch dtype promotion (`long + float` produces a promoted tensor that `.copy_` would cast back — audit each). Sweep `.view(` → `.reshape(` on every plane that will become a view (a last-dim slice is non-contiguous, so `.view(-1)` raises where `.reshape(-1)` works). Register only **base** tensors in `_MUTABLE`, never aliases.
*Gate:* parity + rollout unchanged fixtures; `gpu/tests/snapshot_restore_test.py` (the ONLY `_MUTABLE` round-trip coverage — parity never restores); the S0.4 `data_ptr` asserts; `gpu/tools/profile_step.py` within 5% **on an idle box**.

**S3.2 — Collapse the barbarian unit-TYPE index space. [B: rules.json only]**
`_unit_combat` (1683), `_u_naval` (1687), `_u_rng_str` (1693), `_u_moves` (1694), `_u_rng_rng` (1695), `_barb_galley_idx`, `_barb_quad_idx` are a **second integer index space** over the same unit ids the roster carries. Make the barb ladder entries real `rules.units` rows; `u_type` becomes a roster index; `rules.combat.unitCombat/unitMoves/unitRangedStrength/unitNaval/barbNavalTypes` collapse to `barbLadder: number[]`. Collapse the three-way heal/fortify predicate at `engine.py:14447-14461` (`_unit_combat[u_type]` vs `_p_combat[v_type]` vs `_p_combat[p_type]`) to one.
**Nothing else in the pool merge can proceed while `_p_combat[self.v_type]` and `_unit_combat[self.u_type]` mean different things.**
*Gate:* `rules.json` changes, `seed*.json` trace values must be **byte-identical**. Scripted parity first and alone, then concurrently rollout 72/72, forced compaction, and `naval`/`war`/`ranged`/`combat_mod`/`domination` **standalone**. `naval` is the specific tripwire for `barbNavalTypes`. Record in the AUDIT entry which lane reaches a barb naval spawn.

**S3.3 — One unit pool. [B: unit ordering only]**
Allocate `unit_* [B, 768]` with a real `unit_seat` plane; rebind `p_*`/`v_*`/`u_*` as **disjoint contiguous slot ranges** (0:256, 256:512, 512:768) so the merged tensor's layout is identical to three tensors and `_reclaim_pool`'s per-seat stable compaction is unchanged. Barbarians gain the four planes they lack (`charges`, `xp`, `aura_mp`, `emb`) as initially-inert columns — which un-hardcodes `_hostile_vs_unit`'s `atk_lvl5 = torch.zeros_like(...) if atk_kind == "barb"` (10141, 11015) and removes "a barbarian kills a lone rival civilian roll-free" (there was no barb civilian pool to receive a capture). **Gate those two behind cap flags** so this stage stays ordering-only; flip in Round 7.
Capture becomes `unit_seat[b,slot] = s; unit_mp[b,slot] = 0` + an occupancy rewrite, deleting the three hand-written field-copy blocks (`_apply_unit_actions`' `civk` branch, 11 writes; `_hostile_vs_unit`'s `civ_att` and `rvciv_att` branches, 12 each). **The paired TS change lands here**: `combat.ts:meleeAttack`'s B-31 splice-to-end goes away. That IS the declared ordering delta. Rename `next_slot` → `u_next` so `getattr(self, f"{prefix}_next")` works generically.
*Gate:* re-export (ordering delta). Scripted parity first and alone; then rollout 72/72, **mandatory** forced compaction, and `occupancy`/`naval`/`war`/`ranged`/`gp_aura`/`encampment`/`domination` standalone. `logdiff` must show deltas **only at capture events and only in unit ORDER** — any yield or HP delta is a regression.

**S3.4 — One occupancy predicate. [R]**
Five maps (`pmil_at`, `pciv_at`, `rv_at`, `rvciv_at`, `barb_at`) → `occ_mil`/`occ_civ [B,T]` holding a unit slot; "whose" is `unit_seat.gather(1, slot)`. `_blocked_for(tiles, side: str, civ)` (4830) — a five-way string branch — becomes `_blocked_for(tiles, seat, is_civilian)`; `_first_free_spot`'s duplicate three-way branch folds in; `_encamp_block_plane(side, civ)` (4790) and `_flank_support(def_side: 0|1|2)` (4645) take a seat; `_in_enemy_zoc` (which already takes an optional `mover_civ`) absorbs `_in_enemy_zoc_barb` by making it required.
Fold the two divergent civilian predicates into one: `unit_action_mask` uses `self._p_civ[self.p_type]` (the exported `civilian` flag) while `rival_unit_mask` uses `self._p_charges[...] > 0` (charges). They agree on today's roster by accident.
**New invariant** for the `occupancy` lane, in the spirit of `_check_rc_registry_invariant`: `occ_mil>=0 & occ_civ>=0 ⇒ unit_seat[occ_mil] == unit_seat[occ_civ]`.
*Gate:* parity + rollout unchanged fixtures; `occupancy`/`gp_aura`/`war`/`ranged` standalone; forced compaction; `profile_step` within 5% (this is the stage most likely to cost perf via non-contiguous gathers on a hot path). **ROUND 3 BATTERY.**

---

### ROUND 4 — GPU city block, scalars, war matrix

**S4.1 — One city block. [B: dtype + `city_seq` deletion]**
`city_* [B, NS, MAXC=24]` merging the 22 `[B,C]`/`rc_*` pairs by aliasing (`self.alive = self.city_alive[:, 0, :self.C]`, `self.rc_alive = self.city_alive[:, 1:, :]`). Identity = the rival design (`city_id` + `civ_next_city_id`); lookup = the player design (`tile_city [B,T]` slot map, rebuilt by the compaction's inverse permutation exactly as `_reclaim_pool` already remaps `pmil_at` via `inv.gather`). `owner`/`rival_at`/`rc_tile_id`/`cs_at` → `tile_seat` + `tile_city`. `center_at`/`rvcity_at` merge, deleting `_player_attack_rival_city`'s `for j in range(self.RC)` linear scan. `_reclaim_rc` + `_RC_SLOT_FIELDS` → `_reclaim_cities` covering seat 0; `city_seq`/`city_seq_next` deleted.
**Dtype decision: `self.dtype`, not float64.** Verified: `parity_test.py:62` and `rollout.py:167` both construct `dtype=torch.float64`, so the two 0.0-milli gates are unaffected; the only f32 construction in the tree is `gpu/eval/eval.py:40`. Hardcoding f64 would make the f32 eval lanes meaningless for the majority of the arithmetic (105 hardcoded `dtype=torch.float64` sites today) and cost training throughput permanently. Per `[[dtype-equality-not-invariant]]` the f32 lanes are equivalence gates, never equality gates — this is a score-band re-baseline, declared.
**Close the verified slot-hygiene gap while here:** player slot-init sites (`_capture_rival_city`, `_capture_city_state`, the `step()` founding loop) zero only `gw_writing` and `gw_music` — never `gw_art`/`relics`/`artifacts` — and player slots **are** reused via the `hole = first_argmax((~self.alive).long())` fallback. `_capture_rival_city` clears none of the five on the dying slot. This is the `rGScore1` ghost-relic class on the player side.
**Do not densify `dist [B,C,T]`** — delete it in favour of `tiles_from_offsets(center, _off3)` + `pair_dist`, along with the six static per-city derived tables (`center_yields`, `center_raw_food`, `base_maintenance`, `water_housing`, `coastal`, `river_center`).
*Gate:* re-export. Scripted parity first and alone (S0.2's per-rival-city columns are what make this diagnosable at all — **do not attempt without them**); then rollout, mandatory forced compaction, and `rc_registry`/`districts`/`great_works`/`relics`/`culture_victory`/`space_race` standalone.

**S4.2 — Per-seat scalars. [R]**
All 26 `x`/`r_x` pairs → `civ_* [B, NS, ...]` by aliasing. Gaps close by construction and stay **inert**: `civ_science_total` gains rival columns, `civ_tiles_purchased`/`civ_aggression` gain a player column, rivals gain the religion columns the gather tables currently skip (`fbr[:, 1:1+R] = r_follower` leaves column 0 unfillable). Global race pools untouched.
*Gate:* parity + rollout unchanged fixtures at float64; f32 eval lanes within recorded score bands; `profile_step` within 5%.

**S4.3 — One war matrix. [R]**
`r_atwar` (player↔rival) + `rr_war` (rival↔rival) + `cs_atwar` (player↔CS) → `war [B, NS, NS]` symmetric, barb row forced by `cap_alwaysHostile`; `war_kind`/`war_turns`/`peace_turns`/`denounced`/`allied` likewise. TS: `units.ts:unitsHostile`'s three-storage reconciliation collapses to one expression, and the deliberate `phase.ts:civsAtWar` import-cycle duplicate (`units.ts:226`) disappears because the matrix lives on `GameState`.
*Gate:* parity + rollout unchanged fixtures; `war`/`cs_war`/`geopolitics`/`war_weariness` standalone. **ROUND 4 BATTERY.**

---

### ROUND 5 — Movement points — **DONE** (2d6f8fd, 9cbe1d0, 04b806e, S5.3)

**What shipped, against what was planned.** The stage shapes held; two things
came out differently and one plan item moved to Round 8.

* **S5.1** landed as written: `unit_mp` / `unit_mp_full` join the merged pool,
  the walkers write them where they already computed the values. Deriving
  `acted` did NOT belong here — it depends on the player path having MP at all
  — so it moved to S5.2b. `_reclaim_pool`'s field list stopped being three
  hand-written lists and is derived from the pool; the "u" list had already
  drifted (no xp/charges/aura_mp/emb).
* **S5.2a** is the pivot, and it is smaller than the plan expected: the afford
  rule is **measurably inert** under the current driver (33,114 steps offered,
  **0 refused**), because each unit gets one order per turn and therefore
  always steps at full MP. The plan's "applier loops until every unit is out of
  MP" is the part that would make it bite, and that needs the RL action space —
  **it is Round 8**, not Round 5. No re-export was needed (fixtures are
  scenarios, not recordings); `rollout.json` was re-recorded three times over
  the round and replays 36/36.
* **S5.2b** deleted `p_acted`/`v_acted`/`u_acted` after `_check_mp_invariant`
  proved `acted == (mp < mp_full)` on every live slot, every step, across all
  three gates.
* **S5.3** is `_step_verb`, not `_walk(...)`. Factoring the whole loop was the
  wrong cut: TS already says the loop body is what differs ("The CALLER still
  picks the destination... candidate sets, occupancy tests, stop conditions").
  What was actually duplicated is everything DOWNSTREAM of the destination, and
  that is now one function called by all six walkers and all three action
  appliers. −155/+106 lines.

**§7 item 12 — the double MP reset. DECIDED: keep both, and it is not an
artefact of ours.** Real Civ 6 refreshes a civ's movement at the start of THAT
civ's turn, so `seatPhase`'s reset is the faithful one and `barbarianPhase`'s
is too. The artefact is the other direction: `refreshUnits` sweeping ALL units
at the player's turn boundary. The two are value-identical today (nothing
spends rival MP between them), so this is a naming/structure debt, not a
behaviour bug — and the right place to collapse it is **Round 6**, where
city-states and barbarians become seats and "each seat refreshes at the start
of its own phase" can be one rule instead of three sweeps.

**S5.4 — the golden movement dedications, re-landed. DONE.** The plan named a
`goldenMoveBonus` guard to lift; there was no such function — #79 REVERTED both
bonuses and left only a note deferring them here. Verified against the
Civilopedia (Gathering Storm), not the note, and re-landed on both engines
through the single MP rule this round created: `unitFullMoves` in TS,
`_full_mp` + `_golden_move_mp` on the GPU, keyed on the unit's OWN seat so a
rival in a Golden age gets it too. Reachability 862 Builder-turns / 1,345
Missionary+Apostle-turns over 12 seeds x 250t. See the B-24 entry in
gpu/AUDIT.md, including the parity-caught bug (`embarkLive` is 1, not 0 —
three engine comments claiming otherwise are corrected) and the recorded
residual: the other three golden faces are still called with a hardcoded
civ 0, so a rival gets the movement bonus but not the research discount.

**S5.5 — the other three golden faces, per seat. DONE.** That residual closed
in the same session: FREE_INQUIRY / PEN_BRUSH_AND_VOICE's extra 10% now joins
the rival research path at all four sites (both auto-picks and both completion
tests — the pick KEY needs it as much as the test, which is #79's own bug (1)),
EXODUS's +4 PROPHET points join `claimGreatPeople` before its `accrue > 0`
guard, and PEN_BRUSH's +1 culture per specialty district joins BOTH rival-yield
paths at the city.ts twin position. The rivals got measurably stronger: the
exporter threw on seed 9054 (index 4 lost every player city by t250) and it was
rerolled to 9056 through SEED_OVERRIDES, the documented mechanism for exactly
this. See the B-24 entry in gpu/AUDIT.md.

---

### ROUND 5 — Movement points *(original plan, for reference)*

**S5.1 — MP becomes state, player-inert. [R]**
Add `unit_mp`/`unit_mp_full` for every seat; rivals and barbarians **write** them where they currently compute a phase-local (`full_mp = self._p_moves[_vt] + self.v_aura_mp[:,u] + self._golden_move_bonus(...)`, `mp = full_mp.clone()`). Values identical; only residency changes. Derive `unit_acted` as `unit_mp < unit_mp_full` (TS's own gate in `units.ts:refreshUnits`) and delete `p_acted`/`v_acted`/`u_acted`.
**Keep BOTH reset moments** — `_refresh_aura_mp` at step end and `_refresh_aura_mp_rival` at the top of `_rival_phase`. They are not redundant; they mirror TS `refreshUnits` and `seatPhase` both resetting `movesLeft`. Whether that double reset should exist at all is a **Civ 6 fidelity question** (§7 item 12), not a merge to force.
*Gate:* parity + rollout unchanged fixtures; `gp_aura` (the aura +1 MP is the one thing that makes `full_mp` vary per turn).

**S5.2 — Player MP goes live. [B — the pivot]**
`self._p_moves` (declared at `engine.py:1717`, comment "A-8: full MP per turn") is **dead code on the player path** — all eight read sites index a rival type. A player HORSEMAN with `moves=4` walks one tile per turn.
**Shape: MP-costed single steps, mask width unchanged.** `unit_action_mask` keeps its exact column layout (0–5 remain single-neighbour steps); a step becomes legal iff `mp >= cost` or `mp >= mp_full` (the first-step rule already in every rival walker) with `cost` from `_road_terms`; `_apply_unit_actions` loops until every unit is out of MP, and a unit out of MP has only HOLD legal.
Chosen over "destination within MP reach" because (i) it keeps *one logged order = one TS primitive call*, the property that makes the replay oracle diagnosable; (ii) it needs no GPU pathfinder — the rival walkers are greedy steppers, not A*; (iii) merging pathing and making it the action semantics in the same stage is a double risk.
`_road_terms` and `_in_enemy_zoc` gain their **first player call sites**: terrain slow (`tmove`), river charges and B-23 roads become visible to the human seat. Lift `eras.ts:goldenMoveBonus`'s `if (civ <= 0) return 0` guard — its own comment says the block exists solely because "the GPU's player pool has no movement-point budget at all … Lift this once the player pool has MP", and `civ <= 0` also silently swallows barbarians. `scripts/replay-gpu.ts`'s forced `unit.path = [n.index]; walkPath(state, unit)` stops being a deliberate truncation and becomes correct semantics.
**`rollout.py`'s unit-order log needs no schema change** — orders are already tile-addressed (`[tile, action, civflag]`), so a unit's second order in a turn carries its new tile. The list just gets longer.
*Gate:* **full re-export at 24 seeds AND re-recorded `rollout.json`** (recorded action semantics changed meaning; the old log is not comparable). parity 0.0; replay 72/72 with a **hand-audited diff of one game**; `occupancy`/`war`/`naval`/`gp_aura` standalone; forced compaction. **Record the first seed/turn at which a moves>1 player unit actually covers more than one tile** — if no gate seed reaches it, that is a reachability failure to close before the stage ships. Measure and record the wall-clock rise (K× applier cost, K≈2–3 typical not 6) per `[[test-loop-perf]]` before calling it a regression.

**S5.3 — One walker on the GPU. [R]**
Factor `_walk(unit_mask, target, stop_pred)` and rewrite the six copies (`_barbarian_phase` 7142, `_rival_builder_actions` 8194, `_rival_missionary_actions` 8486, `_rival_general_actions` 8576, `_rival_unit_war_act` 10877, `_rival_unit_peace_act` 11374 — three of which say "verbatim" in their own docstrings). Scripted policies become **action producers** feeding the same applier the RL head feeds.
*Gate:* per copy: parity + rollout + the reaching lane. **ROUND 5 BATTERY.**

---

### ROUND 6 — City-states and barbarians become seats [B] — IN PROGRESS

**S6.0 — ONE war relation. DONE (`c29af04`).** `r_atwar [B,R]`, `rr_war
[B,R,R]` and `cs_atwar [B,S]` are SLICES of `war [B,NS,NS]` now, not tensors
beside it, so the drift class is gone by construction. `_check_war_invariant`
loses two checks that became tautologies and keeps the one code can still
break — symmetry, plus a zero diagonal. `sync_war` stops rebuilding and
becomes the transpose closure with the UPPER triangle authoritative (not an
OR: peace clears one cell, and ORing the transpose back would undo it).
FOUND: the player<->CS war verb is unreachable in a GAME — see AUDIT A-18.

**S6.1 — the five (civ, city-state) relations. DONE.** `cs_met`/`cs_r_met`,
`cs_envoys`/`cs_r_envoys`, `cs_quest`/`cs_r_quest`, `cs_quest_camp`/…,
`cs_quest_issued`/… are one `csr_x [B, 1+R, S]` plane each with the old names
as `[:, 0]` / `[:, 1:]` views — the S4.2 pattern applied to the relation a
city-state actually has. `cs_quest_district` keeps its own plane: rivals never
ask for a district (B8-L picks the first satisfiable option), so that
asymmetry is in the RULE, not the storage. The in-place lane gained rule 3b —
`_alloc_*` helpers may use `setattr` because they are __init__ split up, and
that exemption is CHECKED: every one must be called from __init__ and nowhere
else (proven to bite by injecting a call from `sync_war`).

**S6.2 — a minor's city joins the city block.** `cty_x` widens to
`[B, 1+R+S, RC]`; `cs_alive/cs_center/cs_pop/cs_hp` become the minor section
(row 1+R+s, slot 0), at the same row index the war matrix uses.

**S6.3 — the TS war predicates cover every seat pair. DONE.** `civsAtWar` and
`unitsHostile` branched on "one side is civ 0" and "both are rivals" and fell
through `rivalOfSeat(...) ?? false` for anything else, so a CITY-STATE seat
answered PEACE even with `CityState.atWar` true — the hole the GPU closed in
S6.0. Landed before the storage moves, per
[[migrate-comparisons-before-storage]]. Rival<->CS war stays NOT MODELLED and
says so in code and in a test, rather than being guessed at.

FOUND BY THE TEST, not by reading: `unitSide` classified every seat that was
neither the player nor a rival as `'barbarian'` — city-states included. Never
fired (no minor has units yet) and would have fired the moment Round 6 gave
them any, in the worst way: a minor's unit would stack freely with barbarians
(`tileFreeForUnit` compares side keys) and be unable to fight them
(`unitsHostile` returns false for a same-side pair). Each minor is its own side
now. Same class as S3.4's `"rival"` string falling through to "everything
blocks".

**S6.4 — the last five player/rival SCALAR pairs. DONE.** S4.2 collapsed
sixteen `x` / `r_x` pairs; five were walked straight past because the two sides
never shared a NAME — `culture_total`/`r_culture`, `player_faith`/`r_faith`,
`tourism_total`/`r_tourism`, `p_warmonger`/`r_warmonger`,
`player_gp_points`/`r_gpp`. Exactly the trap the city block's eight mismatched
pairs set in S4.1. All five are `civ_<key> [B, 1+R(, NG)]` now, old names as
views. Merged float planes take `dtype` (the S4.1 precedent): a no-op in the
f64 gates, a declared re-baseline in f32 eval. NOT merged and recorded:
`r_prophets` (the player's count is DERIVED from `gp_earned` — unifying that
is a behaviour change, not a move) and `science_total` (rival science is
tracked by neither engine).

**A survey now says there is exactly ONE raw `x`/`r_x` pair left in the engine,
and it is none — the automated pair scan comes back empty.** What remains are
rival-only planes with no player twin at all, which is a different problem:
either the player genuinely lacks the mechanic (#52 embark, #53 faith economy,
rival science) or stores it derived rather than stored (`r_prophets`).

**S6.5 — the two war CLOCKS become seat-indexed. DONE.** `r_warturns [B,R]`
and `cs_war_turns [B,S]` count the same thing — how long that seat has been at
war with the player — so they are the rival and minor slices of one
`war_turns [B, NS]`, at the same `_seat_row` index `war` uses. `peace_turns`
takes the same shape; only its rival slice is written, because there is no
city-state peace clock — the S6.2 rule again: the FIELDS are uniform, the RULES
are not. Also swept the S6.2 leftovers into rule 4's guarded list: the city
block's forty player/rival view names were never there (135 guarded now, from
92), so a rebind of `rc_pop` or `buildings` would have detached a section of
the block silently.

**S6.6 — `tile_seat`, and the first check that a tile has ONE owner. DONE.**
TS has answered "who owns this tile" with one field since S1.3
(`Tile.ownerSeat`); the GPU answers it with three planes that each know a
third — `owner` (the player's city slot), `rival_at`, `cs_at`. `tile_seat` is
the derived `tileSeat` twin, so readers can start asking the one question
while the three planes stay the writable surface. `_check_tile_owner_invariant`
proves they never claim the same tile — nothing had ever checked that, and a
claim that writes `rival_at` without clearing `owner` would leave every
consumer picking a different winner depending on which plane it read. It holds
across 12 seeds x 250t and is proven to BITE on an injected double claim.
**S6.7 — the cache, and the first 28 readers flipped. DONE.** A derived
`tile_seat` recomputed at each of ~160 call sites would add ~480 kernel
launches per step, and dispatch is already 83% of a step at B=12 (task #57) —
a derived read has to be FREE before call sites can move to it. It is cached
on `_tile_owner_ver`, which every tile-ownership write bumps, and a MISSED
bump is not silent: the step invariant compares the cache against a fresh
derivation. The 28 `self.owner >= 0` reads — "does the PLAYER own this tile",
the seat question — now ask `tile_seat == PLAYER_SEAT`. `owner` keeps the
CITY question (`owner == c`), which is TS's `ownerCity`, and stays.

TWO MISSED WRITES, both found by the staleness check within minutes of the
readers flipping, neither visible to a scan for `self.owner[...] =`:
  1. `restore()` rewrites all three planes through a generic
     `getattr(self, k).copy_(v)` loop.
  2. FOUR claim sites index with a NESTED subscript —
     `self.rival_at[rows[free], n_d[free]] = r` — which a
     `\[[^\]]*\]` scan cannot match. The bracket-aware rescan found them.
That is the same family as S3.1's line-scanner missing eight multi-line
statements: a regex over source is a heuristic, and the invariant is what
makes it safe to rely on one.

**S6.8 — the first of the three planes actually DIES. DONE.** `tile_seat` is
STATE now, not a cache, and the CITY-STATE third of tile ownership is stored
only there: `cs_at` is a cached property over it and the plane is gone. Its two
writers (the ring-clear when a city-state is captured or destroyed) write
`tile_seat` directly. `owner` and `rival_at` still store the player and rival
thirds and are RETAGGED into `tile_seat` at every write — 17 sites — with the
step invariant comparing the two halves, so a write that skips the retag is
caught rather than silently splitting readers by which plane they ask. Proven
to bite; `cs_at` verified to be a property over 21 real city-state tiles.

**S6.9 — the SECOND plane dies. DONE.** `rival_at` follows `cs_at` by the
pattern S6.8 proved: eight writers redirected to `tile_seat` (`= r` becomes
`= r + 1`, `= -1` becomes `= NO_SEAT`), the name kept as a cached property,
the plane deleted, and the invariant's rival comparison dropped because there
is no longer a second copy to disagree with. `_retag_tiles` now rebuilds only
the PLAYER part; everything `>= 1` is stored in `tile_seat` itself.

**S6.10 — the THIRD plane dies, and tile ownership is ONE pair. DONE.**
`owner` was the one that could not simply become a view, because it answers a
different question: not "whose tile" but "whose CITY". So `tile_city` joins
`tile_seat` — exactly the `ownerSeat` + `ownerCity` pair TS has had since S1.3
— and `owner` is the two read together.

With that, `_retag_tiles` and the whole drift invariant RETIRE. There is
nothing left to retag and nothing left to drift: "a tile has one owner" stopped
being something three planes have to agree about and became a property of the
encoding. The exclusivity count stays as a cheap tripwire in case a future
write reintroduces a second store.

**The GPU's tile ownership is now the TS model, field for field.** 160 call
sites still spell it three ways, and they can stay that way indefinitely —
they are views over one pair, and cannot disagree with it.

Remaining: the `cs_*` planes that are genuinely city-state-specific
(`cs_type`, `cs_suz_key`, `cs_last_levy`).

---

**S6.11 — the capability table, and the ten bits it refuses. DONE.**
`src/data/seats.ts` + `gpu/civ6gpu/engine.py:SEAT_CAPS`.

§3 proposed twelve bits and a hard cap of twelve. Applying §3's OWN
admissibility rule — *a bit is admissible only where the empty/zero data value
would be WRONG* — admits **two**:

| bit | why zero is a LIE |
|---|---|
| `xp` | a barbarian carrying `xp = 0` ACCUMULATES from its next attack. Civ 6 barbarians have no promotions. |
| `alwaysHostile` | the war relation is one symmetric matrix (S6.0) and an all-false row means PEACE. Barbarians never declare and never make peace. |

The other ten (`research`, `found`, `expandBorders`, `produce`, `greatPeople`,
`trade`, `diplomacy`, `envoys`, `suzerainable`, `victory`) are each answered by
a datum the seat already carries — an empty tech list, zero settlers, an empty
queue, zero culture, zero gpp, an empty route list, zero favour, zero envoys,
the minor's own `type`, and thresholds on totals that never accrue. They are
recorded in `src/data/seats.ts` with the datum beside each, because a flag that
restates data reads like a rule and is not one.

**The table is NOT stored on the Seat**, which §3's target shape had. The class
is a function of the absolute seat id (task #54), so a stored copy would be a
second source of truth for a fact the id carries — the admissibility rule one
level up. `capsOf(seat)` is a pure function; the trigger that would flip this
is a per-CIV trait varying a capability WITHIN a class, and nothing does.

Three call sites, and only three: `combat.ts:gainXp`, `units.ts:spawnUnit`,
`units.ts:unitsHostile`. `units.ts` no longer imports `isBarbSeat` at all —
every barbarian branch in that file was a capability wearing an identity's
clothes. The ones that stay ARE identities: `state.units.filter(isBarbSeat)`
asks *which units are the barbarians'*, and rewriting it through the table
would make the table mean "barbarian", which is exactly the coupling it breaks.

GPU: the same two bits, resolved where this engine branches. `atk_kind ==
"barb"` was a PYTHON-level branch picking a whole code path, so the cap is a
dict lookup at that granularity — building a `[BARB_SEAT+1]` tensor to gather
would add dispatch (#57: 83% of a step at B=12 is already dispatch) to answer
a question a dict answers free. The tensor-level `torch.where(is_barb, 0, ...)`
gates stay: two of them mask an INVALID GATHER (a barb defender's `vslot` is
-1, clamped to 0, so it would read rival slot 0's xp), which is a bounds guard
and not a capability. The third one's comment claimed to be "belt and braces
rather than load-bearing" — a claim nothing checked. `_check_seat_invariant`
checks it now, so "a barb slot holds no xp" is proven every step under
`CIV6_ALIAS_CHECK=1` instead of asserted in prose.

Lane: `tests/seat-caps.test.ts`, 6 cases, every one with its negative twin (a
capability table's failure mode is answering the same thing for everybody).

---

**S6.12 — `seatOf` becomes TOTAL. DONE.**

`seatOf(state, seat)` was `state.seats[seat]`. That array holds the player at 0
and the rivals at 1..R, so for a MINOR seat (100+) or the BARBARIANS (200) it
returned `undefined`, silently. **Half the seat space had no seat object** —
generic code written against `Seat` could not run for two of the four classes,
which is this task's asymmetry expressed in the type system.

* `CityState extends Seat` — a minor carries the same civ-level state everyone
  does, at zero. Not padding: a total function needs a value of the right TYPE
  for every id, and S6.11's rule says the zero is the RIGHT answer (a minor
  banks nothing and researches nothing), not a missing one.
* `GameState.barbSeat` — one Seat for the hostile class, same reason.
* `emptySeat(id)` — the ONE constructor. Three copies of a 700-character inline
  literal (`deserialize`, `createGameFromMap`, `tests/helpers.ts`) collapse
  into it, so a field added to `Seat` can no longer be added to two of three.
* `allSeats(state)` — every actor in seat order, the same order `_seat_row`
  uses on the GPU.

**Storage is deliberately NOT merged.** `state.cityStates` stays the minor
storage and `state.seats` the major storage. One absolute-indexed array would
carry holes at 2..99 and 101..199 — 194 `null`s through `JSON.stringify` in
every save — and the mandate asks that a reader cannot tell the classes apart,
which is a property of the TYPE and of `seatOf`, not of which array the object
sits in.

GPU: nothing. It already has the total seat INDEX (`_seat_row`, `NS`) and the
minors' cities in the shared block (S6.2). Its per-seat scalar planes stay
`[B, 1+R]` until a rule reads a minor's treasury — a plane with no reader is
memory, not unification.

---

**S6.13 — the barbarians hold their camps. DONE.**

`GameState.barbCamps` was a global list of tiles belonging, in fact, to one
actor — the same shape mistake as `GameState.cityHp` and `GameState.rivals`
(S1.3j). `camps` joins `Seat` (empty for every other class, which is the right
answer and not a missing one, so it is data and not a thirteenth cap bit) and
the barbarian seat holds the game's camps. 32 readers re-homed.

The payoff is `clearCampFor`, which opened `if (isBarbSeat(unit.seat)) return;`
— an identity test standing in for a rule. The rule is *you do not clear your
own camps*, and with the camps on a seat and `seatOf` total it is now sayable:
`if (seatOf(state, unit.seat) === state.barbSeat) return;`.

Camps STAY A LIST of tile indices. They are not cities — no population, no
queue, no borders — and promoting them to cities to make the shape uniform
would invent mechanics neither engine has.

**A save-migration trap, caught by its own lane.** The first migration read
`state.barbSeat.camps ??= legacy ?? []`, which never fires: `emptySeat` has
already put an EMPTY ARRAY there and `[]` is not nullish, so every camp in a
pre-move save was silently dropped. The legacy field is read BEFORE the seat is
built now. Same family as `[[boolean-to-comparison-precedence]]` — `tsc` and
485 tests both passed the broken version.

Lane: `tests/seat-total.test.ts`, 9 cases (totality with six DISTINCT objects,
`allSeats` ordering, save round-trip, the pre-move save, a reloaded minor).

---

**S6.14 — §7 item 12, the half that is free. DONE.**

The per-turn refresh healed every unit through a THREE-ARMED branch:

| class | rule |
|---|---|
| player | own centre 20 / own land 15 / neutral 10 / foreign 5 |
| rival | own centre 20 / own land 15 / neutral 10 / foreign 5 |
| barbarian | own camp 20 / — / neutral 10 / foreign 5 |

The first two are the SAME RULE written twice: for a player unit
`isPlayerSeat(tileSeat(t))` and `tileSeat(t) === unit.seat` are the same
predicate, because its seat IS `PLAYER_CIV`. The third stops being special once
the camps belong to a seat (S6.13). One rule covers all three — *own centre 20,
own land 15, own camp 20, neutral 10, foreign 5* — because the terms that do
not apply to a class are EMPTY for it: a major holds no camps, the barbarians
hold no land. Data, not a class branch; the same test that keeps the capability
table at two bits.

**It could not have been written before this round.** "Is this MY land" was
three different planes on the GPU — `owner`, `rival_at`, `cs_at` — and each arm
asked a different one. S6.8–S6.10 collapsed them into `tile_seat`, so the
question has one form for every seat, and `_seat_heal` is that form. The pools
stay three (the FORTIFY loop's shape, which S3.2 landed in this same block);
merging them into the single unit pool is #57's op-count win, not this slice's.

The barbarian phase's MP reset also joined the one contract. It read the unit's
raw `UNITS[type].moves` and left `movesFull` alone — the only MP reset in either
engine that bypassed `unitFullMoves`. Value-identical today (a barbarian holds
no golden dedication and never embarks) and a divergence waiting for the first
rule that gives the hostile class either.

Fixtures BYTE-IDENTICAL across both halves, which is the proof that "the three
arms were one rule" was a claim about the code and not about behaviour.

**WHAT §7 ITEM 12 STILL OWES, and why it is not here.** The decision also said
each seat should refresh at the start of ITS OWN phase — real Civ 6 refreshes a
civ when its turn begins, which is what `seatPhase`/`barbarianPhase` already
half-do. Moving the CALL SITE is a BEHAVIOUR change, not a representation one:
`refreshUnits` heals and fortifies as well as resetting MP, so a rival healing
in its own phase heals AFTER the player's attacks instead of before, and its HP
differs mid-turn. That is a Round 7 B-stage with a declared logdiff delta
(§9 stop-condition 2), not something to land inside an R-stage. Round 5's
"value-identical today" was true of the MP reset alone; the heal is coupled to
it and is not.

---

# ROUND 7 — RECONCILIATION (behaviour merges, one named channel each)

**S7.2 — a reclaimed slot handed on the drowned unit's movement pool. DONE.**
A PRE-EXISTING GPU bug, found while hunting a forced-compaction red that S7.1
EXPOSED but did not cause. Every spawn site computed movement BEFORE clearing
the slot's embarked flag:

    _m = self._full_mp(pre)[rows, slot]     # READS <pre>_emb
    self.<pre>_emb[rows, slot] = False      # ...three lines too late

`_full_mp` overrides an embarked unit's pool to the flat EMBARK_MOVES, so a
unit spawned into the slot of one that DROWNED started on 2 MP instead of its
type's moves plus any golden dedication. TS cannot have this: `spawnUnit`
builds a NEW object with `movesLeft: def.moves + goldenMoveBonus(...)` and no
embark term. All four spawn paths had it; the BARBARIAN pool never cleared
`emb` at all — the sibling the guard was missing from entirely.

It needs SLOT REUSE, and slot reuse needs a compaction, which is why only the
forced-compaction gate could see it. Lane `gpu/tests/spawn_reclaim_test.py` poisons
the next slot with a drowned unit's residue; verified to FAIL pre-fix.

THREE HYPOTHESES DIED ON MEASUREMENT during the hunt, and recording them is the
point: the route cache (identical divergence with it disabled), float
associativity (state bit-identical for 162 turns, then a clean 60), and the
raid arm itself (its mask output identical). An early split reading
"strike-only is green, so the raid is the cause" was WRONG for the reason
[[trajectory-bisect-lies]] names — the raid STEERS the rollout, so removing it
makes the seed play a different game that never reaches the bug.

---

**S7.1 (task #59) — a rival's war with another rival becomes a real war. DONE.**

One named channel: **rival↔rival wars now reach the two mechanics that ignored
them.**

| mechanic | what it did |
|---|---|
| walls / Encampment STRIKE | a rival city fired at the player and at barbarians, never at an enemy RIVAL's units |
| trade route RAIDING | a rival's routes were suspended by barbarians and at-war PLAYER units, never by an enemy RIVAL's |

Both predate A-19 (which made rival↔rival war real) and both said so in their
own comments; `RIVAL_RIVAL_RAIDS_LIVE = false` was the same gap with a flag on
it, left by S2.3 for exactly this round. The engines AGREED, so no gate caught
it — a fidelity gap against Civ 6, which the owner's directive makes the source
of truth over the TS oracle.

VERIFIED BEFORE IMPLEMENTING, against a real source rather than the task text:
a Civ 6 city with at least Ancient Walls gains a ranged strike, and it targets
**the weakest modified-strength unit within range** — a rule about combat
strength with no term for which enemy the unit belongs to.
`civilization.fandom.com/wiki/City_combat_(Civ6)`. (Our engines target
nearest-then-lowest-index rather than weakest. That is a pre-existing
difference, out of this slice's scope, and is NOT adopted as correct here.)

REACHED, measured: **4 of 12 gate seeds move.** Lanes: `gpu/tests/rr_strike_test.py`
(builds the configuration by hand; 24 damage at war, 0 at peace — and it FAILS
against the pre-fix engine, verified by reverting the two lines) and
`tests/rival-rival-war.test.ts` (the shared predicate plus three negative twins:
a neutral third rival, a rival's own unit, the unchanged player arm).

**WIDENING THE TARGET SET CREATED TWO LATENT BUGS** — [[measure-every-path]].
Once a rival can be the target, every term written for the old set is wrong:

1. **Support side.** `_flank_support` takes the defender's seat and the
   player's own strike sites already pass `d_seat`; the two rival sites
   hand-built a `BARB_SEAT if is_barb else PLAYER_SEAT` BINARY, so a struck
   rival counted the PLAYER's adjacent military as its own support.
2. **Defender aura civ.** Hardcoded to 0 (the player), so a struck rival would
   have been shielded by the PLAYER's Great General.

TS had both right all along (`supportCount(state, bestTile, defender)`,
`generalAuraCS(state, defender, ...)`), so no gate could have flagged them
before the widening — they only become wrong the moment a rival is eligible.

**THE HUNT, and the process failure that caused it.** Parity went red at seed
9040 t158 with a 1-HP delta on a rival city, `rng` still matching for 57 more
turns — a VALUE difference, not a draw-count one. Two hypotheses were checked
and DISCARDED rather than built on: the old `war` term binds cleanly to
`r_atwar[:, r]` (the player arm is untouched), and the GPU's besieged test is
already rival-symmetric (S3.4b) despite the HP direction fitting that story.
Reverting the raid hunk alone reproduced t158 exactly, which localised it to
the strike. Matched probes on both engines, tagged by seed, then split the CS
into its terms and every one agreed except `sup` (TS 1, GPU 0).

The cause was fix (1) NOT BEING IN THE FILE. Its codemod accumulates edits in
memory and writes once at the end; a later `sub()` raised on a comment whose
`→` had been transcribed as `->`, so the run wrote NOTHING — after having
already printed `x2` for the `_flank_support` substitution. **A codemod's
progress output is not evidence of a write.** Grep the changed line before
spending a gate run.

---

### ROUND 6 — original plan

Widen to `NS = 1+R+S+1`. Delete the `cs_*` family and `src/core/types.ts:CityState`. A city-state is a `Seat` with `cls=Minor`, one `City`, `caps` minus research/found/expand/victory plus `suzerainable`. The barbarian is one `Seat` with `cls=Hostile`, `caps.alwaysHostile`, no diplomatic row; `barbCamps`/`camp_tile` re-home onto it and **stay a camp list**.
Fold CS combat into the shared path: `cs_hp`/`CS_MAX_HP=150` → `city_hp`/`CITY_MAX_HP=200`; `combat.ts:attackCityState`'s literal `15 + cs.population + (militaristic ? 6 : 0)` → `cityDefenseStrength`; the unconditional +10/turn CS regen → the besieged-gated +20 heal; city-states gain the walls/Encampment strike they have never had (there is no `csstk` damage key anywhere). `combat.ts:attackTargets`' three mutually exclusive CS arms (`csPlayerWar` needing `cs.atWar`; `csWar` needing the player to be suzerain; barbarians having **no arm**) become one "at war with seat X" test. `phase.ts:levyUnits`' hardcoded `spawnUnit(..., 'player')` takes a seat.
Collapse the CityState scalar/parallel-array pairs (`envoys` vs `rivalEnvoys[]`, `met` vs `rivalMet[]`, `quest` vs `rivalQuest[]`) into one `[seat][cs]` relation.
**Surfaces a latent:** `engine.py:_city_state_phase` does `cs_met |= cs_alive` ("meeting (instant, fog off)") while `cityStates.ts:cityStatePhase` gates on `fog.ts:isExplored`. The gate only passes because fixtures run fog off. One meeting rule must be picked here.
*Gate:* re-export at 24; parity 0.0; rollout; `cs_verbs`/`cs_war`/`cs_bonus`/`domination`/`encampment`/`occupancy` standalone. **Every CS/barb rule change is a fidelity claim — verify against a real Civ 6 source first (§7).** Record the reachability count for CS bombardment in the AUDIT entry. **ROUND 6 BATTERY.**

---

### ROUND 7 — Behaviour reconciliation *(one delta per sub-stage)*

Each sub-stage: **verify against a real Civ 6 source → declare the delta → implement → re-export → parity first and alone → rollout → the reaching lane → `logdiff` showing only the declared columns.** One battery **at the end of the round**, never per sub-slice.

1. **Merge `computeCityStats` ← `rivalCityYields`** (the deferred Round 2 item), parameterised by `ownsTile` / `citiesOf` / `getModifiers(seat)` / `tradeRoutesOf` / citizen policy.
2. **Citizen science/culture inside the amenity-tier and government scaling for every seat.** Today the rival's term is added *outside* the scaling, so an unhappy rival keeps 100% of its citizen science. **Not recorded in `gpu/AUDIT.md`.**
3. **`rivalHousing`'s missing per-city `ownerCity` clause** — the un-swept sibling of A-23 (which measured 1719 double-counted tiles across 24 gate games for the worked-tile twin). Two adjacent rival cities both bank the same FARM's 0.5 housing.
4. **The dropped multiplier channels for non-player seats**: `yieldMult`, `adjacencyMult`, `buildingYieldMult`, `districtYieldAdd`, `housingAll`, `housingIfDistricts`, `newDeal`, `amenitiesAll`, `encampmentProdMult`, wonder regional amenities, and `eras.ts:goldenCulturePerDistrict`/`goldenProphetPoints`/`goldenBoostBonus` (all three **take** a civ parameter and are called only with 0). All reachable: `data/policies.ts:GOVERNMENTS_ADOPTION_LIVE = true`.
5. **The CS channel residency flag** from S2.2, flipped.
6. **Real multi-item queues** for every seat: encampment multiplier, `productionBank`, overflow carry, multi-completion. Invalidates `phase.ts:tryQueueRivalBuilding`'s "the district must already be COMPLETE" precondition and reshuffles the whole `seatPhase` pick ladder.
7. **`builderCost`'s queued term**; **`tilePurchaseMult`** (whose omission in `rivalTilePurchaseCost` carries an explicit in-code note that it is a deliberate two-engine agreement — **paired TS+GPU change**).
8. **War weariness surprise/formal multipliers for seat 0** (`WW_SURPRISE_MULT`/`WW_FORMAL_MULT`); the player currently accrues at a flat ×1.
9. **Chop/harvest for every seat** (`economy.ts:chopGrant`/`harvestGrant`/`applyLumpYield` are structurally player-only).
10. **Ranged dispatch**: merge `combat.ts:rangedAttack` ← `hostileRangedStrike`; fix `rlenv.ts:autoMilitary` calling `meleeAttack` unconditionally on targets up to `def.ranged.range` (so a player ranged unit currently does nothing in the RL/eval path); lift `attackTargets:828`'s `const cityRange = unit.owner === 'player' ? range : 1`.
11. **Faith-purchase verb for seat 0** — which makes `theologicalCombat`'s currently-capture-only player branches routinely live.
12. **`markAntiquitySite` via `combat.ts:killUnit` at every death site.** `phase.ts` calls raw `disbandUnit` at 3311, 3350, 1583, 1584, 3455, so B-20 antiquity sites are created only on player-city kills.
13. **Barbarian veterancy and barb civilian capture** (the S3.3 cap flags), and **goody huts for non-player seats** (`fog.ts:claimGoodyHut` + the `walkPath` gate) — **the second permitted draw-count change; alone in its commit.**
14. **LAST, alone: the city-state quest rule.** `cityStates.ts:issueQuest` burns two RNG draws; `phase.ts:issueRivalQuest` is deliberately zero-draw. Unifying changes the draw stream for every seed from first contact onward. **The `rng` trace column is the intended tripwire — diff the intended draw-count delta against the observed one.** `SEED_OVERRIDES` in `scripts/export-gpu.ts` must be re-derived by hand after any sub-slice that changes whether a seed leaves the player cityless by turn 250, and the orphan sweep at the bottom of the exporter must run.

**ROUND 7 BATTERY** (once, at the end).

---

### ROUND 8 — RL interface and the oracle over every seat [B]

**S8.1 — One mask surface.** `masks(seat)` / `observe(seat)` / `step(actions_by_seat)`. Delete `rival_masks`, `rival_unit_mask`, `rival_slot_map`, `apply_rival_actions`, `_apply_rival_unit_actions`, `BatchEnv._observe_rival` (with its documented zero-fills for treasury/envoys/influence and `torch.ones` loyalty), `BatchEnv.masks`' `if seat != 0` branch and its `prod = m['production'][:, : s.C]` truncation (which today leaves a controlled rival's cities in slots 6..23 with **no action column**). Merged production code space adopts the **rival** encoding (it is the superset — it has wonders and projects the player's `current` space lacks), so seat 0 can queue a wonder in-engine for the first time. `war_mask [B,2R]` → symmetric `diplo_mask [B,NS,K]`, killing the seat-dependent column meaning (col 0 = "rival 0" for the player, "THE PLAYER" for a rival; cols 1..R-1 structurally dead). `self.controlled` → `seat_external [B,NS]` gating **every** column uniformly (today it gates only the purchase columns inside `rival_masks`). `duel.py:DuelEnv` + `melee.py:MeleeEnv` → one `SeatEnv`, preserving the rival-choices-applied-first-then-world ordering contract.
**S8.2 — The oracle gains a seat axis.** `gpu/rollout.py` drives and logs **all** seats; `scripts/replay-gpu.ts` gains rival production / rival unit / diplo dispatch and stops re-running `createGame({rivals, cityStates})` to reconstruct rivals by determinism. This is the payoff: today `_apply_rival_unit_actions`' own docstring says "(off the parity path — controlled is empty in the gates)", so the rollout proves rival *determinism* and never rival *controllability*.
**S8.3 — Trainer + TS RL.** Delete `N_UNIT_ACTS`, `stack_seat_masks`, `split_actions`, `fit_env_to_checkpoint`, `load_compat`; seats become batch rows through one head set. Fix `split_actions` silently discarding seat 0's sampled war action after charging its log-prob and entropy into the PPO objective. Delete `rlenv.ts:CivEnv`/`runEpisode`/`linearPolicy`/`FEATURE_VERSION` (a *different* interface, not a mirror — sequential `PendingDecision` over variable-length `Candidate[]`, no unit head, no war verb, one seat, and **not on the parity path**), keeping `applyEnvAction`/`envCandidates` as a UI-advisor shim over the exported action enum for `aiAdvisor.ts`, `policy.ts`, `main.ts`, `ui/panels.ts`, `scripts/evaluate.ts|train.ts|rl-bridge.ts|rl-worker.ts` and `tests/rlenv.test.ts|policy.test.ts|aiadvisor.test.ts`. Promote `EnvAction`'s `settlerAt` tile choice into the unified enum — the GPU cannot choose a settle site on any seat today.
*Gate:* re-record `rollout.json` with seats 0 and 1 driven; replay 72/72 for **both**; `gpu/tests/seat_test.py` upgraded from `shape == oa.shape and not isnan` for seat 1 to real value equality against a seat-0 mirror game; `controlled`/`duel` promoted from poke lanes to primary gates; the `unit_head` lane from S0.3. **ROUND 8 BATTERY**, then **ONE eval baseline pass** — the first since the migration began (per `[[no-per-stage-baselines]]`, there is no re-baselining before this point). **Only then does P8 unpark.**

---

## 6. Start here — S0.1 in coding detail

Everything below was read this session. Start with the file that has no dependencies.

**Files:** `scripts/gpu-trace.ts`, `scripts/export-gpu.ts`, `scripts/replay-gpu.ts`, `gpu/parity_test.py`, `gpu/civ6gpu/engine.py`.

1. **`scripts/gpu-trace.ts`** (184 lines, the whole file).
   - Replace the inline `const row = [...]` literal in `traceRow` (lines 43–72) and the four `row.push(...)` blocks (73–166) with four exported const tables:
     ```
     const HEAD_COLS:      { name: string; tol: 0|2; get(state: GameState): number }[]
     const PER_CS_COLS:    { name; tol; get(state, csId) }[]
     const PER_RIVAL_COLS: { name; tol; get(state, rival|undefined) }[]
     const PER_CITY_COLS:  { name; tol; get(state, city|undefined) }[]
     ```
     `traceRow` becomes a map over them; the dead-slot zero-fills (lines 79, 88, 152) become "call `get` with `undefined`".
   - Add `export function traceColumns(cMax, csMax, rMax): { names: string[]; tol: number[] }`.
   - **Delete `rowTolerance`** (line 171). Its only consumers are `scripts/replay-gpu.ts:42` (import) and `:108` (`const tol = rowTolerance(C, csMax, rMax)`) — repoint to `traceColumns(...).tol`.
   - Delete the stale comment block at 172–178 ("HEAD is 24 … HEAD is 25 now … Each rival is 19 … = 20"). Real widths: HEAD **28**, per-rival **23**, per-CS **3**, per-city **9**.

2. **`scripts/export-gpu.ts`** — line 132 already imports `traceRow`. Add `traceColumns` and emit a new `rules.trace = { head: [{name,tol}], perCs: [...], perRival: [...], perCity: [...] }` key next to `rules.civs` (line 533) / `rules.scenario` / `rules.rivals`. Seed fixtures must not change: the emitted `trace` at line 1903 is the same numbers in the same order.

3. **`gpu/civ6gpu/engine.py`** — add `BatchSim.trace_columns()` next to `trace_row` (15056). Generate the names from the **same** structure that builds `cols` (15063) so the two cannot drift; the cheapest correct form is to make `trace_row` build `(name, value)` pairs internally and have `trace_columns` return just the names.

4. **`gpu/parity_test.py`** (104 lines) — delete `HEAD` (23), `PER_CS` (27), `PER_RIVAL` (28), `PER_CITY` (29) and the hand-maintained `atol` literals inside `columns()` (42, 48, 51). Replace with: load `rules.trace`, build names+tol from it, call `sim.trace_columns()`, **assert the two lists are identical**, and index tolerance by name. Keep the mismatch print format at line 87 byte-for-byte — hunts parse those lines.

5. **`scripts/replay-gpu.ts`** — lines 42/108 as above.

**Gate for S0.1:** `npx tsc --noEmit` → `npx vitest run` → re-export and confirm the seed fixtures are **byte-identical** by the hash procedure in section 2 (only `rules.json` moves — it gains the `trace` key). `git diff` on `gpu/fixtures/` is VACUOUS; the fixtures are untracked → `python gpu/parity_test.py` (PARITY OK) → `python gpu/rollout.py` + `npx tsx scripts/replay-gpu.ts` → `python gpu/battery.py`.

**If `seed*.json` moves at S0.1, stop.** The table refactor changed a value; find it before doing anything else. That is the whole reason this stage exists.

---

## 7. The DECISION list — items no capability bit can resolve

These are **game-rule** differences, not disabled rules. Each must be **verified against a real Civ 6 source before implementation** — never off `gpu/AUDIT.md` residual text, a brief, or a code comment (round #70 caught two fabricated premises that way). Reachability is never a licence to deviate: "the faithful rule fires less often in our gate" is not an argument.

| # | Decision | Where it lands |
|---|---|---|
| 1 | City-state **quest issuance**: 2 RNG draws (`cityStates.ts:issueQuest`) vs zero-draw (`phase.ts:issueRivalQuest`). | S7.14, alone |
| 2 | **Citizen assignment**: manual specialists + focus + locks vs auto merged ranking. Real Civ 6 auto-assigns with human override → make the auto-merge the base and layer focus/locks on top. | S7.1(v) |
| 3 | **Settler bank + pre-baked site list** (`GameState.settlers`, `plannedSettles`, `KS`/`site_*`/`next_site_ptr`) vs immediate found + live scan. TS founds rivals instantly. | S4.1 |
| 4 | **Queue depth**: multi-item with overflow vs single-slot with discarded overflow. | S7.6 |
| 5 | **City-state meeting**: fog-gated (TS player) vs proximity (rival, both engines) vs instant (`engine.py:_city_state_phase`). Three rules, two engines. | S6 |
| 6 | **War weariness rate**: flat ×1 (player) vs surprise/formal multipliers (rival). | S7.8 |
| 7 | **`tilePurchaseMult`**: applied (player) vs deliberately dropped (rival, with an in-code note calling it a two-engine agreement). | S7.7 |
| 8 | **`builderCost`'s queued term** vs the rival's inline `Math.round((50 + 4*buildersTrained) * GAME_SPEED)`. | S7.7 |
| 9 | **`greatPeople.earned`**: one shared array vs per-seat + a global denial set. | S1.2 |
| 10 | **Government**: stored state (player) vs pure function of research (rival, `effects.ts:computeAdoption`). Decision: store on every seat. | S1.2 |
| 11 | **City-state combat**: HP 150 vs 200, unconditional +10 regen vs besieged-gated +20, no ranged strike at all. | S6 |
| 12 | **The double MP reset** — **DECIDED (Round 5)**: not an artefact. Civ 6 refreshes a civ at the start of ITS turn, so `seatPhase`/`barbarianPhase` are the faithful resets and `refreshUnits`' all-units sweep is the odd one. **S6.14 landed the free half** (one heal rule, no class branch; the barb MP reset on the shared contract — byte-identical). The CALL-SITE move is a behaviour change and is **not** value-identical: `refreshUnits` heals and fortifies too, so a rival refreshing in its own phase heals AFTER the player's attacks. | S5 decided, **S6.14 (repr.)**, **R7 (behaviour)** |

---

## 8. What will be temporarily unverifiable, and how confidence is regained

**(a) Between a TS-side representation change and its GPU counterpart.** Mitigated to near-zero by design: Rounds 1–2 keep fixtures byte-identical, so there is no window at all for the TS half. The only genuine paired change is S3.3 (B-31 splice removal), which is one commit landing both sides together.

**(b) The forced-compaction exemption evaporates.** `[[verify-loop-cost]]` rule 8 restricts the forced-compaction gate to slices touching units/pools/slots/spawn-death-capture. S3.2, S3.3, S3.4, S4.1, S5.2 and S6 all touch exactly that. Budget the full ladder for those six.

**(c) Checkpoints die at every re-export stage.** `gpu/fixtures/ckpt/gpu_<rng>_t<N>.pt` is keyed on `_MUTABLE` (~190 names, engine.py:360) and `BatchSim.restore` / `gpu/rollout.py --resume-t` break in the same commits that create the need to bisect — and checkpoints are the **primary** hunt tool (`[[verify-loop-cost]]`: diagnosis starts from checkpoints, not `--log` reruns). **Rule: every re-export stage re-records checkpoints as part of the stage, not after.** Otherwise the first red after that stage costs a full logged rerun instead of seconds.

**(d) The rival action surface has no TS oracle until S8.2.** It has none today either (`gpu/tests/seat_test.py` and `gpu/tests/controlled_test.py` are poke lanes, and `seat_test` only asserts `shape ==` / `not isnan` for seat 1). Interim confidence comes from S0.2's per-rival-city trace columns plus keeping those two lanes green standalone at every stage.

**(e) Trained checkpoints.** Everything in `gpu/runs/` dies at S0.3. **No loss:** `train_ppo.Policy` + `sample_heads` already raises `RuntimeError: 26 vs 17` against the live engine, so no working unit-capable checkpoint exists to protect. P8 stays parked until after S8's eval baseline, consistent with `[[engine-pivot]]`.

**(f) Perf.** Non-contiguous views land on hot gather/scatter paths at S3.3/S3.4/S4.1, and S5.2 multiplies the applier cost by K. Budget **5% per stage** measured by `gpu/tools/profile_step.py` **on an idle box** (never a contended one). If a view is hot, reorder the merged plane's axes so the hot axis is last. The battery is already 420–584s with gpu-gate/parity/mcts as the walls; expect >600s post-S5.

---

## 9. Stop conditions and escape hatches

State these up front so they are decisions, not retreats:

1. **If S0.2's trace width makes parity unaffordable** → fall back to per-city checksums for pure-sum columns only (`rFollowedSum` is the precedent), keep full columns for everything that can cancel. Decide on the measured number, not on feel.
2. **If a Round 2 twin needs >3 divergence flags** → do not force byte-identity. Leave the twin unmerged, move it to Round 7 as a declared behaviour merge. This is the rule that prevents Round 2 from becoming one enormous red slice — the failure mode that kills Candidate A's S4.
3. **If the GPU alias-check lane goes red** → stop the round. A detached rebind means some write has been silently lost since the last green run; bisect the round's commits before adding anything.
4. **If a stage's `logdiff` shows a line outside its declared allowed-delta set** → it is a regression, not a re-baseline. Do not update the baseline. This rule is the whole plan's answer to the circularity objection; suspending it once forfeits it entirely.
5. **If the capability table wants a 13th bit** → that mechanic is a DECISION (§7), not a capability. Route it to Round 7.
6. **If Rounds 3–4 slip badly** → the honest alternative is a big-bang rewrite of `gpu/civ6gpu/engine.py`'s state block against the (by then already-unified and byte-identical-proven) TS reference, paying one long parity hunt instead of many short ones. The TS-first ordering is deliberately chosen so that this escape stays available: after Round 2, the TS engine **is** a complete, verified specification of the unified model, and the hunt tooling (checkpoints, `logdiff`, `statelog`) is unusually good at localising one big divergence. Do not grind inert GPU stages because the plan says so.

---

## 10. Summary table

| Round | Stages | Type | Fixture impact | Battery |
|---|---|---|---|---|
| 0 Gate hardening | S0.1–S0.4 | R, B(schema), B(pillage), R | S0.2 widen (24 seeds), S0.3 re-record rollout | 1 |
| 1 TS seat model | S1.1–S1.3 | R R R | **byte-identical** | 1 |
| 2 TS de-duplication | S2.1–S2.4 | R R R R | **byte-identical** | 1 |
| 3 GPU units | S3.1–S3.4 | R, B(rules), B(order), R | S3.2 rules.json, S3.3 re-export | 1 |
| 4 GPU cities/scalars/war | S4.1–S4.3 | B(dtype), R, R | S4.1 re-export | 1 |
| 5 Movement points **DONE** | S5.1, S5.2a/b, S5.3 | R, B, R, R | no re-export needed; rollout re-recorded | 1 (399s green) |
| 6 CS + barbarians | S6 | B | re-export | 1 |
| 7 Reconciliation | S7.1–S7.14 | B ×14 | one re-export each | 1 (at end) |
| 8 RL + oracle | S8.1–S8.3 | B | rollout schema | 1 + eval baseline |

**Total: 26 stages, 9 batteries, 5 rounds that touch fixtures, 2 permitted draw-count changes, ~~12~~ **2** capability bits, 12 fidelity decisions.**

The bit count is the plan's own admissibility rule doing its job: ten of the
twelve proposed bits are answered by data the seat already carries, and S6.11
records each with the datum that answers it rather than carrying a flag that
restates it. §9's stop condition 5 (a 13th bit means the mechanic is a
DECISION, not a capability) still stands and now has ten bits of headroom.

The single most important line in this document: **an R-stage that goes red is always a real bug, and a B-stage that moves a `logdiff` line outside its declared set is always a regression.** Everything else is scaffolding around those two properties.