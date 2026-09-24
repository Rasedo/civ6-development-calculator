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
| **A. Engine vs engine** | **0** | |
| B-24r governor tails | 1 | Foreign Investor and Affluence wait on C-38; Renewable Subsidizer and Industrialist on C-1 |
| B-31r trade-route tails | 1 | `PLUNDER_ROUTE_GOLD` 50 is DLL; the destination's free choice is P8 |
| B-D unsourced data values | 1 | per-city war weariness (DLL); GAME_SPEED shape |
| B-82 the turn-limit score winner | 2 | TS names no winner; the GPU names one by a yield score that is not Civ 6's Score |
| B-85 Exodus of the Evangelists' golden movement | 1 | whether an Inquisitor takes it too |
| B-86 the emergency combat terms' reach | 1 | the DEFEND half and ranged combat; how "one less pressure" applies (DLL) |
| B-87 the Marae's dedication event | 1 | whether a holder with no slots fires Pen, Brush and Voice (LAB) |
| **B. Fidelity vs real Civ 6** | **8** | |
| C-1 power | 1 | the accident's gates and payloads (measured), one LAB line on the damage table; a minor's grid when C-38 gives one a load |
| C-2 diplomatic agreements | 1 | ask 18: what "near" is for Don't Settle Near Me; the broken-promise multiplier's operand (DLL) |
| C-16 the spy's second half | 1 | the counterspy's escape term (LAB) |
| C-20 Mountain Tunnel's route multiplier | 1 | DLL — the modifier carries no arguments |
| C-22 Preserve housing table | 1 | middle bands stylized; the row is not in this install |
| C-26 civilization abilities, the residue | 1 | three unread DLL clauses |
| C-34 air combat's second half | 1 | Patrol and Priority Target carry no data |
| C-38 a city-state's play | 6 | its army (no unit on either engine), its production modifiers, its builders, what it spends (LAB), its build order and quests (model / DLL); its grid (C-1) |
| C-41 Volcanic Soil | 1 | the measured paint chance (the YIELD_FOOD row's Percentage) on both engines; the severity roll (C-74) |
| C-49 named storms | 1 | the per-step draw is inferred from resultants, not watched step by step (LAB) |
| C-60 the Free City's own play | 1 | its defence floor, its granted defenders — measured; bankruptcy's amenity loss, on no seat (LAB, then BUILD) |
| C-74 per-game counts over per-object rolls | 1 | one event a turn, a weighted draw over the eligible |
| C-81 the tile swap's reach | 1 | the measured adjacency clause (a claimed plot touches the claimant's land) on both engines |
| **C. Absent systems** | **18** | |
| **OPEN, TOTAL** | **26** | |

## The question ledger — owner asks

A question the SOURCE under-determines; neither engine ships a branch until
the owner rules or the live game answers. A ruled or measured line is
written into its entry and leaves this list. Numbers are stable (the lab
scenes cite them), so the gaps are closed asks.

