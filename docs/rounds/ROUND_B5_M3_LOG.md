# ROUND B5 Slice M3 — best-of-roster scripted rival production ladder — LOG

Round base: 1041ecc (M1 + M2 already merged).

## Charter

Make the SCRIPTED rival production ladder (and the A-5r gold-buy roster)
best-of-roster so rivals actually field the B-10 units (SWORDSMAN..MUSKETMAN).
Deterministic rule, no new RNG:
- melee lane: combat>0, no ranged, not naval → highest combat.
- ranged lane: has ranged → highest ranged strength.
- gated by tech-unlock + (if requiresResource) strategic access.
- tie → STRICT `>` scan in UNITS-table order (lowest index wins; HORSEMAN
  precedes SWORDSMAN so the 36-combat tie keeps HORSEMAN = current behavior).
- BUILDER/SCOUT/naval never win. wantRanged ratio logic unchanged.

## Plan / work zones (grep-located)

- TS RIVAL_BUY_UNITS (cpu/core/phase.ts ~98): extend with SWORDSMAN/PIKEMAN/
  CROSSBOWMAN/KNIGHT/MUSKETMAN in UNITS-table order. Buy loop (~1706) already
  ranks by combat with strict `>` and gates requiresResource — verify.
- TS ladder chooser (phase.ts ~1591 `const meleeType = canHorse`): replace
  the hardcoded warrior/spearman/horseman + slinger/archer chooser with a
  data-driven scan over UNITS.
- GPU scripted ladder (engine.py ~8024 `ty`/`ty_rng`): replace the hardcoded
  has_h/has_s ladder with a batched argmax (combat·NU − idx) over the unit
  tables, tech (r_techs, full tree, via _p_tech) + resource (res_ok_r) gated.
- GPU A-5r buy block ok_u5 (~8427): data-drive to combat>0 & !naval & tech &
  res (== the extended RIVAL_BUY_UNITS, scout dominated by warrior).
- player bestMilitary (~9723) already data-driven — verify only.
- controlled rival_masks ok_u (~5446) — VERIFY (see findings).

## What shipped

TS (cpu/core/phase.ts):
- RIVAL_BUY_UNITS extended (UNITS-table order) with SWORDSMAN (IRON_WORKING),
  PIKEMAN (MILITARY_TACTICS), CROSSBOWMAN (MACHINERY), KNIGHT (STIRRUPS),
  MUSKETMAN (GUNPOWDER). The A-5r buy loop already ranks by combat with strict
  `>` and gates requiresResource data-driven — verified, unchanged.
- seatPhase melee/ranged chooser (was `const meleeType = canHorse ? ...`)
  replaced with a data-driven scan over Object.values(UNITS): melee lane =
  highest combat among non-ranged non-naval units gated by requiresTech +
  civHasStrategic; ranged lane = highest ranged.strength likewise; strict `>`
  → lowest UNITS index on ties. wantRanged ratio logic unchanged. SCOUT
  (combat 10) dominated by WARRIOR; BUILDER combat 0.

GPU (gpu/civ6gpu/engine.py):
- scripted ladder (`ty`/`ty_rng`, ~8028): the hardcoded has_h/has_s ladder
  replaced with a batched argmax. tr_u_r = (_p_tech<0 | r_techs.gather(_p_tech))
  & res_ok_r (full-tree tech + strategic access). melee/ranged keys =
  strength·NU − idx (lowest-index tie = TS strict-`>`). WARRIOR/SLINGER ungated
  → each lane always fills. Removed now-dead sp_t/ho_t/ar_t/zb/has_* locals.
- A-5r buy block ok_u5 (~8427): replaced hardcoded rows with data-driven
  mil5 = tr_u_r & combat>0 & ~naval; key_u5 (combat·NU−idx argmax) unchanged.
