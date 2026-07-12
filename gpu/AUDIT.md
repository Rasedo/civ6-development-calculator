# Engine audit v2 — 2026-07-11

Second full audit (4 parallel read-only sweeps: asymmetry, fidelity, docs,
perf), replacing the 2026-07-10 audit. Solved items are dropped — the
landing log lives in git history (P1 10d2382, P2 03fd1fe, P3 8d115b6,
P4 93efb76 = old §D fully closed, P5-S1 3b30b8f, S7 e5569a5, S2 ab0c19c,
S3 9a1b073, S4 b44aff5) and in the session memory. Line numbers cite the
code at audit time.

**Ladder state:** P1–P5 DONE (task #31 closed 2026-07-11: S1 economy,
S7 camps/raze, S2 peace+settler purchase, S3 founding, S4 culture
borders, S5 GP/faith/religion, S6 loyalty+amenities, S8 controlled
revalidation — ~25 hunted latent parity bugs across the batch).
P6 verified dead + P7 shipped 2026-07-12 (42f7313); P7-FULL (task #34)
closed the C-2/C-3/C-5 residuals the same day. **P8 (#26) is PARKED by
owner directive (2026-07-12) until this file has nothing left to fix —
the open chapters below (A, B, remaining C, D, E) ARE the roadmap**;
then ONE re-baseline pass and the champion campaign.

---

## A. Player–rival asymmetry (the symmetry contract's open gaps)

Rivals must be full-fidelity symmetric agents — same formulas, same
available actions; only the decision policy may differ. Confirmed open:

**Open, ranked by impact** (A-1 loyalty/amenities and A-2 controlled
revalidation LANDED in the S6+S8 close):
- A-3. **RESOLVED (2026-07-12, task #37)**: rivals fire eurekas/
  inspirations from their own seat — detectRivalBoosts/_detect_rival_boosts
  at the rival block top (same condition rows; rc cities/research/
  territory, map-global rows shared), boosted completions at the player's
  60% (effectiveResearchCostIn/_eff_cost, same rounding), AND the
  cheapest-first pick keys on effective cost like the player's auto-pick.
  New coastal_land (`cl`) plane for rc coastalCity eurekas. Battery green
  first try.
- A-4. **RESOLVED (2026-07-12, task #38)**: rival capitals build world
  wonders — data-order pick, lowest-index eligible tile, one per world,
  queue-time paving with the floodplains exception + C-6 bonus strip;
  effect channels at the player's exact positions (cityYields pre-tier,
  HG growth product, Petra post-selection, Oxford/Big Ben mults
  post-tier); anyWonderBuilt eurekas + faithPerWonder activated; -3
  unlock encoding for out-of-tree requirements. TWO hunt catches: the
  D-10 trace-harness recurrence (wonder items carry no cost — 11/13
  "failures" were gpu-trace.ts, not the engines) and a C-6 LATENT
  (SEA_RESOURCE adjacency must WITHDRAW when a bonus sea resource is
  paved over — _withdraw_sea_adj at all three strip sites).
  **Task #39 addendum (the A-8 hunt's catch, rng 2026006080 t246)**: the
  9 builtWonder exclusion masks MISSED the improvement-job class —
  validImprovementsIn never refused an in-flight wonder pave, so both
  engines' builders happily improved a wonder tile and their GAIN models
  split (TS live tileYields returns all-zero on paved tiles → every
  Δ-gain 0 → FARM tie-break; the GPU's catalog constants said MINE).
  Fixed at the RULES level, real-Civ 6-ward: builtWonder now refuses
  improvements in validImprovementsIn + six GPU gates (_rival_job_mask,
  build-here validity via jobm, player/rival RL masks, controlled apply,
  scripted-builder build+job, player apply). Side-find, mirrored: TS
  zeroes improvement gains on PILLAGED tiles too (yields.ts:49 — a chop
  can orphan the flag on a bare tile) — the GPU Δ-gain model now
  multiplies by the unpillaged indicator.
  **Forced-compaction catches (same batch)**: (1) rng 2026006080 t220 —
  the settler-founding slot init was MISSING three of the P5/S2 hygiene
  clears; a hole-fallback founding into a column whose dead city had
  buildings inherited them (3 phantom buildings' yields + maintenance;
  TS founds with buildings: []). buildings/cur_cost/q_dtile now clear
  exactly like the CS-capture block. (2) rng 2026006084 t193 — the
  PLAYER border-growth ySum missed FARM-ADJACENCY food (tileYields
  carries it, yields.ts:60-63; frontier tiles never hold farm clusters
  until a raze frees EX-RIVAL farmland — the pick then took a bare hill
  over a clustered farm, a permanently different border). _farmadj_food
  joins the border y_sum like the walk's scoring; the rival twin
  (_rcy_food_plane) already carried its own. The hunt also closed a
  SECOND builtWonder mask gap en route: the player WALK's candidate
  mask (TS workableTiles excludes builtWonder, city.ts:121 — reachable
  by capturing a city with an in-flight wonder in radius). The knobs'
  third and fourth real catches in three runs.
- A-5. **RESOLVED for the building drain (2026-07-12, task #38)**: one
  scripted purchase per civ per turn — cheapest completable building
  civ-wide (cost/id/city-order key), instant at goldPurchaseMult, the
  opening peace cost held as a war chest, queued-in-city duplication
  guard. REMAINING (policy scope): scripted unit/settler purchases and
  tile purchase — the controlled head has the machinery; give the
  scripted rival those spends when a stage needs them.
- A-6. **RESOLVED (2026-07-12, task #39)**: rivals field a MIXED roster —
  the pick trains ranged while the army holds fewer than 1 ranged per 2
  melee (live + queued composition, counts advancing through the pick
  loop both engines), ARCHER once ARCHERY lands, SLINGER before (ungated,
  like the catalog); the melee ladder unchanged. Ranged units STRIKE
  (hostileRangedStrike/_hostile_ranged_strike — one roll, no retaliation,
  no advance; a player city takes the hit first even through a garrison
  and HOLDS at 1 HP, ranged never captures; civilians take the roll,
  rangedAttack's convention) and the war/peace target scans run at the
  unit's full range in tile order (playerCity at d<=range = the player's
  D-23 bombard rule from the other seat; other civs' centers stay the
  no-op quirk). SCOUT stays deliberately out — rivals have no fog to
  explore. bestMeleeCS already excluded ranged (spawnUnit chokepoint).
- A-7. **RESOLVED for beliefs (2026-07-12, task #37)**: claimed
  pantheons/beliefs carry IDENTITY now (rival.pantheon/followerBelief/
  founderBelief + GPU r_pantheon/r_follower/r_founder with per-id pool
  masks; the claim draw picks the k-th OPEN id in data order, both
  engines) and their effects APPLY via getRivalModifiers/_bel_* tables:
  feature yields, improvement-on-resource (the hunt's catch — strategic
  MINEs on IRON/NITER/COAL exist today, two −1-production cities at rng
  2026006082 t127), building yields/housing, Work Ethic, growth/border
  multipliers, Divine Spark GPP, River Goddess + Zen amenities/housing,
  founder incomes to the capital. faithPerWonder shipped with A-4 (fpw);
  improvementYields shipped with A-13 (impY, applied in
  _belief_feat_plane — only the FISHING_BOATS row stays out, its target
  is water-unreachable in both engines). REMAINING (re-scoped):
  government/policy machinery for rivals — build with the policy-breadth
  stage (task #46/B-13).
- A-8. **RESOLVED (2026-07-12, task #39)**: all three rival walkers (war
  march, patrol, builder walk) run REAL MP — per step: re-pick the free
  neighbor by the site's existing tie-break keys, move only if strictly
  closer, pay walkPath's exact charge (enter cost 1+hills+slow-feature =
  1 + tdef//3 live/strip-adjusted, +3 per river-edge crossing via the
  new `rm` riverMask plane — the GPU's neigh columns ARE AXIAL_DIRS
  order, so bit d = crossing toward column d), full-MP units always
  afford their first step (walkPath D-3/D-4). A CITY march target stops
  ADJACENT (enemy centers can't be entered — real Civ 6; a unit standing
  on one could never attack it, the d>=1 scan); improvement targets are
  walked ONTO (pillage reads the tile underfoot). Any step still blocks
  the D-2 heal (movesLeft < full = v_acted). BARBARIANS keep the
  one-step raid pace — their MP fidelity belongs to B-26 (task #44).
  ONE gate catch + one mirrored latent — the story lives in the A-4
  entry's task-#39 addendum (the missed builtWonder job mask).
- A-9. **Rival-unreachable catalog**: districts outside SCAFFOLD_DISTRICTS
  (THEATER_SQUARE, INDUSTRIAL_ZONE, ENCAMPMENT, ENTERTAINMENT_COMPLEX,
  NEIGHBORHOOD + their buildings), worship buildings, PALACE (rival
  capitals永 lack its yields/housing/amenity — game.ts:203 vs
  rivals.ts:124). Downstream: rivals can never accrue ENGINEER/GENERAL
  (and Theater-class) great people — those districts are unreachable.
- A-10. **RESOLVED (2026-07-12, task #39)**: the rc heal (+15 peace / +5
  war, magnitudes unchanged) now gates on the player's exact besieged
  rule from the rival's seat — any adjacent unit hostile to THIS civ
  pins the HP (the player's at-war units, CIVILIANS included per
  unitsHostile — the P5/S2 player-heal lesson — or barbarians; other
  rivals never besiege), read live at the heal's position in the city
  loop.
- A-11. Rivals have no trade routes (trade.ts player-keyed).
- A-12. Rivals don't interact with city-states (no envoys/influence/levy;
  can't even attack CS — combat.ts:171-177 gates csTarget to the player).
- A-13. **RESOLVED (2026-07-12, task #40)**: the improvement roster grew
  3→8 — [FARM, MINE, LUMBER_MILL, QUARRY, PASTURE, CAMP, PLANTATION,
  OIL_WELL], indices 0-2 stable so every existing plane/consumer keeps
  its meaning. Rivals build ALL of them: a resource tile offers exactly
  its resource's improvement (validImprovementsIn's branch; the new
  per-tile `rq` plane + per-improvement unlock/yields/housing tables in
  rules.json), unlock-gated on the RIVAL's own techs (PASTURE/CAMP←
  Animal Husbandry, QUARRY←Mining, PLANTATION←Irrigation, OIL_WELL←
  Steel). Yields ride _eff_prod/_eff_yields/_neutral_prod + the rival
  ty_oth/y_oth static columns (CAMP/PLANTATION gold) with pillage
  suppression; housing is table-gathered both sides (PASTURE/CAMP/
  PLANTATION 0.5, pillaged counted — computeHousing never gates);
  luxury amenities auto-activate via the re-derived luxreq. Rival
  REPAIR shipped too: standing on an owned pillaged tile clears it
  FIRST (builderRepair semantics — no charge, turn spent), and repair
  jobs (owned & pillaged, NO validity gates — rivalHasJob's exact
  branch) join the job mask/walk targets/builder-training gate. The A-7
  belief improvementYields table (impY) is wired in _belief_feat_plane
  (God of the Open Sky pastures etc.); the rival builder Δ-gain ctx
  stays modifiersFromResearch (no beliefs), catalog-only for the new
  imps. OUT OF SCOPE, deliberate: FISHING_BOATS (water tile — a land
  builder can never stand on it, structurally unreachable in BOTH
  engines; exported rq=-9, God of the Sea inert); chop/harvest stays
  policy-symmetric via the controlled heads; PLAYER repair/resource-
  improvement verbs grow the RL action space → batched into A-18's
  re-baseline. SCRIPTED-GATE CATCH (seed 9066 t57, rTechProg1 −1000
  milli constant): rival 1's first-ever QUARRY (t48, tile 786) fired
  MASONRY's "build a quarry" eureka in TS only — the exporter's
  improvement-boost row still hardcoded FARM/MINE/LUMBER, so the GPU
  never saw quarry/pasture eurekas and the rival's research stream
  forked on the boosted cost (same catch class as the player's techs
  on seed 9144). Fix: boost rows index the full roster
  (IMPROVEMENT_IDS.indexOf), 34 → 36 detectable boosts — the GPU
  detectors were already generic, only the table was short.
  OFF-SCRIPT GATE CATCH (rng 2026006108 t81 col 44, ×3 same-class):
  an A-7 LATENT exposed by the trajectory shift — rival 0 claimed Lady
  of the Reeds and its city center sat on an OASIS. TS foundCity strips
  ONLY a REMOVABLE feature (game.ts:209/rivals.ts:144), so the oasis
  stayed LIVE and the pantheon fed the center +2⚙; the GPU's founding
  paths set feat_stripped unconditionally — benign for yields (the fy
  plane is removable-only, zeros) but _belief_feat_plane uses
  ~feat_stripped as LIVENESS, so the center's belief add starved (1.9
  = 2⚙ × the 0.95 amenity tier, constant from the claim turn). Fix:
  new per-tile `frm` (removable-feature) bit; both founding paths gate
  their feat_stripped AND tdef writes on it (TS's terrainDefense also
  reads the surviving feature). Hunt cost note: the TS decomposition
  came from a ONE-GAME rollout extract replayed with console probes —
  see the verify-loop FIFTH boundary (a GPU resume run clobbers
  rollout.json; replay-gpu.ts now hard-fails zero-game vacuous runs).
- A-14. **RESOLVED (2026-07-12, task #38)**: the picker's terminal rung —
  army capped and nothing queueable → the first project whose district
  is complete (data order), at the player's cost curve on the RIVAL's
  research; completion pays round(cost×0.75) into the civ's own stream
  + round(cost×0.3) GPP. Table-driven: Theater/Encampment projects wire
  themselves when A-9 lands.
- A-15. **RESOLVED (2026-07-12, task #40)**: camps rise away from EVERY
  civilization — live RIVAL city centers repel candidates at the same
  <5 spacing as player cities/camps, and the spawn-roll gate is
  anyCivCity (player OR rival cities; real Civ 6 barbs don't die with
  the player — the short-circuit is part of the draw-count contract,
  both engines changed together). Fixture fallout: the stronger-rivals
  trajectory shift killed scripted seed 9027 (Rome+Egypt double war
  t21, capital conquered t36, last city loyalty-flipped t84 → zero
  player cities at t100) — the exporter gained a documented
  SEED_OVERRIDES map (index 2 → 9028) plus a CIV6_EXPORT_DEBUG=<seed>
  narration knob; a dead player poisons a scripted fixture (the policy
  closure keeps mutating a ghost capital), while off-script rollouts
  keep covering collapse trajectories.
- A-16. **RESOLVED (2026-07-12, task #40)**: captureCityState razes at
  >= 6 live cities exactly like captureRivalCity (csId ring cleared,
  event logged, NO city founded — TS early-returns before
  nextCityId++); the GPU raze `continue`s before the slot logic, which
  also kills the documented skip-at-full-pool divergence (the old TS
  pushed past 6 while the fixed GPU slots could not).
- A-17. Rival border-growth adjacency is CIV-level (no per-rc tile
  registry) vs the player's per-city adjacency — documented S4 delta,
  P7 material (needs per-rc tile ownership).
- A-18. RL surface: the unit-attack mask does not offer CS-center attacks
  (the V-CS verb exists engine-side) — do deliberately with a re-baseline.
  Task #40 adds two more re-baseline items: PLAYER builder repair and
  resource-improvement verbs (rivals have both since A-13; the scripted
  player policy deliberately keeps farming only — action-space growth
  belongs with the P8 re-baseline).

## B. Engine fidelity vs real Civ 6 (missing/simplified systems)

Verified correct (do not re-flag): eureka 40%, 1-district-per-3-pop,
growth curve 15+8(n−1)+(n−1)^1.5, amenities-needed ceil((pop−2)/2),
pantheon 25 faith, the 10 base governments.

**Combat/military:**
- B-1. City walls/ramparts missing entirely (no outer-defense HP layer,
  no Walls buildings) — sieges trivialized, nothing to build for defense.
- B-2. Cities never ranged-strike attackers (only melee retaliation).
- B-3. No zone of control.
- B-4. No unit XP/promotions/veterancy.
- B-5. No fortify action/bonus.
- B-6. No embarkation, no naval units — water is a wall.
- B-7. No flanking/support bonuses.
- B-8. Great Generals/Admirals modeled as economy lumps, not combat auras.
- B-9. No strategic-resource requirements/stockpiles for units.
- B-10. Military roster ends at Horseman — no Swordsman/Knight/siege/
  gunpowder line; their unlock techs are absent from the tree.

**Progression breadth:**
- B-11. Tech tree ~32 of ~68 (stops at Modern, no Atomic/Information).
- B-12. Civics ~31 of ~50.
- B-13. Policy cards ~20 of ~50+; diplomatic slots exist but no
  diplomatic cards (idle by design comment).
- B-14. CITIZEN_SCIENCE = 0.7/pop (real Civ 6 commonly cited 0.5) —
  verify intent; culture 0.3 matches.

**Economy/districts/religion:**
- B-15. No war weariness.
- B-16. District adjacency magnitudes deviate (IZ +1/mine vs real +0.5,
  Harbor +2/CC vs real +1; Campus/HS/CH close).
- B-17. Encampment has zero adjacency/specialists (economically inert).
- B-18. Religion: no Enhancer belief slot; no spread/pressure, no
  religious units/combat — religion is a private yield engine.
- B-19. GP costs: flat 60·2^n per class per civ (real: era ladder +
  global race for specific individuals). The shared-pool race here is
  first-to-threshold on a common earned-counter — close but not the
  per-person snipe.
- B-20. GP effects are instant lumps only (no tile activation, Great
  Works, charges).

**Meta:**
- B-21. City-states: no per-CS unique suzerain bonuses; 3/6-envoy bonuses
  keyed to districts, not buildings.
- B-22. Diplomacy: no casus belli/grievances/alliances/World Congress.
- B-23. Trade simplified: no Trader unit/roads/route duration/
  international routes.
- B-24. No governors (R&F core), no era score/Ages (Dark/Golden).
- B-25. Victories: only Domination + turn-limit Score; no Science/
  Culture (no tourism at all)/Religious/Diplomatic.
- B-26. Map: no cliffs; barbarians don't scale by era or use the real
  scout-then-raid mechanic; no ranged/naval barbs. ALSO (task #39): barb
  raiders kept the ONE-step march when rival movers gained real MP
  walks (A-8) — real Civ 6 barbs move full MP; land it here.
- B-27. Catalog sizes: 13 world wonders, 7 natural wonders, ~40 buildings
  (no Walls/Dam/Canal/Government Plaza), 10 pantheons (~24 real),
  6 follower + 4 founder beliefs.

## C. Order/slot integrity latents (the P6/P7 family) — CHAPTER CLOSED 2026-07-12 (C-1..C-7 all resolved)

- C-1. **RESOLVED (P7 2026-07-12, completed by P7-FULL)**: capital
  identity — is_cap + cap_tile_player mirror TS isCapital/capitalTiles[0]
  (refound capitals crown + get the Palace + update the domination
  anchor; captured capitals' reused columns no longer pin/carry phantom
  Palace terms). P7-FULL gave the rc side the same explicit identity —
  rc_is_cap + cap_tile_rival — because _reclaim_rc compaction retired
  the old "slot 0 ≡ rc capital" invariant (all six slot-0 readers
  converted: loyalty pin, defection walk, settler-queue gate, controlled
  settler mask/purchase columns, GP production-to-capital, domination).
- C-2. **RESOLVED (P7-FULL, 2026-07-12)**: loyalty defectors resolve in
  acquisition order (P7); the city WALK and empire_score now iterate
  city_seq rank as well, via per-batch column gathers (X[bidx, col]) —
  the old "a per-batch walk permutation is not vectorizable" note was
  wrong. After any hole-reuse founding the GPU now matches TS array
  order for every cross-city coupling (a completion's fresh totals
  feeding later cities, border claims consuming shared candidates,
  spawn-spot contention) AND for the empire gold/science/culture and
  empireScore float association (the P4 ±1-ulp non-dyadic class). Dead
  columns sort last and stay the masked no-ops they always were.
- C-3. **RESOLVED (P7 units, P7-FULL rc — 2026-07-12)**: _reclaim_pool —
  stable compaction of the u/v/p pools at the step END when the
  high-water nears the cap (CIV6_RECLAIM_AT forces it for gates; TS
  arrays splice, so living relative order is the spec; tile→slot maps
  remap by value through the inverse permutation). rc city slots now
  compact the same way: _reclaim_rc at the step END, trigger last-alive+1
  ≥ CIV6_RC_RECLAIM_AT (default RC−8); no slot-keyed tile map exists to
  remap (rvcity_at/rival_at are civ-keyed), but the capital had to become
  an IDENTITY first (see C-1). THE FORCED GATE EARNED ITS KEEP AGAIN:
  the defection walk skipped slot 0 (range(1, RC), the stale slot-0-is-
  capital assumption) — a compacted-into-slot-0 city hung at loyalty 0
  while TS resolved its flip (rng 2026006121 t148, the ONLY failure in
  72 games). Fixed; CIV6_RC_RECLAIM_AT=1 (compaction every step holes
  exist) then byte-parity green across 72×250t. The three append sites
  assert only at true 24-living-cities capacity (the U_MAX class).
- C-4. P6 (task #23): RESOLVED 2026-07-12 — the parked district-order/
  interleaving bug class is empirically dead: the C1-B2 per-city-queue
  restructure + P4/P5 interleaving (per-j live yields, _eff_version
  invalidation, the S5 post-walk bump) closed it. Evidence: the
  off-script gate exact across all 72 games incl. a beyond-horizon 300t
  stress run over the historical regime (t239-294; only t239-250 is
  reachable in the shipping game). The two remaining deliberate
  snapshots (pre-turn alive mask, phase-top unlock/amenity maps) mirror
  TS's own. OWNER RULE (2026-07-12): the horizon contract is 250 =
  TURN_LIMIT — 300t runs are optional stress evidence, never gates
  (there is no game-over freeze, so they simulate real but unreachable
  states).
- C-5. **RESOLVED (P7-FULL, 2026-07-12)**: the player-column
  first-free-hole fallback (founded_n ≥ C at the founding/capture sites)
  is order-safe now — every order-coupled consumer rides city_seq (the
  C-2 seq walk included) and the trace cityIds follow the same slot
  rule, so it is traceable after all. The rc-side exhaustion fallback is
  gone entirely: _reclaim_rc compacts before the space can run out.
- C-6. **RESOLVED (2026-07-12, task #35)**: district picks admit
  BONUS-resource tiles everywhere (exporter autopilot scan, replay scan,
  GPU player mask + _place_district at res_priority <= 1; the rival
  paths already admitted them via d_usable/canPlaceDistrictIn), and
  EVERY pave strips the bonus resource — the real Civ 6 rule
  (queueDistrict already did; tryQueueRivalDistrict + both GPU
  _place_district twins gained it; luxury/strategic stay refused). The
  new res_stripped plane carries the live effects: border-pick resource
  priority in both engines' keys (an orphaned pave is unowned and
  claimable) and siteQuality's resource column. TI statelog lines carry
  rp (LIVE priority) permanently.
- C-7. **RESOLVED (2026-07-12, task #35)**: the goody-hut term closed by
  CONTRACT, not code — every GPU-bound world is generated
  withVillages:false (deliberate: hut claiming is a fog-era mechanic
  with its own reward rolls) and export-gpu.ts now THROWS if a hut ever
  appears in an exported world, so the static camp/settle planes' hut
  assumption is enforced instead of trusted. The site_q3 static-vs-live
  class is fixed for real: settle CANDIDATES read tile.district live
  (orphaned paves refused, siteQuality's -1) and ring-member
  contributions mask the feature column by feat_stripped and the
  resource column by res_stripped — chops, paves and founding strips
  all reprice sites live; only the terrain column is truly static.
  (camp_ok's paved-district live term landed in S6.)

## D. Engine optimizations — CHAPTER CLOSED 2026-07-12 (task #36, D-1..D-8 in one stage)

**Measured (full battery, all 17 lanes green first try — bit-exact):
wall 233s → 184s (−21%), gpu-gate 225.5 → 176.0s, mcts-search 213.6 →
172.2s, mcts-plan 90.9 → 71.6s, gumbel 53.7 → 41.9s, parity 63.3 →
57.4s, serial-equivalent 803 → 655s.** Training/eval throughput gains
(D-1/D-2 dominate there) are additionally expected but unmeasured — no
eval runs until the ONE pre-P8 baseline (owner rule).

What landed (engine-only, zero TS changes):
- D-1. step() computes leader() only when game_over.any() (torch.where
  evaluated it eagerly every turn and discarded it).
- D-2. _rcy_globals()/_rcy_food_plane(r): the strip-adjusted f/p/ty_oth
  planes + the static-column score sum, cached on _eff_version with
  per-r food planes; _rival_city_yields and _rival_border_growth share
  them (identical ops and order — bit-identical by construction).
- D-3. _adj_district/center/harbor_count cached on _eff_version.
- D-4. Live-slot lists replace the per-dead-slot host syncs in the barb
  raider loop and the rival war+peace loops (snapshot is a superset:
  deaths only shrink it, nothing spawns mid-loop; ascending order kept).
- D-5. _farmadj_qual + _farmadj_food cached (the 2×-per-_city_totals
  recompute now hits).
- D-6. _rival_border_growth hoists window/planes/key above the 64-claim
  loop (claims only mutate ownership) + lazy early-out when nothing is
  border-ready.
- D-7. Hoisted _bidx/_arangeT_f/_inf_f/_neg_f buffers (seq walk,
  empire_score, both place fns, both border keys).
- D-8. _buildable cached on _eff_version.
- THE ENABLING INVARIANT: _eff_version now bumps on EVERY player/rival
  tech+civic completion (subsumes the old mine-boost/farm-adj
  conditionals) and on purchased buildings — every cache above keys on
  it; over-invalidation just recomputes identical values.

## E. Docs staleness (sweep 2026-07-11)

**SWEPT 2026-07-12 (task #49): E-1..E-15 ALL RESOLVED** — every item
below verified against live code first (the 07-11 line numbers had
drifted), then minimally fixed; E-16 handled separately (owner),
E-17/E-18 confirmed correct as-is, nothing to do. Notables: E-7's dead
constants (RIVAL_GPP_RATE/RIVAL_MAX_POP) confirmed consumed nowhere —
deleted with their exporter lines (rules.json drops maxPop/gppRate);
E-13d's "unreachable in 100 turns" rationales were RE-VERIFIED
empirically at 250 (a 3-seed 250t probe: APPRENTICESHIP and ENGINEERING
now reachable — deferrals re-grounded on AUDIT A-9, not the horizon;
Urbanization still unreached, Neighborhood note stands); E-15's parked
RL scripts (evaluate/train/rl-bridge) now default the horizon from
TURN_LIMIT (single-knob rule; explicit --horizon still wins; runtime-
verified). Three same-class residuals caught and fixed beyond the
list: the GPU twin of E-4 (engine.py "maxPop stand-in until B2+") and
two more "abstract economy" claims (types.ts RivalCiv doc,
data/rivals.ts header). Original items kept below for reference.

**Code comments contradicted by shipped work:**
- E-1. districts.ts:4 "cost is flat… stage 1 doesn't track" — costs scale
  with research now (districtCost, game.ts:59).
- E-2. districts.ts:187 ENCAMPMENT "no combat in stage 1" — combat is live.
- E-3. rivals.ts:2-4 header "abstract economy underneath" — rivals run
  real queues/research/maintenance/housing/border-culture now.
- E-4. rivals.ts:1013-1014 "RIVAL_MAX_POP stays as the housing stand-in"
  — contradicted 2 lines later (retired).
- E-5. rivals.ts:1073-1074 + engine.py:496,3913,4898 "techLevel still
  drives every consumer until B3b" — techLevel is deleted.
- E-6. engine.py:704 "prodStock edge — see BUILD_PLAN" — pooled stocks
  replaced by per-city queues long ago.
- E-7. data/rivals.ts: RIVAL_GPP_RATE (consumed nowhere, stale role
  comment, still exported) and RIVAL_MAX_POP (dead, still exported) —
  delete both + their exporter lines.

**READMEs/plans:**
- E-8. README.md:157 settlers "80 + 30/each" — now 48 + 18/each.
- E-9. README.md:352 rivals "abstract economy (no real queues/research)"
  — false now.
- E-10. README.md:357,413 + BUILD_PLAN:204,240,248 + SEARCH.md:172,177
  link gpu/C1_DECISION.md / RESEARCH_RL.md — consolidated into ARCHIVE.md;
  broken references.
- E-11. README.md:276-284,330,391-397 + gpu/README.md:226-241 — horizon-
  100 era benchmark tables and orphaned-net numbers presented as current.
- E-12. gpu/README.md:250,258,18-20,386 — "conquest waits for C1-B7",
  "war/peace gated OFF" — capture + war shipped both ways.
- E-13. BUILD_PLAN.md:579 V-W2 checkbox unchecked but shipped; :1088
  borderPeriod reference (died in S4); :1130 old districtCost formula;
  :60,129,156 "unreachable in 100 turns" rationale (horizon is 250);
  B-arc future-tense blocks; status log stops at P2.
- E-14. GV_DESIGN.md:1,51,54 — "300-turn horizon"/"default keep 100" —
  settled at 250.
- E-15. python/README.md:33 + scripts/evaluate.ts,train.ts,rl-bridge.ts
  hard-code horizon 100 (parked track, but off the single-knob rule).
- E-16. AGENT_PROMPT.md "Current state (2026-07-08)" + ranked frontiers
  predate the P-ladder entirely (owner asked for a refresh — in flight).
- E-17. TRAINING.md — correctly labeled HISTORICAL where old; only gap:
  no baselines past P5-S1 (deliberate: one pass before P8 per owner).
- E-18. ARCHIVE.md — verbatim historical by design; harmless.

## F. Hunt tooling (current, for reference)

**IMPLEMENTED (owner design, 2026-07-12): RAW CHECKPOINTS — one
mechanism for diagnosis AND verification.** Shipped: rollout `--ckpt`
(default 25; parent clears the transient dir per run) dumps
snapshot()+rngs+paths per shard; the replay dumps wrapped
serialize(state) per game via CIV6_CKPT; `gpu/ckptdiff.py --rng` is the
JIT bracket finder (validated: 10/10 checkpoint pairs match on a green
game via the raw-dump readers); `--resume-t`/CIV6_RESUME_T resume both
engines from any checkpoint (validated bit-faithful: resumed labels
226-250 matched the original exactly); scripts/ckpt-lines.ts is the TS
JIT reader. CB lines enriched with k (call-site tag), t (target tile),
c (pre-draw rng counter). Forced-compaction knobs: CIV6_RECLAIM_AT
(u/v/p unit pools) + CIV6_RC_RECLAIM_AT (rc city slots) — run the
off-script gate under them to stress the slot-layout invariants (each
caught a real stale-slot assumption on its first run). The original
rationale:
- Every normal gate run dumps RAW state checkpoints every K turns
  (K≈25) for ALL games into a transient gitignored dir, overwritten per
  run: TS = serialize(state) per game (~1-3ms each — every-turn would
  cost +40-60s/run, K=25 makes it ~2s); GPU = the _MUTABLE tensor set
  (the MCTS snapshot machinery; ~15-20MB/turn full-batch → ~200MB/run
  at K=25). Disk throughput is a non-issue; the costs are stringify CPU
  and tensor volume, both ÷K.
- RAW state has NO frozen-vs-fresh ambiguity (that only afflicts logged
  DERIVED values — the luxury-map choice lives in the computation, not
  the data). A JIT diff tool loads both engines' checkpoints at turn t
  and runs the EXISTING tsStateLines/gpu_state_lines on the loaded
  states — any current or future field, computed on demand with
  whichever semantics the investigation needs; new diagnostics = new
  readers over old dumps, not engine changes + reruns.
- Determinism + the saved action log make every turn reachable: binary-
  search checkpoints for the first divergent one (~8 loads), replay
  forward ≤K turns single-game computing full lines JIT. Diagnosis ≈
  under a minute, zero full re-simulation.
- The same checkpoints ARE the resume points for fix-verification:
  resume the full batch from the last-common checkpoint (full-batch
  only — BLAS association is batch-shape-dependent; resume checks clear
  the hunted divergence but can false-green fixes with pre-checkpoint
  effects — the pre-commit bar stays the FULL BATTERY, whose gpu-gate
  lane IS the gate; never chain a standalone gate then the battery on
  the same code).
- What checkpoint INSPECTION cannot give: intra-turn EVENTS (the draw
  stream between two snapshots is not invertible — many event orders
  produce the same end state; the always-on CB combat-roll log stays)
  and MID-TURN TRANSIENTS (intermediate values of a turn's computation
  — the loyalty pop-mix, the frozen luxury map, spawn-time occupancy —
  are never state at a turn boundary). BUT determinism recovers both
  via INSTRUMENTED REPLAY: resume from the nearest checkpoint with an
  event flag or a pure-read probe and the identical turn re-executes,
  narrating its interior — probe iterations drop from a ~4-6 min full
  rerun to seconds, and probes are bit-faithful (pure reads replay the
  exact original trajectory — no false-green caveat, unlike fixes).
  Net: fewer permanent niche log fields; recover rare views on demand.

Phase-1 statelog: `rollout.py --shards 4 --log <rng>` +
`CIV6_LOG=<rng> npm run gpu:replay` + `python gpu/logdiff.py` → first
divergent line. Fields grown this cycle: PC loy; RC cb/til/hp; RU hp+a
(acted); RT fai + tsum (territory-shape checksum); CB lines = every
damage roll (diff, rand·1e6, dmg) from the damageRoll/_damage_roll
chokepoints — catches reordered/extra rolls the rng column can't see.
Probe at the exact batch shape of the failing run (BLAS association is
batch-shape-dependent). PYTHONUTF8=1 on piped Windows runs. Never edit
engine/TS sources while a gate/battery pipeline is in flight.
