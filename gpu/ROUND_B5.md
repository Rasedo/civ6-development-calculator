# ROUND B5 — military depth (AUDIT B-9 strategic resources, B-10 roster, B-4 XP)

Round base: the commit that adds this file. TWO parallel Opus worktree
agents — M1 (B-9 resource access + B-10 roster; these two are coupled:
resources gate the new units) and M2 (B-4 XP/levels; independent
surface). Decisions below settled per the source-of-truth rule (closer
to REAL Civ 6, sized to the modeled scope); necessary deviations go in
your log file, never silently into code.

## Common contract (both slices)

- BOTH engines change together, turn-exact. NO new RNG draws anywhere
  (XP accrual and resource gates are deterministic). Trajectory
  reshuffles are expected and LARGE (rivals build new units) —
  re-export and gate.
- Verification ladder, ALL FOREGROUND with 600000ms timeouts (never
  idle on a background run): `npx tsc --noEmit` (tsconfig has
  noUnusedLocals) → `npx vitest run <touched tests>` → re-export
  `npx vite-node scripts/export-gpu.ts` (READ the output; export
  never cleans stale seed files — rm seedNNNN.json first if the seed
  set changes) → `PYTHONUTF8=1 python gpu/parity_test.py` (0.0 milli)
  → forced variant (`CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3`) →
  `python gpu/rollout.py --shards 4 --pipeline-replay` (use the
  default --ckpt 0). NO battery in worktrees — ONE battery at
  round end in the main session.
- Worktree setup: `git rev-parse HEAD` must equal the round-base sha
  (reset --hard if stale); copy BOTH gitignored fixture dirs from
  C:\civ6-development-calculator (gpu/fixtures, gpu/fixtures_o4);
  create your log gpu/ROUND_B5_<slice>_LOG.md and make an early
  anchor commit. Commit messages end with the standard
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com> trailer.
- New tables are int/bool (no f32 risk; still note any float in a
  PLAYER-walk path). GPU per-slot unit planes must join `_MUTABLE`,
  snapshot/restore, and the `_reclaim_pool` field lists (mirror
  p_fortify/p_emb exactly). Slot-order/pool-end invariants unchanged.
- Do not edit gpu/AUDIT.md (main session closes it). If a seed's
  reference run degenerates, reroll + log (9028→9029 precedent).

## Slice M1 — B-9 strategic-resource access + B-10 roster

RESOURCE MODEL (sized to scope; GS stockpiles/accumulation recorded
as the residual): a civ HAS ACCESS to a strategic resource iff some
tile in its territory (player `cityId`; rival A-17 `rivalCityId`
registry) has that resource AND a completed matching improvement
(PASTURE on horses, MINE on iron), unpillaged (B-32/`pillaged`
respected). Access GATES build AND purchase of units that require the
resource — no stockpile, no per-unit count, no maintenance draw.
Verify the actual strategic ids in src/data/resources.ts (expected:
HORSES, IRON) and use the catalog's own improvement mapping.

- TS helper `civHasStrategic(state, civOrPlayer, resourceId)` (place
  by the existing territory scans); wire into `trainableUnits`
  (units.ts — it already takes the city), `purchaseUnit` (game.ts),
  the scripted rival unit queue + the A-5r gold-purchase ladder
  (rivals.ts), all data-driven off a new `UnitDef.requiresResource?:
  string`.
- GPU: per-civ access mask (batched scan of the territory planes ×
  resource × improvement, computed where the production/purchase
  masks are assembled — `production_mask`, `rival_masks`, the
  scripted rival queue head, the A-5r purchase block); a
  `unit_requires_resource` rules table via the exporter.
- RETROACTIVE: HORSEMAN gains `requiresResource: 'HORSES'` (its own
  description says the requirement is unmodeled — B-9 closes that).
  Expect early-game reshuffles from this alone.

