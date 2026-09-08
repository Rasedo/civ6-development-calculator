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
| B-24r governor tails | 2 | a district PURCHASE verb, the Fishery and City Park improvements, a fourth card style, Foreign Investor and Affluence on C-38, five clauses on C-1/C-31/C-34 |
| B-31r trade-route tails | 1 | plunder gold unsourced; chain depth is an ask; free-choice destination head is P8 |
| B-34r flood tails | 1 | coastal floods; the Egyptian and Soothsayer halves |
| B-51r Encampment pool on capture | 1 | ask |
| B-54r unique-unit flank/support stacks | 1 | Impi and Hypaspist, once C-78 seats them |
| B-56r inert promotions | 1 | Boarding SHIPPED; the sight table needs a WALK ruling (ask 13); Ground Crews waits on a PATROL that is no data row at all |
| B-61r Great Person clauses with no carrier | 2 | ten `open: B-61r` ledger rows |
| B-62r suzerain adjacency at a wonder tile | 1 | unsourced either way |
| B-66 formations | 1 | a THREE-member escort, the rider's own reveal |
| B-67 district price progression | 1 | GAME_PROGRESS curve for five districts, DLL-side |
| B-D unsourced data values | 1 | Democracy's route pays only its own city; per-city war weariness (DLL), GAME_SPEED shape, unit faith rate |
| **B. Fidelity vs real Civ 6** | **17** | |
| C-1 power | 1 | accident roll and damage tables (sourced, on ask 6), a minor's grid when C-38 gives one a load |
| C-2 diplomatic agreements | 2 | joint war, join war, research agreement, a luxury lump; mark/demand/discuss on C-76; what a mid-build purchase does to the hammers is an ask |
| C-16 the spy's second half | 1 | how the four UnitOperations probability columns compose; a Free City as spy ground |
| C-20 Mountain Tunnel's route multiplier | 1 | DLL-side magnitude |
| C-22 Preserve housing table | 1 | middle bands stylized |
| C-26 civilization abilities, the residue | 1 | agendas (C-76), four unread DLL clauses, the Rock Band's venue bits (C-79) |
| C-31 the nuclear strike's last clauses | 1 | the per-delivery split and the bomber's 50%-HP threshold (both on C-34's unpublished damage), citizens killed, wonder in the blast (ask) |
| C-33 Giant Death Robot's Range | 1 | a five-hex verb the action space lacks |
| C-34 air combat's second half | 2 | fighter interception and Patrol (unsourced roll), Priority Target |
| C-35 drowned ground is COAST | 0 | CLOSED — every ring fact reads a submerged tile as coast on both engines |
| C-38 a city-state's city | 1 | growth and border are in; what it SPENDS gold and faith on is ask 11 |
| C-41 Volcanic Soil | 1 | where an eruption lays it is an ask |
| C-45 queue depth five | 1 | ask |
| C-49 named storms | 1 | the storm's walk (DLL) |
| C-60 the Free City's own play | 1 | two owner rulings and nothing to build: its units/walls/retaliation, its amenities |
| C-64 majority religion | 1 | a per-seat majority read; the tie rule is an ask |
| C-67 diplomatic preference weights | 1 | waits on a decider with alternatives (P8) |
| C-69 two unique rows with trait clauses | 0 | CLOSED — the Tsikhe and the Mission shipped with C-79's rows |
| C-74 per-game counts over per-object rolls | 1 | ask (volcanoes and reactors) |
| C-76 an opinion scale | 2 | a compared per-pair opinion on both engines; what moves it is an ask |
| C-78 unique UNITS absent | 1 | all 31 civilization uniques are built; the nine LEADER units are left, and two clauses wait on B-56r and C-79 |
| C-79 unique INFRASTRUCTURE absent | 1 | every district, building and improvement is built; what is left is four clauses with no carrier |
| **C. Absent systems** | **31** | |
| **OPEN, TOTAL** | **37** | |

## The question ledger — owner asks, one line each

A question the SOURCE under-determines; neither engine ships a branch until
the owner rules or a primary source is reached. The ruling is written into
the entry and the line leaves.

1. **C-41 — where Volcanic Soil lands.** Which tiles an eruption paints,
   and whether an already-improved tile takes it — DLL.

2. **C-45 — the queue's depth.** Five is a tensor dimension. Acceptable, or
   name a depth?

3. **B-31r — the course's depth.** `ROUTE_CHAIN_MAX` 6, the same shape.

4. **B-51r — the Encampment's pool on a city capture.** `city_outer_hp`
   zeroes; the district's own pool rides through. No rule reached.

5. **C-64 — the majority-religion tie.** Two religions in equal cities; no
   source names the winner.

6. **C-74 / C-1 — per-GAME counts over per-OBJECT rolls.** The install
   counts eruptions and reactor accidents per game; this engine rolls per
   volcano and would roll per reactor. PROPOSAL: divide the per-turn rate
   by the map's count of objects at risk.

7. **C-31 — a wonder in a nuke's blast.** Pillaged or not: unsourced.

8. **C-76 — the opinion deltas.** The install names every
   `LOC_DIPLO_MODIFIER_*` and publishes no amount; forum figures cite
   nothing. The ANCHORS are fully sourced (100 / 83 / 66 / 50 / 33 / 16 / 0,
   with a `DiplomaticYieldBonus` beside each); what no source gives is what
   MOVES a pair between them. Ruling this unblocks the whole of C-76 at once
   — a carrier without deltas is a constant, so neither half can ship
   alone.

9. **C-2 — what a mid-build gold purchase does to the hammers.** One
    tested report says a UNIT keeps its progress and a BUILDING's is wasted;
    this engine banks both, on the standing rule that hammers never burn.
    One forum post against a principle — the owner's call.

10. **Two city-state names this roster invented.** "Venice" and "Bandar
    Brunei" are not Civ 6 city-states. Their bonuses are AMSTERDAM's (base;
    Antioch carries the same text in Expansion1) and JAKARTA's. Both
    MECHANICS are built and sourced; only the names are wrong. Renaming
    them touches `seeder/place.ts`, which is hashed into `genStamp`, so the
    fix costs a reseed and a fresh `worlds.lock`. Rename, or keep the names?

