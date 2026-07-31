# ROUND 7 — IMPLEMENTATION ORDER (#51 UNIFY SEATS)

Source: `C:/civ6-development-calculator/gpu/UNIFY_SEATS_PLAN.md` §7 (decision list) + §5 "ROUND 7" (sub-stage list). Every row below was re-checked against the adversarial review, not the research report alone.

---

## 1. DECISION TABLE

Verdict = which engine/seat is faithful. "Citation survived" = the review could re-fetch the quote at the cited URL **and** the ruleset matched Gathering Storm.

| # | Decision (named channel) | Verdict | Citation survived review? | Conf. |
|---|---|---|---|---|
| §7-1a | CS quest **district target** — random specialty vs `CS_TYPE_DISTRICT[cs.type]` | **Player shape right; RIVAL wrong** | YES — `Module:Data/Civ6/Base/Quests` via `api.php?action=parse`, verbatim `"Construct a randomly selected specialty District type"`; GS/RF modules byte-identical | **HIGH** |
| §7-1b | clearCamp **radius** `<=6` → `<=5` | Both engines wrong | YES — `QUEST_CLEAR_BARBARIAN_CAMP` name string, verbatim | **HIGH** |
| §7-1c | **Which quest kind** is picked (uniform over valid pool) | — | NO SOURCE EXISTS. "randomly selected" is scoped to the district *inside* one quest type, not to the choice among quest categories | **UNVERIFIABLE** |
| §7-1d | **Camp pinning** (nearest vs `find` array order) | — | Sources CONFLICT (Civilopedia "one … within 5" = any; wiki "lost if anyone else destroys **it**" = pinned) | **UNVERIFIABLE** |
| §7-1e | War **cancels quests**; envoys removed | Both engines wrong (`declareWarOnCityState` does neither) | YES — but review corrected it: quest cancels **both** directions, envoys stripped **only** on a self-declared war | **HIGH** |
| §7-1f | Issuance on **meeting + era change**, not a 12-turn cooldown | Both engines wrong | YES — wiki + CivFanatics 623658 corroboration | **HIGH** |
| §7-1g | clearCamp credited to the **destroyer only** | Both engines wrong | YES — but needs a camp-destroyer attribution channel neither engine has | **HIGH (rule) / new channel** |
| §7-1h | Widen the askable pool to all **specialty** districts | Player pool is 4 | YES, but the report's implied roster is wrong: `PLACEABLE_DISTRICTS` includes AQUEDUCT + NEIGHBORHOOD, which are **not** specialty — must filter on `countsTowardLimit` | **MEDIUM** |
| §7-2 | **Citizen assignment** (specialists/focus/locks vs auto merged ranking) | claimed "rival = base, player = override" | **NO — two fabricated citations.** The "locking is the override" thread is a **Civilization V** thread and does not contain the quoted sentence | **UNVERIFIABLE** |
| §7-3a | **Settler bank** for every seat; pop cost on the rival; one `settlerCost` | **PLAYER right, rival wrong** | YES — `Settler_(Civ6)` exact-phrase ("built or purchased … Population is lowered by 1", "consumed in the process"); `City_(Civ6)` + CivFanatics 4-hex min | **HIGH** |
| §7-3b | Founding on **your own** territory legal | claimed player right | Absence-of-evidence only; and the case is a repo-only artefact of `BORDER_MAX_RADIUS = 5` (real Civ 6 never owns past ring 3, so with a 4-hex minimum it cannot arise) | **UNVERIFIABLE** |
| §7-3c | `settlerCost`'s **`+queued`** term | — | NOT SOURCED — and §7-8's source ("already produced") cuts against it | **UNVERIFIABLE** |
| §7-4a | Production **overflow discarded** at completion (all four impls) | **All four wrong** | PARTIAL — Feb-2019 official patch note verified verbatim ("Correct production overflow calculation so multipliers … get backed out of overflow"); but "**held** while nothing is selected" is a **forum poster misattributed to Ed Beach**. Corroborated by the Steam overflow-fix mod, contradicted by none | **MEDIUM** |
| §7-4b | **Queue depth** (multi-item) | TS player closer to Civ 6; GPU has none | PARTIAL — patch note has "Build Queue and Multi-Queue"; the "8 items" FAQ line is 403 and unverified | **MEDIUM** — keep as UI affordance, do **not** port to GPU |
| §7-4c | Bank holds **un-multiplied** production | — | NOT SOURCED (patch note says multipliers are backed out; no formula anywhere) | **UNVERIFIABLE** |
| §7-5 | **CS meeting** — proximity for every seat | claimed rival right | PARTIAL — `Diplomacy_(Civ6)` first-contact sentence verified verbatim via `?action=raw`; the "Reveal All vs Explore All" quote is **FABRICATED** (the cited page does not contain it) and, read literally, the real rule *supports* instant meeting under fog-off. `CS_MEET_RANGE = 3` on a **city** anchor is unsourced | **UNVERIFIABLE (as specified)** |
| §7-6a | WW **player/rival split** — one rule for every civ | **Both wrong (they agree with each other)** | YES — GS Civilopedia verbatim ("increased depending on the era **and if you declared war without using a Casus Belli**") + CivFanatics 623207 "It does apply to the AI" | **HIGH** |
| §7-6b | `WW_SURPRISE_MULT = 2` is invented (it is the **grievance** ratio 150/75) | Rival wrong | YES — real premium is 1.19→1.30, from two verbatim Era Base formulas | **HIGH** |
| §7-6c | Adopt the **era-scaled** formula (16 / +6·era / +3 surprise, ×16 rescale) | — | Verbatim-present, **but the thread is Oct-2017, pre-R&F** — vintage undisclosed by the report; one worked example in the report is misattributed | **MEDIUM** |
| §7-6d | `DECAY` held flat at 64 while accrual grows 16→52 | — | Undeclared side-effect; drifts from "reduces at a greatly increased rate" | **MEDIUM** |
| §7-7 | **`tilePurchaseMult`** applied on every seat | **PLAYER right; both rival impls wrong** | WRONG_RULESET as cited (well-of-souls is 2017, pre-R&F) — **repaired**: GS Civilopedia `policy_land_surveyors` confirms "Reduces the cost of purchasing a tile by 20%" | **HIGH** |
| §7-8 | **`builderCost` queued term** deleted | **RIVAL right; player wrong** | YES — CivFanatics 600489 verbatim `CostProgressionParam1="4"` / "number of unit **already produced**"; GS drift closed by thread 642334; third source (sullla) independently confirms the crux | **HIGH** |
| §7-11 | **CS combat** — HP 200, siege-gated +20 heal, wall-gated strike | claimed minor adopts major | **NO — headline quote FABRICATED** ("The city HP are always 200, while walls have their own separate HP pool" is not on the cited page), and the report's own primary source says city-states **do** have walls and **do** build districts, contradicting its own no-strike conclusion | **UNVERIFIABLE (as filed)** |
| §7-12a | **Heal moment** = end of round, after every seat has moved | **Both engines wrong (identically)** | YES — `Combat_(Civ6)` Healing section verified verbatim via MediaWiki API, including "will be more vulnerable" | **HIGH (citation) / spec REJECTED** |
| §7-12b | **Fortify tick** timing | — | Source is ambiguous ("in the last turn"); the only unambiguous text found is Civ **V** | **UNVERIFIABLE** |
| §7-12c | MP double-reset is value-identical today | Neither — a redundancy, not a divergence | code fact | **HIGH** |
| R7-10 D1/D6 | **Ranged/melee city-first precedence** (city takes the hit through its garrison) | **`hostileRangedStrike` right; PLAYER path wrong** | YES — CivFanatics 669378 fetched verbatim; GS Civilopedia confirms garrison → city *strength*, not a separate defender | **HIGH** |
| R7-10 D2 | Seat-generic city lookup (a barb archer can batter a **rival** city) | Both wrong | YES (absence of any asymmetric rule + walls damage table) | **HIGH — but DRAW-COUNT** |
| R7-10 D3 | rival↔rival ranged scope-out | **Not a Civ 6 rule** — deliberate repo scope-out | n/a | keep as an **explicit cap predicate** |
| R7-10 D4 | Religion attack adder on the player's city branch | — | The change is **measured red** (`combat.ts:445-452` records rollout seeds 9183/9235 going red on draw counts) and blocked behind #53 (GPU never sets the player's holy city) | **BLOCKED** |
| R7-2 (D2) | **Citizen science/culture inside the amenity tier** for every seat | **PLAYER right** | YES — `Amenities_(Civ6)` tier table + CivFanatics 669662 non-food composition (Prod/Gold/Faith/Sci/Cul) | **HIGH** |
| R7-3 (D4) | **`rivalHousing`** per-city ownership clause | **PLAYER right** | Quote **FABRICATED** ("All housing benefits accrue to the city containing the improvement" is nowhere on the web); re-citable to `Housing_(Civ6)` + the structural fact that a tile has one owning city | **MEDIUM** |
| R7-4 (D3) | **Dropped multiplier channels** for non-player seats (`yieldMult`, `adjacencyMult`, `buildingYieldMult`, `amenitiesAll`, `housingAll`, `housingIfDistricts`, `newDeal`) | **PLAYER right** | YES — `Government_(Civ6)` + GS-tagged CivFanatics 656927 (AI values Monarchy's housing) | **HIGH** |
| R7-4 (D3b) | Those channels missing on the **GPU for both seats** | Neither engine | code fact | **HIGH** |
| R7-4 (D5) | Wonder **regional amenities** for every seat | **PLAYER right** | Effect text verified on the **GS** civilopedia URL, but the merged rule's `citiesOf(seat)` narrowing is unsourced, and "+2 Loyalty" is not in the source | **MEDIUM** |
| R7-1 (D7) | Trade `founded` guard on Messenger-of-the-Gods | **PLAYER right** | correctness guard, no Civ 6 rule needed; not live | **HIGH (inert)** |

---

## 2. THE SLICE ORDER

One battery **at the end of the round only** (`[[verify-loop-cost]]` rule 6). Per-slice core ladder = `tsc → touched vitest → re-export → scripted parity FIRST AND ALONE → rollout`; forced-compaction only where noted (`[[verify-loop-cost]]` rule 8). Re-export slices re-record `gpu/fixtures/ckpt/*.pt` **in the same commit** (plan §8c).

---

### S7.7a — `builderCost` drops the queued term
- **Channel:** builder price escalator (`buildersTrained` only, every seat, every path).
- **Engines:** BOTH. TS `units.ts:builderCost` (+ take a seat arg), `rivals.ts` inline literals → shared call. GPU 6 sites: `production_mask`, `_apply_settlers_and_purchases`, `step` scripted `want_b`, `step` RL queue arm, `rival_masks`, `apply_rival_actions` ×3. **`_rival_phase` is already correct — do not touch.**
- **RNG draw count:** NO. GPU rng is counter-based (`masked_choice` = hash + masked argmax, no stream position); TS adds/removes no draw site. Not a draw-count stage.
- **Gate:** tsc + vitest + **re-export must be BYTE-IDENTICAL** (the cheapest tripwire in the whole round) + parity + rollout re-record.
- **Reach:** scripted fixtures do **NOT** reach it (`export-gpu.ts` never purchases and gates the queue on `!anyPlayerBuilder()` which covers queues, plus `city.isCapital`) → byte-identity **is** the proof. **Rollout reaches**: 375 queue + 39 purchase builder actions across 36/36 games; 8 same-turn double orders.
- **TWO MANDATORY SPEC CORRECTIONS** (the report's §3 as written ships a regression):
  1. Do **not** delete the `base_bq`/`prefix_b` block in `step`'s RL queue arm — it is also the **only** line that overrides the static roster price with the escalator. Deleting it prices every RL-queued builder at a flat 30 forever. Correct edit: `bq_n = self.builders_trained.unsqueeze(1)`.
  2. Do **not** delete `valid_u = valid_u & (ut != self._builder_idx)` — it is guarded by `_rl_purchase_active` and exists because builder queues are order-coupled with builder **purchases** (which increment `builders_trained` immediately). That coupling survives the merge; `gpu/purchase_test.py`'s +4 gap must stay green.
- Add a controlled-rival poke lane — that head has zero builder-price coverage today.

### S7.7b — `tilePurchaseMult` on every seat
- **Channel:** tile purchase price multiplier.
- **Engines:** BOTH. TS `rivals.ts:rivalTilePurchaseCost` → call the player head with `getModifiers(state, civOfRival(rival.id))` (the caller already builds that object one line **earlier**). GPU: `_gov_policy_mods` gains a 7th element `tpmult`; replace the literal `* 1.0` in the `_tile_buy_live` cost line.
- **RNG draw count:** NO. Neither tile-buy path draws (both picks are argmin).
- **Gate:** tsc + vitest + re-export + parity + rollout. **No `rules.json` schema change** — `tilePurchaseMult` is already exported and `LAND_SURVEYORS = 0.8` is already in the fixture.
- **Reach:** **scripted fixtures REACH it** — 221 rival tile purchases, **38 at mult 0.8**, across 5/12 seeds, first divergence **seed 9015 t159**. Lower bound: cheaper tiles clear `goldAffordable` sooner.
- **HAZARD (must be in the slice, not discovered later):** build the `tpmult` product in **float64**. `_pol_encamp`/`_gov_encamp` precedent uses `self.dtype`; `float32(0.8) = 0.800000011920929` into the float64 `_cost` line flips a 1-gold price → flips `_afford` → flips a trajectory, **in the battery's f32 lanes only**. Also add its `(x-1).abs().sum()` term to the `_gov_has_effects` guard or the channel is silently skipped.
- Rewrite `gpu/government_test.py:183`'s surrounding inertness comment and drop `tilePurchaseMult` from `export-gpu.ts`'s "TS-only" list. New poke lane: `cost(seat with LAND_SURVEYORS) == round(0.8 × cost(same seat without))`, both engines.

### S7.10a — ranged/melee **city-first precedence** for the player seat
> **ATTEMPTED AND BACKED OUT 2026-07-31 — not a scope cut, a sequencing call.**
> The TS half is ~6 lines and was written and green (tsc + 498/498 vitest):
> `meleeAttack`'s `rivalTarget`/`csTarget` arms drop their `enemies.length === 0`
> guard (the `enemyCity` arm never had one — that asymmetry IS the bug), and
> `rangedAttack`'s city block stops being gated on `enemies.length === 0`, with
> `if (enemies.length === 0) return no(...)` moved BELOW it so the garrison
> fall-through survives.
>
> **It is NOT shippable alone.** Player attack paths are structurally unreachable
> in scripted parity (`export-gpu.ts` never calls melee/rangedAttack), so fixtures
> stay byte-identical and PARITY STAYS GREEN while the ROLLOUT silently diverges.
> Both engines must land together.
>
> **What the GPU half actually requires** (read this session, so the next attempt
> starts here). The six player branches are mutually exclusive by construction,
> so BOTH sides of that exclusivity must move:
>   * `siege` (melee vs rival city), `r_sieg` (ranged vs rival city), `cs_hit`
>     (melee vs CS), `r_cs` (ranged vs CS) — DROP `(bslot < 0) & ~v_ok & ~rvc_ok`.
>   * `att` / `r_att` (vs unit), `r_civ` (ranged vs rival civilian) and `civk`
>     (civilian capture) — ADD `& ~city_here`.
>   * `city_here = rc_ok | cs_centre_here`, where
>     `cs_centre_here = (cs_s >= 0) & (cs_center[cs_sc] == tgt) & cs_alive[cs_sc]`.
>   * **The blocker:** `cs_s`/`cs_sc` are defined ~230 lines BELOW `siege` and
>     `att`, so they must be hoisted above the first branch that reads them.
>   * `encampmentDefense` KEEPS unit-first on both engines (separately sourced) —
>     do not fold it into `city_here`.
>
> A single exclusivity error here is a subtle red of exactly the kind that cost
> three multi-step hunts this session, so it wants a fresh budget and its own
> parity run, not the tail of a long one. The MANDATORY poke lane (garrisoned
> at-war rival centre; assert the CITY takes the roll under key `rngrc` and the
> garrison's HP is unchanged) is still unwritten.

- **Channel:** target precedence — a City Center takes the hit before its garrison.
- **Engines:** BOTH. TS `combat.ts:rangedAttack` (drop the `enemies.length === 0` guard on the city fallback) **and `meleeAttack`'s `rivalTarget`/`csTarget` arms** — otherwise the same rule stays split across two functions. `encampTarget` keeps unit-first (sourced). GPU player `r_att`/`r_civ`/`r_sieg`/`r_cs` branches.
- **RNG draw count:** **NO — neutral and order-preserving.** `damageRoll` consumes exactly one draw regardless of the strength delta; the shot that today rolls `'rng'` against the garrison tomorrow rolls `'rngrc'` against the city at the same stream position.
- **Gate:** tsc + vitest + re-export (expect **byte-identical** fixtures) + parity + rollout + **a new poke lane**.
- **Reach:** the player half is **structurally unreachable in scripted parity** — `grep meleeAttack|rangedAttack|attackTargets scripts/export-gpu.ts` returns zero. Byte-identical fixtures are the check; the **rollout** reaches it (`rng` 1/4, `vrngc` 7/11 in the partial statelog window). **The poke lane is mandatory**, not optional: construct a garrisoned at-war rival centre, assert the CITY takes the roll (key `rngrc`) and garrison HP is unchanged. `gpu/ranged_test.py` deliberately avoids the city branch today.
- **EXCLUDE from this commit:** D2 (seat-generic city lookup — draw-count, see S7.10b) and D4 (religion adder — known-red, see §3).
- Keep D3 (rival↔rival ranged scope-out) as an **explicit `caps` predicate on the unit scan**. Deleting it by "unification" opens rival↔rival ranged war and blows the draw stream.
- Keep every `damageRoll` key string byte-identical (`logdiff.py` and every hunt parse them).
- Free rider, correctly re-scoped: `rlenv.ts:autoMilitary` calls `meleeAttack` unconditionally on targets up to `def.ranged.range`. This is an **RL-path** bug (`rlenv.ts:372 CivEnv.advance`), not eval-only as the report claimed.

### S7.2 — citizen science/culture inside the amenity tier, every seat
- **Channel:** the amenity `yieldFactor` applies to citizen science/culture.
- **Engines:** BOTH. TS: `rivalPhase` stops re-adding `CITIZEN_SCIENCE * rc.population` / `CITIZEN_CULTURE * rc.population` after `rivalCityYields` has already applied `t.yieldFactor`; the terms move into the pre-tier `citizens` bucket. GPU `_rival_city_yields` / `_rival_phase` twins.
- **RNG draw count:** NO. No yield function on either path imports `rng.ts`. `rng` column still moves (trajectory).
- **Gate:** tsc + vitest + re-export + parity + rollout.
- **Reach:** **scripted fixtures REACH** — rival cities reach pop 2–18 with at most four luxury grants, so non-`Content` tiers are routine; every non-1.0 `yieldFactor` turn diverges by `0.5·pop` science and `0.3·pop` culture.

### S7.3 — `rivalHousing`'s per-city ownership clause
- **Channel:** improvement housing accrues to the city that owns the tile.
- **Engines:** BOTH. TS `rivals.ts:rivalHousing` (`tileOwnedByCiv(t, civ)` → `tileBelongsTo(t, city)`) → collapse into one `computeHousing`; GPU twin.
- **RNG draw count:** NO.
- **Gate:** tsc + vitest + re-export + parity + rollout.
- **Reach:** **scripted fixtures REACH** — every rival civ holds 5–6 same-civ city pairs at hex distance ≤ 6 in the frozen statelog, so overlapping radius-3 windows are the norm (the un-swept sibling of A-23's measured 1719 double-counted worked tiles).
- **PRECONDITION:** re-cite to `civilization.fandom.com/wiki/Housing_(Civ6)`. The report's headline quote does not exist. Do not open the slice until the AUDIT entry carries a real citation.
- Free rider: adds the generic `DISTRICTS[d.type].housing` term (inert today — only AQUEDUCT and NEIGHBORHOOD carry housing, both hand-coded).

### S7.4 — government/policy multiplier channels for every seat (+ the GPU's missing half)
- **Channel:** `getModifiers(state, seat)` multiplier channels read by every seat's city path.
- **Engines:** BOTH, and this is the **paired TS+GPU** slice. TS: the rival city path reads `yieldMult`, `adjacencyMult`, `buildingYieldMult`, `amenitiesAll`, `housingAll`, `housingIfDistricts`, `newDeal`. GPU: `adjacencyMult`, `buildingYieldMult`, `amenitiesAll`, policy `amenitiesIfSpecialty` and `newDeal` exist on **neither seat** and must be implemented **for the player too**, or the merge ships a latent that fires the first time any seat slots `NATURAL_PHILOSOPHY`/`RATIONALISM`. Delete the `# housing/ymult/slots discarded` comment and the stale "TS-only … 100-turn gate" block in `export-gpu.ts` in the same commit.
- **RNG draw count:** NO.
- **Gate:** tsc + vitest + re-export + parity + rollout + **a poke lane that forces a tier-3 adoption**.
- **Reach:** SPLIT, and the AUDIT entry must say so. `housingAll` (Monarchy +1) **fires in all 12 scripted seeds**. `yieldMult`, `adjacencyMult`, `buildingYieldMult`, `amenitiesAll`, `newDeal`, `housingIfDistricts` **do NOT** — they need tier 3 (rank 41–42) and the best rival reaches 37 civics. Green parity proves nothing about those five; **the confirming evidence must come from the poke lane** (`[[gate-reachability]]`).
- Separate residual, do not fix here: `src/data/policies.ts` gives MONARCHY a flat `housingAll: 1`; real Civ 6 Monarchy's housing is wall-conditional — so the measured 12/12 magnitude is not the Civ 6 magnitude.
- Fold in the **free closes** from §4 below (`districtYieldAdd`, `goldenCulturePerDistrict(state, 0)`, D8's redundant conjunct, D6's CS-channel residency flip).

### S7.6 — production overflow is **banked**, not discarded
- **Channel:** production overflow carry.
- **Engines:** BOTH, all four sites. TS `game.ts` (`if (city.queue.length > 0) …` → `bank += progress − cost`), `rivals.ts` (rival gains `productionBank`), GPU `# overflow drops (queue empty)` and the rival `done_q` block. Route the two other lump paths the same way: `fx.productionToCapital` for **both** seats, and the GPU rival CHOP (which today adds to `rc_progress` even when `rc_current == -1`, i.e. destroys it).
- **RNG draw count:** NO — no draw site in any production or completion path on either engine. `rng` moves by trajectory only; say so in the AUDIT entry so it is not read as a third draw-count stage.
- **Gate:** tsc + vitest + re-export + parity + rollout + checkpoints re-recorded + **forced-compaction gate** (a new `rc_prod_bank` must be appended to `_RC_SLOT_FIELDS` and handled at every `rc_progress` zeroing site — this is a `[[new-class invariant sweep]]`; grep every `rc_progress` write, there are **~20**, not the ~9 the report claims: engine.py 6124, 6358, 6596, 8406, 8417, 8515, 8539, 10376, 10420, 10679, 12886, 12913, 12929, 13000, 13020, 13037, 13050, 13080, 13110, 13658, 14624).
- **Reach:** **scripted fixtures REACH, maximally** — ~91% of all rival-city completions carry non-zero overflow (2521/2774 corrected; the report's 92.3% dropped 44 negative estimates from the denominator), mean 5.27, ≈14k production points discarded across the 12-seed set on the rival side alone; the player rate is the same. Budget a **maximal** declared delta.
- **SCOPE THIS SLICE DOWN before opening it:** land only "overflow is banked and paid into the next item". **Do NOT** land the un-multiplied-bank arithmetic (§7-4c, unsourced) and **do NOT** port a queue to the GPU (§7-4b). Declare, do not assume costless, the fidelity **loss**: a single-slot core banks-then-pays-next-turn where TS's `while` loop could complete the next item in the same turn.
- Rewrite the citation block first: only "overflow exists and multipliers are backed out of it" is officially sourced; "held while idle" is corroborated-but-not-settled; the Ed Beach attribution is **wrong**.

### S7.8 — war weariness: one seat-parameterised, era-and-casus-belli-scaled accrual
- **Channel:** war-weariness accrual rate.
- **Engines:** BOTH, all four accrual sites. Widen `warKindFormal`/`denounced` to the seat axis (TS off `RivalCiv` into the seat module; GPU `warkind [B,NS,NS]` / `denounced [B,NS,NS]` with `rr_warkind`/`rr_denounced` as registered aliases, the exact `self.war`/`self.rr_war` pattern). Delete `WW_SURPRISE_MULT`/`WW_FORMAL_MULT`. Collapse `_ww_penalty_player`/`_ww_penalty_rival` into one helper but **keep the two call sites' output dtypes** (`[[dtype-equality-not-invariant]]`).
- **RNG draw count:** **YES, indirectly and unavoidably.** `rivals.ts:3323` and `3357` both put `nextRandom` **last** in an `&&` chain gated on quantities this change moves (`anyWar` via `atWarRivals`, and `playerStrength`). Draws are created/deleted. **`rng` cannot serve as this stage's tripwire.** Both engines change identically, so parity is unaffected — this is a baseline-vs-engine delta, not a TS↔GPU one. It does **not** consume a permitted draw-count-changing stage (no draw *site* is added or reordered) — but the owner must sign off on that reading.
- **Gate:** tsc + vitest + re-export + parity + rollout + checkpoints (`rr_warkind`/`rr_denounced` shape change kills every `ckpt/*.pt`) + rewritten `gpu/war_weariness_test.py` (its `decay == 4 * per_turn` assert breaks) + rewritten `tests/geopolitics.test.ts`.
- **Reach:** **scripted fixtures REACH hard — 9 of 12 seeds** have the player at war 215–229 of 250 turns with ww pinned at the cap; under the merged rule all nine become SURPRISE (no player-axis casus belli exists). The `×2` branch fires in exactly **1** seed today (9133).
- **Must land in the AUDIT entry, all four:** (i) the ×16 rescale of `perTurn`/`decay`/`cap`/`perAmenity` **and** `RR_DOW_WW_MAX`→96 / `RR_PEACE_WW`→160, or every rival↔rival war ends on turn 1; (ii) the 16/6/3 constants are from a **pre-R&F (Oct 2017)** thread — vintage disclosed, not hidden; (iii) holding decay at 64 drops peace-decay from 4× to ~1.23× of late-era accrual, drifting from the Civilopedia's "greatly increased rate"; (iv) the "624 vs 480 WWP nuke" figure is the report's own derivation, not quoted data — **strike it**.
- Add a player `ww`/`wk` field to `scripts/statelog.ts` **and** `gpu/statelog.py` in this stage — the `PT =` line carries neither today, so the frozen baseline is blind to the new state.
- Rewrite the two stale justifications: `game.ts:endTurn`'s "seed 9092 economic divergence" comment (that sighting is AUDIT **G-8, RESOLVED-AS-REFUTED**) and `data/rivals.ts:WW_SURPRISE_MULT`'s doc comment (it cites the **grievance** table).

### S4.1r — settler bank, pop cost, one found predicate, one found mutation
- **Channel:** settler consumption and banking.
- **Engines:** BOTH. TS: `rivals.ts:siteQuality` loses its legality half and `tryFoundCity` its inline `tooClose`; both call `canFoundCity(state, seat, tile)`; `foundRivalCity` collapses into `foundCity(state, seat, tile)`; every seat banks (`seat.settlers += 1`, `population = max(1, pop − 1)` on **build and purchase**); `RIVAL_SETTLER_COST` deleted; the rival re-tries from the bank in a `while` loop. GPU `_rival_try_found` / `_rival_phase` / `step` founding loop.
- **RNG draw count:** no draws in any founding path on either engine; but `combat.ts` gates its **second** camp draw on `candidates.length > 0` and `campCandidates` excludes tiles within 5 of any city centre — one more/fewer city changes whether that draw happens, and camp count drives the per-camp raider roll. Trajectory-conditional, declared explicitly.
- **Gate:** tsc + vitest + re-export + parity + rollout + checkpoints + **forced-compaction gate MANDATORY** (touches `founded_n`, the `hole` fallback, `_reclaim_cities`). `SEED_OVERRIDES` re-derived if any seed changes whether the player ends cityless.
- **Reach:** **scripted fixtures REACH** — 138 rival settle attempts (pop cost fires 138×), **12 fully-paid rival settlers destroyed, all in seed 9133**, all from the production-queue caller. `r*.popSum` and `r*.qCostSum` are the cleanest tripwires. Seed 9133 is a ready-made diagnostic lane.
- **HOLD OUT of this slice** (§3): the own-territory relaxation and the `+queued` term in `settlerCost`.
- Free correctness wins that must not move a value: fold the GPU player loop's missing `tile.district` and missing CS-centre-distance clauses into the shared predicate. If either moves a trace value, that is a **find**, not a regression.
- Re-run the reachability probe with a corrected counter first: the report derived "player cities founded" from `Δcity_seq_next`, which `_capture_rival_city` and the CS-annex path also increment — so 41/19 are contaminated. Measure off `Δalive` inside the founding block.

### S7.14 — city-state quest rule. **LAST, ALONE. Draw-count change #1 of the 2 permitted.**
- **Channel:** CS quest issuance (one seat-parameterised body).
- **Engines:** BOTH, both seats. TS `issueQuest` + `issueRivalQuest` → one body; GPU `_city_state_phase` + `_rival_quest_phase`.
- **RNG draw count:** **YES — count AND order.** Rivals gain up to 2 draws per issuance attempt inside `rivalPhase`.
- **Gate:** tsc + vitest + re-export + parity + rollout + checkpoints (`csr_quest`, `csr_quest_camp`, `csr_quest_issued`, `cs_quest_district`, `cs_last_levy` — note S6.1 already collapsed the views, so the report's per-seat key names are stale) + **rewritten** `tests/cs-verbs.test.ts` (`expect(state.rngState).toBe(rng0)` and "draws exactly 2" both assert the asymmetry) + `tests/citystates.test.ts` + `gpu/cs_verbs_test.py` + `SEED_OVERRIDES` re-derived by hand + the exporter's orphan sweep.
- **Reach:** **BOTH seats reach in the 12 scripted fixtures** — player 52 issuances / 12 seeds / first at t13; rival 35 issuances / 11 seeds / first at t27. No rollout dependency for reach.
- **Land in this slice:** the random specialty district for every seat (filtered on `countsTowardLimit`, **not** the raw `PLACEABLE_DISTRICTS` roster — AQUEDUCT and NEIGHBORHOOD are not specialty); camp radius 6→5 at all four sites; the GPU's hardcoded `n_opts = has_camp + 1 + bd` gains the missing `has_route` term; `declareWarOnCityState` cancels the quest both directions and strips envoys only on a **self-declared** war; issuance timing → meeting + `eras.ts:eraBoundary` (recommended in the same commit — splitting it buys no tripwire, since `rng` is already unusable here).
- **The declared-delta window opens at TURN 13, not 27.** The radius change and the `has_route` fix both change which quest kind DRAW 2 selects from the **first player issuance**.
- **The check is NOT "hand-predicted draw delta vs observed"** — the change steers the trajectory (new kinds → different resolution rates → different cooldown restarts → different issuance counts), so `[[trajectory-bisect-lies]]` applies. The check is: (i) fresh re-export + parity **0.0 milli**, (ii) rollout/replay 72/72, (iii) before/after issuance counts and kind distributions compared **as distributions, not per-row**.
- **Add `cs{s}.r{r}.questKind` to the trace in this stage.** There is no trace column for the rival quest at all today — exactly the shape that let `rFaith` (#71) and `rGScore1` (#79) survive green gates.
- **Label two things in the AUDIT entry as engine-agreement choices, NOT sourced:** the camp-pinning key (adopt the rival's nearest-then-lowest-index) and uniform-over-valid-kinds.

---

## 3. DO NOT IMPLEMENT YET — evidence did not survive review

| Parked | Why | What would unblock it |
|---|---|---|
| **§7-2 citizen assignment (report 8's D1)** — the highest-magnitude item in the round | Both supporting citations are bad: the "locking is the override" thread is a **Civilization V** thread and does not contain the quoted sentence. The auto-governor's *specialist preference* is admitted unsourced. Handing the player the rival's merged ranking would pull citizens off tiles into gold specialists everywhere (`tileScore` FOCUS_BASE scores a Commercial Hub specialist at 4) on an invented heuristic, in all 12 seeds | A real Civ 6 source on whether the auto-governor ever prefers a specialist slot over a tile |
| **§7-5 CS meeting** | Primary citation verified, but the "Reveal All vs Explore All" quote is **fabricated**, and read literally the real rule (*visibility* range) arguably supports the **instant** behaviour under our fog-off gate. `CS_MEET_RANGE = 3` on a **city** anchor is unsourced (the source puts a unit on the active side). Also loses the "or vice versa" arm entirely (our CSs have no units). And it is a draw-count change we do not have budget for | Source for Civ 6 city sight radius for first contact; measured 250-turn contact turns per seed (t0 geometry only proves 0/36 pairs at t0 — the 26–35-tile city-states may never be met, zeroing influence/envoys for whole seeds) |
| **§7-11 CS combat (HP/heal/strike)** | Headline quote **fabricated**; the report's own primary source states city-states **have walls** and **build districts**, contradicting its "a city-state still fires nothing" conclusion; two code errors (`rngcs` is in `rangedAttack`, not `hostileRangedStrike`); the "no RNG change" headline is contradicted by its own next clause. Using our missing `CityState.buildings` as the reason a city-state can't strike is structure-as-licence-to-deviate | Re-source 200 HP and siege-gated +20 off CivFanatics *City Combat* (both quotes there ARE verbatim); resolve the walls/districts contradiction; re-file the minor heal in an **ungated** phase (`barbarianPhase` sits inside `if (state.unitsMode)`, `cityStatePhase` does not); restate RNG as "draw count changes whenever an assault sequence changes length" |
| **§7-12 per-seat refresh / heal moment** | Citation is the strongest in the whole round (verbatim via MediaWiki API), but the **prescribed merge ships a silent player regression**: it puts the heal AFTER the player's MP reset, making `movesLeft >= grantedLast` unconditionally true, so every player unit heals every turn regardless of moving — violating the same sentence it cites, and re-creating exactly the asymmetry #51 exists to destroy | A re-reviewed spec. The reviewer's fix (move the **whole** sweep below `rivalPhase`, heal first) is plausible but unreviewed, and it kills the statelog `a` (acted) column on both engines — which needs an explicit acted flag, not a derived one |
| **R7-10 D4 — religion attack adder on the player's city branch** | Not an evidence failure — a **measured red**. `combat.ts:445-452` records that applying this term made it reachable off-script and rollout seeds 9183/9235 went red on draw counts; the GPU has no player religion (`holy_tile[:, 0]` is written nowhere) | Task **#53**. Re-file as a residual. Separately, the report's rationale ("keys on where the unit stands") does not describe our code — `religionAttackCS` evaluates both terms against the **target** tile. That is its own latent |
| **R7-10 D2 — seat-generic ranged city lookup** | The **rule** is sound (HIGH). But it converts a zero-draw no-op into "+1 draw per turn per barb ranged unit in range of a rival city, forever" — a recurring draw-count change, and the plan permits only two such stages (S7.11 quests, S7.13 goody huts) | Owner decision: promote to a third permitted draw-count stage, or defer to Round 8 next to the goody-hut slice. Do **not** ship it in the same commit as D1 — the `rng` tripwire cannot then distinguish them |
| **§7-3b own-territory founding + §7-3c `+queued` settler term** | Both unsourced. Worse, own-territory founding is only *reachable* here because `BORDER_MAX_RADIUS = 5` exceeds `CITY_WORK_RADIUS = 3` — in real Civ 6 a city never owns past ring 3, so with a 4-hex minimum the case cannot arise and no Civ 6 source can settle it. It is a repo-only channel created by a probably-unfaithful border radius | Either a real source, or record both as **declared engine residuals** with that reasoning |
| **§7-4b GPU multi-item queue + §7-4c un-multiplied bank** | Queue depth: the "8 items" FAQ line is unverified (403); depth ≥2 is unreachable in every gate driver and buys nothing on the GPU. Bank arithmetic: patch note says multipliers are backed out, **no source gives the formula**, and shipping it would silently change the **existing** chop path | Keep the TS queue as a UI/planner affordance in front of a one-item core; record the arithmetic as a named residual with its two-source citation |
| **§7-1c/1d/1g quest sub-rules** | Kind weighting: no source. Camp pinning: sources conflict — do not invent a resolution, ship the rival's key **labelled as an engine-agreement choice**. Destroyer-credit: sourced, but requires a camp-destroyer attribution channel neither engine has | 1g is a real slice of its own; 1c/1d stay labelled |
| **R7-4 D5 wonder regional amenities** | Effect text verified on the GS URL, but the merged rule's `citiesOf(state, city.seat)` is an **unsourced narrowing** of "each City Center within 6 tiles", the "+2 Loyalty" the report quotes is not in either page, and rival wonder ownership is **unmeasured** in the 12 seeds (no trace column carries built-wonder ids) | Probe rival GREAT_BATH/COLOSSEUM builds and record the count; source the owner-side restriction. ALHAMBRA is unreachable by construction |

---

## 4. FREE CLOSES — the repo is already right, the plan's §7 entry is stale

These cost nothing but a plan edit and (where noted) a dead-code deletion. Batch them into S7.4's commit.

1. **§7-3's "`GameState.settlers`"** — stale. Round 1 already moved it to `Seat.settlers` (`types.ts`, written by `seats.ts:emptySeat`); **every seat already carries the field**, the rivals' copy is simply never read or written. The **storage** is unified; only the behaviour is not. Also: the row lands the item in **S4.1**, but the Round-2 note routes it to Round 7 — S4.1 is a storage prerequisite, not the home of this decision.
2. **§7-5's "storage"** — stale in the same way. S6.1 already allocates `csr_met [B, 1+R, S]` with `cs_met`/`cs_r_met` as views. Only the *rule* is forked. (The row itself is **not** stale — it already reads "proximity (rival, both engines)", and the plan at line 873 already says "The gate only passes because fixtures run fog off. One meeting rule must be picked here." Do not file this as a discovery.)
3. **R7-4's "`goldenCulturePerDistrict`/`goldenProphetPoints`/`goldenBoostBonus` … all three take a civ parameter and are called only with 0"** — **factually FALSE**. All three are already called with `civOfRival(rival.id)` (`rivals.ts` golden-PEN block, PROPHET accrual, `pickNext`'s `gTech`/`gCivic`). The only residue is `city.ts`'s hardcoded `goldenCulturePerDistrict(state, 0)` → `city.seat`. One-line close.
4. **R7-4's `districtYieldAdd`** — listed as a dropped rival channel; it is a **dead channel for everybody**. Three hits total: the field declaration, its `{}` initialiser, and one read in `yields.ts:cityDistrictYields`. **Nothing ever writes it.** Merging it changes nothing. Delete the field or populate it from the CS channel — either way, remove it from the flag list.
5. **R7-10's "lift `attackTargets:828`'s `const cityRange = unit.owner === 'player' ? range : 1`"** — the line is now at **866** and reads `isPlayerSeat(unit.seat) ? range : 1`, and **lifting it is a verified NO-OP**: its only consumer's player disjunct already gets `range`, the barb disjunct pins `d === 1` itself, and there is **no rival disjunct at all**. Delete the instruction from the plan.
6. **§7-4's framing** ("player multi-item-with-overflow vs rival single-slot-with-discard") — stale. There are four implementations; **three are already identical**, the GPU player already behaves like the rival, and **all four discard overflow**. The depth asymmetry is TS-player-only and dormant (`export-gpu.ts`, `replay-gpu.ts` and `rlenv.ts` all refuse to queue into a busy city). The real item is the discard.
7. **§7-12's stated behaviour delta** ("a rival refreshing in its own phase heals AFTER the player's attacks instead of before") — **backwards**. A rival already heals after the player's attacks on both engines (`_apply_unit_actions` at the top of `step`; TS verbs run before `endTurn`). The real delta is the **player's**, whose heal currently lands *before* `barbarianPhase`/`rivalPhase` fire at it. Also: the MP double-reset is **value-identical today**, so "delete the redundancy" is free and separable from the heal question.
8. **§7-11's framing** ("player vs rival") — there is no player↔rival and no TS↔GPU divergence here at all. All three sub-rules are byte-mirrored on both axes. The outlier is a **third seat class, the minor**. (The gap is real; only the framing is a free close.)
9. **R7-1's "~9 divergence flags"** — stale in composition. Already closed since it was written: `regionalEffects`, `cityMaintenance`, petra, `waterMillBonus`, `greatWorkCulture`/`relicFaith`/`artifactCulture`, `faithPerWonder`, wonder `cityYields`/`cityYieldMult`, belief/`getModifiers` head, CS envoy amounts, `borderCostMult`, `empireGrowthMult`, `growthMult`, `housingGrowthFactor`, `tier.growthFactor`, B-32 pillage-dark, A-23 worked tiles.
10. **R7-1's D8** — `rivals.ts`' candidate filter reads `tileOwnedByCiv(t, civOfRival(rival.id)) && tileBelongsTo(t, rc)`; `tileBelongsTo` already implies the first conjunct. Zero-flag deletion.
11. **`CS_TYPE_DISTRICT`'s stated role** — B-21 already re-keyed the 3-/6-envoy bonuses to `CS_TYPE_BUILDINGS`, so the table is a leftover whose **only** consumer is the rival quest target. S7.14 removes its last consumer; delete the table in the same commit.
12. **Plan housekeeping (not a code close):** the plan contradicts itself three ways on the CS-quest stage number — §1 item 3 says **S7.11**, §5's table says both **S7.1–S7.13** and **S7.1–S7.14**, §7 item 1 says **"S7.14, alone"**. Pick one before the round opens; the two permitted draw-count stages are named by number in §3 and the AUDIT entry must match.

---

## 5. SUMMARY

**Land, in order:** S7.7a (builderCost) · S7.7b (tilePurchaseMult) · S7.10a (city-first precedence) · S7.2 (citizen sci/cul in tier) · S7.3 (rivalHousing) · S7.4 (gov/policy channels + the GPU's missing half + all 11 free closes) · S7.6 (overflow bank) · S7.8 (war weariness) · S4.1r (settler bank) · **S7.14 (CS quests, last and alone)**.

**Ten slices, of which:** three (S7.7a, S7.10a, and the free-close batch) expect **byte-identical fixtures** — the cheapest tripwires in the round and the reason they go first. Seven need a full re-export. Two need the **forced-compaction** gate (S7.6, S4.1r). **One** consumes a permitted draw-count budget (S7.14). One battery, at the end.

**Parked, not guessed:** citizen assignment (D1), CS meeting, CS combat, per-seat heal timing, the religion attack adder, ranged D2, own-territory founding, the settler `+queued` term, the GPU multi-item queue, the un-multiplied bank, and three CS-quest sub-rules. That is 11 parked against 10 landed — which is the correct ratio when four separate research reports shipped a fabricated quote.