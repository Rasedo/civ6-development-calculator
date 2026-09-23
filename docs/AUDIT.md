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
| B-24r governor tails | 1 | Foreign Investor and Affluence wait on C-38; Renewable Subsidizer and Industrialist on C-1; Arms Race Proponent's +30% on the three nuclear projects |
| B-31r trade-route tails | 1 | `PLUNDER_ROUTE_GOLD` 50 is DLL; the destination's free choice is P8 |
| B-56r inert promotions | 1 | Ground Crews heals a DEPLOYED fighter; its patrol half is no verb |
| B-D unsourced data values | 1 | per-city war weariness (DLL); GAME_SPEED shape |
| B-81 rows Gathering Storm deletes | 1 | 26 live constants sourced from `Expansion2_RemoveData.xml` deletes |
| **B. Fidelity vs real Civ 6** | **5** | |
| C-1 power | 1 | the accident's gates and payloads (measured), one LAB line on the damage table; a minor's grid when C-38 gives one a load |
| C-2 diplomatic agreements | 1 | the promises' engine half |
| C-16 the spy's second half | 1 | the escape's scale (ask 14) |
| C-20 Mountain Tunnel's route multiplier | 1 | DLL — the modifier carries no arguments |
| C-22 Preserve housing table | 1 | middle bands stylized; the row is not in this install |
| C-26 civilization abilities, the residue | 1 | three unread DLL clauses; the visibility gate's three requirement sets |
| C-34 air combat's second half | 1 | Patrol and Priority Target carry no data |
| C-38 a city-state's city | 1 | what it SPENDS gold and faith on (ask 9); its grid (C-1) |
| C-41 Volcanic Soil | 1 | the proportion painted per severity, and the severity roll itself (LAB) |
| C-49 named storms | 1 | the per-step draw is inferred from resultants, not watched step by step (LAB) |
| C-60 the Free City's own play | 1 | its defence floor, its granted defenders, its amenity need — measured |
| C-74 per-game counts over per-object rolls | 1 | one event a turn, a weighted draw over the eligible |
| C-79 unique INFRASTRUCTURE absent | 1 | the tile-swap refusal; the Stepwell's two adjacencies |
| C-80 constants vs the install | 1 | one rule the reader census names (noSwap) |
| **C. Absent systems** | **14** | |
| **OPEN, TOTAL** | **19** | |

## The question ledger — owner asks

A question the SOURCE under-determines; neither engine ships a branch until
the owner rules or the live game answers. A ruled or measured line is
written into its entry and leaves this list. Numbers are stable (the lab
scenes cite them), so the gaps are closed asks.

| ask | entry | the question | where the answer comes from |
|---|---|---|---|
| 9 | C-38 | what a city-state SPENDS gold and faith on. OBSERVED: it banks income minus upkeep and bought one defender when its army fell (~207 gold, 4 units -> 1); faith untouched, and two 40-turn bank snapshots moved without a purchase. **OWNER: is this AI behaviour (the row leaves under the 2026-09-20 ruling) or an engine rule (a lab watch)?** | the owner, then LAB if it stays |
| 14 | C-16 | the spy's ESCAPE: the install's terms are all levels (`ESPIONAGE_ESCAPE_BASE_CHANCE` 10, `_LEVEL_BOOST` +1, `_COUNTERSPY_LEVEL_MODIFIER` -1, `_POLICE_CORRECT_MODIFIER` -4, Ace Driver 4) and no row gives the SCALE or a route term; this engine's base is per route (Airplane 40 / Boat 50 / Vehicle 60 / Foot 70). One measured point (level 2, on foot, escaped) rules nothing out | LAB (a spy BOUGHT in a city travels in; gold and spies are both one socket call now) |

## A. Engine vs engine

No open entry. The digest is the only instrument for this class; a round
that widens what the gate reaches is worth more here than one that re-reads
the exporter, and a hunt catch opens an entry here only when it cannot
close in the same commit.
## B. Fidelity vs real Civ 6 — shipped mechanics with open tails