11. **C-38 — what a city-state SPENDS on.** Its Gold and Faith bank and
    nothing draws on them. `GlobalParameters.xml` carries five MINOR knobs
    and all five are placement; no XML row anywhere names a city-state
    purchase, build weight or reserve. Leave them banking, or name a rule?

12. **C-16 — a Free City as spy ground.** The install carries NO data gate:
    the ten `UnitOperations` spy rows name a `TargetDistrict` and nothing
    else, and no requirement set anywhere keys on `CivilizationLevels`.
    Which cities a spy may travel to is DLL. Both engines walk the major
    rows today. Open the Free City to spies, or leave it closed?

13. **B-56r — how sight is SPENT.** `SightThroughModifier` (Woods,
    Rainforest, Hills 1; Mountains and the great natural wonders 2) and
    `SightModifier` (Hills +1, Mountains +2) are published; the WALK is not.
    Two readings fit the columns: a sight BUDGET spent along the hex path, or
    a radius with tiles occluded BEHIND a blocker. They differ on every map
    with a ridge, so neither engine ships one until this is ruled.

14. **C-60 — a Free City's amenities.** The tier is computed per OWNER, off
    the seat's luxuries and policies, and the Free Cities player has none —
    so every Free City sits at the bottom band forever. `CivilizationLevels`
    has no amenity column and no XML row names one. Give the free row a
    fixed tier, or let the bottom band stand?