ROSTER (all costs pre-GAME_SPEED like the rest of UNITS; use the
ACTUAL tech ids in src/data/techs.ts — verify each exists; if a named
tech is absent pick the era-correct neighbor and log it):
- SWORDSMAN: cost 90, maint 2, moves 2, combat 36, IRON_WORKING,
  requires IRON.
- PIKEMAN: cost 100, maint 2, moves 2, combat 41, MILITARY_TACTICS.
- CROSSBOWMAN: cost 180, maint 3, moves 2, combat 15,
  ranged {40, 2}, MACHINERY.
- KNIGHT: cost 220, maint 4, moves 4, combat 48, STIRRUPS,
  requires IRON.
- MUSKETMAN: cost 240, maint 4, moves 2, combat 55, GUNPOWDER (no
  resource — niter is unmodeled on maps; recorded residual).
No naval hulls this round (Frigate+ stays a B-10 residual with B-6's
note). No unit upgrades (gold upgrade paths — recorded residual).
- Everything downstream is data-driven and must pick the new rows up
  WITHOUT special-casing: exporter unit tables, `bestMeleeCS`/
  `r_best_melee` (city defense scales — verify), scripted rival unit
  ladder (verify where it ranks units and that new entries slot in
  by its existing rule), controlled-head mask rows, maintenance in
  both economies. Where the scripted ladder's rule would NEVER pick a
  new unit, say so in the log (poke coverage decision is the main
  session's).
- vitest: access gating (improved+owned+unpillaged, loss on pillage/
  capture), HORSEMAN retro-gate, one new-unit build path.

## Slice M2 — B-4 XP and levels

MODEL (sized to scope; real Civ 6 promotion TREES with per-promotion
abilities are the recorded residual — we model XP → levels → flat CS):
- `Unit.xp` (int, starts 0) on PLAYER and RIVAL units; barbarians
  accrue nothing (recorded simplification).
- Accrual (deterministic, at the existing combat sites, BOTH
  engines): +5 to an attacker for each attack it executes (melee or
  ranged, vs unit/city/CS/rc); +2 to a surviving defender each time
  it is attacked (incl. city/walls strikes hitting it). No XP from
  being killed. No other sources.
- Levels: XP_LEVELS = [15, 45, 90] → level 1/2/3; each level grants a
  flat +5 CS at EVERY roll the unit fights (attack and defense),
  entering the CS assembly exactly like the B-7 terms (integer add,
  applied once before paired rolls, preserved by the B-29
  quantization). No promotion choice, no heal-on-promote, no
  level-4+.
- `bestMeleeCS`/`r_best_melee` stay BASE-CS (city defense does not
  inherit veterancy) — verify and note.
- GPU: `p_xp`/`v_xp` int planes (_MUTABLE, snapshot/restore,
  `_reclaim_pool` lists); accrual scatter-adds inside each combat
  block (`_apply_unit_actions` melee/ranged, `_hostile_vs_unit`,
  `_hostile_ranged_strike`, walls strikes pcstk/rcstk — the defender
  +2 rows); level term = 5 * (xp>=15 + xp>=45 + xp>=90) composed into
  every CS assembly that has the B-7/B-29 terms. The CB-log `diff`
  match at every tag is the acceptance test.
- Ownership transfers (B-31 capture, embarked capture) carry xp with
  the unit (civilians have xp 0 — they never fight; verify nothing
  else needs it).
- HEADS-UP: gpu/combat_mod_test.py hardcodes independent CS-assembly
  references — B-7 shifted it last round and XP will too; extend its
  reference with the XP term (battery maintenance, note in log).
- vitest: accrual amounts per site, thresholds, +5/level at both
  attack and defense, defender-of-walls-strike +2, barb no-XP.

## Merge plan (main session)

Serial merges M1 → M2 (tsc + touched vitest each), then ONE
re-export + ONE battery. M1 and M2 overlap at the roll/CS assembly
sites only through M2's term — conflicts expected small; the merge
session re-checks combat_mod_test's reference after both land.
