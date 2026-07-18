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

## Gate results

## Residuals
- Loot lumps to the pillager NOT modeled (v1, matches D-20). Recorded residual.