15. **C-60 — a Free City's defence.** "Will repair pillaged improvements
    and spawn units to defend itself, and may build walls", "will try to
    retaliate". No XML row names the unit, the cadence or the walls, and
    its strike needs a target rule. Name them, or leave the floor-15
    defence and the walls it revolted with?

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
- **B-24r. GOVERNOR TAILS.** Weight 2.
  - A district PURCHASE verb (gold and faith) — Contractor and Divine
    Architect wait on it; no engine has the verb.
  - The FISHERY and CITY PARK SHIPPED with #242m, and with them Aquaculture
    and Parks and Recreation, which had carried empty effects since governors
    landed. Both are LIANG's, not Reyna's, and each promotion OPENS the row
    in its own city rather than merely paying it — which is why the install
    writes the plot yield as a second, separate modifier: the improvement
    stands after the governor leaves and that payment stops.
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
  - `ROUTE_CHAIN_MAX` 6 is a capacity choice — ask 3.
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
  Three of 107 rows in `cpu/data/promotions.ts` carry `none`. A 2026-09-08
  sourcing pass found a published rule behind all three:
  - SENTRY — `SENTRY_SEE_THROUGH_FEATURES`,
    `MODIFIER_PLAYER_UNIT_ADJUST_SEE_THROUGH_FEATURES`, `CanSee = true`. A
    BOOLEAN over a published table: `SightThroughModifier` costs 1 more per
    Woods, Rainforest or Hill and 2 per Mountain or great natural wonder,
    and `SightModifier` pays +1 standing on Hills, +2 on a Mountain. Both
    engines reveal a flat radius today. The TABLE is data; what the install
    does not publish is the WALK — a sight BUDGET spent along the path, or a
    radius with occlusion behind a blocker. Ask 16.
  - GROUND_CREWS — `GROUND_CREWS_BONUS_HEALTH`,
    `MODIFIER_PLAYER_UNIT_GRANT_HEAL_AFTER_ACTION`, and NO amount: the
    modifier type is the whole rule, so the engine's own healing supplies the
    number. PATROL turns out to be no data row at all (C-34).
  - BOARDING SHIPPED with #242n. PercentDefeatedStrength 100, YIELD_GOLD,
    against an opponent of DOMAIN_SEA. It was never a missing mechanic — but
    it was not the seat-level POST_COMBAT_YIELD_ROWS channel either, because
    the promotion belongs to the KILLING UNIT. It became a NAVAL_KILL_GOLD
    promotion kind read at the kill event, which taught the GPU's
    `_unit_kill_event` the killer's promo word: four of its eight call sites
    already held it for the `_disciples_spread` standing right beside them,
    and the other four are a city's shot or a nuke, where TS passes no killer
    either.
- **B-61r. GREAT PERSON CLAUSES WITH NO CARRIER.** Weight 2.
  - Ten `open: B-61r` rows in `docs/roster_ledger.json`: tourism x4,
    regional range x2, city-state absorption, barbarian conversion, ocean
    passage, Tupac Amaru's per-district grant walk.
- **B-62r. A SUZERAIN IMPROVEMENT'S ADJACENCY AT A WONDER TILE.** Weight 1.
  - `tileYields` leaves on `tile.wonder` before the adjacency add and
    `_tile_add_live` masks the same tiles; whether real Civ 6 pays it there
    is unsourced either way.
