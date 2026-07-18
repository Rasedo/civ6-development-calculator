# NAVAL N3 — poke suite + battery lane (main session)

Stage base: b097400 (N2 merged, naval LIVE + gate-green). TEST-ONLY stage:
no edits to src/core, src/data, scripts/export-gpu.ts, gpu/civ6gpu/engine.py.

Scope = `gpu/naval_test.py` covering N2's gate-unreachable naval surfaces,
TS twins in tests/naval-embark.test.ts where natural, and a `naval` battery
lane. The engine already has the mechanics; N3 pins the semantics the 24×250
scripted parity gate cannot reach.

## Poke coverage (gpu/naval_test.py)
- [ ] GALLEY naval melee attack + CAPTURE of a coastal rival city
      (siege → _player_attack_rival_city → _capture_rival_city)
- [ ] GALLEY naval melee attack + CAPTURE of a coastal CS
      (cs_hit → _capture_city_state)
- [ ] QUADRIREME bombard vs a rival UNIT (r_att ranged, no retaliation/advance)
- [ ] QUADRIREME bombard vs a rival CITY (r_sieg, HP floors at 1, no capture)
- [ ] PLAYER naval spawn-on-water (_spawn_player naval probe) + attack
- [ ] OCEAN gate pre/post CARTOGRAPHY (naval spawn probe + war-march water_gate)
- [ ] pcstk (player city walls) strikes a ship + an embarked unit (override)
- [ ] rcstk (rival city walls) strikes a player ship + embarked unit (override)
- [ ] embarked-civilian capture POOL-END invariant + keeps-embarked (GPU)
- [ ] naval ally counts in B-7 flank/support; embarked contributes nothing

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
(none yet)
