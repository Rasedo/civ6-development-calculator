# Engine audit — open work

THIS FILE IS A LIST OF OPEN WORK. A resolved entry is DELETED, not
annotated; what was fixed, when and why is the git log's job. No history,
no shipped-prose, no test rosters — one weight and one OPEN list per entry,
each bullet naming its build, its blocker or its ask.

**RULES (owner):**
- Anchor code BY SYMBOL, never by line number.
- VERIFY-BEFORE-IMPLEMENT against a real Civ 6 source: the owner's install
  (XML over civilopedia; Base <- Exp1 <- Exp2, take the last) first, forums
  second. An unsourced magnitude is an ASK, never an invention.
- A gap deferred on an unbuilt mechanic is TWO open items: the mechanic and
  the gap naming it. "Recorded" and "descoped" are deferrals, never closures.
- Every new mechanic records which lane REACHES it; a green gate over an
  unreached mechanic proves nothing.
- When an entry closes, delete its row and its entry in the SAME commit.

**State:** P8 training PARKED until this file is empty. Restore `N_SEEDS`
to 24 before the final hunt.

## Open weight

Hand-weighted 1–8 by the size of what is LEFT to build, not by what the
mechanic was worth when the entry opened. One row per entry, no row
without an entry. No percentage: closed weight is deleted by design.

