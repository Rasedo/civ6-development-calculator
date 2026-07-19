# ROUND B5 Slice M1 — B-9 strategic-resource access + B-10 roster — LOG

Round base: 16d017bad62360452839830cf7d3686376de58ea

## Verified data ids (before writing catalog rows)

- Strategic resources (src/data/resources.ts): HORSES (improvement PASTURE),
  IRON (improvement MINE). Both present — no substitution.
- Techs (src/data/techs.ts) — all present, no substitution:
  IRON_WORKING (Classical), MILITARY_TACTICS (Medieval), MACHINERY (Medieval),
  STIRRUPS (Medieval), GUNPOWDER (Renaissance).

## What shipped

- `UnitDef.requiresResource?: string` (src/data/units.ts). HORSEMAN retro-gated
  on `HORSES`. New B-10 roster (all costs pre-GAME_SPEED, verified tech ids):
  SWORDSMAN (90/2/2, cs36, IRON_WORKING, requires IRON),
  PIKEMAN (100/2/2, cs41, MILITARY_TACTICS),
  CROSSBOWMAN (180/3/2, cs15 ranged{40,2}, MACHINERY),
  KNIGHT (220/4/4, cs48, STIRRUPS, requires IRON),
  MUSKETMAN (240/4/2, cs55, GUNPOWDER). Map-badge codes D/K/C/N/M (unique).
- `civHasStrategic(state, civ, resourceId)` in src/core/civs.ts (unified civ id):
  owned tile + resource + completed unpillaged matching improvement
  (PASTURE/MINE from the resource catalog). Improvements are instant here, so
  `tile.improvement === imp` ⇒ complete.
- TS gates (data-driven off requiresResource, no special-casing):
  trainableUnits (units.ts) → funnels queueUnit + purchaseUnit; the scripted
  rival melee ladder + the A-5r gold-buy loop (rivals.ts).
- GPU: exporter ships per-unit `requiresResource` (index into RESOURCE_IDS,
  the res_id order). Engine helper `_res_avail_mask(owned)` reuses the existing
  per-tile `res_imp` (`rq`) plane — NO new resource→improvement table needed.
  Gated: production_mask build + purchase columns, the RL apply re-validation
  (`trainable`), the scripted bestMilitary (`tr_u`), the purchase-apply slot
  re-check, rival_masks controlled head (`ok_u`), the scripted rival ladder
  (`has_h`) + A-5r buy (`ok_u5`). No new per-slot mutable planes → no _MUTABLE/
  _reclaim_pool changes (M1 adds only static roster tables `_p_res` /
  `_res_unit_pairs`).

## Decisions / deviations

- The scripted rival unit ladder + RIVAL_BUY_UNITS stay the existing
  WARRIOR/SPEARMAN/HORSEMAN/SLINGER/ARCHER set (only HORSEMAN newly gated). The
  ladder is a hardcoded type chooser, NOT a data-driven best-of-roster pick, so
  it would NEVER select SWORDSMAN/PIKEMAN/CROSSBOWMAN/KNIGHT/MUSKETMAN — those
  new rows are unreachable by scripted rivals by construction. POKE DECISION for
  the main session: if in-gate rival coverage of the new roster is wanted, the
  ladder needs a redesign (out of M1 scope). The PLAYER path IS fully
  data-driven (trainableUnits / bestMilitary iterate the whole roster), so the
  scripted player DOES build the new units when tech+resource are reached.
- No substitutions: all resource ids (HORSES/IRON) and tech ids
  (IRON_WORKING/MILITARY_TACTICS/MACHINERY/STIRRUPS/GUNPOWDER) exist verbatim.

## Reachability / access-loss (in-gate observations)

- Scripted rivals: rivalBuilderActions (A-13) build PASTURE/MINE on owned
  resource tiles, so rivals DO gain HORSES access and the ladder picks HORSEMAN
  — observed in the rollout games (e.g. rival 1 fielding type-6 HORSEMEN by
  t237). The retroactive HORSEMAN gate flips early-game rival trajectories: a
  rival with HORSEBACK_RIDING but no improved horses now trains SPEARMAN/WARRIOR
  until a pasture lands. Confirmed by the full re-export + a clean parity_test.
