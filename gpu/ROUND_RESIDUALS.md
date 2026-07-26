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

DO THIS INSTEAD — bisect against the baseline, do not guess:
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
