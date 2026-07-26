# ROUND SMALLS (#70) — the residual sweep

2026-07-26. Owner ask: "complete all small tasks". This round burns the
AUDIT residuals that are genuinely SMALL — formula/table/site-list work
with no new attackable entity and no new subsystem — plus the two
borderline items the owner explicitly folded in (B-8's movement half,
B-26's ranged barbs).

SERIAL main-session S1..S5 + one Opus S6 coverage agent, ONE battery at
the END (the #68 shape — the program's only fully hunt-free multi-stage
round to date). Each slice is independently gateable.

## Scope

**S1 — B-20 music split.** `GREAT_WORK_CULTURE` = 2 is applied uniformly
to writing + music works today (`cityGreatWorks` sums both). Real Civ 6
splits them: a Great Work of Music yields +1 culture +1 gold, writing
stays +2 culture. The per-kind counts ALREADY exist on both engines
(`greatWorksWriting`/`greatWorksMusic`, GPU `gw_writing`/`gw_music` +
`rc_gw_*`), so this is a yield-assembly change only — no new state.
Sites: `cityBuildingYields`-adjacent block in city.ts, the rival twin in
rivals.ts, GPU `_city_totals` + BOTH `_rival_city_yields` paths, the
exporter constant. Gate-REACHABLE (rival works fire in 6 seeds / 28
works at t250) — budget a hunt.

**S2 — B-8 auras at the city/CS strike sites.** `generalAuraCS` is
deliberately scoped to unit-vs-unit rolls; the recorded residual is the
city-strike zone. Add the aura to the DEFENDER's assembly at all four
strike keys (`pcstk`/`pestk` in `barbarianPhase`, `rcstk`/`restk` in the
rival twin) and to the ATTACKER's assembly at the unit-vs-city sites, so
a general/admiral covers its units under bombardment exactly as it does
in the field. Integer add, joins the B-29 quantized assembly. No new
state. Mostly gate-unreachable (GENERAL never spawns in-gate; ADMIRAL
does, 18/24 seeds) — poke-pinned in S6.

**S3 — B-8 the +1 MP aura half.** Real Civ 6's aura grants +1 movement
alongside the +5 CS. Lands at the movement RESET (`refreshUnits` /
the GPU movement-reset site), gated on the same
`generalAuraCS`-shaped predicate (own land military within
`GENERAL_AURA_RANGE` of an own GENERAL; own naval/embarked near an
ADMIRAL). RESHUFFLES EVERY WALK the moment an admiral is in range —
budget a real hunt. The GPU aura plane is cached on a general-POSITION
FINGERPRINT (the B7-G lesson); the MP read must use the same key or it
goes stale.

**S4 — A-9 palace relocation.** Both engines grant the PALACE once and
strip it forever on capture; real Civ 6 relocates it. SOURCED
(2026-07-26, correcting this brief's first draft): the Palace is
rebuilt in the remaining city with the HIGHEST POPULATION — NOT the
next city in acquisition order, which is what the first draft guessed.
Acquisition order (`city_seq` / rc slot order) is the TIE-BREAK only,
per the standing rule. That city becomes `isCapital`.
CRITICAL and already correct in this engine: `capitalTiles` is the
STATIC domination record (GV-3) and must NOT move — real Civ 6 keeps
the ORIGINAL capital as the domination target while the relocated
Palace carries the capital BONUSES, which is exactly the split GV-3
already models. So only the building + the `isCapital` flag relocate.
Sites: all five capture/transfer families both engines. Gate-reachable
via rollout captures.

**S5 — B-26 ranged barbs.** The `campIdx % 3 == 0` raid site spawns
ARCHER (t≤120) / CROSSBOWMAN (t>120) instead of the melee ladder type.
TS already dispatches ranged generically (`hostileUnitAct` →
`hostileRangedStrike`), so the work is GPU-side: the `_barbarian_phase`
raider block is a melee-ADJACENCY scanner and needs a range-aware
target scan plus a barb-owner variant of `_hostile_ranged_strike`
(the existing one is rival-slot-indexed). Largest slice — LAST, so the
earlier wins are already banked if it needs its own hunt.

## Explicitly NOT in scope (and why)

- **B-17 Encampment HP pool + movement block.** These are ONE coupled
  mechanic, not two smalls: in real Civ 6 an Encampment is a mini-
  fortress — enemy units cannot enter until its own HP pool is reduced.
  That is a new ATTACKABLE ENTITY (targeting, damage, heal, capture,
  and a movement-legality term on both engines' walkers) — a round of
  its own, not a residual. Stays recorded on B-17.
- Everything riding #50/A-18 (player verbs) and the B-24 dedication
  system (needs the prevAge substrate).

## EXPERIMENTAL MODE (owner directive 2026-07-26, mid-round)

**This round abandons gate-serialization after S1.** S2..S5 are all
implemented FIRST, in one batch, with NO gates between them; the ladder
runs ONCE at the end over the combined change, and a parity-hunt
follows only if it goes red. DO NOT SEPARATE THE FIXES.

Owner-accepted trade: gate-serialization exists to buy ATTRIBUTION — a
red gate names the one slice that caused it. Batching trades that away,
so a red ladder means bisecting across four behaviour changes that all
reshuffle trajectories (aura CS, unit MP, capital relocation, barb
spawn types). Mitigation if red: the slices are separable commits in
principle, so the hunt can `git stash`/revert individual hunks — but
the first move stays the standard one, statelog-first from the named
turn (gpu/HUNTING.md), since a single divergence usually still points
at a single mechanic.

## BATCH STATUS (2026-07-26) — RESUME HERE

### Live status (updated 2026-07-26, mid-batch)
| slice | TS | GPU |
|---|---|---|
| S1 music split | DONE (committed `040c49b`, fully gated) | DONE |
| S2 aura at city/CS sites | DONE (10 sites incl. `rngrc`) | DONE (12 sites) |
| S3 aura +1 MP | DONE (`aura.ts`, `movesFull`, 5 vitest green) | DONE (snapshot + 7 walkers) |
| S4 palace relocation | DONE (`relocatePalace`, 3 sites, 6 vitest green) | DONE (3 twins + 2 helpers) |
| S5 ranged barbs | DONE (`barbRangedType`, every 3rd camp) | IN PROGRESS |

**S4 structural note (checked, NOT a seam).** The GPU has no PALACE
building column at all — the exporter filters it out (`b.id !== 'PALACE'`)
because both engines model it as a CAPITAL TERM: `is_cap * _palace_y` /
`_palace_housing` / `_palace_amenities`, and `rc_is_cap` for rivals. So
TS's two writes (`isCapital = true` + `buildings.push('PALACE')`) collapse
to ONE GPU write of the flag. Verified safe: PALACE is a `cost: 0` catalog
entry, so `buildingMaintenance` returns 0 and the extra array element
costs nothing; its yields reach the GPU through the flag instead of the
building loop; and `relocatePalace` sets the flag AND the building
together, exactly as founding does (`isCapital = len===0` with
`buildings: ['PALACE']`) and as capture undoes (`isCapital = false` with
the PALACE filtered out). The pairing is what keeps the two
representations equivalent — never write one without the other.

**S3 FREEZE-POINT BUG — caught by the S3 agent, fixed, worth keeping.**
The agent implemented the snapshot as specified and then reported that
the spec itself was wrong: TS `rivalPhase` RE-RESETS every rival unit's
`movesLeft` to plain `full` at its top, AFTER `refreshUnits`. So (1) the
rival half of the aura was being silently wiped in TS while the GPU
walkers granted it — a guaranteed 1-MP divergence, and (2) `movesFull`
was left at refreshUnits' `full + aura` while `movesLeft` reset to
`full`, so next turn a rival that never moved would FAIL the "spent no
MP" gate — no heal, fortify wrongly reset. A real bug introduced by S3.
FIX: `rivalPhase` now applies the aura and rewrites `movesFull`, and the
GPU rival snapshot moved out of the refreshUnits mirror into a separate
`_refresh_aura_mp_rival()` called at the TOP of `_rival_phase` — the
matching freeze moment, and before any general war-walks. The PLAYER
snapshot stays at the refreshUnits site. LESSON: "mirror the TS position"
requires finding the position where the value is ACTUALLY established,
not the first place it is written.

`npx tsc --noEmit` clean; ALL TS work for the round is complete and
uncommitted. NO gate has been run since S1 (batched round). Do not
commit a slice whose GPU half is missing.

CAUGHT BY THE S2 AGENT, worth keeping: my TS pass MISSED the `rngrc`
site (player ranged bombardment of a rival city). The agent left the GPU
side untouched rather than silently diverge, and reported it — both
sides are now fixed. A second inventory gap, same lesson as the
fabricated premises: enumerate by damage-roll KEY, never by memory.

- **S1 B-20 music split — DONE, gated, committed `040c49b`.**
- **S2 aura at city/CS sites — TS SIDE COMPLETE (uncommitted), GPU SIDE
  NOT STARTED.** TS edits landed at all 9 sites: `attackCity`,
  `attackRivalCity`, `attackCityState` (attacker `+ generalAuraCS(state,
  attacker, attacker.tileIndex)`), the two ranged-vs-city rolls (rngcs,
  vrngc, same term inside the strength parens), and the four city-STRIKE
  defender sites (pcstk/pestk in combat.ts, rcstk/restk in rivals.ts) via
  a new `defCSa = defCS + generalAuraCS(state, defender, bestTile)`
  applied OUTSIDE the embarked ternary (mirroring `defenderCS`, so an
  embarked defender keeps its flat CS but still gets its ADMIRAL aura).
  NOT YET RUN: tsc. The 14 GPU sites are listed below; each needs
  `+ self._gen_aura_cs(civ_unified, tile, naval)` with the right civ
  (player = zeros, rival = `v_civ + 1`, barb = `-1`) and an `atk_naval`
  in scope — several blocks already compute one, others will need it.
- **S3 / S4 / S5 — NOT STARTED.** Designs are recorded below and in the
  slice sections; S4's rule is SOURCED (highest population).

The tree is therefore TS-ahead-of-GPU on S2. That is expected inside a
batch and safe while NO pipeline runs — but do not run any gate or
battery until the GPU side lands, and do not commit S2 half-done.

## VERIFIED SITE INVENTORY (discovered 2026-07-26 — resume from here)

S2 is NOT a two-line change: the aura must join every roll where a unit
fights a city or a city strikes a unit. TS sites (src/core):

- combat.ts `attackCity` atkCS — k=pcty/pctyc
- combat.ts `attackRivalCity` atkCS — k=rcty/rctyc
- combat.ts `attackCityState` atkCS — k=csty/cstyc
- combat.ts ranged-vs-CS — k=rngcs
- combat.ts ranged-vs-player-city — k=vrngc
- combat.ts `barbarianPhase` walls strike defCS — k=pcstk
- combat.ts `barbarianPhase` Encampment strike defCS — k=pestk
- rivals.ts rival walls strike defCS — k=rcstk
- rivals.ts rival Encampment strike defCS — k=restk

GPU twins (`_gen_aura_cs(civ_unified, tile, naval)`), by line at 9b59e00:
4937/4938 rcty+rctyc, 5351/5352 csty+cstyc, 5404 rngcs, 5922 pcstk,
6003 pestk, 8443/8444 + 8504/8505 rcty+rctyc (two more callers),
8692/8693 csty+cstyc, 8921/8922 pcty+pctyc, 8998 vrngc, 10629 rcstk,
10703 restk. ~14 GPU sites, ~10 TS sites.

FINDING while inventorying (NOT fixed here, record only): the
ranged-vs-CITY rolls (rngcs, vrngc) omit `religionAttackCS`, which the
ranged-vs-UNIT rolls DO apply. Either a deliberate B6 scope-out or a
gap — needs its own verification pass before anyone "fixes" it.

S3 DESIGN (the +1 MP half) — OWNER OVERRULED the cheap option
2026-07-26; use real per-unit state, and it turns out to be CHEAPER than
feared AND it closes an engine asymmetry.

SOURCED first: Civ 6's rule is "**if you have used any movement points
during a turn, the unit will not start healing until the next turn**"
(and the fortify +3/+6 CS bonus keys off the same "hasn't used any
Movement or performed other actions" condition). So the real predicate
is MP-SPENT / ACTED — a property of what the unit DID, never of how much
MP it was granted.

That is exactly what the GPU ALREADY models: `p_acted` / `u_acted` /
`v_acted` bool tensors, set at every act site and cleared at the heal
(the P4/D-2 design). Only TS lacks the notion — it DERIVES it as
`movesLeft >= full` inside `refreshUnits`, which is correct only while
`full` is a constant per unit type. The aura's +1 MP is what breaks the
derivation, not the aura itself.

THEREFORE: the new state is **TS-ONLY**. Add `Unit.movesFull?: number`
recording what the unit was actually granted at its last refresh;
the heal gate and the B-5 fortify gate both become
`unit.movesLeft >= (unit.movesFull ?? full)`. One write at refresh, one
read at each gate. NO new GPU tensor, NO _MUTABLE entry, NO reclaim or
slot-hygiene burden — the GPU's acted flags are already the faithful
model and stay untouched. Net effect: TS converges ON the GPU's design,
so the engines end up MORE aligned than before, and the one-turn
mis-gate quirk of the rejected option never exists.

GPU work for S3 — CORRECTION (found 2026-07-26 while mirroring): it is
NOT a one-line add, and it DOES need new pooled state.

TS freezes the granted pool ONCE per turn: `refreshUnits` runs at the TOP
of `endTurn`, before anything moves, and `movesLeft` is spent down from
that frozen value. The GPU has no persistent movesLeft at all — it
recomputes `full_mp = self._p_moves[...]` INSIDE each walker (7 sites:
~6780, 6894, 6970, 8872, 8885, 9190, 9196), i.e. at WALK time, partway
through the turn.

That difference is invisible today because `full_mp` depends only on unit
TYPE, which cannot change mid-turn. The aura breaks it: the bonus depends
on a GENERAL's POSITION, and rival generals war-walk during the very
phase these walkers run (`rivalGeneralActions` / `_rival_general_actions`).
So a rival unit could read a pre-move aura in TS and a post-move aura on
the GPU — a textbook dormant divergence, the same class as the B7-G
stale-aura-plane catch.

REQUIRED DESIGN: snapshot the per-unit aura MP bonus on the GPU at the
SAME point TS freezes it — the refresh site where `p_acted`/`u_acted`/
`v_acted` are zeroed — into per-pool tensors, and have all 7 walkers read
the snapshot instead of recomputing. Barbarians never have generals, so
only the player and rival pools need it. The tensors are per-slot pooled
state: register in `_MUTABLE` and carry them through `_reclaim_pool` /
`_reclaim_rc` slot permutations like every other per-unit field.

## Bar (once, at the END of the batch)

ALWAYS-RUN CORE, FOREGROUND: `npx tsc --noEmit` → touched vitest → `npx
vite-node scripts/export-gpu.ts` (READ the output) → scripted
`PYTHONUTF8=1 python gpu/parity_test.py` (24 seeds × 250t, 0.0 milli)
ALONE as the tripwire → then `python gpu/rollout.py --shards 4
--pipeline-replay` (72 games).

The forced-compaction run (`CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3`)
is CONDITIONAL on the slice touching units/pools/slots/spawn-death-
capture — so: NOT S1 (yield weight, already skipped in hindsight), NOT
S2 (read-only CS term); YES S3 (unit movement state), S4 (capture paths
create/destroy city slots), S5 (barb pool spawn types). When it IS
indicated, run it CONCURRENTLY with the rollout — both are confirm
gates and battery.py proves they coexist on this box.

Zero new draws
anywhere in S1/S2/S3/S4; S5 changes the spawn TYPE only (the raid roll
itself is untouched — draw-count neutral). Every yield-bearing write
bumps `_eff_version`. S6 sweeps ALL poke lanes STANDALONE after the
final re-export, THEN one battery (catch-7).