- **B-63r. THE GANG-UP BAR.** RETIRED 2026-09-08 (owner ruling).
  - `GRIEVANCE_GANG` was filed as an ask on the reading that it reproduces a
    Civ 6 AI threshold. It does not: it has exactly ONE reader per engine and
    that reader is the OBSERVATION renderer (`observe.ts` / `env.py`, the
    `cv` block's `gang` field), consumed only by this project's own driver
    heuristic. No engine rule reads it and no state moves on it, so there is
    no fidelity question to source. It stays on the wire because the
    observation must be identical on both engines — a parity requirement the
    value cannot break.
  - Enkidu's allied-war discount, which this entry wrongly said waited on the
    bar, SHIPPED with #242j: `Discount` 150 forgiven at a declaration on a
    foe of the declarer's ally.
  - NOT converted into a new ask, recorded instead: `gang` is the only
    grievance signal anywhere in the observation, so one hand-set bar is the
    whole resolution the policy gets on a subsystem with fourteen sourced
    magnitudes feeding it. Whether to hand it `grievancesAgainst / SCALE` is
    a P8 feature-design choice.

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
    (`City.reactorAge` / `city_reactor_age`); the roll waits on ask 6.
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
  - JOIN ONGOING WAR SHIPPED with #242k, as a WAR KIND rather than an
    agreement: `DIPLOACTION_THIRD_PARTY_WAR` publishes every column a kind
    needs (`InitiatorPrereqCivic` CIVIC_FOREIGN_TRADE, no
    `DenouncementTurnsRequired`, 100 / 100 / 300), and `Agreement="true"`
    says how the UI reaches it, not what it costs.
  - JOINT WAR is the same row column for column; the only thing separating
    them is that its target is not yet at war, which needs a TWO-SIDED
    agreement object the deal table does not carry. `DEAL_ITEM_KINDS` has no
    war item; a joint war is one seat's offer that binds the other's
    declaration next turn, so the item has to survive a turn boundary and
    apply to a seat that did not choose it.
  - RESEARCH AGREEMENT: the GATE is published and the PAYOUT is not.
    `InitiatorPrereqTech` and `TargetPrereqTech` are both
    TECH_SCIENTIFIC_THEORY, `NoCurrentResearchAgreement` makes it one live
    agreement per pair, and Worth/Cost rows exist ONLY at DIPLO_STATE_ALLIED
    (40) and DIPLO_STATE_DECLARED_FRIEND (20) — so the state floor is data,
    not lore. What no row anywhere carries is how much science it pays or
    how long it runs; `Duration` is absent from the row.
  - ASK-FOR-PROMISE waits on C-76.
  - A LUXURY HAS NO LUMP TO TRADE: a luxury is a boolean access gate; the
    RESOURCE item names a strategic only. This is a MODEL choice, not a
    missing datum — the install trades the resource and its ACCESS, never an
    amount of a luxury, so there is nothing to source and the entry keeps it
    only as a note.
  - A MISSION LEAVES NO MARK ("a small positive bonus in your
    relationship"), DEMAND and DISCUSS (the four promises of
    `Expansion2_DiplomaticActions.xml`, FavorCost 30, GrievancesForRefusal
    25, GrievancesPerIncursion 25) and the WAR OF RETRIBUTION's
    RequiresBrokenPromise all wait on C-76.
  - Readings with no source, identical on both engines: the intel bonus is
    unit-against-unit only; one running deal per ordered pair, `DEAL_ITEMS`
    a side, an offer standing two turns; a war does not end a standing deal;
    and the Third Party War's "another player" read as an ALLY, because
    consent is what `Agreement="true"` means and an alliance is the only
    relationship this engine holds that says "would agree with me" — the
    install itself attaches the ally relationship to this situation when it
    writes Enkidu's trait as "anyone at war with their allies".
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
    a spy's ground, and the install carries no data gate to say whether that
    is right — ask 12.
- **C-20. THE MOUNTAIN TUNNEL'S ROUTE MULTIPLIER.** Weight 1.
  - "Trade Routes traveling through it can multiply the Gold they get from
    districts at their destination" — no published magnitude, DLL-side.
- **C-22. THE PRESERVE'S HOUSING TABLE.** Weight 1.
  - `PRESERVE_APPEAL_HOUSING` / `preserveHousing` state the published
    ceiling at Breathtaking; the middle bands are this model's own.
  - UNREACHABLE FROM THE OWNER'S INSTALL, which is Gathering Storm: the
    Preserve is a New Frontier Pass district and no `PRESERVE` row exists in
    Base, Expansion1 or Expansion2. This is not "unpublished" — it is a row
    the primary source does not contain, which no further sourcing can fix.
    The same is true of the Ngao Mbeba (no `MBEBA` anywhere in the install),
    so a sweep of which roster members this install cannot source belongs
    with the hygiene pass.
- **C-26. CIVILIZATION ABILITIES — THE RESIDUE.** Weight 1.
  The census is `docs/ROSTER.md`; the ledger `docs/roster_ledger.json` reads
  `shipped` on 338 of 343 modifiers and `open: <item>` on 5, each under C-64
  or C-67. Unique units are C-78, unique infrastructure C-79 and C-69.
  - THE AGENDAS — DLL-scored against an opinion scale neither engine has
    (C-76).
  - UNREAD DLL LOGIC, recorded: whether Trajan's grant fires on a CONQUERED
    city (founding ships); whether Iteru's flood avoid also skips the
    fertility half; whether the Knarr's Ocean clause reaches a Trader's
    course (`tradeWaterLevel` stays Cartography-gated); the Great Turkish
    Bombard's strike on a city.
  - THE ROCK BAND's four venue clauses (`Expansion2_UnitPromotions.xml`:
    Arena Rock / Street Carnival, Reggae Rock / Copacabana, Glam Rock /
    Acropolis, Surf Band / Royal Navy Dockyard) — all four venues are built
    now; what is left is reading the promotion's own venue bit.
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
  - THE CITIZENS A BLAST KILLS: buildable — C-77 exposed the pick, so
    `city.workedTiles` / `_worked_tiles(row)` now name who is standing in
    the blast. What is unsourced is HOW MANY die per ring, which is ask 7's
    neighbour.
  - A WONDER IN THE BLAST — ask 7.