- **B-24r. GOVERNOR TAILS.** Weight 1.
  - BLOCKER C-38: Foreign Investor needs a minor that accumulates strategic resources; Affluence copies the ground's luxuries because a minor improves nothing.
  - BLOCKER C-1: Renewable Subsidizer and Industrialist wait on the plants.
  - BUILD Arms Race Proponent: three `MODIFIER_SINGLE_CITY_ADJUST_PROJECT_PRODUCTION` rows, Amount 30 each, on PROJECT_MANHATTAN_PROJECT, PROJECT_OPERATION_IVY and PROJECT_BUILD_NUCLEAR_DEVICE (Expansion1_Governors.xml) — all three projects exist in the catalog; the old "waits on the armament projects" was false.
- **B-31r. TRADE-ROUTE TAILS.** Weight 1.
  - DLL: `PLUNDER_ROUTE_GOLD` 50. `GlobalParameters.xml` carries no row with PLUNDER in its name at all, and the only trade-route plunder rows anywhere (Lisbon's immunity, an Admiral's bonus) publish no figure. The district `PlunderAmount` column (25 / 50) is sourced and ships, and so are the two plunder percentages (Total War 50, Letter of Marque 100); only the route's base is a model number.
  - P8: the destination is one candidate row plus take/skip; the free-choice head is P8 work.
- **B-56r. THE INERT PROMOTIONS.** Weight 1.
  - BUILD: GROUND_CREWS reads "Heal while patrolling or deployed" (`Promotions_Text.xml`), and its one modifier `GROUND_CREWS_BONUS_HEALTH` / `MODIFIER_PLAYER_UNIT_GRANT_HEAL_AFTER_ACTION` carries no argument and no requirement set — the modifier type is the whole rule and the engine's own healing supplies the number. The PATROL half is no verb anywhere: no `UNITOPERATION_PATROL`, no command, no promotion in any layer, and the live game offers no air-patrol stance (C-34). The DEPLOYED half is an air unit sitting at its base, which both engines already model (`cpu/core/air.ts` / the GPU's air rows) — so the promotion is buildable on that half and the entry is not a wait.
- **B-81. ROWS GATHERING STORM DELETES.** Weight 1.
  The provenance checker follows `<Delete>` through the schema's foreign keys now, and 26 catalog constants turn out to cite rows `DLC/Expansion2/Data/Expansion2_RemoveData.xml` deletes; `docs/PROVENANCE.md` lists them as known red. Each mechanic is still paid on both engines.
  - BUILD, delete: the nine governments' ACCUMULATING bonuses (`*_ACCUMULATING`, `bonus.increment` / `bonus.interval` in `cpu/data/policies.ts`) — deleted with no replacement row anywhere in the Expansion2 layer; the same for America's per-government legacy rates (`TRAIT_*_BONUS_RATE`, `legacyRate.AMERICA.*`), where `Expansion2_Civilizations.xml` rewrites Founding Fathers' description and attaches new modifiers — source those and replace.
  - BUILD, delete: the Genghis Khan great general (`GREAT_PERSON_INDIVIDUAL_GENGHIS_KHAN`, `cpu/data/greatPeople.ts`).
  - BUILD, re-source: the building-yield doublings of Simultaneum, Grand Opera, Rationalism and Free Markets (`policies.*.effects.buildingYieldBoost.pct`) — the Expansion2 layer's copy of `Expansion1_Policies.xml` attaches NEW modifier rows to those four policies; read them and pay what they say.
  - BUILD: `cpu/data/boosts.ts` still words CHEMISTRY's boost as a research agreement; the layered install's trigger is `BOOST_TRIGGER_HAVE_ALLIANCE_LEVEL_X` with NumItems 2. And `tools/civ6lab/xml_modifiers.py` ignores `<Delete>` and reads every DLC Data folder, scenarios included.
  - The same file deletes more (Patriotic War, Police State, Machiavellianism, Military Research, New Deal, Public Transport, E-Commerce modifiers) — none of those is cited by a catalog tag today; check each against the engines' policy effects while here.

