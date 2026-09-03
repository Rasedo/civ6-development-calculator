# Engine audit — open items

THIS FILE IS A LIST OF OPEN ITEMS. Nothing else belongs in it. A
resolved entry is DELETED, not annotated — what was fixed, when and why
is the git log's job. Everything below is open work, stated against the
current engine by symbol.

**RULES (owner):**
- Every note anchors code BY SYMBOL — function/method/class/exported
  constant — never by line number. Line numbers rot; symbols grep.
- VERIFY-BEFORE-IMPLEMENT: every fidelity claim is checked against a
  real Civ 6 source before implementation — never off residual text,
  briefs or comments. Unverifiable magnitudes are recorded, not
  invented.
- SOURCE OF TRUTH is real Civ 6. Reachability is never a licence to
  deviate; gates prove the two engines agree, never that they agree
  with Civ 6.
- Every landed mechanic records WHICH lane can reach it. A green gate
  over an unreached mechanic proves nothing.
- NOTHING IS CLOSED BY RECORDING ALONE (owner, 2026-08-19). A fidelity
  gap deferred because a mechanic is unimplemented becomes TWO open
  items: one for the missing mechanic, one for the deferred gap (naming
  the mechanic item as its blocker). "Recorded, not fixed" /
  "descoped" / "unmodeled" are deferrals, never permanent closures.

**State:** P8 training PARKED until this file is clean. The battery is
GREEN end to end (serve: 12 seeds x 250 turns, digest per turn per
group). Restore the seed set to 24 before the final hunt — 12 is a
temporary dev-speed cut. All surviving `_LIVE` master switches are ON
(GOVERNMENTS_ADOPTION, B18_FOLLOWER_COUPLING, CITY_RELIGION_ADDER,
ADMIRAL_MARCH, DEDICATION_PAYOUTS, ENGINEER, BARB_SCOUT_OPENER); no
mechanic is inert behind a flag.

## What is left (owner-requested; guesstimates)

No "% complete" — it needs the weight of everything already CLOSED as a
denominator, and closed entries are deleted here by design, so it could
only ever be a delta chain, and delta chains drift. What replaces it is
the OPEN weight, hand-weighted 1–8 by implementation size, recomputable
from the list below.

