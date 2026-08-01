# ROUND B9 — A-9 catalog reachability (task #65)

2026-07-19. Closes AUDIT A-9 (rival-unreachable catalog). Scoping found
the DATA layer already complete — all 11 districts with adjacency
(B-16's IZ channels included), Theater Square / Industrial Zone /
Encampment / Entertainment Complex buildings all defined, all 9 GP
classes wired in `GP_CLASS_DISTRICT`, appeal modeled (core/appeal.ts).
A-9 is purely a REACHABILITY gap with four faces:

1. `SCAFFOLD_DISTRICTS` (data/districts.ts) has 5 entries — the shared
   list driving the TS rival picker (`tryQueueRivalDistrict`), the TS
   scripted player capital chain, the exporter scaffold and the GPU
   `_scaffold` — so 5 districts + their buildings never appear on any
   scripted seat.
2. Worship buildings are skipped in `tryQueueRivalBuilding` and the A-5
   purchase block (`def.worship` guard) — rivals found religions (B-18)
   but never build their worship building.
3. PALACE is player-only: `foundCity` grants it to city 0;
   `foundRivalCity` never does; the GPU "+PALACE" yield term is
   hardwired to c==0.
4. Downstream, `claimGreatPeople` can never accrue ENGINEER / GENERAL /
   ARTIST (their districts never exist on scripted seats).

Blocked plumbing discovered in scoping (must land with the breadth):

- The GPU scaffold tuple is `(district idx, unlock TECH idx, placement)`
  — Theater Square (DRAMA_POETRY), Entertainment Complex
  (GAMES_RECREATION) and Neighborhood (URBANIZATION) are CIVIC-unlocked.
  The scaffold spec/exporter/GPU tuple gain an `unlockKind` dimension
  (tech|civic); the GPU gate reads `r_techs` or `r_civics` by kind.
- Exporter `BUILDING_DISTRICTS` is DERIVED from SCAFFOLD_DISTRICTS, so
  widening the scaffold auto-widens the exported building table — which
  pulls in `exclusiveWith` (BARRACKS/STABLE), a concept the exporter/GPU
  pickers lack (only `reqBuildings` ships). Both GPU building pickers
  (player scripted + rival) need the exclusion mask.
- Four incoming buildings are REGIONAL (Factory, Power Plant, Zoo,
  Stadium — yields/amenities to all same-civ city centers within
  `REGIONAL_RANGE` 6, per-receiver dedup by building id, pillaged source
  dark). The player TS side has `regionalEffects` (yields.ts); the GPU
  has NO regional channel on any seat and `rivalCityYields` has no
  regional term. Shipping these buildings without the channel is an
  instant parity break, so they are HELD until the channel exists
  (stage R2, inert-first pattern).
- Encampment placement (`notAdjacentToCityCenter`) needs a new GPU
  placement code (existing codes: land / aqueduct / coastal).

## Design decisions (source-of-truth: real Civ 6, sized to modeled scope)

- **Scaffold order**: existing five unchanged (CAMPUS, HOLY_SITE,
  COMMERCIAL_HUB, AQUEDUCT, HARBOR), then append INDUSTRIAL_ZONE
  (APPRENTICESHIP, tech), THEATER_SQUARE (DRAMA_POETRY, civic),
  ENTERTAINMENT_COMPLEX (GAMES_RECREATION, civic), ENCAMPMENT
  (BRONZE_WORKING, tech, placement notAdjacentToCityCenter).
  First-placeable-in-list-order semantics are unchanged; yields-first
  priority, Encampment last (it re-enters the scaffold after its
  BUILD_PLAN D6 hold-out — its cap competition is now intended
  behavior, as real AIs build early Encampments). NEIGHBORHOOD is the
  R4 stretch (below), not in the core append.
- **Regional hold (R1→R2)**: a shared `SCRIPTED_HELD_BUILDINGS` set
  (data/buildings.ts) = {FACTORY, POWER_PLANT, ZOO, STADIUM}, honored
  by `tryQueueRivalBuilding`, the A-5 purchase block, the TS scripted
  player pick and the exporter building filter. R2 implements the
  regional channel on both engines/seats and empties the set.
- **Worship (R3)**: deterministic pick, draw-count NEUTRAL — at rival
  religion founding the worship building is keyed off the religion
  index (`WORSHIP_BUILDINGS[relIdx % 5]`, no `_next_random` draw).
  Rivals FAITH-buy it (worship is faith-purchase-only, flat
  190·GAME_SPEED like the player's `buildingFaithCost`) in the A-5
  purchase block, gated on founded religion + COMPLETE Temple in that
  city; GPU mirror at the same block position. Player machinery
  unchanged.
- **PALACE (R3)**: `foundRivalCity` grants `['PALACE']` to a civ's
  FIRST city; GPU rival yield paths add the exported palace
  yields/housing/amenities on the capital rc (reuse/extend the A-4
  capital identification; if none exists as a plane, add `rc_iscap`
  with full founding/capture/transfer/reclaim discipline). No palace
  relocation on capital loss — B-30 already strips PALACE on every
  capture/transfer path, both directions stay consistent; recorded
  residual.
- **NEIGHBORHOOD (R4, stretch — droppable to a recorded residual)**:
  scaffold entry (URBANIZATION, civic) + DYNAMIC appeal-tier housing
  for scripted seats mirroring the player's `appealTier(tileAppeal())`
  (city.ts): GPU needs a vectorized appeal term over the 6 neighbors
  (wonders/woods/mountains/coast positive, rainforest/marsh/mine/
  quarry/IZ/EN negative — appeal.ts is the spec). Housing feeds rival
  yields → verify every appeal input mutation site bumps
  `_eff_version` (improvement placement, district paving, wonder
  completion). If this balloons, DROP to residual and close A-9 at
  ~90%.
- **GP classes**: no new machinery expected — verify the GPU GP accrual
  counts the new district types via the exported class→district map,
  probe ENGINEER/GENERAL/ARTIST accrual in-gate.

## Stages (SERIAL, main-session — the audit tags queue/pick logic
## Fable-only; agents only where marked)

- **R1 — scaffold breadth + building flow (no regional)**: unlockKind
  plumbing end-to-end; 4 new scaffold entries; EN placement code;
  exporter auto-widen + `exclusiveWith` export + held-set filter; GPU
  picker exclusion masks; GP accrual verify. All three surfaces
  (production queue, A-5 gold purchase, controlled-head masks stay
  as-is per #50). Gates.
- **R2 — regional channel**: TS `rivalCityYields` regional term (own-civ
  cities within 6, dedup-by-id, pillage-dark — `regionalEffects`
  semantics verbatim); GPU regional term in the player walk building
  yields AND both `_rival_city_yields` paths (per-j and the D-9 batched
  twin — mind the #58 cache keys: completion/pillage already bump
  `_eff_version`, verify no new invalidation events). Empty the held
  set. Gates.
- **R3 — worship + PALACE**: per decisions above, both engines. Gates.
- **R4 — NEIGHBORHOOD stretch**: per decision above, own gates;
  droppable.
- **R5 — coverage + close**: one Opus agent (efficiency contract below)
  authors vitest additions + poke suite `gpu/tests/district_breadth_test.py`
  (battery lane `districts`): IZ adjacency channels live, EN placement
  rule, regional 6/7-distance boundary, exclusiveWith, worship
  faith-buy, rival PALACE, ENGINEER/GENERAL/ARTIST accrual,
  new-plane dtype check. Re-check EXISTING poke lanes against the new
  gating (B5 lesson) BEFORE the round battery. Then ONE battery
  (`python gpu/battery.py --no-eval`), AUDIT/HANDOFF close-out.

## Standing rules in force

ONE battery for the round, at the END — stages run gates only
(tsc → touched vitest → export → scripted → forced → rollout, all
foreground). PYTHONUTF8=1 on piped runs. Export via
`npx vite-node scripts/export-gpu.ts` (READ the text output; rm
orphaned seedNNNN.json on any SEED_OVERRIDES change). New tensors:
match dtypes (the battery's f32 gumbel lane catch), snapshot/reclaim
discipline (`_reclaim_pool`/`_reclaim_rc` + forced-compaction knobs),
POOL-END invariant on any ownership transfer, exporter t0 dumps
snapshot pre-run. Cache counters: any new mutation site feeding rival
yields/housing bumps `_eff_version` (or the round documents why not).
AUDIT anchors by SYMBOL. Red gate → statelog-first hunt
(gpu/HUNTING.md).

Agent efficiency contract (R5 agent prompt carries verbatim):
(1) iterate on the scripted parity gate only while red; forced +
rollout ONCE each at the end; green ladder = STOP; (2) Grep to locate,
then ONE generous-context Read per work zone; (3) batch independent
shell commands, tail/filter long outputs.