- **C-33. THE GIANT DEATH ROBOT'S RANGE.** Weight 1.
  - The five-hex Range is a verb the action space lacks; no direction
    encoding reaches five hexes.
- **C-34. AIR COMBAT'S SECOND HALF.** Weight 2.
  A 2026-09-08 sourcing pass split this entry: four of its five items are
  data and only the interception ROLL is DLL.
  - THREE OF THE FOUR ALREADY SHIPPED, and an earlier draft of this entry
    said otherwise — the sourcing pass called them "buildable" without
    checking the catalog. `cpu/data/promotions.ts` has carried DOGFIGHTING +7
    vs AIR_FIGHTER, INTERCEPTOR +7 vs AIR_BOMBER and DROP_TANKS RANGE +2
    since the air trees landed, and all three match the install exactly. Read
    the catalog before calling a row absent.
  - AIR DEFENSE INITIATIVE SHIPPED with #242o: Victor's, level 3 behind
    Embrasure, +25 to an ANTI-AIR unit defending inside the governed city's
    territory. No new machinery — the anti-air strength already answers an
    air strike, and the territory test is Garrison Commander's.
  - INTERCEPTION BY A FIGHTER has no published strength, formula or cap on
    attempts; C-31's delivery shares the half.
  - PATROL IS NOT A DATA ROW. There is no `UNITOPERATION_PATROL`, no
    `UNITCOMMAND_PATROL` and no promotion named for it; the air operations
    are `AIR_ATTACK`, `REBASE` and the repair family. It is the UI's name for
    a fighter sitting ready, so the verb an engine would need is an INTERCEPT
    STANCE whose whole behaviour is the unpublished roll above.
  - PRIORITY TARGET (the Jet Bomber's reach to the support unit under a
    stack) — no such promotion exists in this install either; the row came
    from elsewhere, like the Preserve and the Ngao Mbeba (C-22).
- **C-35. THE DROWNED GROUND IS COAST.** CLOSED.
  - SOURCED (the install's pedia, Sea Level Rise): submerged tiles "become
    coastal water tiles". Both engines keep terrain, feature and river edges
    underneath on purpose, so the mask is at the READ: `ringTerrain` and
    `ringFeature` on TS, `~tile_submerged` on the GPU's source counters. A
    drowned tile now lends the SEA's sources and none of the ground's — the
    same reasoning `submergeTile` already applied to the RESOURCE.
  - The ring both ways: a drowned tile IS coastal water while it still
    touches land, and every land neighbour of it becomes coastal land, with
    the water Housing that carries.
  - The Aqueduct's source was a BAKED derivation of a fact the sea can move
    (a drowned oasis). The atom it is made of (`aqown`) is exported beside
    it, both are `_MUTABLE` now, and the derivation is REBUILT over the ring
    rather than left stale — TS recomputes on every read, so only the GPU
    could go stale, and the climate poke pins the rebuild.
- **C-38. A CITY-STATE'S CITY.** Weight 1.
  Its yields ride the shared walk, and now so do the two rules that walk
  feeds.
  - FOOD AND CULTURE ARE IN. The install has ONE city rule, so the minor's
    city grows on its FOOD BOX and claims ground on its CULTURE BOX through
    the majors' own composers (`seatGrowth`, `cityBorderGrowth` /
    `_seat_city_growth`, `_seat_border_growth`). The 12-turn population clock
    is gone from both engines, and the minor's population and three boxes are
    compared state.
  - GOLD AND FAITH still only bank in `CityState.treasury` / `.faith`.
    `GlobalParameters.xml` holds five MINOR knobs and every one is PLACEMENT
    (`START_DISTANCE_*`, `WARMONGER_FINAL_MINOR_CITY_MULTIPLIER`); there is no
    city-state economy parameter of any kind, so what it spends them on is
    DLL AI with no data behind it — ask 11.
  - POWER: C-1's minor arm, due when the ladder reaches a load.
  - Foreign Investor and Affluence (B-24r) wait on a minor that improves and
    accumulates.
