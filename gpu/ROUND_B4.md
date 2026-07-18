# ROUND B4 — combat-fidelity small slices (AUDIT B-7 / B-30 / B-31 / B-32)

Round base: the commit that adds this file. Four parallel Opus worktree
agents — Y (B-7 flanking/support), AA (B-31 civilian capture),
Z (B-32 district pillage), AB (B-30 conquest keeps infrastructure).
Design decisions below are settled per the source-of-truth rule (the
behaviour closer to REAL Civ 6, sized to the modeled scope); deviations
an agent believes necessary go in its log file, not silently into code.

## Common contract (every slice)

- BOTH engines change together, turn-exact. TS (src/core/*.ts) is the
  spec; the GPU (gpu/civ6gpu/engine.py) mirrors op-for-op.
- NO new RNG draws in any slice. CS/targeting changes reshuffle
  trajectories — that is expected; re-export fixtures and re-gate.
- Verification ladder, ALL FOREGROUND (never idle waiting on a
  background gate): `npx tsc --noEmit` → `npx vitest run <touched
  tests>` → re-export `npx vite-node scripts/export-gpu.ts` (READ the
  text output for crashes) → scripted gate `PYTHONUTF8=1 python
  gpu/parity_test.py` → forced-compaction gate (same, prefixed
  `CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3`) → off-script `python
  gpu/rollout.py --shards 4 --pipeline-replay`. NO battery in
  worktrees (owner catch 2026-07-18): the battery CONTAINS the gates
  and runs ONCE per serial merge in the main session.
- Worktree setup: verify `git rev-parse HEAD` == the round-base sha
  (reset --hard to it if stale); copy the gitignored `gpu/fixtures`
  AND `gpu/fixtures_o4` from the main checkout
  (C:\civ6-development-calculator) before any gate; make an early
  anchor commit (your log file) so the worktree is never changeless.
- CACHE COUNTERS (the #58 invariant): any NEW mutation site that feeds
  rival yields/housing MUST bump `_eff_version` (or the applicable
  counter) or the G1/G4/G5 caches serve stale state. Slices Z and AB
  have such sites (called out below). New per-turn state tensors go in
  `_MUTABLE` and must survive snapshot/restore and `_reclaim_rc`.
- EXPORTER T0 AUDIT (the A-12b lesson): if your mechanic can move,
  remove or re-own world objects mid-reference-run, audit
  scripts/export-gpu.ts for t0 dumps read off LIVE arrays post-run.
  Slices AA and AB both re-own objects — check the unit rosters and
  city dumps.
- Slot-order invariants: every GPU unit-pool or rc append mirrors the
  TS array order exactly (last-alive+1 with assert where applicable).
- New constants are integers here; if any float table lands in a
  PLAYER-walk path, check its dtype against the battery's f32 gumbel
  lane (the ROUND B3 fol-table lesson).
- If a reshuffled seed's reference run degenerates (player eliminated,
  export crash), reroll the seed (9028→9029 precedent) and log it.
- AUDIT anchors by SYMBOL. Do not edit gpu/AUDIT.md (main session
  updates it at merge). Log to your own file `gpu/ROUND_B4_<slice>_LOG.md`:
  decisions, gate results, battery wall, deviations, residuals.
- Commit on your worktree branch, message ends with
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Slice Y — B-7 flanking & support

Real Civ 6: melee attackers gain +2 CS per other unit adjacent to the
defender that is hostile to the defender (flanking); defenders gain
+2 CS per friendly military unit adjacent to them (support), against
melee AND ranged. Cities/CS/rc-city targets are not units — no
flanking against them (recorded simplification).

TS (combat.ts):
- New exported consts `FLANKING_CS = 2`, `SUPPORT_CS = 2` and helpers:
  - flank count: MILITARY units u ≠ attacker, adjacent to the
    defender's tile, with `unitsHostile(state, u, defender)`.
  - support count: MILITARY units friendly to the defender (same
    owner AND civId), adjacent to the defender's tile.
- Apply ONLY at unit-vs-unit roll sites, by adjusting atkCS/defCS
  ONCE before the paired rolls (both rolls see the same CS):
  - `meleeAttack` unit branch (`mel`/`melc`): atkCS +=
    FLANKING_CS·flank, defCS += SUPPORT_CS·support.
  - `rangedAttack` unit branch (`rng`): defCS += support only.
  - `hostileRangedStrike` unit branch (`vrng`): defCS += support only.
  - `barbarianPhase` walls-strike (`pcstk`): defCS += support only
    (the attacker is a city).
- UNTOUCHED: all city/rc-city/CS rolls (`pcty*`, `rcty*`, `csty*`,
  `rngrc`, `rngcs`, `vrngc`), fortify, wound penalty, river penalty.
  The B-29 quantization takes care of itself (integer CS adds).

GPU (engine.py): mirror at the twin sites — `_apply_unit_actions`
melee, `_rival_unit_war_act`, `_hostile_ranged_strike`, the
`_barbarian_phase` walls strike. Batched neighbor counts off the unit
occupancy planes (`pmil_at`, `pciv_at`, rival `v_*`/`rv_at`, barb
planes) with the same hostility/military/self-exclusion masks. The CB
log `diff` at every `mel/melc/rng/vrng/pcstk` roll must match TS
exactly — that IS the acceptance test.

## Slice AA — B-31 civilian capture

Real Civ 6: a melee attack on a lone civilian CAPTURES it — the unit
changes sides, no combat roll. Settlers stay settlers, builders keep
their charges.

TS (combat.ts `meleeAttack`, the `(defDef?.combat ?? 0) <= 0` branch):
- PLAYER and RIVAL attackers capture instead of `killUnit`: the
  defender's `owner`/`civId` flip to the attacker's side, `movesLeft`
  = 0, hp and charges kept, unit stays on its tile. The attacker does
  NOT advance (single-occupancy model) and spends its attack
  (`movesLeft = 0`) exactly as today.
- BARBARIAN attackers still kill (no prisoner/camp system — recorded
  simplification, log it for the AUDIT residual).
- No damageRoll on this branch today → none after (draw-count
  neutral at the site). Rival-vs-rival is unreachable (A-19).
- Check downstream reads of ownership (unitsHostile, fog reveal,
  builder/settler policy loops pick up the new unit naturally).

GPU: the civilian-kill sites in `_apply_unit_actions` (player melee)
and `_rival_unit_war_act` (rival melee) become pool TRANSFERS:
despawn from the losing pool, append to the winning pool
(`p_*` ↔ `v_*`, with `p_charges`/`v_charges`, hp carried) in TS spawn
order — respect each pool's next-slot discipline and `_reclaim_*`
safety; new/changed tensors snapshot/restore-clean.
Exporter t0 audit applies (unit rosters).

## Slice Z — B-32 district pillage

Real Civ 6: raiders pillage districts; a pillaged district's yields
and buildings go dark until repaired. Loot lumps to the pillager are
NOT modeled in v1 (matches the D-20 convention — raiders bank nothing
from yield-type pillages); no heal (heal is food-improvement-only per
D-20, which is the real rule). Record the loot lumps as the residual.

TS:
- `Tile.districtPillaged?: boolean` (types.ts). Pillageable: a
  COMPLETE, non-CITY_CENTER district tile owned by an enemy civ —
  player districts for rival/barb raiders, RIVAL districts for
  barbarians too (the C-4a convention).
- `hostileUnitAct` (combat.ts): step 2 extends — pillage the
  improvement underfoot first (unchanged), ELSE the district
  underfoot (set districtPillaged, movesLeft = 0, no heal). Step 3's
  march target set gains unpillaged enemy district tiles (nearest of
  the union, same ≤13 scan and marchOnto semantics).
- While pillaged the district contributes NOTHING to its city:
  adjacency yields, its buildings' yields/housing/amenities/GPP, the
  CS envoy 3/6 district channels. STATIC counts stay (district cost
  scaling, one-per-type, maxSpecialtyDistricts, boost conditions —
  real Civ 6: pillaged is still owned). Religion pressure untouched
  (the holy center is frozen at founding — leave it).
- Repair: extend `builderRepair` (units.ts) and the rival repair in
  `_rival_builder_actions`'s TS twin (`rivalPhase` builder block) to
  district tiles, mirroring the existing improvement-repair semantics
  and candidate ordering exactly (districts join the same candidate
  set; keep the existing tie-break).
- City capture/raze interplay: captured-district handling stays as it
  is on the round base (slice AB owns those sites — see merge note).

GPU: new `district_pillaged` [B,T] bool plane (`_MUTABLE`, snapshot/
restore, reclaim-safe). Gate district adjacency + building yields/
housing/amenities/GPP in BOTH player pipelines and BOTH rival yield
paths (`_rival_city_yields` per-j AND the D-9 `_all` twin). CACHE:
every rc-district pillage/repair event MUST bump `_eff_version` (barb
raids on rival districts make this reachable). Hostile march/target
scans mirror the widened TS target set. Exporter: t0 world has no
pillaged districts (plane inits zero) — but confirm no live-array
read regardless.

## Slice AB — B-30 conquest keeps infrastructure

Real Civ 6: capture keeps districts and buildings. Changes the FOUR
capture/transfer paths; razes stay scorched-earth (unchanged).

Rules (all four paths):
- KEEP the captured city's districts array (live, re-owned) and its
  buildings, MINUS `PALACE` (never transfers). KEEP wonders.
- `ANCIENT_WALLS` is KEPT with `outerHp = 0` — it heals back via the
  B-1 rule, and the new owner gains the B-2 walls strike once
  standing. (Replaces B-1's wiped-on-capture note.)
- Pop ×0.75 floor 1, half HP, foodBox/cultureBox zeroed, focus/
  specialists reset — all unchanged.
- Raze branches (city-cap) unchanged: districts die, tiles free.

Paths and twins:
- `captureRivalCity` (combat.ts) / `_capture_rival_city` (engine.py):
  player takes an rc — carry rc buildings/districts/wonders into the
  new player city; on the GPU the P5/S1 `district_dead` marking is
  exactly what this slice REMOVES for capture (keep it for raze):
  captured district tiles stay LIVE and re-own to the new city;
  `rc_bldg` rows map onto the player `buildings` plane (verify the
  building index spaces match — same exporter catalog).
- `transferCityToRival` (rivals.ts) / `_transfer_city_to_rival`:
  rival takes a player city — carry buildings (minus PALACE),
  districts, wonders into the rc planes.
- `transferRivalCityToRival` (rivals.ts) + its GPU twin (the loyalty
  flip path): same carry between rc slots.
- `captureCityState` / `captureCityStateForRival` and GPU twins: NO
  CHANGE (city-states have no districts/buildings in-model) — verify
  and note only.
- CACHE: every capture/transfer already bumps `_eff_version`; confirm
  the new carried state is covered by that bump (rival yields now
  depend on carried buildings). District ownership planes
  (`owner`, `rival_at`, `rc_tile_id`, `rc_dist_tile`) must stay
  consistent with the A-17 registry semantics.
- Exporter t0 audit applies (city dumps: buildings/districts arrays).
- Expect LARGE trajectory reshuffles (conquered cities are worth
  real yields now) — that is the point; re-export and gate.

## Merge plan (main session)

Serial merges, one battery each, order Y → AA → Z → AB (smallest
blast radius first). Z and AB both touch district liveness: Z gates
yields on `district_pillaged`, AB changes capture-time district
ownership — the AB merge must re-check Z's gating at the capture
sites (a captured pillaged district STAYS pillaged until repaired —
real Civ 6 keeps the damage). Main session resolves conflicts,
re-exports once per merge, and owns AUDIT/completion-table updates.