| Open item | Weight | What is open |
|---|---|---|
| **A. Engine vs engine** | **0** | |
| B-20r tourism tails | 1 | the park rhombus has no canonical vertical |
| B-21r suzerain rows | 1 | the descoped rows each need a whole absent system; Geneva's magnitude is flat where the source scales |
| B-22r World Congress | 1 | the scored-competition catalog holds one row |
| B-24r Ages/governors | 1 | Affluence copies the GROUND (a minor improves nothing here) and Foreign Investor waits on a minor that accumulates anything, nine promotion clauses on a named absent system |
| B-31r trade-route tails | 1 | plunder gold is a stylization; the course depth is a capacity six (the ledger's); the summed-yield key and one-candidate head are P8-surface |
| B-D unsourced data values | 2 | channel-blocked government tails, and the shape differences / model tuning no source can close |
| B-39r wonder effects still dropped | 1 | two residuals, blocked on B-20r's per-work TYPE names |
| B-54r flanking and support vs their own page | 1 | the two stacks a UNIQUE UNIT raises wait on C-26 |
| B-56r the inert promotions | 1 | three of a hundred rows name a mechanic neither engine has — sight-blocking, a PATROL order, and one magnitude the source never published |
| B-51r Encampment residuals | 1 | a capture leaves the district's own pool standing (unsourced either way) |
| B-61r the Great Person clauses with no carrier | 2 | 10 rows name a mechanic nothing here has (tourism x4, regional range x2, CS absorption, barbarian conversion, ocean passage, Tupac Amaru's per-district undefended grant walk); Goddard's visibility grant and Shah Jahan's gold-buyout SHIP now; Mary Leakey's tourism clause has a per-rival bank to read now and still no carrier |
| B-34r flood tails | 1 | the climate/coastal tails wait on systems that do not exist here |
| B-63r the grievance ledger's magnitudes | 1 | the gang-up bar is a heuristic — no source publishes the AI threshold |
| B-62r a suzerain improvement's adjacency stops at the wonder tile | 1 | the Preserve band pays it (Grove) and a pantheon feature yield is vacuous there; the adjacency half is unsourced either way |
| B-66 formations | 1 | the merged unit's hit points and spent turn are unsourced; a direct-trained formation's strategic-resource charge is modelled at the single unit's; an escort formation is a PAIR here, and a dragged rider lifts no fog |
| B-67 the district price MODEL | 1 | the per-row BASE and the per-row under-represented DISCOUNT now come from the install (`Districts.Cost` and `CostProgressionParam1`), so an Aqueduct no longer costs a Campus and the two plaza rows take 25% where every other row takes 40. What is still one curve for all is the PROGRESSION MODEL: the install splits COST_PROGRESSION_NUM_UNDER_AVG_PLUS_TECH (the specialty rows, the Government Plaza, the Diplomatic Quarter, the Aerodrome) from COST_PROGRESSION_GAME_PROGRESS (the Aqueduct, Canal, Dam, Neighborhood and the Mbanza), and the two formulas are DLL-side — this engine runs the tech-driven one for both |
| **B. Fidelity vs real Civ 6** | **18** | |
| C-1 POWER | 1 | the accident roll and the decommission projects' score are unpublished |
| C-2 diplomatic agreements | 2 | the mission's mark on the relationship, demand and discuss, Religious 3's pressure clause (sourced at 20%, blocked on C-46's scale), the queue-front purchase, and ALLIANCE_POINTS_FOR_DEAL |
| C-5 strategic-resource stockpiles | 1 | Zanzibar's two exists-nowhere-else luxuries (B-21r) |
| C-16 the spy's second half | 1 | the district a spy should stand on, the buildings Sabotage should pillage, a released spy's lost level, and the model values a published number would replace |
| C-20 the Military Engineer's build list | 1 | the Mountain Tunnel — SOURCED (Chemistry, an adjacent mountain, a portal between tunnels at 2 Movement) and unbuilt: a movement portal is a new pathing class on both engines |
| C-22 the district roster | 1 | the Preserve table is a stylization |
| C-26 civilization uniques | 8 | THE ROSTER IS THE INSTALL'S (34 civilizations, 38 leaders, `CIV_LEADERS`; the seeder draws each world's trio) and docs/ROSTER.md lists every clause off the XML — 149 effect types over 344 modifiers; FOUR civilizations ship in full (Rome, Egypt, Norway, Sumeria); the other 30 seat as plain civilizations until their batch — docs/roster_ledger.json marks each modifier shipped/open and docs/ROSTER.md renders it. 286 of the 344 modifiers ship, and the other 58 are each OPEN against a named blocker — the triage is complete, with no modifier left untriaged. SHIPPED BY EFFECT TYPE: EFFECT_ADJUST_PLOT_YIELD (31 rows — Laurier, Mit'a, Mali, Mana, Mother Russia; Mit'a's mountain rows pay once EFFECT_ADJUST_PLAYER_TERRAIN_WORK_IMPASSABLE_MODIFIER lets a citizen work one); EFFECT_ADJUST_BUILDING_PRODUCTION and EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION (England, Georgia's three walls, the Netherlands, the Ottomans' siege line); EFFECT_DISTRICT_ADJACENCY (Meiji Restoration); EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL (Radio Oranje); EFFECT_ADJUST_TRADE_ROUTE_CAPACITY (Nîhithaw, Founder of Carthage); the GRANTED ABILITIES that are flat Combat Strength under a clause (Barbarossa vs city-states, Tomyris vs the wounded and her heal on a kill, Genghis Khan's cavalry, Hojo's coasts, the Great Turkish Bombard on the ASSAULT — a ranged strike on a city is unread), embarked Movement (Mana, the Mediterranean Colonies' Settlers) and ignore-shores (the Knarr, the Colonies); EFFECT_ADJUST_DISTRICT_PRODUCTION (Divine Wind's three districts, the Netherlands' Dam) and EFFECT_ADJUST_ALL_BUILDING/UNIT_PRODUCTION_MODIFIER (Songs of the Jeli's -30%) and EFFECT_ADJUST_UNIT_PRODUCTION (England's Military Engineers); EFFECT_RIVER_ADJACENCY (Grote Rivieren's three districts); EFFECT_TERRAIN_ADJACENCY (Mali's desert centre); EFFECT_ADJUST_CITY_GREATWORK_YIELD (Nkisi's Relic and Artifact rows) and EFFECT_ADJUST_GREAT_PERSON_POINTS_PERCENT (its three classes); EFFECT_ADJUST_CITY_YIELD_FROM_POWERED_BUILDING, EFFECT_ADJUST_CITY_EXTRA_ACCUMULATION_SPECIFIC_RESOURCE, EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP and EFFECT_ADJUST_UNIT_BUILD_CHARGES (Workshop of the World); EFFECT_ADJUST_PLOT_PURCHASE_COST_TERRAIN, EFFECT_ADJUST_EXTRA_ACCUMALATION_TERRAIN and EFFECT_ADJUST_IMPROVEMENT_VALID_TERRAIN (The Last Best West); EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_IMPROVEMENT_IN_TARGET_CITY (Favorable Terms, both sides); EFFECT_GRANT_UNIT_IN_CITY and EFFECT_GRANT_SPY (the Cree Trader at Pottery, Catherine's Spy and capacity at Castles, Kupe's Builder) and Kupe's first-city Population, Palace Housing and Amenity and pre-settlement Science and Culture. EFFECT_ADJUST_CITY_HAPPINESS_YIELD and EFFECT_ADJUST_CITY_HAPPINESS_GREAT_PERSON (the Scottish Enlightenment, on the amenity tier both engines already keep); EFFECT_ADJUST_PLAYER_GOVERNMENT_SLOT_TYPE (Plato's Republic, the Holy Roman Emperor); EFFECT_ADJUST_UNIT_POST_COMBAT_YIELD (Gorgo's Culture and Tamar's Faith, half the defeated unit's strength, a barbarian victim included) with Thermopylae's per-slotted-policy strength; EFFECT_FEATURE_ADJACENCY (the Amazon's four districts). EFFECT_ADJUST_PLAYER_TERRAIN_WORK_IMPASSABLE_MODIFIER (Mit'a — a citizen works a MOUNTAIN, which is what the mountain plot-yield rows were waiting for); EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_TERRAIN_FOR_DOMESTIC (Qhapaq Ñan); EFFECT_ADJUST_CITY_YIELD_MODIFIER and EFFECT_ADJUST_GOVERNOR_IDENTITY_PRESSURE (the Toqui, tripled in a city it did not found); EFFECT_ADJUST_CITY_IDENTITY_PER_TURN (Isibongo's garrison); EFFECT_ADJUST_CORPS_ARMY_PREREQ and EFFECT_ADJUST_CORPS_ARMY_MODIFIED_STRENGTH (Shaka's land formations, Spain's naval ones). EFFECT_ADJUST_CITY_YIELD_MODIFIER_PER_GOVERNOR_TITLE (Hwarang — 3% Culture and Science per promotion the established governor has earned, its first included); EFFECT_ADJUST_GREAT_PERSON_POINTS and the Diplomatic Favor on a person earned (the Nobel Prize — the favor rides the CLAIM, so patronage pays it too); EFFECT_GRANT_PLAYER_SPECIFIC_TECHNOLOGY (Mana's Sailing and Shipbuilding, laid down at fixture load on both engines) and EFFECT_ADJUST_UNIT_VALID_TERRAIN (Mana's Ocean, which also turned the Knarr's hard-coded NORWAY string into a row); EFFECT_ADD_RELIGIOUS_BUILDING_MULTIPLIER and the worship building's discount (Righteousness of the Faith — a tenth of the Faith price, +10% Science, Faith and Culture where one stands); EFFECT_ADJUST_PLAYER_DISTRICT_CREATE_UNIT (Religious Convert's Apostle on a Theater Square); and Mvemba's three DLL-side bans (no Holy Site, no Great Prophet, no founding) plus Mana's two (no harvest, no Great Writer) as `SEAT_BAN_ROWS`, one ban index space both engines address by position. EFFECT_ADJUST_EXTRA_UNIT_COPY_TAG (People of the Steppe — a second LIGHT cavalry unit per one TRAINED, through the Venetian Arsenal's own door; the chassis now carry the install's PromotionClass as `cavalryTag`, read only by `isLightCavalry`); EFFECT_ADJUST_POPULATION_AFTER_CONQUEST, EFFECT_ADJUST_TRAIT_AMENITY and EFFECT_ADJUST_CITY_IDENTITY_PER_TURN (the Great Turkish Bombard — the whole population survives a capture, and a city the Ottomans did not found pays +1 Amenity and +4 Loyalty, both off ONE `notFoundedSum` / `_not_founded_sum` reader); EFFECT_ADJUST_CITY_EXTRA_DISTRICTS (Free Imperial Cities — the GPU's district cap was inlined at TWO sites and is now `_district_cap`); EFFECT_ADJUST_PLAYER_CITY_TILES (Mother Russia — five SECOND-ring tiles at founding, in ascending tile index so both engines claim the same ground; the install's Amount is 5, not the eight the prose implies); EFFECT_ADJUST_TECHNOLOGY_BOOST and EFFECT_ADJUST_CIVIC_BOOST (Dynastic Cycle — ten PERCENTAGE POINTS, and the seat row is now a REQUIRED argument to `effectiveResearchCostIn` / `_eff_cost` so no call site can pay the plain fraction by omission); EFFECT_ADJUST_DISTRICT_PREREQ (The First Emperor's Canal at Masonry, REPLACING the usual edge, through one `_district_unlocked` both the mask and the queue apply ask); EFFECT_ADJUST_UNIT_BUILD_CHARGES and EFFECT_ADJUST_UNIT_SPREAD_CHARGES (Qin's Builder and Philip's Inquisitor, on the existing charge family); EFFECT_ADJUST_UNIT_EVICT_PERCENT (El Escorial — twenty-five points on Remove Heresy); EFFECT_ADJUST_WAR_WEARINESS and EFFECT_ADJUST_PLAYER_FAITH_PEACEFUL_FOUNDERS (Satyagraha — the OPPONENT's row doubles what a seat accrues, off one `_ww_enemy_mult` both GPU accrual sites ask; acquaintance between MAJORS is modelled on neither engine, so "each civilization they have met" is every live major); EFFECT_ADJUST_PLAYER_YIELD_MODIFIER_PER_TRIBUTARY (Surrounded by Glory); EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS (Grand Vizier — a title is DERIVED on both engines, so the held tech is what makes it permanent); EFFECT_ADJUST_GREAT_PERSON_POINTS_REFUND_PERCENT (Magnanimous — on the CLAIM, so patronage refunds too). EFFECT_ADJUST_RELIGION_AMENITIES_FOR_MINIMUM_FOLLOWERS (Dharma's Amenity per religion present — neither engine counts FOLLOWERS, so `religionsPresent` / `_religions_present` reads a religion with PRESSURE in the city as one with a follower, the same proxy on both sides); EFFECT_ADD_PLAYER_BELIEF_YIELD (The Last Prophet's Science per FOREIGN city following Arabia's religion) and EFFECT_ADJUST_GREAT_PERSON_GUARANTEE (its last Prophet — which needed a per-seat per-class EARNED count neither engine kept: `civ_gp_earned` now mirrors `Seat.gpEarned` on the wire's compare, since the global `gp_earned` answers how many ANYONE has claimed); EFFECT_ENABLE_BUILDING_FAITH_PURCHASE (Songs of the Jeli — the GPU's faith door was written inline at TWO sites and is now `_faith_buyable_class`); EFFECT_GRANT_PLAYER_SPECIFIC_TECH_BOOST_GREAT_PERSON (Mediterranean Colonies' Writing eureka, beside Mana's start techs); EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER and EFFECT_ADJUST_PLAYER_POST_COMBAT_LOYALTY (Swift Hawk — +10 against a seat in a Golden or Heroic Age, and 20 Loyalty off the DEFEATED side's city, 40 in a golden age; the loss rides the ONE battle-resolved hook every combat path on both engines already reaches); EFFECT_GRANT_INFLUENCE_TOKEN_LEVY_MILITARY (the Raven King's two Envoys); EFFECT_ADJUST_TRADE_ROUTE_YIELD_FROM_OTHERS and EFFECT_ADJUST_PLAYER_IDENTITY_PER_TURN_FOR_DOMESTIC_TRADE_ROUTE_ORIGIN (Radio Oranje); EFFECT_ADJUST_BUILDING_SPREAD_CHARGES (Dharma's two Missionary spreads). EFFECT_ADJUST_WONDER_ERA_PRODUCTION and EFFECT_ADJUST_CITY_TOURISM (France's Medieval-to-Industrial wonder band, inclusive at both ends, and +100% on the WONDER half of its tourism); EFFECT_ADJUST_ADJACENT_CITY_RIVER_DISTRICT/BUILDING_PRODUCTION (Pearl of the Danube — `crossesRiver` / `_river_cross` already answered the adjacency, and a building takes its own district's tile); EFFECT_ADJUST_PLAYER_IMMEDIATE_TRADING_POST, EFFECT_ADD_DIPLO_VISIBILITY and EFFECT_ADJUST_UNIT_DIPLO_VISIBILITY_COMBAT_MODIFIER (Ortoo — the post is stamped at the route's START rather than its completion, is worth a level of sight, and doubles the strength a level of advantage pays: the install's Amount 3 IS this engine's own `VISIBILITY_CS_PER_LEVEL`, so the row adds a second step); EFFECT_ADJUST_BANNED_DIPLOMATIC_ACTIONS, EFFECT_ADJUST_PLAYER_TOURISM_FAVOR and EFFECT_ADJUST_PLAYER_EMERGENCY_FAVOR_MODIFIER (Faces of Peace — the war KIND is what the ban reads, so `declareWar`'s three pure reads move ahead of its first mutation on both engines); EFFECT_ADJUST_PLAYER_ALWAYS_ALLOW_COMMEMORATION_QUEST_COUNT (Strength in Unity, the one row that reaches past the golden-age guard in `dedicationEvent`); EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_TERRAIN_FOR_INTERNATIONAL and EFFECT_GRANT_GOLDEN_AGE_TRADE_ROUTE_CAPACITY (Sahel Merchants — the international twin of the domestic per-terrain rows, counted on the ORIGIN city, and a capacity per golden age off the count both engines already keep); EFFECT_ADJUST_PLAYER_PROGRESS_DIFF_TRADE_BONUS (the Grand Embassy — neither engine compared two seats' progress before, so `progressAhead` spells it once for both). EFFECT_REPLACE_PLAYER_GOVERNMENT_SLOT_TYPE and EFFECT_ADJUST_PLAYER_GOVERNMENT_SLOT_TYPE_GRANT_FAVOR (Founding Fathers — the conversion is a MOVE, which `wonderExtraSlots` / `_wonder_extra_slots` can already say as a delta, and the favor counts the wildcards AFTER it); EFFECT_ADJUST_ALL_DISTRICT_PRODUCTION_MODIFIER (Founder of Carthage's Government Plaza city); EFFECT_ADJUST_IDENTITY_PER_TURN_FROM_NEARBY_GREAT_WORKS (both Eleanors — the loss is the FOREIGN city's, so the reader walks every rival's rows against the city being scored); EFFECT_ATTACH_MODIFIER (the Toqui's training XP, on the established-governor channel its Culture and Production already ride — `trainXpPct` / `_train_xp_pct` now take the city, required, because the clause is per city); EFFECT_ADD_PLAYER_UPGRADE_MILITARY_FORMATION_ON_CITY_CONQUEST (Isibongo — read BEFORE the transfer that pays the plunder, off a new `formationTierFor` / `_formation_tier_for` that asks the civic gate without a host to merge with); EFFECT_ADD_DIPLO_VISIBILITY and EFFECT_ADJUST_UNIT_GRANT_EXPERIENCE (the Flying Squadron's flat level and its spies born promoted); EFFECT_ADJUST_CITY_APPEAL (the Roosevelt Corollary — a per-CITY appeal add, which `cityAppealResolver` / `_gp_appeal_plane` already carried for the Great Person perk, so C-50's earlier attribution of it was wrong and is corrected below). THE TERRACE FARM SHIPS (the Inca's unique improvement off Improvements.xml and Adjacency_YieldChanges: hills of three terrains, +1 Food and +1 Housing, +1 Food per adjacent Mountain, +2 Production per adjacent Aqueduct, its own kind beside it once per TWO at Feudalism and per ONE at Replaceable Parts), and with it EFFECT_ADJUST_TERRAIN_YIELD_FROM_ADJACENT_IMPROVEMENTS — a MOUNTAIN pays the Inca +1 Food per adjacent Terrace Farm. A mountain's yields ride their own arm on both engines, since the tile-add mask refuses impassable ground. CONTINENTS SHIP (C-48): every landmass carries an id, a seat's HOME one is its ORIGINAL capital's, and the eighteen clauses keyed on it all pay — Spain's Treasure Fleet (3/2/1 on every route and TRIPLE across, its +25% districts and its Builder off the capital's continent), Roosevelt's +5 at home, Victoria's melee unit and Trade capacity per foreign-continent city, and Phoenicia's 100%-loyal coastal cities at home. Philip II waits on a seat's MAJORITY religion; the Raven King on a LEVIED mark per unit; The Colonies' embarked sight is unread; Gorgo's per-policy magnitude SHIPS. A CITY's own ranged strike composes its defender without the roster's rows on both engines (`cityStrikeStrength`'s block in `seatPhase`), so a defender's flat clause is unpaid there — the site census in tests/cpu/seats/combat-rows.test.ts and tests/gpu/combat_rows_test.py allowlists exactly that one and fails on any other. Divine Wind's hurricanes and Mother Russia's blizzards wait on C-49; Nkisi's four SCULPTURE rows wait on a Great Work of Art carrying an object kind, and its Palace slots on a per-civilization great-work slot count; Poundmaker's shared visibility and the Cree Trader's tile claim are unbuilt mechanics of their own. UNIQUE INFRASTRUCTURE SHIPS (the Bath as Rome's Aqueduct — half price, +2 Housing, +1 Amenity; the Stave Church as Norway's Temple — a full Holy Site adjacency per Woods and +1 Production on coastal resource tiles; the Sphinx and the Ziggurat as Builder rows with every clause off the install's tables, the Sphinx's +2 Appeal included). UNIQUE UNITS SHIP (Legion, Maryannu Chariot Archer, Berserker, Longship, War-Cart — every clause off the install's Units.xml / UnitAbilities; the Legion's Roman Fort rides the FORT row; a chariot class is cavalry but no anti-cavalry target). CIVILIZATION ABILITIES SHIP (All Roads Lead to Rome — a Trading Post and, within Trade Route range of the capital, a road along the Trader's course at every founding and conquest, +1 Gold per own-city post on a route's chain; Iteru — +15% Production for district and wonder items on river tiles, no flood damage on Egypt's ground; Knarr — Ocean at Shipbuilding, no embark/disembark cost, naval melee +10 heal in neutral waters; Epic Quest — half-price levies). LEADER ABILITIES SHIP (Trajan's Column — the cheapest City Center building at founding; Mediterranean's Bride — +4 Gold on Egypt's international routes, +2 Food for the sender and +2 Gold for the destination on routes into Egypt, doubled trade alliance points; Thunderbolt of the North — the coastal raid opened to every naval melee unit, +50% naval melee Production, Science from pillaged Mines and Culture from pillaged Quarries/Pastures/Plantations/Camps; Adventures of Enkidu — +5 CS against a seat an ally is at war with, +2 alliance points a turn for a common foe, shared XP and plunder within 5 tiles of an ally's unit). OPEN: the agendas (DLL-scored, and neither engine holds an opinion scale); whether Trajan's grant also fires on a CONQUERED city (the modifier's collection is PLAYER_CITIES) is unread DLL logic — founding only ships; Enkidu's allied-war discount (EFFECT_ADJUST_PLAYER_ALLIED_WAR_DISCOUNT 150) is the grievance ledger's (B-63r); Epic Quest's Tribal Village on an outpost capture waits on C-47; Iteru's flood AVOID is a whole-EVENT modifier and whether the DLL also skips the fertility half is unread (the fertility ships); whether the Knarr's Ocean clause reaches a TRADER's course is unread (`tradeWaterLevel` stays Cartography-gated); the Rock Band's four unique-district venue clauses wait here. Mvemba's M'banza Apostle arm waits on Kongo's unique district and his founder-belief clause on a MAJORITY religion; the Maori's harvest ban and their Fishing Boats' culture bomb both SHIP, and so does the Netherlands' Harbour bomb; Kristina's auto-theming waits on C-59 and Suleiman's Janissary on a chassis the unit roster does not carry. Dharma's route pressure waits on C-56 and its all-follower-beliefs half on C-57; Genghis Khan's cavalry capture on C-58; Phoenicia's coastal loyalty on C-48; the Raven King's levy discount on a LEVIED mark no unit carries. China's wonder-era boosts wait on C-54, and Qin's Builder-into-a-wonder SHIPS (the install's modifier carries the Amount 15 and no requirement set, so the Ancient-to-Classical band comes from the leader's own description text in the same install, and ORIGINAL cost is the wonder catalog's rather than the queued price, which is what `itemCost` already reads for a wonder); the Saka Horse Archer's own copy row waits on a chassis the roster does not carry. Saladin's discount is paid to his OWN cities only, since the install prices the building off the RELIGION and a seat here founds only its own. REACH: the fixtures seat Rome, Egypt and Norway, so no gate lane reaches the War-Cart or the Ziggurat, and the driver never orders a Legion's Fort; the engine has no resource VISIBILITY, so the Stave Church counts every coastal resource where the install counts the visible ones |
| C-31 the nuclear strike's last clauses | 1 | interception has no published roll; the citizens a blast kills wait on a worked-tile selection neither engine exposes; whether a wonder in the blast is pillaged is unsourced |
| C-33 the Giant Death Robot's remaining abilities | 1 | every published clause ships; what the Jump action COSTS is unsourced |
| C-34 air combat's second half | 2 | Interception, Patrol and Priority Target have no published roll or magnitude; the promotion term in the sortie and the parked weapon's cover ship |
| C-35 the drowned ground keeps its record | 1 | what a submerged tile's terrain and feature still lend their neighbours is unsourced either way |
| C-38 a city-state's city develops HALFWAY | 1 | walls (with the combat split), the type's district, its tier-1 building and the coastal Harbor ship; the yields of any of it and power are still absent |
| C-41 nothing places Volcanic Soil | 1 | the ADD carrier ships; WHERE the soil lands (and what it does to an improvement) is an open owner question |
| C-45 the queue's depth is a fixed five | 1 | real Civ 6's queue has no published ceiling; the GPU's is a tensor dimension and must be finite, so both engines carry the same cap |
| C-47 Tribal Villages | 1 | TS holds a six-outcome stub (`claimGoodyHut`) the exporter refuses to ship a world for, the GPU holds nothing; an outpost capture is a plain kill on both; Epic Quest's clause waits on the mechanic |
| C-46 religious pressure is a stylized integer | 1 | the game's own pressure model (per-population, holy-city x4, holy-site x2, combat and trade-route pressure) is sourced and unbuilt; every percentage pressure modifier floors to nothing on the 1/turn integer |
| C-60 no Free City step | 1 | a city that loses its loyalty goes straight to the highest-pressure seat on both engines (`flipCity` -> `transferCity`, `_seat_loyalty_flips` -> `_transfer_city`) — there is no ownerless intermediate at all. Eleanor's "skips the Free City step" is therefore what EVERY seat already gets, which is a fidelity gap on both engines at once rather than a divergence |
| C-61 the capital never moves | 1 | `relocatePalace` / `_relocate_palace` move `isCapital` only when the seat holds NO capital, and `origCapitalSeat` / `civ_cap_tile` are written once at founding and never again. Dido's Cothon capital move also needs a civ-UNIQUE project, which `ProjectDef` has no field for |
| C-62 a war TYPE | 2 | the install's DIPLOACTION_DECLARE_TERRITORIAL_WAR and _LIBERATION_WAR are war kinds with their own civic prerequisite and a 10-turn buff on the declarer. Both engines carry exactly two kinds — formal and surprise (`seat_warkind`) — with no prerequisite beyond a casus belli and no post-declaration clock. Chandragupta's and Robert the Bruce's six modifiers wait here |
| C-63 a legacy bonus accrues no time | 1 | the install's GOVERNMENTBONUS rates are the SPEED at which a government earns its legacy bonus. Both engines model the legacy CARD (`legacyOf`, `_pol_legacy`) as "have you ever held this government", with no accrual to halve, so America's nine BONUS_RATE modifiers have no clock to double |
| C-59 a generic themed carrier | 1 | EFFECT_ADJUST_AUTO_THEMED_BUILDINGS_WITH_X_SLOTS and the themed yield/tourism modifiers — only a MUSEUM themes on either engine (`museumThemed` / `artMuseumThemed`, `_museum_themed` / `_art_museum_themed`) and a wonder never does, so Kristina's "buildings with at least three Great Work slots and wonders with at least two are automatically themed when full" has no carrier to theme. The shape is a slot-count rule over any building or wonder, plus the +100% yields and +100% Tourism a themed set then pays |
| C-56 a trade route's religious pressure | 1 | EFFECT_ADJUST_PLAYER_TRADE_ROUTE_RELIGIOUS_PRESSURE — a live Trade Route spreads its origin's religion to the destination and back. Pressure on both engines comes only from holy-city radiation, a unit's spread, theological combat and a disciple's kill; no route touches it, so Dharma's +100% has nothing to multiply |
| C-57 one follower belief per city | 1 | EFFECT_ADJUST_GAINS_ALL_FOLLOWER_BELIEFS — a city pays the follower belief of its ONE followed religion (`withFollowerBelief` / `_follower_id_for`), so Dharma's "Follower Belief bonuses from EACH Religion that has at least 1 Follower" cannot stack. The carrier is a per-religion belief walk over the city's live pressure, on both engines |
| C-58 a defeated unit is never captured | 1 | EFFECT_ATTACH_MODIFIER / TRAIT_CAVALRY_CAPTURE_CAVALRY — Genghis Khan's cavalry has "a chance to capture defeated enemy cavalry class units". Both engines only CONVERT: `convertHeathens` turns an adjacent barbarian, and a captured Settler/Builder changes hands on capture-on-move; a unit that loses a combat is removed, never re-seated. Its +3 Combat Strength ships |
| C-54 a wonder's free era boost | 1 | EFFECT_ADJUST_FREE_TECH_BOOST_WONDER_ERA / _CIVIC_ — completing a wonder hands a RANDOM unearned boost from that wonder's own era. Both engines draw a random tech boost already (the Great Library's, inside the recruit body) but neither draws one keyed on an ERA, and no path fires on a wonder completing; Dynastic Cycle's pair waits on it |
| C-50 appeal is map-global | 1 | `tileAppeal` and its GPU plane take no seat, so a clause that changes what a FEATURE is worth to ONE civilization has nowhere to land: Brazil's Amazon ("+1 Appeal to adjacent tiles, instead of the usual -1" from Rainforest). CORRECTED 2026-09-03: Roosevelt's National Park appeal was listed here in error and SHIPPED in batch 13 — a per-CITY add is what `cityAppealResolver` / `_gp_appeal_plane` already carry, and only the FEATURE half is blocked. The carrier is a per-seat appeal read — the four consumers (housing, amenities, the Seaside Resort's gold, the National Park's site) each take the asking seat |
| C-49 named random events | 1 | the install's RandomEvents (hurricanes by category, blizzards by severity) exist on neither engine: the disaster phase floods, storms, droughts and erupts, but no event carries a NAME a modifier can key on, so Divine Wind's hurricane waiver and its double damage to Japan's enemies, and Mother Russia's blizzard pair, have nothing to attach to |
| **C. Absent systems** | **37** | |
| **OPEN, TOTAL** | **55** | |

RULE FOR THE NEXT ROUND: when an entry closes, delete its row here in the
SAME commit. When one opens, add a row with its weight and its reason. Do
not add a "done" column back.

## THE QUESTION LEDGER — every open ask, one pass

Each entry below is an OPEN bullet whose row says UNSOURCED, unpublished
or "owner question". None is a licence to ship a branch; a bullet leaves
this ledger when the owner answers or a primary source is reached, and
the answer lands in the ROW the entry points at (this list carries no
detail of its own). "Meanwhile" states what both engines do today.

1. **C-1 — the reactor's accident roll.** Severities open at ages
   10/20/30; NO source publishes the per-turn probability. Meanwhile: the
   age clock ships, no accident ever fires.
2. **C-1 — the decommission projects' score.** A secondary source says
   100 competition points; no first-party page states any figure.
   Meanwhile: the projects are absent, the window counts emissions alone.
3. **C-31 — the nuke's last clauses.** Interception has no published
   roll; the citizens a blast kills wait on a worked-tile selection
   neither engine exposes; whether a wonder in the blast is PILLAGED is
   unsourced. Meanwhile: no interception, no citizen deaths, the wonder
   rides through untouched.
4. **C-33 — the Jump action's cost.** What the Giant Death Robot's Jump
   COSTS (movement? a turn?) is unsourced. Meanwhile: no Jump.
5. **C-35 — what drowned ground still lends.** Does a submerged tile's
   FEATURE keep working for its neighbours, or is the ground stripped?
   Meanwhile: it lends (every ring fact reads terrain).
6. **B-20r — the park's vertical.** Civ 6 fixes the park rhombus
   vertical where this hex frame has no canonical vertical. Meanwhile:
   every rhombus offered.
7. **B-63r — the gang-up bar.** No source publishes the AI's gang-up
   threshold. Meanwhile: `GRIEVANCE_GANG` as a tuning knob, two war
   bases' worth.
8. **B-66 — what a merge leaves.** The merged unit's HIT POINTS and
   whether it may act after forming are unpublished, and the
   direct-trained formation's STRATEGIC-RESOURCE charge is unstated.
   Meanwhile: the veteran's own HP, the turn ends, the single unit's
   charge.
9. **C-41 — where Volcanic Soil lands.** WHERE an eruption's soil lands
   and what it does to a standing improvement. Meanwhile: the ADD
   carrier ships and nothing calls it.
10. **C-45 — the queue's depth.** Real Civ 6 publishes no queue ceiling;
    five is a capacity choice (the GPU's tensor dimension). Is five
    acceptable, or name a depth? Meanwhile: 5 on both engines.
11. **C-16 — the released spy's level.** What a released (ransomed) spy
    keeps of its levels is unpublished. Meanwhile: the row's own recorded
    reading stands.
12. **C-2 — two diplomacy cells.** The gold purchase of the QUEUE-FRONT
    item is refused on both engines and real Civ 6 likely allows it with
    progress banked; and the alliance table's ALLIANCE_POINTS_FOR_DEAL
    (2) maps to no published text — is it alliance points banked when
    the allies close a deal? Meanwhile: refused / nothing.
13. **B-51r — a capture and the district pool.** `city_outer_hp` zeroes
    on a city capture; the Encampment's own pool rides through — no
    source says which is right. Meanwhile: it rides through, both
    engines.
14. **B-31r — the course's depth.** Real Civ 6 chains Trading Posts "and
    so on" with no published limit; `ROUTE_CHAIN_MAX` (6) is a capacity
    choice (the GPU plane's width), C-45's pattern. Is six acceptable,
    or name a depth? Meanwhile: 6 on both engines, the reach walk and
    the stored course alike.

## A. Engine vs engine — where the two implementations can answer differently

THE DIGEST IS THE ONLY INSTRUMENT FOR THIS CLASS — both engines can be
equally faithful to Civ 6 and still disagree with each other. Its green
bounds nothing the gate does not reach ("Reachability" below), and a round
that widens coverage is worth more here than a round that re-reads the
exporter.

No member is open. What is NOT a source of new members: a seat asymmetry. Seat 0 rides the same
machinery as every other row, and `tools/gpu/seat_symmetry_check.py` holds
that with both allowlists empty.

## B. Fidelity vs real Civ 6 — where both engines agree on the wrong answer

NO GATE CAN CATCH THIS CLASS. Parity proves the two engines match, never
that either matches the real game, so every entry here closes against a
Civ 6 source or is recorded as unverifiable.

- **B-20r. Tourism tails.** The mechanics ship (works, relics, artifacts,
  parks, shipwrecks, both museums' theming, provenance across capture);
  `tests/gpu/parks_test.py` and `tests/cpu/culture/parks-theming.test.ts`
  are the bar where the gate is thin. Open:
  - A park's ORIENTATION. Civ 6 fixes the rhombus vertical; our hex frame
    has no canonical vertical, so every rhombus is offered.
- **B-21r. City-state suzerain rows.** Eleven perks are RULES
  (`SUZ_EFFECTS`, both engines). The remaining catalog rows carry their
  reason in their `CITY_STATE_SUZERAIN_BONUS` entry's `note`: each needs a
  whole absent system (unique improvements/luxuries, a gold-purchase
  discount, a per-district Great Person channel) or is a flat channel
  standing in for a %-scaling. Geneva's condition ships
  (`cityStateSuzerainCapitalBonus` / `_suz_capital_mask`, peace with every
  MAJOR); what survives of its row is the magnitude alone — +15% of the
  city's Science against a flat +3.
- **B-22r. World Congress residuals.** Nineteen regular resolutions, the
  DV resolution, emergencies as special sessions, the favor tie-break,
  refund tiers and the ballot wire all ship (`congressSession` /
  `_world_congress`; emergencies in `cpu/core/emergency.ts` /
  `_raise_emergency` and siblings). Gate reach: a ballot on 12/12 seeds,
  ~5 sessions per seed; rows past rotation rank 9 are poke-only
  (`world-congress.test.ts`, `congress_vote_test`); the CITY_STATE
  emergency trigger is poke-only (`tests/cpu/minors/emergencies.test.ts`,
  `tests/gpu/emergency_test.py`).

  THE OBSERVATION NOW ADDRESSES THE SESSION ABOUT TO SIT. Beside the
  standing slate it renders the ANNOUNCED one, the turns until it and
  whether the Diplomatic Victory resolution runs in it, so a ballot is
  filled in against the resolutions it will actually answer.

  THE CULTURE BOMB WIPES UNFINISHED CONSTRUCTION. SOURCED: "if a Wonder or
  a District is still under construction and it suffers the effect of a
  Culture Bomb, construction will immediately stop and it'll disappear",
  while "a Culture Bomb will not steal completed wonders or districts". So
  the claim now skips only a COMPLETE build, and `wipeConstruction` /
  `_wipe_construction` undo an unfinished one — the tile's mark, the
  city's registry entry and the production item, whose hammers BANK rather
  than burn, which is where this model puts every carried-over hammer.

  SCORED COMPETITIONS SHIP as one resolution row whose TARGET names which
  competition to run, so a second competition is a data row and never a
  new resolution. "If enacted, players who vote in favor of the Scored
  Competition will compete to contribute to the cause", so outcome A opens
  the window and its own A voters are the field. A competition runs for
  exactly 30 turns; then "the civilization with the highest score wins the
  Gold Tier rewards. Additionally, all civs whose scores fall within the
  top 25% (including the Gold Tier winner) win the Silver Tier rewards,
  and all civs whose scores fall within the next highest quarter (i.e. the
  top 26-50%) win the Bronze Tier rewards" (`resolveCompetition` /
  `_resolve_competition`). The era floor is the Modern era, where the
  source puts the resolutions. CLIMATE ACCORDS is the first row, scored
  "1 point per turn for each CO2 emission less than the highest polluter"
  — the WORLD's highest, so the dirtiest civ scores nothing — paying Gold
  2 Diplomatic Victory points, Silver 100 and Bronze 50 Diplomatic Favor.
  Reach is unmeasured; `congress_vote_test` and
  `tests/cpu/seats/competition.test.ts` are what exercise it. FOUR things
  about it are decisions, not transcriptions: ONE competition runs at a
  time, because real Civ 6 bounds nothing here and a single slot is what
  makes the score a plane both engines compare; "CO2 emission" is read as
  the per-turn RATE rather than the lifetime total, which is what makes
  the score a per-turn gap; the podium's tie breaks on the LOWER seat, one
  total order both engines share, where the source publishes none; and the
  free vote's line — the highest polluter refuses what it cannot score in
  — is this model's own self-interest heuristic, like every other AI line
  in the catalog. OPEN:
  LUXURY POLICY SHIPS — the nineteenth regular row, appended LAST with
  its own 'luxury' target kind (the target space is the luxury catalog,
  `LUXURY_IDS`' order, the tile plane's own). SOURCED: "A: +1 Amenity on
  duplicates of a Resource. / B: This Luxury resource grants no
  Amenities." B silences the named luxury outright, Affluence copies
  included; A pays one extra full-reach amenity round per OWN improved
  copy beyond the first (`luxuryAmenities` / `_luxury_amenities`). Two
  cells are decisions, not transcriptions: A's REACH rides the
  machinery's own LUXURY_AMENITY_CITIES spread (the published line names
  no cities); and the DUPLICATE count reads the seat's own improved
  tiles, the one count both engines already share. The game's own
  congress table gives the row NO era window, and both engines carry
  that. The
  free vote is A on the luxury the voter holds the most improved copies
  of.

  - (ARMS CONTROL now acts — SOURCED: "A: All players have their weapons
    of Mass Destruction set equal to the target player. / B: The target
    player loses all of their Weapons of Mass Destruction." An inventory
    is state rather than a standing modifier, so `armsControl` /
    `_arms_control` enforce the winning outcome at the session, per device
    row. Its free vote is this model's own self-interest line, like every
    other in the catalog: a seat holding the largest arsenal can only lose
    by levelling, so it empties its nearest rival, and everyone else names
    the emptiest seat and takes the world down to it. It was also the ONE
    resolution with no AI arm on either engine, so the two fell through to
    defaults that disagreed — TS picked a seat off the great-works counts
    where the GPU named the voter itself. Era 6 makes that unreachable in
    the gate, so it went unseen.)
  - **THE ESPIONAGE PACT'S TARGET SPACE IS THIS MODEL'S OWN.** The row
    itself now ships — "A: All Spies function +2 levels higher for the
    Target Operation. / B: Target Operation is unavailable", carried by
    `congressPactLevels` / `congressPactBanned` and their `_congress_pact_*`
    twins, on the `SPY_OP_LEVEL` channel nine Espionage promotions already
    use. One thing about it is a decision, not a transcription: the
    target space is `SPY_OFFENSIVE_MISSIONS`, the operations either
    outcome can act on, since no source lists what the game offers. The
    era window is the game's own congress table: Industrial through
    Atomic.
  - **THE COMPETITION CATALOG HOLDS ONE ROW.** The machinery takes a data
    row per competition; what is missing is the rows. WORLD'S FAIR is
    blocked on its own SOURCE: Silver is 50 Diplomatic Favor and Bronze a
    free Civic, but the GOLD tier and the SCORED QUANTITY did not come
    back from any reachable source, and neither will be invented. AID
    REQUEST scores members who "send Gold to the target player", which
    needs a gold-to-a-rival channel the deal table now has but no
    competition scorer reads yet; BORDER DISPUTE, CATASTROPHE and
    MILITARY COMPETITION each want a scored quantity of their own. THE
    NOBEL PRIZE competitions are Sweden-only, so they sit behind C-26,
    which covers the roster's four civilizations alone.
  - **CLIMATE ACCORDS SCORES ONLY HALF ITS INPUTS.** The source scores the
    Decommission Coal/Oil/Nuclear Power Plant projects alongside the
    emission gap; those projects have no carrier (C-1), so the window
    counts the gap alone.
  - ~~Peace deals carry no terms.~~ CLOSED: "the peaceful resolution of a
    war involves diplomatic negotiations ... You or your opponent may
    initiate a Peace Deal", so a table between two seats at war IS the
    peace deal and confirming it ends the war (`acceptDeal` /
    `_accept_deal`, both calling the one `makePeace` body). The unilateral
    sue at the war head stays as the no-terms case.
- **B-24r. Ages/governors tails.** Twelve dedications ship, both faces,
  over the published era windows (`DEDICATION_ERAS` / `_ded_eras`).

  THE GOVERNOR IS A PERSON. Seven named agents per seat (`Seat.governors`
  / the `civ_gov_*` planes), each appointed with a Governor Title, seated
  in one city and promoted with further titles. Titles are earned one per
  each of thirteen NAMED civics plus the Government Plaza and every
  building in it, and spent one per appointment and one per promotion
  (`governorTitlesEarned` / `_governor_titles_earned`). Forty-two
  promotion rows carry their governor, tier and prerequisite mask; the
  DEFAULT ability rides the appointment and costs nothing. An
  establishment clock (3 turns for Victor, 5 for the rest) gates every
  ABILITY while the +8 Loyalty transfers on ASSIGNMENT, sourced; a
  neutralize clock follows the PERSON, so a neutralized governor leaves
  his city and can be seated nowhere for six turns. Thirteen DARK AGE
  cards ship with their era windows, wildcard-only, adoptable only by a
  seat actually in a Dark Age (`computeAdoption(.., dark)` /
  `_slotted_policies(.., dark, era)`). Ibrahim is Ottoman-exclusive and
  therefore C-26, outside the roster's four civilizations, not an omission. OPEN:
  - ~~No governor can be assigned to a city-state.~~ CLOSED: CIV6 (Amani)
    "Can be assigned to a City-state, where she acts as 2 Envoys", and the
    catalog's `cityStates` flag says she is the only one. She is posted at
    the governor phase, BEFORE the cities are handed out, and takes none
    while abroad; the establishment clock runs there exactly as it does in
    a city, and a neutralize or a conquest sends her home.
    `Governor.minorId` / `civ_gov_minor` are the posting, compared as
    `governorAtMinor` — addressed by the CITY-STATE rather than by the
    posting, so neither engine has to name a minor the way the other
    does. WHICH minor is this model's own line, like every other governor
    choice here: the met, live one where the seat already holds the most
    envoys, ties to the first in the roster. Her three sourced channels
    act: `envoysHere` / `_envoys_here` is the store plus Messenger's two,
    doubled by Puppeteer — she is part of the number she doubles — and
    Affluence copies the minor's own luxuries into `luxuryAmenities` /
    `_luxury_amenities`. What asks the EFFECTIVE count is what asks who
    LEADS and what a seat has EARNED here: both halves of the suzerain
    contest (`resolveSuzerain` and `isSuzerain`, and with them the levy
    gate, which is a suzerain question), the 1/3/6 bonus tiers, and the
    driver's own next-envoy preview. What still asks the STORE is what
    asks about the act of SENDING one — the emergency's "must have met and
    sent an Envoy", the first-envoy double, and the Congress's envoy
    context. The stored answer (`CityState.suzerain` / `citystate_suzerain`)
    is refreshed for the WHOLE roster at every position now, on both
    engines: a posting moves the contest without touching any one minor's
    ledger, so a per-minor refresh goes stale where a global one does not
    — which is what the gate caught at seed 9131 turn 119. She IS reached:
    that same seed posts her and she decides a suzerainty inside 250
    turns. `tests/gpu/amani_test.py` and `tests/cpu/minors/amani.test.ts`
    pin the clauses. STILL OPEN:
    - **AFFLUENCE COPIES THE GROUND, NOT THE WORKED TILE.** A minor
      improves nothing on this engine, so requiring the improvement the
      seat's own luxuries require would make the promotion a permanent
      no-op. Both engines copy every distinct luxury RESOURCE in the
      minor's territory. That is a reading, not a transcription.
    - **FOREIGN INVESTOR still has no carrier**, and its blocker moved
      rather than closed: "While established in a city-state, accumulate
      its Strategic resources. When suzerain, receive double the amount"
      needs a minor that ACCUMULATES strategic resources, and a minor here
      has no production, no improvement and no stockpile of its own
      (C-38). No source publishes a rate to stand in for one.
  - ~~Five promotion clauses wait on no mechanic at all.~~ CLOSED for
    five of the six, each transcribed from its own sourced sentence:
    - **SURPLUS LOGISTICS** ("Your Trade Routes ending here provide +2
      Food to their starting city") is `routeStartFood`, read in the
      DOMESTIC arm of `cityTradeYields` / `_seat_route_income` off the
      DESTINATION's governor and paid to the ORIGIN column.
    - **VERTICAL INTEGRATION** ("Production from any number of Industrial
      Zones within 6 tiles, not just the first") is `industryAllSources`,
      passed INTO `regionalEffects` by its caller because the governor
      read lives a module above the yield walk. It lifts the `seen` dedup
      for INDUSTRIAL_ZONE rows only — the promotion names one district, so
      an Entertainment Complex still pays once.
    - **REINFORCED MATERIALS** ("improvements, buildings and Districts
      cannot be damaged by Environmental Effects") is `envDamageImmune`,
      gating `scorch`, the flood's improvement DESTRUCTION and
      `floodDistrict` on both engines. Every draw stays where it was, so
      the immunity moves no RNG stream. The GPU's `_env_immune` is the OR
      over the majors: a disaster reaches every seat at once.
    - **FORESTRY MANAGEMENT** ("+2 Gold for each unimproved feature.
      Tiles adjacent to unimproved features receive +1 Appeal in this
      city") is `goldPerFeature` in the BONUSES bucket over the tiles the
      city OWNS, and `appealNearFeature` through the owner-city appeal
      closure. That closure now carries BOTH channels — the Great
      Person's flat grant and this one — and moved from `appeal.ts` to
      `governors.ts` as `cityAppealResolver`, so the Seaside Resort gate,
      the Preserve, the National Park and the yield walk cannot answer
      differently. An unimproved feature is a tile carrying a live
      feature and no improvement, on both engines.
    - **PATRON SAINT** ("Apostles and Warrior Monks trained in the city
      receive 1 extra Promotion when receiving their first promotion") is
      `firstPromoBonus`, banked on the unit at the FAITH BUY — the only
      way either unit is trained — and spent by `takePromotion` /the
      PROMOTE applier, which re-arms the unit to `xpToNextLevel`. The
      AUDIT's own claim that this clause needed no mechanic was WRONG:
      the grant outlives the city, so it needs a carried per-unit field,
      `Unit.promoBonus` / `unit_promo_bonus`, compared as `promoBonus`.
    No seed reaches a governed city holding any of the six, so
    `tests/gpu/gov_clauses_test.py` and
    `tests/cpu/city/governor-clauses.test.ts` are the bar.
  - **NINE PROMOTION CLAUSES WAIT ON A NAMED ABSENT SYSTEM**: Contractor
    and Divine Architect (no district PURCHASE verb, gold or faith);
    Renewable Subsidizer and Industrialist (the power plants and
    renewables of C-1); Air Defense Initiative (anti-air units, C-34, and
    the ICBM, C-31); Arms Race Proponent (nuclear armament projects,
    C-31); Aquaculture and Parks and Recreation (the Fishery and City
    Park improvements, which the improvement catalog does not carry);
    Foreign Investor (a minor that accumulates strategic resources,
    above).
  - ~~Land Acquisition's "+3 Gold from each foreign Trade Route passing
    through" is blocked on the stored route PATH.~~ CLOSED: the route
    stores its course now (see B-31r) and the channel ships — CIV6 (Land
    Acquisition): "+3 Gold per turn from each foreign Trade Route
    passing through the city", `passRouteGold` read by `governorSum` /
    `_governor_pass_route_gold` over the stored course, the seat's own
    routes never counted. The "faster" growth half ships too: the
    game's own governor-promotion table publishes 20, and
    `borderExpansionPct` (`governorSum` / `_governor_sum`) cuts the
    border cost at both consume sites.
  - ~~Grants' "+100% Great People points" has no per-city reader.~~
    CLOSED: the GPP walk is per-city on both engines
    (`greatPersonPointsPerTurn`'s city loop / `_advance_great_people`),
    and the governor's `gppMult` multiplies everything his city GENERATES
    — the district term and the wonders standing in that city alike
    (`governorMult` / `_governor_mult(row, "gppMult")`); the seat-level
    government and Congress factors stay outside it. Reachability is
    poke-level: Grants is a tier-2 Pingala row no scripted lane promotes
    to.
  - **THE GREEDY SLOT FILL NEVER REACHES A DARK AGE CARD.** Both engines
    fill slots by walking the card table in order, so a government's
    WILDCARD slots are spent on ordinary overflow before the dark rows —
    which the append-last discipline puts at the end of the table — are
    ever considered. MEASURED on a forced Dark Age with every civic
    researched: 8 cards slotted, 0 of them dark; widening the wildcard
    bench to 40 slots the same seat takes all 13. The two engines agree
    exactly, so this is REACHABILITY, not a divergence: the pool is
    proven only by `governor_roster_test.py` poke f and the TS
    `dark-policies` lane. Which card fills a slot is a player decision
    both engines stand in for, and making the stand-in prefer a dark card
    is an invention no source settles — it belongs to the P8 decision
    surface with the rest of `computeAdoption`'s greedy fill. THE NINE
    GOVERNMENT LEGACY CARDS ARE THE SAME SHAPE and inherit the same
    residual: they too are Wildcards appended last, so a seat that has
    left a government unlocks its card and the fill still spends the
    bench on ordinary overflow first. `legacy-cards.test.ts` and
    `legacy_cards_test.py` prove the pool both ways — narrow bench, not
    slotted; wide bench, slotted.
  - **WHO TO HIRE AND WHERE TO SEAT HIM IS A HEURISTIC, NOT A RULE.**
    Appoint in catalog order, promote the first legal row, seat every
    idle governor in the lowest-loyalty ungoverned city (quantized-milli
    key, ties by array position). Real Civ 6 leaves all three to the
    player; the two engines mirror the heuristic exactly, and it is
    P8-surface work to make them decisions.
  - ~~To Arms!'s special Casus Belli.~~ CLOSED: CIV6 (DiplomaticActions.xml,
    the game's own casus belli table): the Golden Age War row carries
    percent columns 25/25/300 (declare/capture/raze) and requires NO
    denouncement, so ANY DoW by a To Arms! dedicant in a Golden age is a
    formal war (FORMALWAR group) that marks the pair (`Seat.goldenWars` /
    `seat_wargolden`, statecompare-compared). Every kind prices its own
    columns off `WAR_GRIEVANCE_PCT` — surprise 150/150/450, formal
    100/100/300 — and peace clears the mark.
  - ~~Per-civ tech-era drift — eras are global 50-turn blocks.~~ CLOSED,
    with the claim CORRECTED: real Civ 6's era clock is GLOBAL too (the
    World Era advances on a turn schedule; `ERA_LENGTH` is this model's
    recorded stand-in for that schedule) — what is per-civ at the boundary
    is the BARS, and those now drift: CIV6 (Ages, corroborated formula) —
    the Dark bar is 12 + cities when the era begins - 5 per past Dark age
    + 5 per past Golden or Heroic age, the Golden bar the same with 24
    (`eraBoundary` / the `sim_step` boundary, over the new
    `Seat.darkAges`/`goldenAges` — `dark_ages`/`golden_ages` — counters,
    compared by statecompare). The old flat 3/10 pair was this model's
    own and is gone. A civ's TECH era (`civEraIndex`) already serves the
    sites that ask it.
- **B-31r. Trade-route tails.** The Trader unit, sea legs, trading posts,
  chained reach and the whole-destination-set candidate all ship, and a
  city-state's complete Harbor is a second water anchor
  (`centreMaritime`'s minor arm / the maritime plane's minor scatter).
  OPEN:
  - ~~The PASS-THROUGH half of the post gold has no carrier.~~ CLOSED: a
    route stores its COURSE at commit — `TradeRoute.chain` /
    `seat_route_chain`, statecompare-compared, `routeChain`'s FIFO walk
    over the seat's own posts (first discovery wins; `ROUTE_CHAIN_MAX` 6
    deep, a capacity choice, the ledger's) on both engines. CIV6
    (Trading Post): "Every Trading Post for your civilization through
    which a route passes along its course adds +1 Gold", and "Each
    foreign Trading Post also adds +1 Gold to the yields of every Trade
    Route which passes through this city" — `routeChainGold` / the
    `_seat_route_income` chain term pays each live course city 1 plus
    the other civs' posts standing there, and the reach walk carries the
    same depth cap.
  - `PLUNDER_ROUTE_GOLD` (50) is a stylization; no public source names
    the real base magnitude.
  - **The destination is ONE candidate row plus a take/skip.** The single
    summed-yield ranking key is this engine's heuristic, and the policy
    sees one candidate — the free-choice head is P8-surface work,
    alongside the route verb joining `env.step`.
- **B-34r. Flood tails.** The GS flood ships whole (severity ladder, river
  reach, river-scoped shield, the Dam, the Great Bath's per-flood faith
  over `Tile.floodCount` / `tile_flood_ct`; `flood_severity_test` poke f
  pins the reach). OPEN:
  - Climate change ending fertilization at Phase IV, the Egyptian
    ability, the Soothsayer and COASTAL floods all wait on systems that
    do not exist here.
- **B-39r. Wonder effects still dropped.** The sourced sweep shipped
  fourteen channels, the Mausoleum's engineer charge and Cristo Redentor's
  shield. OPEN, each blocked: Apadana's "+2 Great Work slots (any type)"
  and the Hermitage's LANDSCAPE-only art slots, both waiting on the
  per-work TYPE B-20r names.
- **B-54r. Flanking and support against their own page.** Every rule on
  the page ships, plus the four higher stacks a promotion or Great Person
  raises. OPEN: **the two stacks a UNIQUE UNIT raises** — Zulu's Impi and
  Macedon's Hypaspist raise flanking or support for themselves alone, and
  no civilization unique exists (C-26).

- **B-66. FORMATIONS.** Weight 1 — the mechanic SHIPS; two tails stay open.
  Corps, Armies, Fleets and Armadas exist on both engines: one
  `formation` tier per unit (`formationCS` / `_form_cs`, `_form_cs_pool`),
  the FORM_UP head merging a unit into a same-type neighbour (`formUp` /
  `_form_up`), and the strength term on every duel read — melee, ranged,
  bombard, the city and city-state assaults, the stack-defender choice and
  the embarked defence. CIV6 (Formations): two of a type make a Corps after
  Nationalism and three an Army after Mobilization; the magnitudes are the
  game's own COMBAT_CORPS_STRENGTH_MODIFIER 10 and
  COMBAT_ARMY_STRENGTH_MODIFIER 17; "the experience and promotions of the
  highest experience unit is preserved"; and "once a Corps or Army has been
  formed, the units may not be broken apart into individual units again",
  so there is no inverse verb. The four Great People who make a formation
  out of ONE unit ship with it (`GP_ABILITY`'s `formation` clause,
  `_gp_form_up`): El Cid a Corps and Napoleon Bonaparte an Army "out of a
  military land unit", Gaius Duilius a Fleet and Santa Cruz an Armada out of
  a naval one, asking no civic — the target "must be a military unit that is
  not a Corps or an Army", so an already-formed unit is passed over.
  `tests/gpu/formation_test.py` and `tests/cpu/units/formation.test.ts` are
  the bar; the Great Person clause is pinned in the first and in
  `tests/cpu/units/greatPerson.test.ts`.

  The ESCORT formation ships beside it (`escortUnit` / `breakEscort` /
  `inEscort`, `_escort_rider` / `_escort_carry_with`, the ESCORT and
  BREAK_ESCORT columns). CIV6 (Formations): "A military unit can create a
  formation with a support or civilian unit at any time", the formation's
  Movement "is equal to that of the slowest unit that belongs to it", and
  "all attacks against this tile will be absorbed by the military unit of the
  formation" — the last of those is already the engine's stacking rule
  (`stackDefender` takes a military unit whenever the tile holds one),
  formation or not. Only the CIVILIAN carries the flag and the tile names its
  escort, so a flag with no military unit beside it is not a formation and
  the rider is free the moment its escort dies — no sweep, and nothing to
  clear at a capture. A naval hull forms with its PASSENGER, which is the other half of
  "Naval military units may also create a formation with embarked land
  units". Two promotions ride it: `ESCORT_MOBILITY` ("Formation units all
  inherit escort's Movement speed" — the rider is dragged free of its own
  pool) and `CONVOY` ("+10 Combat Strength when in a formation", Naval Melee
  behind Reinforced Hull and Rutter). An earlier reading of the CONVOY row
  called it a movement clause; no source supports that. Which formation its
  "a formation" names is not settled by any source — a Fleet is one and so is
  an escort — and it ships as the ESCORT reading by OWNER DECISION, on the
  hull that is carrying a rider (`convoyCS` / `_convoy_cs`). `tests/gpu/escort_test.py` and `tests/cpu/units/escort.test.ts`
  are that bar. OPEN:
  - **WHAT THE MERGED UNIT KEEPS BEYOND THE VETERAN'S RECORD IS THIS
    MODEL'S.** No source publishes the hit points a formation carries out
    of a merge, nor whether it may act afterwards. Both engines take the
    veteran's own hit points — the same unit the sourced rule already keeps
    the promotions and experience of — and end its turn. Recorded as a
    stylization, not a sourced rule.
  - **A DIRECT-TRAINED FORMATION'S RESOURCE CHARGE IS THE UNIT'S OWN.**
    The queue tier SHIPS: a city holding the Military Academy (Seaport at
    sea) trains a Corps or Army (Fleet or Armada) outright once the
    formation's own civic is in, at 150% / 225% of the unit's cost and 25%
    off for the enabling building (`FORMATION_COST_MULT`, the `formLo`
    block, `_q_unit_of`; `tests/gpu/formation_train_test.py` is the bar,
    the driver takes the column at `FORM_SHARE`). What no reached source
    publishes is the STRATEGIC-RESOURCE charge of the direct order — it
    ships at the single unit's own charge, the modelled minimum, and the
    real figure is an owner question.
  - **AN ESCORT FORMATION IS A PAIR.** Real Civ 6 links up to THREE units of
    different classes — military, civilian and support. Support units are
    modelled here as civilians, and the drag takes ONE rider, so `escortUnit`
    refuses a second flag on a tile rather than leave a member behind.
    Widening it needs a support stacking class of its own and a two-rider
    drag on both engines.
  - **A DRAGGED RIDER LIFTS NO FOG.** `_step_verb` / `stepUnit` reveal around
    the MOVER; the escorted unit arrives without a reveal of its own, which
    matters only where the rider's sight is the wider of the two. It follows
    the carried-aircraft precedent (`_air_carry_with` / `carryAirWith`)
    rather than a source.
  - **REACHABILITY, MEASURED.** The Corps IS reached: the driver takes
    FORM_UP, the column is offered on 4 of 12 seeds from t211 and a Corps
    stands on 3 of 12 from t212, so the gate compares the tier-1 strength
    term over the last ~40 turns of those games. The ARMY is not — its civic
    is Modern. The ESCORT column is offered on 12 of 12 seeds from t14 and
    NO driver ever takes it, so the pair, the drag and Escort Mobility are
    poke-only; `tests/gpu/escort_test.py` and `tests/cpu/units/escort.test.ts`
    are their whole bar.

- **B-56r. The inert promotions.** 104 of the 107 catalog rows in
  `cpu/data/promotions.ts` reach a rule; the poke bar is
  `tests/gpu/promotions_test.py` + `tests/gpu/promo_effects_test.py` +
  `tests/gpu/air_promo_test.py`. THREE carry `none`, each with its blocker:
  - **SENTRY** ("can see through Woods and Rainforest") — `revealAround`
    / `_reveal_around` reveal a flat radius; nothing blocks sight.
  - **GROUND_CREWS** ("heal while patrolling or deployed") — PATROL is
    C-34's own gap, and without it there is no state to heal in.
  - **BOARDING** ("obtain Gold from naval victories") — the Civilopedia
    publishes no magnitude, and no other row prices a kill in gold. An
    invented number is worse than an empty row; this one waits on a
    source, not on a mechanic.
- **B-51r. Encampment residuals.** The district holds its OWN
  outer-defense pool (`Tile.encampOuterHp` / `encamp_outer_hp` — CIV6:
  one set of Walls "supplies both", yet "destroying the one does not
  destroy the other"): the assault and the -17 shot split against it, its
  own pool gates the `estk` strike, the repair project prices and refills
  BOTH pools (centre first), and a melee walker ENTERING a shot-emptied
  district conquers it "as you would a City Center" (the `stepUnit` /
  `_step_verb` entry hook; a ranged walker only OCCUPIES it, and the
  20 HP/turn heal re-blocks), and the `estk` target scan measures
  distance 1..2 from the DISTRICT's own tile — CIV6: the Encampment
  conducts a ranged strike of its own. OPEN:
  - **A CAPTURE LEAVES THE POOL STANDING.** `city_outer_hp` zeroes on a
    city capture; the district's own pool rides through unchanged on both
    engines — no source says which is right.
- **B-D. UNSOURCED DATA VALUES — swept once; the named stylizations are
  OPEN, not closed.** The cpu/data walk fetched every magnitude from the
  GS Civilopedia row by row (wonders, units, both trees, buildings, all 49
  policy cards, the city-state roster). What remains open:
  - **The GOVERNMENTS' channel-blocked tails.** Every row ships its
    INHERENT bonus and nothing else, re-sourced page by page. One term
    stays open: Democracy's, whose Trade Route to an Ally or Suzerain's
    city and whose alliance points both want ALLIANCES (C-2). The LEGACY
    bonuses are a second catalog, and they ship as their own Wildcard
    cards now — an earlier reading of this row had five governments
    paying theirs as inherent, which no version of the game does.
    ADOPTION REACHABILITY: `computeAdoption` /
    `_adopted_gov` take the newest unlocked tier on table order, so
    Oligarchy and Classical Republic are adopted in NO game — the two
    government test lanes' borrowed-row drills hold their rows.
  - **The per-CITY war-weariness split is NOT published, and the
    empire-wide rule we implement IS** (sourced: -1 Amenity per 400 WWP,
    `warWearinessPenalty`'s shape). The three
    `WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_*` GlobalParameters are real
    data no source explains; closing this needs the C++ behaviour.
  - `GAME_SPEED` 0.6 (`constants`) — a SHAPE difference: real Civ 6
    scales cost, yield and turn tables independently per speed.
  - **THE RELIGIOUS FAITH PRICES ARE FLAT.** Every religious infobox ends
    "Faith cost is progressive"; no source publishes the progression
    (same channel `naturalistCost` names).
  - the BELIEF magnitudes (`religion` header) and the deliberate tuning
    constants in `seats` (its header names them) — stylizations that will
    never close by sourcing; recorded once.
  - the FLOOD SEVERITY split (`disasters`) — 60/30/10 is the model's; the
    Flood page publishes per-severity effects and no distribution.
  - **VALLETTA'S WALLS DISCOUNT HAS NO PUBLISHED MAGNITUDE** — the
    faith-ONLY half ships (`wallsGoldBlocked`); the reduction has no
    published figure.
  - **THE FAITH RATE FOR A LAND COMBAT UNIT IS INFERRED** — Valletta's
    page publishes the BUILDING rate ("2 Faith for 1 Production",
    `FAITH_PURCHASE_MULT`) and `unitFaithCost` /
    `_seat_faith_unit_candidate` reuse it because no page states the unit
    one.
- **B-62r. A suzerain improvement's adjacency stops at the wonder
  tile.** The PRESERVE's bands pay a natural-wonder tile (`tileYields`'
  wonder arm / `_preserve_live` — SOURCED, Grove: the band pays "adjacent
  unimproved tiles" by APPEAL, and a natural wonder is unimproved and
  Breathtaking by construction, `tileAppeal` answers 5). A pantheon's
  `featureYields` clause is VACUOUS there — the wonder stands where the
  feature would, so no feature row exists to pay. OPEN:
  - **THE ADJACENCY HALF IS UNSOURCED EITHER WAY.** `tileYields` leaves
    on `tile.wonder` before a suzerain improvement's adjacency add, and
    `_tile_add_live` masks the same tiles; no source says whether real
    Civ 6 pays it there, so both engines refuse and the question stays
    open.
- **B-63r. The grievance ledger's two unpublished magnitudes.** The
  mechanic is whole (every published row pays, the spread, the decay, the
  favor ladder, PUBLIC RELATIONS). OPEN, neither closable from a source:
  - **THE GANG-UP BAR IS A HEURISTIC** — `GRIEVANCE_GANG` is a tuning
    knob wearing a sourced unit; no source publishes an AI threshold.

## C. ABSENT SYSTEMS — the blockers, and the gaps waiting on them

Every entry here was once written down as a decision; each is a DEFERRAL
waiting on a system this engine does not have. The missing system is one
open item, and each gap that names it is another — the gaps are listed
under their blocker so the dependency is readable, and both halves count.

- **C-1. POWER — the emissions and the renewable roster.** Weight 1. The
  grid, the three plants, the fuel burn, the powered-yield splits and
  Cardiff all ship (`cityPower` / `_city_power_need`;
  `tests/gpu/power_test.py`, `tests/cpu/city/power.test.ts`; the grid is
  poke-proven — no gate lane builds a plant). So do the RENEWABLE half and
  the reactor: the SOLAR FARM and WIND FARM are improvements paying the
  Civilopedia's +2 Power each to the city that owns their plot, the
  HYDROELECTRIC DAM's `powerSupply` 6 rides the same channel, and the
  BIOSPHERE multiplies every one of them by `BIOSPHERE_POWER_MULT` /
  `biosphere_power_mult` — Cardiff's Harbor power is not on the wonder's
  list and is added after. The NUCLEAR reactor carries an AGE
  (`City.reactorAge` / `city_reactor_age`), "the number of turns that have
  passed since the Power Plant was first constructed, converted to, or last
  recommissioned": it ticks in `resolveSeatPower` / `_resolve_seat_power`,
  clears with the building, and RECOMMISSION_REACTOR (400 Production,
  Nuclear Fission, repeatable, gated on the plant standing) puts it back to
  0. Its REACH is unmeasured — the clock is poke-proven, and no scripted
  lane reaches an Atomic-era plant. OPEN:
  - **THE ACCIDENT ROLL.** The ages that open each severity are published
    — Radioactive Steam Venting, Major Radiation Leaks and Nuclear
    Meltdown become possible at 10, 20 and 30 — but NO SOURCE REACHED
    PUBLISHES THE PER-TURN PROBABILITY. The clock ships; the roll does
    not, and no number is invented for it.
  - **THE DECOMMISSION PROJECTS.** "Removes the Nuclear Power Plant and
    all its effects from this city", offered while a Climate Accords
    competition runs, and the Coal and Oil rows beside it. The removal is
    sourced; the COMPETITION SCORE each grants is not — a secondary source
    says 100 and no first-party page reached states any figure, so the
    window (B-22r) counts the emission gap alone until the owner rules on
    the magnitude.
  - **THE OFFSHORE WIND FARM SHIPS** — "+2 Production", "Provides 2 Power
    per turn", "Must be constructed on Coast and Lake", by Builders, the
    catalog's one `waterOnly` row, offered wherever a Builder stands on an
    owned resource-free Coast/Lake plot (`validImprovementsIn`'s water arm
    / `_imp_water`). PREDICTIVE SYSTEMS joins the tree with it: Future era,
    2200 Science, "+1 Production to Quarry, Oil Well, and Oil Rig" (the Oil
    Rig's share waits on an improvement the catalog does not hold), under
    the Future block's recorded convention — the game randomizes Future
    prerequisites per match, so the deepest Information-era nodes stand in.
    Reachability is poke-level: the driver's job ladder never walks a
    Builder onto water, so no gate lane builds one.
  - **A CITY-STATE'S CITIES ARE NEVER POWERED** — `resolveSeatPower` /
    `_resolve_seat_power` run inside the MAJOR seat loop only. Vacuous
    while it stands: a minor holds no building that asks for Power and no
    plant that supplies one — blocked on C-38.
- **C-2. DIPLOMATIC AGREEMENTS.** Weight 2. The 30-turn agreement clock,
  friendship, the alliance with its defensive pact, the denouncement, open
  and CLOSED borders, the Great Work gift, the DELEGATION and Resident
  Embassy, and DIPLOMATIC VISIBILITY all ship on the wire, and the
  opponent block renders visibility BOTH ways, because the GAP is what
  the combat term reads. Visibility is five levels — "None, Limited,
  Open, Secret, and Top Secret" — one per source, DERIVED rather than
  stored (`diploVisibility` / `_diplo_vis`), because every input is state
  both engines already compare: a trade route to that civ, a mission,
  the Printing tech's level with everyone, and the Listening Post or the
  alliance, which "do not add separate Diplomatic Visibility levels".
  What it buys is "Intel on enemy movements", +3 Combat Strength per level
  of the gap to the side that is ahead (`visibilityCS` / `_vis_cs`), at
  every site the barbarian pair-term already rides plus theological
  combat. THE NEGOTIATED DEAL ships too: "an 'Accept Deal' button will
  appear, which will confirm the trade that is on the table", so an
  `offer` parks two bundles and the other seat's `accept` moves them
  both, whole or not at all, with every item re-validated at that moment
  (`acceptDeal` / `_accept_deal`). Eight things may be named — gold as a
  lump or per turn, Diplomatic Favor, a lump of a consumable resource, a
  Great Work, a city, a captured spy, and Open Borders — split the way
  the page splits them: "Sums of Gold, Great Works, Relics, Artifacts,
  and captured Spies are all permanent trades ... Resources and gold per
  turn, however, are temporary, and once the deal has run its course you
  will get them back", on the same 30 turns every agreement here runs.
  Its REACH is unmeasured — `geopolitics_test.py`'s poke m is what
  exercises every item kind, and the round's smoke serve is what proves
  the two engines walk the protocol together.
  REACH, over the driven 12x250 probe: a mission in 12/12 seeds
  from t4, and every level of the ladder is entered — Limited 12/12 from
  t4, Open 12/12 from t105, Secret 9/12 from t115, Top Secret 2/12 from
  t187. OPEN:
  - **ALLIANCE TYPES AND LEVELS SHIP.** The numbers are the game's own —
    Expansion1_Alliances.xml's effect table, read against the wiki's
    Alliance page and the Well of Souls analyst table. Five types ride the
    wire (`allyType` beside `ally` in the record), one alliance per pair,
    its TYPE chosen at formation and cleared when the clock runs out.
    POINTS accrue on the pair tick — 1 per turn, "+0.25 for sending at
    least one Trade Route to the ally" and +0.25 for receiving one,
    QUARTER-points so both engines bank integers — and LEVELS land at "80
    to reach Level 2 and 160 more to reach Level 3" on Standard; each
    alliance pays Favor "per turn per level". FOURTEEN of the fifteen
    effects ship with sourced text (`alliance_levels_test.py` and the
    dividends block of `agreements.test.ts` are the bar):
    the four route halves (+2/+1 Science, Culture, Faith; +4/+2 Gold, the
    sender and receiver sides), Cultural 1 (no Loyalty pressure between
    allies) / 2 (+1 GPP per class district in cities routed to the ally) /
    3 (+10% of the ally's Culture and +20% of its Tourism), Research 2
    ("Every 30 turns", a Eureka for a tech the ally "has researched or
    boosted, but you have not" — ALLIANCE_RESEARCH_AGREEMENT, 30) / 3
    (+10% of the ally's Science while researching a tech the ally
    completed or is on), Military 1 (+5 vs common enemies, unit-vs-unit
    like the intel term) / 2 (shared visibility — the two explored maps
    fold together — and "+15% Production toward military units when you
    or your ally are at war", ALLIANCE_INCREASE_PRODUCTION_WHEN_WAR, 15,
    stacked into the production percent beside To Arms!) / 3 (a free
    promotion on trained units), Religious 1 (no religious pressure
    between allies) / 2 (+10 theological strength vs non-ally religions) /
    3 (+1 Faith per citizen following the ally's religion), Economic 2
    (+1 Envoy point per turn per ally-suzerained minor) / 3 (the named
    Suzerain bonus shared). Still OPEN, each with its blocker:
    - **Religious 3's SECOND clause** (bonus Religious Pressure to the
      ally's religion) is SOURCED and UNBUILT: ALLIANCE_RELIGIOUS_PRESSURE
      -> EFFECT_ALLIANCE_PRESSURE_FROM_NO_ALLY_RELIGION, Amount 20, on
      the owner's cities. The table gives the unit nowhere in text; the
      sibling pressure effect (the Bishop's
      EFFECT_ADJUST_CITY_RELIGION_PRESSURE, Amount 100 = "100% stronger")
      says pressure Amounts are PERCENTS. Both engines' accumulator is an
      INTEGER at 1 per following city per turn (`city_pressure`, long;
      `RELIGION_PRESSURE_PER_TURN`), so +20% of 1 floors to nothing —
      BLOCKED on C-46's pressure scale.
    - **ALLIANCE_POINTS_FOR_DEAL (2)** is a row of the same table with
      no published text behind it. UNSOURCED meaning — ask (ledger 14).
    - The GOLD purchase of the item UNDER PRODUCTION (queue front) is
      refused on both engines — `goldPurchasableBuildings` holds the
      shared reading. Real Civ 6 likely allows it with the progress
      banked, but no source in reach settles it. UNSOURCED — ask.
    - The model's OWN choices, recorded: points are ONE per-pair pool
      that persists when an alliance lapses; each side's Research 2
      Eureka is the FIRST qualifying tech in catalog order; the level-3 percentage
      terms read the ally's most recently STORED per-turn output
      (`sciRate` / `culRate` / `tourRate`, compared state on both
      engines) so the two reads never compound.
  - **A MISSION LEAVES NO MARK ON THE RELATIONSHIP.** The delegation
    itself ships — "Delegations cost 10 Gold and Embassies cost 25 Gold,
    which is paid to the other leader", one directed mission per pair,
    indefinite, the Embassy's price once Diplomatic Service is in, and war
    kicking both halves out — but the page also gives it "a small positive
    bonus in your relationship with that leader", and no source puts a
    number on that bonus. Nothing here carries it. Two clauses around it
    are this model's own and say so in the code: the refusal reads "a
    rival worse than Neutral will not accept" as the two states the
    engines can name (a war, or a denouncement either way), because there
    is no opinion scale to compare; and the AI's own send is the driver's
    scan, not a published rule.
  - **WHETHER THE INTEL BONUS APPLIES TO A CITY ATTACK IS UNSOURCED.** The
    bonus is stated for "every military encounter"; nothing published says
    whether a unit attacking a city or an encampment carries it. Both
    engines apply it unit-against-unit only, which is where the barbarian
    pair-term already lives, so the two agree by construction — but the
    choice is this model's.
  - **WHAT SECRET AND TOP SECRET UNLOCK IS AN INTERFACE.** "When you have
    Secret or Top Secret level visibility on a foreign civilization you can
    click on one of that civilization's city banners and view the City
    Details screen" — an affordance for a human player, with no rule
    behind it for either engine to run.
  - **DEMAND AND DISCUSS ARE THE OTHER TWO BUTTONS.** A demand is the
    table run one-way under hostility — "select items from their side of
    the table to demand as tribute" — and Discuss asks a leader to
    "promise to stop doing" something: settling nearby, spreading
    religion, spying, attacking your allied city-states. Both run on the
    same 30 turns as a deal. Neither ships: a demand needs the
    relationship scale this model does not have (see the mission's bonus
    above), and a promise needs a per-subject breach test.
  - **A LUXURY HAS NO LUMP TO TRADE.** The screen lists "Strategic and
    Luxury Resources"; C-5's stockpile gives a consumable a quantity, but
    a luxury here is a pure boolean access gate with no amount to hand
    over. The RESOURCE item therefore names a strategic only.
  - **WHAT A TABLE MAY HOLD IS BOUNDED HERE AND NOWHERE IN THE GAME.**
    One running deal per ORDERED pair, `DEAL_ITEMS` items a side, and an
    offer that stands for the turn it was made and the one after. Real
    Civ 6 bounds none of the three. The AI's VALUATION is unpublished, so
    it lives in the driver, where the engine never reads it.
  - **WHETHER A WAR ENDS A STANDING DEAL IS UNSOURCED.** A war kicks out
    delegations and it forbids opening a new table, but no source says
    what happens to a gold-per-turn or resource term already running.
    Both engines let it run, so they agree by construction; the choice is
    this model's.
  - **JOINT WAR, JOIN ONGOING WAR, RESEARCH AGREEMENT and
    ASK-FOR-PROMISE** — four agreements the deal protocol can now carry,
    each still needing its own effect: a war declared by two seats at
    once, a seat joining one already running, the Research Agreement's
    unpublished science, and the promise above.
- **C-5. STRATEGIC-RESOURCE STOCKPILES — the bank ships; one tail.**
  Weight 1. The bank, the ceiling, the charges, the plant fuel, the heal
  denial and the shortage penalty all ship. The penalty is the game's own
  FLAT 20 — Expansion2_GlobalParameters
  COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL, shown in the combat
  preview as "-20 Insufficient <resource>"; the wiki's "proportional to
  the amount you're short" was a paraphrase. The upkeep pass marks a slot
  SHORT when the seat's whole bill exceeds the bank (`chargeUnitUpkeep` /
  `_seat_charge_upkeep`), and every strength read of a unit drawing that
  slot takes the 20 (`fuelShortCS` / `_fuel_short_cs`) until the next pass
  meets the bill (`fuel_short_test.py`, `strategic-resources.test.ts`).
  Reach: the driven gate reaches Oil units only in the late hundreds of
  turns — poke-proven, gate reach unmeasured. OPEN:
  - **ZANZIBAR'S TWO EXISTS-NOWHERE-ELSE LUXURIES** — B-21r.
- **C-16. THE SPY'S SECOND HALF.** Weight 2. The Spy, its capacity, the
  jump, the twelve-mission catalog, the counterspy post, the capture roll,
  the ESPIONAGE promotion class, the Espionage Pact's two outcomes (B-22r)
  and the Listening Post's payload (C-2's visibility) ship (`spy_test.py`, `spy.test.ts`). The gate REACHES the spy now — Catherine's free Spy at Castles puts one on the map — and the first serve that produced one found the head silenced on TS: `applySeatUnitOrders` refused every order for a unit with no movement left, which is a spy always (moves 0), while the GPU's applier gates on presence. Fixed; the reachability note is retired. The chassis is a CIVILIAN — its own page types it
  "Civilian/Espionage" — so `unitIsMilitary` / `_type_military` is what To
  Arms! pays now, and the Spy is outside it. The class is a flat pool
  of seventeen rows with no prerequisites, three drawn without replacement
  at each level (`levelUpSpy` / `_level_up_spy` over the `promoOffer`
  channel the Apostle already had). Nine are one shape — "<mission> as if
  2 levels more experienced", read by `promoValueFor` / `_spy_op_levels`
  off the mission's own bit — and the other four live rows are Linguist's
  25% clock cut, Disguise's instant arrival, Quartermaster's +1 level to
  every own spy from home and Polygraph's 1 level off every intruder.
  Bodyguard of Lies rides Disguise's channel: the golden face's
  no-establish clause had never landed on either engine. OPEN:
  - **THE ESCAPE SEQUENCE SHIPS.** A discovered spy "will need to escape
    from the target city" — by Airplane (an Aerodrome, 1 turn home), Boat
    (a Harbor, 2), Vehicle (a Commercial Hub, 3) or on Foot (always, 4),
    a survivor reappearing in the CAPITAL on the existing travel
    machinery, a lost escape splitting captured-vs-killed on the old
    catch odds. The gates, the times and the "faster = more dangerous"
    ordering are sourced; each route's base rate (`SPY_ESCAPE_ROUTES`)
    is a MODEL value under that ordering, and the ROUTE CHOICE — the
    real game asks the player — is a recorded model rule: the fastest
    route whose district stands. ACE_DRIVER is LIVE with its own sourced
    figure: "If caught on a mission, have a much higher chance of escape
    (+4 levels)", riding the missions' per-level term on the escape roll.
  - **A RELEASED SPY IS A NEW SPY.** The cell itself ships: a caught spy
    is now "imprisoned, but not killed", held by the seat whose city made
    the catch, still counted against its owner's capacity ("if you've
    trained the maximum number of Spies possible, you cannot train a new
    Spy to replace one that gets captured"), and traded back through C-2's
    table to arrive "immediately returned to the original owner's
    Capital". What a cell holds is a COUNT, keyed owner -> captor, so the
    spy that comes home has no level and no promotions. No source says
    whether the real one keeps them (re-searched 2026-08-31: still
    nothing published) — carrying them would need an off-the-map LIVING
    unit, a new unit state every units walk on both engines would have
    to tolerate. UNSOURCED — ask.
  - **THE SAME-MISSION GATE SHIPS**, now sourced — the Espionage page:
    "a single city may contain more than one Spy, but no two Spies may
    perform the same Mission in the same city." Read per OWNER (the one
    scope a player's own mission list can see), a recorded model choice.
  - **A SPY STANDS ON THE CITY CENTRE AND NOWHERE ELSE.** The jump
    targets `city_center`, and the mission reads the district registry
    rather than the plot the spy holds, so a counterspy already defends
    every district of its city. SURVEILLANCE ("when Counterspying all
    city districts are defended, and +1 level at districts within 1 hex")
    ships INERT on that: its first half is already true here and its
    second has no geometry to measure. A spy that occupies the district
    it works out of is the missing mechanic.

  - **FABRICATE SCANDAL SHIPS** — mission thirteen, appended LAST (the
    mission head is the wire and every later verb column derives its
    base from the list's length on both engines): "16 (Standard Speed)"
    turns at 56% per the chassis' own table, performed "in a City-State
    that you are not Suzerain over", the travel head offering minor
    centres. On success "all other players lose a number of Envoys
    determined by the Spy's level" — the SHAPE is sourced, the map is
    not: `SPY_SCANDAL_ENVOYS_BASE` + 1 per effective level are MODEL
    values. SMEAR_CAMPAIGN is LIVE on its bit. A minor keeps no cell, so
    a spy its escape fails is killed, never imprisoned — a recorded
    model choice (the diplomacy table has no minor seat to trade with).
  - **SABOTAGE PRODUCTION pillages the BUILDINGS**, per the source, not
    the district; a per-building pillage flag is the difference.
  - **WHAT A LEVEL IS WORTH IS THIS MODEL'S OWN.** The Spy chassis'
    own mission table publishes each operation's DURATION (8 turns, 16
    for the Counterspy post) and its base success RATE (10% Recruit
    Partisans; 20% Great Work Heist, Disrupt Rocketry, Breach Dam; 35%
    Sabotage Production, Steal Tech Boost, Neutralize Governor; 56%
    Siphon Funds, Foment Unrest; 56% Fabricate Scandal), and both
    engines now carry that table per mission. What it does NOT publish
    is how a LEVEL moves that rate — only that it does, since nine
    promotions read "as if 2 levels more experienced" — nor what a
    failure costs. `SPY_SUCCESS_PER_LEVEL_PCT` and `SPY_CAPTURE_PCT` are
    those two, and the escape routes' base rates join them as stated
    model values. The Intelligence Agency's
    success bonus has no published figure either.
- **C-20. THE MILITARY ENGINEER'S LAST VERBS.** Weight 1. The Fort, the
  Airstrip, both routes and the 20% charge ship; gate reachability is ZERO
  (no seed trains the chassis) and `engineer_test.py` pokes every rule.
  The MISSILE SILO ships (Rocketry, flat land, no plunder) and so does
  **"Can clean Nuclear Fallout"** — `CLEAN_FALLOUT` / `_rk_clean`, offered
  to any chassis holding a build charge, because the charge is the whole
  gate the page states. What the silo is FOR is C-31's item. OPEN:
  - **THE MOUNTAIN TUNNEL** — SOURCED (Expansion2_Improvements.xml):
    `IMPROVEMENT_MOUNTAIN_TUNNEL`, PrereqTech CHEMISTRY, built by the
    Military Engineer alone (`Improvement_ValidBuildUnits`) on a Mountain
    tile of any of the five mountain terrains from an ADJACENT plot
    (`BuildOnAdjacentPlot`), `CanBuildOutsideTerritory`, `PlunderType`
    NONE and `DisasterResistant` ("Cannot be pillaged or removed"), and
    `AllowImpassableMovement`. Its description: "Acts as a movement portal
    on a mountain range, allowing units to move into it and exit from
    another portal at the cost of 2 Movement. Trade Routes traveling
    through it can multiply the Gold they get from districts at their
    destination." UNBUILT: a portal between two improvements is a new
    pathing class (every mover walks `neigh`; a tunnel pair is an edge
    the geometry does not hold) on both engines, and the trade-route gold
    multiplier's MAGNITUDE lives in `EFFECT_MOUNTAIN_PORTAL`, DLL-side.
    Whether the build spends a charge is the general rule (no
    per-improvement exemption exists in the table).
  - **"Can Remove Tile Improvements (costs no charge)" SHIPS** — the
    Builder's and the Military Engineer's pages carry the ability verbatim,
    and `REMOVE_IMPROVEMENT` is one appended column for both chassis on an
    own tile holding one: the improvement is GONE rather than pillaged, its
    based aircraft scatter, the turn is spent and no charge is. The driver
    never picks it, so it is poke-proven only.
  - (The Bath in the charge's district list is Rome's unique Aqueduct —
    C-26.)
- **C-31. THE NUCLEAR STRIKE'S LAST CLAUSES.** Weight 1. The ARSENAL,
  the GROUND and the BLAST all ship. CIV6 (Nuclear weapons): both devices are
  catalog rows (radius 1 / fallout 10 / range 12 / 14 Gold / 10 Uranium,
  and 2 / 20 / 15 / 16 / 20); the Manhattan Project and Operation Ivy
  unlock the two repeatable City Center builds; a finished device "is
  added to the player's inventory", so it is a per-seat count
  (`Seat.wmd` / `civ_wmd`) billing its Gold beside the seat's units, and
  Second Strike Capability halves that bill. The Missile Silo is an
  improvement (C-20). Contaminated ground is `Tile.falloutTurns` /
  `tile_fallout` and every clause it carries — the countdown, the 50 HP a
  turn that spares a Giant Death Robot, the unworkable tile, the district
  and building and unit and purchase block, the heal and repair refusal —
  with `CLEAN_FALLOUT` to take it back. Reach is ZERO: a device needs
  Nuclear Fission, which no seed reaches in 250 turns, so the proof is
  `tests/gpu/fallout_test.py` and `tests/cpu/map/fallout.test.ts`.
  THE BLOW itself now ships: `detonate` / `_detonate` walks the device's
  own radius in tile-index order and runs the page's clauses in the order
  it states them — the declaration on every civilization or city-state
  whose territory or units are in the blast FIRST, then the units
  destroyed (a Giant Death Robot instead takes `NUKE_ROBOT_DAMAGE` and
  lives), the improvements and Districts pillaged, the fallout painted for
  the device's own count of turns, and the City Center and Encampment left
  with both pools empty, floored where every non-melee blow floors them
  because a nuke never CAPTURES. A launch bills the LAUNCHER
  `warWearinessLaunch` / `_ww_launch` per victim and raises the Nuclear
  Emergency over the launcher's own capital. Three chassis throw it —
  `nukeCarrier` is the bombers and the Nuclear Submarine, a bomber at its
  own operational range and a submarine at the device's Range — and the
  MISSILE SILO throws for the SEAT, since it is an improvement and not a
  unit. So there are two verbs: the `NUKE_{k}_{c}` head per carrier, and
  the seat-level launch beside the levy, both re-validating the named
  (device, tile) pair at the apply. Reach stays ZERO; the proof is
  `tests/gpu/nuke_test.py` and `tests/cpu/units/nuke.test.ts`. OPEN:
  - **INTERCEPTION.** CIV6: "Destroyers, Battleships, Missile Cruisers,
    and Mobile SAMs can protect adjacent tiles from nuclear strikes", and
    the Mobile SAM is the only one that stops a submarine's. What no
    source publishes is the ROLL — the chance itself, whether the escort
    must be undamaged, and what a stopped device costs its owner.
    `NUKE_INTERCEPTORS` and `NUKE_COVER_RANGE` are exported and read by
    nothing until that is sourced. ASK THE OWNER.
  - **THE CITIZENS THE BLAST KILLS.** CIV6: "Citizens 'working' the
    affected tiles are eliminated." BLOCKED on a mechanic, not on a
    source: neither engine exposes a worked-tile SELECTION outside its own
    yield walk (TS derives `CityStats.workedTiles` inside
    `assignWorkedTiles`; the GPU's pick lives inside `_seat_city_walk`'s
    own ranking), so there is no assignment both could read the same way.
    Extracting one is its own task; the clause is recorded rather than
    approximated on either engine.
  - **THE WONDER IN THE BLAST.** The pillage clause names improvements,
    Districts and buildings and says nothing about a wonder, so neither
    engine touches `built_wonder` / `city_wonder`. That is UNSOURCED
    rather than decided. ASK THE OWNER.
- **C-33. THE GIANT DEATH ROBOT'S REMAINING ABILITIES.** Weight 1. Every
  published clause on the chassis now ships. The water walk — it moves
  and fights on Coast and Ocean "as it would on land" (`waterWalks` /
  `unit_water_walk`: no embark, no seafaring tech, no cliff, and its own
  pool and strength throughout). "Can only heal in friendly territory" —
  its own ground or an ally's, a WIDER bar than Twilight Valor's "outside
  your territory", so the two are two predicates. "Cannot earn experience
  or Promotions" (`xpEligible` / `_xp_eligible`) and "Cannot form Corps or
  Armies by any means" (`formationBanned`, and the FORM_UP column refuses
  the chassis as actor and as host). "-17 Ranged Strength against District
  defenses and naval units" — the district half is `rangedCityPenalty`,
  which every land ranged unit already pays, so `gdrNavalCS` /
  `_gdr_naval_cs` carries the naval half alone.

  THE FOUR FUTURE-ERA UPGRADES need no per-unit state after all: the page
  says the chassis "gains additional abilities and upgrades via Future Era
  technology research", so an upgrade is the SEAT's tech, empire-wide, and
  `GDR_UPGRADES` / `_gdr_upgrade_tech` reads it off the research plane.
  Drone Air Defense raises Anti-Air Defense Strength to 130 (`antiAirAt` /
  `_anti_air_at`); the Particle Beam Siege Cannon waives the city penalty
  and pays +30 against Cities and Encampments attacking and defending
  (`gdrBeamCS` / `_gdr_beam_cs`); Enhanced Mobility pays +3 Moves; and
  Reinforced Armor Plating pays +10 defending against land and naval units
  (`gdrArmorCS` / `_gdr_armor_cs`). Advanced AI and Cybernetics joined the
  Future tree to carry two of them.

  Reach is ZERO — the chassis needs Robotics and the upgrades a Future-era
  tech, which no seed reaches in 250 turns — so the proof is
  `tests/gpu/robot_test.py` and `tests/cpu/units/robot.test.ts`.

  OPEN: **what the Jump COSTS.** Enhanced Mobility "can perform a Jump
  action to cross over mountain terrain"; a mountain hex is enterable to
  the upgraded chassis here (`gdrJump`, and the same term on the GPU move
  mask), at the tile's ordinary movement cost and with no head of its own.
  Whether the real action spends the whole turn, costs a fixed pool, or
  reaches further than one hex is not published anywhere this repo has.
  ASK THE OWNER before any of it is written; no branch ships on a guess.
- **C-34. AIR COMBAT'S SECOND HALF.** Weight 2. Bases, both heads, the
  sortie, the carrier and the scatter ship — and the sortie now rolls
  the promotion term on both sides (`promoCS` / `_promo_cs` with `vsAir`
  and `vsAntiAir`), pays both sides' XP, and reads the operational range
  through `RANGE`. The PARKED ANTI-AIR WEAPON answers too — CIV6 (Anti-Air
  Gun, Mobile SAM): "Provides cover from air attacks up to 1 hex away from
  the weapon", Range 1 — which `airCoverAgainst` / `_air_cover_scan` fold
  into the same one answer the anti-air hull already fired, strongest first
  and ties by tile then by the tile's own occupancy order. AIR PILLAGE is
  its own head (`AIR_PILLAGE_k`, the strike head's width and column order):
  CIV6 (Bomber) — a bomber "may attack tile improvements and districts,
  though they need more than 50% health to do so (or the Superfortress
  Promotion, which removes the minimum health requirement)", and the wreck
  "is equivalent to Pillaging but does not yield any spoils", so
  `airPillage` / `_air_pillage` wreck what the ground verb wrecks, pay
  nothing, spend the sortie, and take the covering weapon's answer.
  GATE REACHABILITY IS ZERO for the whole chapter — no seed trains an
  aircraft inside 250 turns — so every clause above is proved by
  `tests/gpu/air_test.py`, `tests/gpu/air_promo_test.py` and
  `tests/cpu/units/air.test.ts` + `tests/cpu/units/air-promotions.test.ts`,
  and by nothing the battery's serve lane runs. OPEN:
  - **INTERCEPTION BY A FIGHTER** has no published roll. The wiki says
    only that "every Interception does damage to the unit being
    intercepted", that a shot-down plane never lands its attack and a
    surviving one still does, and that a fighter "takes damage for each
    attempt" — no strength, no formula, no cap on attempts. Three invented
    numbers is what building it would cost, so it waits on a source rather
    than on a mechanic. PATROL waits on it in turn: a deployed fighter's
    whole point is the interception it then makes, and B-56r's
    GROUND_CREWS waits on the PATROL state.
  - **PRIORITY TARGET** — the Jet Bomber's reach past a stack's military
    occupant to the SUPPORT unit under it. The Civilopedia's Jet Bomber
    page does not carry the ability at all, and the flat "sustains 65
    damage" is wiki text this session could not fetch to quote. Unsourced
    magnitude, so unbuilt.
  - **THE NUCLEAR DELIVERY**'s interception half (the strike itself is
    C-31, the silo C-20).
  - **THE AERODROME'S SLOT COUNT HAS TWO SOURCES THAT DISAGREE.** The Air
    Combat page says an Aerodrome "has 2 slots initially, and can reach 4
    slots after constructing the Hangar and the Airport"; each building's
    own Civilopedia entry says "+2 air unit slots in Aerodrome district",
    which would reach 6. Both engines carry the page's reading (`airSlots`
    1 apiece, `_aerodrome_air_slots` + `_b_air_slots`). Neither number is
    invented, and nothing here decides between them.
- **C-35. THE DROWNED GROUND KEEPS ITS RECORD.** Weight 1. Sea-ness MOVES
  now: `Tile.submerged` / `tile_submerged` turn a tile to open water, and
  every GPU plane the exporter derives from `isWater` is state
  (`_submerge`). What the sea takes with the ground is the improvement, the
  district, the resource and the ground's own use; what it leaves is the
  MAP's record — terrain, feature and river edges stay underneath. That
  reading is unsourced either way, and it is what keeps both engines
  identical: every ring fact the exporter derives reads TERRAIN
  (`isCoastalLand`, the Seaside Resort's coast, fresh water, the Aqueduct's
  source, district adjacency's WOODS/RAINFOREST/REEF sources), so a drowned
  Woods still lends its neighbours what it always did, on both engines. The
  ONE neighbour answer that asks `isLand` is `isCoastalWater`, and
  `_submerge` moves it with the wonders that need it. OPEN: whether real
  Civ 6 keeps a submerged tile's feature working for its neighbours, or
  strips the ground bare.
- **C-22. THE DISTRICT ROSTER.** Weight 1. All eighteen districts exist
  with catalog-column effects and sourced placement clauses; the Preserve
  and Government Plaza ride the gate on 12/12 seeds, the Canal on none —
  its placement and its naval passage (`canalPassage` / `_canal_pass`) are
  both poke-proven only. The Government Plaza's
  five effect rows all ship, the Royal Society's BOOST_PROJECT verb last
  (`projectBoostCity` / `_project_boost_slot`,
  `tests/cpu/city/plaza-buildings.test.ts`, `tests/gpu/plaza_test.py`);
  its measured gate reach is ZERO — no seed of the twelve builds the
  building, so no Builder is ever offered the column — which puts it
  beside the Military Engineer's two verbs as poke-proven only. The
  ANY-WORK POOL REACHES ARTIFACTS: artifact room is a per-city capacity
  like the other four kinds (`artifactFree` / `_artifact_free` — the
  museum's own slots plus what is left of the pool), the Archaeologist's
  training gate and the excavation's landing city both read it, and the
  pool's free count debits artifact overflow. The theming rule stays the
  museum's own — it asks that the building STAND, and the DOUBLE reaches
  only the three it holds (`_artifact_theming_counts`), never a
  pool-standing find; the provenance arrays widened to every slot a find
  can stand in (`ARTIFACT_PROV_W`) and statecompare compares the full
  width. OPEN:
  - **THE PRESERVE'S HOUSING TABLE IS THIS MODEL'S OWN** —
    `PRESERVE_APPEAL_HOUSING` / `preserveHousing` state the published
    ceiling at Breathtaking; no source can close the middle.
- **C-26. CIVILIZATION UNIQUES.** Weight 8. The roster is the install's:
  34 civilizations and 38 leaders (`CIV_LEADERS`, one row per
  civilization-leader pair; `Seat.civ` indexes the row), the seeder drawing
  each world's trio so a battery reaches the whole list. docs/ROSTER.md is
  the census — every trait's modifiers by effect type off the XML. Four
  civilizations ship in full; the other thirty seat as plain civilizations
  until their batch lands. A seat plays one of
  the roster's civilizations (`CIV_IDS`, `row_civ`) and its
  leader (`CIV_LEADERS[].leader`, `leaderOf` / `_row_leads`); its unique
  unit, unique infrastructure, civilization ability and leader ability
  ship from the install's own XML (Units, Districts, Buildings,
  Improvements, Traits and their Modifiers). OPEN: the agendas — DLL-scored,
  and neither engine holds an opinion scale. The
  roster is four civilizations; widening it is data (a `CivId`, a
  `CIV_LEADERS` row, the unique rows' `uniqueTo`) and the seeder's
  `leader` draw, which today seats civilization i at seat i.
  Waiting on the wider roster: the Impi and Hypaspist stacks (B-54r), the Gauls'
  OPPIDUM, Ambiorix's and Saladin's leader terms, the Nihang's embarked
  CS, America's Film Studio, the unique-improvement appeal terms (shipped with the Sphinx)
  and suzerain rows (B-21r), and the ROCK BAND's four unique-district
  venue clauses (Expansion2_UnitPromotions.xml: Arena Rock also reads the
  Street Carnival, Reggae Rock the Copacabana, Glam Rock the Acropolis,
  Surf Band the Royal Navy Dockyard — each a `BAND_VENUE_BIT` the
  district does not exist to raise).
- **C-60. NO FREE CITY STEP.** Weight 1. CIV6: a city that revolts for
  loyalty becomes a Free City, and only later joins whoever pulls hardest;
  Eleanor's leaders skip that step. Both engines go straight from the flip to
  the new owner — `flipCity` calls `transferCity(..., 'loyalty collapsed')`,
  `_seat_loyalty_flips` calls `_transfer_city(..., conquest=False)` — handing
  the city to the non-allied living seat with the highest raw pressure, ties to
  the lowest seat id. So every seat already behaves as Eleanor alone should.
  This is a FIDELITY gap both engines share, not a divergence: the parity gate
  cannot see it. The carrier is an ownerless city class plus the turns it sits
  in one; `SKIP_FREE_CITY_ROWS` is sourced and deliberately off the wire.
- **C-61. THE CAPITAL NEVER MOVES.** Weight 1. CIV6 (Founder of Carthage):
  "Can move their original Capital to any city with a Cothon they founded by
  completing a unique project in that city." `relocatePalace` /
  `_relocate_palace` move `isCapital` only when the seat holds NO capital (the
  old one having fallen), and `origCapitalSeat` / `civ_cap_tile` are written
  once at founding and never again — which is what the occupied-capital favor
  penalty and the domination check both read. The clause also needs a
  civ-UNIQUE project, and `ProjectDef` carries no civ or leader field.
- **C-62. A WAR TYPE.** Weight 2. The install has DIPLOACTION_DECLARE_TERRITORIAL_WAR
  and DIPLOACTION_DECLARE_LIBERATION_WAR: war KINDS with their own civic
  prerequisite, each granting the declarer a 10-turn buff (Chandragupta +2
  Movement and +5 Combat Strength, Robert the Bruce +100% Production and +2
  Movement). Both engines carry exactly two kinds on `seat_warkind` — formal
  and surprise — decided by a casus belli, with no prerequisite of their own
  and no clock after the declaration. The carrier is a war-kind enum wide
  enough for the install's list, a per-kind civic gate on `declareWar` /
  `_declare_war_major`, and a per-pair countdown the buff reads. Six modifiers
  wait on it.
- **C-63. A LEGACY BONUS ACCRUES NO TIME.** Weight 1. CIV6 (Founding
  Fathers): "Earn all government legacy bonuses in half the usual time."
  Both engines model the legacy CARD itself — `PolicyDef.legacyOf` and the
  `LEGACY_${g.id}` synthesis, `_pol_legacy` and the `is_leg`/`been` block —
  but gate it on `Seat.government.held`, a bit meaning "this seat has held
  that government at some point". There is no accrual to halve. The carrier is
  turns-in-government per seat per government, with the card unlocking at a
  threshold that the rate scales.
  BLOCKED ON A NUMBER THE INSTALL DOES NOT CARRY (2026-09-03, measured). The
  XML gives the SHAPE and nothing else: `Governments.BonusType` names each
  government's accumulated bonus (Autocracy WONDER_CONSTRUCTION, Oligarchy
  COMBAT_EXPERIENCE, Classical Republic GREAT_PEOPLE, Democracy
  DISTRICT_PROJECTS, ...), `GovernmentBonusNames` lists the ten type names with
  no fields at all, and America's nine `TRAIT_*_BONUS_RATE` modifiers carry
  `BonusRate: 100` with NO ModifierType — they are DLL-read data, not effects.
  What is missing is the THRESHOLD the rate scales (how much accrual earns the
  card) and what each of the ten bonuses actually pays; neither appears in any
  XML table or in GlobalParameters. Rate 100 against the published "half the
  usual time" reads as +100% accrual, which is the one inference the two
  sources agree on. The threshold belongs to the sourcing pass (#211) — do not
  invent one. America's nine BONUS_RATE modifiers wait here.
- **C-59. A GENERIC THEMED CARRIER.** Weight 1. CIV6 (Kristina):
  "Buildings with at least three Great Work slots and wonders with at least two
  Great Work slots are automatically themed when they have all their slots
  filled", and a themed set then pays +100% yields and +100% Tourism. Theming
  on both engines is the MUSEUM's alone — `museumThemed` / `artMuseumThemed`
  and `_museum_themed` / `_art_museum_themed` — and the GPU comment says
  outright that "a wonder's art slots sit outside the bonus". The carrier is a
  slot-count rule over any Great Work holder, wonders included, with the themed
  bonus as a factor both the yield and the tourism walk read. Kristina's four
  modifiers are marked open against this item in docs/roster_ledger.json.
- **C-56. A TRADE ROUTE'S RELIGIOUS PRESSURE.** Weight 1. CIV6 (Dharma):
  "+100% Religious pressure from your Trade Routes." A live route in real Civ 6
  radiates its origin city's religion to the destination and the destination's
  back along the same leg. Neither engine's pressure body reads trade at all —
  `spreadReligiousPressure` / `_spread_religious_pressure` radiate from the
  holy city, a Missionary or Apostle spends a charge, theological combat swings
  it, and a disciple's kill spreads it. The carrier is a per-route pressure
  term in that per-turn body on both engines, with the roster's percentage on
  top; India's modifier is marked open against this item.
- **C-57. ONE FOLLOWER BELIEF PER CITY.** Weight 1. CIV6 (Dharma):
  "Receives Follower Belief bonuses in a city from each Religion that has at
  least 1 Follower." A city on both engines pays exactly one follower belief —
  the one its FOLLOWED religion carries (`withFollowerBelief` keyed by
  `followerReligionForCity`; `_follower_id_for` / `_fol_tab`). The amenity half
  of Dharma ships, since that one counts religions rather than stacking their
  beliefs, and `religionsPresent` / `_religions_present` is the shared count it
  reads. Note both engines model PRESSURE and not followers, so "a religion with
  at least 1 Follower" is read as "a religion with pressure here" — the same
  proxy on both sides, and the honest one given the model.
- **C-58. A DEFEATED UNIT IS NEVER CAPTURED.** Weight 1. CIV6 (Mongol
  Horde): "All cavalry class units gain +3 Combat Strength and a chance to
  capture defeated enemy cavalry class units." The strength ships. The capture
  does not: a unit that loses a combat is removed on both engines, and the only
  re-seating paths are `convertHeathens` (an adjacent barbarian) and the
  capture-on-move of an undefended Settler or Builder. The carrier is a
  post-combat capture roll that re-seats the loser's chassis under the victor,
  with the roll's odds sourced before it ships.
- **C-54. A WONDER'S FREE ERA BOOST.** Weight 1. CIV6 (Dynastic
  Cycle): "When completing a wonder receive a random Eureka and Inspiration
  from the era of the wonder, if available." Both engines can already draw a
  random tech boost — the Great Library's, an inline block in the recruit
  body on each side — but the draw is over every unearned boost, not over one
  ERA's, and nothing fires on a wonder COMPLETING. The carrier is an era-keyed
  pool for both the tech and the civic draw, called from the wonder-complete
  path on both engines; China's two modifiers are marked open against this
  item in docs/roster_ledger.json.
- **C-50. APPEAL IS MAP-GLOBAL.** Weight 1. `tileAppeal(map, tile, camps,
  gpAppeal)` and the GPU's appeal plane answer one number per tile for
  every seat. CIV6 keys roster clauses on a seat's own view: the Amazon
  ("Rainforest ... grant +1 Appeal to adjacent tiles, instead of the usual
  -1", EFFECT_ADJUST_FEATURE_APPEAL_MODIFIER +2) CORRECTED: Roosevelt's National Park
  appeal shipped in batch 13 — a per-CITY add is what `cityAppealResolver` /
  `_gp_appeal_plane` already carry, and only the FEATURE half is blocked here. The carrier is a per-seat
  appeal read threaded through the four consumers — housing, amenities, the
  Seaside Resort's gold and the National Park's site — and the GPU's cached
  plane becomes one per row. The Amazon's four ADJACENCY rows ship; its
  appeal row is marked open against this item in docs/roster_ledger.json.
- **C-49. NAMED RANDOM EVENTS.** Weight 1. `disasterPhase` floods a
  river, storms a tile, droughts a region and erupts a volcano, but none of
  it carries the install's RandomEvent NAME or category, and units take
  disaster damage by a single rule. CIV6 keys eight roster clauses on those
  names: Divine Wind ("Units do not receive damage from Hurricanes.
  Civilizations that are at war with Japan receive +100% unit damage from
  Hurricanes in Japanese territory") over hurricane categories 4 and 5, and
  Mother Russia's same pair over Blizzards, significant and crippling. The
  carrier is a per-event kind on the disaster roll plus a damage multiplier
  keyed on the tile's owner; the eight modifiers are marked open in
  docs/roster_ledger.json against this item.

  SOURCED 2026-09-03, except one magnitude. The install decides the storm's
  FAMILY by the terrain it starts on (`RandomEvent_Terrains`): HURRICANE on
  TERRAIN_OCEAN, BLIZZARD on snow and tundra (flat and hills), DUST_STORM on
  desert, TORNADO on grassland and plains. Each family has two severities —
  CAT_4/CAT_5, SIGNIFICANT/CRIPPLING, GRADIENT/HABOOB, FAMILY/OUTBREAK — and
  `RandomEvent_Damages` gives every column per severity as a percentage:

  | family | impPill | impDest | distPill | bldgPill | pop | civKill | unitLand | unitNaval |
  |---|---|---|---|---|---|---|---|---|
  | HURRICANE  | 50/100 | 25/50 | 15/50 | 40/100 | 0/15 | 0/20 | 0/100 | 60/100 |
  | BLIZZARD   | 50/100 | 25/50 | 15/50 | 40/100 | 0/15 | 0/20 | 0/100 | 0/60 |
  | DUST_STORM | 75/100 | 35/75 | 20/75 | 60/100 | 0/20 | 0/20 | 0/100 | 0/60 |
  | TORNADO    | 75/100 | 35/75 | 20/75 | 60/100 | 0/20 | 0/20 | 0/100 | 0/100 |

  A column absent from a row is zero, not inherited. Note the engine's storm
  picks from LAND only, so a hurricane cannot start where the install puts it
  until the roll can reach open water.

  BLOCKED ON THE UNIT HP BAND. `UNIT_DAMAGE_LAND` is a SHARE OF UNITS, not a
  magnitude — the proof is the flood: the install writes 100 at BOTH
  FLOOD_MAJOR and FLOOD_1000_YEAR, while this engine's own wiki-sourced band
  differs between them (30-50 HP and 50-70 HP). So the percentage says how
  many units are hit and something outside the XML says how hard. The flood's
  band came from the wiki; the storms' has no equivalent here, and mapping the
  flood's ladder onto storm severities 1 and 2 would be an invention. That
  band belongs to the sourcing pass (#211) — the eight roster clauses PREVENT
  and DOUBLE unit damage, so there is nothing for them to modify until it is
  known.
- **C-47. TRIBAL VILLAGES.** Weight 1. TS holds a six-outcome stub
  (`claimGoodyHut`, a `tile.goodyHut` flag the mapgen can set), the GPU
  holds nothing, and the exporter refuses a world carrying a hut — so no
  gate lane reaches the stub and an outpost capture is a plain kill on
  both engines. CIV6 (Epic Quest): "Receive a Tribal Village reward each
  time you capture a barbarian outpost" — the clause waits on the
  mechanic, and the reward TABLE (Expansion2_GoodyHuts.xml) is the source
  to seed both engines from; the stub's six arms are unsourced.
- **C-38. A CITY-STATE'S CITY DEVELOPS HALFWAY.** Weight 1. The minor
  BUILDS now (`minorBuildPhase` / `_minor_build`): a production pot takes
  POPULATION points a turn — the `minorResearch` pacing stylization, since
  no source publishes a rate — and a fixed ladder spends it: Ancient Walls,
  the district its type names (SOURCED: a city-state "will build a district
  within their territory that corresponds to their type"), a Harbor when it
  sits on the coast, then the higher walls. Each item pays the rules a
  major pays — the minor's OWN researched unlock, `canPlaceDistrictIn` on
  its own ground (the lowest legal plot), the district price scaled by its
  own research, and no higher wall over a damaged perimeter. The walls
  FIGHT: both engines' city-state damage sites route through the shared
  `cityDamageSplit`, the tier joins the defense strength, and the conquest
  CARRIES buildings, registry and perimeter into the captured city.
  `tests/gpu/minor_builds_test.py` is the bar; the LADDER's order and the
  one-item-a-turn pace are MODEL choices, recorded. Still absent:
  - ~~district BUILDINGS — the minor's Campus holds no Library.~~ CLOSED,
    with a stale claim CORRECTED: the majors' 3-/6-envoy bonuses were
    ALREADY building-keyed here (`cityStateEnvoyBonuses` / the
    `_citystate_t1idx` scatter) — this file's "stay district-keyed"
    reading had rotted, and the militaristic column really was mis-keyed
    (tier 2 read the STABLE). CIV6 (R&F): the pair Barracks OR Stable at
    3 envoys and the ARMORY at 6; cultural tier 2 is either museum — the
    `CITY_STATE_TYPE_TIER1`/`CITY_STATE_TYPE_TIER2` tables carry it on
    both engines. The minor itself now raises its type district's tier-1
    building: the rung after the district in `minorLadder` /
    `_minor_build`, gated on the COMPLETE district and the minor's own
    unlock; the first pair member, a model choice.
  - **the yields of any of it** — a minor's districts produce nothing for
    the minor (its research runs on population, not on the Campus), and a
    levied garrison earns no barracks experience from the building now
    standing;
  - **power** (C-1) — a minor's cities still draw and supply nothing.
- **C-41. NOTHING PLACES VOLCANIC SOIL.** Weight 1. The row ships with the
  name its page gives ("This land adjacent to a volcano has suffered from a
  previous eruption ... Can receive additional yields from environmental
  effects" — the `fertility` channel, which the eruption already lays
  down) and no yields of its own. THE CARRIER NOW SHIPS: `addFeature` /
  `_add_feature` plant a feature after t0 on both engines (`feat_id` is
  live beside a static `feat_id0`, the yield walk prices the arrival from
  `featCatalogY`, and `statecompare` compares feature IDENTITY), and
  FIRE_GODDESS's "+2 Faith from ... Volcanic Soil" half pays the turn the
  soil exists (`feature_add_test` / `feature-add.test.ts` — the carrier's
  whole reach, since no rollout path calls it). OPEN:
  - WHERE THE SOIL LANDS. The eruption laying it on volcano-adjacent land
    is the obvious runtime writer, but every improvement clause in this
    engine reads a featured tile as occupied — a Farm, a Mine and a
    Seaside Resort each ask for `tile.feature === null` — so the paint
    would refuse those three on every tile beside a volcano, and the
    carrier's own envelope refuses a tile already improved. No source
    reached says Volcanic Soil refuses an improvement, and inventing
    either answer is what this file exists to stop. ASK THE OWNER.
- **C-45. THE QUEUE'S DEPTH IS A FIXED FIVE.** Weight 1. A city holds
  `PRODUCTION_QUEUE_MAX` items and refuses the sixth. Real Civ 6 publishes
  no ceiling on its queue, and the number here is a CAPACITY choice, not a
  sourced magnitude: the GPU's queue is a tensor dimension (`sim.QD`, the
  last axis of `city_current` / `city_progress` / `city_cost` /
  `city_qtile`) and must be finite, so TS carries the same cap to keep the
  two engines answering alike. Raising it costs one constant and one
  re-export; removing the ceiling entirely would cost the GPU its dense
  storage. The per-item hammer ledger a CANCELLED entry banks into
  (`city_item_bank`, eight columns per city) is the same class of choice —
  a full ledger banks nothing more. Reach: the driven gate fills queues to the cap by the early
  hundreds of turns, so the refusal itself is exercised.
- **C-46. RELIGIOUS PRESSURE IS A STYLIZED INTEGER.** Weight 1. Both
  engines accumulate pressure as a whole number — every following city
  within `RELIGION_PRESSURE_RANGE` adds `RELIGION_PRESSURE_PER_TURN` (1),
  the Holy City x4, a Holy Site city x2, a missionary lump of
  `SPREAD_PRESSURE` (10, x1.5 under Scripture), the theological swings —
  and the declared stylization in `cpu/data/religion.ts` says so. The
  game's own model is SOURCED now (Base GlobalParameters):
  RELIGION_SPREAD_ADJACENT_PER_TURN_PRESSURE 1 within
  RELIGION_SPREAD_ADJACENT_CITY_DISTANCE 10, HOLY_CITY_PRESSURE_MULTIPLIER
  4 and HOLY_SITE_PRESSURE_MULTIPLIER 2 (the three the engines carry),
  plus HOLY_CITY_PRESSURE_PER_POP 200, ATHEISM_PRESSURE_PER_POP 50,
  STRENGTH_MULTIPLIER 200, COMBAT_VICTORY 250 within range 6,
  UNIT_CAPTURE 125 within range 6, and TRADE_ROUTE_PRESSURE 1.0 at the
  destination / 0.5 at the origin. The scale is the gap: at 1 per turn,
  every PERCENTAGE pressure modifier the game publishes floors to nothing
  — the Religious alliance's +20% (C-2); the Bishop's +100% lands only
  because its site multiplies the whole per-turn sum before the cast.
  Moving to the game's scale is one cutover on both engines
  (`spreadReligiousPressure` / `_spread_religious_pressure`, the
  missionary lump, the two swings, and every test that pins a raw value)
  — after it the alliance clause is a one-line multiplier.

## Reachability — what the green gate does NOT prove

A green serve run proves the two engines agree over the regime the scripted
seeds actually enter. MEASURED, 12 seeds x 250 turns driven
(`tools/gpu/reachability_probe.py`) — counts, not estimates. Re-measure
every row whenever the DRIVEN policy changes.

Two levers widen the regime without touching the fixed seed set, and both
are gates in their own right (each preset family holds a 250-turn serve
green): DRIVER STYLES (`--styles` on the probe and the serve gate, presets
in `policy/ladder.py::STYLE_PRESETS`) and WORLD PRESETS
(`seeder/presets.ts`; per-family fixtures under `seeder/worlds/presets/`,
selected with `CIV6_WORLDS_DIR`). Their first outing reached and killed
three latent divergences the baseline regime never entered: the embarked
civilian counted as Support (islands), the un-validated TS building-queue
replay arm plus `availableBuildings` refusing every government-tier row
(islands), and the jobs twin's missing MILITARY ENGINEER arm (abundant).
The table below stays measured on the BASELINE family; a preset run's
coverage is measured the same way with `CIV6_WORLDS_DIR` set.

| mechanic | seeds reaching | first |
|---|---|---|
| a PLOT LOCK held by a citizen | 12/12 | t2 |
| the ESCORT column offered to a civilian | 12/12 | t14 |
| a PRESERVE placed | 12/12 | t27 |
| a GOVERNOR TITLE earned | 12/12 | t28 |
| a GOVERNOR APPOINTED, and SEATED in a city | 12/12 | t29 |
| a governor ESTABLISHED (every ability opens) | 12/12 | t33 |
| a GOVERNMENT PLAZA placed | 12/12 | t43 |
| a GREAT PERSON standing on the map as a unit | 12/12 | t53 |
| the ACTIVATE_GP column offered to one | 12/12 | t54 |
| a Great Person CHARGE SPENT | 12/12 | t55 |
| faith-buy kind 6 (APOSTLE purchase) | 12/12 | t87 |
| a SPECIALIST pinned into a slot | 12/12 | t116 |
| an OPEN BORDERS grant standing | 11/12 | t34 |
| a governor PROMOTION taken | 11/12 | t134 |
| a seat entering a DARK AGE (the card pool's own gate) | 10/12 | t49 |
| a DIPLOMATIC QUARTER placed | 10/12 | t104 |
| a second HULL on any seat | 10/12 | t118 |
| NATURAL_HISTORY (the Archaeologist's civic) | 10/12 | t170 |
| a unit standing against a CLOSED BORDER | 9/12 | t65 |
| a DECLARATION OF FRIENDSHIP | 8/12 | t19 |
| an INTERNATIONAL trade leg | 8/12 | t61 |
| an ALLIANCE | 8/12 | t105 |
| a WORLD CONGRESS ballot on the wire | 8/12 | t148 |
| a permanent PER-SEAT channel left by a spent Great Person | 7/12 | t136 |
| WAR with a city-state | 6/12 | t78 |
| PEACE with a city-state, through the sue column | 6/12 | t91 |
| a permanent PER-CITY channel left by a spent Great Person | 5/12 | t156 |
| two enemy religious units ADJACENT (theological combat) | 4/12 | t96 |
| a GREAT WORK given away | 4/12 | t159 |
| the FORM_UP column offered to a unit | 4/12 | t211 |
| a DAM placed | 3/12 | t157 |
| CONSERVATION (the Naturalist's civic) | 3/12 | t189 |
| a CORPS or FLEET standing | 3/12 | t212 |
| URBANIZATION civic | 3/12 | t233 |
| a NEIGHBORHOOD placed | 3/12 | t235 |
| any seat's lifetime CO2 above zero | 2/12 | t203 |
| a Valletta-shaped SUZERAIN, and the class purchase it sells | 1/12 | t117 |
| a CANAL placed | 1/12 | t228 |
| an antiquity dig (artifact in a slot) | 1/12 | t230 |
| a WATER PARK placed | 1/12 | t246 |
| an ARMY or ARMADA standing (Mobilization is Modern) | 0/12 | NEVER |
| a civilian actually IN an escort formation (no driver takes it) | 0/12 | NEVER |
| an ally dragged in by the DEFENSIVE PACT | 0/12 | NEVER |
| the world crossing into climate PHASE I | 0/12 | NEVER |
| a MILITARY ENGINEER alive at all (and so its three verbs) | 0/12 | NEVER |
| the ROYAL SOCIETY standing (and so the district-project payment) | 0/12 | NEVER |
| a seat that may buy LAND COMBAT UNITS with faith | 0/12 | NEVER |
| a DARK AGE CARD slotted (the greedy fill spends the wildcards first) | 0/12 | NEVER |

- EVERY ROW IS ONE MARK the probe emits, and the table holds no row the
  probe cannot measure. The ROCK BAND's concert had such a row and no mark
  behind it; `concert` now exists in the probe and the row lands with the
  next run.
- THE DISTRICT LANE ROTATES ITS PICK by (seat + turn) — a DECISION the
  applier re-validates, widening coverage without changing legality.
- THE TAIL OF THIS TABLE IS TRAJECTORY, NOT RULE. Every row below 8/12
  moves by a seed or two whenever anything steers the late game. A row
  that thins is a coverage loss, never a regression; each names the poke
  lane that is its actual bar.
- THE DRIVER RUNS TWO STYLES beside the default: DEEP (`ladder.DEEP_SHARE`
  0.34 — research depth; what unlocked the dig and the park rows) and
  DIPLOMATIC (`ladder.DIPLO_SHARE` 0.5 — exclusive with the grudge per
  SEAT, measured twice: a diplomat that also denounces reaches friendship
  on 1 seed and an alliance on none). COVERAGE COMES FROM THE MIXTURE, not
  from any one style turned up — measured: all-deep reaches
  NATURAL_HISTORY 12/12 but drops specPin, the international leg and the
  slotted cards; wonder-first moved wonders 52->62 (already covered) and
  cost three thin rows.
- POKE-ONLY CLASSES, each named at its entry: the faith-purchase classes
  (no Valletta suzerain, no Theocracy/Grand Master's Chapel in-gate), the
  Warrior Monk and its tree (whether AKKAD lands is a seeder draw), the
  climate arc (CO2 never leaves zero), the Military Engineer (0/12), the
  space race (Information-era techs), the emergencies' CITY_STATE trigger,
  the ROCK BAND, its concert and its twelve-row tree (Cold War is an
  Atomic-era civic; `rock_band_test.py` and `rock-band.test.ts` hold every
  rule), the four AIR and NAVAL promotion trees (no seed trains an
  aircraft, a Privateer, a Submarine or a carrier inside 250 turns;
  `air_promo_test.py` / `air-promotions.test.ts` hold them),
  and the DARK AGE CARD POOL — the age is reached on 10/12 seeds but the
  greedy slot fill spends every wildcard on ordinary overflow first, so
  `governor_roster_test` poke f and the TS `dark-policies` lane are the
  only proof the pool works.
- THE POLICY CARDS ARE MOSTLY UNREACHED: 16 of 49 ever slot (greedy fill,
  table order within a kind); THIRTEEN effect channels ride the digest,
  the other nine are `policy_cards_test` + the TS `policy-cards` suite
  alone.
- The CULTURE VICTORY's distance at t250: visiting peaks at 5 (mean ~0.7)
  against a domestic peak of 78 (mean ~39) — read B-20r's scope off this.
  The per-rival bank narrows it further: each rival's cell floors on its
  own, so the same national output buys no more tourists and often fewer.
- A barbarian march choosing a CIV row's city while a row-0 city stands in
  reach — the tie key was verified by reading, never by the gate.
- The `R = 0` phantom row: no seeder configuration produces a one-major
  world, so the solo-game arm cannot be validated by the gate.
- **OPEN — THE DRIVER NEEDS A REAL STYLE MECHANISM.** Not weighted (this
  file prices fidelity; this is harness). Today a style is one boolean
  read at a single `if` inside `pick_research`; adding one style meant a
  rank refactor of `pick_production` that was reverted with the style it
  served. What it should be: NAMED KNOBS with defaults that reproduce
  today's picks exactly (research depth, production tier order, war
  appetite, expansion appetite, faith/culture lean, naval lean); PRESETS
  built from the knobs, assignable per actor as data; an ASSIGNMENT
  POLICY off the existing per-(seed, seat) stream or an explicit table;
  CLI selection on the probe and the gate. The bar is the probe diff: a
  preset earns its place by ADDING rows without losing any.

Hunt discipline: scripted-reachability first (the digest gate names the
turn), checkpoint-bracket from the nearest earlier checkpoint (validate a
resume against a fresh run the first time it is trusted for a diagnosis),
full fresh gate for any behaviour-changing fix. One battery at the round's
end, never per fix.

## How to read a battery red

**A POKE RED.** The recurring shapes, each of which reads exactly like an
engine red until checked:

  - **The auto-decision premise.** The engines are decision-free: a buy, a
    strike, a queue pick or a spread is an ORDER the applier re-validates,
    never something `_seat_phase` chooses. A lane that steps and waits is
    waiting for nothing — stash the intent (`apply_seat_actions`, the
    order helpers in `tests/gpu/warmup.py`) and assert the validation.
  - **The registry confound.** Districts are read off the city REGISTRY
    (`city_dist_tile`), never the tile plane; a scene must write both, as a
    real completion does.
  - **The stale index space.** Appliers take the ROW and RANKED orders over
    `_seat_slot_map`; a test speaking the dead civ-index or raw pool-slot
    convention lands its orders on the wrong seat or unit and no-ops.
  - **The wrong resolver.** `_hostile_ranged_strike` scopes out
    major-vs-major by design; that pairing is `_ranged_attack`'s.
  - **A stale cache under a poke.** Writes that the engine always pairs
    with `_eff_version += 1` must be paired in a poke too, or the mask
    serves the pre-poke world.

**A TS-SUITE RED, same triage.** The battery tail only ever shows the
last failing file; run vitest directly for the full list. The TS-specific
shapes:

  - **Founding under `unitsMode` needs a settler on the tile** —
    `settleAt` (tests/cpu/helpers.ts) is the scene helper.
  - **The actor loop skips a CITYLESS seat** (`seatPhase`) — influence,
    favor, upkeep/bankruptcy and quest issuance all live inside it.
  - **Rules that live IN the seat phase**: city strikes (`cstk`/`estk`),
    city healing, influence-to-envoy conversion.
  - **The scripted adoption** (`computeAdoption`): modifiers read the
    adoption, a pure function of civics — `setPolicy`/`setGovernment`
    write a store nothing reads in a driven game.
  - **One seat model**: `isCiv(0)` is true; a fake seat `{ id, atWar }`
    builds a scene the war axis cannot see; a CityState without
    `emptySeat(seatOfCityState(id))` has no seat id.
  - **Meeting is by EXPLORATION** — in a fogless world every seat meets
    every city-state at the phase top; "unmet" scenes need fog live.