| ask | entry | the question | where the answer comes from |
|---|---|---|---|
| 18 | C-2 | DON'T SETTLE NEAR ME's reach: which seat the promise names and how near a founding must be to break it. The plain "settled too near" grievance is measured (4 from the city / 3 from the border: 19; 5 / 4: none); the break itself survived every founding tried | LAB (found a city at 4, 6 and 8 tiles from a promisee's border and read the grievance log) |

## A. Engine vs engine

The digest is the only instrument for this class; a round that widens what
the gate reaches is worth more here than one that re-reads the exporter, and
a hunt catch opens an entry here only when it cannot close in the same
commit.

## B. Fidelity vs real Civ 6 — shipped mechanics with open tails

- **B-24r. GOVERNOR TAILS.** Weight 1.
  - BLOCKER C-38: Foreign Investor needs a minor that accumulates strategic resources; Affluence copies the ground's luxuries because a minor improves nothing.
  - BLOCKER C-1: Renewable Subsidizer and Industrialist wait on the plants.
- **B-31r. TRADE-ROUTE TAILS.** Weight 1.
  - DLL: `PLUNDER_ROUTE_GOLD` 50. `GlobalParameters.xml` carries no row with PLUNDER in its name at all, and the only trade-route plunder rows anywhere (Lisbon's immunity, an Admiral's bonus) publish no figure. The district `PlunderAmount` column (25 / 50) is sourced and ships, and so are the two plunder percentages (Total War 50, Letter of Marque 100); only the route's base is a model number.
  - P8: the destination is one candidate row plus take/skip; the free-choice head is P8 work.
- **B-D. UNSOURCED DATA VALUES.** Weight 1.
  - DLL: the PER-CITY war-weariness split. The install's numbers are `WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_{AT_WAR_CITY 3, FOUNDED_CITY 0, NONFOUNDED_CITY 1}`, `_POINTS_FOR_AMENITY_LOSS 400`, `_PER_COMBAT_IN_{ALLIED 1, FOREIGN 2}_LANDS`, `_PER_UNIT_KILLED 3`, `_PER_WMD_LAUNCHED 10`, `_DECAY_{PEACE_DECLARED 2000, TURN_AT_PEACE 200, TURN_AT_WAR 50}`, `_WARMONGER_BASE 16` — re-read in `GlobalParameters.xml`, all thirteen still there and still the whole of it; how the per-city rows compose is not published. The empire-wide rule ships (`warWearinessPenalty`).
  - `GAME_SPEED` 0.6 is a SHAPE difference: real Civ 6 scales cost, yield and turn tables independently.
  - Oligarchy and Classical Republic are adopted in NO game (`computeAdoption` / `_adopted_gov` take the newest tier); their rows are held by the two government lanes' borrowed-row drills only.
- **B-82. THE TURN-LIMIT SCORE WINNER.** Weight 2.
  - BUILD: past `TURN_LIMIT` TS `endTurn` (`cpu/core/game.ts`) sets `victoryType` 1 and `victoryRow` -1 and names nobody. The GPU names a winner there (`sim_step.py`, `leader()` over `seat_score`), and `seat_score` is the balanced YIELD score the env rewards (`rules.score`: pop x3 plus weighted yields), not Civ 6's Score. Civ 6's score victory goes to the highest game Score, whose categories and per-item points are the install's `ScoringCategories` / `ScoringLineItems`. Source those rows, build the Score on both engines, and have both name the winner; the env reward stays its own number.
- **B-85. EXODUS OF THE EVANGELISTS' GOLDEN MOVEMENT.** Weight 1.
  - LAB: both engines give the golden-age Exodus movement bonus to the Missionary and the Apostle only (`goldenMoveBonus` in `cpu/core/eras.ts`; the GPU's `_ded_exodus` row in `sim_masks.py`), while `INQUISITOR` is in the roster. Whether the Inquisitor takes it is answered by the commemoration's golden-age modifier and the requirement set it names in the install's Expansion1 commemoration data; failing that, by a golden-age Exodus seat holding an Inquisitor in the live game.

- **B-86. THE EMERGENCY COMBAT TERMS' REACH.** Weight 1.
  - BUILD: the Military and Nuclear emergencies' running bonus has a DEFEND half (`MILITARY_EMERGENCY_MEMBER_COMBAT_STRENGTH_DEFEND`, `NUCLEAR_EMERGENCY_MEMBER_COMBAT_STRENGTH_DEFEND`: the target also takes the term when it attacks a member) that neither engine applies, and `emergencyAttackCS` / `_emergency_pair_cs` (the running +2 and the won Nuclear emergency's 3) are called from melee unit-vs-unit combat only, never from ranged unit-vs-unit combat. Apply both halves wherever a unit fights a unit.
  - DLL: the lost Nuclear emergency's `EFFECT_ADJUST_CITY_IDENTITY_PRESSURE` -1 is read as each member city pressing as one fewer citizen before the distance falloff (`citizenPressure` / `_citizen_pressure_from`); the install gives the amount, not where it enters.
- **B-87. THE MARAE'S DEDICATION EVENT.** Weight 1.
  - LAB: both engines fire the Pen, Brush and Voice dedication event when a Marae completes, because it stands in for a Great Work holder (`GW_HOLDERS` in `cpu/core/eras.ts`, the GPU's `_b_gwslot`), though the Marae holds no slots. A Maori seat under that dedication completing a Marae in the live game answers whether the event fires.
## C. Absent systems — the blockers, and the gaps waiting on them

- **C-1. POWER.** Weight 1.
  - BUILD, the ACCIDENT, measured on three FRESH reactors, one per severity. The gates are the reactor's AGE past `MinTurnAtRisk` 10 / 20 / 30 (`RANDOM_EVENT_NUCLEAR_ACCIDENT_{MINOR,MAJOR,CATASTROPHIC}`, Severity 0/1/2), and the game's own threshold reader is simply the COUNT of severities the age has unlocked (0 at age 1, 1 at 10, 2 at 20, 3 at 30). The payload is ONE PLOT — the reactor's own, never a radius — contaminated for 2 / 10 / 20 turns; -1 population at severity 2 ONLY; the Industrial Zone pillaged at severity 2 only; the plant NEVER removed, so one reactor can melt down again and again and goes on ageing. The age clock both engines ship (`City.reactorAge` / `city_reactor_age`, +1 a turn, cleared with the building) is correct against the live game. The per-turn chance is C-74's one-event draw at weight 1: zero accidents in ~150 reactor-turns at MODERATE, a 95% bound near 2% per reactor-turn.
  - MEASURED, lab 4 (2026-09-23; `tools/civ6lab/reactor_fleet.py`, `runs/reactor_20260923T192129Z.jsonl`): 75 forced accidents, 25 per severity, each on a freshly loaded city (population 12, Industrial Zone, Workshop, Factory, Power Plant, farms in the ring). The `RandomEvent_Damages` Percentages are PER-OBJECT CHANCES, not proportions: the Industrial Zone was pillaged 0/25, 13/25 (52% against the MAJOR row's 50) and 25/25 (the CATASTROPHIC row's 100); POPULATION_LOSS 80 took exactly ONE citizen in 22/25 cities at CATASTROPHIC (88%); the fallout sits on the reactor's own plot alone, 2 / 10 / 20 turns. Rows that did NOTHING here: CATASTROPHIC BUILDING_DESTROYED 100 (0/80 buildings lost — lab 3 saw the same) and the IMPROVEMENT_PILLAGED rows (0 of 40 farms within 3). Two open: MINOR cost one citizen in 7/25 cities with no POPULATION_LOSS row (unexplained), and BUILDING_PILLAGED stays unmeasured — `GetBuildings():IsPillaged` throws for a building made from the socket.
  - BUILD (#279), both engines: the district pillage and the population loss as per-accident chances at the rows' Percentages (one citizen), the fallout as shipped; no building destroyed, no ring improvement pillaged.
  - BLOCKER C-38: a city-state's cities are never powered (`resolveSeatPower` / `_resolve_seat_power` run for majors only). Vacuous today, pinned by `minor_yields_test::test_power_vacuous`; due when the minor's ladder reaches a building with a load.
- **C-2. DIPLOMATIC AGREEMENTS.** Weight 1.
  The promises ship on both engines: the four `DiplomaticActions_XP2` rows (`cpu/data/promises.ts`, `eras.promises`), a ledger per ordered pair (`promiseWith` / `seat_promise`, `promiseBrokenWith` / `seat_promise_broken`), the ask and the answer settled in one turn (`settlePromises` / `_settle_promises`), the incursion (`promiseIncursion` / `_promise_incursion`) called from the offensive spy mission, the city that comes to follow the promiser's religion and the dig worked on the asker's ground, and the War of Retribution's `brokenPromise` reading the window. REACHED by `tests/cpu/seats/promises.test.ts` and the `promises` poke lane; the serve gate reaches it through the driver's `_promise_turn` (the geo table's `promise` and `converted`, the records' `askPromise` / `keepPromise`, the digest's `promises`).
  - ASK 18: DON'T SETTLE NEAR ME has no incursion. No row gives "near" a reach: the only settle-near rows are the AI's `STANDARD_DIPLOMACY_SETTLED_CITIES` modifier (a `DiplomacyKey` and throttles, no distance) and the congress's `WC_KUDO_SETTLE_NEAR` / `WC_DENOUNCE_SETTLE_NEAR` discussion types (no columns); `GlobalParameters` holds none. The promise can be asked, kept and refused, and is never broken; the driver does not ask it.
  - MEASURED (lab 4, `tools/civ6lab/near_probe.py`, a human seat founding at set distances from a rival, `runs/promise_near*.log`): founding 4 plots from the rival's city and 3 from its border drew a grievance of 19 against the founder (18 for an earlier city as near), decaying about 6 a turn; cities 5 / 4, 7 / 5 and 9 / 6 away (city / border) drew none. The grievance came with or without a promise standing, so it is the plain "settled too near" grievance; neither engine carries it (BUILD, with the ask). Which seat `IsPromiseMade` names is unread — the promise the rival holds survived every founding — so the break's own reach stays LAB.
  - DLL: `GRIEVANCE_MULTIPLIER_FOR_BROKEN_PROMISE` 200 (Expansion2_GlobalParameters.xml) names no operand. Both engines charge the notification's literal figure (`LOC_NOTIFICATION_DIPLO_PROMISE_FROM_BROKEN_SUMMARY`: "has been broken (100 Grievances generated)").
  - Model lines, identical on both engines and kept as notes: a luxury has no lump to trade (the install trades ACCESS, never an amount); the intel bonus is unit-against-unit only; one running deal per ordered pair, `DEAL_ITEMS` a side, an offer standing two turns; a war does not end a standing deal or promise; the Third Party War's "another player" is read as an ALLY; a refused ask stands the pedia's 30 turns ("All Deals, Demands, and Promises last for 30 turns"); the refused asker's favor comes back at the refusal, where the pedia says "refunded for the next session"; an offensive mission is an incursion whatever its outcome; an ask is answered in the turn it is made; an ask the asker cannot make (at war, unpaid, one standing) is dropped, neither paid nor refused.
- **C-16. THE SPY'S SECOND HALF.** Weight 1.
  - The escape ships on both engines as measured (`spyEscape` / `_spy_escape`; lab 4, `tools/civ6lab/spy_loop.py`, 129 escapes of spies BOUGHT in a city, every prompt answered the turn it came): the police guess one of the routes the city offers, uniformly, and the spy gets away when the mission's 3d6 lands at or under 10 + its level (Ace Driver's +4 among them) - 4 on a right guess. One-route cities, where the guess is certain, let 10 of 54 away (the rule predicts 14.4); two-route cities 41 of 63 (32.9); a lost escape ended in the cell 34 times in 117, else the spy was killed. An earlier batch whose prompts sat behind another blocker read 0 of 28 in one-route cities; the rule does not explain that batch.
  - LAB, the COUNTERSPY's term. All 234 prompts named the police as the pursuer; `_COUNTERSPY_LEVEL_MODIFIER` -1 per level of the post is applied as the install writes it, unmeasured. A scene posts a counterspy (the AI's own, or one bought for a second human seat) in the target city and reads `GetPursuingSpyName` at the prompt.
- **C-20. THE MOUNTAIN TUNNEL'S ROUTE MULTIPLIER.** Weight 1.
  - DLL: the pedia's "Trade Routes traveling through it can multiply the Gold they get from districts at their destination" has one XML carrier, `MOUNTAIN_PORTAL` of type `MODIFIER_MOUNTAIN_PORTAL`, and re-read across all three layers that modifier has NO `ModifierArguments` row anywhere — only the type, `COLLECTION_OWNER`, `EFFECT_MOUNTAIN_PORTAL` and three attachments. Not "unpublished pending a look": looked at, no number to find.
- **C-22. THE PRESERVE'S HOUSING TABLE.** Weight 1.
  - DLL, and beyond this install: `PRESERVE_APPEAL_HOUSING` / `preserveHousing` state the published ceiling at Breathtaking; the middle bands are this model's own. Re-checked: no `DISTRICT_PRESERVE` row exists in Base, Expansion1 or Expansion2 — it is a New Frontier Pass district, the same as the Ngao Mbeba. A sweep of which roster members this install cannot source belongs with the hygiene pass.
- **C-26. CIVILIZATION ABILITIES — THE RESIDUE.** Weight 1.
  The census is `docs/roster_ledger.json`, read as `docs/ROSTER.md` says (`shipped` on 341 of 343 modifiers, two `AI:` rows — the game's diplomatic-action preferences, outside an engine model).
  - DLL, recorded: whether Trajan's grant fires on a CONQUERED city (`TRAIT_ADJUST_NON_CAPITAL_FREE_CHEAPEST_BUILDING` is `MODIFIER_PLAYER_CITIES_GRANT_CHEAPEST_BUILDING_IN_CITY`, Amount 1, no requirement set — founding ships); whether Iteru's flood avoid also skips the fertility half (the trait's modifiers are fourteen `TRAIT_FLOODPLAINS_VALID_*` placement rows and two `TRAIT_RIVER_FASTER_BUILDTIME_*` — NO modifier carries the avoid at all); whether the Knarr's Ocean clause reaches a Trader's course (`ABILITY_KNARR_IGNORE_EMBARK_DISEMBARK_COST` IS tagged onto `CLASS_LANDCIVILIAN`, which `UNIT_TRADER` carries, so the open half is only whether `MODIFIER_PLAYER_UNIT_ADJUST_IGNORE_SHORES` — no arguments — reaches a trade route's water path; `tradeWaterLevel` stays Cartography-gated).
  - Recorded allowlist: a CITY's own ranged strike composes its defender without the roster's rows (`cityStrikeStrength`'s block in `seatPhase`; the site census in `combat-rows.test.ts` / `combat_rows_test.py` names it).
- **C-34. AIR COMBAT'S SECOND HALF.** Weight 1.
  - DLL: PATROL is not a data row (no `UNITOPERATION_PATROL`, no command, no promotion in any layer, re-grepped) — it is the UI's name for a fighter sitting ready, and the live game exposes no stance to enter.
  - DLL: PRIORITY TARGET is a command with no data — `UNITCOMMAND_PRIORITY_TARGET` (`Expansion1_UnitCommands.xml`) has a category, an interface mode, an icon and a label, and no argument, requirement set or magnitude in any layer.
- **C-38. A CITY-STATE'S PLAY.** Weight 6.
  OWNER 2026-09-23: a city-state is no agent, so its behaviour IS the environment an agent trains against, and a gap an agent can exploit there is a sim-to-real gap. Every observable city-state behaviour is therefore an engine rule: built from the install where it publishes rows, measured in the lab where it does not, and randomised per episode where neither settles it, so no policy leans on one guessed value. Its food and culture already ride the majors' composers (`seatGrowth`, `cityBorderGrowth` / `_seat_city_growth`, `_seat_border_growth`). The lines, most exploitable first:
  - MEASURED, lab 4 watch (2026-09-23; `tools/civ6lab/runs/cs_watch_lab4_*.jsonl`, 12 city-states, Standard Continents, Online, Prince, turns 1-251, `cs_analyze.py`): every minor starts with a Settler and two Warriors; early armies run 4-9 units, late ones 1-3; it trains BUILDERS (41 build starts across the twelve) and TRADERS (19), walls, Castle and Star Fort, Granary, Water Mill, Sewer, Harbor, Lighthouse, Market, Library, Barracks, the district enhancement projects and a full unit line (Archer to Modern AT, naval included). PURCHASES: nine unit buys in 250 turns, each draining most of the bank (100-633 gold, e.g. 633 -> 0, 497 -> 8) with the army at 0-6 units; the rest of the new units come from production. Faith banks and is never spent (one minor ended at 39 326). Two minors were conquered (turns 186, 194). The build ORDER, the purchase trigger's shape and the unit movement still want a fit over more games (`watch.py` with `all_ai`).
  - MEASURED, the observer fleet (2026-09-23; `tools/civ6lab/runs/cs_watch_obs{1..6}_*.jsonl`, six all-AI Small Continents games, 10 city-states each, Online, Prince; four to turn 251, two to 201 and 180): 90 unit PURCHASES over 66 city-states, every one with the army at 0-6 units before it (0:15, 1:18, 2:18, 3:11, 4:12, 5:13, 6:3, 7+:0) and the bank at 95 gold or more, leaving on average 26% of it — a small-army trigger (`PLAYER_HAS_SMALL_MILITARY`'s threshold is the data-backed candidate) and most of the bank spent. The trigger's exact shape (army count vs a strength, the bank floor) is the fit still to make.
  - BUILD, ITS ARMY. A minor owns NO unit on either engine: it never trains, moves or attacks, and its centre never strikes (the city strike loop walks the majors' cities), so taking one costs a fraction of what it costs in the game. Sourced: `BonusMinorStartingUnits` (`Eras.xml`, re-shipped in GS's `Expansion1_Eras.xml`) — two Warriors in the Ancient era beside its settler; `Eras.StartingMeleeStrengthMinor` / `StartingRangedStrengthMinor` per era; the city ranged strike every walled city has; the `MINOR_CIV_PRODUCTION` modifiers in `Leaders.xml` — +200% toward military units while it holds fewer than 10 (`PLAYER_HAS_SMALL_MILITARY`), +200% toward walls, castles and star forts, 100% off unit upgrades. DLL, then LAB: what it trains and when, and how its units move — `Tactics.xml`'s minor rows name the behaviours (wander near the city, chase, attack high/medium/low priority, attack civilians, heal, move to safety, promotion, formation), the DLL weighs them; model them from the rows and measure the rest.
  - LAB, WHAT IT SPENDS (ruled from ask 9). OBSERVED: it banks income minus upkeep and bought one defender when its army fell (~207 gold, 4 units -> 1); faith untouched, and two 40-turn bank snapshots moved without a purchase. Here gold and faith only bank (`CityState.treasury` / `.faith`). A watch of several minors over 50+ turns names the purchase trigger (army size — `PLAYER_HAS_SMALL_MILITARY`'s 10 is the data-backed candidate), the reserve, and what it buys. `GlobalParameters.xml`'s five MINOR rows (four start-placement distances, `WARMONGER_FINAL_MINOR_CITY_MULTIPLIER`) name none of it.
  - BUILD, ITS PRODUCTION MODIFIERS (`Leaders.xml`, the `MINOR_CIV_PRODUCTION` set): -50% production in all its cities, +200% toward Builders, +500% toward the Harbor, and the walls and military rows above. Neither engine has any of them.
  - BUILD, then LAB, ITS BUILDERS: in the game a minor improves its land (the homeland "Builder Outside Ring" behaviour, the Builder modifier); here it trains no Builder and improves nothing. B-24r's Foreign Investor and Affluence wait on it.
  - MODEL, then LAB, ITS BUILD ORDER: the ladder both engines ship (Ancient Walls, the type's district, its tier-1 building, a Harbor, Medieval then Renaissance Walls — `minorBuild.ts` / `_minor_build`) is this engine's; `MinorCivCityBuilds`, `MinorCivDistricts` (ten districts disfavoured, the type's own favoured), `MinorCivUnitBuilds` and `MinorCivPseudoYields` give preferences, not an order. A census of what several minors build over a game.
  - DLL, then LAB, ITS QUESTS: three kinds here (a camp within 6, the type's district, a trade route — `issueQuest`); the game's pool lives in the DLL. A census of the quests offered over a game.
  - MODEL, ITS RESEARCH: the cheapest open tech and civic first (`minorBuild.ts` / `_minor_research`); `MinorCivTriggeredTrees` names only the tech and civic upgrade triggers.
  - BLOCKER C-1: its grid, when its ladder reaches a building with a load.
- **C-41. VOLCANIC SOIL.** Weight 1.
  The affected set is the RADIUS-1 RING, which both engines already scorch and fertilize (`disasterPhase` over `neighbors(map, volcano)`, the GPU over `neigh[volcano]`); the carrier (`addFeature` / `_add_feature`) is in.
  - MEASURED, lab 4 (2026-09-23; `tools/civ6lab/volcano_scene.py`, `runs/volcano_20260923T191337Z.jsonl`): 78 forced eruptions — all 13 volcanoes of a Standard map, each severity twice, the ring reset between and a Farm or Mine laid on every featureless land plot. The paint is a PER-PLOT CHANCE, applied the moment the event fires: bare land 20/66, 34/66, 49/66 (30 / 52 / 74 %) against the install's `RandomEvent_Yields` FEATURE_VOLCANIC_SOIL YIELD_FOOD rows, Percentage 35 / 50 / 75 (`Expansion2_RandomEvents.xml` 433-439, `ReplaceFeature="true"`) — the sourced number; Forest and Jungle are replaced at 6/28, 11/28, 18/28; FLOODPLAINS and GEOTHERMAL FISSURE are never painted (0/18); water and Mountains are not candidates. An improvement mostly SURVIVES on painted ground (removed 1/15, 5/27, 8/37 and pillaged 0, 0, 1) whatever the `RandomEvent_Damages` rows' 100 / 75 / 80 % say. A resource on the ring is lost on 21/37 painted plots and 9/47 unpainted ones.
  - BUILD, both engines: each eligible land ring plot (no Floodplains, no Geothermal Fissure) takes Volcanic Soil with the chance of its severity's YIELD_FOOD row, replacing Forest or Jungle; the severity itself is C-74's draw (the engine rolls none). The resource loss and the improvement removal are measured rates with no row behind them (LAB until a row is found).
- **C-49. NAMED STORMS.** Weight 1.
  `stormWalk` / `_storm_walk` ship the measured model: eight unit steps on the movement turn from the `PrevailingWinds` band at the centre's current latitude, eight more with no footprint on dissipation.
  - LAB: the PER-STEP DRAW is inferred from 31 resultants (4-8 hexes in open water, 1-5 against the ice, always inside the band, with off-axis wobble one heading times eight cannot make), not watched step by step; a scene that reads the record's `CurrentLocation` mid-turn would confirm or refute it. Cheaper than it was: `GameRandomEvents.GetEventsForTurn(t)` hands back one record per turn with its `CurrentLocation`.
- **C-60. THE FREE CITY'S OWN PLAY.** Weight 1.
  The seat is in on both engines (revolt, race, join, Eleanor's skip, open to attack, the religion walk).
  - BUILD, its DEFENCE, watched for ten turns after a real revolt: the free seat has a defence floor of ITS OWN — a flat 72 with no walls standing, where the same city read 53 under its founder WITH walls and 43 under its captor. `cityBaseStrength` floors at 15 plus the walls tier plus a garrison, which cannot produce that. The centre heals at the ordinary rate (40 -> 20 -> 8 -> 0 over four turns), and the city STRIKES what stands beside it (an adjacent undamaged Archer read 73 damage on the first turn). Its defenders are GRANTS, not production: two Men-at-Arms exist on the flip turn itself on the tiles either side of the centre, a Crossbowman arrives five turns later, and the build queue held BUILDINGS throughout — it trained no unit in ten turns. Its own loyalty resets to 100 at the flip and falls again at -9/-10 a turn.
  - LAB, its AMENITY RESIDUE is BANKRUPTCY (lab 4, `tools/civ6lab/freecity_amenity.lua` over 29 saves, `runs/freecity_amenity_20260924T022817Z.log`): every Free City read adds up exactly once `GetAmenitiesLostFromBankruptcy` is counted — 1 in two of seven, 0 in the rest — and every tier matches the ladder. A seat in the red loses amenities in the game; on both engines bankruptcy only disbands units (`_seat_upkeep_and_bankruptcy`), the Free Cities seat keeps no treasury, and no seat ever loses an amenity to it. What is open is the rule's size over the turns of insolvency (a watch of a bankrupt seat reading the getter each turn); then BUILD it for every seat.
  - MEASURED, REBELLION does not fire (lab 4, `tools/civ6lab/rebel_watch.lua` / `rebel_analyze.py`, four all-AI games, `runs/rebel_watch_*.jsonl`): 255 city-turns in Unrest or Revolt (115 in Revolt) and not one squad of `Unit_RebellionTags` units appeared beside an unhappy city, so the `RebellionPoints` / `REBELLION_CHANCE_PER_POINT` rows are dead in a Gathering Storm game and both engines are right to carry none. The Free City's Crossbowman is therefore a grant.
  - DLL: `CITY_AMENITIES_FOR_FREE` 1 has no reader the measured need or tier needs.
- **C-74. PER-GAME COUNTS OVER PER-OBJECT ROLLS.** Weight 1.
  - MEASURED, lab 4 watch (a natural game, nothing forced, realism 2, turns 1-251; `tools/civ6lab/runs/event_history_lab4_*.txt`): 239 of 251 turns carried an event, one slot each, and a NUCLEAR_ACCIDENT_MAJOR fired unforced once (C-1). Floods, eruptions and droughts ran far above their `OccurrencesPerGame` (FLOOD_MODERATE 26 against 2, VOLCANO_GENTLE 39 against 4) while tornadoes, hurricanes and blizzards sat near theirs — the parameter is a weight over eligible sites, not a count.
  - BUILD, measured against a 205-turn event history: Civ 6 fires AT MOST ONE random event per turn — the log carries a single slot per turn and 79 of 175 turns held one — drawn from the events currently ELIGIBLE, with `OccurrencesPerGame` as a WEIGHT and not an expected count or a cap (a parameter of 1 fired fourteen times, a parameter of 23 fired nine). Eligibility is what the map supplies: floodplains for a flood, a volcano for an eruption, a reactor past its `MinTurnAtRisk` for an accident — which is why `ERUPTION_CHANCE_PER_VOLCANO` had no per-object counterpart to find. `disasterPhase` rolls each family on its own clock (`nextRandom(state) < FLOOD_CHANCE * rate`, and again for drought) and can fire two in a turn where the game fires one; the per-turn chance readers (`GameClimate.GetFloodPercentChance` and friends) report the realised chance for THAT map, so they are a validation target, not a constant to copy.
- **C-81. THE TILE SWAP'S REACH.** Weight 1.
  The verb ships on both engines (`swapTileOk` / `_swap_tile_ok`, applied from the record's `swapTiles` in `applySeatActionRecord` / `_apply_citizens`): the tooltip's three refusals (a district, a wonder, next to the other city's centre), the Golf Course's and Open-Air Museum's `noSwap`, same seat and another living city only, free of cost, within the claimant's work radius (3). REACHED by `tests/cpu/city/tile-swap.test.ts` and the `tile_swap` poke lane; the serve gate reaches it only when `_decide_swap` fires.
  - MEASURED, lab 4 (2026-09-23; `tools/civ6lab/swap_*.lua`, two cities of seat 0 four hexes apart, the sibling's plots placed by `WorldBuilder.CityManager():SetPlotOwner`): `CityManager.GetCommandTargets(claimant, SWAP_TILE_OWNER, params)` offers a plot only when `params[PARAM_SWAP_TILE_OWNER]` carries a value (ANY value — nil refuses the command outright; the UI passes its interface-mode parameter). Offered: the sibling's plots at distance 1, 2 and 3 from the claimant's centre that TOUCH a plot the claimant owns; refused: one at distance 4 that touches the claimant's land, one at distance 2 that does not, and the sibling's ring 1. A performed swap (`RequestCommand` with the same parameter) moved the plot on the next frame and left both cities' next-border-plot culture cost unchanged (5 and 5; the reading also stayed 5 across a gold purchase, so it is a weak instrument this early).
  - BUILD: the ADJACENCY clause — the claimed plot must be adjacent to a plot the claimant city already owns — on both engines (`swapTileOk` / `_swap_tile_ok` test the radius only). Forum reports agree (forums.civfanatics.com 644094, 642399).

## Harness — not weighted

- **A-51. SEAT 0 WHERE THE INSTRUMENTS DO NOT LOOK.**
  - BUILD: `SimInit` fills ROW 0 of the city planes differently (`city_center` -1 where the other rows start at 0, `city_hp` `cityMaxHp` where they start at 0). Make every row start alike, or name the reader that needs it.
  - BUILD: `createGame({opponents})` (`cpu/core/game.ts`) opens a game as seat 0 plus opponents through `placeSeats` (`cpu/core/phase.ts`), a second placement path beside `seeder/place.ts`, and `createGameFromMap` pre-creates seat 0 (`loadWorld` then back-fills the rest). Tests and `tools/cpu/perf-turns.ts` are its only users: move them to seeded worlds and delete it.
  - BUILD: `Seat.aggression` is a driver preference weight stored as engine state (`cpu/core/types.ts`, `world/file.ts`, `cpu/export/planes.ts`, read by `cpu/core/observe.ts`). It belongs to the driver.
  - BUILD: `tools/gpu/seat_symmetry_check.py`'s `FORK_PATTERNS` match none of the forms above: a literal row passed as an argument, `_base[:, 0]`, `c["seat"]) == 0`. Teach it those, so a clean run means more than its patterns.
- **A-52. SWITCHES THAT ARE ALWAYS ON, AND RULE READS WITH DEFAULTS.**
  - BUILD: `GOVERNMENTS_ADOPTION_LIVE`, `CITY_RELIGION_ADDER_LIVE`, `BARB_SCOUT_OPENER_LIVE`, `ADMIRAL_MARCH_LIVE`, `DEDICATION_PAYOUTS_LIVE`, `ENGINEER_LIVE`, `SCRIPTED_CAMPUS` and `embarkState.live` are all `true`; their `false` arms are dead on both engines, and several ship as rules keys the GPU gates on. Delete each flag, its arms and its key in one commit.
  - BUILD: keys exported and applied by neither engine: `admiralMarchLive`, the campus scaffold's `active` and `campusUnlockTech` (read into `_admiral_march_live`, `_campus_active`, `campus_unlock_tech`, never used). Stop exporting them; `tools/gpu/rules_reader_census.py` then needs no literal for them.
  - BUILD: the GPU reads `formalWarMinTurns` into `_formal_war_min` and never uses it, while TS `denounceAged` (`cpu/core/seats.ts`) reads `FORMAL_WAR_MIN_TURNS`. Confirm the GPU's formal-war casus belli takes the same 5 turns from elsewhere; if not, it is an A entry.
  - BUILD: the GPU's `improvements_on` / `districts_on` gate sections the exporter always ships, and about 600 `.get("key", <number>)` rule reads in `gpu/core` carry a second, unsourced copy of each magnitude. Index the rules directly so a missing key fails loudly.
- **A-53. THE TS VERB LAYER ONLY TESTS DRIVE.**
  - BUILD: `cpu/core/game.ts`'s queue, purchase, research, government, policy and religion verbs (`queueSettler`, `queueDistrict`, `queueBuilding`, `queueWonder`, `purchaseBuilding`, `purchaseUnit`, `cancelQueueItem`, `setTechResearch`, `setCivicResearch`, `setGovernment`, `setPolicy`, `toggleLockedTile`, `choosePantheon`, `foundReligion`, `enhanceReligion`), `cpu/core/units.ts`'s `orderMove`, `queueUnit`, `builderImprove`, `builderRepair`, and `spreadReligiousPressureForTest` have no engine caller. `setGovernment` is the only writer of `government.current`, which keeps a second government path alive in `governmentSlots` and `seatTurn.ts`. Move those tests onto the action record and the applier, then delete the layer and `government.current`.
  - BUILD: `serialize` / `deserialize` (`cpu/core/game.ts`) back-fill old save shapes (`growthBox` to `foodBox`, `legacyCamps`) for one test; the re-exports `GENERAL_AURA_CS` / `GENERAL_AURA_RANGE` (`combat.ts`) and `nextRandom` (`units.ts`) still have importers; `policy/ladder.py`'s `_best_in_lane` has no caller. Delete each.