- **C-41. VOLCANIC SOIL.** Weight 1.
  - WHERE an eruption lays it — ask 1. The carrier (`addFeature` /
    `_add_feature`) is in.
- **C-45. THE QUEUE'S DEPTH.** Weight 1.
  - `PRODUCTION_QUEUE_MAX` 5 is `sim.QD`, a tensor dimension — ask 2.
- **C-49. NAMED STORMS.** Weight 1.
  - THE WALK: `Movement 8` on every storm row is DLL logic; a storm stays on
    its centre for its three turns. How does it choose a heading and how far
    does it move per turn?
- **C-60. THE FREE CITY'S OWN PLAY.** Weight 1.
  The seat is in on both engines (revolt, race, join, Eleanor's skip, open
  to attack, and since #242i the religion walk). NOTHING BUILDABLE REMAINS —
  both bullets are owner rulings, with no magnitude either engine could
  invent:
  - ITS DEFENCE — ask 15. Today: floor-15 defence plus the walls it
    revolted with, healing 20 a turn.
  - ITS AMENITIES — ask 14.
- **C-64. A SEAT HAS NO MAJORITY RELIGION.** Weight 1.
  - Three ledger rows wait (`TRAIT_CITY_STATE_TOKEN_SAME_RELIGION`,
    `TRAIT_COMBAT_BONUS_OTHER_RELIGION`,
    `TRAIT_GAINS_FOUNDER_BELIEF_MAJORITY_RELIGION`). The carrier is a
    per-seat majority over its cities' followed religions on both engines;
    the tie rule is ask 5.
- **C-67. A DIPLOMATIC ACTION HAS NO PREFERENCE WEIGHT.** Weight 1.
  - `TRAIT_BEFRIEND_MINOR_CIV_HOME_CONTINENT` and
    `TRAIT_NO_WAR_MINOR_CIV_HOME_CONTINENT` are DLL AI weightings; a
    preference needs a decider with alternatives — P8's, not a carrier's.
- **C-69. TWO UNIQUE ROWS WITH TRAIT CLAUSES.** CLOSED.
  - Every row is built. The three DISTRICTS — Kongo's M'banza with its free
    Apostle, England's Royal Navy Dockyard with the strongest hull the seat
    can train, Phoenicia's Cothon — then Georgia's Tsikhe (whose +50%
    Production is Strength in Unity's own RENAISSANCE_WALLS row, since the
    Tsikhe IS that building here) and Spain's Mission (+2 Loyalty to a city
    beside one, off the capital's continent).
- **C-74. PER-GAME COUNTS OVER PER-OBJECT ROLLS.** Weight 1.
  - `ERUPTION_CHANCE_PER_VOLCANO` is not covered by the MODERATE / 500
    ruling: the install counts eruptions per GAME, this engine rolls per
    VOLCANO; C-1's reactor is the same shape. Ask 7.
- **C-76. NO OPINION SCALE BETWEEN MAJORS.** Weight 2.
  - THE ANCHORS, in full (Base `DiplomaticActions.xml`, `DiplomaticStates`).
    A second published column the entry had not recorded rides beside the
    scale:

        state              RelationshipLevel   DiplomaticYieldBonus
        ALLIED                    100                   50
        DECLARED_FRIEND            83                   25
        FRIENDLY                   66                   25
        NEUTRAL                    50                    0
        UNFRIENDLY                 33                  -25
        DENOUNCED                  16                  -75
        WAR                         0                 -100

    This engine already holds four of the seven as explicit facts — WAR,
    DENOUNCED, DECLARED_FRIEND and ALLIED. FRIENDLY, NEUTRAL and UNFRIENDLY
    are exactly the bands an OPINION lands in, which is why they do not
    exist here.
  - THE CARRIER IS NOT SEPARABLE FROM THE DELTAS (2026-09-08). A per-pair
    opinion built now would be initialised at NEUTRAL 50 and never move, so
    it would be a compared plane holding a constant and three unreachable
    bands — dead state, not a carrier. Both halves land together or neither
    does, so C-76 is BLOCKED on ask 8 rather than half-buildable.
  - What `DiplomaticYieldBonus` is paid IN is not published either; the
    column sits on the state row and the leaders' own
    `MODIFIER_PLAYER_ADD_DIPLOMATIC_YIELD_MODIFIER` is a separate channel.
  - Waiting on it: the mission's mark, DEMAND, DISCUSS and its promises,
    the Retribution casus belli (C-2); the agendas (C-26); the preference
    weights (C-67).
- **C-78. UNIQUE UNITS ABSENT.** Weight 1.
  - Every one of the 34 civilizations names a unique chassis now — 31 rows
    with their abilities and pins on both engines. What is left is the nine
    LEADER units (Rough Rider, Black Army, ...), the blank rows of
    `docs/ROSTER.md`.
  - One half of a built row waits on another entry: the Ngao Mbeba's "can see
    through features" needs the sight-BLOCKING this engine does not model
    (B-56r). The Toa's Pā shipped with C-79.
- **C-79. UNIQUE INFRASTRUCTURE ABSENT.** Weight 1.
  - EVERY ROW IS BUILT. Twelve DISTRICTS, each a `civVariants` entry on the
    row it replaces with its own adjacency set and half its price (Acropolis,
    Hansa, Seowon, Suguba, Lavra, Ikanda, M'banza, Royal Navy Dockyard,
    Cothon, Street Carnival, Bath, Copacabana); nine BUILDINGS merged over
    their base rows by one composer per engine (Film Studio, Madrasa,
    Electronics Factory, Ordu, Tsikhe, Grand Bazaar, Marae, Thermal Bath,
    Stave Church); and twelve IMPROVEMENTS with their placement columns and
    adjacency rows (Château, Chemamull, Golf Course, Great Wall, Ice Hockey
    Rink, Kurgan, Pā, Mekewap, Mission, Open-Air Museum, Polder, Stepwell),
    beside the Sphinx, Terrace Farm and Ziggurat already in.
  - FOUR CLAUSES HAVE NO CARRIER IN THIS ENGINE, and each is recorded on the
    column that names it rather than invented:
    - the Great Wall's and the Pā's `PLOT_DAMAGE_TO_WALKING_INTO` /
      `_ADJACENT` (10 each) — damage on ENTERING a tile is unit-movement
      machinery this engine does not have (C-33);
    - the Film Studio's "+100% Tourism pressure ... towards other
      civilizations in the Modern era" — a per-PAIR tourism pressure;
    - the Electronics Factory's "+4 Culture after Electricity" — a
      TECH-gated building yield the catalog has no column for, and the
      Marae's and the Thermal Bath's per-tile Tourism thirds with it;
    - "Tiles with <row> cannot be swapped" (Golf Course, Open-Air Museum) —
      there is no tile-swap verb to refuse.
  - The Stepwell's "+1 Faith beside a Holy Site, +1 Food beside a Farm" has
    NO `Improvement_Adjacencies` row in the install: both halves are
    DLL-side, so they are recorded rather than invented.
  - LEY LINE adjacency is out of scope by construction: it is a Secret
    Societies resource class this engine's map never places, so every
    `LeyLine_*` row on a unique district is unreachable.

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
