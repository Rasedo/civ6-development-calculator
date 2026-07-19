# Engine audit v3 — 2026-07-12

Third audit generation, replacing v2 (2026-07-11). Closed chapters are
dropped wholesale — C (order/slot latents), D (the #36 optimization
batch), and the E-sweep (#49) landing logs live in git history (v2 last
at 806a4a0). Chapters below are refreshed by serial clean-context
sweeps against live code; unresolved v2 notes are inherited under their
original ids, new findings continue each chapter's numbering.

**RULE (owner, 2026-07-12): every note anchors the code/doc block to
fix BY SYMBOL — function/method/class/exported-constant names — never
by line number. Line numbers rot; symbols are greppable.**

**Ladder state:** P1–P7 done; P8 (#26) PARKED by owner directive until
this file is clean — the chapters below ARE the roadmap (tasks #41-#48,
then #50/A-18 with the ONE pre-P8 re-baseline).

## Completion estimate (owner-requested 2026-07-17; guesstimates)

Each item hand-weighted 1–8 by implementation size read off its
description (1 = constant/table tweak, 2 = focused mechanic, 3 =
mechanic + both-engine plumbing, 4 = big system, 8 = engine-wide);
partial items carry fractional credit. Update this block at every
stage that moves an item.

| Chapter | Weight | Done | % |
|---|---|---|---|
| A symmetry | 39 | 21.1 | **54%** |
| B fidelity | 88 | 65.9 | **75%** |
| C order/slot latents (closed) | 30 | 30 | 100% |
| D perf (closed) | 15 | 15 | 100% |
| E docs (closed) | 6 | 6 | 100% |
| G parity latents | 5 | 4 | **80%** |
| **Overall (incl. closed)** | **183** | **144.0** | **79%** |
| Open chapters only (A+B) | 127 | 87.0 | **69%** |

(2026-07-17: A-7r LIVE (#46r), A-5 resolved-minus-tile-purchase, B-18
spread, chapter G EMPTY. 2026-07-18 ROUND B3 U/V/W/X:
B-18 60%→75% — pressure→yields coupling LIVE; B-13 → 100% — full
unlockPolicy wiring; A-7r → 100% — the residual card wiring was
B-13's; B-25 50%→70% — GPU space-race sim poke-covered; B-29 done.
2026-07-18 #41 stage 1: A-17 RESOLVED — per-rc tile registry both
engines, per-city border adjacency + exact capture/transfer tile
sets; residual worked-tile civ-level scan split out as new A-23 w2.
Stage 2: A-11 → 90% — rival domestic trade routes live both engines
+ symmetric route interdiction; rival→CS routes wait on A-12.
Stage 3a: A-12 → 50% — per-civ envoys/influence/greedy assignment,
rival envoy bonuses, strict suzerain contest; CS verbs = stage 3b.
2026-07-18 ROUND B4 Y/AA/Z/AB (brief gpu/ROUND_B4.md): B-7, B-30,
B-31, B-32 all RESOLVED; new A-24 w2 = rival district/tile registry
consistency latent, split from slice AB's hunt. 2026-07-18 #45
NAVAL: B-6 RESOLVED — serial N1/N2/N3 off gpu/NAVAL_DESIGN.md, ONE
end-of-task battery incl. the new `naval` poke lane. 2026-07-19
ROUND B5 M1/M2/M3 (brief gpu/ROUND_B5.md): B-4, B-9, B-10 RESOLVED;
M1's hunt FIXED the GPU advance-after-kill terrain omission (land
units advancing onto water after killing an embarked defender — both
red rollout games, one class); new G-5 = the surviving 1-gold
rival-economy rounding latent M2 dodged by seed reroll. 2026-07-19
ROUND B9 R1-R3 serial (brief gpu/ROUND_B9.md): A-9 → 90% — scaffold
5→9, regional channel, worship faith-buy, rival PALACE; R1 fixed
EIGHT newly-reachable latents (f7b13d3), R2's gates caught the G4
buildings-are-own-column cache break + the player ww-vs-unit-orders
ordering latent (faf08cc), R3 hunt-free (73b9e32); G-5 second
sighting on a war capture → reroll 9301→9302. 2026-07-19 ROUND B6
S1-S4 serial (brief gpu/ROUND_B6.md): B-18 75%→95% — all 7 enhancer
EFFECTS live (S1 5e6ab7b, hunt-free) + the rival MISSIONARY chassis
(S2 512abe4: faith-buy 60/42 after worship, cap 2, real-MP walk +
spread lump 10/15, SCRIPTURE/HOLY_ORDER; in-gate 24/24 seeds, 264
buys/220 spreads; the rollout replay caught the missing faithOnly
production-mask term — the round's one gate catch); B-25 70%→80% —
religious victory (S3 79a056f: predominance >half in EVERY alive
civ, victoryType 5/6 at endTurn, poke-pinned — gate-unreachable at
250t).)

Per-item weights (done% in parens where partial):
- A: A-5r 2 (95% — tile purchase → #50), A-7r 4 (done — ROUND B3
  closed the card wiring), A-9 4 (90% — ROUND B9; NEIGHBORHOOD +
  palace-relocation residuals), A-11 4 (done — A-12b closed the CS
  residual; the GPU player-route note rides A-18/#50),
  A-12 4 (90% — 3b-2 landed attack/capture; levy + quests are recorded
  deferrals), A-17 4 (done — #41 stage 1), A-18 3, A-19 4, A-20 2 (done),
  A-21 2, A-22 2, A-23 2 (new — split from A-17: civ-level
  worked-tile scan), A-24 2 (new — split from B-30: rival
  district/tile registry consistency).
- B combat: B-1 3 / B-2 2 / B-3 2 / B-4 3 / B-5 2 / B-6 8 / B-7 2 /
  B-9 3 / B-10 3 / B-28 1 / B-29 2 / B-30 2 / B-31 1 / B-32 2 (done);
  B-15 2 (85% — magnitude waits on peace-suing); B-26 3 (50%);
  B-8 2 (open).
- B progression: B-11 4 / B-12 3 / B-13 3 / B-14 1 (done);
  B-27 4 (75%).
- B economy/religion: B-16 2 / B-19 2 (done); B-17 2 (40%); B-18 4
  (95% — ROUND B6: enhancer effects + missionary chassis + religious
  victory; apostles/theological combat + player missionaries (#50)
  remain); B-20 3 (30%); B-21 2 (40%); B-23 3 (open).
- B meta: B-25 3 (80% — religious victory landed; player project
  path + Culture/Diplomatic victories open); B-22 3, B-24 3,
  B-33 3 (open).
- E: closed — E-16 RESOLVED by owner decision 2026-07-18 (AGENT_PROMPT.md
  archived to docs/archive/ instead of refreshed); the E-sweep was 5 done.
- G: G-1, G-2, G-3, G-4 — all done (chapter EMPTY).

---

## A. Player–rival asymmetry (the symmetry contract's open gaps)

Rivals must be full-fidelity symmetric agents — same formulas, same
available actions; only the decision policy may differ. Verified
against live code 2026-07-12 (post-#36–#40): all seven inherited items
remain open; four new gaps found in the sweep.

**[opus-ok: …] tags (2026-07-13)** mark the sub-slices delegable to
Opus subagents off an exhaustive brief (per the parallel-subagent
model rule: Fable for engine-core bit-exactness — rival-city core,
yield/score/RNG paths, combat; Opus for periphery — tables, exporter
plumbing, mask columns, hunt localization). Untagged items and the
untagged halves of tagged items stay Fable/main-session work.

- A-5 (remainder). Scripted rivals spend gold on ONE building per civ
  per turn (the A-5 block in `rivalPhase` (rivals.ts); `_rival_phase`
  (engine.py)) but never gold-buy units or settlers, and no rival ever
  buys a tile. The player has `purchaseUnit`/`purchaseSettler`/
  `buyTile`+`tilePurchaseCost` (game.ts), and the CONTROLLED heads
  already carry the missing machinery — `production_mask`+
  `_apply_settlers_and_purchases` (engine.py) for seat 0,
  `rival_masks`+`apply_rival_actions` (engine.py, the VP-G2 buy
  building/settler/unit codes) for controlled rivals — so the gap is
  the scripted policy's verbs (units/settlers) plus tile purchase,
  which has no rival or GPU twin on ANY seat (`buyTile` is
  TS-player-only). **RESOLVED except tile purchase (2026-07-17,
  A-5r)**: scripted rivals gold-buy settlers and units — priority
  BUILDING > SETTLER > UNIT, one purchase/civ/turn, controlled-head
  VP-G2 semantics, milli-rounded affordability, refunds on failed
  spawn/found. Unit branch parity-validated (82 in-gate fires);
  settler branch never fires organically — poke-covered
  (`gpu/rival_purchase_test.py`), a recorded coverage gap, not a bug.
  Tile purchase stays open (no GPU verb on any seat — fold into the
  A-18/#50 verb work).
- A-7 (remainder). RESOLVED (2026-07-17 #46r LIVE; 2026-07-18 ROUND B3
  slice V closed): both scripted seats adopt governments/slot policies
  turn-exact; remaining GPU channels proven unreachable under greedy
  adoption (exporter ships all), tilePurchaseMult gate-inert pending
  the A-5 tile-purchase verb.
- A-9 (90% — 2026-07-19, ROUND B9 R1-R3, gpu/ROUND_B9.md). RESOLVED
  minus the NEIGHBORHOOD stretch. `SCAFFOLD_DISTRICTS` is 9-wide
  (+INDUSTRIAL_ZONE, +THEATER_SQUARE/+ENTERTAINMENT_COMPLEX on CIVIC
  unlocks via `unlockKind`, +ENCAMPMENT with GPU placement code 3 =
  notAdjacentToCityCenter); the exporter table carries every district's
  buildings incl. the four REGIONAL rows (regionalEffects semantics on
  every seat of both engines: `rivalRegionalEffects` /
  `_rival_regional` + the player-walk reg_y/reg_am terms;
  `SCRIPTED_HELD_BUILDINGS` is EMPTY) and the five WORSHIP rows
  (faith-purchase-only: `b_worship` masks all five pickers; rivals buy
  at the A-5 position — `WORSHIP_BUILDINGS[(r+1)%5]`, flat
  worshipFaithCost, Temple + complete Holy Site). `foundRivalCity`
  grants the first-city PALACE (`rc_is_cap`-keyed GPU terms; B-30
  strips on capture, nothing relocates). ENGINEER/GENERAL/ARTIST GPP
  accrue via the generic `GP_CLASS_DISTRICT` machinery now that their
  districts exist. In-gate at t250: 21/24 seeds with rival worship
  buildings, 48 rival palaces, 66 rival regional buildings. Coverage:
  vitest tests/district-breadth.test.ts + poke lane `districts`
  (gpu/district_breadth_test.py). RESIDUALS: (1) NEIGHBORHOOD
  (URBANIZATION civic, appeal-tier housing, GPU appeal plane) — the
  R4 stretch, dropped by the brief's pre-authorized option; (2) no
  palace RELOCATION on capital loss (real Civ 6 moves it; both
  engines consistently grant-once-strip-forever); (3) player regional
  coverage is thin in-gate (1 player regional building at t250) — the
  scripted player rarely reaches Factories.
- A-11 (90% — 2026-07-18, task #41 stage 2). Rivals RUN domestic trade
  routes now: `RivalCiv.tradeRoutes` (rc-id pairs) / GPU `r_routes`
  [B,R,K,2] (id-keyed like `rc_tile_id` — compaction-immune), capacity
  via `rivalTradeCapacity` (trade.ts: FOREIGN_TRADE civic,
  Market-OR-Lighthouse per city, Colossus/Great Zimbabwe; no
  CS-suzerain term until A-12), ONE new route per civ per turn picked
  by the deterministic best-dest scan (`rivalPhase` creation block /
  `_rival_trade_phase`), origin income = `routeYields(dest)` added
  pre-tier in `rivalCityYields` / BOTH `_rival_city_yields` paths
  (per-j and the D-9 `_all` trace path), routes die with either
  endpoint (capture/transfer pruning both engines). Interdiction is
  SYMMETRIC now: `rivalRouteRaidedAt` suspends rival routes for
  barbarians always + player units at war, and `routeRaidedAt` gained
  the at-war-rival check (the old one-sidedness). Gate-reachable and
  gate-proven (scripted trajectories reshuffled). RESOLVED 2026-07-18
  (A-12b stage 1, 34ddb51): rival→CS routes landed — capacity's
  suzerain term, the widened creation scan (met CS after domestic
  dests, TOTAL-yields comparator), csRouteYields income via the
  [B,RC,6] `_rival_route_income`, capture pruning; probe: 5/8 seeds
  end with a live rival CS route. The GPU still has no PLAYER route
  machinery (unreachable in gated trajectories — no trade RL verb;
  batch with A-18/#50 if the P8 surface ever gains one).
- A-12 (75% — 2026-07-18, task #41 stage 3a + A-12b stage 1). The DIPLOMATIC layer is
  live both engines: per-civ envoys (`CityState.rivalEnvoys`/
  `rivalMet` / GPU `cs_r_envoys`/`cs_r_met`), rival influence→envoy
  accrual with the adopted-government tier (`rivalPhase` CS block /
  `_rival_cs_phase` — meet by PROXIMITY, `CS_MEET_RANGE` 3, rivals
  have no fog), the player's scripted greedy assignment mirrored
  (neediest-own-envoys, envoys*64+id key), rival capital/district
  envoy bonuses at 1/3/6 in `rivalCityYields` / both
  `_rival_city_yields` paths, and the suzerain CONTEST — `isSuzerain`
  is strictly-most-envoys now (ties → nobody), `rivalIsSuzerain` the
  rival test. Gate-reachable (probe: 6/8 seeds meet, envoys to 9).
  Stage 3b-1 (2026-07-18, 34ddb51): rival→CS trade routes + the
  suzerain trade-capacity term are LIVE both engines (see A-11).
  Stage 3b-2 (2026-07-18, 68ef7d5): JOIN-THE-SUZERAIN'S-WAR is live —
  an AT-WAR rival MELEE unit attacks an adjacent CS whose suzerain is
  the player (attackTargets csWar / the war-act's strict-isSuzerain
  plane), the csty/cstyc pair at the player block's exact position,
  conquest lands the CS as an rc (`captureCityStateForRival` /
  `_capture_city_state_rival` — transfer-style last-alive+1 append,
  ring re-tag to the A-17 registry, maxCities raze, route pruning).
  PROVEN IN-GATE: seed 9131's reference run contains a real rival CS
  conquest (it exposed the exporter's live-roster t0 dump — now
  snapshotted pre-run). REMAINING 10% (recorded deferrals): rival
  levy (verb exists player-only), rival CS quests (needs per-civ
  quest RNG — draw-count risk, deliberately deferred).
- A-17. RESOLVED (2026-07-18, task #41): rival territory gained a
  per-city tile registry (TS `Tile.rivalCityId` / GPU `rc_tile_id`,
  persistent-rc-id keyed), fixing per-city border adjacency and exact
  capture/transfer tile sets; residual civ-level worked-tile scan
  split out as A-23.
- A-18. RL action surface (deliberately batched with the P8
  re-baseline, one item — task #50): `unit_action_mask` (engine.py)
  offers move/melee/hold/FARM/MINE/LUMBER_MILL/chop only — no
  CS-center attack column though the engine verb exists
  (`meleeAttack`'s `csTarget` path), no PLAYER builder repair verb
  (`builderRepair` (units.ts) exists; rivals repair via
  `_rival_builder_actions` since A-13), and no resource-improvement
  verbs (rivals place everything `validImprovementsIn` offers; the
  scripted player policy farms only). [opus-ok: the mask-COLUMN
  plumbing (unit_action_mask rows for CS-attack/repair/improvements/
  pillage/specialists incl. A-21/A-22) — new verbs are inert under the
  scripted player policy, so gates can't drift; the APPLY-path wiring
  and the P8 re-baseline decisions stay Fable/main.]
- A-19 (new). Rival–rival war is structurally impossible:
  `RivalCiv.atWar` (types.ts) is a single war-with-the-player boolean,
  `unitsHostile` (units.ts) hard-returns false for rival-vs-rival, and
  `declareWar`/`sueForPeace` (rivals.ts) plus the auto-DoW in
  `rivalPhase` are all player-relative; GPU `r_atwar` is [B, R] vs
  seat 0 and `war_mask`/`apply_rival_actions` (engine.py) only toggle
  it. The player can fight every civ; a rival's only possible enemy is
  the player (rivals never besiege, pillage or conquer each other —
  see the "other rivals never besiege" guards in `rivalPhase` and
  `_rival_phase`).
- A-20. RESOLVED (2026-07-13, task #54): rival cities heal the flat +20
  when unbesieged (the 15/5 war split was a local invention), one
  source both engines (`CITY_HEAL_PER_TURN` / `cityHealPerTurn`).
- A-21 (new). The player has no pillage verb at all: pillaging exists
  only on the hostile side (`hostileUnitAct` step 2 (combat.ts) /
  `_rival_unit_war_act` (engine.py) for at-war rivals, plus
  barbarians), there is no TS player-pillage function, and
  `unit_action_mask` (engine.py) carries no pillage column. Rivals
  wreck player improvements (and bank the +25
  `PILLAGE_HEAL_IMPROVEMENTS` heal); the player can only respond by
  killing units or taking cities. Natural batch with the A-18 mask
  work.
- A-22 (new). Specialists are player-only on the TS side:
  `setSpecialists` (game.ts) + `citySpecialistSlots`/
  `effectiveSpecialists` (city.ts) feed `SPECIALIST_YIELDS` into
  `computeCityStats`, but `rivalCityYields` (rivals.ts) never reads
  `RivalCity.specialists` (always `{}`) and no rival assignment path
  exists; the GPU models specialists on NEITHER seat (documented
  scope-out in gpu/BUILD_PLAN.md). Inert under scripted play today,
  but it becomes a live asymmetry the moment the P8 surface gains the
  verb — track alongside A-18.
- A-23 (new, split from A-17). The rival WORKED-TILE scan is still
  CIV-level: `rivalCityYields` (rivals.ts) ranks
  `tileOwnedByCiv(t, civOfRival(r))` tiles in the work radius (twin
  `_rival_city_yields` planes key on `rival_at == r`), vs the player's
  per-city `workableTiles` — two adjacent rival cities can both work
  the same civ tile (double-counting the player structurally cannot
  do). A-17's `rivalCityId`/`rc_tile_id` registry now makes the
  per-city convergence implementable; it reshuffles every rival yield
  every turn, so it needs its own gated stage.
- A-24 (new, split from B-30's hunt). Rival district/tile registries
  can disagree: an rc's `.districts` array may reference a tile whose
  `rivalCityId` registers to a SIBLING rc (seed 9118: rcId 4 held a
  HOLY_SITE whose tile was registered to rcId 3). B-30 sidesteps it
  (capture derives kept districts from re-owned tiles, not the array),
  but the placement/registration pair in `tryQueueRivalDistrict` and
  the A-17 registry should be hardened to stay mutually consistent.

## B. Engine fidelity vs real Civ 6 (missing/simplified systems)

Re-verified correct vs real base Civ 6 (2026-07-12): eureka/inspiration
40% (`BOOST_FRACTION`, data/boosts.ts), 1 specialty district per 3 pop
(`maxSpecialtyDistricts`, data/constants.ts), growth curve
15+8(n−1)+(n−1)^1.5 (`growthFoodNeeded`), amenities needed
ceil((pop−2)/2) (`amenitiesNeeded`), pantheon at 25 faith
(`PANTHEON_FAITH_COST`, data/religion.ts), all 10 base governments
(`GOVERNMENTS`, data/policies.ts). Also spot-verified faithful this
sweep: damage curve 30·e^(0.04·Δ)·rand(0.8–1.2) (`damageRoll`,
combat.ts), heal rates 20/15/10/5 (`refreshUnits`, core/units.ts),
water housing 5/3/2 + Aqueduct 6/+2 (`HOUSING_FRESH_WATER`/
`AQUEDUCT_NO_FRESH_TOTAL`), amenity bands and growth/yield factors
(`amenityTier`), housing growth throttle 1/0.5/0.25
(`housingGrowthFactor`), luxuries → 4 neediest cities
(`LUXURY_AMENITY_CITIES`), gold purchase ×4 (`GOLD_PURCHASE_MULT`),
district base 54 scaled by max(tech%,civic%) ×(1+9·p) plus the GS 40%
under-represented discount (`districtCostIn`/`districtDiscounted`,
core/game.ts), settler 80+30·n with pop −1 (`settlerCost`), city HP
200 / +20 heal (`CITY_MAX_HP`, `barbarianPhase`), envoy per 100
influence (`ENVOY_COST`), loyalty core: range 9, ±20 pressure, ±3/6
amenity term (`loyaltyDelta`, `LOYALTY_RANGE`/`LOYALTY_PRESSURE_SCALE`/
`LOYALTY_AMENITY`), unit costs/maintenance for the modeled roster
(`UNITS`). [opus-ok] tags below follow the same rule as chapter A's.
Note: every production/research cost is uniformly ×0.6
(`GAME_SPEED`) — a deliberate Online-speed choice, not counted as a
gap; likewise GS disasters are modeled minus sea-level rise
(`disasterPhase`, core/disasters.ts).

**Combat/military:**
- B-1. RESOLVED (2026-07-13, task #42): `ANCIENT_WALLS` grants a 100-HP
  OUTER pool (`outerHp`/`outer_hp`/`rc_outer_hp`) absorbing damage
  first; heals/wiped-on-capture, no `cityDefenseStrength` bump
  (1-tier), CS deferred, rivals build/buy it data-driven.
- B-2. RESOLVED (2026-07-13, task #42): a walled city strikes once/turn
  (range 2, nearest hostile, one `damageRoll` at `cityDefenseStrength`,
  no retaliation/capture); both seats, identical draw order, no CS
  strike.
- B-3. **RESOLVED for player+rival movement (2026-07-13, task #43);
  BARBARIANS (2026-07-19, ROUND B10 slice B, task #66)**: `inEnemyZoc`
  (units.ts) / `_in_enemy_zoc` + `_in_enemy_zoc_barb` (engine.py) —
  entering a tile adjacent to a hostile MILITARY unit halts the mover
  (movesLeft := 0) after the enter cost, tested live per step; wired
  into the player `walkPath` and all three A-8 rival walkers (war march
  / patrol / builder). B10: the rival-only gate in `hostileUnitAct` is
  LIFTED so barbarians obey ZOC too — `unitsHostile` halts a barb at any
  adjacent non-embarked PLAYER or RIVAL military (barbs are hostile to
  every non-barb, so no at-war gate; barbs raid rivals too, C-4a), other
  barbs exert nothing. GPU `_in_enemy_zoc_barb` (player+rival military
  exert; barbs don't) is checked per step in the `_barbarian_phase`
  raider multi-step loop. Zero new draws (pure geometry). In-gate: the
  barb-ZOC path fired in 21/24 scripted seeds. City-center ZOC still
  deferred.
- B-4. RESOLVED (2026-07-19, ROUND B5 slice M2): `Unit.xp` on
  player+rival units — +5 per attack executed, +2 per attack survived
  as a military defender (walls strikes included); `XP_LEVELS`
  [15,45,90] → flat +5 CS/level at every roll (the B-7 assembly
  pattern; dropped by the embarked override), GPU `p_xp`/`v_xp` with
  full snapshot/reclaim discipline, exp table widened 1201→4001.
  In-gate: level ≥1 in 15/24 seeds, ≥3 in 5. `bestMeleeCS` stays
  base-CS. Residuals: real promotion TREES/abilities, barb XP,
  heal-on-promote.
- B-5. RESOLVED (2026-07-13, task #43): `fortifyTurns` (military, cap 2)
  accrues on the no-MP-spent gate, reset by move/attack, +3/+6 CS to
  the defender at every roll site both engines; symmetric, snapshot-
  and `_reclaim_pool`-safe.
- B-6. RESOLVED (2026-07-18, task #45, serial N1→N2→N3 off
  gpu/NAVAL_DESIGN.md): embarkation + naval units both engines.
  `unitPassable` is unit-aware (naval on water; embarked land units on
  water — SAILING civilians / SHIPBUILDING all, CARTOGRAPHY oceans;
  embark/disembark cost all MP, `EMBARK_MOVES` 2); GALLEY + QUADRIREME
  (`UnitDef.naval`), coastal-or-Harbor production gate on all three
  surfaces, scripted rival galley policy + war-march/patrol water
  steps (in-gate: galleys 7/24 seeds, embark 7/24), embarked defense
  flat `EMBARKED_DEFENSE_CS` 10 (no attack/fortify/flank/support),
  embarked civilians captured per B-31 pool-end. GPU: `wpass`/
  `p_emb`/`v_emb` planes, `_embark_live` mirrored switch. Poke suite
  `gpu/naval_test.py` (battery `naval` lane) covers the
  gate-unreachable: player naval, city/CS capture from sea,
  quadrireme, ocean gate, walls-vs-ships. N2's hunt fixed a TS
  embarked-MP-reset bug and a GPU `r_routes` capacity latent.
  RESIDUALS: player scripted/RL naval + controlled-head water moves
  (#50 — the GPU RL move verb still reads the land plane); scripted
  settler/builder embark (own gated stage); naval barbs (B-26);
  Frigate+ hulls (B-10); Great Admiral (B-8); naval trade (B-23).
- B-7. RESOLVED (2026-07-18, ROUND B4 slice Y): `FLANKING_CS`/
  `SUPPORT_CS` (+2 per adjacent ally) at unit-vs-unit rolls — flanking
  on melee (`meleeAttack`), support on melee + ranged defense
  (`rangedAttack`, `hostileRangedStrike`, both walls strikes incl. the
  `rcstk` mirror); GPU `_flank_support` (batched, stacking gives ≤1
  military/tile). No flanking vs cities/CS/rc-cities (not units —
  recorded simplification).
- B-8. Great Generals/Admirals are economy lumps:
  `GREAT_PEOPLE.GENERAL` is +production-to-capital, `.ADMIRAL` is +gold
  "prize money" (data/greatPeople.ts); `GreatPersonDef['effect']`
  cannot express a +5 CS/+1 MP aura at all.
- B-9. RESOLVED (2026-07-19, ROUND B5 slice M1): strategic-resource
  ACCESS model — `UnitDef.requiresResource` + `civHasStrategic`
  (owned territory tile + resource + completed unpillaged matching
  improvement) / GPU `_res_avail_mask` gate build AND purchase on all
  three surfaces; HORSEMAN retro-gated on HORSES (early-game
  reshuffles proven in-gate). Residuals: GS stockpiles/accumulation/
  per-unit costs; niter and later strategics absent from maps.
- B-10. RESOLVED (2026-07-19, ROUND B5 slices M1+M3): roster extended
  through the gunpowder line — SWORDSMAN/PIKEMAN/CROSSBOWMAN/KNIGHT/
  MUSKETMAN (real-ish stats, tech + B-9 resource gates, data-driven
  everywhere) — and the scripted rival production ladder + A-5r buy
  roster are BEST-OF-ROSTER (strict `>` scan in UNITS-table order,
  GPU argmax mirror). In-gate: rivals field PIKEMAN 16/24 seeds,
  CROSSBOWMAN 19/24, MUSKETMAN 20/24 (SWORDSMAN/KNIGHT
  resource-starved in fixtures, vitest-covered). Residuals: siege
  line, Frigate+ naval hulls (with B-6), gold unit-upgrades, and the
  CONTROLLED rival_masks `ok_u` still hardcodes the old 5-unit roster
  (RL-surface decision — batch with A-18/#50).
- B-15. **RESOLVED (2026-07-17, Round B2)**: war weariness — integer
  accumulator (`warWeariness`, +1/turn at war, −4/turn decay at
  peace) → flat amenity penalty via `computeCityStats`, symmetric
  player+rival, both engines (`_MUTABLE`-registered tensors; poke
  `gpu/war_weariness_test.py`). Magnitude DELIBERATELY gentle (−1 per
  8 war-turns, cap −2): the passive scripted player never sues for
  peace, so real magnitudes collapse the fixture. Raise toward real
  values with #56's survival heuristics.
- B-26. Map/barbarian fidelity: no cliffs (no such concept in
  data/terrains.ts or core/mapgen.ts). Barb raiders run the A-8 real-MP
  walk (RESOLVED 2026-07-13 task #44; `hostileUnitAct` both engines, GPU
  `_barbarian_phase` raider block = the vectorized multi-step loop
  mirroring `_rival_unit_war_act`) and obey ZOC (B-3, ROUND B10).
  **ERA LADDER RESOLVED (2026-07-19, ROUND B10 slice B, task #66)**: all
  three `barbarianPhase` spawn sites (new-camp spawn, empty-camp
  regarrison, the 0.1-roll raid) climb a shared MELEE ladder
  `barbMeleeType` — WARRIOR → SPEARMAN (t>60) → PIKEMAN (t>120) →
  MUSKETMAN (t>180); GPU `_barbarian_phase` `melee_type` mirror over the
  widened `unitCombat` barb table (u_type 0/1/2/3), thresholds
  `pikemanAfterTurn`/`musketmanAfterTurn`. Zero new draws (spawn-TYPE
  only). The exp/quantization table (4001) already covers PIKEMAN(41)/
  MUSKETMAN(55) — rival/player MUSKETMAN(55) use the same clamped
  `_damage_roll` (verified, not widened). The A-12 CS levy ladder
  (`state.turn > 60 ? SPEARMAN : WARRIOR` in rivals.ts) is untouched.
  In-gate: PIKEMAN+ barbs in 20/24 scripted seeds, MUSKETMAN in 20/24.
  **DESCOPED to residual — RANGED barbs**: the `campIdx%3==0` raid site
  was to spawn ARCHER(t≤120)/CROSSBOWMAN(t>120). TS `hostileUnitAct`
  dispatches ranged generically (`hostileRangedStrike`), but the GPU
  `_barbarian_phase` raider block is a MELEE-ADJACENCY scanner with no
  range-2 target scan and no ranged-strike dispatch for barb owners
  (unlike `_rival_unit_war_act`, which has both); wiring it needs a new
  GPU walker class (full-range scan + a barb `_hostile_ranged_strike`
  variant), so per the brief's descope clause ranged barbs are recorded
  here. STILL OPEN in B-26: no cliffs, ranged/naval barbs, scout-then-
  raid escalation, camp-spawn escalation beyond the melee ladder.
- B-28. RESOLVED (2026-07-13, task #44): `terrainDefense` gives −2 on
  MARSH/FLOODPLAINS (was +3); GPU split the dual-purpose plane into
  `tdef` (defense) + `tmove` (enter cost) so movement is unchanged.
- B-29. RESOLVED (2026-07-18, ROUND B3 slice X): wounded units fight at
  −1 CS/10 HP lost and melee across a river (`crossesRiver`) −5
  attacker CS at all `damageRoll` sites; float association eliminated
  by a shared quantization `q = round(diff·10)` (exp table 1201).
- B-30. RESOLVED (2026-07-18, ROUND B4 slice AB): the three
  capture/transfer paths (`captureRivalCity`, `transferCityToRival`,
  `transferRivalCityToRival` + GPU twins) carry buildings (minus
  PALACE), wonders, and COMPLETE districts — derived from re-owned
  tiles (`districtComplete`, the GPU's liveness rule; incomplete stays
  paved-but-dead); `ANCIENT_WALLS` kept at `outerHp = 0` (heals via
  B-1, new owner gains the B-2 strike); razes stay scorched-earth; CS
  capture paths verified no-op (CS have no infra in-model). The
  worktree hunt exposed a pre-existing rival registry latent → A-24.
- B-31. RESOLVED (2026-07-18, ROUND B4 slice AA): player/rival melee
  CAPTURES a lone civilian (`meleeAttack` civilian branch — owner/civId
  flip, hp/charges kept, no roll, no advance; draw-count neutral).
  INVARIANT the slice established: the captured unit moves to the END
  of `state.units` / GPU pool-end append — an in-place flip broke slot
  order (dormant desync, seed 9261); ANY future ownership-transfer
  site must send the unit to the pool end on both engines. Residual:
  barbarians still kill (no prisoner/camp system); rival-vs-rival
  unreachable until A-19.
- B-32. RESOLVED (2026-07-18, ROUND B4 slice Z): `Tile.districtPillaged`
  / GPU `district_pillaged` [B,T] — raiders pillage COMPLETE non-center
  enemy districts (`hostileUnitAct` step 2 + step-3 march union; player
  districts for all raiders, rival districts for barbs per C-4a). While
  pillaged the district's adjacency, buildings (yields/housing/
  amenities/GPP), intrinsic housing and CS envoy channels go dark;
  static counts stay; repair via `builderRepair` + the rival builder
  twin; every rc pillage/repair bumps `_eff_version`. In-gate on both
  seats (5/24 player, 8/24 rival seeds). Residuals: no loot lumps (v1,
  D-20 convention); the scripted player never repairs districts (the
  repair verb rides A-18/#50) — symmetric, not a divergence.

**Progression breadth:**
- B-11. RESOLVED (2026-07-17, Round B2): `TECHS` is the full GS tree
  (68 entries), `ERAS` through Future, append-only; pure-military techs
  unlock nothing until B-10.
- B-12. RESOLVED (2026-07-17, Round B2): `CIVICS` 31 → 51, append-only,
  inspirations likewise.
- B-13. RESOLVED (2026-07-18, ROUND B3 slice V; breadth Round B2):
  `POLICIES` 19 → 58, all cards wired to a real `unlockPolicy` civic
  (zero unreachable); the wiring activated the dormant MEDIEVAL_FAIRES
  inspiration (fixed both engines). ~30 cards effect-inert pending
  absent systems (catalog-faithful, not a gap).
- B-14. RESOLVED (2026-07-17, Round B2, owner-ruled): `CITIZEN_SCIENCE`
  0.7 → 0.5 (real Civ 6); reshuffled every trajectory (fixture regen,
  seed 9053 reroll pending #56).
- B-27 (largely RESOLVED 2026-07-17, Round B2). Now: world wonders 30,
  natural wonders 12, pantheons 25 / follower 9 / founder 8 (+7
  enhancers), great people 9 classes incl. Writer/Musician, projects
  incl. the space-race chain; buildings were already real-complete per
  MODELED district (unmodeled districts' buildings arrive with A-9).
  Degradation ledger: gpu/ROUND_B2_LOG.md (each row that needed an
  absent system). Improvements 9 stays (rest need naval/appeal).

**Economy/districts/religion:**
- B-16. RESOLVED (2026-07-17, Round B2, owner-ruled → GS):
  INDUSTRIAL_ZONE +0.5/mine +1/quarry +2/adjacent-Aqueduct, HARBOR +1
  per CITY_CENTER (was +2); IZ channels LIVE since ROUND B9 R1 made
  IZ scaffold-reachable (2026-07-19).
- B-17 (re-scoped). Encampment is no longer inert: it earns +1 General
  GPP/turn plus +1 per building (`greatPersonPointsPerTurn`,
  core/game.ts; `GP_CLASS_DISTRICT`), and Barracks/Stable/Armory/
  Military Academy give production/housing (`BUILDINGS`); zero
  adjacency matches real Civ 6. Remaining real gaps: no specialist
  slots (`SPECIALIST_YIELDS` (data/greatPeople.ts) has no ENCAMPMENT
  entry; `citySpecialistSlots` skips it), no district combat role (no
  HP/ranged strike/movement block), no unit-XP function.
- B-18 (re-scoped again 2026-07-17, #47r). LANDED since Round B2:
  belief catalogs (25/9/8/7), Enhancer slot, the rival ENHANCER race
  (mirrored 3rd `_next_random` draw after the founder draw — 31
  in-gate claims), and PRESSURE SPREAD both engines (+1 integer
  pressure/turn within 10 tiles of a founded religion's frozen holy
  center, `followedReligion` = argmax ties-to-lowest-id, KILL hygiene
  + `_reclaim_rc` permutation, proven by a new compared trace
  column — first in-gate flip ~t65). **Coupling LIVE (2026-07-18,
  ROUND B3 slice U)**: follower-belief yields (workEthic,
  buildingYields, buildingHousing, amenitiesIfSpecialty,
  faithPerWonder) key per-city on `followedReligion` in BOTH yield
  pipelines — the player walk gained a follower application it never
  had; landed inert-first (owner-keyed, byte-identical) then flipped;
  16/24 scripted seeds reshuffled turn-exact
  (gpu/ROUND_B3_LOG.md §U). Pantheon/founder/enhancer stay per-civ.
  **ROUND B6 (2026-07-19, #62)**: all 7 enhancer EFFECTS live
  (per-religion pressure range, `tradeReligionYields` route term, the
  three combat CS adders via `religionAttackCS`/`religionDefenseCS` /
  `_rel_atk_cs`/`_rel_def_cs` over `_rel_combat_planes`); the rival
  MISSIONARY chassis (`rivalMissionaryActions` /
  `_rival_missionary_actions` + the faith buy after the worship
  branch: 60/42 faith, cap `MISSIONARY_CAP`=2, SHRINE + complete
  Holy Site gate, real-MP walk to the nearest differently-followed
  city, `SPREAD_PRESSURE` lump 10/15, charge death); religious
  victory (see B-25). STILL OPEN (recorded residuals): Apostles +
  theological combat (abilities on top of this chassis); PLAYER
  missionaries (no faith-buy verb — rides #50/A-18).
- B-19. RESOLVED (2026-07-17, Round B2): era-anchored GP cost ladder
  (`gpCost`), global race kept, WRITER/MUSICIAN added (n_gp=9,
  appended). Building-GPP differentiation beyond +1/building absent.
- B-20 (re-scoped 2026-07-17, Round B2). Writer/Musician output
  degrades to instant culture lumps. STILL OPEN: multi-charge people,
  Great Works as building-slotted stores (Amphitheater/Museum line),
  tile activation, per-person abilities.
- B-21 (re-scoped 2026-07-17, Round B2). LANDED: `CS_TYPE_BUILDINGS`
  (building-tier keys) + `CS_SUZERAIN_BONUS` (per-CS unique bonus
  rows) data tables in data/cityStates.ts. STILL OPEN: the LIVE 3/6-
  envoy channel still keys to districts via `CS_TYPE_DISTRICT` (inert
  in-gate — no CS exceeds 1 envoy at 100t; re-key when a gate-reachable
  scenario exists, likely with #56's 250t horizon), and the suzerain
  perk stays type-generic in the live path.
- B-23. Trade simplified: no Trader unit, no roads, no route duration
  or completion (`TradeRoute` in core/types.ts has a `toCs` target and
  nothing else), no international routes to rival civs —
  `tradeCapacity`/`routeYields` (core/trade.ts) cover domestic +
  city-state only, range flat 15 (`TRADE_ROUTE_RANGE`).

**Meta:**
- B-22. No casus belli/grievances/alliances/World Congress: war is a
  bare boolean toggle (`declareWar`/`makePeace`, core/rivals.ts; the
  NATIONALISM boost text in data/boosts.ts is the only mention of
  casus belli). No warmonger cost, no peace deals with terms.
- B-24. No governors, no era score/Ages: nothing in core/ or data/;
  the natural insertion points — `loyaltyDelta` (core/rivals.ts) for
  the governor/age multipliers, `GameState` (core/types.ts) for era
  tracking — carry none of it. Loyalty consequently runs un-modulated
  (no 0.5×/1.5× age factors, no +8 governor anchor).
- B-25 (re-scoped 2026-07-17, Round B2). LANDED: Science victory — a
  6-step space-race project chain gated on late techs, `victoryType` 3
  (player win) / 4 (rival completion = defeat) in `endTurn`; Campus is
  the Spaceport proxy; TS-complete + vitest (`space-victory.test.ts`).
  **GPU sim LANDED (2026-07-18, ROUND B3 slice W)**: the chain ships
  to the GPU (exporter unfiltered with sp/vic/rt/rp fields,
  `space_done` per-civ state, rival completion → victoryType 4 +
  game_over via the A-14 projects path, endTurn recompute mirrored) —
  landed byte-identical and PROVEN GATE-UNREACHABLE even at 250t
  (rival greedy resolves a Campus to RESEARCH_GRANTS first; the
  player has no GPU project subsystem), so parity rests on
  `gpu/space_race_test.py` (gpu/ROUND_B3_LOG.md §W). **RELIGIOUS
  victory LANDED (2026-07-19, ROUND B6 S3)**: `religiousVictor` /
  `_religious_victor` — predominance (>half of each civ's cities)
  in EVERY alive civ, checked at endTurn on the just-flipped follow
  set, victoryType 5 (player religion) / 6 (rival religion, defeat),
  precedence space > domination > religion > score; gate-unreachable
  at 250t, poke-pinned (`tests/religious-victory.test.ts` + the
  `religion2` battery lane). STILL OPEN: a player project-production
  path (victoryType 3 can only be preserved, not produced, on the
  GPU), and Culture/Diplomatic victories (systems absent).
- B-33 (new; the fidelity face of A-19). Rivals never interact with
  each other: rival `atWar` is only vs the player (`declareWar`,
  core/rivals.ts; `hostileUnitAct` comment "they never war other
  rivals"), and there is no rival↔rival trade, denouncement, or
  alliance. Real Civ 6 AIs war, ally and trade among themselves — the
  geopolitical map here is a pure star topology around the player.

Sweep corrections (2026-07-12): B-13 policy count 20→19 (direct
recount); B-16 reframed — IZ mine value matches vanilla, deviation is
vs the GS ruleset the repo otherwise models; B-17 "inert" was stale —
Encampment produces General GPP and building yields now, remaining
gaps re-scoped; B-26's one-step barb march re-verified still open
(A-8 shipped full-MP for rivals only); B-27 figures refreshed by
direct count. All other inherited items re-verified accurate.

## D. Engine optimizations — CHAPTER CLOSED 2026-07-13

D-1..D-8 (task #36, f739d8c), D-10..D-18 (task #52, 1779904) and D-9
(task #53) all landed bit-exact; landing logs live in git history. D-9
(`_rival_city_yields_all` batching, gate-equivalence-proven) closed
the chapter. Hard constraint for any future item stays: bit-exact,
gate-equivalence is the bar; never read perf numbers off a contended
machine.

## E. Docs staleness

Fresh hunt 2026-07-13, post-#49-sweep (E-1..E-15 closed at 806a4a0) —
three verified contradictions the day-old sweep missed. **E-19..E-21
SWEPT 2026-07-13 (task #51)**: improvements.ts header rewritten to
current reality (9-improvement roster, real charges,
`validImprovementsIn` gating, sandbox bypass), both gpu/README
coverage cells corrected (chops/harvests are the only TS-only
remainder; player build heads stop at FARM/MINE/LUMBER_MILL), and a
RETRO note re-scopes BUILD_PLAN VP-G1/G2's never-spend premise
against shipped A-5/A-4/A-14. tsc clean. E-16 (AGENT_PROMPT.md
refresh) RESOLVED 2026-07-18: the owner archived the file to
docs/archive/ instead of refreshing it. Original items kept for
reference:

- E-19. RESOLVED (2026-07-13, task #51): `improvements.ts` header
  rewritten to current reality (9-improvement roster, real charges,
  `validImprovementsIn` gating, sandbox bypass).
- E-20. RESOLVED (2026-07-13, task #51): gpu/README coverage cells
  corrected — chops/harvests are the only TS-only improvement
  remainder since A-13.
- E-21. RESOLVED (2026-07-13, task #51): a RETRO note re-scopes
  BUILD_PLAN VP-G1/G2's never-spend premise against shipped
  A-5/A-4/A-14.

## G. Known parity latents (dormant)

G-1..G-5 resolved (detail in git history / the cited logs):

- G-5. RESOLVED (2026-07-19, ROUND B10 slice-H, #66). The class: a
  rival's treasury off by EXACTLY 1 gold (± score, e.g. 5.4) on the
  turn it ACQUIRED a player city mid-phase — seed 9222 t184 (loyalty
  defect, ROUND B5) and seed 9301 rng 2026006147 t223 (rival 0 war-
  captures player city 586, B9-R2), rosters/per-city RC fields/combat
  all bit-identical. ROOT: `transferCityToRival` (rivals.ts) built the
  new rival city's `districts` by pushing EVERY complete owned district
  tile, so a player city holding duplicate-type districts (two CAMPUS
  tiles, 499 + 543) handed the rival BOTH campuses' floored adjacency.
  The GPU twin `_transfer_city_to_rival` writes the type-keyed registry
  `rc_dist_tile[type] = tile` in ascending tile order, silently
  OVERWRITING to one tile per type (kept 543, dropped 499) — and both
  its yield path (`_rival_city_yields_all`) and trace district count
  read that registry. Net: TS counted/yielded two campuses (raw science
  13), GPU one (raw science 9 → ×0.9 amenity factor = the 3.6 gap ×1.5
  science weight = 5.4 score; the treasury delta is the same missing
  campus's economy). Wrong engine: TS (real Civ 6 = one district per
  type per city; the GPU registry IS that model). FIX: `transferCityToRival`
  dedupes kept districts by type via a Map, last (highest tile index)
  wins — mirroring the GPU registry overwrite exactly. Verified: the
  faf08cc repro (seed 9301 rng 2026006147) goes red→green; SEED_OVERRIDES
  17:9222 + 23:9301 restored (the reshuffled current-engine trajectories
  no longer hit an acquisition at those turns, so they ride in-gate green
  rather than red — the fix closes the latent regardless). Only
  `transferCityToRival` (player→rival) can carry duplicate-type
  districts; captureRivalCity/`_transfer_rc_to_rc`/CS capture start from
  one-per-type sources.
- G-1. RESOLVED: `_rival_builder_actions` gain terms read current
  `r_techs`/`r_civics` (validity keeps the snapshot); poke
  `gpu/builder_gain_test.py`.
- G-2. RESOLVED (2026-07-17, #47r): GPU player GP loop banks faith via
  a `player_faith` accumulator mirroring the rival loop.
- G-3. RESOLVED-AS-REFUTED (2026-07-17, #46r): the iteration-order
  theory was wrong (`_reclaim_pool` is stable); the real flip blockers
  were housingAll, wildcard-slot overflow, and the builder camp-clear
  mirror — all fixed (`gpu/government_test.py`).
- G-4. RESOLVED-ON-CATCH (2026-07-17, #56): scripted builder walker
  moved AFTER production (TS order), fixing a one-turn phantom job.

## F. Hunt tooling — MOVED (2026-07-13)

The hunt-tooling reference is IMPLEMENTED machinery, not an open gap;
it now lives in gpu/HUNTING.md (same content, maintained there).
