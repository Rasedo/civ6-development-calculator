# ROUND RESIDUALS (#71) — the nine-item + three-debt sweep

Owner goal 2026-07-26: B-8, B-18, B-17, B-26, B-23, B-24, B-27, A-5r,
A-9 residuals + the three debts. EXPERIMENTAL mode: no per-stage gates,
NO subagents, ONE ladder + parity-hunt at the very END.

## SCOPE REALITY — read first

This is roughly **6.85 of B's open weight plus 0.3 of A's, across ~10
independent mechanics**, several of which are full subsystems (tourism,
the Trader unit + roads, the dedication system, an Encampment HP pool =
a new attackable entity). For calibration: #70 moved 2.8 of weight with
five slices, needed four latent fixes, and consumed a full context
window WITH subagents. This goal is several times that, with subagents
disallowed. It will span multiple context windows — that is a fact
about the size, not a reason to stop. Work the order below; each item is
independently landable, so a context boundary costs nothing if this file
is kept current.

**HARD RULE (from #70): verify every fidelity premise against a real
Civ 6 source BEFORE writing code.** Two of #70's five premises were
fabrications found in this repo's own AUDIT text. The gates prove the two
engines agree, never that they agree with Civ 6. Each item below carries
its verification status.

## STATUS

- [x] **DEBT-2 religionAttackCS on city attacks — DONE, BOTH ENGINES.**
  VERIFIED: Crusade/Just War raise the UNIT's combat strength based on
  where the unit stands, not on what it hits, so a city target cannot
  exempt them. The recorded debt understated it — ALL SIX city-attack
  sites omitted the term, not just the ranged ones. TS now adds
  `religionAttackCS` at `attackCity`, `attackRivalCity`,
  `attackCityState`, and the `rngcs`/`vrngc`/`rngrc` rolls, ordered
  religion-then-aura to match the unit-vs-unit assembly.
  GPU DONE: `_rel_atk_cs` added immediately BEFORE
  the aura add (order is load-bearing for float association) at the four
  RIVAL-attacker sites — `_rival_attack_rival_city` (rcty), the rival
  `csty` block, `_hostile_city_attack`'s rival branch (pcty), and
  `_hostile_ranged_strike`'s city branch (vrngc). The four
  PLAYER-attacker sites are structurally 0 (`_rel_atk_cs` documents that
  the GPU player carries no religion — `holy_tile[:, 0]` is never set in
  any gate mode) — add a comment, not a call, matching the existing
  convention. The BARB `_attack_rival_city` site takes no term.
- [x] **DEBT-1 melee_test fixtures_o4 — DONE.** `SEED_OVERRIDES` is
  keyed by INDEX and tuned for the parity-contract roster (R_MAX 2);
  overriding a dying seed there would silently reshuffle the MAIN fixture
  set and invalidate the whole gate. Added `SEED_OVERRIDES_ALT`, a
  per-roster map consulted by the new `seedFor(s)` ONLY when R_MAX differs
  from 2 (3 rivals: index 15 → 9199, since 9196's player is wiped by t100
  under the post-#70 world). R_MAX 2 takes the identical old path, so the
  main fixtures are byte-unaffected. fixtures_o4 regenerated; melee_test
  prints "C3c MELEE OK".
- [x] **DEBT-3 — RESOLVED AS A NON-ISSUE (verified, no code change).**
  `Unit.owner` (types.ts) admits ONLY `'player' | 'barbarian' | 'rival'`,
  and no site anywhere in src/core constructs a city-state-owned unit —
  levied units belong to the LEVYING civ (A-12). So there is no CS unit
  plane for the GPU hostile scans to omit; the reported asymmetry cannot
  occur. This is the G-3 re-verify rule paying out again: the third
  #70-era "suspicious" note to dissolve under verification rather than
  need a fix.

## LADDER STATE — resume HERE (parity STILL RED)

Every behaviour flip this round is now INERT behind an explicit flag
(APOSTLE_BUY_LIVE, RIVAL_TILE_BUY_LIVE, the NEIGHBORHOOD scaffold row,
BARB_SCOUT_OPENER_LIVE, ADMIRAL_MARCH_LIVE, DEDICATION_PAYOUTS_LIVE,
CITY_RELIGION_ADDER_LIVE) — and scripted parity is STILL RED:
`seed 9261 turn 119: MISMATCH [('rng', ...), ('rQProg1', 347400 vs 345600)]`.

THAT IS THE IMPORTANT SIGNAL. With every flip off, the tree SHOULD be
behaviourally identical to #70's green baseline (6a8fd48). It is not, so
something landed this round changes behaviour WITHOUT going through a
flag. Gating more mechanics is now the WRONG move — each gate just
reshuffled the trajectory and surfaced the next seed. STOP GATING.

**BISECT RESULT — THERE ARE TWO INDEPENDENT DIVERGENCES, one per side.**
That is why single-side reverts kept "not fixing it": each side has its
own bug, so reverting either one still leaves the other red.

* baseline `engine.py` + #71 `src`/`scripts` -> RED at seed 9261 t244.
  A TypeScript/exporter-side divergence.
* #71 `engine.py` + baseline `src/core/units.ts`, `rivals.ts`,
  `combat.ts`, `eras.ts`, `game.ts` AND baseline `scripts/export-gpu.ts`
  -> RED at seed 9274 t140, with BIT-IDENTICAL rng values across every
  such revert. An ENGINE-side divergence that survives a near-total src
  revert.

**CLEAN RE-RUN DONE — the engine-side divergence is CONFIRMED.** ALL of
`src/` and `scripts/` at 6a8fd48, ONLY `gpu/civ6gpu/engine.py` at #71,
re-exported: parity RED at `seed 9274 turn 140 [('rng', ...)]`. So the
#71 engine diverges from the baseline TS reference with every flag off.
The caveat below is resolved; the label holds.

**LOCALISED TO ONE PHASE AND ITS CALL SITES (2026-07-26).**
Seed 9274 identified in the TS dump by `cities=5, camps=3`:
    **TS t140: barb 3, riv 1, dis 5, cs 0 (= 9).**
    **GPU t140: barb 5, riv 1, dis 5, cs 0 (= 11).**
So `_rival_phase`, `_disaster_phase` and the CS phase ALL MATCH exactly.
**The 2 extra draws are entirely inside `_barbarian_phase`.**

GPU `_next_random` call sites during t140 (logged by patching the method
and recording the caller line): `5911` once, `5969` THREE times (one per
camp, K=3), plus a `4176` damage roll. Line 5969 is the garrison/raid
roll inside the per-camp loop:
    `can_grow = active & near_any & (u_alive.sum() < n_camps * maxBarbPerCamp)`
    `r = self._next_random(can_grow)`
TS's twin SHORT-CIRCUITS in a way the GPU's mask cannot express directly:
```
} else if (barbUnits(state).length < state.barbCamps.length * MAX_BARB_PER_CAMP
           && nextRandom(state) < 0.1) {
```
— and, crucially, that `else if` is only reached when `nearCamp.length !== 0`;
a camp with NO barb within 1 tile takes the regarrison branch and draws
NOTHING. TS drew for 1 camp; the GPU drew for 3.
**THE DIFF SURFACE IS NOW TWO EXPRESSIONS (2026-07-26).**
GPU `_first_free_spot(at_tile, "barb")`:
  `cand7 = [anchor, *neigh]`; `blocked = barb|pmil|pciv|rv|rvc`;
  `terr = self.passable[cand]`; `ok7 = (cand7>=0) & terr & ~blocked`;
  take the FIRST index 0..6.
TS `spawnUnit`:
  `[near, ...neighbors(map, near)].sort(by distance).find(t =>
   tileFreeForUnit(state, t.index, probe))`.
Ordering agrees (V8's sort is stable, so the anchor then the neighbours in
`neighbors()` order == the `neigh` column order). So the ONLY place they
can disagree is the PREDICATE:
    **`self.passable | occupancy masks`   vs   `tileFreeForUnit`.**
DO THIS: for seed 9274 t139, camp tile 950, print the 7 candidate tiles
and, for each, the GPU's `passable`/`barb`/`pmil`/`pciv`/`rv`/`rvc` bits
NEXT TO TS's `tileFreeForUnit` verdict and its reason. The first tile
where they disagree IS the bug. Likely suspects inside `tileFreeForUnit`
that the GPU's flat `passable` plane may not model: a tile holding a
DISTRICT or city centre, a camp tile, or a stacking rule the barb branch
flattens (`blocked` treats every unit as blocking, which is right for
barbs — verify TS agrees for a barb probe specifically).

(context) CONTRADICTION RESOLVED — spawn placement, not RNG. Printed both engines' rng side by side:
```
t138: TS=566183240   GPU=566183240    draws TS=9  GPU=9
t139: TS=3533537999  GPU=3533537999   draws TS=11 GPU=11   <-- IDENTICAL
t140: TS=2837761132  GPU=2205925462   draws TS=9  GPU=11   <-- diverges
```
So the rng premise was CORRECT: through t139 the two engines are
bit-identical in state AND in draw count (11 each). Yet the GPU gains a
barbarian at t139 (traced barbs 6 vs 7).
=> Same draws, same values, same thresholds, same camps, same order, same
gates — and still a different unit count. The ONLY way that happens is a
spawn that CONSUMES NO DRAW: the roll passed in BOTH engines, but the
GPU PLACED the unit and TS did NOT.
**THE BUG IS IN SPAWN PLACEMENT.** TS `spawnUnit` returns null when it
finds no legal free tile (and the raid branch then simply produces
nothing); the GPU's `_spawn_barb` calls `_first_free_spot(at_tile,
"barb")` and evidently found one. Diff those two placement rules —
candidate ring order, what counts as occupied (stacking rules: own
civilian vs military, embarked units), water/impassable exclusion, and
whether a unit spawned EARLIER in the same camp loop blocks the tile.
This also explains the extra unit arriving at hp 82 rather than 100: it
was placed somewhere it immediately took fire.
The whole earlier gate/threshold/order analysis was chasing the wrong
half of the mechanism — the draw was never the difference.

(resolved) A CONTRADICTION — one of the premises is false.
Thresholds now checked too: `garrisonGrowChance` 0.1, `campSpawnChance`
0.08, `maxBarbPerCamp` 3 — all identical to the TS literals. So the
collected facts are mutually inconsistent:
  if the rng STATE matches at t138 AND at t139, then both engines drew the
  SAME COUNT, and mulberry32 is deterministic, so the same count from the
  same state yields the SAME VALUES. Same values + same thresholds + same
  camps in the same order + same gates ⇒ the SAME outcome. But the
  outcomes differ (GPU spawns at camp 950, TS does not).
Therefore at least one premise is wrong. Rank them by how they were
measured and re-check the weakest FIRST:
 1. "rng matches at t139" — inferred from the parity report listing t140
    as the first mismatch. WEAKEST: re-read the report directly, and
    print the GPU vs TS rng at t138 AND t139 side by side. If they differ
    at t139, everything else collapses into an ordinary draw divergence
    and the hunt restarts one turn earlier.
 2. "both drew 3 grow rolls at t139" — my draw counts were measured at
    t140, NOT t139. Re-run the advancing-draw logger for t139.
 3. "near_any true for all three camps" — measured at t140, not t139.
DO NOT trust any t140 measurement as evidence about t139. That conflation
is the most likely error in this whole hunt.

(refuted) CAMP-ORDER HYPOTHESIS. Dumped TS's
`state.barbCamps` for this seed at t138/t139: **`[419, 300, 950]` — the
SAME tiles in the SAME order as the GPU's `camp_tile`.** So iteration
order is NOT the cause. Do not re-open it.

WHERE THAT LEAVES IT — the facts that must ALL hold simultaneously:
 * camps identical and identically ordered; `near_any` true for all three;
   `maxBarbPerCamp` 3 both sides; count test `6 < 9` true both sides;
 * the rng column MATCHES at t139 ⇒ both engines consumed the SAME NUMBER
   of draws that turn;
 * yet the GPU spawns a PIKEMAN at camp 950 (line 5975) and TS does not.
Same stream position, same camp, same gate, different outcome. The only
remaining explanations are (a) the two engines compare the draw against a
DIFFERENT THRESHOLD or with a different comparison, or (b) the draw
VALUES differ despite the state matching — i.e. the two mulberry32
implementations return different floats for the same state, or the GPU's
`_next_random` returns `out` computed from a different point in the
sequence than TS's `nextRandom` for this call shape.
**CHECK NEXT, cheapest first:** print the actual float each engine
compares at camp 950 on t139 and the threshold it uses
(`garrisonGrowChance` vs the TS literal 0.1). A single side-by-side of
those two numbers ends this hunt.

(refuted) ROOT HYPOTHESIS — CAMP ITERATION ORDER.
Logged which spawn site creates the extra unit: at t139 the ONLY barb
spawn is at **engine.py line 5975 — the RAID spawn**
(`_spawn_barb(can_grow & (r < garrisonGrowChance), camp, grow_type)`),
type 2 at **camp tile 950**. TS makes no such spawn.

Why that is almost certainly ORDER and not a gate: the gates provably
agree (`maxBarbPerCamp` = 3 both sides; the count test is `6 < 9` = true;
`near_any` true for all three camps), AND the rng column still MATCHES at
t139 — meaning both engines consumed the SAME NUMBER of draws that turn.
Same draw count but a different outcome ⇒ the two engines assigned those
draws to DIFFERENT CAMPS. The GPU loops `for k in range(self.K)` over
camp SLOTS; TS loops `state.barbCamps` in ARRAY order. If the orders have
drifted, camp 950 consumes a draw that TS gave to a different camp, and a
0.1 roll that failed for one camp passes for another.
**VERIFY:** print the GPU `camp_tile[0][:n_camps]` against TS's
`state.barbCamps` at t138/t139 and compare ELEMENT ORDER, not just the
set. The #70/S5 note claims slots stay dense and ordered because
`_clear_camp_at` left-shifts like `splice` — that claim is what to test.
A camp cleared and later re-added is the obvious way the orders desync.

(evidence) THE EXTRA UNIT — slot 30.
Slot-by-slot dump, seed 9274:
  t138  traced barbs TS=6 GPU=6, u_alive=6 — IDENTICAL:
        slots 0/1/2 (type0 @419/300/950), 14 (type1 @299),
        24 (type1 @341 hp100), 28 (type2 @342)
  t139  traced barbs TS=6 **GPU=7**, u_alive=7:
        same six PLUS **slot30: type=2 (PIKEMAN) @tile 864, hp 82**
        and slot24 moved 341 -> 297 and dropped to **hp 13**
So at t139 the GPU gains a barbarian TS never has, and an existing barb
takes heavy damage. That extra unit is what attacks at t140 and spends the
2 extra draws (the mel/melc pair).
NOTE the hp values: slot30 arrives at 82 (not 100) and slot24 is at 13, so
BOTH were in combat during t139 — this is not a clean spawn. Chase t139
itself, not t140: dump the same slot table plus every `_damage_roll` k-tag
for t138->t139 on both engines. A unit arriving at hp 82 smells like a
SURVIVOR the GPU kept and TS killed (or a capture/pool-end slot reused),
which is the KILL-hygiene / B-31 POOL-END class.

(superseded) STRONGEST LEAD: the GPU carries an extra live barb slot.
Compared `sim.u_alive.sum()` against the trace `barbs` column every turn:
first divergence at **t139 — TS 6, GPU 7** (camps agree at 3). Note the
scripted gate's FIRST reported mismatch is t140 on `rng`, NOT t139 on
`barbs`, so the traced `barbs` column still MATCHED at t139 — i.e. the
extra alive slot is INVISIBLE to `trace_row`'s barb count but is alive
enough to ATTACK at t140, which is exactly the mel/melc pair below.
=> Find why `trace_row`'s barb count and `u_alive` disagree. Either the
trace filters barbs (by type/tile/camp) and that filter is hiding a unit,
or a slot is flagged alive without being a real unit (KILL-hygiene: a
reclaimed or captured slot left `u_alive=True`). The B-31 POOL-END
capture path and `_reclaim_pool` are the places that class has bitten
before. Dump slot-by-slot `u_alive / u_type / u_tile / u_hp` at t138-139
and find the slot the trace omits.

(context) ROOT LOCALISED (2026-07-26) — the 2 extra draws are a BARBARIAN MELEE
ATTACK the GPU makes and TS does not.**
Re-instrumented correctly (log only calls where `rng_state` actually
CHANGED, and wrap `_damage_roll` too). Seed 9274 t140, GPU advancing
draws, deduplicated:
    `5969 x3` (the three camp grow rolls)
    `_damage_roll k="mel"` + `k="melc"`  <-- a barb melee attack + counter
    5 draws in the 2019/2034/2034/2049/2062 block (disaster)
    `_damage_roll k="rcstk"` (rival walls strike)
  = 11 total, matching the measured delta exactly.
Barb phase = 3 grow rolls + the mel/melc PAIR = 5. TS's barb phase = 3,
i.e. the three grow rolls and NO attack. **So a barbarian engages in the
GPU that does not engage in TS — a POSITION or TARGET-ELIGIBILITY
difference, not a gate/short-circuit difference.**
NEXT: dump the barb roster (tile, type, hp) and the chosen target for
seed 9274 t140 in BOTH engines and diff the positions. If positions
match, the difference is target eligibility in the raider block's
adjacency scan; if they differ, walk back to the turn where a barb first
moved differently. Note `_u_moves` was ALREADY tested and reverted with no
effect, so the barb MP path is not the cause.

(superseded) METHOD CORRECTION — call counts are not draw counts.
`_next_random(mask)` advances the state ONLY where `mask` is true
(verified in its docstring and body: `rng_state = where(mask, a, state)`).
My per-line tally counted CALLS, so the "5911 once, 5969 three times"
attribution does NOT equal draws — a call with an all-false mask costs
nothing. The PHASE-level numbers are still valid because they were
measured from rng_state DELTAS, not call counts.
CONFIRMED here: `max_camps = 3` and `n_camps` reaches 3, so
`can_roll = any_city & (n_camps < max_camps)` is FALSE at t140 and the
line-5911 call consumes NO draw. Also confirmed the GPU's `any_city`
ALREADY includes rivals (`alive.any() | rc_alive.reshape(B,-1).any()`),
so the A-15 guard matches TS — that suspect is dead too.
REDO THE ATTRIBUTION PROPERLY: log the rng_state DELTA per call, not the
call itself, e.g. wrap `_next_random` to record
`(caller_line, popcount(mask))` or the before/after state pair. Then the
2 extra draws inside `_barbarian_phase` will be attributable for real.

**PER-CAMP DUMP DONE.** seed 9274 t140: camps at tiles 419, 300, 950;
7 live barbs; EVERY camp has a garrison sitting ON it (distance 0), so
`near_any` is TRUE for all three and the GPU legitimately reaches the
grow roll 3x. TS's `nearCamp` would also be non-empty for all three, and
its count gate is `7 < 3*3 = 9` -> TRUE, so TS should ALSO draw 3 grow
rolls. But TS's barb-phase TOTAL is only 3.
=> the 2 extra GPU draws are therefore NOT the grow rolls. They are the
OTHER two GPU barb-phase draws: the **camp-spawn roll (line 5911)** and a
**damage roll (line 4176)**. Check the camp-spawn gate FIRST:
  TS: `anyCivCity && barbCamps.length < maxCamps && nextRandom() < 0.08`
      with `maxCamps = max(1, floor(nonWaterTiles / 120))`
  GPU: `can_roll = alive.any(dim=1) & (n_camps < max_camps)`
Two candidate mismatches, both cheap to check: (1) `max_camps` differs, so
the GPU rolls where TS short-circuits on `3 >= maxCamps`; (2) `anyCivCity`
- TS counts the player OR ANY RIVAL city (A-15), the GPU's `self.alive`
is PLAYER cities only. Dump both scalars for this seed and compare.
The remaining damage roll implies a barb ATTACK the GPU makes and TS does
not, which would follow from the extra spawn.
The suspect is the staleness contract: TS computes `nearCamp` from a
`barbs` array captured BEFORE the camp loop while its COUNT check calls
`barbUnits(state)` FRESH; the GPU uses `pre_alive` for `near_any` and a
fresh `u_alive.sum()` for the count. Those should agree — verify they do
with units spawned mid-loop.

(superseded) BOTH SIDES DUMPED — disaster cleared.
Instrumented the TS reference run too (wrapped the four phase calls in
`endTurn` behind a `globalThis` flag, differenced `state.rngState`, ran
the exporter, then removed the instrumentation).
RESULT: at t140 TS spends **`dis` = 5 draws in EVERY seed** and **`cs` = 0
in every seed** — the GPU also spends 5 in `_disaster_phase` and 0 in the
CS phase, so BOTH are exact matches and are ruled out. My "suspect
disaster first" guess was wrong.
The GPU spends `barb 5 + riv 1 = 6`; TS's total for seed 9274 is 9 with
dis 5 and cs 0, so TS spends `barb + riv = 4`. **The 2 extra draws are in
`_barbarian_phase` or `_rival_phase`, almost certainly the barbarian one
(GPU 5 vs a TS value of 3 in the matching shape).**
TO FINISH: re-run the TS probe printing the SEED alongside each row (the
probe emitted rows in export order without labels, so seed 9274's group
was not isolated), read its `barb`/`riv` pair, and diff that phase's
draw sites. The instrumentation recipe is in the commit for this change.

(superseded) PER-PHASE DUMP — GPU side only.
GPU draws during seed 9274 turn 140, by phase (wrapping each phase method
and differencing `rng_state`):
    `_barbarian_phase 5`, `_disaster_phase 5`, `_rival_phase 1` = **11**.
TS total that turn is **9** (computed below). So ONE of those phases
spends 2 draws too many. Camps/barbs/punits/nCities are IDENTICAL at
t138-141, which KILLS the new-camp-branch theory — no camp was created.
NEXT STEP, and the only thing still missing: TS's per-phase counts.
Instrument the EXPORTER's reference run the same way (wrap
barbarianPhase / disasterPhase / rivalPhase, difference the rng each
turn, print at t140) and compare against the triple above. Suspect order:
`_disaster_phase` first — `fert`/`drought` columns appeared in the
earlier seed-9287 mismatch list, and disaster draws scale with eligible
tiles/cities — then `_barbarian_phase`.

**EXACT DRAW COUNT MEASURED (2026-07-26).** mulberry32 advances its state
by a FIXED increment (0x6D2B79F5) per draw, so the draw count between two
recorded states is computable without instrumenting anything:
`n = (after - before) * inverse(0x6D2B79F5) mod 2**32`.
For seed 9274 turn 140 (rng at t139 = 3533537999, TS t140 = 2837761132,
GPU t140 = 2205925462):
    **TS made 9 draws that turn; the GPU made 11. The GPU makes 2 EXTRA.**
Two is the signature of the NEW-CAMP branch in `barbarianPhase`: the 0.08
spawn roll plus the candidate pick — TS takes ZERO draws there when its
guard short-circuits, so a guard mismatch costs exactly 2. Check the
`can_roll` guard first: TS is
`anyCivCity && barbCamps.length < maxCamps && nextRandom() < 0.08`, where
`anyCivCity` counts PLAYER **or any RIVAL** city (A-15), while the GPU's
is `self.alive.any(dim=1) & (n_camps < max_camps)` — `self.alive` is
PLAYER cities only. If the player is city-less while rivals live, TS rolls
and the GPU does not (or vice versa). Verify against this seed's
`nCities`/`camps` columns around t140 before assuming.

(the earlier reasoning, still valid:) with the
baseline exporter every #71 gate is off (`apostleIdx` -1 so the
theological pre-pass is skipped, `_apostle_buy_live` / `_tile_buy_live` /
`_ded_payouts_live` / `_city_rel_live` / `_barb_scout_live` all False),
and the always-on additions — `_tile_appeal`, the player and rc
NEIGHBORHOOD housing adds, `prev_age`/`dedications`, `_u_moves` — are all
pure arithmetic that add exact zeros and CANNOT move a draw count.
So look for a path that changes CONTROL FLOW, not arithmetic. Highest
value next step: instrument draws per phase for seed 9274 around t140 in
both engines (the H300 technique — dump `rng_state` per phase, then per
sub-phase, since mulberry32 step count == draw count) rather than
re-reading diffs. Also worth checking that `r_tiles_purchased` joining
`_MUTABLE` has not perturbed snapshot/restore ordering.

(resolved) CAVEAT ON THE SECOND MEASUREMENT. When I ran
"#71 engine + baseline src", `src/core/eras.ts` and `src/core/game.ts`
had ALREADY BEEN RESTORED to #71, so the dedication substrate was live on
the TS side during that run. The "engine-side" label is therefore NOT
established. RE-RUN it properly: revert ALL of src/ and scripts/ to
6a8fd48 in one go, keep only gpu/civ6gpu/engine.py at #71, re-export and
run parity. Green => the engine is clean and both bugs are TS-side; red
=> a genuine engine-side bug, and the remaining suspects are below.

The engine-side one is the cheaper target and the suspect list is short,
since with src at baseline everything else is inert:
 0. **`_rival_border_key` REFACTOR — RULED OUT, byte-identical (verified
    2026-07-26).** Diffed the extracted helper body against 6a8fd48's
    inline block: 39 lines vs 39 lines, ZERO diff lines. The extraction is
    faithful; `_bmul` is recomputed in the helper but `_bel_mul` is pure,
    and the enclosing `_rc_cost()` still reads the outer copy. Do NOT
    re-open this one.
 1. (superseded, kept for the record) `_rival_border_key` refactor. It is a
    PURE extraction from `_rival_border_growth`, a hot, already-verified
    path, so ANY behaviour change is a transcription error. Diff the
    helper against 6a8fd48's inline block LINE BY LINE. Note the original
    computed `_bmul` ONCE in the enclosing scope and the extracted copy
    recomputes it — verify `_r_has_beliefs(r)` is not order-dependent.
 2. `_tile_appeal()` being invoked in `_city_totals` whenever
    `_nbhd_didx >= 0` (true — NEIGHBORHOOD is in PLACEABLE_DISTRICTS even
    with the scaffold row out), plus the per-city/per-rc housing adds.
 3. `prev_age` / `dedications` written at every era boundary.
 4. the barb `_u_moves` lookup replacing the hardcoded 2.

(superseded first reading:) the break is in `src/` or `scripts/`, NOT engine.py.
Checked out `gpu/civ6gpu/engine.py` at the green baseline 6a8fd48, kept
this round's src/scripts, re-exported: parity STILL RED (seed 9261 t244).
So the divergence is introduced by the TypeScript/exporter side while
every behaviour flag is off. Engine restored afterwards.

RULED OUT while narrowing: the APOSTLE row is NOT missing its production
mask — `faithOnly` ships per unit as the `fo` column and the engine masks
on it in all four places (queue, gold-buy, RL apply, trainable), so the
B6 new-unit checklist is satisfied automatically.

BISECT STEP 2 (do this next): halve within src/scripts. Note
`src/data/units.ts` cannot simply be reverted — rivals.ts references
UNITS.APOSTLE — so revert PAIRS. Suggested order, cheapest first:
 a. `scripts/export-gpu.ts` alone (the barb table widening to 7, the
    unitMoves table, the tile ap/apf columns) — a pure data change that
    should be provably inert with the flags off;
 b. `src/core/eras.ts` + `src/core/game.ts` (the dedication substrate —
    it WRITES prevAges/dedications every boundary even with payouts off);
 c. `src/core/rivals.ts` (the largest delta).

OLD PLAN (superseded by step 1):
1. `git stash` / branch, then `git checkout 6a8fd48 -- src/ scripts/` and
   re-export + parity. Green confirms the break is in src/scripts, red
   points at gpu/civ6gpu/engine.py.
2. Halve from there. The suspects that change behaviour WITHOUT a flag:
   * the APOSTLE roster row (unit indices ARE the GPU's type ids, and the
     rival "best of roster" scans iterate UNITS order);
   * `Unit.religiousStrength` added to MISSIONARY (25) — check nothing
     reads it as a combat term;
   * the widened barb `unitCombat`/`unitMoves` tables (7 wide now);
   * `_tile_appeal` being CALLED unconditionally in `_city_totals`
     (harmless arithmetic, but it perturbs nothing only if truly unused);
   * the `_rival_border_key` REFACTOR — extracting that key out of
     `_rival_border_growth` is the one change that touched a hot,
     already-verified path.
   The last one is the highest-prior suspect: it is a pure refactor, so
   any behaviour change there is a transcription error.

GREEN: tsc; full vitest (45 files / 389 tests); export (rules.json
asserted); FORCED compaction 0.0 milli.

RED, scripted parity: ONE seed, at the very LAST turns —
`seed 9287 turn 250: MISMATCH [('rng', ...), ('barbs', 5.0, 4.0)]`.
The GPU holds one FEWER barbarian and draw counts split. Prime suspect is
#71's SCOUT-THEN-RAID opener (B-26): a new camp's first unit is a SCOUT
(barb u_type 6) instead of a warrior, and a scout has combat 10 vs a
warrior's 20 — so it dies where a warrior lived, which changes how many
rolls follow. CHECK FIRST: that every barb-indexed table is 7 wide on the
GPU (unitCombat is; verify unit_naval / charges / any other u_type-indexed
tensor), and that _barb_scout_type resolves to 6 and not the 0 fallback.
If the tables are fine, this is a genuine behaviour split at the camp
spawn and wants a statelog.

RED, rollout: 3 failures — seed 9235 rng 2026006132 t110 col88, seed 9235
rng 2026006134 t38 col9 (rng), seed 9261 rng 2026006138 t134 col11. Same
draw-count family, off-script only.

**A SELF-INFLICTED BUG WORTH REMEMBERING.** Python `str.replace` replaces
ALL occurrences. Patching the ranged sites by string match silently hit
the PRE-EXISTING B6-S1 unit-vs-unit religion adders as well as the new
city ones, stripping them and turning scripted parity red across many
seeds. Fixed by normalising all FIVE ranged damage-roll sites explicitly
BY LINE: 583 rngrc and 591 rngcs are PLAYER-only and carry NO religion
term (the GPU never sets the player's holy city); 603 rng, 633 vrngc and
655 vrng DO carry it. When patching repeated code shapes, edit by line
index or assert an occurrence count — never a bare replace.

## (superseded) earlier ladder note — scripted GREEN, rollout RED

RUN AND GREEN: tsc; full vitest (45 files, 389 tests); export (24 seeds,
rules.json asserted — new keys land under rivals.beliefs / rivals.eras);
scripted parity 24x250 at 0.0 milli; FORCED compaction
(CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3) at 0.0 milli.

RED: `gpu/rollout.py --shards 4 --pipeline-replay` — 2 failures, first at
`seed 9235 rng 2026006134 turn 38, column 9` (= the `rng` HEAD column).
A DRAW-COUNT divergence, and OFF-SCRIPT ONLY: scripted play never reaches
it. Draw counts diverging means an earlier OUTCOME differed and changed
how many rolls followed — the rng column is the symptom, not the cause.

Nothing landed this round adds a conditional draw by construction
(theological combat, dedications, the scout opener and the religion/aura
adders are all zero-draw), so the likely cause is a DAMAGE change killing
a unit in one engine and not the other, which then changes how many
attacks follow. Prime suspect: #71's religion adders on the six
city-attack sites, or B-8's admiral march changing unit positions.
HUNT RECIPE: `python gpu/rollout.py --turns 250 --log 2026006134` +
`CIV6_LOG=2026006134 npx vite-node scripts/replay-gpu.ts` +
`python gpu/logdiff.py` — the statelog names the first divergent FIELD,
which is what to chase, not the rng column itself.

NOT YET RUN: standalone poke-lane sweep, battery, AUDIT close-out.

## RESOLVED PARITY FAILURES (kept — the ruled-out list is load-bearing)

The ladder was run mid-round (deliberately, to validate 8 landed items
before adding more). tsc clean, full export clean, rules.json asserted —
all new keys land under `rivals.beliefs` / `rivals.eras`, which is where
the engine reads them. `python gpu/parity_test.py` is RED on TWO seeds:

```
seed 9066 turn 77: MISMATCH [('rUnits0', 3.0, 4.0)]
seed 9066 turn 79: MISMATCH [('rUnits0', 3.0, 5.0), ('rUnits1', 5.0, 4.0)]
seed 9066 turn 80: MISMATCH [('rUnits0', 5.0, 4.0), ('rUnits1', 4.0, 5.0)]
seed 9235 turn 90: MISMATCH [('imp', 20.0, 21.0), ('rQProg0', ...), ('rGScore0', ...)]
```
Tuples are (name, TS, GPU). At 9066 t77 the GPU holds one MORE rival unit
than TS; by t80 the counts SWAP between the two rivals, which reads as a
TIMING difference in rival unit spawning, not a miscount.

ALREADY RULED OUT (tried, no change — do not re-try):
* the APOSTLE price — the enhancer `missionaryCostMult` was applied in TS
  but not on the GPU; both are FLAT now and the failure is identical;
* `tilePurchaseMult` on the rival seat — TS read it, the GPU hardcodes 1;
  TS is flat now and the failure is identical.
* A crash fixed on the way in: `_spawn_rival_civ` indexes `charges[rows]`,
  so the apostle buy must pass a [B] tensor, not the 0-dim
  `_p_charges[idx]`.

PRIME SUSPECTS, in order:
1. **B-18 apostle buy TIMING.** rUnits is a RIVAL unit count and the
   apostle is the round's only new rival unit. Check the buy GATE order
   against TS: TS runs the apostle block INSIDE `if (rival.religionFounded)`
   AFTER the missionary buy; the GPU gates on `r_religion_done.any()` then
   masks per row. Verify a row can not buy on a turn TS skips.
2. **B-18 theological-combat PRE-PASS.** The GPU resolves all combats
   before the walk where TS interleaves. The equivalence argument (a
   spread only writes pressure; a fight only kills a DIFFERENT civ's unit)
   holds WITHIN one civ's pass — re-check it ACROSS civs, since
   `_rival_phase` loops civs and a kill lands in another civ's pool.
3. **A-5r tile purchase** for the seed-9235 `imp` divergence — a purchased
   tile changes territory, which moves builder improvement choices.
Fast loop: write a one-seed probe (the #70 `probe9183.py` pattern, ~15s)
rather than the 280s gate.

## LIVE STATUS (keep current — this file survives compaction)

DONE, BOTH ENGINES: DEBT-1, DEBT-2, DEBT-3 (non-issue), B-8, A-9, B-18,
A-5r.
B-26 PARTIAL: ranged barbs landed in #70; the SCOUT-THEN-RAID opener
landed here (a brand-new camp's first unit is a SCOUT, barb u_type 6,
both engines, draw-neutral spawn-TYPE change). REMAINING in B-26:
 * NAVAL BARBS — a coastal camp should spawn a hull on an ADJACENT WATER
   tile. The roster (GALLEY/QUADRIREME) and the `wpass` water planes
   already exist, but the GPU barb raider block is a LAND walker: it
   needs a water-capable variant, which is the real cost. Widen the barb
   `unitCombat` table again (7 = GALLEY) when it lands.
 * CLIFFS — a genuinely new MAP property: mapgen must place them, then
   movement must block crossing (except at river mouths) and district
   adjacency must account for them. Biggest single piece left in B-26.
B-24 PARTIAL: the DEDICATION SUBSTRATE + payouts landed here, both
engines — `prevAges`/`prev_age` (the HEROIC-age substrate the owner
called out: the current age alone cannot tell Dark->Golden from an
ordinary Golden), `dedications`/`dedications` (1 normally,
HEROIC_DEDICATIONS on a Heroic age), and the per-turn payout at the TS
endTurn position: a GOLDEN/HEROIC age pays faith (the Monumentality
flavour), a DARK or NORMAL age pays era score (the climb-out
dedication), both scaled by the dedication COUNT so a Heroic age pays
triple. REMAINING in B-24: the named Golden-Age dedication CATALOG
(Monumentality et al. as distinct choices rather than one flat payout),
dark-age POLICY cards, and governor establishment/promotions.
NOT STARTED: B-17, B-23, B-27.
No gate has run since #70's battery. Closing ladder at the very end.

### A-5r GPU half — exact spec
Mirror `rivalTilePurchaseCost` + the purchase step. Needs:
* `r_tiles_purchased` [B, R] long in `_MUTABLE` (the cost escalator; the
  TS twin is `RivalCiv.tilesPurchased`).
* Export `tilePurchaseMult` per rival modifiers if not already shipped.
* POSITION IS LOAD-BEARING: TS buys at the A-5 GOLD-LADDER tail (only when
  nothing else was bought), which runs BEFORE `_rival_border_growth`. Do
  NOT bolt the purchase onto `_rival_border_growth` just to reuse its pick
  — that runs LATER in the phase, and a territory claim feeds the yields
  computed in between, so the engines would diverge.
* The candidate pick must equal `pickRivalBorderTile`'s: radius 5, fully
  unowned (`owner == -1 & cs_at < 0 & rival_at < 0`), adjacency to THIS
  rc via the A-17 `rc_tile_id` registry, key = dist asc, resource
  priority desc, yield-sum desc, index asc. That key is built inline
  inside `_rival_border_growth` (~line 8390) — FACTOR IT OUT into a
  helper both call, rather than duplicating it.

## ORDER (cheapest and best-verified first)

1. **DEBT-2 GPU half** — finish what is already half-landed. No new
   premise to verify.
2. [x] **B-8 (0.1) — DONE, BOTH ENGINES.** Naval war-march targeting:
   rival ADMIRALs now march the war effort on the SAME chassis, target
   scan and ≤range stop as GENERALs (`rivalGeneralActions` /
   `_rival_general_actions`). VERIFIED: real Civ 6 Great Admirals are
   units you move with the fleet; an admiral held at the capital can
   never put its naval aura over the front. Only the aura's DOMAIN
   differs and that is decided at the roll sites by `inGeneralAura` /
   `_gen_aura_hit`, not by the walker. B-8's ONLY remaining residual is
   the controlled-rival RL mask, which rides #50 — so B-8 is complete
   for everything outside #50.
3. [x] **A-9 (0.2) — DONE, BOTH ENGINES.** Sourced values shipped:
   housing 6/5/4/3/2 at appeal >=4 / >=2 / >=0 / >=-2 / else, URBANIZATION
   unlock, `countsTowardLimit:false` + `allowMultiple:true`.
   TS already had `computeHousing`'s appeal term; added the RIVAL twin
   (rivals get no generic district housing, so NEIGHBORHOOD is the one
   district row contributing there — same shape as the GPU) and flipped
   NEIGHBORHOOD into `SCAFFOLD_DISTRICTS` (its hold-out comment was stale).
   GPU: exporter ships per-tile `ap` (static appeal contribution + the t0
   feature term) and `apf` (that feature term alone, so a chopped tile
   subtracts exactly it); `_tile_appeal()` gathers contributions over
   `neigh` with the LIVE deltas TS applies — completed built wonder +1,
   MINE/QUARRY/OIL_WELL -1, INDUSTRIAL_ZONE/ENCAMPMENT -1 — cached on
   `_eff_version` like `_farmadj_qual`; the tier housing is summed per
   player city column and per rc slot (via the A-17 `rc_tile_id` registry).

4. **B-18 (0.2)** — apostles + theological combat on the existing
   missionary chassis. VERIFY apostle combat rules.
5. **B-26 (0.6)** — cliffs, naval barbs, scout-then-raid escalation.
   Cliffs need a new map property (mapgen + movement + adjacency);
   naval barbs need barb hulls on the water plane.
6. **B-25/B-27 (1.0)** — the improvements roster tail. Blocked on appeal
   and naval, so land it AFTER 3 and 5.
7. **A-5r (0.1)** — tile purchase. `buyTile`/`tilePurchaseCost` are
   TS-player-only with no GPU twin on any seat. Scripted-rival tile
   purchase is landable now; the PLAYER verb rides #50.
8. **B-23 (0.9)** — Trader unit + roads. A real subsystem: a new unit
   class that physically walks a route and lays roads, plus a road plane
   affecting movement cost on both engines.
9. **B-24 (0.9)** — the dedication system. Owner-enumerated: Golden Age
   bonuses, the Normal/Dark dedication converting to era score, and the
   HEROIC Age (Dark→Golden grants three dedications) which needs a
   `prevAge` substrate — a new per-civ column on both engines.
10. **B-17 (0.3)** — Encampment HP pool + movement block. LAST because
    it is the largest despite its small weight: in real Civ 6 these are
    ONE mechanic (enemies cannot enter until the district's own HP is
    reduced), i.e. a new ATTACKABLE ENTITY with targeting, damage, heal,
    capture and a movement-legality term in every walker on both
    engines. #70 deliberately scoped it out for exactly this reason.

## CLOSING LADDER (once, at the end)

tsc → full vitest → re-export (READ output) → scripted parity ALONE as
the tripwire → then rollout + forced compaction CONCURRENTLY (every item
here touches units/slots) → standalone poke-lane sweep → ONE battery →
AUDIT close-out with the table RE-SUMMED from per-item weights.

Expect a multi-mechanic hunt: batching trades away attribution, so a red
gate will not name its cause. `.claude/scratchpad/` one-seed probes
(~15s) beat the 280s gate while localizing — write one early.
