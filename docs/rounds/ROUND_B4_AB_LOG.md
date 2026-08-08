# ROUND B4 — Slice AB log (B-30 conquest keeps infrastructure)

Round base: 18dff6d570830da4d8b6136a8a8e9a2df6076e3e

## Task
Capture/transfer keeps districts+buildings+wonders minus PALACE; ANCIENT_WALLS
kept at outerHp=0; razes unchanged. Four TS paths + GPU twins.

## Coordinator directive (mid-task)
- Do NOT run gpu/battery.py in the worktree. Ladder ends at rollout --pipeline-replay.
  The full battery runs once at merge (main session). Noted; battery not run.

## Progress log
- Anchor commit: worktree setup, fixtures copied, log created.
- Implemented all 4 TS paths + 3 GPU twins + vitest (2 new). tsc clean,
  vitest 261 pass, exporter clean.
- Scripted parity gate first RED: seeds 9118 (t102) + 9235 (t119), both bldgs3.
- DIAGNOSIS (deep hunt, statelog + exporter CIV6_B30_DBG probe + GPU tile probes):
  the failures are NOT in the B-30 carry mechanic itself — they expose a
  PRE-EXISTING rival district/tile-registry inconsistency that B-30's infra-carry
  surfaces. Two facets:
    (1) PHANTOM tile: a rival city's `.districts` array can reference a tile whose
        A-17 registry (rivalCityId / rc_tile_id) points at a SIBLING rival city
        (seed 9118: rcId4 held HOLY_SITE@891 while tile 891 was registered to
        rcId3). On capture, my first TS carry copied the whole `.districts` array
        (phantom included) while the GPU (tile-ring re-ownership) correctly did
        not — TS then queued a Shrine off a HOLY_SITE it did not actually own,
        which never completes (buildingCompletable false) → froze at itemCost,
        while the GPU built a different building. bldgs diverge.
    (2) INCOMPLETE carried district: an incomplete captured Holy Site is enough
        for TS `availableBuildings` (keys on a district being PRESENT) to offer a
        Shrine, but the GPU gates queueing on `district_complete` → different
        building chosen (seed 9235).
  Both are invisible to the scripted trace (player district positions/counts are
  NOT traced) until they move a building COUNT.
- ROOT FIX (both engines, source-of-truth aligned): a captured/transferred city's
  districts are DERIVED FROM THE TILES it actually owns, COMPLETE districts only —
  never copied from the rival's (possibly inconsistent) `.districts` array. This
  makes TS byte-exact with the GPU twin, which already derives player districts
  from re-owned tile ownership + `district_complete`. INCOMPLETE captured
  districts stay paved-but-dead (the pre-B-30 district_dead behaviour, now scoped
  to `~district_complete`), so `availableBuildings` and one-per-type agree.
  Symbols: combat.ts captureRivalCity (tile-scan keptDistricts + wonders cityId
  filter), phase.ts transferCityToRival (tile-scan keptDistricts), engine.py
  _capture_rival_city (district_dead scoped to ~district_complete),
  _transfer_city_to_rival (gather gated on district_complete). rc->rc twin carries
  the registry verbatim in both engines (self-consistent).
- RESULT: scripted 0.0 milli (24 seeds), forced-compaction 0.0 milli, off-script
  rollout pipeline-replay OK (72 games), vitest 261 pass, tsc clean.
- RESIDUAL for merge/AUDIT: the underlying rival placement/registry inconsistency
  (a rival city's district on a tile registered to a sibling) is pre-existing and
  still latent — B-30 no longer diverges on it (it carries only genuinely-owned
  complete tiles), but the rival-side registry could be hardened separately.
