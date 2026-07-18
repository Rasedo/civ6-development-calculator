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

## Residuals
- Loot lumps to the pillager NOT modeled (v1, matches D-20). Recorded residual.
