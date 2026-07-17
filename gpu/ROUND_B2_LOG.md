# Round B2 — merge log

## Slice P — #46 economy/districts/policies (+ A-5r/A-7r)

Agent P. Base sha `8fc5966` (ROUND_B2 design note).

### Landed (gate-green)

**B-14 — CITIZEN_SCIENCE 0.7 → 0.5** (owner ruling). One constant in
`data/constants.ts`; the GPU reads it via the exporter's `citizenScience`
row, so a fixture regen propagates it. Scripted + forced-compaction gates
0.0 milli.

**B-16 — GS district adjacency** (owner ruling). `data/districts.ts`:
- `HARBOR` CITY_CENTER +2 → **+1** (gate-affecting — Harbors are scaffolded;
  flows to the GPU through the district catalog's `dyn_center` amount, both
  engines read the same catalog).
- `INDUSTRIAL_ZONE` `MINE_OR_QUARRY` +1 → **MINE +0.5 / QUARRY +1 / new
  AQUEDUCT +2** source. New `AdjacencySource` kinds MINE/QUARRY/AQUEDUCT
  (`districts.ts` + `matchesAdjacency` in `yields.ts`), exporter `ADJ_SRC`
  rows 11–13, GPU `_dyn_mine/_dyn_quarry/_dyn_aqueduct` amounts + a guarded
  block in `_district_adj_raw`. Industrial Zone is rival-unreachable (A-9) and
  never scaffolded, so these are **inert in the current gate** (catalog-
  faithful for when IZ becomes reachable). Fractional sums still floor in
  `districtAdjacency`. `tests/yields.test.ts` updated to the GS values.

**B-13 — policy breadth.** `POLICIES` expanded 19 → **58** (incl. 6
diplomatic cards, so diplomatic slots stop sitting idle). New cards are
appended AFTER the originals so the greedy slot fill's table order —
URBAN_PLANNING first in every economic slot — is preserved. `GOVERNMENTS`
unchanged: all 10 base tiers present; the reachable ones (CHIEFDOM,
AUTOCRACY) are wildcard-free, which keeps the GPU greedy slot fill simple.

**A-7r — government/policy adoption machinery (LANDED INERT).** Full,
turn-exact implementation, shipped behind the master switch
`GOVERNMENTS_ADOPTION_LIVE = false` (`data/policies.ts`), mirrored to the GPU
as `rules.governmentsLive` → `engine._gov_live`. Repo discipline: new tables
land changing nothing before behaviour flips on. What's implemented:
- TS `computeAdoption(research)` — pure deterministic rule: newest unlocked
  government (highest tier, ties → GOVERNMENTS table order), base slots filled
  greedily in POLICIES table order among unlocked cards of matching kind.
  Wired into the scripted PLAYER via `autoGovernment` (game.ts) and into every
  rival via `getRivalModifiers` (`applyGovernment`, effects.ts). Zero RNG.
