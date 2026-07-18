# NAVAL N3 — poke suite + battery lane (main session)

Stage base: b097400 (N2 merged, naval LIVE + gate-green). TEST-ONLY stage:
no edits to src/core, src/data, scripts/export-gpu.ts, gpu/civ6gpu/engine.py.

Scope = `gpu/naval_test.py` covering N2's gate-unreachable naval surfaces,
TS twins in tests/naval-embark.test.ts where natural, and a `naval` battery
lane. The engine already has the mechanics; N3 pins the semantics the 24×250
scripted parity gate cannot reach.

## Poke coverage (gpu/naval_test.py) — ALL GREEN
- [x] 1  GALLEY naval melee + CAPTURE of a coastal rival city
        (siege → _player_attack_rival_city → _capture_rival_city)
- [x] 2  GALLEY naval melee + CAPTURE of a coastal CS (cs_hit → _capture_city_state)
- [x] 3  QUADRIREME range-1 bombard vs a rival UNIT (r_att: no retaliation/advance)
- [x] 4  QUADRIREME range-1 bombard vs a rival CITY (r_sieg: HP floors at 1, no capture)
- [x] 5  PLAYER naval spawn-on-water (_spawn_player naval probe) + attack;
        + the #50 residual: RL/controlled MOVE cannot step a ship onto water
- [x] 6  OCEAN gate pre/post CARTOGRAPHY (naval spawn probe; COAST ungated)
- [x] 7a pcstk (player city walls) strikes a ship + embarked target (override proven)
- [x] 7b rcstk (rival city walls) strikes a player ship + embarked target (override proven)
- [x] 8  embarked-civilian capture POOL-END invariant + keeps-embarked (GPU)
- [x] 9  naval ally counts in B-7 flank/support; embarked contributes nothing

TS twin added (tests/naval-embark.test.ts): PLAYER galley MOVES across water
(orderMove/findPath/walkPath naval-aware) then batters a coastal city — the
move end-to-end the GPU RL head defers to #50. (Embarked OCEAN gate + embarked-
defender flat CS + embarked-civilian capture pool-end already TS-covered.)

## Engine-surface notes (read while designing — no edits)
- Player attack apply (`_apply_unit_actions`): direction codes 6..11 hit the
  neighbour; legality is adjacency + hostility, NOT the attacker's own-tile
  terrain — so a GALLEY-typed slot on a water tile adjacent to a coastal
  city/CS/unit attacks through the EXISTING melee/ranged/siege branches with
  zero naval-specific code. This is what "coastal cities attackable from water
  with zero new combat code" means. Combat can be isolated by calling
  `sim._apply_unit_actions(ua)` directly (no step-level confounds).
- Player MOVE apply (`_apply_unit_actions`, the 0..5 branch) uses `self.passable`
  (the land plane) with NO wpass composition. So the GPU CONTROLLED/RL move
  verb cannot move a naval unit onto water. This is the DOCUMENTED #45 residual
  (controlled-head water-move columns → #50; N2 removed _naval_cap_player and
  the controlled/RL head builds no naval). NOT a bug — the player-naval MOVE
  end-to-end lives on the TS side (findPath/walkPath are naval-aware) and is
  covered in tests/naval-embark.test.ts. The GPU poke asserts the reachable
  surface (spawn-on-water + attack) and pins the move-residual behaviour.
- pcstk lives in `_barbarian_phase`; isolatable by zeroing camps
  (n_camps=max_camps, camp_tile=-1) + clearing barbs → the phase reaches the
  wall-strike block with no barb spawn/move confounds.
- rcstk lives in `_rival_phase` (per-rival-per-city). Isolatable with a single
  at-war rival that owns a walled city but ZERO units and empty queues →
  war-act/production do nothing to the player unit; only rcstk touches p_hp.
- Embarked-override proof (walls): `_damage_roll` dmg is monotonic
  non-decreasing in (atk−def) and deterministic given the RNG stream. Run the
  SAME scenario twice from a snapshot (target embarked vs grounded); identical
  draw counts ⇒ identical random factor ⇒ embarked (flat def 10 < unit combat)
  takes STRICTLY more damage. That pins the flat-CS override.

## Deviations / findings
- NO engine divergences or crashes. Every poke mirrors the TS design; no item
  was skipped/xfail'd. The naval mechanics behave exactly as N1/N2 shipped them.
- ENVIRONMENT (not an engine bug): the fixtures on disk in the MAIN checkout
  (and thus copied into this worktree) were STALE — rules.json listed 7 units
  with no GALLEY/QUADRIREME and no embark/cartography rules (mtime predated the
  N1/N2 naval catalog). They were never re-exported after naval merged. The
  b097400 SOURCE has the full naval catalog, and `load_rules` reads
  fixtures/rules.json, so the naval pokes were untestable against the stale set.
  Re-exported from b097400 (deterministic, data-driven, parity-neutral) →
  fixtures now carry GALLEY (combat 30, naval), QUADRIREME (combat 20, rng 25,
  naval), embarkLive=1, embarkedDefenseCs=10, cartographyTech=40 — and
  parity_test is 0.0 milli. The main session's battery re-exports at stage 0
  anyway, so the naval lane runs against a fresh export there regardless.
- Confirmed (design, not a bug): the GPU player MOVE apply (_apply_unit_actions,
  0..5 branch) uses the land `passable` plane with no wpass composition, so the
  RL/controlled head cannot step a ship onto water. This is the documented #45
  residual (controlled water-move columns → #50; N2 removed _naval_cap_player).
  Poke 5 pins it; the player-naval MOVE end-to-end is TS-side (findPath naval).

## Gate results (all foreground)
- PYTHONUTF8=1 python gpu/naval_test.py: NAVAL (B-6) POKES OK (10 pokes)
- npx tsc --noEmit: clean
- npx vitest run tests/naval-embark.test.ts: 16 passed (1 new player-naval move)
- PYTHONUTF8=1 python gpu/parity_test.py: PARITY OK — 0.0 milli
- battery.py: new `naval` lane wired into the cputests group (gpu/naval_test.py)
