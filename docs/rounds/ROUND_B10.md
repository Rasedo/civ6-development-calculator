# ROUND B10 — hardening smalls: A-24 + B-26 residuals + G-5 hunt (task #66)

2026-07-19. Three INDEPENDENT slices → 3 parallel Opus worktree agents
off this committed brief (the B3/B4 pattern). Round base sha
**8c1dcc0** — every agent verifies `git log -1` matches and
`git reset --hard 8c1dcc0` if the worktree spawned stale. ONE battery
at round END, main session only — agents run the gate ladder, never
the battery.

## Slice R — A-24 rival district/tile registry consistency

The latent (AUDIT A-24, found by B4-AB's hunt, seed 9118): an rc's
`.districts` array can reference a tile whose `rivalCityId` /
`rc_tile_id` (A-17 registry) registers to a SIBLING rc (rcId 4 held a
HOLY_SITE whose tile registered to rcId 3). B-30 sidesteps it at
capture (kept districts derive from re-owned tiles, not the array),
but the placement/registration pair is still incoherent.

Ruling (real Civ 6: a district sits on a tile OWNED BY that city):
- `tryQueueRivalDistrict` (phase.ts) and the GPU placement twin must
  only pick tiles whose registry entry is THIS rc (not merely
  civ-owned-and-in-radius); registration stays atomic with placement.
  Find every site that pairs `.districts` push with tile registration
  (wonders too, if they share the picker) and align both engines
  symmetrically. Same-civ tile with a sibling's registration is NOT a
  valid site — that is the whole bug.
- Deliverable beyond the fix: the invariant must be MACHINE-CHECKED —
  an env-gated consistency scan (every district tile of every rc
  registers back to that rc; every registry entry's rc lists a
  coherent tile) wired so at least one gate in this round's ladder
  exercises it (e.g. on in the forced-compaction run), plus a poke
  self-test for the placement rule. No always-on hot-path asserts.
- This changes rival district SITES → full trajectory reshuffle.
  Budget a hunt; a red gate here is expected to expose old latents,
  not necessarily your bug.

## Slice B — B-26 barbarian residuals (era ladder, ranged barbs, ZOC)

STILL OPEN in B-26: single-step era scaling, no ranged/naval barbs,
no cliffs, no scout-then-raid escalation — plus the B-3 residual:
barbs do not obey ZOC (the check is rival-gated so both engines stay
symmetric; the GPU barb walk mirrors the pre-ZOC march).

In scope (rulings; source-of-truth = real Civ 6 sized to model):
1. **Era ladder**: all three spawn sites in `barbarianPhase`
   (combat.ts — new-camp spawn, empty-camp garrison respawn, and the
   0.1-roll raid spawn currently `turn > 60 ? SPEARMAN : WARRIOR`)
   move to a shared melee ladder: WARRIOR → SPEARMAN (t>60) →
   PIKEMAN (t>120) → MUSKETMAN (t>180). GPU `_barbarian_phase`
   spawn-type mirror. Do NOT touch the CS levy ladder at phase.ts
   (`state.turn > 60 ? 'SPEARMAN' : 'WARRIOR'` there is A-12 scope).
2. **Ranged barbs**: the RAID spawn (the 0.1-roll site only) spawns
   ranged instead of melee when `campIdx % 3 == 0` (stateless,
   deterministic, zero new draws): ARCHER (t≤120) → CROSSBOWMAN
   (t>120). Acting rides the EXISTING `hostileUnitAct` /
   `hostileRangedStrike` fall-through and the GPU raider block that
   mirrors `_rival_unit_war_act` — verify ranged is handled there for
   barb owners; if it is NOT and would need a new walker class or new
   draws, DESCOPE ranged barbs to a recorded residual and say so.
   No new unit types are introduced (ARCHER/CROSSBOWMAN/PIKEMAN/
   MUSKETMAN are existing rows), so the faithOnly/new-unit-type
   checklist is N/A.
3. **Barb ZOC**: barbs obey `inEnemyZoc` / `_in_enemy_zoc` exactly as
   rival movers do — un-gate the check in the barb walk both engines
   (`hostileUnitAct` movement + the GPU `_barbarian_phase` raider
   multi-step loop). Player/rival military already exert ZOC; barbs
   just start obeying it.

STAYS RESIDUAL (record in AUDIT at close): cliffs, scout-then-raid
escalation, naval barbs (the #45 substrate exists but barb naval AI
is its own slice), camp-spawn escalation beyond the ladder.
Draw-count discipline: spawn-TYPE changes and ZOC halts add ZERO new
draws; the exp/quantization table (4001 since B5) already covers the
new matchups — verify, don't widen.

## Slice H — the G-5 hunt (1-gold acquisition-turn divergence)

Two recorded repros, same class — a rival's treasury off by EXACTLY
1 gold (milli ±1000) on the turn it ACQUIRES a city mid-phase, all
combat/rosters/per-city fields bit-identical:
- seed 9222 (fixture index 17, pre-reroll), rollout game rng
  2026006129, t184: player city 826 DEFECTS by loyalty to rival 1;
  rival-1 treasury −588200 TS vs −587200 GPU. t183 byte-identical.
  (ROUND_B5_M2_LOG.md "Rollout-replay reshuffle catches".)
- seed 9301 (fixture index 23, pre-reroll), rollout game rng
  2026006147, t223: rival 0 CAPTURES player city 586 (hp120);
  treasury off exactly 1 gold + empire score off 5.4. NO regional
  buildings in the game; t200/t225 ckpts verified not-a-B9-regression.

Procedure: gpu/HUNTING.md (statelog-first; per-shard ckpt dumps hold
the whole shard batch, named by the shard's first game rng; forced
knobs CIV6_RECLAIM_AT / CIV6_RC_RECLAIM_AT). Reproduce by LOCALLY
restoring SEED_OVERRIDES (scripts/export-gpu.ts) 17: 9223→9222 and
23: 9302→9301, re-export, replay the two cited rollout games. Suspect
set (AUDIT G-5): the acquiring civ's FIRST economy turn —
`transferCityToRival`/`captureRivalCity` (+ GPU `_transfer`/
`_capture` twins) interaction with maintenance/score paths, the #58
G4 batched-twin economy cache key (turn,r,eff,bel,kill,claim) — does
a mid-phase acquisition bump every component the receiver's cached
economy needs? — and milli-rounding ORDER in the new city's first
economy pass vs the batched twin. The score-5.4 co-delta is a clue,
not a second bug, until proven otherwise. Fix whichever engine is
WRONG (source-of-truth rule), symmetrically.

After the fix verifies on BOTH repro trajectories: attempt the
PERMANENT restore of 17:9222 and 23:9301 (this puts the G-5 class
in-gate forever). Full ladder on restored fixtures; if a restored
seed dies structurally or trips a DIFFERENT latent you cannot cheaply
also fix, keep that reroll, keep the fix, and document precisely.
Commit the SEED_OVERRIDES end-state you validated.

## Merge protocol (main session)

Merge order R → B → H (H may carry the fixture-seed restore; it goes
last so the restored trajectories exercise R's and B's reshuffles).
Per merge: tsc + touched vitest only (the round rule). ONE battery
--no-eval at the END; red battery → bisect via merge-commit
checkpoints. If H restored seeds and the final battery's export shows
a structural death under the COMPOUND reshuffle, re-reroll that index
in the main session and note it — the G-5 fix stands regardless.

## Standing rules in force

Gates ladder per agent slice: tsc → touched vitest → export (READ the
output; rm orphaned seedNNNN.json on SEED_OVERRIDES changes) →
scripted PYTHONUTF8=1 python gpu/parity_test.py → forced
CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3 → rollout --shards 4
--pipeline-replay. Agents NEVER run the battery; poke lanes are
battery-only (re-check pokes vs new gating before the round battery —
the B5 lesson). Draw-count neutrality. New tensors match dtypes (the
f32 gumbel lane) and register in _MUTABLE. Every rc_bldg write bumps
_eff_version; endTurn-top mirrors sit AFTER _apply_unit_actions (B9
invariants). POOL-END invariant for any ownership transfer. AUDIT
anchors by SYMBOL. Red gate → statelog-first hunt (gpu/HUNTING.md).
Never edit engines while a pipeline runs. Commit via git commit -F
<file> on your worktree branch; report branch + sha.

Agent efficiency contract (verbatim, all agents): (1) iterate on the
scripted parity gate only while red; forced + rollout ONCE each at
the end; green ladder = STOP; (2) Grep to locate, then ONE
generous-context Read per work zone; (3) batch independent shell
commands, tail/filter long outputs.

Worktree bootstrap (all agents): verify HEAD == 8c1dcc0 (reset --hard
if stale); copy gpu/fixtures/*.json from the MAIN checkout
(C:\civ6-development-calculator\gpu\fixtures) before first use, then
re-export when your ladder requires; PYTHONUTF8=1 on every piped
python; do NOT end your turn idle-waiting on a background command —
run gates in the foreground.
