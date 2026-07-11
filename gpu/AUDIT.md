# Engine audit v2 — 2026-07-11

Second full audit (4 parallel read-only sweeps: asymmetry, fidelity, docs,
perf), replacing the 2026-07-10 audit. Solved items are dropped — the
landing log lives in git history (P1 10d2382, P2 03fd1fe, P3 8d115b6,
P4 93efb76 = old §D fully closed, P5-S1 3b30b8f, S7 e5569a5, S2 ab0c19c,
S3 9a1b073, S4 b44aff5) and in the session memory. Line numbers cite the
code at audit time.

**Ladder state:** P1–P4 done. P5 (task #31) nearly done — S5 landing
(GP overflow/effects, faith pantheons, prophet religion + 3 hunted latents:
stale rc queue at capture, luxury-tie city_seq, post-walk fresh stats);
S6 (rival loyalty + amenities) and S8 (controlled purchase revalidation)
in flight as one combined stage. Then P6 (#23), P7 (#24), P8 (#26).

---

## A. Player–rival asymmetry (the symmetry contract's open gaps)

Rivals must be full-fidelity symmetric agents — same formulas, same
available actions; only the decision policy may differ. Confirmed open:

**In flight (S6/S8):**
- A-1. Rivals lack loyalty (one-directional: player cities defect to
  rivals, never the reverse) and the amenity tier model (no luxury
  ranking, no tier yield/growth factors) — rivals.ts:322-376 player-only;
  rivalCityYields applies no factors. → S6.
- A-2. GPU controlled-rival purchase apply skips the building district
  prerequisite (engine.py ~3681) and deducts treasury even when a unit
  spawn finds no tile (TS refunds; the settler branch next to it refunds
  correctly — inconsistent). → S8.

**Open, ranked by impact:**
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

## C. Order/slot integrity latents (the P6/P7 family)

None gate-caught yet, but every reshuffle hunts one of these:
- C-1. **Column-0 capital pin**: GPU pins loyalty/blocks flips by column 0
  and _domination reads site[:,0]; TS pins isCapital and reads static
  capitalTiles. Wrong once a captured capital's column 0 is re-occupied
  by a hole-reuse founding; TS also re-crowns a refound capital after
  total collapse (capitalTiles[0] updates), GPU doesn't.
- C-2. **Column-order couplings**: border-claim/worked-tile interactions
  between ADJACENT cities and the multi-defector flip order follow column
  order, not city_seq (TS array order). Same class as the three shipped
  city_seq fixes (loyalty pop-mix, luxury tie, trace cityIds).
- C-3. **Dead-slot reclamation** (task #24): unit pools (U_MAX 256,
  append-only high-water) and city columns (6 + holes) — the true fix for
  C-1/C-2; unit-order-IS-spec makes it parity-core work.
- C-4. P6 (task #23): rival per-city yield/pick interleaving — the rival
  side still applies one top-of-phase snapshot where TS recomputes fresh
  per city (the player half was fixed in P4).
- C-5. rc slots: the degenerate first-free-hole fallback at founded_n ≥
  RC is untraceable in TS terms (documented at the capture sites).
- C-6. res_stripped plane (bonus-resource tile picks) — enabling work
  parked since P2.

## D. Engine optimizations (bit-exact-safe, ranked)

- D-1. **leader() computed and discarded every non-terminal turn**
  (engine.py ~5950: torch.where evaluates both branches → ~48 rival-score
  ops + a _city_totals thrown away per step). Gate on
  `bool(self.game_over.any())`. Zero parity risk; the single biggest win
  (~15-30% of score-heavy steps).
- D-2. **_rival_city_yields plane rebuilds**: the [B,T,6] ty_oth +
  f/p planes are global-or-per-r but rebuilt per (r,j) call (~144×/turn
  incl. trace + leader). Cache globals on _eff_version, hoist per-r
  planes once per phase; _rival_border_growth shares them. 20-40% of
  scoring/rival-phase time. Association-preserving; gate-check.
- D-3. **Adjacency counts uncached**: _adj_center_count/_adj_harbor_count
  recomputed per district type per _city_totals; version-key like
  _eff_yields (all mutation sites verified to bump _eff_version). ~5-10%.
- D-4. **Per-slot .any() storms**: precompute live-slot lists
  (v_alive.any(0).nonzero()) per loop instead of per-slot host syncs
  (256-slot loops × hundreds of syncs/step). Zero parity risk (draws only
  fire where masks are true). ~5-15% late-game.
- D-5. _farmadj_qual cached on _eff_version (~50-100 identical
  rebuilds/turn); _farmadj_food computed twice per _city_totals.
- D-6. _rival_border_growth: hoist the plane build above the while-loop
  (claims never invalidate them).
- D-7. Buffer reuse: _bidx/_arangeT instead of per-loop torch.arange,
  hoist scalar torch.tensor(inf/min-food) constants. 1-3%, zero risk.
- D-8. _buildable one_hot [B,T,C]/[B,T,nD] allocations — cache or
  scatter-count. Small-moderate.

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

**BACKLOG (owner idea, 2026-07-11): snapshot-resume gate.** `rollout.py
--snapshot-at <T>` dumps the WHOLE 72-game batch state (GPU _MUTABLE +
per-game TS serialize()) at the last non-divergent turn; `--resume-from`
re-simulates T..250 in ~seconds per iteration instead of ~190s. Rules:
full-batch snapshots only (BLAS association is batch-shape-dependent);
the resume check clears THE HUNTED divergence but can false-green fixes
with pre-T silent effects — one full gate + battery before commit stays
mandatory. Highest value on late-turn failures (t200+ ≈ 20× faster
iterations).

Phase-1 statelog: `rollout.py --shards 4 --log <rng>` +
`CIV6_LOG=<rng> npm run gpu:replay` + `python gpu/logdiff.py` → first
divergent line. Fields grown this cycle: PC loy; RC cb/til/hp; RU hp+a
(acted); RT fai + tsum (territory-shape checksum); CB lines = every
damage roll (diff, rand·1e6, dmg) from the damageRoll/_damage_roll
chokepoints — catches reordered/extra rolls the rng column can't see.
Probe at the exact batch shape of the failing run (BLAS association is
batch-shape-dependent). PYTHONUTF8=1 on piped Windows runs. Never edit
engine/TS sources while a gate/battery pipeline is in flight.
