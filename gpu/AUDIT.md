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
  TS-player-only).
- A-7 (remainder). No government/policy machinery for rivals:
  `getModifiers` (effects.ts) layers `GOVERNMENTS`/`POLICIES`
  (data/policies.ts) via `applyPolicyEffects` on top of research, while
  `getRivalModifiers` (effects.ts) covers research + the rival's
  pantheon/beliefs only; `unlockGovernment`/`unlockPolicy` unlocks
  (`computeUnlocksIn`) have no rival consumer. No GPU government
  tensors exist for either seat (inert while the scripted player never
  adopts one). Re-scoped to land with the policy-breadth work (#46).
  [opus-ok: the getRivalModifiers extension + GPU modifier tables +
  exporter rows, off a settled effects list — the same shape as the
  A-7 belief tables; the yield-path APPLICATION sites stay Fable.]
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
- A-20 (new). City heal rates are asymmetric: player cities heal a
  flat +20 when unbesieged, war or not (`barbarianPhase` (combat.ts);
  `cityHealPerTurn` in `_barbarian_phase` (engine.py)), while rival
  cities heal +15 at peace / +5 at war (`rivalPhase` (rivals.ts, the
  A-10 block); `torch.where(r_atwar, 5, 15)` in `_rival_phase`
  (engine.py)). A-10 shipped only the siege pin — the rates never
  converged, so an unbesieged player city under war out-heals a rival
  city 4:1, biasing sieges toward the player.
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
(`UNITS`). Note: every production/research cost is uniformly ×0.6
(`GAME_SPEED`) — a deliberate Online-speed choice, not counted as a
gap; likewise GS disasters are modeled minus sea-level rise
(`disasterPhase`, core/disasters.ts).

**Combat/military:**
- B-1. Walls/ramparts missing: no Walls tiers in `BUILDINGS`
  (data/buildings.ts header: "no wonders, no walls"), city HP is one
  flat 200 pool (`CITY_MAX_HP`, data/units.ts; `getCityHp`/
  `cityDefenseStrength`, combat.ts) with no outer-defense layer. Real:
  Ancient/Medieval/Renaissance Walls add a separate HP bar that melee
  can't fully bypass. Sieges stay trivial.
- B-2. Cities never ranged-strike attackers — only the
  melee-retaliation roll in `attackCity`/`attackRivalCity`/
  `attackCityState` (combat.ts); the city turn is just the heal loop at
  the bottom of `barbarianPhase`. Real cities (with walls) fire a
  ranged shot every turn. Follows from B-1; insertion point is
  `barbarianPhase`/`endTurn`.
- B-3. No zone of control: `findPath`/`walkPath`/`moveCostInto`
  (core/units.ts) ignore enemy adjacency entirely; units slide past
  defenders freely.
- B-4. No unit XP/promotions: `Unit` (core/types.ts) has no
  xp/promotion fields, `UnitDef` (data/units.ts) has no promotion tree.
- B-5. No fortify action/bonus: the only rest mechanic is
  heal-if-unmoved in `refreshUnits` (core/units.ts); no +3/+6
  fortification CS.
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
  runs to Modern.
- B-15. No war weariness: no amenity penalty from prolonged war
  anywhere in the amenity aggregation (`computeCityStats`/`amenityTier`,
  core/city.ts + `declareWar`, core/rivals.ts). Eternal wars are free.
- B-26. Map/barbarian fidelity: no cliffs (no such concept in
  data/terrains.ts or core/mapgen.ts). Barbarian era scaling is a
  single step (`barbarianPhase` spawns SPEARMAN after turn 60, else
  WARRIOR) — no scout-then-raid escalation, no ranged/naval barbs,
  camps spawn WARRIOR garrisons directly. CONFIRMED still open: barb
  raiders keep the one-step march (`hostileUnitAct`, combat.ts — "the
  pre-A-8 single step, verbatim"; the A-8 full-MP walk shipped for
  rival units only). Real barbs move full MP.
- B-28 (new). Marsh defense sign is flipped: `terrainDefense`
  (combat.ts) grants +3 for MARSH alongside woods/rainforest; real
  Civ 6 gives the defender −2 in marsh (and floodplains). Marshes
  should be kill zones, not fortresses.
- B-29 (new). No wounded-strength penalty and no river-crossing attack
  penalty: `meleeAttack`/`damageRoll` (combat.ts) use full
  `UNITS[type].combat` regardless of HP, and `crossesRiver`
  (core/units.ts) is consulted only for movement cost, never combat.
  Real: damaged units fight at reduced CS (up to −10), melee attacking
  across a river takes −5. Attrition and river lines don't exist.
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
- B-11. Tech tree is 32 of the real ~68: `TECHS` (data/techs.ts)
  counted 32 entries; `ERAS` stops at Modern (no Atomic/Information/
  Future).
- B-12. Civics 31 of the real ~50: `CIVICS` (data/civics.ts) counted 31.
- B-13. Policy cards 19 (recounted) of the real 50+, and no diplomatic
  cards: `POLICIES` counted 19 entries; data/policies.ts header
  documents diplomatic slots sitting idle. `GOVERNMENTS` = all 10 base
  ones.
- B-14. `CITIZEN_SCIENCE` = 0.7/pop (data/constants.ts) vs real 0.5 —
  verify intent; `CITIZEN_CULTURE` 0.3 matches real. ~40% extra base
  science compounds over 250 turns.
- B-27. Catalog sizes (recounted this sweep): world wonders 13
  (`BUILT_WONDERS`, data/builtWonders.ts) vs ~30 in base game; natural
  wonders 7 (`WONDERS`, data/wonders.ts) vs ~12; buildings 34
  (`BUILDINGS`) vs ~45+ (walls excluded on both sides of that count);
  pantheons 11 / follower beliefs 6 / founder beliefs 4 (`PANTHEONS`/
  `FOLLOWER_BELIEFS`/`FOUNDER_BELIEFS`, data/religion.ts) vs real
  ~25/~11/~8; great people 28 = 7 classes × 4 (`GREAT_PEOPLE`) vs real
  9 classes (no Writer/Musician classes, no per-era rosters); projects
  6 (`PROJECTS`, data/projects.ts); improvements 9 (`IMPROVEMENTS`).

**Economy/districts/religion:**
- B-16. District adjacency magnitudes deviate from GS values:
  `DISTRICTS.INDUSTRIAL_ZONE` gives +1 per `MINE_OR_QUARRY` (GS real:
  +0.5 per mine, +1 per quarry, +2 per Aqueduct/Dam);
  `DISTRICTS.HARBOR` gives +2 per `CITY_CENTER` (real +1). (The IZ +1
  matches vanilla-launch values — the deviation is vs the GS ruleset
  the repo otherwise follows, e.g. the district discount and loyalty.)
  Campus/Holy Site/Theater/Commercial Hub magnitudes verified correct.
- B-17 (re-scoped). Encampment is no longer inert: it earns +1 General
  GPP/turn plus +1 per building (`greatPersonPointsPerTurn`,
  core/game.ts; `GP_CLASS_DISTRICT`), and Barracks/Stable/Armory/
  Military Academy give production/housing (`BUILDINGS`); zero
  adjacency matches real Civ 6. Remaining real gaps: no specialist
  slots (`SPECIALIST_YIELDS` (data/greatPeople.ts) has no ENCAMPMENT
  entry; `citySpecialistSlots` skips it), no district combat role (no
  HP/ranged strike/movement block), no unit-XP function.
- B-18. Religion: no Enhancer belief slot (no enhancer list in
  data/religion.ts), no spread/pressure — file header: "once founded,
  all of your cities follow your religion"; no Missionaries/Apostles/
  theological combat anywhere. Religious victory can't exist; faith is
  a pure economy channel plus `WORSHIP_BUILDINGS`.
- B-19. GP costs are flat 60·2^n per class per civ (`gpCost`,
  data/greatPeople.ts) vs the real era-cost ladder and the global
  first-come-first-served race between civs; no building GPP
  differentiation beyond +1 per building (`greatPersonPointsPerTurn`).
- B-20. GP effects are instant lumps only: `applyGreatPersonEffect`
  (core/game.ts) pipes `GreatPersonDef.effect` straight into
  science/culture/faith/gold/capital-production totals — no tile
  activation, no Great Works/slots, no multi-charge people, no unique
  per-person abilities.
- B-21. City-states: no per-CS unique suzerain bonuses — the suzerain
  perk is type-generic (`isSuzerain`/`SUZERAIN_ENVOYS`,
  `csTradeCapacityBonus`, the militaristic levy in core/rivals.ts);
  3/6-envoy bonuses key to districts via `CS_TYPE_DISTRICT`
  (data/cityStates.ts) instead of the real building tiers
  (Library/University etc.). Quests do exist (`questSatisfied`,
  core/cityStates.ts) but are a small fixed set.
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
- B-25. Victories: only Domination + turn-limit Score — `endTurn`
  (core/game.ts) sets `victoryType` from last-civ-standing or
  `TURN_LIMIT` (250). No Science/Culture/Religious/Diplomatic victory
  tracks (consistent with B-6/B-18/B-22 — their prerequisites don't
  exist).
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

## D. Engine optimizations (open opportunities)

The 2026-07-12 landed batch (D-1..D-8: leader() gating,
_rcy/_adj/_farmadj/_buildable caches, live-slot lists, border-growth
hoists, shared buffers — −21% battery wall) is dropped; items below
are the remaining open opportunities, ranked by expected impact. Hard
constraint on every item: bit-exact, gate-equivalence is the bar.

**D-10..D-18 RESOLVED (2026-07-13, task #52)** — the safe-class batch,
landed by three parallel worktree subagents (engine.py / parity_test.py
/ rollout.py disjoint), merged, one unified validation. Measured on a
quiet machine: battery wall 249s → 218s all-green; scripted gate 151s
→ 63s isolated (−58%; D-11b/D-12 dominated — the per-(r,j) full-map
pair_dist planes were the true hot spot); parity lane −13-19%
(D-17), rollout.json BYTE-IDENTICAL + checkpoint tensors equal (D-18).
Forced-compaction off-script gate green (72×250t) — mandatory here
because D-14/D-15 changed slot iteration. No gate caught a regression
(every item first-try). Details per item live in this file's git
history and commit messages. PROCESS CATCH banked: worktree agents
spawn on a STALE base (the default remote ref, not local HEAD) — the
D-17 agent's failing baseline diagnosed it; agents must fast-forward
to the session HEAD before baselining. Only D-9 (below) remains open
in this chapter.

- D-9. Trace-side `_rival_city_yields` duplication — batch the per-j
  calls in `rival_empire_score`. `trace_row` runs every turn
  (rollout.py + parity_test.py) and calls `rival_empire_score(r)` for
  all R, each looping `for j in range(self.RC)` into
  `_rival_city_yields` — R×RC full yield computations (window gather,
  ~30 plane gathers, topk over M=37) on top of the R×RC the same
  turn's `_rival_phase` already did. The phase values can't be reused
  (mid-step vs post-step state), but the trace path can compute all j
  at once ([B, RC, M] gathers + one topk), keeping the per-j
  accumulation order into `yt`; per-city column sums are dyadic-exact
  per the `_dyadic_fp` assertion, and the [B, M] `tiles_from_offsets`
  window per (r, j) can be cached on a center-version. Risk: **needs
  gate-equivalence check** (reduction/topk shapes change; the dyadic
  argument should hold but must be proven on the gate).

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

## F. Hunt tooling (current, for reference)

**RAW CHECKPOINTS — one mechanism for diagnosis AND verification.**
Shipped: rollout `--ckpt` (default 25; parent clears the transient dir
per run) dumps snapshot()+rngs+paths per shard; the replay dumps
wrapped serialize(state) per game via CIV6_CKPT; `gpu/ckptdiff.py
--rng` is the JIT bracket finder; `--resume-t`/CIV6_RESUME_T resume
both engines from any checkpoint (validated bit-faithful);
scripts/ckpt-lines.ts is the TS JIT reader. CB lines carry k
(call-site tag), t (target tile), c (pre-draw rng counter).
Forced-compaction knobs: CIV6_RECLAIM_AT (u/v/p unit pools) +
CIV6_RC_RECLAIM_AT (rc city slots) — run the off-script gate under
them to stress slot-layout invariants (four real catches to date).
- RAW state has no frozen-vs-fresh ambiguity; a JIT diff tool loads
  both engines' checkpoints at turn t and runs the existing
  tsStateLines/gpu_state_lines on the loaded states — new diagnostics
  = new readers over old dumps, not engine changes + reruns.
- Determinism + the saved action log make every turn reachable:
  binary-search checkpoints for the first divergent one, replay
  forward ≤K turns single-game computing full lines JIT.
- The same checkpoints ARE the resume points for fix-verification
  (full-batch only — BLAS association is batch-shape-dependent; resume
  checks can false-green fixes with pre-checkpoint effects — the
  pre-commit bar stays the FULL BATTERY, whose gpu-gate lane IS the
  gate; never chain a standalone gate then the battery on the same
  code).
- What checkpoint INSPECTION cannot give: intra-turn EVENTS (the CB
  combat-roll log stays) and MID-TURN TRANSIENTS — both recovered via
  INSTRUMENTED REPLAY: resume from the nearest checkpoint with an
  event flag or a pure-read probe; probes are bit-faithful (pure reads
  replay the exact original trajectory — no false-green caveat,
  unlike fixes).
- GPU resume needs `--shard K --shards 4` to match batch layout, and
  a resume run OVERWRITES rollout.json — for TS-side instrumentation
  of one off-script game, extract a one-game rollout file
  (`{...roll, games: [g]}`) and full-replay it (seconds, no resume).

Phase-1 statelog: `rollout.py --shards 4 --log <rng>` +
`CIV6_LOG=<rng> npm run gpu:replay` + `python gpu/logdiff.py` → first
divergent line. Fields: PC loy; RC cb/til/hp; RU hp+a (acted); RT fai
+ tsum (territory checksum); TI carries rp (live resource priority);
CB lines = every damage roll from the damageRoll/_damage_roll
chokepoints. Probe at the exact batch shape of the failing run.
PYTHONUTF8=1 on piped Windows runs. Never edit engine/TS sources while
a gate/battery pipeline is in flight.
