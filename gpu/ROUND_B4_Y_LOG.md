# ROUND B4 — Slice Y log (B-7 flanking & support)

Base sha: 18dff6d570830da4d8b6136a8a8e9a2df6076e3e

## Task
Melee attackers gain +2 CS per hostile unit adjacent to the defender (flanking);
defenders gain +2 CS per friendly military unit adjacent to them (support), vs melee AND ranged.
No flanking against cities/CS/rc-city targets. No new RNG draws. Integer CS adds → the
B-29 diff quantization (q = round(Δ·10)) is preserved (flank/support shift the diff by ±20 per unit).

Roll sites touched (CB tags): mel/melc, rng, vrng, pcstk.

## TS (src/core/combat.ts)
- New exported consts `FLANKING_CS = 2`, `SUPPORT_CS = 2`.
- New file-private helpers `flankCount(state, defTileIndex, attacker, defender)` and
  `supportCount(state, defTileIndex, defender)` — neighbour scans mirroring the AUDIT text:
  flank = MILITARY units u ≠ attacker adjacent to the defender that are unitsHostile to it;
  support = MILITARY units with the same owner AND civId as the defender, adjacent to it.
- `meleeAttack` unit branch (mel/melc): atkCS += FLANKING_CS·flank, defCS += SUPPORT_CS·support,
  applied ONCE (both paired rolls see the same CS). Civilian-kill branch untouched.
- `rangedAttack` unit branch (rng): defCS += support only (no retaliation → no flank).
- `hostileRangedStrike` unit branch (vrng): defCS += support only.
- `barbarianPhase` player-city walls strike (pcstk): defCS += support only (attacker is a city).
- UNTOUCHED: pcty*/rcty*/csty*/rngrc/rngcs/vrngc, fortify, wound, river.

## GPU (gpu/civ6gpu/engine.py)
- Module consts `FLANKING_CS = 2`, `SUPPORT_CS = 2` (integers, near P_MAX).
- New method `_flank_support(def_tile, def_side, def_civ, attacker_tile)` — batched
  neighbour counts off `barb_at`/`pmil_at`/`rv_at`(+`v_civ`,`r_atwar`). def_side ∈ {0 player,
  1 barb, 2 rival}. Foreign stacking blocks → ≤1 military per tile, so each of the 6 neighbours
  contributes 0/1. attacker_tile is excluded from flanking (pass all -1 for city/ranged attackers).
- Twin sites wired:
  - `_apply_unit_actions` melee (att): flank(atk) + support(def), def_side=where(is_b,1,2), attacker=here.
  - `_apply_unit_actions` ranged military-defender (r_att, rng): support only.
  - `_apply_unit_actions` ranged lone-rival-civilian (r_civ, rng): support only (def_side=2 rival civ).
  - `_hostile_vs_unit` melee (mel/melc): flank + support; defender player/barb/rival, attacker=here.
  - `_hostile_ranged_strike` (vrng): support only; defender player-mil/barb/player-civ (all side 0 or 1).
  - `_barbarian_phase` player-city walls strike (pcstk): support only; defender barb/rival-mil/rival-civ.

## Tests
- tests/combat.test.ts: new `describe('B-7 flanking & support')` — exports the +2 consts;
  a flanker adjacent to the defender raises the mel `diff` by exactly +20; a friendly
  supporter lowers the mel `diff` by 20; support also lowers the ranged `rng` diff by 20.
  Reads the CB-log `diff` (RNG-independent), the exact parity acceptance value. 12/12 combat tests pass.
- gpu/combat_mod_test.py: extended `test_integrated`'s independent reference (`ref_q`) with a
  standalone B-7 neighbour scan (flank_support_ref) so the wounded-assembly self-test stays exact
  now that combat CS includes flanking/support. Its river (±50) and ranged-immunity assertions are
  relative and unchanged. This is battery maintenance, not a design change.

## Design deviations / residuals
- rcstk (rival-city walls strike; TS rivals.ts:1857 + GPU engine.py ~8126, the B-2 mirror) is the
  symmetric analog of pcstk and by real-Civ-6 fidelity SHOULD also grant the struck unit support.
  The brief scoped Slice Y to exactly {mel/melc, rng, vrng, pcstk} and named only the barb-phase
  walls strike, so I left rcstk UNTOUCHED in BOTH engines (parity-safe — no support anywhere on that
  tag). RESIDUAL for the merge session / AUDIT: consider extending support to rcstk for symmetry.
- Cities / city-states / rc-city defenders are not units → no flanking against them (recorded
  simplification per the brief).

## Gate results
- npx tsc --noEmit: clean.
- npx vitest run tests/combat.test.ts: 12 passed (4 new B-7).
- npx vite-node scripts/export-gpu.ts: OK, 25 seeds re-exported, no crashes, no degenerate seeds.
- gpu/parity_test.py (scripted): PARITY OK — 0.0 milli-units.
- gpu/parity_test.py CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3: PARITY OK — 0.0 milli-units.
- gpu/rollout.py --shards 4 --pipeline-replay: REPLAY PARITY OK — 72 games × 250 turns.
- gpu/battery.py --no-eval: BATTERY OK, exit 0, all lanes green (combat_mod + all CPU self-tests +
  parity + gpu-gate + mcts + vitest). Wall 678s — inflated by machine contention (parity alone 644.5s
  vs the nominal ~410s; nominal battery ~268s). The FIRST battery run caught the stale combat_mod_test
  reference (mel diff -164 vs stale ref -144); fixed and the re-run is fully green.
  NOTE: per an owner protocol correction mid-task, agents should NOT run the battery in the worktree
  (it runs once at merge). This run had already completed green; recording the result and moving on.