- **B-D. UNSOURCED DATA VALUES.** Weight 1.
  - DLL: the PER-CITY war-weariness split. The install's numbers are `WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_{AT_WAR_CITY 3, FOUNDED_CITY 0, NONFOUNDED_CITY 1}`, `_POINTS_FOR_AMENITY_LOSS 400`, `_PER_COMBAT_IN_{ALLIED 1, FOREIGN 2}_LANDS`, `_PER_UNIT_KILLED 3`, `_PER_WMD_LAUNCHED 10`, `_DECAY_{PEACE_DECLARED 2000, TURN_AT_PEACE 200, TURN_AT_WAR 50}`, `_WARMONGER_BASE 16` — re-read in `GlobalParameters.xml`, all thirteen still there and still the whole of it; how the per-city rows compose is not published. The empire-wide rule ships (`warWearinessPenalty`).
  - `GAME_SPEED` 0.6 is a SHAPE difference: real Civ 6 scales cost, yield and turn tables independently.
  - Oligarchy and Classical Republic are adopted in NO game (`computeAdoption` / `_adopted_gov` take the newest tier); their rows are held by the two government lanes' borrowed-row drills only.

## C. Absent systems — the blockers, and the gaps waiting on them

- **C-1. POWER.** Weight 1.
  - BUILD, the ACCIDENT, measured on three FRESH reactors, one per severity. The gates are the reactor's AGE past `MinTurnAtRisk` 10 / 20 / 30 (`RANDOM_EVENT_NUCLEAR_ACCIDENT_{MINOR,MAJOR,CATASTROPHIC}`, Severity 0/1/2), and the game's own threshold reader is simply the COUNT of severities the age has unlocked (0 at age 1, 1 at 10, 2 at 20, 3 at 30). The payload is ONE PLOT — the reactor's own, never a radius — contaminated for 2 / 10 / 20 turns; -1 population at severity 2 ONLY; the Industrial Zone pillaged at severity 2 only; the plant NEVER removed, so one reactor can melt down again and again and goes on ageing. The age clock both engines ship (`City.reactorAge` / `city_reactor_age`, +1 a turn, cleared with the building) is correct against the live game. The per-turn chance is C-74's one-event draw at weight 1: zero accidents in ~150 reactor-turns at MODERATE, a 95% bound near 2% per reactor-turn.
  - LAB, one line, because the table and the game disagree: `RandomEvent_Damages` gives MAJOR a district pillaged 50%, buildings pillaged 100%, civilians killed 50% and units at 20-50 HP, and CATASTROPHIC buildings DESTROYED 100%, district pillaged 100%, population -80%; the forced events gave NO district pillage at MAJOR, ONE citizen of twelve and NO destroyed building at CATASTROPHIC. `FalloutDuration` (2/10/20) matched exactly. Whether those Percentages are per-object CHANCES (one sample cannot tell a 50% coin from a "no") or proportions needs a handful of forced accidents per severity.
  - BLOCKER C-38: a city-state's cities are never powered (`resolveSeatPower` / `_resolve_seat_power` run for majors only). Vacuous today, pinned by `minor_yields_test::test_power_vacuous`; due when the minor's ladder reaches a building with a load.
- **C-2. DIPLOMATIC AGREEMENTS.** Weight 1.
  - BUILD: the PROMISES' engine half — the four rows of `DLC/Expansion2/Data/Expansion2_DiplomaticActions.xml` (`DIPLOACTION_KEEP_PROMISE_{DONT_SPY, DONT_CONVERT, DONT_DIG_ARTIFACTS, DONT_SETTLE_TOO_NEAR}`, each with its `PromiseType`, FavorCost 30, GrievancesForRefusal 25, GrievancesPerIncursion 25) and `DIPLOACTION_DECLARE_WAR_OF_RETRIBUTION`'s `RequiresBrokenPromise="true"` (Expansion2's copy of `Expansion1_DiplomaticActions.xml`) are a grievance ledger and a casus belli, both sourced. Neither engine holds a promise: the War of Retribution's `brokenPromise` condition reads false on both (`casusBelli.ts`, `sim_seats.py`), so that war kind is never open. Whether our own scripted driver ever asks for a promise or breaks one is the DRIVER's design, not the install's; the mission's "small positive bonus in your relationship" is an opinion delta and stays out (owner 2026-09-20: the engine, not the game's AI).
  - Model lines, identical on both engines and kept as notes: a luxury has no lump to trade (the install trades ACCESS, never an amount); the intel bonus is unit-against-unit only; one running deal per ordered pair, `DEAL_ITEMS` a side, an offer standing two turns; a war does not end a standing deal; the Third Party War's "another player" is read as an ALLY.
