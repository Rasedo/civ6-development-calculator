# ROUND B4 — Slice AA log (B-31 civilian capture)

Round base: 18dff6d570830da4d8b6136a8a8e9a2df6076e3e

## Task
Melee attack on a lone civilian CAPTURES it (player + rival attackers).
Barbarians still kill. No new RNG draws. Both engines turn-exact.

## Implementation

### TS — src/core/combat.ts `meleeAttack`, the `(defDef?.combat ?? 0) <= 0` branch
- Barbarian attacker: still `killUnit` (no prisoner/camp system — recorded
  simplification for the AUDIT residual).
- Player/rival attacker: CAPTURE — `defender.owner`/`civId` flip to the
  attacker's side (civId deleted for a player captor), `movesLeft = 0`, hp
  and charges kept, unit stays on its tile; attacker spends its attack
  (`movesLeft = 0`) and does NOT advance (early `return ok`, no damageRoll —
  draw-count neutral).
- PARITY FIX (see "Deviation" below): the captured unit is spliced out of
  `state.units` and pushed to the END, mirroring the GPU's append-at-pool-end.

### GPU — gpu/civ6gpu/engine.py
- `_apply_unit_actions`, the `civk` block (player melee vs lone rival
  civilian): was a kill+advance; now a pool TRANSFER v_* -> p_*. Despawn
  (`v_alive=False`, `rvciv_at=-1`), append at `p_next` (assert < P_MAX) with
  `p_type/p_tile(=defender tile)/p_hp/p_charges` carried, `p_fortify=0`,
  `p_acted=True` (movesLeft=0 -> skips the D-2 heal), `pciv_at=nslot`,
  `p_next += 1`. Attacker no longer advances (advance block removed); still
  `p_acted |= civk`.
- `_hostile_vs_unit`, the `civ_att` branch: split on `atk_kind`.
  - `"rival"`: CAPTURE — transfer p_* -> v_* at `v_next` (assert < U_MAX),
    keyed to the attacker's civ (`v_civ[:,u]`), hp/charges carried,
    `v_fortify=0`, `v_acted=True`; `rvciv_at=nslot`, `v_next += 1`.
  - `"barb"`: unchanged kill.
  - `rvciv_att` (barb-only; dvc is -1 for a rival attacker): unchanged kill.
  - `kill_adv` (the advance) now fires only for `atk_kind=="barb"`; a rival
    captor does NOT advance.
- No new tensors: the transfer reuses existing pool tensors (p_*/v_*),
  already in `_MUTABLE` and covered by snapshot/restore and `_reclaim_pool`.
  next-slot discipline + reclaim asserts mirror the spawn helpers.

### Tests — tests/rivals.test.ts, new `describe('B-31 civilian capture')`
- player melee captures a lone at-war rival civilian: same unit id, owner
  flips to player, civId undefined, stays on tile, charges kept,
  movesLeft=0; attacker did not advance and spent its attack.
- barbarian still KILLS a lone civilian and advances onto the tile.

## Deviation (logged, not silent)
The brief says "append to the winning pool in TS spawn order". TS
`meleeAttack` originally flipped ownership IN PLACE, which keeps the unit at
its ORIGINAL player-spawn index in the global `state.units` array — a
position the pooled GPU (append-only v_*/p_*) cannot reproduce. This broke
the engine-wide invariant "GPU slot order == TS units-array order" and
surfaced as a DORMANT desync: seed 9261, two same-civ rival builders
contend for a job at turn 73; whichever is processed first builds/frees a
tile, changing whether the other moves or stays. TS (in-place) processed
the captured builder first; the GPU (appended last) processed it last ->
opposite build/move decision -> imp/rUnits/rGScore diverged from ~t74.
FIX: TS now splices the captured unit out of `state.units` and pushes it to
the end, so BOTH engines iterate it LAST in every array-order loop
(rivalBuilderActions, the war loop, the builder walker). Consistent with
the brief's "append in TS spawn order" intent; unit array order is not
player-visible, so this is behaviour-neutral in real terms.

## Exporter t0 audit (A-12b lesson)
scripts/export-gpu.ts is SAFE. The t0 unit rosters used by the fixture
(`rivalUnitsInit`, lines 935-942; `csAtStart`, 917-922; `rivalCitiesInit`)
are all snapshotted BEFORE the reference turn loop (starts line 1320).
Player t0 units are not dumped from live arrays. The mid-run ownership
flips corrupt no fixture t0 read. The `state.units` reads inside the loop
(1259/1272/1366/1373) are the live scripted policy generating the
reference trajectory (correct to see flipped ownership). No exporter
change needed.

## Capture path fired in-gate
YES. Scripted gate: seed 9261, rival 0 captures a player BUILDER (~turn 69,
carried ch3), verified via a temporary per-turn dump (now reverted).
Off-script rollout (--pipeline-replay) exercises the player-capture site
(Site 1) too and replays green, so both directions are covered in-gate.

## Gate results (all foreground)
- npx tsc --noEmit: clean.
- npx vitest run tests/rivals.test.ts tests/combat.test.ts: 29 passed
  (2 tests + 8 files... 2 files, 29 tests; the 2 new B-31 tests pass).
- npx vite-node scripts/export-gpu.ts: clean, all 24 seeds 250 turns, no
  crash. Reshuffles expected (seed 9261 fixture changed vs base — capture
  fired).
- python gpu/parity_test.py: PARITY OK, 0.0 milli.
- CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3 python gpu/parity_test.py:
  PARITY OK, 0.0 milli.
- python gpu/rollout.py --shards 4 --pipeline-replay: REPLAY PARITY OK,
  72 games × 250 turns.
- battery: NOT run per owner protocol correction (runs once at merge).

## Merge notes for the main session
- The TS re-append is the load-bearing parity fix; keep it paired with the
  GPU append-at-pool-end. Any future capture/transfer site must preserve
  the "captured unit goes to the pool END on both engines" rule.
- AUDIT residual to record under B-31: barbarians kill lone civilians
  (no prisoner/camp system modeled). Rival-vs-rival capture unreachable
  (A-19).