- Scripted PLAYER builder only ever builds FARM, so the scripted player never
  gains HORSES/IRON access in the parity fixtures → never trains the new gated
  units there (all 24 fixtures pass at 0.0). The RL rollout builder CAN build
  MINE → IRON access → SWORDSMAN/KNIGHT for the player.
- Access-loss (pillage / capture / border-loss severing access) is unit-tested
  in tests/strategic-resources.test.ts (pillage flag, cityId→-1, rival takeover).

## Gate results (committed a805e99, current HEAD)

- npx tsc --noEmit: clean (noUnusedLocals on).
- npx vitest run: 293/293 pass (incl. the 7 new strategic-resources tests).
- npx vite-node scripts/export-gpu.ts: clean, 24 seeds, no crash, seed set
  unchanged.
- python gpu/parity_test.py: PARITY OK 0.0 milli (24 seeds × 250t).
- forced variant CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3: PARITY OK 0.0 milli.
- python gpu/rollout.py --shards 4 --pipeline-replay: **RED — 2 of 72 random
  games diverge** (see below). 70/72 turn-exact.

## MERGE WATCH-ITEM — rollout latent (PRE-EXISTING, roster-reshuffle-exposed)

The rollout replay fails on 2/72 random games. ISOLATION-PROVEN this is NOT the
B-9/B-10 gate logic:
- With the gate INERT (NU=15 roster kept, requiresResource stripped so
  `_res_avail_mask` short-circuits all-True and TS skips the gate), the rollout
  STILL fails — at DIFFERENT seeds/turns (seed 9274 t247 barbCamps TS=3/GPU=2;
  seed 9300 t204 rngState). So the NU 10→15 roster expansion alone reshuffles
  the RL trajectories and amplifies scattered pre-existing GPU↔TS latents.
- parity_test (the turn-exact core gate, which DOES exercise gated rivals
  building HORSEMEN) passes 0.0 both normal and forced-compaction — validating
  the gate logic and the access computation.

Precise diagnosis of the gated-config failure (seed 9300, rng 2026006149):
- Turn 202 END: both engines identical (all PU + RU match).
- Turn 203 rivalPhase: rival 0's SPEARMEN (type 5) MOVE differently — TS keeps
  the unit on tile 508, GPU keeps the one on tile 552 (the other is then removed
  by a combat whose rolls are byte-identical between engines — sorted CB lines
  match through t203, and B-29 wound-CS would differ if the divergence were the
  roll, so the divergence is PRE-combat movement, not combat).
- The tile-508 occupancy difference means the player's recorded move onto 508
  lands in GPU but is blocked (unit stops at 509) in TS → the next recorded
  order references tile 508 → replay hard-fails "no player unit at tile 508".
- Seed 9079 (rng 2026006096) is the same class: all statelog state matches
  through t235, only rngState (a draw-count) diverges — a barb/rival draw with
  no yet-visible effect.

Conclusion: pre-existing latent(s) in the rival unit-movement (patrol /
hostileUnitAct / war-march resolution ORDER) and/or barbarian-phase RNG draw
count, surfaced by the B-10 trajectory reshuffle. Root-causing to the exact
divergent MOVE needs intra-turn per-unit move logging resumed from the t200
checkpoint — a hunt independent of this slice's mechanic. Not blind-patched
(program rule: agent-diagnosed latents get re-verified before a fix, else dead
code). Flagged for the main session's merge hunt + battery.

Hunt artifacts left in gpu/fixtures: gpu_statelog.txt / ts_statelog.txt are for
seed 9300 (rng 2026006149); regenerate with
`python gpu/rollout.py --log <rng>` + `CIV6_LOG=<rng> npx vite-node scripts/replay-gpu.ts`.