- **C-16. THE SPY'S SECOND HALF.** Weight 1.
  - ASK 14: the escape's SCALE and route. Re-read: `ESPIONAGE_ESCAPE_BASE_CHANCE` 10, `_ESCAPE_LEVEL_BOOST` 1, `_ESCAPE_COUNTERSPY_LEVEL_MODIFIER` -1 and `_ESCAPE_POLICE_CORRECT_MODIFIER` -4 are every escape row the install has and every one of them is a LEVEL; no row gives a scale or a route term. The mission roll itself is settled and correct: the UI's own band table is 3d6 against `BaseProbability - 2` for a fresh spy, to within the truncation of 8-bit fixed point, which is what `missionOutcome` / `_mission_outcome` ship.
- **C-20. THE MOUNTAIN TUNNEL'S ROUTE MULTIPLIER.** Weight 1.
  - DLL: the pedia's "Trade Routes traveling through it can multiply the Gold they get from districts at their destination" has one XML carrier, `MOUNTAIN_PORTAL` of type `MODIFIER_MOUNTAIN_PORTAL`, and re-read across all three layers that modifier has NO `ModifierArguments` row anywhere — only the type, `COLLECTION_OWNER`, `EFFECT_MOUNTAIN_PORTAL` and three attachments. Not "unpublished pending a look": looked at, no number to find.
- **C-22. THE PRESERVE'S HOUSING TABLE.** Weight 1.
  - DLL, and beyond this install: `PRESERVE_APPEAL_HOUSING` / `preserveHousing` state the published ceiling at Breathtaking; the middle bands are this model's own. Re-checked: no `DISTRICT_PRESERVE` row exists in Base, Expansion1 or Expansion2 — it is a New Frontier Pass district, the same as the Ngao Mbeba. A sweep of which roster members this install cannot source belongs with the hygiene pass.