- NEW `self._scout_idx` (~1300): SCOUT masked OUT of the buy set. REQUIRED —
  the production ladder relies on WARRIOR dominating SCOUT, but the buy's
  AFFORDABILITY gate can leave SCOUT (cost 30) the only affordable candidate
  when WARRIOR (40) isn't affordable → GPU would buy SCOUT while TS (whose
  RIVAL_BUY_UNITS list excludes SCOUT) buys nothing. First parity hunt caught
  exactly this (seed turn 27: rUnits GPU=2/TS=1, rGold gap).
- player bestMilitary (~9723): already data-driven (_p_tech + _res_avail_mask
  + ~naval) — exposes the new roster automatically. VERIFIED, unchanged.

## Findings / deviations

- CONTROLLED rival_masks ok_u (engine.py ~5446) is NOT data-driven — it
  hardcodes WARRIOR/SPEARMAN/HORSEMAN/SLINGER/ARCHER (+builder) rows and does
  NOT expose the B-10 roster to the RL controlled head. DEFERRED (not changed):
  (1) it drives ONLY controlled/self-play rivals — the parity_test + rollout
  gates all use SCRIPTED rivals, so any change there is UNVERIFIABLE by this
  slice's gates; (2) data-driving it as combat>0&~naval would newly expose
  SCOUT to the RL action mask — a trained-action-space semantics decision for
  the RL owner; (3) out of the scripted-ladder charter. Flagged for the main
  session / P8 (parked) — recommend mirroring the scripted ladder there when
  self-play needs the new roster.

## Hunt: the "3 failing seeds" were STALE FIXTURES, not a divergence

First re-export after the scout fix, parity flagged seeds 9157/9222/9300
(hp1 / barbs / rQCost0). Root-caused to the stale-fixture trap, NOT a logic
bug: those three seeds are each exactly ONE LESS than M2's SEED_OVERRIDES
(9158/9223/9301 in export-gpu.ts). The fixtures copied from the source repo at
session start held the pre-override seed9157/9222/9300.json; the override-driven
re-export wrote seed9158/9223/9301.json but export never cleans stale files, so
27 files were present and parity ran the 3 stale OLD-TS traces the current GPU
can't reproduce. PROOF it was not M3: a HEAD-engine-vs-current-engine probe on
seed 9300 (full batch, /tmp) was byte-identical through t113 (units, horse
access, queue, gold) — my GPU change is a true no-op there. Fix: rm the 3 stale
files (the documented "rm seedNNNN.json when the seed set changes" rule).

## Gate results (all green)

- npx tsc --noEmit: clean (noUnusedLocals on).
- npx vitest run: 306/306 pass (incl. 5 new B-10 ladder tests in
  tests/rivals.test.ts: SWORDSMAN>SPEARMAN w/ iron; PIKEMAN w/o iron at
  MILITARY_TACTICS; CROSSBOWMAN ranged at MACHINERY; HORSEMAN/SWORDSMAN 36-tie
  keeps HORSEMAN; MUSKETMAN at GUNPOWDER).
- npx vite-node scripts/export-gpu.ts: clean, 24 seeds. NOTE: removed 3 STALE
  copied fixtures (seed9157/9222/9300.json) that predated M2's SEED_OVERRIDES.
- python gpu/parity_test.py: PARITY OK 0.0 milli (24 seeds × 250t).
- forced CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3: PARITY OK 0.0 milli.
- python gpu/rollout.py --shards 4 --pipeline-replay: REPLAY PARITY OK 72/72.

## Merge watch-items

- STALE FIXTURES: the merge/main session re-exports ONCE. Ensure the 3 stale
  seed9157/9222/9300.json are gone (I removed them here) — export won't clean
  them; SEED_OVERRIDES (9158/9223/9301) leave the un-overridden names orphaned.
- New int table `self._scout_idx` (no f32 risk); the buy-set SCOUT mask is
  load-bearing (affordability edge — see the hunt above).
- Controlled rival_masks ok_u left hardcoded (deferred, out of scope — see
  Findings). If the main session wants controlled rivals to field B-10 too,
  mirror the scripted ladder there (mind the SCOUT-exposure decision).
- No new RNG draws; the pick keys are int (combat·NU−idx). No PLAYER-walk f32
  tables touched. combat_mod_test untouched (M2's concern, not M3).
