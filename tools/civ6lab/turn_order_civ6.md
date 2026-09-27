# Civ 6's turn order, measured — and the diff against ours

Measured 2026-09-27 on the owner's install (Gathering Storm, online speed) at
`--host 127.0.0.2`, from `lab4_t150` (8 majors 0–7, 12 city-states 8–19, the
Free Cities 62, the barbarians 63) and `lab4_t225`. Our side is
`turn_order_ours.md`.

## The instruments

* `turnorder_arm.lua` — a listener on every turn-processing event that exists
  (180 names: every `GameEvents.*` and `Events.*` the install's Lua uses, plus
  guesses), in GameCore_Tuner (`GameEvents` fire SYNCHRONOUSLY inside the
  DLL; the `Events` there are published in batches after the fact) and in
  InGame. Each line: sequence, game turn, `Game.GetRandomSeed()` (so the sync
  draws between two synchronous lines are counted by stepping the LCG), event,
  arguments. `turnorder_run.py` arms, advances, swaps the logs out atomically
  and writes `runs/turnorder/<tag>_<stamp>.jsonl`.
* `turnorder_snapgc.lua` — the synchronous state witness: at every GE event,
  the event player's gold, faith, research, civic, and per city population,
  owned plots, turns-to-growth, queue head, food surplus, production yield and
  religion followers, and its units' count / damage / moves; with `--watch -1`
  the whole world at every player's `PlayerTurnStarted` /
  `PlayerTurnStartComplete` and at the game-turn events.