- **C-26. CIVILIZATION ABILITIES — THE RESIDUE.** Weight 1.
  The census is `docs/roster_ledger.json`, read as `docs/ROSTER.md` says (`shipped` on 341 of 343 modifiers, two `AI:` rows — the game's diplomatic-action preferences, outside an engine model). Unique units are C-78, unique infrastructure C-79.
  - DLL, recorded: whether Trajan's grant fires on a CONQUERED city (`TRAIT_ADJUST_NON_CAPITAL_FREE_CHEAPEST_BUILDING` is `MODIFIER_PLAYER_CITIES_GRANT_CHEAPEST_BUILDING_IN_CITY`, Amount 1, no requirement set — founding ships); whether Iteru's flood avoid also skips the fertility half (the trait's modifiers are fourteen `TRAIT_FLOODPLAINS_VALID_*` placement rows and two `TRAIT_RIVER_FASTER_BUILDTIME_*` — NO modifier carries the avoid at all); whether the Knarr's Ocean clause reaches a Trader's course (`ABILITY_KNARR_IGNORE_EMBARK_DISEMBARK_COST` IS tagged onto `CLASS_LANDCIVILIAN`, which `UNIT_TRADER` carries, so the open half is only whether `MODIFIER_PLAYER_UNIT_ADJUST_IGNORE_SHORES` — no arguments — reaches a trade route's water path; `tradeWaterLevel` stays Cartography-gated).
  - BUILD, the residue: resource VISIBILITY ships for the seven strategics (`Resources.PrereqTech` — `hiddenResourcesFor` / `_res_hidden`: no tile yield, no improvement forced or offered, no access, no accrual, no Grand Bazaar count, and the Stave Church counts only the coastal resources its owner can see). A district or wonder may stand on a hidden strategic (the install allows it; the resource is lost). The adjacency and belief improvement clauses still read the resource whether or not the seat can see it on BOTH engines — and that is NOT a DLL question: `REQUIREMENT_PLOT_RESOURCE_VISIBLE` exists and is written EXPLICITLY into the three sets that want it (`PLOT_HAS_STRATEGIC_MINE_REQUIREMENTS` in `Beliefs.xml`, `STAVE_CHURCH_SEA_RESOURCE_REQUIREMENTS` in `Buildings.xml`, `PLOT_HAS_STRATEGIC_RESOURCE` in `Expansion1_Governors.xml`), so a requirement set that does not name it reads the resource regardless. Gate those three and nothing else. The two artifact resources' `PrereqCivic` gates have no reader (no archaeology here).
  - Recorded allowlist: a CITY's own ranged strike composes its defender without the roster's rows (`cityStrikeStrength`'s block in `seatPhase`; the site census in `combat-rows.test.ts` / `combat_rows_test.py` names it).
- **C-34. AIR COMBAT'S SECOND HALF.** Weight 1.
  - DLL: PATROL is not a data row (no `UNITOPERATION_PATROL`, no command, no promotion in any layer, re-grepped) — it is the UI's name for a fighter sitting ready, and the live game exposes no stance to enter.
  - DLL: PRIORITY TARGET is a command with no data — `UNITCOMMAND_PRIORITY_TARGET` (`Expansion1_UnitCommands.xml`) has a category, an interface mode, an icon and a label, and no argument, requirement set or magnitude in any layer.
- **C-38. A CITY-STATE'S CITY.** Weight 1.
  Its food and culture ride the majors' own composers (`seatGrowth`, `cityBorderGrowth` / `_seat_city_growth`, `_seat_border_growth`); gold and faith only bank in `CityState.treasury` / `.faith`.
  - ASK 9, then BUILD: a minor with fewer than N military units and a bank over a unit's price buys its best trainable land unit — N and the price threshold are the ask's magnitude. Re-read: `GlobalParameters.xml` holds five rows with MINOR in the name — four start-placement distances and `WARMONGER_FINAL_MINOR_CITY_MULTIPLIER` — and none names a city-state purchase, build weight or reserve.
  - BLOCKER C-1: its grid, when the ladder reaches a load.
  - B-24r's Foreign Investor and Affluence wait on a minor that improves and accumulates.
- **C-41. VOLCANIC SOIL.** Weight 1.
  The affected set is the RADIUS-1 RING, which both engines already scorch and fertilize (`disasterPhase` over `neighbors(map, volcano)`, the GPU over `neigh[volcano]`); the carrier (`addFeature` / `_add_feature`) is in.
  - LAB, then BUILD: PAINT. Measured over four eruptions: the soil replaces a standing feature on a PROPORTION of the ring (5/6, 2/3, 1/3 seen; gentle 0/6 and 1/1); an improvement on a painted tile is pillaged or removed; a bonus resource on a ring tile, land or sea, can be destroyed. The proportion per severity and pillaged-vs-removed need a dozen eruptions per severity; the engine rolls no eruption SEVERITY at all. The XML's own split, re-read — `RANDOM_EVENT_VOLCANO_GENTLE` takes `LOC_RANDOM_EVENT_PROP_DAMAGE_FERTILITY`, `_CATASTROPHIC` and `_MEGACOLOSSAL` take `..._ALL_...` — suggests the ruling: catastrophic+ paints every eligible ring tile, gentle a rolled share; a painted tile's improvement pillaged, its resource kept.
- **C-49. NAMED STORMS.** Weight 1.
  `stormWalk` / `_storm_walk` ship the measured model: eight unit steps on the movement turn from the `PrevailingWinds` band at the centre's current latitude, eight more with no footprint on dissipation.
  - LAB: the PER-STEP DRAW is inferred from 31 resultants (4-8 hexes in open water, 1-5 against the ice, always inside the band, with off-axis wobble one heading times eight cannot make), not watched step by step; a scene that reads the record's `CurrentLocation` mid-turn would confirm or refute it. Cheaper than it was: `GameRandomEvents.GetEventsForTurn(t)` hands back one record per turn with its `CurrentLocation`.
- **C-60. THE FREE CITY'S OWN PLAY.** Weight 1.
  The seat is in on both engines (revolt, race, join, Eleanor's skip, open to attack, the religion walk).
  - BUILD, its DEFENCE, watched for ten turns after a real revolt: the free seat has a defence floor of ITS OWN — a flat 72 with no walls standing, where the same city read 53 under its founder WITH walls and 43 under its captor. `cityBaseStrength` floors at 15 plus the walls tier plus a garrison, which cannot produce that. The centre heals at the ordinary rate (40 -> 20 -> 8 -> 0 over four turns), and the city STRIKES what stands beside it (an adjacent undamaged Archer read 73 damage on the first turn). Its defenders are GRANTS, not production: two Men-at-Arms exist on the flip turn itself on the tiles either side of the centre, a Crossbowman arrives five turns later, and the build queue held BUILDINGS throughout — it trained no unit in ten turns. Its own loyalty resets to 100 at the flip and falls again at -9/-10 a turn.
  - BUILD, its AMENITIES: a Free City keeps the FULL amenity need of its population (5 at pop 9, the same as any city) and loses nearly all supply — it sat at 0-2 against 5 every turn of the watch, UNREST or UNHAPPY throughout, and never reached REVOLT. `CivilizationLevels` has no amenity column; the tier is the ordinary ladder over a seat with no luxuries and no policies, and the per-source getters do not name everything in the total.
- **C-74. PER-GAME COUNTS OVER PER-OBJECT ROLLS.** Weight 1.
  - BUILD, measured against a 205-turn event history: Civ 6 fires AT MOST ONE random event per turn — the log carries a single slot per turn and 79 of 175 turns held one — drawn from the events currently ELIGIBLE, with `OccurrencesPerGame` as a WEIGHT and not an expected count or a cap (a parameter of 1 fired fourteen times, a parameter of 23 fired nine). Eligibility is what the map supplies: floodplains for a flood, a volcano for an eruption, a reactor past its `MinTurnAtRisk` for an accident — which is why `ERUPTION_CHANCE_PER_VOLCANO` had no per-object counterpart to find. `disasterPhase` rolls each family on its own clock (`nextRandom(state) < FLOOD_CHANCE * rate`, and again for drought) and can fire two in a turn where the game fires one; the per-turn chance readers (`GameClimate.GetFloodPercentChance` and friends) report the realised chance for THAT map, so they are a validation target, not a constant to copy.
- **C-79. UNIQUE INFRASTRUCTURE ABSENT.** Weight 1.
  Every district, building and improvement row is built.
  - BUILD, one clause with no carrier, recorded on the column that names it: "Tiles with <row> cannot be swapped" (Golf Course, Open-Air Museum) — the sentence is text only, no XML column carries it, and no tile-swap verb exists here to refuse.
  - BUILD: the Stepwell's "+1 Faith beside a Holy Site, +1 Food beside a Farm" IS sourced after all — `STEPWELL_FARMADJACENCY_FOOD` and `STEPWELL_HOLYSITEADJACENCY_FAITH`, both `MODIFIER_SINGLE_PLOT_ADJUST_PLOT_YIELDS` with Amount 1 and the requirement sets `PLOT_ADJACENT_TO_FARM_REQUIREMENTS` / `PLOT_ADJACENT_TO_HOLYSITE_REQUIREMENTS`, attached to `IMPROVEMENT_STEPWELL` in `Improvements.xml`. It is carried by MODIFIERS, not by an `Improvement_Adjacencies` row, which is the whole reason the earlier sweep read it as unpublished.
  - Out of scope by construction: LEY LINE adjacency (a Secret Societies resource class this map never places).
- **C-80. CONSTANTS VS THE INSTALL.** Weight 1.
  The instruments: every catalog constant carries a source tag (`cpu/data/provenance.ts`); `tools/civ6lab/xml_check.py check --baseline docs/PROVENANCE.md` and the reader census (`tools/gpu/rules_reader_census.py`) run in battery stage 0 as RATCHETS — a new disagreement or a new unread key is red.
  - The ONE RULE the reader census still names (its baseline line stays red-listed until built):
    6. BUILD: `improvements.noSwap`: C-79's tile-swap refusal.

## Harness — not weighted

No open entry.
