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
| A symmetry | 35 | 7.9 | **23%** |
| B fidelity | 88 | 40.8 | **46%** |
| C order/slot latents (closed) | 30 | 30 | 100% |
| D perf (closed) | 15 | 15 | 100% |
| E docs (E-16 with owner) | 6 | 5 | 83% |
| G parity latents (EMPTY) | 4 | 4 | 100% |
| **Overall (incl. closed)** | **178** | **102.7** | **58%** |
| Open chapters only (A+B+E) | 129 | 53.7 | **42%** |

(2026-07-17 #46r: A-7r LIVE; A-5r+#47r: A-5 resolved-minus-tile-
purchase, B-18 spread, chapter G EMPTY. 2026-07-18 ROUND B3 U/V/W/X:
B-18 60%→75% — pressure→yields coupling LIVE; B-13 → 100% — full
unlockPolicy wiring; A-7r → 100% — the residual card wiring was
B-13's; B-25 50%→70% — GPU space-race sim poke-covered; B-29 done.)

Per-item weights (done% in parens where partial):
- A: A-5r 2 (95% — tile purchase → #50), A-7r 4 (done — ROUND B3
  closed the card wiring), A-9 4, A-11 4, A-12 4, A-17 4, A-18 3,
  A-19 4, A-20 2 (done), A-21 2, A-22 2.
- B combat: B-1 3 / B-2 2 / B-3 2 / B-5 2 / B-28 1 / B-29 2 (done);
  B-15 2 (85% — magnitude waits on peace-suing); B-26 3 (50%); B-4 3,
  B-6 8, B-7 2, B-8 2, B-9 3, B-10 3, B-30 2, B-31 1, B-32 2 (open).
- B progression: B-11 4 / B-12 3 / B-13 3 / B-14 1 (done);
  B-27 4 (75%).
- B economy/religion: B-16 2 / B-19 2 (done); B-17 2 (40%); B-18 4
  (75% — coupling live; enhancer effects/missionaries/victory open);
  B-20 3 (30%); B-21 2 (40%); B-23 3 (open).
- B meta: B-25 3 (70% — GPU sim poke-covered; player project path +
  other victories open); B-22 3, B-24 3, B-33 3 (open).
- E: E-16 1 (open); the landed E-sweep counted as 5 done.
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
- A-7 (remainder — LIVE 2026-07-17, #46r). `GOVERNMENTS_ADOPTION_LIVE
  = true`: both scripted seats adopt governments and slot policies,
  turn-exact at 24×250 (the flip hunt fixed housingAll + wildcard
  overflow + the builder camp-clear latent — see G-3; the off-script
  round then added yieldMult — the Merchant-Republic ×1.1 gold catch,
  rng 2026006082 t249 — and INSULAE's housingIfDistricts). GPU
  channels now: cityYields, capitalYields, housingAll +
  housingIfDistricts (player-only per TS `rivalHousing`), yieldMult
  (player-only per TS `rivalCityYields`), wildcard slot fill.
  REMAINING channels are UNREACHABLE BY PROOF under deterministic
  greedy adoption: W slots max out at 2 and the table-order overflow
  is always LAND_SURVEYORS+INSULAE, so
  adjacencyMult/buildingYieldMult/amenitiesIfSpecialty/newDeal cards
  never slot; CLASSICAL_REPUBLIC (amenitiesAll) shares its unlock
  civic with AUTOCRACY which wins table order. tilePurchaseMult
  (LAND_SURVEYORS, slotted) is gate-inert: `buyTile` has no GPU verb
  on any seat (A-5). These become due if the card table order, W
  counts, or adoption rule ever change — the exporter already ships
  every channel. **CLOSED (2026-07-18, ROUND B3 slice V)**: the
  new-card `unlockPolicy` wiring landed (see B-13); the reachability
  proof was re-derived post-wiring and the unreachable-channel set is
  UNCHANGED (append-only cards cannot displace earlier slotted ones
  under the greedy fill — gpu/ROUND_B3_LOG.md §V). A-7 remainder done.
- A-9. Rival-unreachable catalog: `tryQueueRivalDistrict` (rivals.ts) /
  `_place_district_rival`+`rival_masks` (engine.py) iterate only
  `SCAFFOLD_DISTRICTS` (data/districts.ts: CAMPUS, HOLY_SITE,
  COMMERCIAL_HUB, AQUEDUCT, HARBOR) — THEATER_SQUARE, INDUSTRIAL_ZONE,
  ENCAMPMENT, ENTERTAINMENT_COMPLEX, NEIGHBORHOOD and all their
  buildings are unreachable; worship buildings are skipped in both
  `tryQueueRivalBuilding` and the A-5 purchase block (`def.worship`
  guard); PALACE is granted only by `foundCity` (game.ts,
  `state.cities.length === 0 ? ['PALACE'] : []`) — `foundRivalCity`
  (rivals.ts) never grants it (the GPU's "+PALACE" term is hardwired to
  c==0). Downstream: `GP_CLASS_DISTRICT` (data/greatPeople.ts) gates
  ENGINEER on INDUSTRIAL_ZONE, GENERAL on ENCAMPMENT, ARTIST on
  THEATER_SQUARE, so `claimGreatPeople` (rivals.ts) can never accrue
  those three classes. [opus-ok: the catalog/exporter side — district
  and building table rows, GP-class wiring, PALACE grant constant —
  off a settled breadth list; the rival QUEUE/PICK logic
  (tryQueueRivalDistrict order, purchase interplay, draw-count) stays
  Fable.]
- A-11. Rivals have no trade routes — trade.ts is player-keyed
  throughout (`tradeCapacity` iterates `state.cities`,
  `cityTradeYields`/`routeYields`/`addTradeRoute`/`addCsTradeRoute` all
  read player structures); the GPU has no route machinery at all
  (`_city_state_phase` (engine.py) notes trade-route quests "remain
  uncompletable"). Related one-sidedness: `routeRaidedAt` (trade.ts)
  suspends routes for BARBARIAN proximity only — at-war rival units
  never interdict player trade.
- A-12. Rivals don't interact with city-states: no envoys/influence/
  levy (`levyUnits` (rivals.ts) is suzerain-player-only;
  `envoy_mask`+`_city_state_phase` (engine.py) are seat-0;
  `rival_masks` (engine.py) documents "envoys have no rival analog —
  all-False"), and rivals cannot even attack a CS — `meleeAttack`'s
  `csTarget` scan (combat.ts) is `attacker.owner === 'player'`-gated,
  and `attackCityState`/`captureCityState` (combat.ts) /
  `_capture_city_state` (engine.py) are reachable only from the
  player's seat. Downstream: rival districts never earn the CS envoy
  district bonuses the player's `_city_totals` applies.
- A-17. Rival border-growth adjacency is CIV-level:
  `pickRivalBorderTile` (rivals.ts) accepts any tile adjacent to
  `tileOwnedByCiv(·, civOfRival(r))`, and rival territory has no
  per-city tile registry (`t.rivalId` only), vs the player's
  `borderCandidates` (city.ts) requiring `n.cityId === city.id`;
  consumption runs in `rivalPhase`'s `rcBorderCost` loop with
  `borderGrowthCost` × `getRivalModifiers().borderCostMult`. GPU twin
  `_rival_border_growth` (engine.py) mirrors the civ-level scan.
  Impact: a rival city can claim across a sibling city's frontier, and
  acquired tiles belong to the civ blob, not a city. P7 material.
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
- A-20. **RESOLVED (2026-07-13, task #54)**: rival cities heal the
  player's flat +20 when unbesieged — the 15-peace/5-war split was a
  local invention; real Civ 6 city HP regen ignores war status. Both
  engines read one source: new `CITY_HEAL_PER_TURN` (data/units.ts,
  next to `CITY_MAX_HP`) in `rivalPhase`, and the already-exported
  `cityHealPerTurn` rules field (the one `_barbarian_phase` reads) in
  `_rival_phase`. The A-10 besieged pin and the max-HP clamp are
  untouched. Fixture regen: all 24 seeds survived, no SEED_OVERRIDES
  needed.
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
- B-1. **RESOLVED (2026-07-13, task #42)**: one tier — `ANCIENT_WALLS`
  (`BUILDINGS`, CITY_CENTER, cost 80, MASONRY unlock via `techs.ts`)
  grants a 100-HP OUTER pool (`outerHp` on City/RivalCity; GPU
  `outer_hp`/`rc_outer_hp`, `_MUTABLE` + `_RC_SLOT_FIELDS`) that
  absorbs attack damage FIRST, spillover to city hp (the three melee
  twins both engines). Heals with the +20 city heal (`CITY_HEAL_PER_TURN`
  clamp), wiped on capture/transfer/raze. Walls do NOT raise
  `cityDefenseStrength` (deliberate 1-tier simplification, commented).
  City-states deferred (no build queue). Rivals build/buy it
  data-driven (probe-confirmed).
- B-2. **RESOLVED (2026-07-13, task #42)**: a city WITH `ANCIENT_WALLS`
  strikes once/turn — range 2, nearest unit hostile to the city's civ
  (tile-order tie-break), one `damageRoll` at `cityDefenseStrength`
  (hostileRangedStrike conventions: single roll, no retaliation,
  civilians take it, never captures; new `pcstk`/`rcstk` k-tags).
  Player strike in `barbarianPhase`'s city section, rival in
  `rivalPhase`, both immediately before the heal, identical draw order
  both engines (per-rank `walk_ord` / rc slot order on the GPU). No CS
  strike (no walls).
- B-3. **RESOLVED for player+rival movement (2026-07-13, task #43)**:
  `inEnemyZoc` (units.ts) / `_in_enemy_zoc` (engine.py) — entering a
  tile adjacent to a hostile MILITARY unit halts the mover (movesLeft
  := 0) after the enter cost, tested live per step; wired into the
  player `walkPath` and all three A-8 rival walkers (war march /
  patrol / builder). DEFERRED: barbarians do NOT obey ZOC yet — B-26
  gave them the full-MP walk but the ZOC check is rival-gated so both
  engines stay symmetric (the GPU barb walk mirrors the pre-ZOC
  march). City-center ZOC also deferred.
- B-4. No unit XP/promotions: `Unit` (core/types.ts) has no
  xp/promotion fields, `UnitDef` (data/units.ts) has no promotion tree.
- B-5. **RESOLVED (2026-07-13, task #43)**: `fortifyTurns` (military
  only, cap 2) accrues on the EXACT acted/moved gate the D-2 heal uses
  (a unit that spent no MP digs in), reset by any move/attack; +3 CS
  at >=1, +6 at >=2 added to the DEFENDER's strength at every
  unit-defense roll site both engines. Symmetric (rival patrollers
  fortify). Survives TS serialize + GPU snapshot/restore + every
  `_reclaim_pool` permutation (`p/u/v_fortify` in `_MUTABLE` + the
  field lists, zeroed on spawn). HOLD already existed — no RL
  action-space growth.
- B-6. No embarkation/naval anything: `unitPassable` (core/units.ts) is
  `!isWater && !isImpassable` — water is a wall; `UNITS` has zero naval
  entries. Island starts are unreachable, Harbor cities can't be
  threatened from sea.
- B-7. No flanking/support bonuses: `damageRoll` inputs are raw CS +
  `terrainDefense` only (combat.ts); no per-adjacent-ally modifiers.
- B-8. Great Generals/Admirals are economy lumps:
  `GREAT_PEOPLE.GENERAL` is +production-to-capital, `.ADMIRAL` is +gold
  "prize money" (data/greatPeople.ts); `GreatPersonDef['effect']`
  cannot express a +5 CS/+1 MP aura at all.
- B-9. No strategic-resource requirements/stockpiles: `RESOURCES`
  (data/resources.ts) has the 'strategic' category on the map, but
  `UnitDef` has no resource field — the Horseman's own description says
  "resource requirement not modeled". Horses/Iron are just tile yields.
- B-10. Military roster still ends at Horseman (CS 36): `UNITS` is 7
  entries (Builder/Scout/Warrior/Slinger/Archer/Spearman/Horseman). No
  Swordsman/Knight/siege/gunpowder line; their unlock techs are absent
  by design — `TECHS` header: "Pure-military techs are omitted".
  Late-game combat power is frozen at Classical levels while science
  runs to Modern. [opus-ok: the UNITS/TECHS catalog rows + exporter
  tables off a settled roster list; combat integration and draw-count
  stay Fable.]
- B-15. **RESOLVED (2026-07-17, Round B2)**: war weariness — integer
  accumulator (`warWeariness`, +1/turn at war, −4/turn decay at
  peace) → flat amenity penalty via `computeCityStats`, symmetric
  player+rival, both engines (`_MUTABLE`-registered tensors; poke
  `gpu/war_weariness_test.py`). Magnitude DELIBERATELY gentle (−1 per
  8 war-turns, cap −2): the passive scripted player never sues for
  peace, so real magnitudes collapse the fixture. Raise toward real
  values with #56's survival heuristics.
- B-26. Map/barbarian fidelity: no cliffs (no such concept in
  data/terrains.ts or core/mapgen.ts). Barbarian era scaling is a
  single step (`barbarianPhase` spawns SPEARMAN after turn 60, else
  WARRIOR) — no scout-then-raid escalation, no ranged/naval barbs,
  camps spawn WARRIOR garrisons directly. CONFIRMED still open: barb
  raiders **RESOLVED (2026-07-13, task #44)**: barbs now run the same
  A-8 real-MP walk as rival movers (`hostileUnitAct` fall-through both
  engines; GPU `_barbarian_phase` raider block rewritten as the
  vectorized multi-step loop mirroring `_rival_unit_war_act`; target
  semantics unchanged). STILL OPEN in B-26: no cliffs, single-step era
  scaling, no scout-then-raid escalation, no ranged/naval barbs.
- B-28. **RESOLVED (2026-07-13, task #44)**: `terrainDefense` now gives
  the defender −2 on MARSH and FLOODPLAINS (was +3). GPU decoupled the
  dual-purpose `tdef` plane by adding a sibling `tmove` plane (enter
  cost reads `tmove//3`, defense reads `tdef`) so marsh stays slow to
  enter while its defense flips — movement cost proven unchanged
  (0/27,456 tiles). Exporter emits `tmove`.
- B-29. **RESOLVED (2026-07-18, ROUND B3 slice X)**: wounded units
  fight at −1 CS per 10 HP lost (linear, to −10 at 0 HP) and melee
  attacks across a river (`crossesRiver`) take −5 attacker CS — all
  18 `damageRoll`/`_damage_roll` sites, every seat, ranged and wall
  strikes river-immune; cities/CS centers/walls are not units and
  keep full strength. Fractional diffs forced a quantization both
  engines share: `q = round(diff·10)`, exp table 121→1201 entries at
  0.1 granularity (float association made irrelevant by
  construction); the CB statelog diff column now logs q. GPU river
  lookup reuses the exported `riverMask` bit the movement walkers
  read. Poke `gpu/combat_mod_test.py` (battery lane).
- B-30 (new). Conquest razes all infrastructure: `captureRivalCity`
  and `transferCityToRival` (combat.ts / core/rivals.ts) rebuild the
  city with `buildings: []` and only the CITY_CENTER district;
  `captureCityState` likewise. Real Civ 6 keeps districts and most
  buildings on capture. Conquered cities here are worth far less than
  real ones.
- B-31 (new). Civilians are killed, not captured: `meleeAttack`
  (combat.ts) — "Civilians are simply killed (Civ 6 captures; we don't
  model capture)". Real: settlers/builders change hands, a major
  raiding incentive.
- B-32 (new). Districts and buildings can't be pillaged:
  `hostileUnitAct` (combat.ts) pillages tile improvements only
  (`Tile.pillaged`); district tiles have no pillage state. Real
  raiders pillage district buildings for heavy yields/heals.

**Progression breadth:**
- B-11. **RESOLVED (2026-07-17, Round B2)**: `TECHS` now the full GS
  tree (68 entries), `ERAS` through Future — landed APPEND-ONLY so
  existing indices/tie-breaks hold. Pure-military techs are tree nodes
  that unlock nothing until B-10 lands the roster; eurekas only where
  the condition is expressible (unboostable rows listed in
  gpu/ROUND_B2_LOG.md §R).
- B-12. **RESOLVED (2026-07-17, Round B2)**: `CIVICS` 31 → 51, same
  append-only treatment, inspirations likewise.
- B-13. **RESOLVED (2026-07-18, ROUND B3 slice V; breadth Round B2)**:
  `POLICIES` 19 → 58 incl. 6 diplomatic cards; all 37 Round-B2 cards
  now carry `unlockPolicy` on their real granting civic (7 recorded
  substitutions for civics real Civ 6 grants elsewhere —
  gpu/ROUND_B3_LOG.md §V) — zero unreachable cards. The wiring
  activated the dormant MEDIEVAL_FAIRES "run 4 policy cards"
  inspiration, which the exporter dropped and `_detect_boosts` never
  detected — both fixed, player-only (TS `rivalCheckSatisfied` is
  false for it). ~30 cards remain effect-inert (their real effects
  need absent systems) — that is catalog-faithful, not a gap.
- B-14. **RESOLVED (2026-07-17, Round B2, owner-ruled)**:
  `CITIZEN_SCIENCE` 0.7 → 0.5 (real Civ 6). Reshuffled every
  trajectory (fixture regen; rlenv coverage-test horizon 60→100; seed
  9053 scripted collapse → SEED_OVERRIDES reroll pending #56).
- B-27 (largely RESOLVED 2026-07-17, Round B2). Now: world wonders 30,
  natural wonders 12, pantheons 25 / follower 9 / founder 8 (+7
  enhancers), great people 9 classes incl. Writer/Musician, projects
  incl. the space-race chain; buildings were already real-complete per
  MODELED district (unmodeled districts' buildings arrive with A-9).
  Degradation ledger: gpu/ROUND_B2_LOG.md (each row that needed an
  absent system). Improvements 9 stays (rest need naval/appeal).

**Economy/districts/religion:**
- B-16. **RESOLVED (2026-07-17, Round B2, owner-ruled → GS)**:
  INDUSTRIAL_ZONE +0.5/mine +1/quarry +2/adjacent-Aqueduct (new
  AQUEDUCT adjacency source), HARBOR +1 per CITY_CENTER (was +2,
  gate-affecting). Fractional sums floor in `districtAdjacency` as
  before. IZ channels are inert until A-9 makes IZ rival/scripted
  reachable.
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
  STILL OPEN: enhancer EFFECTS (all 7 inert), Missionaries/Apostles,
  theological combat, religious victory.
- B-19. **RESOLVED (2026-07-17, Round B2)**: era-anchored GP cost
  ladder `[60,120,200,290,390,500,620,750]` (`gpCost`), global race
  kept; WRITER/MUSICIAN classes added (n_gp=9, both → THEATER_SQUARE,
  appended so PROPHET stays index 3). Poke `gpu/religion_gp_test.py`.
  Building-GPP differentiation beyond +1/building still absent.
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
  `gpu/space_race_test.py` (gpu/ROUND_B3_LOG.md §W). STILL OPEN: a
  player project-production path (victoryType 3 can only be
  preserved, not produced, on the GPU), and
  Culture/Religious/Diplomatic victories (systems absent).
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
(task #53) all landed bit-exact; landing logs live in git history.
D-9, the one needs-gate-equivalence item, closed the chapter:
`_rival_city_yields_all` batches the trace path's per-j city yields
into one [B, RC, M] gather set + a single topk, `rival_empire_score`
keeps the per-j accumulation order (the P4 ±1-ulp class) reading
column slices, and the window cache rides the existing _eff_version
key (every rc_center mutation site already bumps it — zero new
invalidation sites). Proof: a direct bitwise probe (torch.equal, all
6 columns × every alive (r,j) × 24 seeds × 100 turns) plus green
scripted, forced-compaction and battery gates. Hard constraint for
any future item stays: bit-exact, gate-equivalence is the bar; never
read perf numbers off a contended machine.

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
refresh) stays with the owner. Original items kept for reference:

- E-19. `src/data/improvements.ts` header docstring claims "Stage 1
  has no builders/units: improvements are placed instantly and for
  free (like a builder with infinite charges), and no tech gating is
  applied." All three clauses are false in units mode: builders carry
  real charges (`validImprovements` consumers gate on
  `(u.charges ?? 0) > 0`), and `validImprovementsIn`
  (src/core/rules.ts) applies tech/civic gating via
  `unlocks.improvements.has(imp)` plus the `hillFarms` civic gate —
  only sandbox mode bypasses it. The roster is also 9 improvements
  now, not the stage-1 set the header implies.
- E-20. gpu/README.md §"What phases 1–5 cover (and what they don't)" —
  the "Not yet (runs in TS only)" cell reads "Improvements beyond
  FARM/MINE/LUMBER_MILL (pasture/camp/plantation, chops/harvests)."
  Contradicted for the rival economy since A-13: `_eff_prod`/gold
  paths add QUARRY/PASTURE/CAMP/PLANTATION/OIL_WELL catalog yields via
  `_imp_yields`, and `_rival_job_mask` lets rivals BUILD that resource
  roster on their unlock techs (`res_imp >= 3` / `_imp_unlock`). Only
  chops/harvests remain genuinely TS-only. The same staleness repeats
  in the paired coverage-table cells elsewhere in gpu/README.md.
- E-21. gpu/BUILD_PLAN.md §4b "Rival-seat verb parity", items
  VP-G1/VP-G2 — the premise "scripted rivals never SPEND, so behavior
  is inert-but-visible" (VP-G1) and "Scripted rivals keep
  never-spending" (VP-G2) is overtaken by the AUDIT A-arc: the A-5
  block in `rivalPhase` (rivals.ts) has scripted rivals spend banked
  gold (one purchase/civ/turn, `rival.treasury -= price`), A-4 raises
  world wonders, and the projects path (`queueProject`/`PROJECTS`)
  runs. These are unchecked forward-plan boxes, not a
  "current behavior" section, but the spend premise now directly
  contradicts shipped scripted-rival code.

## G. Known parity latents (dormant, not currently gate-visible)

- G-1. RESOLVED (owner-ordered fix ahead of gate visibility). Root
  cause was not the gain MODEL but its INPUTS: TS `rivalBuilderActions`
  builds the Δ-gain ctx from `modifiersFromResearch(rival.research)` at
  CALL time — after this turn's tech/civic completions in `rivalPhase`
  — while only VALIDITY rides the phase-top `rivalUnlocks` snapshot
  (the seed-9274-t100 catch on `_rival_job_mask`). The GPU had
  flattened BOTH onto the tk0/cv0 snapshot, so on the exact turn a
  farm-adjacency tech landed the gains ranked with the stale tier and
  flipped MINE-vs-FARM (seed 9196 t248, ΔrivalEmpireScore 6). Fix:
  `_rival_builder_actions` gain terms (`_farmadj_tier`, mine boost)
  now read current `r_techs`/`r_civics`; validity keeps the snapshot.
  Poked by `gpu/builder_gain_test.py` (battery lane `builder_gain`):
  scenario 1 proves gains-are-current (red pre-fix), scenario 2 proves
  validity-is-snapshot (guards the seed-9274 catch against
  over-correction).
- G-2. RESOLVED (2026-07-17, #47r — re-verified before fixing per the
  G-3 lesson; the asymmetry was real): the GPU player GP loop now
  banks the faith effect column via a `player_faith` accumulator
  mirroring the rival loop; poked in `gpu/religion_gp_test.py` (a
  fresh player Prophet banks exactly 100 faith + snapshot coverage).
  Noted residual: per-turn player yield-faith (`faithTotal`) remains
  GPU-unmodeled beyond this bank — dormant, no in-gate consumer; wire
  with player religion-founding. **Chapter G is EMPTY.**
- G-4. RESOLVED-ON-CATCH (2026-07-17, #56 hunt, seed 9287 t128→t142
  visible): the GPU's scripted builder walker (`_scripted_builder`)
  ran BEFORE the production-choice section while the exporter's script
  runs envoys → production → walker — so the walker could target a
  tile THIS turn's production had already paved (district/wonder
  pave), a one-turn phantom job that desynced the walk (farm landed on
  246 vs 290; worked-tile shift surfaced 14 turns later at a growth
  boundary). Pre-existing latent exposed by the 250t horizon. Fixed
  structurally: the walker call moved AFTER production (TS order);
  the #56 slice-A pre-walker snapshot reverted to live reads.
- G-3. RESOLVED as REFUTED-AND-REPLACED (2026-07-17, #46r flip hunt).
  Agent P's iteration-order theory was WRONG: `_reclaim_pool` is a
  STABLE compaction and spawns append, so GPU slot order among living
  units IS TS insertion order structurally — no ordering fix needed
  or made. The ACTUAL blockers behind P's seed-9066 repro (and the
  flip's real divergences at 250t) were three unrelated gaps, all
  fixed: (1) MONARCHY's `housingAll` channel unimplemented on the GPU
  (player-only — TS `rivalHousing` is mods-free; the t117-118
  multi-seed foodBox cluster); (2) `_gov_policy_mods` never filled
  WILDCARD slots ("no reachable government carries one" was
  100t-true, 250t-false — MONARCHY's W takes GOD_KING via
  within-kind overflow in table order); (3) `_scripted_builder`'s
  move block was the ONLY mover in the engine missing the
  `_clear_camp_at` mirror of walkPath's clearCampFor (seed 9170 t160:
  a builder walked onto an empty camp, +50 player gold + camp splice
  in TS only — rng-stream split). Poked by the extended
  `gpu/government_test.py` (wildcard overflow, housingAll,
  live-by-default).

## F. Hunt tooling — MOVED (2026-07-13)

The hunt-tooling reference is IMPLEMENTED machinery, not an open gap;
it now lives in gpu/HUNTING.md (same content, maintained there).