- Effect application at the SAME pipeline point in both engines
  (computeCityStats' `bonuses`, pre-amenity-factor): cityYields to every city,
  capitalYields to the capital. TS `rivalCityYields` gains the cityYields add
  (the player-`bonuses` twin); the GPU applies it in the player walk
  (`_city_totals`) and BOTH rival paths (`_rival_city_yields` and the batched
  `_rival_city_yields_all`).
- Per-seat GPU modifier tables + exporter rows (the A-7 belief-table shape):
  `rules.governments` (tier, unlockCivic, slot kind counts, cityYields[6],
  capitalYields[6]) and `rules.policies` (kind, unlockCivic, cityYields[6],
  capitalYields[6]); engine helpers `_adopted_gov` / `_adopted_gov_tier` /
  `_gov_policy_mods`.
- The city-state influence rate gains the adopted government's tier
  (`GOV_INFLUENCE_TIER` == government tier), mirrored in `_city_state_phase`.
- Poke test `gpu/government_test.py` (wired into battery cputests) forces the
  switch on in-memory and asserts the adoption boundaries, greedy slot fill,
  influence tier, and inert-by-default.

**Verification of the live path:** with the switch flipped to `true`, the
scripted gate is turn-exact on **23/24 seeds**; the ONLY divergence is a
single self-correcting off-by-one (seed 9066, turn 98, `punits`) — see the
blocker below. All economy yields (player + rival), rival training production,
science/culture/treasury accumulators and the influence tier are 0.0-milli
exact; the residual is NOT in the gov/policy yield application.

### Degraded / omitted effects (recorded per common rule 2)

- **GPU gov/policy channels:** only `cityYields` and `capitalYields` are
  applied in the GPU. The other `PolicyEffects` channels (`adjacencyMult`,
  `buildingYieldMult`, `housingIfDistricts`, `amenitiesIfSpecialty`, `newDeal`,
  `yieldMult`, `amenitiesAll`, `housingAll`, `tilePurchaseMult`,
  `encampmentProdMult`) are TS-only. This is safe because no government or
  slotted card that is LIVE in the 100-turn gate uses one: the scripted player
  slots VETERANCY (encampmentProdMult — inert, no Encampment) + URBAN_PLANNING
  (cityYields prod); rivals adopt AUTOCRACY (capitalYields) and slot the same.
  GOD_KING/LAND_SURVEYORS/INSULAE etc. never reach a free slot. Wildcard slots
  are never filled by the GPU greedy — no reachable government has one. When a
  future government/policy reaches a live instance of an unimplemented channel,
  that channel must be added to `_gov_policy_mods`.
- **~30 of the 39 new B-13 cards are inert** (empty effects): their real
  effects need systems this calculator does not model — unit combat, unit/
  settler/builder/wonder production multipliers, trade routes, tourism,
  envoys/grievances/diplomatic favour, spies, great-people points, Ages/faith
  purchase. They land as named catalog rows with the correct slot kind.
- **GOVERNMENTS slots:** the 10 base governments were kept as-is (they carry
  GS-style military/economic/diplomatic/wildcard slots). Exact GS slot-count
  re-derivation was deliberately NOT done, to keep the reachable governments
  (CHIEFDOM, AUTOCRACY) wildcard-free — the GPU greedy slot fill implements
  per-kind fill only (no wildcard). Refine slot counts in the slice that adds
  GPU wildcard-slot filling.

### Deferred

- **A-5r (rival gold-buy units/settlers) — NOT STARTED.** Ran out of budget
  after the A-7r parity hunt. It spawns units into the pooled slot state
  (needs `_MUTABLE` registration + kill hygiene + the forced-compaction gate)
  and touches the rival-unit domain that surfaced the latent below, so it is
  higher-risk. Next step: extend the A-5 building-buy block in `rivalPhase`
  (rivals.ts) + `_rival_phase`/`apply_rival_actions` (engine.py) with the
  units/settlers verbs, reusing the controlled-head semantics
  (`production_mask` + `_apply_settlers_and_purchases` for seat 0,
  `rival_masks` + `apply_rival_actions` for controlled rivals). One purchase
  per civ per turn, extending the existing block's order.
- **Tile purchase (buyTile rival twin) — DEFERRED** (part of A-5r; `buyTile`
  is TS-player-only with no rival/GPU twin on any seat).
- **B-13 new-card unlock wiring — DEFERRED.** The 39 new cards are catalog-
  only (no `unlockPolicy` in `civics.ts`), so they are never unlocked/slotted
  even when the switch flips. Wire their unlocks (especially the diplomatic
  cards, to make AUTOCRACY's D slot live) in the flip slice.

### Blocker / latent (why A-7r ships inert)

Flipping `GOVERNMENTS_ADOPTION_LIVE` on leaves exactly one gate divergence:
**seed 9066, turn 98, `punits` (TS 3 vs GPU 4)** — a single, self-correcting
off-by-one that reconciles at turn 99. Root-caused: URBAN_PLANNING's +1
production (applied turn-exactly to both seats) shifts the rival build/train
trajectory onto a configuration where rival 1 (at war) captures a stuck player
builder at tile 867 one turn apart. At turn 97 the full traced state (incl.
rival unit COUNT) is identical; only the (untraced) rival unit MARCH ordering
differs — the TS war-march iterates `state.units` (spawn/insertion order) in
`hostileUnitAct` (rivals.ts) while the GPU twin iterates unit SLOTS, so a
spawn/reclaim-timing shift flips the order in which two rival units reach the
builder. This is a **pre-existing, out-of-slice rival-combat/movement latent**
(chapter B / rival-unit domain), not a defect in the gov/policy yield
application (verified 0.0-milli exact everywhere else, incl. rival training
production which correctly rides `_rival_city_yields`). Zeroing URBAN_PLANNING's
effect makes the live path fully green, confirming the trigger.

**Next step to flip live:** fix the rival war-march to iterate rival units in
TS insertion/acquisition order (not GPU slot order) in `hostileUnitAct`'s GPU
twin, then set `GOVERNMENTS_ADOPTION_LIVE = true` (and regen). The poke test
already covers the adoption/slotting math.
# Round B2 landing log

## Slice Q — #47 religion + great people

Base sha `8fc5966`. Four commits, all gate-serialized green (scripted +
forced parity 0.0 milli, 244 vitest, tsc clean, poke test green):

- `dc650bf` B-19 GP era-cost ladder
- `f6d9532` B-18/B-27 belief catalog to real GS counts
- `f00aae2` B-19 Writer/Musician GP classes
- `a76b21d` B-18 Enhancer belief slot + poke test

### What landed

**B-19 GP cost ladder.** `gpCost` (data/greatPeople.ts) replaced the flat
`60·2^n` with the real era-anchored ladder `GP_COST_LADDER =
[60,120,200,290,390,500,620,750]` (standard-speed base GPP thresholds,
Ancient..Information). Shared across all classes exactly as the old
formula was, so both engines keep reading the single exported `gpCosts`
array — the change propagates draw-for-draw to the player advance loop
and the rival first-come race. Past the ladder end the top era cost holds
(clamp), matching the GPU's `_gp_costs[...clamp(max=7)]`.

**B-19 Writer/Musician classes.** Added `WRITER` + `MUSICIAN` to
`GreatPersonClass`, `GP_CLASS_DISTRICT` (both → THEATER_SQUARE),
`GP_CLASS_NAMES`, and `GREAT_PEOPLE` (4 per-era individuals each so the
`gpEffects` tensor stays rectangular). Appended LAST in `GP_CLASSES` so
PROPHET keeps class index 3 (`prophetCls`) and the GPU's per-class tensors
(`r_gpp`, `gp_earned`, `_gp_effects`, `_gp_roster`, belief `gpp`)
auto-extend to `n_gp = 9` from the exporter — no engine.py edit needed.
A completed Theater Square now accrues GPP for Artist + Writer + Musician
each turn (real Civ 6) on both player and rival sides.

**B-18/B-27 belief catalog.** PANTHEONS 11→25, FOLLOWER_BELIEFS 6→9,
FOUNDER_BELIEFS 4→8, all real GS rosters. New rows that fit existing
`BeliefEffects` channels land LIVE: Goddess of Festivals + Religious Idols
(`improvementOnResource`), Pilgrimage (`perCity`), Stewardship
(`buildingYields`). Fully data-driven — the GPU belief tables + pool sizes
are built from the exporter, so both engines pick the k-th open belief in
identical data order.

**B-18 Enhancer belief slot.** The fifth belief slot: `ENHANCER_BELIEFS`
(7 real GS enhancers), `ReligionState.enhancer`, `GameState.claimedEnhancers`,
`canEnhanceReligion` + `enhanceReligion` (player choose path, gated on a
second earned Prophet, claimed-pool exclusion mirroring follower/founder).
`effects.ts` aggregates the enhancer belief for symmetry. Exporter emits
`enhancerPool` + an inert enhancer effect table for the deferred GPU race.
Landed as INERT PLUMBING: no rollout path claims an enhancer, so the seed
rollouts are byte-unchanged and engine.py is untouched.

**Poke tests.** `gpu/religion_gp_test.py` (wired into `battery.py`
cputests) exercises rollout-unreachable paths: the GP era-ladder + its
clamp boundary through the player advance loop, `n_gp = 9` with the three
culture classes sharing the Theater Square district index, belief catalog
counts, and the enhancer pool/table. A TS enhancer choose-path test was
added to `tests/religion-trade.test.ts`.

### Degradations (real effect → what shipped, and why)

Beliefs that need an absent system landed INERT (empty effects) or degraded
to an existing channel:

Pantheons (INERT): City Patron Goddess (per-city district production),
Dance of the Aurora / Desert Folklore / Fire Goddess / Sacred Path (Holy
Site tile-adjacency — no belief adjacency channel), Earth Goddess (tile
appeal — absent), God of Healing / God of War (combat + faith-from-kills),
God of the Forge / Monument to the Gods (production-toward-units/wonders),
Goddess of the Harvest (harvest/feature-removal faith), Initiation Rites
(barb-camp faith).
Pantheons (DEGRADED): Goddess of Festivals → `improvementOnResource`
luxury +1 culture (real targets Plantation luxuries specifically; the
channel is improvement-agnostic). Religious Idols → `improvementOnResource`
bonus +2 faith (real is Mines/Quarries over bonus **and** luxury; degraded
to bonus category, improvement-agnostic).

Followers (INERT): Jesuit Education (faith-purchase of non-worship
buildings), Reliquaries (relics + tourism), Warrior Monks (unique unit).

Founders (INERT): Papal Primacy (city-state envoy influence), Religious
Unity (allied/CS shared-religion bonuses).
Founders (DEGRADED): Pilgrimage → `perCity` +2 faith (real counts FOREIGN
follower cities only; degraded to all cities of the founder). Stewardship →
`buildingYields` +1 science Library/University, +1 gold Market/Bank (real
gates on a Governor + religion-following; degraded to the founder civ's
cities unconditionally).

Enhancers (ALL INERT): Itinerant Preachers, Scripture, Just War, Defender
of the Faith, Crusade, Holy Order, Messenger of the Gods — every one boosts
religious pressure range, missionary/apostle spread & cost, religious
combat, or faith trade routes, none of which exist.

GP activation (B-20 DEGRADED): Writers and Musicians produce a slotted
Great Work of Writing / Music (culture + tourism) in real Civ 6. Tourism is
absent and Great-Work building slots are deferred (below), so each lands as
an instant culture lump toward the current civic (the Artist channel).

### Deferred / omitted (out of scope or budget — exact next steps)

- **B-18 pressure spread** (cities within 10 tiles of a holy city receive
  pressure; majority pressure flips the followed religion; symmetric
  player↔rival). NOT built. Needs a new per-city `followedReligion` +
  per-city pressure accumulator on BOTH `City` and `RivalCity`, a holy-city
  distance scan (reuse `pair_dist` on the GPU), and a deterministic flip
  rule (ties → city_seq). Zero-RNG. Next: land the per-city religion/
  pressure state inert first (fixtures byte-identical), then flip on the
  per-turn pressure add + majority flip in both engines at the same point
  in the turn loop (after yields, before the GP/belief races).
- **B-18 missionaries** (faith-purchased, 3 spread charges). NOT built —
  depends on pressure spread + a new pooled unit type. Would need
  `_MUTABLE` registration + KILL hygiene + the forced-compaction gate.
  Deterministic targeting (nearest non-follower city, ties → city order)
  is possible but only meaningful once pressure exists.
- **B-18 rival enhancer claiming + GPU enhancer race.** The slot + catalog
  + exporter table shipped; rivals do not yet claim enhancers and the GPU
  has no `r_enhancer` tensor. Next: add a claim block in `claimBeliefs`
  (rivals.ts) gated on `religionFounded && !enhancerClaimed && prophets>=2`
  with a THIRD `nextRandom` draw AFTER the founder draw; mirror it in
  engine.py's religion block (`self._next_random(eopen)` after `ro_`, an
  `enh_claimed` mask + `r_enhancer` identity + `r_enhancer_done`, all in
  `_MUTABLE`). `_next_random` advances only where the mask is true, so the
  draw is RNG-safe when it never fires. Effects stay unwired until a
  non-inert enhancer exists.
- **B-20 Great Works as building-slotted yield stores** (Amphitheater/
  Museum-line slots, per-work culture+gold). NOT built. Needs a per-building
  work-slot store on `City`/`RivalCity` + the slot yield in the buildings
  position of both yield pipelines (the A-4 effect-placement magnet). Until
  then Writer/Musician output is the instant culture lump above.
- **B-20 multi-charge great people.** NOT built — the GP model earns an
  individual and applies one instant effect. Multi-charge needs a per-GP
  charge counter + a charge-spend action.
- **Theological combat** and **religious victory**: explicitly out this
  round (recorded per mission). Both depend on missionaries/apostles +
  pressure + a victory-track counter.
- **Worship building expansion** (real GS has ~10: Synagogue/Wat/Mosque/
  Dar-e Mehr/Prasat beyond the current 5). Left as-is — adding rows touches
  the shared `BUILDINGS` catalog + per-district building counts (which feed
  GPP), overlapping Slice R's B-27 building work; deferred to avoid a merge
  collision.

### Latent parity notes (observed, not touched)

- The GPU player GP advance loop (`_advance_player_great_people`) applies
  gpEffects columns 0-3 (science/culture/gold/production) but NOT column 4
  (faith); the rival loop does apply faith. A player earning a Prophet
  would bank faith in TS but not on the GPU. Pre-existing, untested by the
  scripted rollout (the scripted player never earns a Prophet with a
  completed Holy Site in 100 turns), and unrelated to this slice (my new
  Writer/Musician classes use only the culture column). Flagged for
  whoever wires player religion founding.
# Round B2 log

## Slice R — #48 trees/victories/meta

Base sha: 8fc5966. Agent R worktree. Validation bar = ROUND_B2.md §Validation steps 1-5.

### Design decisions

**B-11 techs 32 → 68 (append-only).** Existing 32 rows kept byte-identical; 36
new rows appended at index 32+ (Classical fill 2, Medieval 4, Renaissance 6,
Industrial 3, Modern 5, Atomic 6, Information 7, Future 3). `Era` union + `ERAS`
gained Atomic/Information/Future (display-only — no core logic reads `.era`,
verified by grep; only `ui/panels.ts` groups by era). Append-only preserves
every `techIdx` lookup and the auto-pick tie-break (TS stable-sort keeps
insertion order on cost-ties = GPU `key + index*1e-6` argmin; effective costs
are integers so the 67e-6 epsilon can never flip a ≥1 gap).

**B-12 civics 30 → 51 (append-only).** Same treatment; 21 new rows (Classical 2,
Medieval 1, Renaissance 2, Industrial 3, Modern 5, Atomic 4, Information 4).

**Parity is turn-exact, not baseline-preserving.** Scripted gate compares TS vs
GPU (both regenerated), so a trajectory change that both engines make
identically is still 0.0 milli. The fuller tree DID shift the scripted games
(e.g. seed9001 5/6 → 2/6 cities): the greedy cheapest-available auto-picker now
interleaves the new cheap-but-inert nodes (IRON_WORKING 120, SHIPBUILDING 200,
…) ahead of useful expensive ones, slowing the scripted economy. This is the
honest consequence of a real-topology tree under a greedy auto-pick; parity (the
bar) holds green on both the scripted and forced-compaction gates. No seed
collapses to 0/1 cities.

### Degraded / omitted effects (recorded)

- **All 36 new techs + all 21 new civics unlock NOTHING in the modeled roster.**
  Their real unlocks are military units (B-10 roster, later round), naval hulls,
  or absent systems (aircraft, nukes, spies, tourism). They are pure tree nodes
  — topology + gating only. Recorded per brief.
- **New civics carry no policy/government unlocks.** Real GS civics unlock policy
  cards and tier-3 governments — the POLICIES/GOVERNMENTS surface owned by Slice
  P (#46). Left inert here for merge-cleanliness (no cross-slice references).
  Deferred to Slice P / a later reconciliation.
- **Eureka/inspiration coverage of new nodes is thin by necessity.** Attached only
  where the condition is expressible in `data/boosts.ts` terms AND the target is
  exported to the GPU (Campus/Harbor building tiers, placeable districts, roster
  improvements): CARTOGRAPHY (2 Harbors), PRINTING (2 Universities), STEAM_POWER
  (2 Shipyards), REFINING (2 Oil Wells), NUCLEAR_PROGRAM (Research Lab). Every
  other new node is unboostable/uninspirable — its real trigger needs an absent
  system (military kills, naval hulls, trade routes, alliances, luxuries,
  multi-city population, wonder counts). Recorded.
  - Note on export gating: ARMORY/BROADCAST_CENTER/WORKSHOP/MUSEUM etc. are NOT
    in the exported building set (only CITY_CENTER + CAMPUS + HOLY_SITE +
    COMMERCIAL_HUB + AQUEDUCT + HARBOR buildings export), so boosts keyed to them
    would be TS-only and could diverge — deliberately avoided.

**B-27 world wonders 13 → 30 (append).** 17 real GS wonders (index 13-29, within
the 32-bit `wok` tile-bitmask ceiling — the hard cap on wonder count). Effects
use ONLY the supported wonder channels (cityYields / growthAllMult /
regionalAmenities / cityYieldMult); placement predicates reuse only combos the
original 13 exercise. Rivals build the early ones (Temple of Artemis / Great Bath
/ Etemenanki / Apadana) in-gate; parity holds turn-exact.

**B-27 natural wonders 7 → 12.** Five real wonders (Mount Kilimanjaro, Yosemite,
Cliffs of Dover, Mount Everest, Eye of the Sahara) using ONLY the effect fields
`tileYields()` already bakes into the exported per-tile `y` (tileYields /
adjacentYields) plus the generic Holy-Site NATURAL_WONDER adjacency and the
ASTROLOGY "near a wonder" eureka. The GPU reads the baked map, so even though the
larger wonder pool shifts map generation (more wonder variety competing for the
same per-map quota), parity is turn-exact — scripted + forced gates green.

**B-27 buildings — per-district roster already real-complete.** Every modeled
specialty district carries its full real 3-tier building set (Campus
Library/University/Research Lab, Commercial Hub Market/Bank/Stock Exchange, Harbor
Lighthouse/Shipyard/Seaport, Theater Amphitheater/Museum/Broadcast Center,
Industrial Workshop/Factory/Power Plant, Encampment Barracks-Stable/Armory/
Military Academy, Entertainment Arena/Zoo/Stadium, Holy Site Shrine/Temple +
worship). Growing to 45+ needs districts we don't model (Government Plaza, Dam,
Canal, Aerodrome, Water Park, Spaceport, Diplomatic Quarter) — each a full
district-plumbing effort, out of this slice. Recorded, no rows added.

**B-15 war weariness (both engines, active in-gate).** Integer accumulator (turn
counter) → flat empire-wide amenity penalty `floor(weariness / PER_AMENITY)`,
applied AFTER the luxury grant in the shared amenity aggregation for the player
(city.ts `computeCityStats`) and, symmetrically, per rival (rivals.ts
`rivalAmenityTiers`). Accrues +1/turn while at war with any LIVE opponent (war
status read identically in both engines as `atWar ∧ has-cities`, sidestepping
the eliminated-rival ambiguity), decays 4×/turn at peace. Updated once per turn:
player at the top of endTurn / GPU `step` (after the inert war block), rival at
its rivalPhase / `_rival_phase` block top — both read last turn's war state,
symmetric, and strictly before their amenity read. Integer throughout ⇒ no float
association risk. GPU mirror: `war_weariness` [B] + `r_war_weariness` [B,R]
tensors, `_MUTABLE`-registered (snapshot/restore), `_ww_penalty_player/_rival`
helpers, penalty subtracted from the balance at the two `_amenity_factors` sites.
- **Magnitude deliberately gentle** (−1 amenity per 8 war-turns, cap −2): the
  SCRIPTED player is PASSIVE — it never sues for peace, so rival-declared wars
  run their full RIVAL_WAR_MIN course. A steep penalty (an earlier −1-per-4,
  cap −6 draft) collapsed the passive player's amenity→loyalty in several seeds
  (export threw "no cities left"), emptying the scripted fixture. The gentle
  curve keeps the drag real without inducing collapse; off-script/RL agents that
  make peace shed it quickly. Recorded as a modeling choice.
- Scripted + forced-compaction parity gates green at 0.0 milli after the
  softening; `gpu/war_weariness_test.py` (accrual→penalty threshold, cap
  saturation, 4× decay, floor-at-0, snapshot round-trip) wired into battery.py's
  cputests lane.

**B-25 science victory (TS-complete; GPU simulation deferred).** A 6-step
sequential space-race project chain (Earth Satellite → Moon Landing → Mars
Reactor/Habitation/Hydroponics → Exoplanet Expedition), gated on Information/
Future-era techs (Rocketry/Satellites/Nanotechnology/Nuclear Fusion/Robotics/
Offworld Mission) + each on the previous step. Completing EXOPLANET_EXPEDITION
sets `victoryType = 3` (player science win) in the endTurn recompute (which now
preserves a science 3/4 over the domination/score result). A RIVAL completing
the chain sets `victoryType = 4` — the domination-defeat mirror (player loss).
`state.spaceProjects` / `rival.spaceProjects` track chain progress.
- **Parity-safe by construction, INERT in the gate:** the gating techs are
  unreachable in 100 turns; the space projects sit LAST in `PROJECTS` so the
  rival greedy `.find` (first project with a complete district) always resolves
  to a base project — rivals never queue the race under the scripted policy; and
  the scripted player builds cheapest buildings, never projects. They are
  FILTERED from the exported GPU projects table, so the GPU project machinery and
  every project index stay byte-identical. Both engines are provably inert
  in-gate (scripted + forced gates green at 0.0 milli).
- **DEGRADES (recorded):** no Spaceport district exists → CAMPUS is the Spaceport
  proxy (any Campus city can run the race); Culture/Religious/Diplomatic
  victories stay OUT (their systems — tourism, religious spread depth, world
  congress — don't exist); the Exoplanet 50-turn light-year travel + Terrestrial
  Laser Station acceleration are collapsed into a single final project; space
  projects grant no side yields/GPP (pure victory steps); real space-project
  costs are the generic projectCost, not the much larger GS values.
- **Poke test:** `tests/space-victory.test.ts` (vitest) drives the full chain to
  a player win, forces a rival win → defeat, and asserts the tech+sequence
  gating. It is a VITEST (not a gpu/*_test.py) because the space-race lives only
  in TS: the GPU space-race SIMULATION (tech-gated one-time projects + sequence
  tensors + a science-victory tensor) is DEFERRED — it is unreachable in the
  100-turn parity gate, and a faithful GPU port is disproportionate to land
  safely in this slice; a follow-up round should port it (and add the
  gpu/*_test.py poke) when the space race becomes gate-relevant (full-length
  rollouts reaching the Information era).

**B-21 city-state data rows (additive catalog, per [opus-ok] scope).** Two data
tables added to data/cityStates.ts; the suzerain/quest/envoy LOGIC stays as-is
(the B-21 tag: "suzerain/quest logic stays Fable"), so both are inert catalog:
- `CS_TYPE_BUILDINGS` — the real GS building tiers per CS type (scientific →
  Library/University/Research Lab, etc.), restricted to buildings that exist in
  this roster. This is the real building-tier keying the 3-/6-envoy bonus SHOULD
  use (Civ 6 pays it per building, not per district). The LIVE envoy channel
  (`csEnvoyBonuses`/`envoyBonusDelta` + the GPU district-bonus term) stays
  DISTRICT-keyed — rewiring it to buildings is inert in the parity gate (the
  scripted scenario never lifts a CS past 1 envoy, so the 3-envoy threshold is
  unreachable) AND would need an unvalidatable change to the GPU hot yield path,
  so it is left as catalog data for a future building-keyed wiring round.
- `CS_SUZERAIN_BONUS` — the per-CS unique suzerain bonus table (24 named
  city-states × real GS bonus), each degraded to a description + the closest
  expressible yield channel, with a `note` recording what the real bonus needs
  that this model lacks (unit XP, spies, tourism, power, trade routes, apostles,
  Great-Work slots). The suzerain PERK stays type-generic per the scope, so this
  table is catalog data for a future per-CS wiring round.
- Zero logic change ⇒ fixtures byte-identical, scripted gate green at 0.0 milli,
  tsc clean, vitest green.

### Deferred items (out of this slice)

- B-22 casus belli (→#55), B-23 trade (→#41), B-24 governors/era-score — OUT.
- B-27 building growth to 45+ — needs unmodeled districts (see above).
- **GPU space-race simulation (B-25)** — TS spec complete + poke-tested; the GPU
  port is deferred (gate-unreachable). Only surfaces if a full-length rollout
  reaches Information-era techs.
- **B-21 live 3/6-envoy building-tier rewiring** — the DATA (`CS_TYPE_BUILDINGS`)
  is in; wiring the live envoy channel + the GPU term from districts to buildings
  is a future round (inert in-gate, needs a mirrored GPU hot-path change). The
  per-CS suzerain bonuses (`CS_SUZERAIN_BONUS`) likewise await a wiring round.
