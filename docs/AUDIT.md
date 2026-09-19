# Engine audit — open work

THIS FILE IS A LIST OF OPEN WORK. A resolved entry is DELETED, not
annotated; what was fixed, when and why is the git log's job (`git log -S
<id>` finds an entry's history). One weight and one OPEN list per entry;
every bullet is one of four things and says which:

- **BUILD** — buildable now from a sourced rule; names the symbols.
- **BLOCKER** — waits on another entry; names it.
- **ASK** — the source under-determines it; the owner rules (the ledger below).
- **LAB** — the live game answers it (`tools/civ6lab/SESSION2.md`, scene named).
- **DLL** — the install carries no number and the game exposes none; recorded
  so nobody re-runs the grep, and left stylized until a LAB scene can measure it.

**RULES (owner):**
- Anchor code BY SYMBOL, never by line number.
- VERIFY-BEFORE-IMPLEMENT against a real Civ 6 source: the owner's install
  (XML over civilopedia; Base <- Exp1 <- Exp2, take the last) first, the
  live game second, forums last. An unsourced magnitude is an ASK, never an
  invention.
- A gap deferred on an unbuilt mechanic is TWO open items: the mechanic and
  the gap naming it. "Recorded" and "descoped" are deferrals, never closures.
- Every new mechanic records which lane REACHES it; a green gate over an
  unreached mechanic proves nothing.
- When an entry closes, delete its row and its entry in the SAME commit.

**State:** P8 training PARKED until this file is empty.

## Open weight

Hand-weighted 1–8 by the size of what is LEFT to build. One row per entry,
no row without an entry. The rows are the source of truth; the subtotals
are their sum, and `python tools/audit_totals_check.py` (battery stage 0)
re-adds them.

| Open item | Weight | What is left |
|---|---|---|
| B-20r park orientation | 1 | no canonical vertical in this hex frame; a model choice |
| B-22r World Congress competitions | 1 | Aid Request (a gold-gift verb and a disaster trigger); the World Games' and Space Station's extra rewards |
| B-24r governor tails | 1 | Foreign Investor and Affluence wait on C-38; Renewable Subsidizer and Industrialist on C-1; Arms Race Proponent on C-31; a Dark Age card style is P8 |
| B-31r trade-route tails | 1 | `PLUNDER_ROUTE_GOLD` 50 is DLL; the destination's free choice is P8 |
| B-34r flood tails | 1 | coastal floods; the Egyptian and Soothsayer halves |
| B-51r Encampment pool on capture | 1 | ask 2 |
| B-54r unique-unit flank/support stacks | 1 | the Impi's and Hypaspist's own flank/support |
| B-56r inert promotions | 1 | Ground Crews waits on a PATROL that is no data row (C-34) |
| B-61r Great Person clauses with no carrier | 2 | ten `unmodelled` persons in `cpu/data/greatPeople.ts` |
| B-D unsourced data values | 1 | Democracy's destination half; per-city war weariness (DLL); GAME_SPEED shape; the unit faith rate |
| **B. Fidelity vs real Civ 6** | **11** | |
| C-1 power | 1 | the accident roll (sourced tables, on ask 4); a minor's grid when C-38 gives one a load |
| C-2 diplomatic agreements | 2 | joint war, research agreement; mark/demand/discuss on C-76 |
| C-16 the spy's second half | 1 | the escape's scale (ask 14), the counterspy term (LAB), a Free City as spy ground (ask 10) |
| C-20 Mountain Tunnel's route multiplier | 1 | DLL — the modifier carries no arguments |
| C-22 Preserve housing table | 1 | middle bands stylized; the row is not in this install |
| C-26 civilization abilities, the residue | 1 | agendas (C-76), four unread DLL clauses, the Rock Band's venue bits, resource visibility |
| C-31 the nuclear strike's last clauses | 1 | the per-delivery split and the bomber's threshold (on C-34's damage); citizens killed per ring and a wonder in the blast (ask 5) |
| C-34 air combat's second half | 2 | fighter interception (unsourced roll); Patrol and Priority Target carry no data |
| C-38 a city-state's city | 1 | what it SPENDS gold and faith on (ask 9); its grid (C-1) |
| C-41 Volcanic Soil | 1 | the proportion painted per severity, and the severity roll itself (LAB) |
| C-49 named storms | 1 | the per-step draw is inferred from resultants, not watched step by step (LAB) |
| C-60 the Free City's own play | 1 | its defence (ask 13), its amenities (ask 12) |
| C-64 majority religion | 1 | a per-seat majority read; the tie rule is ask 3 |
| C-67 diplomatic preference weights | 1 | waits on a decider with alternatives (P8) |
| C-74 per-game counts over per-object rolls | 1 | ask 4 (volcanoes and reactors) |
| C-76 an opinion scale | 2 | a compared per-pair opinion on both engines; what moves it is ask 6 |
| C-78 unique UNITS absent | 1 | the four leader units the roster leaves blank; the Ngao Mbeba's see-through clause |
| C-79 unique INFRASTRUCTURE absent | 1 | four clauses with no carrier (damage on entry, per-pair tourism pressure, a tech-gated building yield, a tile-swap refusal) |
| C-80 constants vs the install | 2 | two lab lines (purchase price, Pop Star); five rules the reader census names |
| **C. Absent systems** | **23** | |
| **OPEN, TOTAL** | **34** | |

## The question ledger — owner asks

A question the SOURCE under-determines; neither engine ships a branch until
the owner rules or the live game answers. A ruled or measured line is
written into its entry and leaves this list. Numbers are stable (the lab
scenes cite them), so the gaps are closed asks.

| ask | entry | the question | where the answer comes from |
|---|---|---|---|
| 2 | B-51r | a captured city's Encampment pool — zeroed, carried or healed? `city_outer_hp` zeroes; `Tile.encampOuterHp` / `encamp_outer_hp` rides through | LAB scene C |
| 3 | C-64 | the majority-religion TIE: two religions in equal cities, which wins? | LAB scene E (equal followers, equal cities, arrival order swapped) |
| 4 | C-74, C-1 | the install counts eruptions and reactor accidents PER GAME; this engine rolls per volcano / per reactor. Proposal: divide the per-turn rate by the count of objects at risk | LAB scene F says whether the game rolls per object (half); whether this engine mirrors that or scales a per-game rate is the owner's ruling |
| 5 | C-31 | a wonder in a nuke's blast — pillaged or not; and the per-ring kill proportion beside it | LAB scene D |
| 6 | C-76 | the opinion DELTAS. The anchors are sourced (100 / 83 / 66 / 50 / 33 / 16 / 0 with a `DiplomaticYieldBonus` each); the install publishes every `LOC_DIPLO_MODIFIER_*` name and no amount | LAB scene A (the diplomacy AI exposes each modifier with its score); the one line the game answers directly, and it unblocks all of C-76 |
| 9 | C-38 | what a city-state SPENDS gold and faith on. OBSERVED: it banks income minus upkeep and bought one defender when its army fell (~207 gold, 4 units -> 1); faith untouched. The magnitude — how few units triggers the buy, what it buys — needs a longer watch | LAB carry-over (a 30-turn watch) |
| 10 | C-16 | may a spy travel to a Free City? No data gate anywhere; both engines walk the major rows | LAB scene B |
| 12 | C-60 | a Free City's amenities: the tier is computed per OWNER and the free seat has no luxuries or policies, so it sits at the bottom band. `CivilizationLevels` has no amenity column | LAB scene B |
| 13 | C-60 | a Free City's defence: "spawns units to defend itself, may build walls, will try to retaliate" — no row names the unit, cadence or walls. Today: floor-15 defence plus the walls it revolted with, healing 20 a turn. One constraint found: its level row carries `IgnoresUnitStrategicResourceRequirements="false"` | LAB scene B |
| 14 | C-16 | the spy's ESCAPE: the install's terms are all levels (`ESPIONAGE_ESCAPE_BASE_CHANCE` 10, `_LEVEL_BOOST` +1, `_COUNTERSPY_LEVEL_MODIFIER` -1, `_POLICE_CORRECT_MODIFIER` -4, Ace Driver 4) and no row gives the SCALE or a route term; this engine's base is per route (Airplane 40 / Boat 50 / Vehicle 60 / Foot 70). One measured point (level 2, on foot, escaped) rules nothing out; socket-spawned spies crash the game on a capture | LAB carry-over (spies TRAINED in a city and travelled in) |

## A. Engine vs engine

No open entry. The digest is the only instrument for this class; a round
that widens what the gate reaches is worth more here than one that re-reads
the exporter, and a hunt catch opens an entry here only when it cannot
close in the same commit.
## B. Fidelity vs real Civ 6 — shipped mechanics with open tails

- **B-20r. A PARK'S ORIENTATION.** Weight 1.
  - ASK (not on the ledger — a model choice, no source will settle it): Civ 6 fixes the park rhombus's vertical; this hex frame has none, so every rhombus is offered. Nothing to build until a vertical is chosen.
- **B-22r. WORLD CONGRESS COMPETITIONS.** Weight 1.
  - BUILD — AID REQUEST, the one competition absent. Sourced: scores `FromGold` 1 per gold gifted, `FromProject` `PROJECT_SEND_AID` 200, `FromAtWar` -30, `FromBadCO2Footprint` -400; tiers 2 Diplomatic Victory points / 100 / 50 Favor. It needs a GOLD-GIFT verb (no engine can send gold to a named rival) and a disaster TRIGGER (the Congress does not vote it in).
  - BUILD — the World Games' and the Space Station's EXTRA rewards, published and unmodelled: tourism onto a first-place Campus and onto each tier's Stadiums and Aquatics Centers (2/2/1); space-race project production (+40% top tier, +20% bottom) and a first-place spaceship speed. A reward channel each engine lacks.
  - The Nobel Prize competitions are Sweden-only (C-26).
- **B-24r. GOVERNOR TAILS.** Weight 1.
  - BLOCKER C-38: Foreign Investor needs a minor that accumulates strategic resources; Affluence copies the ground's luxuries because a minor improves nothing.
  - BLOCKER C-1: Renewable Subsidizer and Industrialist wait on the plants.
  - BLOCKER C-31: Arms Race Proponent waits on the armament projects.
  - P8: no card style asks for a DARK AGE card (a forced Dark Age slots 0 of 13); a fourth style is the carrier — poke-only until then. Who to hire and where to seat him is a heuristic (catalog order, lowest-loyalty city).
- **B-31r. TRADE-ROUTE TAILS.** Weight 1.
  - DLL: `PLUNDER_ROUTE_GOLD` 50. `GlobalParameters.xml` carries no plunder amount and the only trade-route plunder rows anywhere (Lisbon's immunity, an Admiral's bonus) publish no figure. The improvement pillage table and the two plunder percentages (Total War 50, Letter of Marque 100) are sourced and ship at the install's size; only the base is a model number.
  - P8: the destination is one candidate row plus take/skip; the free-choice head is P8 work.
- **B-34r. FLOOD TAILS.** Weight 1.
  - BUILD: COASTAL floods. A flood reaches a river's own tiles (`_flood_river` / the river walk); a coastal one needs a shoreline reach and the lowland bands to drive it.
  - BLOCKER C-26: the Egyptian ability's flood half; the Soothsayer's is an absent chassis'.
- **B-51r. THE ENCAMPMENT'S POOL ON CAPTURE.** Weight 1.
  - ASK 2.
- **B-54r. UNIQUE-UNIT FLANK AND SUPPORT STACKS.** Weight 1.
  - BUILD: Zulu's Impi and Macedon's Hypaspist raise flanking or support for themselves alone; both chassis are seated (C-78), the per-chassis clause is not read.
- **B-56r. THE INERT PROMOTIONS.** Weight 1.
  - BLOCKER C-34: GROUND_CREWS — `MODIFIER_PLAYER_UNIT_GRANT_HEAL_AFTER_ACTION` with no amount (the modifier type is the whole rule; the engine's own healing supplies the number) after a PATROL, which is no data row at all.
- **B-61r. GREAT PERSON CLAUSES WITH NO CARRIER.** Weight 2.
  - BUILD: ten persons marked `unmodelled` in `cpu/data/greatPeople.ts`, the class lump standing in for each — Tesla, Paxton, Kenzo Tange (tourism / regional range), Stamford Raffles (city-state absorption), Sarah Breedlove, Jamsetji Tata, Masaru Ibuka (tourism), Boudica (barbarian conversion), Tupac Amaru (a per-district grant walk), Leif Erikson (ocean passage). Each needs its carrier on both engines.
- **B-D. UNSOURCED DATA VALUES.** Weight 1.
  - BUILD: DEMOCRACY'S ROUTE PAYS ONLY ITS OWN CITY. Sourced (GS): "+4 Food and +4 Production for BOTH CITIES" to an ally's or suzerain's city; the origin half ships, the destination's half pays another seat's city and no channel here pays a foreign city for an incoming route.
  - DLL: the PER-CITY war-weariness split. The install's numbers are `WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_{AT_WAR_CITY 3, FOUNDED_CITY 0, NONFOUNDED_CITY 1}`, `_POINTS_FOR_AMENITY_LOSS 400`, `_PER_COMBAT_IN_{ALLIED 1, FOREIGN 2}_LANDS`, `_PER_UNIT_KILLED 3`, `_PER_WMD_LAUNCHED 10`, `_DECAY_{PEACE_DECLARED 2000, TURN_AT_PEACE 200, TURN_AT_WAR 50}`, `_WARMONGER_BASE 16`; how the per-city rows compose is not published. The empire-wide rule ships (`warWearinessPenalty`).
  - `GAME_SPEED` 0.6 is a SHAPE difference: real Civ 6 scales cost, yield and turn tables independently.
  - LAB scene G: the faith rate for a LAND COMBAT unit is inferred from the building rate (`FAITH_PURCHASE_MULT`, reused by `unitFaithCost` / `_seat_faith_unit_candidate`); no page states the unit one. Measured with the purchase price (C-80).
  - Oligarchy and Classical Republic are adopted in NO game (`computeAdoption` / `_adopted_gov` take the newest tier); their rows are held by the two government lanes' borrowed-row drills only.

## C. Absent systems — the blockers, and the gaps waiting on them

- **C-1. POWER.** Weight 1.
  - ASK 4, then BUILD: the ACCIDENT ROLL. Sourced in `Expansion2_RandomEvents.xml`: `RANDOM_EVENT_NUCLEAR_ACCIDENT_{MINOR,MAJOR,CATASTROPHIC}`, Severity 0/1/2, `MinTurnAtRisk` 10/20/30 (the reactor age each opens at), `OccurrencesPerGame` 1 apiece at MODERATE; `RandomEvent_Damages` — MINOR: improvement pillaged 10%, building pillaged 20%, radiation 2 turns; MAJOR: civilians killed 50%, improvement pillaged 40%, district pillaged 50%, buildings pillaged 100%, radiation 10 turns, land/naval units 50% @ 20-50 HP, garrison 50% @ 20-50; CATASTROPHIC: improvement pillaged 100%, buildings DESTROYED 100%, district pillaged 100%, population -80%, radiation 20 turns, units 100% @ 20-50, garrison 100% @ 20-50, civilians 100%. The age SCALING is DLL. The clock ships (`City.reactorAge` / `city_reactor_age`).
  - BLOCKER C-38: a city-state's cities are never powered (`resolveSeatPower` / `_resolve_seat_power` run for majors only). Vacuous today, pinned by `minor_yields_test::test_power_vacuous`; due when the minor's ladder reaches a building with a load.
- **C-2. DIPLOMATIC AGREEMENTS.** Weight 2.
  - BUILD: JOINT WAR. `DIPLOACTION_THIRD_PARTY_WAR`'s row column for column (Join Ongoing War ships as a war kind), differing only in that its target is not yet at war — which needs a TWO-SIDED agreement object the deal table does not carry: one seat's offer binding the other's declaration next turn, surviving a turn boundary and applying to a seat that did not choose it (`DEAL_ITEM_KINDS` has no war item).
  - BUILD, half sourced: RESEARCH AGREEMENT. The gate is published (`InitiatorPrereqTech` / `TargetPrereqTech` TECH_SCIENTIFIC_THEORY, `NoCurrentResearchAgreement`, Worth/Cost only at DIPLO_STATE_ALLIED 40 and DECLARED_FRIEND 20); the PAYOUT and DURATION are not (no `Duration` on the row). The science paid is DLL.
  - BLOCKER C-76: a mission's mark ("a small positive bonus in your relationship"), DEMAND and DISCUSS (the four promises of `Expansion2_DiplomaticActions.xml`, FavorCost 30, GrievancesForRefusal 25, GrievancesPerIncursion 25), ASK-FOR-PROMISE and the WAR OF RETRIBUTION's RequiresBrokenPromise.
  - Model lines, identical on both engines and kept as notes: a luxury has no lump to trade (the install trades ACCESS, never an amount); the intel bonus is unit-against-unit only; one running deal per ordered pair, `DEAL_ITEMS` a side, an offer standing two turns; a war does not end a standing deal; the Third Party War's "another player" is read as an ALLY.
- **C-16. THE SPY'S SECOND HALF.** Weight 1.
  - ASK 14: the escape's SCALE and route (the terms are sourced; `missionOutcome` / `_mission_outcome` ship the mission roll).
  - LAB carry-over: the COUNTERSPY term (`EnemyProbChange` 3, `EnemyLevelProbChange` 1) stays off the roll until measured with an enemy counterspy in the city; the spy-level term past 1 (the tuner cannot raise a Spy's XP). One constraint on any composition: FABRICATE_SCANDAL carries no counterspy columns at all and runs 16 turns where every other offensive mission runs 8, so a composition that always subtracts them cannot be right.
  - ASK 10: a Free City as spy ground.
- **C-20. THE MOUNTAIN TUNNEL'S ROUTE MULTIPLIER.** Weight 1.
  - DLL: the pedia's "Trade Routes traveling through it can multiply the Gold they get from districts at their destination" has one XML carrier, `MOUNTAIN_PORTAL` of type `MODIFIER_MOUNTAIN_PORTAL`, and that modifier row has NO ARGUMENTS in any layer. Not "unpublished pending a look": looked at, no number to find.
- **C-22. THE PRESERVE'S HOUSING TABLE.** Weight 1.
  - DLL, and beyond this install: `PRESERVE_APPEAL_HOUSING` / `preserveHousing` state the published ceiling at Breathtaking; the middle bands are this model's own. The Preserve is a New Frontier Pass district and no `PRESERVE` row exists in Base, Expansion1 or Expansion2 — the same is true of the Ngao Mbeba. A sweep of which roster members this install cannot source belongs with the hygiene pass.
- **C-26. CIVILIZATION ABILITIES — THE RESIDUE.** Weight 1.
  The census is `docs/ROSTER.md` against `docs/roster_ledger.json` (`shipped` on 338 of 343 modifiers, `open: <item>` on 5 under C-64 and C-67). Unique units are C-78, unique infrastructure C-79.
  - BLOCKER C-76: the AGENDAS, DLL-scored against an opinion scale neither engine has.
  - DLL, recorded: whether Trajan's grant fires on a CONQUERED city (founding ships); whether Iteru's flood avoid also skips the fertility half; whether the Knarr's Ocean clause reaches a Trader's course (`tradeWaterLevel` stays Cartography-gated); the Great Turkish Bombard's strike on a city.
  - BUILD: the ROCK BAND's four venue clauses (`Expansion2_UnitPromotions.xml`: Arena Rock / Street Carnival, Reggae Rock / Copacabana, Glam Rock / Acropolis, Surf Band / Royal Navy Dockyard) — the venues are built; the promotion's own venue bit is not read.
  - BUILD: the engine has no resource VISIBILITY, so the Stave Church counts every coastal resource where the install counts the visible ones.
  - Recorded allowlist: a CITY's own ranged strike composes its defender without the roster's rows (`cityStrikeStrength`'s block in `seatPhase`; the site census in `combat-rows.test.ts` / `combat_rows_test.py` names it).
- **C-31. THE NUCLEAR STRIKE'S LAST CLAUSES.** Weight 1.
  - BLOCKER C-34: WHICH DELIVERY A COVER STOPS. The page's rule ships (`nukeInterceptor` / `_nuke_intercepted`, every delivery alike); the community's per-DELIVERY split (a silo answering to the Gun AA, the Battleship and the SAM; a submarine to the SAM alone) and the BOMBER's threshold (its drop stopped under 50% HP) need the interception DAMAGE the install never publishes.
  - ASK 5: how many CITIZENS die per ring (the pick is exposed — `city.workedTiles` / `_worked_tiles(row)` name who stands in the blast), and a WONDER in the blast.
- **C-34. AIR COMBAT'S SECOND HALF.** Weight 2.
  - DLL: INTERCEPTION BY A FIGHTER has no published strength, formula or cap on attempts; C-31's delivery split shares the half.
  - DLL: PATROL is not a data row (no `UNITOPERATION_PATROL`, no command, no promotion); it is the UI's name for a fighter sitting ready, so the verb an engine would need is an INTERCEPT STANCE whose whole behaviour is the unpublished roll above.
  - DLL: PRIORITY TARGET is a command with no data — `UNITCOMMAND_PRIORITY_TARGET` (`Expansion1_UnitCommands.xml`) has a category, an interface mode, an icon and a label, and no argument, requirement set or magnitude in any layer.
- **C-38. A CITY-STATE'S CITY.** Weight 1.
  Its food and culture ride the majors' own composers (`seatGrowth`, `cityBorderGrowth` / `_seat_city_growth`, `_seat_border_growth`); gold and faith only bank in `CityState.treasury` / `.faith`.
  - ASK 9, then BUILD: a minor with fewer than N military units and a bank over a unit's price buys its best trainable land unit — N and the price threshold are the ask's magnitude. `GlobalParameters.xml` holds five MINOR knobs, all placement; no row names a city-state purchase, build weight or reserve.
  - BLOCKER C-1: its grid, when the ladder reaches a load.
  - B-24r's Foreign Investor and Affluence wait on a minor that improves and accumulates.
- **C-41. VOLCANIC SOIL.** Weight 1.
  The affected set is the RADIUS-1 RING, which both engines already scorch and fertilize (`disasterPhase` over `neighbors(map, volcano)`, the GPU over `neigh[volcano]`); the carrier (`addFeature` / `_add_feature`) is in.
  - LAB, then BUILD: PAINT. Measured over four eruptions: the soil replaces a standing feature on a PROPORTION of the ring (5/6, 2/3, 1/3 seen; gentle 0/6 and 1/1); an improvement on a painted tile is pillaged or removed; a bonus resource on a ring tile, land or sea, can be destroyed. The proportion per severity and pillaged-vs-removed need a dozen eruptions per severity; the engine rolls no eruption SEVERITY at all. The XML's own split — GENTLE takes `LOC_RANDOM_EVENT_PROP_DAMAGE_FERTILITY`, CATASTROPHIC and MEGACOLOSSAL `..._ALL_...` — suggests the ruling: catastrophic+ paints every eligible ring tile, gentle a rolled share; a painted tile's improvement pillaged, its resource kept.
- **C-49. NAMED STORMS.** Weight 1.
  `stormWalk` / `_storm_walk` ship the measured model: eight unit steps on the movement turn from the `PrevailingWinds` band at the centre's current latitude, eight more with no footprint on dissipation.
  - LAB: the PER-STEP DRAW is inferred from 31 resultants (4-8 hexes in open water, 1-5 against the ice, always inside the band, with off-axis wobble one heading times eight cannot make), not watched step by step; a scene that reads the record's `CurrentLocation` mid-turn would confirm or refute it.
- **C-60. THE FREE CITY'S OWN PLAY.** Weight 1.
  The seat is in on both engines (revolt, race, join, Eleanor's skip, open to attack, the religion walk).
  - ASK 13: its defence.
  - ASK 12: its amenities.
- **C-64. A SEAT HAS NO MAJORITY RELIGION.** Weight 1.
  - ASK 3, then BUILD: a per-seat majority over its cities' followed religions on both engines. Three ledger rows wait on it (`TRAIT_CITY_STATE_TOKEN_SAME_RELIGION`, `TRAIT_COMBAT_BONUS_OTHER_RELIGION`, `TRAIT_GAINS_FOUNDER_BELIEF_MAJORITY_RELIGION`).
- **C-67. A DIPLOMATIC ACTION HAS NO PREFERENCE WEIGHT.** Weight 1.
  - P8: `TRAIT_BEFRIEND_MINOR_CIV_HOME_CONTINENT` and `TRAIT_NO_WAR_MINOR_CIV_HOME_CONTINENT` are DLL AI weightings; a preference needs a decider with alternatives.
- **C-74. PER-GAME COUNTS OVER PER-OBJECT ROLLS.** Weight 1.
  - ASK 4: `ERUPTION_CHANCE_PER_VOLCANO` is not covered by the MODERATE / 500 ruling — the install counts eruptions per GAME, this engine rolls per VOLCANO; C-1's reactor is the same shape.
- **C-76. NO OPINION SCALE BETWEEN MAJORS.** Weight 2.
  - ASK 6, then BUILD: a compared per-pair opinion on both engines. The anchors are published (Base `DiplomaticActions.xml`, `DiplomaticStates`):

        state              RelationshipLevel   DiplomaticYieldBonus
        ALLIED                    100                   50
        DECLARED_FRIEND            83                   25
        FRIENDLY                   66                   25
        NEUTRAL                    50                    0
        UNFRIENDLY                 33                  -25
        DENOUNCED                  16                  -75
        WAR                         0                 -100

    Four of the seven are explicit facts here (WAR, DENOUNCED, DECLARED_FRIEND, ALLIED); FRIENDLY, NEUTRAL and UNFRIENDLY are the bands an opinion lands in. The carrier is not separable from the deltas — built now it would hold NEUTRAL 50 forever, a compared constant — so both halves land together. What `DiplomaticYieldBonus` is paid IN is not published either.
  - Waiting on it: the mission's mark, DEMAND, DISCUSS, the promises and the Retribution casus belli (C-2); the agendas (C-26); the preference weights (C-67).
- **C-78. UNIQUE UNITS ABSENT.** Weight 1.
  All 34 civilizations' unique chassis are built with their abilities and pins.
  - BUILD: the LEADER units whose `docs/ROSTER.md` rows are blank — the Rough Rider, the Redcoat, the Black Army, the Longship.
  - BUILD: the Ngao Mbeba's "can see through features" — the sight model ships as occlusion (`canSee` / `_los_disk`), so the clause is the SEE_THROUGH kind Sentry already carries, on a chassis instead of a promotion.
- **C-79. UNIQUE INFRASTRUCTURE ABSENT.** Weight 1.
  Every district, building and improvement row is built.
  - BUILD, four clauses with no carrier, each recorded on the column that names it: the Great Wall's and the Pā's `PLOT_DAMAGE_TO_WALKING_INTO` / `_ADJACENT` (10 each) — damage on ENTERING a tile is movement machinery no chapter owns; the Film Studio's "+100% Tourism pressure toward other civilizations in the Modern era" — a per-PAIR tourism pressure; the Electronics Factory's "+4 Culture after Electricity" — a TECH-gated building yield the catalog has no column for, and the Marae's and Thermal Bath's per-tile Tourism thirds with it; "Tiles with <row> cannot be swapped" (Golf Course, Open-Air Museum) — no tile-swap verb exists to refuse.
  - DLL: the Stepwell's "+1 Faith beside a Holy Site, +1 Food beside a Farm" has no `Improvement_Adjacencies` row.
  - Out of scope by construction: LEY LINE adjacency (a Secret Societies resource class this map never places).
- **C-80. CONSTANTS VS THE INSTALL.** Weight 2.
  The instruments: every catalog constant carries a source tag (`cpu/data/provenance.ts`); `tools/civ6lab/xml_check.py check --baseline docs/PROVENANCE.md` and the reader census (`tools/gpu/rules_reader_census.py`) run in battery stage 0 as RATCHETS — a new disagreement or a new unread key is red.
  - LAB scenes G and H: the two ledger lines left in docs/PROVENANCE.md — `GOLD_PURCHASE_MULT` 4 against the install's `GOLD_PURCHASE_MULTIPLIER` 2 with `PURCHASE_DIVISOR` 5 (a DLL formula, measured from a city's price list; `FAITH_PURCHASE_MULT` 2 with it), and the Pop Star's 25 against `ROCKBAND_POP` Amount -75 (a Rock Band concert's gold).
  - BUILD, the FIVE RULES the reader census names (their eight baseline lines stay red-listed until built):
    2. `civLevels.canAnnexTilesWithReceivedInfluence`: a city-state grows its borders from envoys spent on it; neither engine has the channel.
    3. `civLevels.startingTilesForCity` (6 / 5 / 0 by class): both engines found every city with the same centre-plus-ring claim.
    4. `diploVis.flatLevels` (Catherine de Medici's +1 visibility with everyone): reaches both engines and is read by neither (TS reads `postLevels` only; the GPU binds `_vflat` and uses it in no loop).
    5. `improvements.damageEntering` / `damageAdjacent`: C-79's damage-on-entry hook.
    6. `improvements.noSwap`: C-79's tile-swap refusal.

## Harness — not weighted

No open entry.