| Open item | Weight | What is left |
|---|---|---|
| **A. Engine vs engine** | **0** | |
| B-20r park orientation | 1 | no canonical vertical in this hex frame; every rhombus offered — a model choice, nothing to build until one is chosen |
| B-22r World Congress competitions | 1 | Aid Request's gold-to-rival scorer, three more scored quantities |
| B-24r governor tails | 3 | a district PURCHASE verb, the Fishery and City Park improvements, a fourth card style, Foreign Investor and Affluence on C-38, five clauses on C-1/C-31/C-34 |
| B-31r trade-route tails | 1 | plunder gold unsourced; chain depth is an ask; free-choice destination head is P8 |
| B-34r flood tails | 1 | coastal floods; the Egyptian and Soothsayer halves |
| B-51r Encampment pool on capture | 1 | ask |
| B-54r unique-unit flank/support stacks | 1 | Impi and Hypaspist, once C-78 seats them |
| B-56r inert promotions | 1 | Sentry needs sight-blocking (the Ngao Mbeba's see-through half waits with it); Ground Crews needs PATROL (C-34); Boarding has no magnitude |
| B-61r Great Person clauses with no carrier | 2 | ten `open: B-61r` ledger rows |
| B-62r suzerain adjacency at a wonder tile | 1 | unsourced either way |
| B-63r gang-up bar | 1 | ask; Enkidu's allied-war discount waits on it |
| B-66 formations | 1 | a THREE-member escort, the rider's own reveal |
| B-67 district price progression | 1 | GAME_PROGRESS curve for five districts, DLL-side |
| B-D unsourced data values | 1 | Democracy's route pays only its own city; per-city war weariness (DLL), GAME_SPEED shape, unit faith rate |
| **B. Fidelity vs real Civ 6** | **17** | |
| C-1 power | 1 | accident roll and damage tables (sourced, on ask 7), a minor's grid when C-38 gives one a load |
| C-2 diplomatic agreements | 2 | joint war, join war, research agreement, a luxury lump; mark/demand/discuss on C-76; what a mid-build purchase does to the hammers is an ask |
| C-16 the spy's second half | 1 | how the four UnitOperations probability columns compose; a Free City as spy ground |
| C-20 Mountain Tunnel's route multiplier | 1 | DLL-side magnitude |
| C-22 Preserve housing table | 1 | middle bands stylized |
| C-26 civilization abilities, the residue | 1 | agendas (C-76), four unread DLL clauses, the Rock Band's venue bits (C-79) |
| C-31 the nuclear strike's last clauses | 1 | the per-delivery split and the bomber's 50%-HP threshold (both on C-34's unpublished damage), citizens killed (C-77), wonder in the blast (ask) |
| C-33 Giant Death Robot's Range | 1 | a five-hex verb the action space lacks |
| C-34 air combat's second half | 2 | fighter interception and Patrol (unsourced roll), Priority Target |
| C-35 drowned ground is COAST | 2 | every ring fact must read a submerged tile as coast on both engines |
| C-38 a city-state's city | 2 | growth and border from its own food and culture, what it spends gold and faith on |
| C-41 Volcanic Soil | 1 | where an eruption lays it is an ask |
| C-45 queue depth five | 1 | ask |
| C-49 named storms | 1 | the storm's walk (DLL) |
| C-60 the Free City's own play | 2 | its units, walls and retaliation, its amenities, the religion walks |
| C-61 the Cothon's project | 1 | the row and its GAME_PROGRESS price, after C-79's Cothon |
| C-64 majority religion | 1 | a per-seat majority read; the tie rule is an ask |
| C-67 diplomatic preference weights | 1 | waits on a decider with alternatives (P8) |
| C-69 five unique rows with trait clauses | 2 | M'banza, Royal Navy Dockyard, Tsikhe, Mission, Cothon, and a strongest-naval-unit picker |
| C-74 per-game counts over per-object rolls | 1 | ask (volcanoes and reactors) |
| C-76 an opinion scale | 2 | a compared per-pair opinion on both engines; what moves it is an ask |
| C-77 the worked-tile pick is unexposed | 1 | one exposed reader per engine, compared per city |
| C-78 unique UNITS absent | 1 | all 31 civilization uniques are built; the nine LEADER units are left, and two clauses wait on B-56r and C-79 |
| C-79 unique INFRASTRUCTURE absent | 5 | 26 unique districts, buildings and improvements have no catalog row (C-69's five beside them); the Toa's Pā waits here |
| **C. Absent systems** | **35** | |
| **OPEN, TOTAL** | **52** | |

## The question ledger — owner asks, one line each

A question the SOURCE under-determines; neither engine ships a branch until
the owner rules or a primary source is reached. The ruling is written into
the entry and the line leaves.

1. **B-63r — the gang-up bar.** No source publishes the AI threshold;
   `GRIEVANCE_GANG` is a knob (forum lore: "100 is not enough, 150 is
   getting that way").
2. **C-41 — where Volcanic Soil lands.** Which tiles an eruption paints,
   and whether an already-improved tile takes it — DLL.
3. **C-45 — the queue's depth.** Five is a tensor dimension. Acceptable, or
   name a depth?
4. **B-31r — the course's depth.** `ROUTE_CHAIN_MAX` 6, the same shape.
5. **B-51r — the Encampment's pool on a city capture.** `city_outer_hp`
   zeroes; the district's own pool rides through. No rule reached.
6. **C-64 — the majority-religion tie.** Two religions in equal cities; no
   source names the winner.
7. **C-74 / C-1 — per-GAME counts over per-OBJECT rolls.** The install
   counts eruptions and reactor accidents per game; this engine rolls per
   volcano and would roll per reactor. PROPOSAL: divide the per-turn rate
   by the map's count of objects at risk.
8. **C-31 — a wonder in a nuke's blast.** Pillaged or not: unsourced.
9. **C-76 — the opinion deltas.** The install names every
   `LOC_DIPLO_MODIFIER_*` and publishes no amount; forum figures cite
   nothing.
10. **C-2 — what a mid-build gold purchase does to the hammers.** One
    tested report says a UNIT keeps its progress and a BUILDING's is wasted;
    this engine banks both, on the standing rule that hammers never burn.
    One forum post against a principle — the owner's call.
11. **Two city-state names this roster invented.** "Venice" and "Bandar
    Brunei" are not Civ 6 city-states. Their bonuses are AMSTERDAM's (base;
    Antioch carries the same text in Expansion1) and JAKARTA's. Both
    MECHANICS are built and sourced; only the names are wrong. Renaming
    them touches `seeder/place.ts`, which is hashed into `genStamp`, so the
    fix costs a reseed and a fresh `worlds.lock`. Rename, or keep the names?

## A. Engine vs engine

The digest is the only instrument for this class; a round that widens what
the gate reaches is worth more here than one that re-reads the exporter.

Nothing open.


## B. Fidelity vs real Civ 6 — shipped mechanics with open tails

- **B-20r. A PARK'S ORIENTATION.** Weight 1.
  - Civ 6 fixes the park rhombus's vertical; this hex frame has none, so
    every rhombus is offered. A model choice; nothing to build until a
    vertical is chosen.
- **B-22r. WORLD CONGRESS COMPETITIONS.** Weight 2.
  The machinery takes one data row per scored competition.
  - AID REQUEST scores gold SENT to the target player — needs a
    gold-to-a-rival scorer. BORDER DISPUTE, CATASTROPHE and MILITARY
    COMPETITION each want their own scored quantity.
  - THE NOBEL PRIZE competitions are Sweden-only (C-26).
- **B-24r. GOVERNOR TAILS.** Weight 3.
  - A district PURCHASE verb (gold and faith) — Contractor and Divine
    Architect wait on it; no engine has the verb.
  - The FISHERY and CITY PARK improvements — Aquaculture and Parks and
    Recreation wait on the catalog rows.
  - Renewable Subsidizer and Industrialist wait on C-1's plants; Air
    Defense Initiative on C-34's anti-air and C-31's ICBM; Arms Race
    Proponent on C-31's armament projects.
  - FOREIGN INVESTOR needs a minor that accumulates strategic resources
    (C-38); AFFLUENCE copies the ground's luxuries because a minor improves
    nothing (C-38).
  - NO CARD STYLE ASKS FOR A DARK AGE CARD: the driver's three styles never
    reach one (measured: a forced Dark Age slots 0 of 13). A fourth style
    is the carrier; poke-only until then.
  - Who to hire and where to seat him is a heuristic (catalog order,
    lowest-loyalty city) — a decision for P8's surface.
- **B-31r. TRADE-ROUTE TAILS.** Weight 1.
  - `ROUTE_CHAIN_MAX` 6 is a capacity choice — ask 4.
  - `PLUNDER_ROUTE_GOLD` 50 is unsourced.
  - The destination is one candidate row plus take/skip; the free-choice
    head is P8 work.
- **B-34r. FLOOD TAILS.** Weight 1.
  - COASTAL floods are not modelled: a flood reaches a river's own tiles
    (`_flood_river` / the river walk), and a coastal one needs a shoreline
    reach and the lowland bands to drive it.
  - The EGYPTIAN ability's flood half and the SOOTHSAYER's are C-26's and
    an absent chassis'.
- **B-51r. THE ENCAMPMENT'S POOL ON CAPTURE.** Weight 1.
  - `city_outer_hp` zeroes on a city capture; `Tile.encampOuterHp` /
    `encamp_outer_hp` rides through. Ask 5.
- **B-54r. UNIQUE-UNIT FLANK AND SUPPORT STACKS.** Weight 1.
  - Zulu's Impi and Macedon's Hypaspist raise flanking or support for
    themselves alone — after C-78 seats the chassis.
- **B-56r. THE INERT PROMOTIONS.** Weight 1.
  Three of 107 rows in `cpu/data/promotions.ts` carry `none`:
  - SENTRY ("see through Woods and Rainforest") — `revealAround` /
    `_reveal_around` reveal a flat radius; nothing blocks sight.
  - GROUND_CREWS ("heal while patrolling or deployed") — PATROL is C-34's.
  - BOARDING ("Gold from naval victories") — no published magnitude.
- **B-61r. GREAT PERSON CLAUSES WITH NO CARRIER.** Weight 2.
  - Ten `open: B-61r` rows in `docs/roster_ledger.json`: tourism x4,
    regional range x2, city-state absorption, barbarian conversion, ocean
    passage, Tupac Amaru's per-district grant walk.
- **B-62r. A SUZERAIN IMPROVEMENT'S ADJACENCY AT A WONDER TILE.** Weight 1.
  - `tileYields` leaves on `tile.wonder` before the adjacency add and
    `_tile_add_live` masks the same tiles; whether real Civ 6 pays it there
    is unsourced either way.
- **B-63r. THE GANG-UP BAR.** Weight 1.
  - `GRIEVANCE_GANG` is a knob — ask 1. Enkidu's allied-war discount
    (`EFFECT_ADJUST_PLAYER_ALLIED_WAR_DISCOUNT` 150) waits on it.
- **B-66. FORMATIONS.** Weight 2.
  - AN ESCORT FORMATION IS A PAIR; real Civ 6 links military, civilian and
    support. Needs a support stacking class and a two-rider drag on both
    engines (`escortUnit` / `_escort_rider`).
  - A DRAGGED RIDER LIFTS NO FOG: `stepUnit` / `_step_verb` reveal around
    the mover only.
- **B-67. THE DISTRICT PRICE PROGRESSION.** Weight 1.
  - The install runs COST_PROGRESSION_GAME_PROGRESS for the Aqueduct, Canal,
    Dam, Neighborhood and Mbanza and NUM_UNDER_AVG_PLUS_TECH for the rest;
    this engine runs the tech-driven one for all. Both formulas are DLL.
- **B-D. UNSOURCED DATA VALUES.** Weight 2.
  - DEMOCRACY'S ROUTE PAYS ONLY ITS OWN CITY. SOURCED (GS): "Your Trade
    Routes to an Ally or Suzerain's city provide +4 Food and +4 Production
    for BOTH CITIES." The ORIGIN half ships on both engines, and so does the
    extra quarter-point a turn; the DESTINATION's half pays another seat's
    city, and no channel here pays a foreign city for an incoming route.
  - THE PER-CITY WAR-WEARINESS SPLIT: the install's numbers are
    `WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_{AT_WAR_CITY 3, FOUNDED_CITY 0,
    NONFOUNDED_CITY 1}`, `_POINTS_FOR_AMENITY_LOSS 400`,
    `_PER_COMBAT_IN_{ALLIED 1, FOREIGN 2}_LANDS`, `_PER_UNIT_KILLED 3`,
    `_PER_WMD_LAUNCHED 10`, `_DECAY_{PEACE_DECLARED 2000, TURN_AT_PEACE 200,
    TURN_AT_WAR 50}`, `_WARMONGER_BASE 16`; how the per-city rows compose is
    DLL. The empire-wide rule ships (`warWearinessPenalty`).
  - `GAME_SPEED` 0.6 is a SHAPE difference: real Civ 6 scales cost, yield
    and turn tables independently.
  - THE FAITH RATE FOR A LAND COMBAT UNIT is inferred from the building
    rate (`FAITH_PURCHASE_MULT`, reused by `unitFaithCost` /
    `_seat_faith_unit_candidate`); no page states the unit one.
  - The BELIEF magnitudes (`religion` header) and the tuning constants in
    `seats` (its header names them) are stylizations no source closes.
  - Oligarchy and Classical Republic are adopted in NO game
    (`computeAdoption` / `_adopted_gov` take the newest tier); their rows
    are held by the two government lanes' borrowed-row drills only.

## C. Absent systems — the blockers, and the gaps waiting on them

- **C-1. POWER.** Weight 2.
  - THE ACCIDENT ROLL. SOURCED `Expansion2_RandomEvents.xml`:
    `RANDOM_EVENT_NUCLEAR_ACCIDENT_{MINOR,MAJOR,CATASTROPHIC}`, Severity
    0/1/2, `MinTurnAtRisk` 10/20/30 (the reactor age each opens at),
    `OccurrencesPerGame` 1 apiece at MODERATE; `RandomEvent_Damages`: MINOR
    improvement pillaged 10%, building pillaged 20%, radiation 100% for 2
    turns; MAJOR civilians killed 50%, improvement pillaged 40%, district
    pillaged 50%, buildings pillaged 100%, radiation 10 turns, land/naval
    units 50% @ 20-50 HP, garrison 50% @ 20-50; CATASTROPHIC improvement
    pillaged 100%, buildings DESTROYED 100%, district pillaged 100%,
    population -80%, radiation 20 turns, units 100% @ 20-50, garrison 100%
    @ 20-50, civilians 100%. The age SCALING is DLL. The clock ships
    (`City.reactorAge` / `city_reactor_age`); the roll waits on ask 7.
  - A CITY-STATE'S CITIES ARE NEVER POWERED: `resolveSeatPower` /
    `_resolve_seat_power` run for majors only. Vacuous today (nothing in
    `minorLadder` draws or supplies Power, pinned by
    `minor_yields_test::test_power_vacuous`); due when C-38's ladder
    reaches a building with a load.
- **C-2. DIPLOMATIC AGREEMENTS.** Weight 2.
  - WHAT A MID-BUILD PURCHASE DOES TO THE HAMMERS. The queue-front sale
    itself ships (`goldPurchasableBuildings` drops the queue term;
    `dropQueuedBuilding` banks the progress and closes the entry). The one
    tested report found (steamcommunity.com/app/289070/discussions/0/
    1848072002747657088) says a UNIT keeps its progress and a BUILDING's is
    WASTED — which contradicts this engine's standing rule that hammers
    never burn, on one forum post. Both engines BANK; the disposition is an
    ask.
  - JOINT WAR, JOIN ONGOING WAR, RESEARCH AGREEMENT (unpublished science)
    and ASK-FOR-PROMISE (C-76) — four agreements the table can carry and
    nothing acts on.
  - A LUXURY HAS NO LUMP TO TRADE: a luxury is a boolean access gate; the
    RESOURCE item names a strategic only.
  - A MISSION LEAVES NO MARK ("a small positive bonus in your
    relationship"), DEMAND and DISCUSS (the four promises of
    `Expansion2_DiplomaticActions.xml`, FavorCost 30, GrievancesForRefusal
    25, GrievancesPerIncursion 25) and the WAR OF RETRIBUTION's
    RequiresBrokenPromise all wait on C-76.
  - Readings with no source, identical on both engines: the intel bonus is
    unit-against-unit only; one running deal per ordered pair, `DEAL_ITEMS`
    a side, an offer standing two turns; a war does not end a standing
    deal.
- **C-16. THE SPY'S SECOND HALF.** Weight 1.
  - WHAT A LEVEL IS WORTH. The install's UnitOperations rows publish
    `BaseProbability` (13 Siphon Funds, Foment Unrest, Fabricate Scandal;
    14 Sabotage Production, Steal Tech Boost, Neutralize Governor; 15 Great
    Work Heist, Disrupt Rocketry, Breach Dam; 16 Recruit Partisans),
    `LevelProbChange` 1, `EnemyProbChange` 3, `EnemyLevelProbChange` 1.
    The exact question: how do the four compose into the chassis page's
    56/35/20/10, and which is the counterspy's catch?
    `SPY_SUCCESS_PER_LEVEL_PCT`, `SPY_CAPTURE_PCT` and `SPY_ESCAPE_ROUTES`'
    base rates are the model values a published composition replaces.
  - A FREE CITY IS NOBODY'S TO SPY ON: both engines walk the major rows for
    a spy's ground. Does the install let a spy operate in a Free City
    (C-60)?
- **C-20. THE MOUNTAIN TUNNEL'S ROUTE MULTIPLIER.** Weight 1.
  - "Trade Routes traveling through it can multiply the Gold they get from
    districts at their destination" — no published magnitude, DLL-side.
- **C-22. THE PRESERVE'S HOUSING TABLE.** Weight 1.
  - `PRESERVE_APPEAL_HOUSING` / `preserveHousing` state the published
    ceiling at Breathtaking; the middle bands are this model's own.
- **C-26. CIVILIZATION ABILITIES — THE RESIDUE.** Weight 1.
  The census is `docs/ROSTER.md`; the ledger `docs/roster_ledger.json` reads
  `shipped` on 332 of 343 modifiers and `open: <item>` on 11, each under
  C-61, C-64, C-67, C-69 or B-63r. Unique units are C-78,
  unique infrastructure C-79 and C-69.
  - THE AGENDAS — DLL-scored against an opinion scale neither engine has
    (C-76).
  - UNREAD DLL LOGIC, recorded: whether Trajan's grant fires on a CONQUERED
    city (founding ships); whether Iteru's flood avoid also skips the
    fertility half; whether the Knarr's Ocean clause reaches a Trader's
    course (`tradeWaterLevel` stays Cartography-gated); the Great Turkish
    Bombard's strike on a city.
  - THE ROCK BAND's four venue clauses (`Expansion2_UnitPromotions.xml`:
    Arena Rock / Street Carnival, Reggae Rock / Copacabana, Glam Rock /
    Acropolis, Surf Band / Royal Navy Dockyard) — each a `BAND_VENUE_BIT`
    whose district C-79 or C-69 does not yet hold.
  - The engine has no resource VISIBILITY, so the Stave Church counts every
    coastal resource where the install counts the visible ones.
  - The site census (`tests/cpu/seats/combat-rows.test.ts`,
    `tests/gpu/combat_rows_test.py`) allowlists one unpaid site: a CITY's
    own ranged strike composes its defender without the roster's rows
    (`cityStrikeStrength`'s block in `seatPhase`).
- **C-31. THE NUCLEAR STRIKE'S LAST CLAUSES.** Weight 1.
  - WHICH DELIVERY A COVER STOPS. The page's own rule ships — "Destroyers,
    Battleships, Missile Cruisers, and Mobile SAMs can protect adjacent
    tiles from nuclear strikes", deterministically, the device spent either
    way (`nukeInterceptor` / `_nuke_intercepted`). What the community tests
    add and no published text carries is the per-DELIVERY split (a silo
    answering to the Gun AA, the Battleship and the SAM; a submarine to the
    SAM alone) and the BOMBER's own threshold, its drop stopped when the
    interception takes it under 50% HP — which needs the interception
    DAMAGE the install never publishes (C-34). Until that is sourced the
    page's list answers every delivery alike.
  - THE CITIZENS A BLAST KILLS wait on C-77.
  - A WONDER IN THE BLAST — ask 8.
- **C-33. THE GIANT DEATH ROBOT'S RANGE.** Weight 1.
  - The five-hex Range is a verb the action space lacks; no direction
    encoding reaches five hexes.
- **C-34. AIR COMBAT'S SECOND HALF.** Weight 2.
  - INTERCEPTION BY A FIGHTER has no published strength, formula or cap on
    attempts; PATROL waits on it; C-31's delivery shares the half.
  - PRIORITY TARGET (the Jet Bomber's reach to the support unit under a
    stack) — unsourced magnitude.
- **C-35. THE DROWNED GROUND IS COAST.** Weight 2.
  - SOURCED (the install's pedia, Sea Level Rise): submerged tiles "become
    coastal water tiles". Both engines keep terrain, feature and river edges
    underneath (`Tile.submerged` / `_submerge`) so a drowned Woods still
    lends adjacency. Every ring fact the exporter derives (`isCoastalLand`,
    the Seaside Resort's coast, fresh water, the Aqueduct's source, district
    adjacency's WOODS/RAINFOREST/REEF sources) must read a submerged tile
    as coast on both engines.
- **C-38. A CITY-STATE'S CITY.** Weight 2.
  Its yields ride the shared walk; Production, Science and Culture are
  spent, Food, Gold and Faith are not.
  - FOOD: the population keeps its 12-turn clock and the border never grows.
    Does a city-state's city grow on the food box and claim tiles on
    Culture as a major's does (the install has one city rule), and what
    does its citizen work?
  - GOLD AND FAITH bank in `CityState.treasury` / `.faith`. What does the
    install let a city-state spend them on?
  - POWER: C-1's minor arm, due when the ladder reaches a load.
  - Foreign Investor and Affluence (B-24r) wait on a minor that improves
    and accumulates.
- **C-41. VOLCANIC SOIL.** Weight 1.
  - WHERE an eruption lays it — ask 2. The carrier (`addFeature` /
    `_add_feature`) is in.
- **C-45. THE QUEUE'S DEPTH.** Weight 1.
  - `PRODUCTION_QUEUE_MAX` 5 is `sim.QD`, a tensor dimension — ask 3.
- **C-49. NAMED STORMS.** Weight 1.
  - THE WALK: `Movement 8` on every storm row is DLL logic; a storm stays on
    its centre for its three turns. How does it choose a heading and how far
    does it move per turn?
- **C-60. THE FREE CITY'S OWN PLAY.** Weight 2.
  The seat is in on both engines (revolt, race, join, Eleanor's skip, open
  to attack). Each bullet is an exact question, no magnitude to invent:
  - ITS DEFENCE: the pedia says it "will repair pillaged improvements and
    spawn units to defend itself, and may build walls" and "will try to
    retaliate". No XML row names the unit, the cadence or the walls; its
    strike needs a target rule. Today: floor-15 defence plus the walls it
    revolted with, healing 20 a turn.
  - ITS AMENITIES: the tier is computed per OWNER (`computeCityStats` with
    the seat's luxuries and policies) and the Free Cities player has none.
    What does the install give a Free City?
  - THE RELIGION WALKS skip the free row (`allCities`, the GPU's
    `[:, :n_majors]` pressure rows): no pressure in or out, no Missionary
    spread. The same class of widening as the loyalty walk took.
- **C-61. THE COTHON'S PROJECT.** Weight 1.
  - The gate and `moveCapital` / `_move_capital` are in. When C-79 lands the
    Cothon the row is `{ id: 'COTHON_CAPITAL_MOVE', district: 'COTHON', civ:
    'PHOENICIA', movesCapital: true, cost: 100 }` plus
    COST_PROGRESSION_GAME_PROGRESS 1500 (no existing project takes that
    curve — source its formula first) and the "they founded" gate
    (`founderSeat` / `city_founder`).
- **C-64. A SEAT HAS NO MAJORITY RELIGION.** Weight 1.
  - Three ledger rows wait (`TRAIT_CITY_STATE_TOKEN_SAME_RELIGION`,
    `TRAIT_COMBAT_BONUS_OTHER_RELIGION`,
    `TRAIT_GAINS_FOUNDER_BELIEF_MAJORITY_RELIGION`). The carrier is a
    per-seat majority over its cities' followed religions on both engines;
    the tie rule is ask 6.
- **C-67. A DIPLOMATIC ACTION HAS NO PREFERENCE WEIGHT.** Weight 1.
  - `TRAIT_BEFRIEND_MINOR_CIV_HOME_CONTINENT` and
    `TRAIT_NO_WAR_MINOR_CIV_HOME_CONTINENT` are DLL AI weightings; a
    preference needs a decider with alternatives — P8's, not a carrier's.
- **C-69. FIVE UNIQUE ROWS WITH TRAIT CLAUSES.** Weight 2.
  - Kongo's M'banza (district), England's Royal Navy Dockyard (district),
    Georgia's Tsikhe (building), Spain's Mission (improvement) and
    Phoenicia's Cothon (district, C-61's PrereqDistrict) have no catalog
    row; `TRAIT_FREE_APOSTLE_FINISH_MBANZA`,
    `TRAIT_ROYAL_NAVY_DOCKYARD_NAVAL_UNIT`, `TRAIT_TSIKHE_PRODUCTION` and
    `TRAIT_MISSION_IDENTITY_PER_TURN_MODIFIER` wait on them.
  - The Dockyard's granted unit is NAMED by its row on both engines;
    nothing picks the strongest naval unit of a class the way
    `bestTrainableOfClass` picks a land one.
- **C-74. PER-GAME COUNTS OVER PER-OBJECT ROLLS.** Weight 1.
  - `ERUPTION_CHANCE_PER_VOLCANO` is not covered by the MODERATE / 500
    ruling: the install counts eruptions per GAME, this engine rolls per
    VOLCANO; C-1's reactor is the same shape. Ask 7.
- **C-76. NO OPINION SCALE BETWEEN MAJORS.** Weight 2.
  - The install's DiplomaticStates table names the scale (Allied 100 ...
    Denounced 16, War 0, `RelationshipLevel`); what moves it is DLL. The
    carrier is a compared per-directed-pair opinion on both engines with
    those anchors; the deltas are ask 9.
  - Waiting on it: the mission's mark, DEMAND, DISCUSS and its promises,
    the Retribution casus belli (C-2); the agendas (C-26); the preference
    weights (C-67).
- **C-77. THE WORKED-TILE PICK IS UNEXPOSED.** Weight 1.
  - `assignWorkedTiles` and the GPU walk's `topk` derive the pick inside the
    yield walk; nothing stores or compares it. The carrier is one exposed
    reader per engine and a compared per-city worked-tile list. C-31's
    "Citizens 'working' the affected tiles are eliminated" waits on it.
- **C-78. UNIQUE UNITS ABSENT.** Weight 1.
  - Every one of the 34 civilizations names a unique chassis now — 31 rows
    with their abilities and pins on both engines. What is left is the nine
    LEADER units (Rough Rider, Black Army, ...), the blank rows of
    `docs/ROSTER.md`.
  - Two halves of a built row wait on another entry: the Ngao Mbeba's "can
    see through features" needs the sight-BLOCKING this engine does not
    model (B-56r), and the Toa's Pā improvement needs C-79's row.
- **C-79. UNIQUE INFRASTRUCTURE ABSENT.** Weight 5.
  - Five of 36 have a catalog row (the Bath as a `civVariants` entry, the
    Stave Church's `civ`, the Sphinx, Terrace Farm and Ziggurat's
    `uniqueTo`). Beside C-69's five, 26 do not — each a district, building
    or improvement row with its placement, adjacency and yields off the
    install, on both engines and the exporter: Film Studio, Madrasa, Street
    Carnival and Copacabana, Ice Hockey Rink, Great Wall, Mekewap, Château,
    Hansa, Acropolis, Thermal Bath, Stepwell, Electronics Factory, Seowon,
    Suguba, Marae, Pā, Chemamull, Ordu, Polder, Grand Bazaar, Lavra, Golf
    Course, Kurgan, Open-Air Museum, Ikanda.
  - The Rock Band's venue bits (C-26) and the Cothon's project (C-61) read
    rows from this list.

## Harness — not weighted

- **THE DRIVER NEEDS A REAL STYLE MECHANISM.** A style is one boolean read
  at a single `if` inside `pick_research`. Wanted: NAMED KNOBS whose
  defaults reproduce today's picks exactly (research depth, production tier
  order, war appetite, expansion appetite, faith/culture lean, naval lean);
  PRESETS built from the knobs, assignable per actor as data; an assignment
  policy off the per-(seed, seat) stream or a table; CLI selection on the
  probe and the gate. The bar is the probe diff: a preset earns its place by
  ADDING reached rows without losing any. B-24r's fourth card style is the
  first customer.
