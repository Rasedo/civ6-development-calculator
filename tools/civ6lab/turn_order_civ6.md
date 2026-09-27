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
| A2 | **gold** banked, net of maintenance; if the balance falls below 0: the first unit with upkeep disbanded, the balance clamped to 0, the shortfall's amenity penalty applied — all before any city | armB: balance 0, net −10 → `TreasuryChanged 0\|12\|-10`, `UnitRemovedFromMap`, `TreasuryChanged …\|0`; both cities' amenities −2 and production yields lower (11 → 9.90, 4.40 → 4) at the first GE after the start, before any city event |
| A3 | **science** banked; the tech COMPLETES and its effects apply now | armT: `rt` 20 → −1 and Naranjo's production yield 10 → 11 (Apprenticeship's +1 on its worked mine) at the first GE after the start, before any city event. Over every synchronous record (`turnorder_startcheck.py`, 268 blocks, 196 with an event): at the block's FIRST event research had already moved in 196 / 196 and gold in 184 / 196, and a city had produced or grown in 1 |
| A4 | pending policy changes (`GE.PolicyChanged`) | the first event of 17 blocks, always after gold and science, before the civic |
| A5 | **culture** banked; the civic COMPLETES (`GE.OnCivicCulturevated`) | 60 events: gold already moved at 54, faith at 2 — both a civic completing INSIDE the city walk after a building finished (t225 p7, t230 p6), the regular step being before faith |
| A6 | **faith** banked (`GE.OnFaithEarned`) | faith moved at the block's first `OnFaithEarned` in 178 / 178, and no city had produced or grown before it in any (0 / 178) |
| A7 | great-person points, influence / envoys, the levy counter, the governors | published order of `GreatPeoplePointsChanged`, `InfluenceChanged`, `LevyCounterChanged`, `GovernorChanged` (every block), all before the first city's events; not separable synchronously |
| A8 | **each city, in the player's city-list order** (`Members()`, the acquisition order; 42 of 42 multi-city blocks): **production** (the completion, a Settler's −1 pop) → **growth / starvation, on the yields as they stand after the completion** → border growth → loyalty. Each city also draws once for its next plot (`GetNextBuyablePlot picker`; the block's draws ≈ its city count) | production before growth in the same city 11 / 11 (+3 of 3 shrinks); armS: Settler completes, pop 6 → 5, then the food box gains +2.129 = the pop-5 surplus (5 × ½ housing × 0.85 amenity) where the pre-completion city predicts +1.275; `CityTileOwnershipChanged` and `CityLoyaltyChanged` published after `CityPopulationChanged` per city; loyalty is applied to every city on its OWNER's turn only (1069 player-phase + 28 local-seat, 0 elsewhere) |
| A9 | **religious pressure goes OUT from this player's cities**: a city converts during the start block of the player whose cities press it | whole-world snapshots, t231d: 13 of 15 follower changes landed inside ANOTHER player's start block (e.g. player 0's city gained religion 7 in player 6's block and religion 11 in player 7's); follower changes inside the owner's block came with a growth event in 26 of 26 (t225–228) |
| A10 | the player's units get their movement back (after the cities) | units' moves jump at `PlayerTurnStartComplete` in 77 blocks; `UnitMovementPointsRestored` published after the city events |
| A11 | `GE.PlayerTurnStartComplete(p)`, then the player's ACTIONS: moves, combat, purchases, picks, diplomacy; `PlayerTurnDeactivated(p)` | the AI's `OnCombatOccurred`, `UnitCreated` with a gold drop (purchases), `DiplomacyDeclareWar` all fall here |

**B. After the barbarians' turn**, before the counter moves:

| # | step | evidence |
|---|---|---|
| B1 | `GE.OnGameTurnEnded(T)` | 16 of 16, after player 63's start |
| B2 | the **World Congress** session resolves | RandCalls: `World Congress Resolutions` closes its turn label in 12 of 17 turns (only `Random congress resolution target` after it in the rest); t150: the votes' `FavorChanged` in the end phase, `WorldCongressFinished` published at T+1's `TurnBegin` |
| B3 | **every unit and every city heals** | all 45 unit heals and 22 city/district heals of the records are in this phase (the 9 other decreases are promotion heals, `UnitPromoted` beside each); a unit ATTACKED this turn that did not move or attack itself heals (9 defenders; 14 others did not — killed, full or starved, not separated); none of the 49 defenders that moved or attacked healed |
| B4 | `EV.TurnEnd(T)` | |

**C. The counter moves to T+1**, then, before `GE.OnGameTurnStarted(T+1)`:

| # | step | evidence |
|---|---|---|
| C1 | the live **storms** walk and strike (`Storm Direction`, its `Pillage Improvement Chance`) | RandCalls: `Storm Direction` opens its turn in 67 of 76 (only a GP generation or a tech-boost draw before it otherwise) |
| C2 | the **volcano** eruption roll (`Active Volcano Roll`) | after the storms 76 / 76 |
| C3 | the turn's **random event** roll and its effects (pillage, unit damage, population loss, fertility), a new storm's start plot | `Random Event Roll` after the volcano roll 190 / 190; t154: a flood's two `GE.OnCityPopulationChanged(-1)` fire here, before `OnGameTurnStarted` |
| C4 | the draws between `OnGameTurnEnded` and `OnGameTurnStarted` | 170 / 40 / 50 / 162 / 226 / 32 on the seeded records |

**D. `GE.OnGameTurnStarted(T+1)`**, then:

| # | step | evidence |
|---|---|---|
| D1 | `PreTurnBegin` | |
| D2 | the **era** change and every major's **Age** | `GameEraChanged` 3 / 3 and `PlayerAgeChanged` 36 in this gap |
| D3 | city-state **quests** checked (new quests are DRAWN later, on the city-states' own turns) | `QuestChanged` 86 in the gap; `Selecting a random new quest` follows a `GetNextBuyablePlot` draw in 50 / 54 turns |
| D4 | **diplomatic favor** per turn for every major at once | `FavorChanged(…, -1)` 120 in the gap, 2 elsewhere |
| D5 | `TurnBegin`, then the **emergencies** update | `EmergenciesUpdated` 13 / 14 right after `TurnBegin` |
| D6 | player 0's turn (A) | |

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
Civ 6's order gold with upkeep → `bankruptcy` → science → techs → culture →
civics → faith → great people (gold vs science is unpinned); the sums it banks
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
city after every player, barbarians included (B3). *Effect:* a city attacked
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
(which reads the NEW turn). Civ 6: the session resolves at the end of T (B2),
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

## What could not be pinned

* The **order of gold vs science** inside A2–A3 (both move before the first
  synchronous event; the published order lists research first).
* **Loyalty's** exact place inside the city (GameCore has no loyalty reader;
  the placement is the published event order) and **when a city at 0 loyalty
  flips** (no flip in the records).
* **Climate**: sea-level rise and the CO2 phase change (no climate event
  fired in the records).
* **Tourism** banking, the **score** and the **turn limit / victory** checks
  (no event; the end of the game was not reached).
* The GP market's refill draw that opens some turns
  (`Generating a random new Great Person` before the storms in 9 of 76 storm
  turns) — whether a turn-start recruitment exists or it is a late draw of
  the previous turn.
* The relative order of the end-of-turn congress and the heal (published
  order: favor first, then the heals).
* The healing rule for a city attacked this turn (only the heal's position was
  read).
* A human seat's start of turn waits for its open diplomacy session and
  popups (`turnorder_unstick.py` answers them): the READINGS are unaffected,
  but a run that reads the local seat straight after the counter moves reads
  it BEFORE its processing.

## Proposed AUDIT entry

- **C-93. THE TURN'S ORDER.** Weight 5.
  Civ 6 runs a game turn as: each player in ascending id (majors, city-states,
  the Free Cities, the barbarians) takes its start of turn — gold with upkeep
  and bankruptcy, science and techs, policies, culture and civics, faith,
  great people / envoys / governors, then each city in acquisition order:
  production, growth on the live city, borders, loyalty, its religious
  pressure out — then its actions; then the World Congress; then every unit
  and city heals; the counter moves; the storms, the volcano roll and the
  random event; the era and Ages, the quests' check, the favor; the
  emergencies (`tools/civ6lab/turn_order_civ6.md`, measured 2026-09-27,
  `runs/turnorder/`).
  - BUILD: the player order — `endTurn` / `SimStep.step`: majors, then
    `cityStatePhase` + `minorPhase`, then `freeCitiesPhase`, then
    `barbarianPhase` (16 of 16 turns, 332 blocks).
  - BUILD: the economy before the cities — `seatPhase`'s research / civic /
    gold / upkeep / `bankruptcy` / faith / `advanceGreatPeople` block and GPU
    `_seat_research_tail` before the city walk, the walk's stats taken after
    it (armT: +11 not +10; armB: +9.90 not +11).
  - BUILD: inside a city, production → growth on recomputed stats → borders →
    loyalty (`seatPhase` walk, `minorAccrue` / `minorBuild`,
    `freeCitiesPhase`; GPU `_seat_city_produce` → `_seat_city_growth` →
    `_seat_border_growth` → `_seat_city_loyalty`) (11 / 11; armS +2.129 vs
    +1.275).
  - BUILD: the city heals leave the seat, minor and Free City bodies for one
    end-of-turn heal beside the unit heal (22 of 22 city heals at the turn's
    end).
  - BUILD: `spreadReligiousPressure` / `_spread_religious_pressure` per source
    seat, on that seat's turn (13 of 15 conversions in the presser's block).
  - BUILD: `disasterPhase` / `_disaster_phase`: the storm walk before the
    volcano and the random event (67 / 76, 76 / 76, 190 / 190).
  - BUILD: `worldCongress` / `_world_congress` before the turn increment
    (12 / 17 turns closed by the session's draws).
  - BUILD: the record's world-facing verbs (purchases, levy, silo, routes,
    the diplomacy arms) at the actor's block tail beside
    `applySeatUnitOrders`.
  - LAB: gold vs science inside the start; loyalty's place in the city and
    the flip's moment; the climate step; tourism; the score and victory
    checks; the congress vs the heal; a city's heal when attacked that turn.
