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
- A-3. **Rivals get no eureka/inspiration discounts** — player pays 60%
  on boosted research (game.ts:42-46), rivals raw cost (rivals.ts:1082,
  1111; rival.research.boosted never populated; GPU boosted all-False).
  Up to a 40% research-speed gap. Blocks symmetric play.
- A-4. **Rivals never build wonders** (queueWonder player-only,
  game.ts:342-365) — no wonder yields/effects for rivals.
- A-5. **Rivals cannot spend gold like the player** — no building/unit/
  settler purchases outside the controlled head, no tile purchase
  (buyTile player-only, game.ts:592). Treasury only funds maintenance,
  peace and the S2 settler column.
- A-6. **Rival unit roster restricted** — WARRIOR→SPEARMAN→HORSEMAN ladder
  (rivals.ts:979-984) + builder/settler; never SCOUT/SLINGER/ARCHER →
  rivals field no ranged units at all. Blocks symmetric war.
- A-7. **Rival religion/pantheon confers no yields** — beliefs are claimed
  (denial only); their yield/housing/amenity effects never apply to rival
  cities (getModifiers is player-only; rivals use modifiersFromResearch).
  Same for government/policy machinery (none for rivals).
- A-8. **C-21 movement**: every rival mover takes exactly one step then
  movesLeft=0 (builder walk rivals.ts:816-819, patrol :603-606, hostile
  march combat.ts:526-531); the player walks real MP paths. A rival
  HORSEMAN (4 MP) moves like a 1-MP unit.
- A-9. **Rival-unreachable catalog**: districts outside SCAFFOLD_DISTRICTS
  (THEATER_SQUARE, INDUSTRIAL_ZONE, ENCAMPMENT, ENTERTAINMENT_COMPLEX,
  NEIGHBORHOOD + their buildings), worship buildings, PALACE (rival
  capitals永 lack its yields/housing/amenity — game.ts:203 vs
  rivals.ts:124). Downstream: rivals can never accrue ENGINEER/GENERAL
  (and Theater-class) great people — those districts are unreachable.
- A-10. **Rival city HP regen ignores sieges** — +15/+5 unconditionally
  (rivals.ts:1067) while the player's +20 only heals with no hostile
  adjacent (combat.ts:589-596).
- A-11. Rivals have no trade routes (trade.ts player-keyed).
- A-12. Rivals don't interact with city-states (no envoys/influence/levy;
  can't even attack CS — combat.ts:171-177 gates csTarget to the player).
- A-13. Rival builders: FARM/MINE/LUMBER only — no resource improvements
  (PASTURE/CAMP/PLANTATION/FISHING_BOATS/QUARRY), no chop/harvest, and
  no REPAIR (C-4b: the player's builderRepair exists, units.ts:411-419 —
  the rival half is the open part; repair also grows the RL action space,
  so it stays its own stage).
- A-14. Rivals never run projects (queueProject player-only).
- A-15. Barbarian camp spawn spacing only respects PLAYER cities
  (combat.ts:449-451) and requires a live player city (:544) — rivals get
  less barb protection.
- A-16. captureCityState has no city-cap raze (combat.ts:352-384) while
  captureRivalCity razes at 6 — the player can exceed 6 cities via CS
  conquest only. Minor quirk; also the GPU documents a skip-at-full-pool
  divergence for exactly this path.
- A-17. Rival border-growth adjacency is CIV-level (no per-rc tile
  registry) vs the player's per-city adjacency — documented S4 delta,
  P7 material (needs per-rc tile ownership).
- A-18. RL surface: the unit-attack mask does not offer CS-center attacks
  (the V-CS verb exists engine-side) — do deliberately with a re-baseline.

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
  scout-then-raid mechanic; no ranged/naval barbs.
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