* Readers: `turnorder_analyze.py` (the event stream with draw counts),
  `turnorder_cities.py`, `turnorder_sndiff.py` (what changed between two
  synchronous snapshots), `turnorder_citytimeline.py` (where a city field
  moved), `turnorder_where.py` (the phase each event occurs in),
  `turnorder_heal.py`, `turnorder_startcheck.py`, `turnorder_randcalls.py` / `turnorder_randpos.py` (the
  sync stream's reason strings).
* The rigs: `turnorder_rig_queue.lua`, `turnorder_rig_queue_unit.lua`,
  `turnorder_rig_progress.lua`, `turnorder_rig_bankrupt.lua`,
  `turnorder_city_ig.lua`, `turnorder_worked.lua`, `turnorder_unstick.py`.
* `RandCalls.csv`: only the first instance writes the Logs, and that was the
  127.0.0.4 instance (another agent's games — its seeds are not ours). Its
  reason strings are still Civ 6's own order of draws; three copies are kept
  (`runs/turnorder/randcalls_host4_snapshot_*.csv`, the last spans 42+ load
  segments and ~250 complete turns).

Records (all `tools/civ6lab/runs/turnorder/`): `t150a_20260927T052955Z`,
`t151b_20260927T053148Z`, `t153c_20260927T053723Z` (autoplay, t150–155),
`t225a_20260927T054307Z`, `t227b_20260927T054333Z`, `t229c_20260927T054453Z`,
`t231d_20260927T054606Z` (autoplay, t225–233; t231d carries the whole-world
snapshots), and the three arms `armT_apprenticeship_20260927T054837Z`,
`armB_bankrupt_20260927T055023Z`, `armS_settler_growth_20260927T055302Z`
(endturn on the human seat; before/after reads in the jsonl and in
`armT_after3*.log`, `armB_rig.log`, `armS_after*.log`). 16 complete game
turns, 332 player blocks.

## Civ 6's sequence, one game turn T

**A. The players, ONE AT A TIME, in ascending player id**: majors 0–7, then
the city-states 8–19, then the Free Cities 62, then the barbarians 63. Every
recorded turn, every record (16 turns, 332 blocks, `EV.RemotePlayerTurnBegin`
/ `GE.PlayerTurnStarted`). The human seat 0 is simply player 0.

Each player's turn is its START-OF-TURN PROCESSING, then its actions:

| # | step | evidence |
|---|---|---|
| A1 | `GE.PlayerTurnStarted(p)` | 332 blocks |
| A2 | **science** banked on the yields as they stand at the start; the tech COMPLETES and its effects apply now | armT: `rt` 20 → −1 and Naranjo's production yield 10 → 11 (Apprenticeship's +1 on its worked mine) at the first GE after the start, before any city event. Over every synchronous record (`turnorder_startcheck.py`, 268 blocks, 196 with an event): at the block's FIRST event research had already moved in 196 / 196 and gold in 184 / 196, and a city had produced or grown in 1. Science BEFORE gold: see "The C-93 LAB lines" below (3 of 3 rigged blocks) |
| A3 | **gold** banked on the yields after the tech, net of maintenance; if the balance falls below 0: the first unit with upkeep disbanded, the balance clamped to 0, the shortfall's amenity penalty applied — all before any city | armB: balance 0, net −10 → `TreasuryChanged 0\|12\|-10`, `UnitRemovedFromMap`, `TreasuryChanged …\|0`; both cities' amenities −2 and production yields lower (11 → 9.90, 4.40 → 4) at the first GE after the start, before any city event |
| A4 | pending policy changes (`GE.PolicyChanged`) | the first event of 17 blocks, always after gold and science, before the civic |
| A5 | **culture** banked; the civic COMPLETES (`GE.OnCivicCulturevated`) | 60 events: gold already moved at 54, faith at 2 — both a civic completing INSIDE the city walk after a building finished (t225 p7, t230 p6), the regular step being before faith |
| A6 | **faith** banked (`GE.OnFaithEarned`) | faith moved at the block's first `OnFaithEarned` in 178 / 178, and no city had produced or grown before it in any (0 / 178) |
| A7 | great-person points, influence / envoys, the levy counter, the governors | published order of `GreatPeoplePointsChanged`, `InfluenceChanged`, `LevyCounterChanged`, `GovernorChanged` (every block), all before the first city's events; not separable synchronously |
| A8 | **each city, in the player's city-list order** (`Members()`, the acquisition order; 42 of 42 multi-city blocks): **production** (the completion, a Settler's −1 pop) → **growth / starvation, on the yields as they stand after the completion** → border growth → loyalty (production on the loyalty level the city had BEFORE this turn's loyalty change, 2 of 2 rigs); after the LAST city, a city whose loyalty reached 0 this turn becomes a Free City (2 of 2). Each city also draws once for its next plot (`GetNextBuyablePlot picker`; the block's draws ≈ its city count) | production before growth in the same city 11 / 11 (+3 of 3 shrinks); armS: Settler completes, pop 6 → 5, then the food box gains +2.129 = the pop-5 surplus (5 × ½ housing × 0.85 amenity) where the pre-completion city predicts +1.275; `CityTileOwnershipChanged` and `CityLoyaltyChanged` published after `CityPopulationChanged` per city; loyalty is applied to every city on its OWNER's turn only (1069 player-phase + 28 local-seat, 0 elsewhere) |
| A9 | **religious pressure goes OUT from this player's cities**: a city converts during the start block of the player whose cities press it | whole-world snapshots, t231d: 13 of 15 follower changes landed inside ANOTHER player's start block (e.g. player 0's city gained religion 7 in player 6's block and religion 11 in player 7's); follower changes inside the owner's block came with a growth event in 26 of 26 (t225–228) |
| A10 | the player's units get their movement back (after the cities) | units' moves jump at `PlayerTurnStartComplete` in 77 blocks; `UnitMovementPointsRestored` published after the city events |
| A11 | `GE.PlayerTurnStartComplete(p)`, then the player's ACTIONS: moves, combat, purchases, picks, diplomacy; `PlayerTurnDeactivated(p)` | the AI's `OnCombatOccurred`, `UnitCreated` with a gold drop (purchases), `DiplomacyDeclareWar` all fall here |

**B. After the barbarians' actions**, before the counter moves (the order
the C-93 witness reads synchronously; `GE.OnGameTurnEnded` is published
before the heals' events but fires AFTER them):

| # | step | evidence |
|---|---|---|
| B1 | the **World Congress** session resolves: the votes' favor spent (`FavorChanged` reason 2), then its outcome (reason 9) | RandCalls: `World Congress Resolutions` closes its turn label in 12 of 17 turns (only `Random congress resolution target` after it in the rest); C9 t150: player 3's favor 351 at the barbarians' `PlayerTurnStartComplete`, 87 at `GE.OnGameTurnEnded` (−264 in votes) |
| B2 | **every unit and every city heals** | all 45 unit heals and 22 city/district heals of the records are in this phase (the 9 other decreases are promotion heals, `UnitPromoted` beside each); a unit ATTACKED this turn that did not move or attack itself heals (9 defenders; 14 others did not — killed, full or starved, not separated); none of the 49 defenders that moved or attacked healed. Synchronously before `GE.OnGameTurnEnded`: C9 t150 Naranjo's garrison 60 at the barbarians' start, 40 at `OnGameTurnEnded`; t231d / t232 all units' damage 828 → 795 and 1190 → 979 between the barbarians' start and `OnGameTurnEnded`, unchanged from there to `OnGameTurnStarted`. The Congress's favor changes are published before the first heal in 3 of 3 replays of the t150 session |
| B3 | `GE.OnGameTurnEnded(T)` | 16 of 16 (+13 C-93 turns), after player 63's actions |
| B4 | `EV.TurnEnd(T)` | |

**C. The counter moves to T+1**, then, before `GE.OnGameTurnStarted(T+1)`:

| # | step | evidence |
|---|---|---|
| C1 | the live **storms** walk and strike (`Storm Direction`, its `Pillage Improvement Chance`) | RandCalls: `Storm Direction` opens its turn in 67 of 76 (only a GP generation or a tech-boost draw before it otherwise) |
| C2 | the **volcano** eruption roll (`Active Volcano Roll`) | after the storms 76 / 76 |
| C3 | the turn's **random event** roll and its effects (pillage, unit damage, population loss, fertility), a new storm's start plot | `Random Event Roll` after the volcano roll 190 / 190; t154: a flood's two `GE.OnCityPopulationChanged(-1)` fire here, before `OnGameTurnStarted` |
| C4 | the draws between `OnGameTurnEnded` and `OnGameTurnStarted` | 170 / 40 / 50 / 162 / 226 / 32 on the seeded records |

**D. The turn change, published after `GE.OnGameTurnStarted(T+1)`** — but
the C-93 witness reads the per-turn favor (D4) and the scores (D5) already
applied AT `GE.OnGameTurnStarted` in 13 of 13 turns, so everything published
before the per-turn favor happens before that GE fires, in the gap with C:

| # | step | evidence |
|---|---|---|
| D1 | `PreTurnBegin`; the **climate** step: ice melt, sea-level rise (terrain → coast, improvements removed) — its order against the storms, the volcano and the random event (C) is unread: no turn carried both | t227→228: 27 `TerrainTypeChanged`, 257 `FeatureRemovedFromMap`, 4 `ImprovementRemovedFromMap` published after `PreTurnBegin`, before the per-turn favor, after the climate level crossed 7 → 8 inside player 6's start of t227; the sea-level countdown (`GameClimate.GetNextSeaLevelRiseTurns`) moves only in the gap (4 of 4 changes) |
| D2 | the **era** change and every major's **Age** | `GameEraChanged` 3 / 3 and `PlayerAgeChanged` 36 in this gap |
| D3 | city-state **quests** checked (new quests are DRAWN later, on the city-states' own turns) | `QuestChanged` 86 in the gap; `Selecting a random new quest` follows a `GetNextBuyablePlot` draw in 50 / 54 turns |
| D4 | **diplomatic favor** per turn for every major at once | `FavorChanged(…, -1)` 120 in the gap, 2 elsewhere; C9: every per-turn favor change in the gap, 13 of 13 turns |
| D5 | the **score** of every major recomputed | C9: the scores move between `OnGameTurnEnded(T)` and `OnGameTurnStarted(T+1)` in 13 of 13 turns; a city lost in its owner's block (Ngaruawahia t150, Apu t151) moves the owner's score only at that turn change (342 → 298, 532 → 516); one live change inside a block (player 7 −2 during player 1's start, t233) |
| D6 | `GE.OnGameTurnStarted(T+1)`, `TurnBegin`, then the **emergencies** update | `EmergenciesUpdated` 13 / 14 right after `TurnBegin` |
| D7 | player 0's turn (A) | |

The turn label that ends a game (score, turn limit) was not reached.

## Differences from ours, each with its effect and the change it needs

**Δ1. The player order.** Ours: barbarians (`barbarianPhase`) → city-states
(`cityStatePhase`, `minorPhase`) → majors (`seatPhase`) → Free Cities
(`freeCitiesPhase`). Civ 6: majors → city-states → Free Cities → barbarians.
*Effect:* barbarians move, spawn and attack BEFORE any major acts in ours
(after every player in Civ 6): a barbarian strike lands on a city before its
owner's turn in ours and after it in Civ 6; a city-state's unit trained this
turn acts before the majors in ours; a minor's growth, production and
suzerain-dependent levy return come before the majors. *Change:* `endTurn`:
`seatPhase` → `cityStatePhase` + `minorPhase` → `freeCitiesPhase` →
`barbarianPhase` (its MP reset moves with it); GPU `SimStep.step`:
`_seat_phase` → `_city_state_phase` → `_free_cities_phase` →
`_barbarian_phase`. Pure reorder.

**Δ2. The player's economy runs BEFORE its cities.** Ours banks science,
culture, gold and faith, completes techs and civics, charges unit upkeep and
runs `bankruptcy` AFTER the city walk (`seatPhase` after `flipCity`; GPU
`_seat_research_tail` after the column loop). Civ 6 does all of it first (A2–A7),
and the cities then read the result. *Effect (measured):* a tech or civic
completing on turn T feeds turn T's production and food — armT: Naranjo made
+11 (the Apprenticeship mine) where ours makes +10 that turn; a bankruptcy's
amenity penalty and disband hit the SAME turn's cities — armB: Naranjo made
+9.90 where ours makes +11 and applies the penalty a turn late (ours reads
`goldShortfall` next turn). *Change:* in `seatPhase`, move the block from the
alliance route yields through `carryPolicies` (science → tech loop → culture →
gold → faith → `seatAccumulators` → unit and WMD upkeep → `bankruptcy` →
grants → civic loop) and `advanceGreatPeople` to BEFORE the city walk, in
Civ 6's order science → techs → gold with upkeep → `bankruptcy` → culture →
civics → faith → great people (science before gold: 3 of 3 rigged blocks,
"The C-93 LAB lines" item 1) — the gold banked reads the yields AFTER this
turn's techs, the science banked the yields BEFORE this turn's shortfall; the sums it banks
are the cities' yields at the start (the `computeCityStats` taken before the
walk today), and the walk takes `computeCityStats` again AFTER it, so the walk
reads the new techs, civics and shortfall. GPU: `_seat_research_tail` (and `_advance_great_people`)
before the `for j in range(self.RC)` column loop in `_seat_turn`, with
`_seat_city_stats` re-derived after it.

**Δ3. Inside a city: production, THEN growth on the live city, then borders,
then loyalty.** Ours: `applyLoyalty` → `seatGrowth` → production → 
`cityBorderGrowth`, every step on the loop-top `computeCityStats` snapshot.
*Effect (measured):* armS — a Settler completing in a city that also grows:
Civ 6 takes the pop first and grows at the new, smaller city's surplus and
housing band (+2.129 food), ours grows the old city (+1.275) and then takes the
pop; a completed Granary, Water Mill, Aqueduct or Neighborhood feeds the same
turn's growth in Civ 6, the next in ours; a city's own new citizen counts in
its loyalty the same turn in Civ 6. *Change:* in the walk, the production add
and `completeQueueItem` first, then recompute this city's stats, then
`seatGrowth`, `cityBorderGrowth`, then `applyLoyalty` on the post-growth city
(the flip list stays after the walk). GPU `_seat_turn`: `_seat_city_produce`
→ re-derive the column's `eff` / `need` → `_seat_city_growth` →
`_seat_border_growth` → `_seat_city_loyalty`. The same order in `minorAccrue`
/ `minorBuild` (a minor grows before it builds today) and in
`freeCitiesPhase`.

**Δ4. Cities heal at the end of the game turn, with the units.** Ours heals a
city (+20) and its Encampment inside the owner's city walk
(`seatPhase`; GPU `_seat_city_fire_and_heal`), a city-state's centre in
`cityStatePhase` (+10), a Free City in `freeCitiesPhase`. Civ 6 heals every
city after every player, barbarians included (B2) — +20 to a city-state's
centre too, and a city attacked that turn heals unless it is besieged (item 5
below). *Effect:* a city attacked
by a seat that moves AFTER its owner meets a healed city in ours and an
unhealed one in Civ 6 — a capture can take a turn longer in ours. *Change:*
take the city, Encampment, minor and Free City heals out of the per-seat
bodies into one end-of-turn heal beside the unit heal (with Δ1 and Δ7 the unit
heal in `refreshUnits` already sits there: after the barbarians, before the
disasters).

**Δ5. Religious pressure is spread per SOURCE, on the source owner's turn.**
Ours: `spreadReligiousPressure` is one global pass after every seat (GPU
`_spread_religious_pressure`). Civ 6: a player's cities press their
neighbours during that player's start of turn, and the neighbours convert
then (A9). *Effect:* a city converted by an earlier player's cities presses
with its NEW religion when its own owner's turn comes in the same game turn;
pressure and growth interleave; two religions pressing one city alternate
within a turn (measured back and forth on player 0's city). *Change:* split
`spreadReligiousPressure` into a per-seat call from the seat's block (the seat's
cities as the only sources, then every city in range re-picks), with the
city-states and the Free Cities calling it on their own turns. Note: our
whole-city follow model differs from Civ 6's per-citizen followers anyway;
this entry is the ORDER only.

**Δ6. The disasters' own order.** Ours (`disasterPhase`): timers →
`wakeVolcanoes` → `randomEvent` → `fireTurn` → the live storms walk and strike.
Civ 6: the storms walk and strike FIRST, then the volcano roll, then the
random-event roll and its effects (C1–C3). *Effect:* the draw order; a tile
struck by a storm and a new event takes them in the other order (pillage,
fertility). *Change:* in `disasterPhase` / `_disaster_phase`, the storm loop
before `wakeVolcanoes` / `randomEvent`.

**Δ7. The World Congress sits BEFORE the turn counter moves.** Ours:
`state.turn += 1` → `eraBoundary` → `eraInspirations` → `worldCongress`
(which reads the NEW turn). Civ 6: the session resolves at the end of T (B1),
the era changes after the counter moves (D2). *Effect:* the session schedule
reads a turn number one higher than Civ 6's, so every regular session lands a
turn-label apart from Civ 6's for the same schedule. *Change:* call
`worldCongress` (and GPU `_world_congress`) before `state.turn += 1` /
`self.turn += 1`, keeping `eraBoundary` after it; re-check
`congressSessionDue`'s schedule against the pre-increment turn.

**Δ8. A seat's world-facing actions come after its processing.** Ours applies
the record's purchases (gold, faith), the levy, the silo launch and the trade
route at the TOP of the seat's block, and every seat's diplomacy (denounce,
friendship, alliance, delegation, borders, gifts, deals, promises) at the top
of `seatPhase` for all seats at once; the unit orders at the tail. Civ 6: a
player's whole action phase follows its own processing and precedes the next
player's (A11). The production / research / civic / government picks read as
the tail of the previous turn's actions and need no move. *Effect:* a unit
bought by seat p lands after the seats that act between p's two blocks in
ours (before them in Civ 6); a war declared by seat 5 already stands when
seats 0–4 move in ours, not until seat 5's own actions in Civ 6. *Change:*
the diplomacy arms move from `seatPhase`'s head into each actor's block tail
(beside `applySeatUnitOrders`; GPU `_geo_agreements` per row), and the
purchase, faith-purchase, levy, silo and route arms move from before the walk
to the tail (GPU `_seat_buy_ladder`, `_seat_trade_phase` after the column
loop).

**No difference, measured or by construction:** the city order inside a
player (ours `actor.cities`, acquisition order = Civ 6's `Members()`); a unit
attacked on a turn still heals at its end (ours: `refreshUnits`' "spent no
MP" test does not see an attack received); the random events come before
every player and after the heal; the era and Ages after the counter moves;
the governors before the cities; a unit trained this turn pays no upkeep this
turn; the unit movement refresh (per player in Civ 6, all at once in ours —
no effect, a seat's moves are only spent in its own actions).

## The C-93 LAB lines

Measured 2026-09-27 at `--host 127.0.0.2`: `lab4_t150` played on by hand
(end turn on the human seat) through turns 150–154 with rigs, and
`lab4_t225` autoplayed through turns 225–232 plus a rigged turn 233.

The instruments:

* `turnorder_c93snap.lua` — the C-93 witness (recorder `C9`,
  `turnorder_run.py --c93`): at every GE event the event player's gold, gold
  yield, maintenance, research and its progress, science yield, faith and
  score; at every `PlayerTurnStarted` / `PlayerTurnStartComplete` /
  `OnGameTurnEnded` / `OnGameTurnStarted` the world — total CO2, average
  temperature, climate level, the sea-level countdown, every major's score and
  favor, the great-people timeline, the winner — and the watched plots
  (the city there, its garrison and wall damage, the war / own units beside
  it).
* `turnorder_c93rig.lua` (`ZRIG=research|bankrupt|build|loyalty|pop|damage|watch|victory`),
  `turnorder_c93gp.lua` (the timeline; `RecruitPerson`), `turnorder_c93survey.lua`
  (every major's gold, research and cities' loyalty, worked Quarries and
  Fishing Boats), `turnorder_c93probe.lua` (a city's loyalty breakdown and
  queue; a city-state's pools and neighbours), `turnorder_c93dump.lua`
  (the readers: `GameClimate`, `GreatPeople`, `DefenseTypes`, …).
* `turnorder_c93read.py` reads the recorders without advancing (after
  `turnorder_unstick.py` releases a held human start); `turnorder_c93where.py`
  names the interval each world quantity moved in; `turnorder_cityheal.py`
  (the heal of a city hit this turn, with its siege state);
  `turnorder_congressheal.py` (the session's favor against the heals, in
  published order).
* Records: `runs/turnorder/c93_t150_*`, `c93_t151p0_*`, `c93_t151_*`,
  `c93_t152_victory_*`, `c93_t153_turnlimit_*`, `c93_t154_turnlimit_*`,
  `c93_t225_*`, `c93_t227_*`, `c93_t229_*`, `c93_t231_*`,
  `c93_t233_tikal_*` (GC and C9 rows; the InGame rows mirror GC's Events and
  were dropped), and the rigs' reads in `runs/turnorder/c93/`. 14 witnessed
  turns.

### 1. Science before gold

| rig | read | science first predicts | gold first predicts |
|---|---|---|---|
| Egypt (4), t150: Cartography at 239 / 240, one worked Fishing Boats (+2 gold with Cartography, `Improvement_BonusYieldChanges` Id 3) | at `PlayerTurnStarted` gold 106.574, gold yield 54.848, maintenance 18; at the first GE Cartography done, gold yield 57.047, gold 145.621: **+39.047** | 57.047 − 18 = **39.047** | 54.848 − 18 = 36.848 |
| Maya (0), t151: gold 0, four Crossbowmen past the income (maintenance 22 against 9), research progress 0 | at `PlayerTurnStarted` progress 0, science yield 6.3047; at the first GE progress **6.3047**, science yield already 5.5508, maintenance 20 (one unit disbanded) | 6.3047 | 5.5508 |
| armB (t152) re-read: Apprenticeship's cost for player 0 reads 120 | the overflow 115.0547 + 8.5469 − 120 = 3.6016, the t152 bank 12.1484 − 3.6016 = **8.5469** | 8.5469 | 7.7969 |

3 of 3. The published order agrees (`ResearchCompleted` → `TreasuryChanged`
carrying the post-tech yield 57.046875). Faith is banked after the shortfall
(armB +0.9023 = 90% of 1.0). It matters: a tech that changes gold (the
tech-gated improvement gold: Fishing Boats +2 at Cartography, Quarry +2 at
Banking, Camp +1 at Synthetic Materials) pays the same turn, and a
shortfall's penalty never cuts the same turn's science.

*Ours:* the old order (`turn_order_ours.md` step 11) banks science, completes
techs, then culture, gold, faith, then upkeep and `bankruptcy`, then civics —
science already before gold, but culture before gold and the shortfall after
faith. **The Δ2 BUILD order changes**: science → techs → gold → upkeep →
`bankruptcy` → culture → civics → faith → great people, all before the walk.

### 2. Loyalty's place and the flip

**Production reads the loyalty level the city had before this turn's
change** — loyalty comes after production (2 of 2):

| rig | before | loyal yield predicts | wavering yield predicts | read |
|---|---|---|---|---|
| Naranjo (0), t150→151: loyalty 60 (Wavering: production 10 → 7.5), +26 / turn, the shortfall's −10% on top | progress 62 | 62 + 9 = 71 | 62 + 6.5…6.75 = 68.5…68.75 | **68**; loyalty 86 (Loyal), production yield 9 after |
| Tikal (0), t233→234: loyalty 72 (Wavering: production 7.80; Loyal 10.80), +4.05 | progress 49 | 59.8 | 56.8 | **57**; loyalty 76.05 (Loyal), production yield 12.60 after |

Both beside the published per-city order `CityProductionUpdated` →
`CityLoyaltyChanged` (11 of 11 blocks). The loyalty change applied is the
start's value after the shortfall (Naranjo +26 = 29 − 3 Happiness, Calakmul
+18 = 21 − 3).

**A city whose stock reaches 0 becomes a Free City inside its owner's start
block, the same turn, after the WHOLE city walk** (2 of 2):

* Ngaruawahia (Maori, the 2nd and last of 2 cities; stock 5, Winnipeg and
  Halifax +20 population → −17 / turn), t150: owner 2 at `PlayerTurnStarted(2)`,
  a Free City (62, new id 196608) at `PlayerTurnStartComplete(2)`.
* Apu (Persia, the 5th of 7 cities; stock 3.375, Thebes and Nekhen +30 →
  −5.5 / turn), t151: between the 3rd city's `BuildingConstructed` and the
  flip's first GE the sync stream takes exactly 5 draws — the
  `GetNextBuyablePlot` picker of cities 3 to 7 (the flip itself takes none:
  Ngaruawahia's block has 2 draws for 2 cities) — and the 6th and 7th cities'
  `CityLoyaltyChanged` are published before the flip's events.

The flip: two granted units, the city rebuilt for player 62 with its
districts, buildings and population, the governor ejected; player 62 then
takes its own block the same turn. *Ours:* `applyLoyalty` marks a city at 0
and `flipCity` runs after the walk — **the flip's place stands**; loyalty
moves from the head of the city to its tail (the Δ3 BUILD line, unchanged).

### 3. Climate, tourism, the score, the victory checks

| quantity | where it moves | count |
|---|---|---|
| total CO2 (`GetTotalCO2Footprint`) | inside each emitting major's start block, some in action phases, never in the gap | 58 start, 16 action, 0 gap |
| average temperature, temperature change | with the CO2, at once | 65 of the 72 lab4_t225 CO2 steps moved it; none moved without one |
| climate level (`GetClimateChangeLevel`) | crossed 7 → 8 inside player 6's start, t227 | 1 |
| the realised climate step: ice melt, sea-level rise | at the turn change after `PreTurnBegin`, before the per-turn favor (D1): t227→228 257 features removed, 27 terrain changes, 4 improvements removed | 1 |
| the sea-level countdown (`GetNextSeaLevelRiseTurns`) | the turn change only | 4 of 4 |
| every major's score | the turn change (D5) | 14 of 14 turns; 2 live changes of ANOTHER player's score inside a block (player 6 −4 in player 5's actions t151; player 7 −2 in player 1's start t233); a city lost in its owner's block moves that score only at the turn change |
| diplomatic favor per turn | the turn change (D4) | 14 of 14 turns |

* **Tourism**: no reader in GameCore (its player stats and culture objects
  carry none); InGame's `GetTourism` / `GetTouristsFrom` read only between
  turns. Unpinned.
* **The victory checks**: two rigs failed. `ChangeScienceVictoryPoints(25)`
  put player 3 at 25 / 25 but `GetVictoryProgressForTeam` read 0.5 (the
  projects count too) and nobody won. The turn limit (`CUSTOM`, 153) set in
  InGame's `GameConfiguration` reaches GameCore only through a save and load
  (`c93_turnlimit153`: GameCore then reads 153), and the game did not end at
  153, 154 or 155 (`Game.GetMaxGameTurns` reads 0). Unpinned.

*Ours:* `climateTurn` once after every seat, before `state.turn += 1`; the
realised step sits at the turn change in both, Civ 6's after the counter.
Our CO2 is summed at the climate step, Civ 6's accrues per player and the
level can cross mid-turn — nothing reads the level between the two in ours
(the disasters roll at the turn change in both), so no BUILD follows beyond
placing `climateTurn` after the increment beside `disasterPhase` (its order
against the storms is unread). Our score is computed where it is read (the
turn-limit check) — no change.

### 4. The Congress against the heal

Both run after the barbarians' actions and before `GE.OnGameTurnEnded`
(synchronously: player 3's −264 favor in votes and Naranjo's +20 are both
applied between the barbarians' `PlayerTurnStartComplete` and
`OnGameTurnEnded`); in the published order every session favor change
(5 votes, reason 2; 4 outcomes, reason 9) precedes the first heal, 3 of 3
replays of the t150 session: **the Congress, then the heal** (B1, B2). It does
not matter: the session moves favor, grievances and resolutions, the heal
moves hit points; no state crosses. *Ours:* the BUILD line puts
`worldCongress` before the increment and the heal after the barbarians; order
them Congress → heal.

### 5. A city attacked this turn

The garrison (the city's own hit points, `DefenseTypes.DISTRICT_GARRISON`
= 1587009065 in both states) heals **+20 at the turn's end, or the whole
damage when less, whether or not it was attacked that turn, unless the city
is under siege** (`EV.CitySiegeStatusChanged`):

| hit this turn | siege at the end | healed | count |
|---|---|---|---|
| yes | free | yes | 42 of 42 (lab4_t150: 5 + 4 in two histories; lab4_t225: 15 + 18 in two histories; majors 0, 3, city-states 13, 19, the Free Cities) |
| yes | besieged | no | 0 of 4 (city-state 13, t150 and t151, two histories) |
| no | free | yes | 5 of 5 (the Naranjo rig 60 → 40) |

The walls (`DISTRICT_OUTER` = 1839557181) never heal: 0 of 47 hit pools. A
city-state's centre heals **+20** like the rest (city-state 13: 65 → 45,
75 → 55, 71 → 51). *Ours:* `healCities` +20 with the encircled gate and no
wall heal — matches for civs and Free Cities; **a city-state's centre takes
+10 with no siege gate** (`healCities`, `sim_phase.py`): Civ 6 +20, and no
heal while besieged.

### 6. The Great Person draw

Every change of the great-people timeline in the 14 witnessed turns happened
inside the recruiting player's block — 5 in a start (the rigged General
64 → 67 by player 3 and Admiral 9 → 12 by player 6 at t151; Writer 161 → 166
by player 3 t152; Musician 110 → 111 by player 7 t228, 111 → −1 by player 1
t230), 4 in an action phase (Merchant 95 → 94 by player 1 t226, Admiral
17 → −1 by player 2 t226, General 73 → −1 by player 1 t227, Merchant 94 → −1
by player 6 t233) — and none at the turn change: **the replacement is drawn
at the recruitment** (the rigs: `GetGreatPeoplePoints():SetPointsTotal(class,
209)`, a turn's points short of the 210 cost; `GreatPeople:RecruitPerson(0, 64)`
for a player without the points returned and changed nothing). A class with nobody left reads −1 and stayed empty
across the era change 7 → 8 (t232; the Information era has no individual of
those classes). So the `Generating a random new Great Person` draws before
the storms in 9 of 76 host-4 turns are not a recruitment's replacement; what
they are is unread (this instance writes no RandCalls — the Logs belong to
the first instance). *Ours:* `ensureGpOffer` draws the replacement at once —
matches.

## What could not be pinned

* **Tourism** banking (no synchronous reader).
* The **victory checks** and the **turn limit** (no rig brought an ending).
* The turn-opening `Generating a random new Great Person` draw.
* The climate step against the storms, the volcano and the random event
  (no turn carried both).
* A human seat's start of turn waits for its open diplomacy session and
  popups (`turnorder_unstick.py` answers them): the READINGS are unaffected,
  but a run that reads the local seat straight after the counter moves reads
  it BEFORE its processing (`turnorder_c93read.py` reads it after).

## Proposed AUDIT entry

- **C-93. THE TURN'S ORDER.** Weight 5.
  Civ 6 runs a game turn as: each player in ascending id (majors, city-states,
  the Free Cities, the barbarians) takes its start of turn — science and
  techs, gold with upkeep and bankruptcy, policies, culture and civics, faith,
  great people / envoys / governors, then each city in acquisition order:
  production, growth on the live city, borders, loyalty; after the last city
  a city at 0 loyalty becomes a Free City; its religious pressure out — then
  its actions; then the World Congress; then every unit and city heals; the
  counter moves; the storms, the volcano roll, the random event and the
  climate step; the era and Ages, the quests' check, the favor and the
  scores; the emergencies (`tools/civ6lab/turn_order_civ6.md`, measured
  2026-09-27, `runs/turnorder/`).
  - BUILD: the player order — `endTurn` / `SimStep.step`: majors, then
    `cityStatePhase` + `minorPhase`, then `freeCitiesPhase`, then
    `barbarianPhase` (16 of 16 turns, 332 blocks).
  - BUILD: the economy before the cities, in the order science → techs →
    gold → upkeep → `bankruptcy` → culture → civics → faith →
    `advanceGreatPeople` (`seatPhase`; GPU `_seat_research_tail` before the
    column loop), the walk's stats taken after it (armT: +11 not +10; armB:
    +9.90 not +11; science before gold 3 of 3: Egypt's Cartography +39.047
    not +36.848, Maya's shortfall 6.3047 not 5.5508, armB 8.5469).
  - BUILD: inside a city, production → growth on recomputed stats → borders →
    loyalty (`seatPhase` walk, `minorAccrue` / `minorBuild`,
    `freeCitiesPhase`; GPU `_seat_city_produce` → `_seat_city_growth` →
    `_seat_border_growth` → `_seat_city_loyalty`) (11 / 11; armS +2.129 vs
    +1.275; production on the pre-change loyalty level 2 of 2: Naranjo 68 not
    71, Tikal 57 not 59.8); the flip after the whole walk, the turn the stock
    reaches 0 (`flipCity` / `_seat_loyalty_flips`, 2 of 2).
  - BUILD: the city heals leave the seat, minor and Free City bodies for one
    end-of-turn heal after the Congress, beside the unit heal (22 of 22 city
    heals at the turn's end); +20 or the whole damage, attacked or not, none
    while besieged, for a city-state's centre too (ours +10, no siege gate):
    42 of 42 attacked-and-free healed, 0 of 4 besieged, city-state 13 +20
    three times; walls never (0 of 47).
  - BUILD: `spreadReligiousPressure` / `_spread_religious_pressure` per source
    seat, on that seat's turn (13 of 15 conversions in the presser's block).
  - BUILD: `disasterPhase` / `_disaster_phase`: the storm walk before the
    volcano and the random event (67 / 76, 76 / 76, 190 / 190);
    `climateTurn` / `_climate_turn` after the turn increment beside it.
  - BUILD: `worldCongress` / `_world_congress` before the turn increment and
    before the heal (12 / 17 turns closed by the session's draws; its favor
    published before the heals 3 of 3).
  - BUILD: the record's world-facing verbs (purchases, levy, silo, routes,
    the diplomacy arms) at the actor's block tail beside
    `applySeatUnitOrders`.
  - LAB: tourism's banking (no GameCore reader); the victory and turn-limit
    checks (a science-points rig and a socket turn limit brought no ending);
    the `Generating a random new Great Person` draw that opens 9 of 76
    host-4 turns (not a recruitment's replacement: 9 of 9 replacements drawn
    in the recruiter's block); the climate step against the storms.
