# ROUND B4 — Slice Z log (AUDIT B-32 district pillage)

Round base: 18dff6d570830da4d8b6136a8a8e9a2df6076e3e

## Scope (from ROUND_B4.md Slice Z)
- TS: `Tile.districtPillaged`, `hostileUnitAct` step-2/step-3 extension,
  yield/housing/amenity/GPP/envoy-channel gating while pillaged (static counts stay),
  `builderRepair` + rival builder repair extended to district tiles.
- GPU: `district_pillaged` [B,T] plane (_MUTABLE, snapshot/restore, reclaim-safe),
  gating in BOTH player yield pipelines + BOTH rival yield paths
  (`_rival_city_yields` per-j AND the D-9 `_all` twin), widened hostile march/target
  scans, rival repair twin.
- CACHE INVARIANT: every rc-district pillage/repair event must bump `_eff_version`.
- No new RNG draws; no loot lumps, no heal in v1.
- Focused vitest.

## Progress log
- (start) Worktree set up, HEAD == round base, fixtures copied, anchor commit.
- TS implemented: types.Tile.districtPillaged; importer/mapgen/game-hydrate +
  tests/helpers init false; yields.ts pillagedDistrictTypes helper +
  cityDistrictYields/cityBuildingYields/regionalEffects/localBuildingAmenities
  gating; city.ts computeHousing (Aqueduct + district housing + building
  housing) + citySpecialistSlots; game.ts greatPersonPointsPerTurn; units.ts
  builderRepair; combat.ts hostileUnitAct (step2 district pillage + step3 union);
  rivals.ts rivalHousing/rivalCityYields/claimGreatPeople/rivalAmenityTiers +
  rivalBuilderActions (repair underfoot + rivalHasJob + job scan).
- GPU implemented: district_pillaged plane + _MUTABLE; _pillaged_bf_live +
  _rc_bdark helpers (via _b_req_district); _city_totals (bf_live for
  yields/housing/amenities/follower adds; owned_d_live for adjacency/CS/has_aq/
  ship; maint + counts stay); _advance_great_people; _rival_city_yields (per-j)
  + _rival_city_yields_all (twin) + _g5_hm housing + rival GPP claim + 
  _rival_amenity; barb + rival march (step2 district pillage bumps _eff_version;
  step3 union); _rival_builder_actions (district repair underfoot + job mask).
- vitest tests/district-pillage.test.ts: 3 tests pass. Full suite 262 pass.
  (tests/helpers.ts + serialize round-trip needed the new field.)
- tsc clean. export-gpu clean (250t all seeds, trajectories reshuffled).

## Decisions / deviations

### Gating line (the key design decision)
A district that is COMPLETE but PILLAGED:
- GATED (contributes nothing to its city — brief's list): its own adjacency
  yield (+ the CS-envoy 3/6 district add that rides it in cityDistrictYields,
  + follower Work-Ethic Holy-Site production); its INTRINSIC district housing
  (Aqueduct water bonus, Neighborhood/other district housing); its buildings'
  yields, housing, amenities, GPP, specialist slots/yields; the SHIPYARD
  Harbor-adjacency production when the Harbor is pillaged.
- STAYS ("static counts stay — pillaged is still owned"): completedDistrictCount
  (district cost scaling / one-per-type / maxSpecialtyDistricts); district
  maintenance (a COST, not a contribution — real Civ 6 keeps charging it);
  count-based policy/belief housing+amenity rules that read
  completedDistrictCount / specialtyCount (INSULAE housingIfDistricts, New Deal,
  Zen Meditation amenitiesIfSpecialty); eureka/inspiration boost conditions;
  CS quest "build a district" conditions; canFoundReligion Holy-Site condition
  (religion left untouched per brief).
- Deviation note: the brief's literal channel list says "its BUILDINGS'
  housing"; I also gate the district's OWN intrinsic housing (Aqueduct/
  Neighborhood) because real Civ 6 disables ALL of a pillaged district's
  function ("contributes NOTHING to its city"). matchesAdjacency (the district
  as an adjacency SOURCE for OTHER districts) is left ungated — the brief scopes
  gating to the district's own contributions, and this keeps both engines'
  _district_adj memo untouched.
- Building→district key: GPU uses `_b_req_district` (== TS BuildingDef.district
  mapped to the catalog idx, CITY_CENTER→-1; verified in export-gpu.ts).


## Gate results
- tsc --noEmit: clean.
- vitest: tests/district-pillage.test.ts 3/3; full suite 262/262 pass.
- export-gpu: clean, all 25 seeds 250t (trajectories reshuffled as expected —
  barbs/rivals now target districts too).
- parity_test.py (scripted): PARITY OK — 24 seeds × 250 turns, 0.0 milli.
- parity_test.py CIV6_RECLAIM_AT=12 CIV6_RC_RECLAIM_AT=3: PARITY OK, 0.0 milli.
- rollout.py --shards 4 --pipeline-replay: REPLAY PARITY OK, 72 games × 250t.
  (shard2 min score 0.0 = a normal off-script player elimination, not a
  reference degeneration; replay parity holds regardless — no reroll.)
- Battery NOT run in-worktree (owner protocol: it runs once at merge).

## In-gate reachability (probe, scripted reference, 250t)
- district_pillaged fires: 5/24 games pillage a PLAYER district
  (seeds 9001, 9054, 9066, 9118, 9209); 8/24 pillage a RIVAL district
  (seeds 9001, 9014, 9029, 9079, 9105, 9131, 9170, 9222 — barbs raiding
  rival districts, the C-4a convention). BOTH seats exercised; the yield/
  cache gating is genuinely covered by the gate, not dead code.

## Residuals
- Loot lumps to the pillager NOT modeled (v1, matches D-20). Recorded residual.
- Barbarian raiders still KILL captured civilians / no district loot heal —
  consistent with the improvement-pillage v1 convention (no heal on yield
  pillages here either).
- Player scripted builder (exporter walker + GPU #56 H2) repairs improvements
  only, NOT districts — SYMMETRIC in both engines (a scripted-player limitation,
  not a divergence). Only the RIVAL builder and the RL builderRepair action
  repair districts. A pillaged player district in the scripted game therefore
  stays dark until end (both engines agree).

## Merge watch-items
- AB (B-30 conquest keeps infrastructure) shares district liveness: a captured
  PILLAGED district must STAY pillaged (real Civ 6 keeps the damage). This slice
  never clears district_pillaged on capture/transfer, so AB just needs to carry
  the plane through its capture paths like district_dead (it's a tile plane, so
  ownership re-key alone is enough — no per-slot remap).
- New GPU cache field: _ct_cache store gained key "bf_live"; any future reader of
  the store must expect it. bf_live/owned_d_live are _eff_version-keyed (pillage/
  repair bumps it in all 4 mutation sites: barb march, rival march, rival builder
  repair, player #56 walker repair already bumped for improvements).
- _b_req_district is the building→district gating key on the GPU (== TS
  BuildingDef.district). If AB maps rc_bldg building-index spaces, keep this
  alignment.
