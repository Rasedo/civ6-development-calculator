# Lab session 5 — the scenes

Every LAB line open in `docs/AUDIT.md`, drafted as automated scenes (no
clicks: `game.py launch/load/new`, Lua over the tuner, `lab.py advance`,
`lab.unstick`). A scene id is its AUDIT entry plus `-S<n>`. Calls marked
UNVERIFIED appear in the install's UI Lua or `.ltp` panels but have not run
from the tuner; try them first and fall back as noted. Everything else is in
`README.md` ("The calls that work, by state") or an existing script.

Before anything: `python tools/civ6lab/lab.py probe` green, owner mode not
running a battery, a named save written.

## 0. Before the session: tool fixes the drafts depend on

- **The pcall idiom.** `tostring(ok and v or "err")` prints `err` for a clean
  `false`. `reactor_pillage.lua` uses it, and the README's "`IsPillaged` throws
  for a socket-built building" row, SESSION2's §4 and AUDIT C-1 all rest on it.
  Print three states (`true` / `false` / `err:<msg>`) in every reader.
- **`cs_analyze.py`.** It counts upgrades as purchases, skips `UNIT_BUILDER`
  in `army()`, and counts the Free Cities player (p62) as a city-state. Pair
  upgrades through the install's `UnitUpgrades`, count Builder buys, drop p62.
- **`cs_watch.lua`.** `prog` is hard-coded to -1. Read
  `GetCurrentProductionTypeHash` / `GetUnitProgress` / `GetBuildingProgress`
  (the `minor_prod.lua` calls).
- **`watch.py`.** Accept a second `--lua` / `--state` pair, so an InGame reader
  runs beside the GameCore one each turn.
- **`event_history.lua`.** Print each turn's full record, not the tally.
- **`reactor_fleet.py`.** Take the snapshot in InGame as well, and fail loudly
  when `cmd_load` fails (`cmd_trials` ignores its return).
- **Grievances.** Read `Game.GetGameDiplomacy():GetGrievanceLogEntries(a, b)`
  (DiplomacyActionView_WorldCongressTab.lua:44; UNVERIFIED) in the turn of the
  act. `GetGrievancesAgainst` one turn later is short by the era's
  `GrievanceDecayRate`.
- **README.** It says both "a load costs the owner a click" and that
  `game.py load` needs none. `game.py load` is right; fix the other line.

## 1. Order of play — cheapest first, shared instruments

| # | Instrument | Turns played | Serves |
|---|---|---|---|
| 1 | Save sweep: load each named save, read, no advance | 0 | B-82-S1, B-D-S0, C-60-S1, C-74-S1 (+ C-49 resultants, C-41 per-volcano counts), C-38-S2 (mid-game half) |
| 2 | Deterministic previews on one prepared save | 0–1 | B-89-S1, C-20-S1 + C-26-S3, C-34-S1, B-86-S2 |
| 3 | Forced events, read in the same turn, reset between | 0 | C-41-S1, C-1-S1, C-49-S1, C-26-S2 |
| 4 | Short scenes on `lab4_t100` / `t150` / `t225` | 1–20 | B-31r-S1, B-D-S1, B-86-S0/S1, B-87-S1, C-2-S1, C-16-S1, C-26-S1, C-38-S3, C-60-S3, C-60-S4 |
| 5 | Observer watches, several instances | 250 | C-38-S1 + C-60-S2 (one extended watch), C-74-S2 (Duel), C-38-S2 (era starts) |

The saves the sweep reads are the named ones on disk: `lab4_t25` … `lab4_t250`
and `obs1..6_t50` … `t250` (about 36). Observer saves keep playing after a
load, so every sweep reads `Game.GetCurrentGameTurn()` before and after and
drops a read whose turn moved.

## 2. Instrument 1 — the save sweep (no play)

**Run.** `save_sweep.py` loads each save (`game.cmd_load`), runs the chosen
readers, and appends one record per save per reader. The instances are up
first (at the main menu or in a game); one worker per `--hosts` entry, each
save loaded on exactly one of them.

    python tools/civ6lab/save_sweep.py --list                          # the plan: saves x readers still pending
    python tools/civ6lab/save_sweep.py --hosts 3                       # every reader on its default saves
    python tools/civ6lab/save_sweep.py --hosts 3 --readers score,ww    # B-82-S1 + B-D-S0, all 37 saves
    python tools/civ6lab/save_sweep.py --readers freecity_def          # C-60-S1, its six saves
    python tools/civ6lab/save_sweep.py --readers minor_def             # C-38-S2, lab4_t50/t100/t150
    python tools/civ6lab/save_sweep.py --hosts 3 --readers events      # C-74-S1 (+ C-49, C-41), all 37 saves

| reader | scene | Lua (state) | default saves | record under `runs/` |
|---|---|---|---|---|
| `score` | B-82-S1 | `score_read.lua` (InGame) | all | `score_xsec_<stamp>.jsonl` |
| `ww` | B-D-S0 | `freecity_amenity.lua` `ZALL=1` (InGame) | all | `ww_xsec_<stamp>.log` (jsonl) |
| `freecity_def` | C-60-S1 | `city_probe.lua` `ZWHO=free` (InGame): every Free City and its nearest major city; the listed coordinates checked in `expected` | the six listed | `freecity_def_<stamp>.jsonl` |
| `minor_def` | C-38-S2 | `city_probe.lua` (InGame): every city of every player | `lab4_t50/t100/t150` | `minor_def_<stamp>.jsonl` |
| `events` | C-74-S1 | `event_history.lua` (InGame); `event_map.lua` (InGame and GameCore) | all | `event_turns_<save>.jsonl`, `event_map_<save>.json` |

`Game.GetCurrentGameTurn()` is read before and after each reader (observer
saves play on after a load); a read whose turn moved is repeated twice
(`--retries`) and then kept with `"moved": true`. The ledger
`runs/save_sweep_ledger.jsonl` makes a rerun skip every pair already `ok`;
`--redo` reads them again, `--saves <glob>...` replaces the default lists,
`--at-end menu|close|stay` (default `menu`). One city by hand:
`lab.py lua --state InGame --file tools/civ6lab/city_probe.lua --set ZX=69 --set ZY=21`.

### B-82-S1. What `ERA_BUILDINGS` and `Converted` count
- **Unknown.** Empire's `LINE_ITEM_ERA_BUILDINGS` residue (10–43): every
  building instance, excluding pillaged ones, walls, or city-centre buildings,
  distinct types, and whether wonder districts count as districts. Religion's
  `Converted`: foreign-owned followers including minors (the leading
  candidate: the residues +1/+3/+4/0 fit uncounted city-state followers), all
  followers minus the holy city, or conversion events.
- **Reads.** `score_read.lua` extended with, per city, each non-wonder
  building type with `IsPillaged` (three states), the district types including
  `DISTRICT_WONDER` with pillage state, and every city's majority religion,
  owner, `IsMajor` and holy-city flag (minors included). Beside them,
  `GetCategoryScore` per category and `GetScore`. Record
  `runs/score_xsec_<stamp>.jsonl`.
- **Sample.** About 250 seat-rows. Every candidate predicts an integer residue,
  so a candidate dies on its first mismatched row.
- **Fit.** The Score on both engines: a `ScoringLineItems` catalog in
  `cpu/data`, exported through `rules.ts`; TS `endTurn` names the argmax with
  `TieBreakerPriority` (its direction is unread — note it from any tie); the
  GPU's `leader()` over the new score; `seat_score` stays the env reward.
- **S1's result.** Civics, techs, wonders, era score and Great People fit every
  seat-row; Empire does not. With 5 x cities + 2 x districts + population
  fixed by `ScoringLineItems`, no count of the buildings fits (plain, without
  pillaged / walls / Palace, distinct types: best 48 of 242 rows), nor each
  building's unlock era (best 33 of 242). S2 decides it.
- **B-82-S2.** In `lab4_t150` place one building, one district and +1
  population at a time (`score_step.lua`: the tuner's
  `WorldBuilder.CityManager():CreateBuilding`) and read Empire after each.
  Learned so far: the score is NOT recomputed on placement (`GetScore`
  unchanged until a turn is processed); `GetCategoryScore` exists in InGame
  only; an invalid placement (a Water Mill with no river) returns true and
  places nothing, so check `HasBuilding`. So the scene is: two copies of one
  save, the same one-turn pass, one with the placement — the Empire
  difference is the building's worth; this also confirms the 5 / 2 / 1 split.

### B-D-S0. Does war weariness cost each city the same?
- **Unknown.** H1 (engines): `floor(WWP/400)` in every city. H2: plus an
  addend by city class (founded 0, non-founded 1, at war 3). H3: the
  `LOSS_OVER_REQ_AMENITIES_*` rows are CAPS on how far below its need war
  weariness may push a city (founded 0, non-founded 1, at war 3).
- **Reads.** Every major city: `GetAmenitiesLostFromWarWeariness`, every other
  `GetAmenitiesFrom*` / `GetAmenitiesLostFrom*` (`freecity_amenity.lua` with
  `ZALL=1`), `GetAmenitiesNeeded`, `GetAmenities`, `GetPopulation`,
  `GetOriginalOwner` against the owner, the owner's wars (`IsAtWarWith`), and
  the distance to the nearest enemy unit (no definition of "a city at war" is
  published). Record `runs/ww_xsec_<stamp>.log`.
- **Sample.** 1,500–2,500 city-rows, a few hundred with a loss. One seat with
  unequal losses kills H1; one founded city pushed below its need kills H3.
- **Fit.** H3: a per-city cap beside `warWearinessPenalty` (`cpu/core/city.ts`)
  and in the GPU amenity walk. H2: a per-class addend. H1: B-D's line closes.

### C-60-S1. The Free City's defence across eras
- **Unknown.** H1: a flat 72 in every era (engines). H2: an era-typed base.
  H3: walls and garrison add on top (the 72 was read with neither).
- **Saves.** Free Cities standing in `obs1_t150` Chengdu (53,18), `obs2_t150`
  Da Lat (43,26), `lab4_t200` Ngaruawahia (69,21) and Mexico City (20,32),
  `lab4_t225` / `t250` (69,21), `obs3_t250` Brantford (73,24).
- **Reads.** `city_probe.lua` with `ZX`/`ZY`: centre and Encampment
  `GetDefenseStrength`, walls, units on the centre; `era_probe.lua`'s era; a
  neighbouring major city's defence for contrast. Record
  `runs/freecity_def_<stamp>.jsonl`.
- **Fit.** H2: `FREE_CITY_DEFENSE` becomes an era table in `holderStrength` /
  `_holder_strength`. H3: walls and garrison added there (`centreStrength` /
  `_centre_strength` carry both).

### C-74-S1. The event record, turn by turn, beside the map
- **Unknown.** Which turns are empty (turn 1 under `RANDOM_EVENT_START_TURN`
  2? random?); whether a flood site is a river or a floodplain plot; whether
  only ACTIVE volcanoes are sites (`RealismSettings.PercentVolcanoesActive`
  70); whether `Spacing` 15 is a distance between storms or a turn gap; the
  absolute normaliser, P(event) against Σ Occ × sites / 250 × a map factor;
  the per-degree increase's form (both engines ship weight × (1 + CIPD/100 ×
  ΔT) with ΔT continuous and able to fall; the game may step by half
  degrees or never cool); the drought's start (the tooltip's "devoid of all
  Features", shipped, against the pedia's stricter "four featureless
  Grassland/Plains tiles adjacent").
- **Already settled from the tallies** (no play needed): the empty share falls
  with map size (Small 25%, Standard 8%, Large 1%, Huge 0%); one-site rows run
  at about Occ × turns/250 × 0.75 / 0.93 / ~1.2 by size; lab 4's 74 eruptions
  fit 70% of 13 volcanoes; the flood mix held at base through seven sea-level
  rises (the per-degree columns fit, the old ice-melt shift did not); a strict
  15-turn per-row cooldown is refuted (19 CAT_4 in 249 turns).
- **Reads.** For t = 1..now, the full `GetEventsForTurn(t)` record
  (`RandomEvent`, `StartTurn`, `EndTurn`, `StartLocation`, `CurrentLocation`,
  `CurrentDirection`, `River`, `Volcano`, `NaturalWonderVolcano`,
  `TilesDamaged`, `PopLost`). The map: `RiverManager.GetNumRivers`,
  `GetNumFloodableRivers`, `GetRiverByIndex(z, "floodplain")`;
  `MapFeatureManager.GetNumNormalVolcanoes`, `GetNumActiveVolcanoes`,
  `IsActiveVolcano(plot)` (ClimateScreen.lua 430–436,
  PlotTooltip_Expansion2.lua:21; InGame, UNVERIFIED in GameCore); terrain
  counts per storm family; featureless Plains/Grassland; Forest and Jungle;
  `GameClimate.Get{Flood,Storm,Drought,Eruption}PercentChance`,
  `Get{Flood,Storm,Drought}ClimateIncreasedChance`, `GetTemperatureChange`.
  Records `runs/event_turns_<save>.jsonl` and `runs/event_map_<save>.json`.
- **Sample.** About 1,700 turns and 1,300 events. An inactive volcano expects
  0 eruptions, an active one about 8; per-river counts against floodplain size
  split river from plot; the ten `lab4_t*` saves give increase against ΔT.
- **Fit.** Active volcanoes drawn at load (`eventSites` / `_volc_n`); an empty
  mass so P(event) = min(1, Σ w·n·f / 250) in `randomEvent` / `_random_event`;
  the warming form in `warmingDegrees` / `_warming_degrees` if the
  temperature reads step or never fall; Spacing as the fit names it;
  `droughtCandidate` narrowed if the drought `StartLocation`s show the
  pedia's stricter start.
- **Rides along.** C-49: the natural storms' 16-step resultants with
  `CurrentDirection` (about 60 open-ocean hurricanes), compared with the
  independent-band law and a persistent-heading law. C-41: eruption counts
  per volcano.

### C-38-S2 (mid-game half). A minor's centre strength
- **Unknown.** What `StartEras.StartingMeleeStrengthMinor` (25 at Ancient)
  applies to. H1: the minor centre's base. H2: 15 + population
  + 6 (militaristic) + walls. H3: the minor's units.
- **Reads.** In the `lab4_t50/t100/t150` saves: every minor's centre and
  Encampment `GetDefenseStrength`, population, type, walls, the units on the
  centre; the majors' centres for contrast. H1 and H2 differ by 3 or more at
  every point. The era-start half is under instrument 5.
- **Fit.** the minor's base in `holderStrength` / `_holder_strength`.

## 3. Instrument 2 — deterministic previews

### B-89-S1. What may target a religious unit
- **Unknown.** Can a melee attack, a ranged attack, a city strike or a
  barbarian attack take a Missionary or Apostle? Is Condemn Heretic same-tile
  (the pedia: "when on the same tile"; the command takes no target) or
  adjacent (both engines)? Control: can a lone Builder be shot?
- **Setup.** `lab4_t150`, war declared (`declare_war.lua`, `SURPRISE_WAR`).
  Turn T in GameCore: a human Crossbowman and Swordsman beside tile M, one
  walled human city in range. Advance one turn (a unit created this turn gets
  an empty target list). Turn T+1: an AI Missionary at M (`Create`, then
  `u:GetReligion():SetReligionType`), an AI Apostle, an AI Builder and an AI
  Warrior control, one per tile.
- **Reads, InGame, nothing fired first.**
  `UnitManager.GetOperationTargets(crossbow, RANGE_ATTACK)`;
  `CombatManager.SimulateAttackVersus` per pair (it refuses illegal pairings);
  `CanStartOperation(sword, MOVE_TO, nil, {X, Y, MODIFIERS = ATTACK})`;
  `CityManager.GetCommandTargets(city, RANGE_ATTACK)`;
  `CanStartCommand(sword, CONDEMN_HERETIC, false, true)` adjacent and, if the
  move is legal, on M. Then fire one ranged attack and one condemn and read
  the Missionary. Barbarian arm: a barbarian Archer beside a human Missionary,
  one autoplay turn, repeated (a non-local `SimulateAttackVersus` is
  UNVERIFIED). Record `runs/religious_target_<stamp>.jsonl`.
- **Sample.** 3 attacker kinds × 4 targets + condemn at 2 geometries + the
  barbarian arm, on two map spots. About 45 min.
- **Fit.** Refused: drop religious units (and civilians, if the Builder is
  refused too) from `attackTargets` / `hostileRangedStrike` and the GPU scans
  over `_civclass_at` / `_nonbarb_unit_plane`. Same-tile condemn: the six
  directional `A_CONDEMN` actions become one own-tile action on both engines.
- **S1's result** (`lab4_t225`, seat 0 at war with Georgia; `b89_setup.lua`,
  `scene2_spawn.lua`, `b89_read.lua`, `b89_pairs.lua`, `b89_fire.py`; records
  `runs/religious_target_20260926T_{read,pairs,fire}.jsonl`). No turn is
  needed: GameCore `UnitManager.RestoreMovement` / `RestoreUnitAttacks` give a
  unit spawned this turn its moves and target lists. `CombatManager.
  CanAttackTarget(att, def, CombatTypes.X)` (UnitPanel.lua:3598) answers the
  same in GameCore and InGame, for AI and barbarian attackers too, and ignores
  range. Ranged (Crossbowman, Archer; seat 0, Georgia, barbarians) and the
  walled city's strike: refused against Missionary, Apostle and Builder alike
  (`SimulateAttackVersus` nil, `CanStartOperation` / `CanStartCommand` false,
  absent from the target lists; fired requests did nothing), accepted against
  every combat unit. Melee (Swordsman, Warrior; all three owners): accepted,
  but it is a MOVE ONTO the tile — the preview reads defender strength 0,
  damage 0; fired, the Swordsman shared the Missionary's tile and the
  Missionary was untouched; onto a Builder it CAPTURED it. Condemn Heretic is
  same-tile: `CanStartCommand` false (loose and real) from every adjacent
  tile, true on the heretic's tile (spawned there, or moved in by the melee
  order); fired, the religious unit dies and the condemner's moves go to 0.
  One endturn with a barbarian Warrior on a seat-0 Missionary's tile: the
  Missionary and Apostle survived, a barbarian Swordsman captured the Builder.

### C-20-S1 (with C-26-S3). The route's transportation efficiency
- **Sourced already.** `Expansion2_GlobalParameters.xml` 274–282:
  `TRADE_ROUTE_TRANSPORTATION_EFFICIENCY_MAX_RATIO` 1.0, `_SCORE_BEST_ROUTE_TILE`
  2, `_SCORE_MULTIPLE_DOMAINS` 15, `_SCORE_PORTAL_USE` 15, `_SCORE_WATER_TILE` 2.
  The pedia extends the multiplier to "water or Railroads, or through Canals
  or Mountain Tunnels".
- **Unknown.** How the score maps to the multiplier: D·min(Σ/100, 1) with
  Σ = 2·water + 2·rail + 15·domain switches + 15·portal uses, or Σ normalised
  by path length; floor or round.
- **Setup.** Two seat-0 cities (or seat 0 and a partner) split by a mountain
  range and by water. Tunnels by `ImprovementBuilder.SetImprovementType(plot,
  MOUNTAIN_TUNNEL, 0)` (UNVERIFIED for tunnels; fallback a Military Engineer
  build), railroads by `RouteBuilder.SetRouteType` (UNVERIFIED).
- **Reads, InGame.** `Game.GetTradeManager():GetTradeRoutePath(o, oc, d, dc)`
  (plots, portal entrances and exits; TradeRouteChooser.lua:476), and
  `CalculateOriginYieldFromPath` / `…FromPotentialRoute` / `…FromModifiers`
  plus the destination-side calls (lines 864–895), before and after each
  change. Record `runs/trade_path_<stamp>.jsonl`.
- **Sample.** About 20 configurations (0/1 portal pairs, 0..N rail and water
  tiles, one domain switch) × 2–3 city pairs. Exact fit. About 30 min.
- **Fit.** A tile path for routes that passes portals (`portalExit`), five
  `srcConst`s, and the path gold on `routeYieldsInternational` /
  `routeYields` / `cityTradeYields` and `_seat_route_income`.
- **C-26-S3 on the same script.** Attach `TRAIT_EARLY_OCEAN_NAVIGATION`
  (Norway's Ocean clause) to seat 0; grant Shipbuilding and Celestial
  Navigation but not Cartography (`SetTech`); read `GetTradeRoutePath` across
  Ocean and count OCEAN plots; control on a fresh load without the attach.
  Fit: a Norway branch in `tradeWaterLevel` and its GPU twin.
- **S1's result** (`trade_path.lua`, `c20_step.py`, `trade_sweep.lua`,
  `trade_eff_fit.py`, `trade_eff_alt.py`; records
  `runs/trade_path_20260926T_c20.jsonl`, `runs/trade_sweep_20260926T.jsonl`).
  `GetTradeRoutePath` takes ANY origin player, returns the plots and two
  per-plot arrays (portal entrance / exit, -1 = none); the path gold is
  fractional. Railroads laid one plot at a time (`WorldBuilder.MapManager():
  SetRouteType`) on three routes of 6, 10 and 15 plots add exactly
  D·floor(256·2/n)/256 per plot and stop at D. The whole map's 2,493 pathed
  routes (every major's origin, lab4_t225, seat 0 given every tech) then fit
  exactly, 1,948 of 1,948 rows with gold:
  P = D·min(1, floor(256·S/n)/256) + (foreign cities on the path, destination
  included, where the origin holds an ACTIVE trading post), S = 2·water plots
  + 2·railroad plots (origin plot excluded, destination included) + 15 per
  portal entrance, n = every plot of the path, D = the destination
  districts' gold (`…FromPotentialRoute`). Each single change breaks 89–1,307
  rows; `_SCORE_MULTIPLE_DOMAINS` 15 enters nowhere (171 unsaturated rows with
  a land↔water switch). A Mountain Tunnel placed by `ImprovementBuilder`
  (WorldBuilder refuses it) created no portal the path used.
- **C-26-S3's result** (`runs/trade_path_20260926T_c26s3.jsonl`). The
  control already crosses Ocean: seat 0 with Shipbuilding and Celestial
  Navigation and no Cartography, Tikal → Opango runs 24 plots with 5 OCEAN
  plots although a coast-only line exists; after
  `AttachModifierByID("TRAIT_EARLY_OCEAN_NAVIGATION")` the path is plot for plot
  the same. The Trader's path is not gated on Cartography at all, so
  Norway's clause has nothing to add.

### C-34-S1. Patrol and Priority Target by preview
- **Sourced already.** Patrol is `UNITOPERATION_DEPLOY`; the pedia's Air
  Combat chapters give the rules: a deployed fighter holds a hex with
  intercept radius 1 until ordered off; stationed aircraft do not intercept;
  the strongest interceptor fights and each other adds +5; an intercepted
  fighter aborts, a bomber continues. Priority Target lets an air unit strike
  a Support-class unit without first removing the combat unit on its tile.
- **Unknown.** The strengths and damage only.
- **Setup.** A late save. Deploy a fighter with
  `UnitManager.RequestOperation(f, UnitOperationTypes.DEPLOY, {PARAM_X,
  PARAM_Y})` (WorldInput.lua:2418; UNVERIFIED) as the local seat, or use an AI
  fighter already standing off-base.
- **Reads.** `CombatManager.SimulateAttackInto(bomber:GetComponentID(),
  CombatTypes.AIR, x, y)`, gating the INTERCEPTOR block on its ID, at distance
  0/1/2 from the patrol plot, with 1–3 interceptors, and with the fighter
  stationed as the control; `SimulatePriorityAttackInto` (UnitPanel.lua:3922)
  against `SimulateAttackInto` on a combat unit stacked with an AA gun. Three
  to five real strikes tie preview to outcome. About 30 min.
- **Fit.** A deployed air state with interception (tile, radius, +5 support,
  abort) in `airStrike` / `airPillage` / `_air_strike`; a priority flag in the
  air-strike record and in `stackDefender`'s pick.
- **S1's result** (`lab4_t225`, seat 0 given every tech; Georgia's bomber into
  seat-0 Warriors under seat-0 patrols; `scene2_op.lua`, `air_preview.lua`,
  `c34_step.py`, `c34_strike.py`, `c34_bomb50.py`, `air_summary.py`; records
  `runs/air_patrol_20260926T.jsonl`, `runs/air_strike_20260926T.jsonl`,
  `runs/air_bomb50_20260926T.jsonl`). DEPLOY works from the tuner only after a
  REBASE: an aircraft spawned by `Create` (or standing in an over-full base)
  has no DEPLOY targets; rebased, then `RestoreMovement`, it deploys and reads
  `ACTIVITY_INTERCEPT`. A non-local attacker previews fully once the target
  is VISIBLE to its owner (a spotter unit). Measured: radius 1 (d0, d1
  intercept, d2 none); stationed fighters (city, airstrip) never intercept;
  the interception is a TWO-SIDED combat at the ordinary law — interceptor
  strength = its Combat (Biplane 80, not its Ranged 75), the bomber defends
  with its Combat (85), both take damage (e.g. 34 to the bomber, 27 to the
  fighter at Δ3); each other covering patrol adds +5·hp/100 (+10 for two
  full, +7.5 with one at 50 HP); the pick is the patrol ON the struck tile
  even when wounded or weaker (a Fighter on the tile over an adjacent Jet),
  and among equidistant patrols the stronger (the Jet over a Fighter). The
  AA gun on a struck stack fires first (one draw), then the strike (a second
  draw) at the bomber's post-burst health; a lone AA gun is the defender (two
  draws: its damage, then the bomber's). PRIORITY_TARGET, fired
  (`RequestCommand(u, UnitCommandTypes.PRIORITY_TARGET, {PARAM_X, PARAM_Y})`),
  does NOT match its preview: 5 of 5 strikes dealt a flat 65 to the AA gun
  (`COMBAT_MIN_CIVILIAN_DAMAGE_PERCENT` 65; 0→65, 30→95), no draw consumed, no
  damage to the bomber, whatever its health. The bomb's line: an unoccupied
  Holy Site under AA cover was pillaged at 51 and 50 HP left, not at 49, 48,
  46 — "50% health or higher".

### B-86-S2. The emergency term against an anti-air sortie
Needs an emergency (B-86-S0, instrument 4). While one runs:
`SimulateAttackInto` with the target seat's bomber into a member tile covered
by a member AA gun, and the same against a non-member at war as the control,
with the gun at several health levels so a ±2–3 term cannot hide in
rounding. Read the ANTI_AIR block's strength, modifier texts and damage (gate
on the block ID). If S0 fails, the Military alliance's
`ALLIANCE_ADJUST_COMBAT_STRENGTH` carries the same `REQUIRES_COMBAT_UNIT_VS_UNIT`
and shows at least whether the AA burst counts as unit-against-unit. Fit: the
emergency term (`emergencyAttackCS` and its GPU twin) in the anti-air answer
in `cpu/core/air.ts`, or "measured: none".

**S2's result.** The gate is unmet in `lab4_t225`: the running emergencies
are Religious (target Nubia) and the Nobel Prize, neither with a combat
term. The fallback ran: GameCore `SetPermanentAlliance(4, 3)` (with
`SetHasAllied`) makes seat 0 and Egypt a level-1 MILITARY alliance
(`GetAllianceType` 3; `SetHasAllied` alone gives 0, Research), Egypt declared
on Georgia. The bomber's "+5 from the military alliance" then appears twice
in its preview, and the AA burst it takes fell from 80 to 66 (95 against 70,
then 75) — the anti-air answer is a unit-against-unit combat
(`REQUIRES_COMBAT_UNIT_VS_UNIT` holds); four real strikes matched the
alliance preview draw for draw. The interception fight takes the same +5.
Which side is the "attacker" in the burst (the emergency modifiers split
attacker / defender) is not shown by a role-free term.

## 4. Instrument 3 — forced events, read in the same turn

### C-41-S1. Eruptions on owned and unowned rings
- **Unknown.** (a) Do the `RandomEvent_Damages` rows apply only on OWNED plots?
  The lab 4 record's rates mix two states: damage switched on per plot during
  the run and then followed the rows (GENTLE pillage 3/3; CATASTROPHIC 8
  destroyed + 1 pillaged; MEGACOLOSSAL 12 + 2). (b) Is a BONUS resource lost
  only on painted plots, only on owned ones, or both? (Strategic and luxury:
  0/42 lost; bonus: 21/21 painted, 9/21 unpainted.) (c) Are Marsh and Oasis
  painted? (d) What happens to a district, centre or wonder on the ring?
  (e) Do the `YIELD_PRODUCTION` (15/25/35) and `YIELD_SCIENCE` (10/15) rows add
  yield on painted plots?
- **Setup.** `lab4_t100`; 8 volcanoes with bare land rings. Found a city next
  to 4 of them (a Settler by `Create`, `FOUND_CITY` in InGame) so ring 1 is
  owned; leave 4 unowned. Reset each ring with `volcano_scene.py`'s calls; lay
  improvements with `SetImprovementType(p, idx, owner)` alternating the plot
  owner and -1; one bonus, one luxury and one strategic resource per ring; one
  Marsh and one Oasis; on owned rings a district (`CreateDistrict`, one call
  per plot) and a wonder.
- **Procedure.** Fire each severity with `volcano_erupt.lua`. No turn between
  eruptions (AI builders repair at once): read now, reset.
- **Reads.** Before and after, per ring plot: `GetOwner`, feature, resource,
  improvement, `IsImprovementPillaged`, district and `IsDistrictPillaged`;
  `plot:GetYield(i)` in InGame. Record `runs/volcano_own_<stamp>.jsonl`.
- **Sample.** 8 volcanoes × 3 severities × 3 repeats = 72 eruptions, about 400
  plot-rows; (e) needs about 40 painted plots per severity. About 15 min plus
  setup.
- **Fit.** Owned-only: `erupt` / `_erupt` gain the DESTROY roll (75 / 80) and the
  other damage rows gated on `tileSeat` ≥ 0, and floods and storms take the
  same gate (`floodTile`, `stormTile` and twins). Bonus-only loss: a
  resource-removal step keyed on class. Marsh/Oasis painted: extend
  `SOIL_REPLACES`. Yield rows: fertility rolls on painted plots.

### C-1-S1. The accident's building and unit rows
- **Unknown.** `BUILDING_PILLAGED` (MINOR 20, MAJOR 100): per building, per tile
  or the plant alone (lab 3, read with the corrected idiom, spared the
  Workshop at MAJOR 100). The unit rows (MAJOR 50, CATASTROPHIC 100; damage
  20–50): reach (reactor plot, ring 1, ring 2+), roll (per unit, tile or
  event), band, and what `CITY_GARRISON` hits.
- **Setup.** `reactor_base` (5 cities, reactor on the Industrial Zone). Per
  reactor by `Create`: a land military unit on the Industrial Zone, on two
  ring-1 plots and at distance 2 and 3; a Builder on the Industrial Zone and
  on a ring-1 plot; a garrison on the centre; a naval unit on adjacent water
  where coastal. Save `reactor_units` (the whole rig before any read).
- **Procedure.** Per severity a fresh load, snapshot, fire (`reactor_fleet.py`
  `LUA_FIRE`), snapshot now. No autoplay.
- **Reads.** InGame `city:GetBuildings():IsPillaged(row.Hash)` three-state;
  `GetBuildQueue():CanProduce(row.Hash, true)` as a second reader
  (UNVERIFIED); units' `GetDamage()` and whether `FindID` returns nil; the
  garrison pool `GetDamage(DefenseTypes.DISTRICT_GARRISON)`;
  `GameRandomEvents.GetCurrentTurnEventAtPlot(plotIndex)` for PopLost /
  UnitsLost / TilesDamaged (UNVERIFIED). Record
  `runs/reactor_units_<stamp>.jsonl`.
- **Sample.** 5 loads × 3 severities = 25 events per severity: about 150
  CATASTROPHIC unit damages give the band and reach; all-or-none within an
  event separates a per-event roll; at MINOR 20%, per-building rolls predict
  about 12 lone pillages against about 5 all-three events per-tile. About 40
  min.
- **Fit.** A building draw in `nuclearAccident` / `_nuclear_accident` (and, if
  the Workshop is spared at 100, a fix to `pillageTileBuildings`, which
  floods and storms share); the unit rows through the `stormTile` unit block
  with `ACCIDENT_*` constants sourced to `RandomEvent_Damages`.

### C-49-S1. Batch hurricanes, open ocean and walled lanes
Run only if the natural resultants in C-74-S1 do not separate the laws.
- **Unknown.** H0 (engines): 8 independent band draws, invalid steps dropped.
  H1: the storm keeps its `CurrentDirection` with probability q, else redraws
  (the records carry a per-storm heading set at spawn on the band's side and
  changing every turn). H2: one heading per turn with jitter. And whether the
  dissipation turn walks again. There is no mid-turn read: the tuner runs
  between turn processing.
- **Setup.** A new Continents game (Online, realism 2). Deep-ocean plots in
  three bands, 20+ hexes apart, 9+ from ice and the edge. Lane variant: a
  one-wide east–west ocean lane walled with `TerrainBuilder.SetTerrainType`
  (UNVERIFIED in a live game; check one control lane first).
- **Procedure.** GameCore `ApplyEvent{HURRICANE_CAT_4, Location}` (`LUA_APPLY`)
  at up to 10 plots a turn, then `advance --advance endturn` three times.
- **Reads.** After apply and each turn: `GameClimate.GetActiveStormByIndex(i)`
  (`StormType`, `StartTurn`, `CurrentDirection`, `CurrentLocation`),
  `GetStormPlotsByID`, and the `GetEventsForTurn(start)` record. Record
  `runs/storm_walk_<stamp>.jsonl`.
- **Sample.** 50 storms per band × 3. H0 spreads the resultant over 4–8; H1
  with q ≥ 0.3 piles it near 8; a likelihood-ratio test has power above 0.95.
  In a lane, H0 predicts Binomial(8, p_band), H1 a 0/8 bimodal. About 30 min.
- **Fit.** H0: C-49 closes. H1: a per-storm heading (`stormDir` on the tile, a
  `storm_dir` plane) drawn at spawn in `fireEvent` / `_random_event` and kept
  by `stormWalk` / `_storm_walk` with the fitted q; the dissipation walk in
  `disasterPhase` / `_disaster_phase` as fitted.

### C-26-S2. Iteru and a flood's fertility (optional)
The XP2 text reads "Does not receive damage from Floods", which supports what
both engines ship (damage off, fertility kept). To confirm: attach the three
`TRAIT_AVOID_*_FLOOD` rows to seat 0 on a river split between seat 0 and
another owner; fire ten `FLOOD_MAJOR` events on floodplain plots; read
`plot:GetYield`, `IsImprovementPillaged` and the record's FertilityAdded on
both sides. About 100 plot-rolls a side separate 0 from about 45%. Fit: drop
the fertility half of `floodTile` for Egypt only if Egypt's plots never gain.

## 5. Instrument 4 — short scenes on the lab 4 saves

### B-31r-S1. What a plundered route pays
- **Unknown.** H1: a flat 50 (engines). H2: a base scaled by era, as district
  pillage is. H3: proportional to the route's yields. H4: land and sea differ.
  Also the command's geometry and whether non-gold yields move.
- **Setup.** `lab4_t100`, `t150`, `t225`. War on an AI with active routes
  (`declare_war.lua`). Find routes with `city:GetTrade():GetOutgoingRoutes()`
  and the Trader by `FindID`; record the route's yields with `trade_probe.lua`.
  Spawn a Swordsman (land) and a naval melee unit (sea) one turn early beside
  the Trader's path.
- **Procedure.** In the human turn, `CanStartCommand(u,
  UnitCommandTypes.PLUNDER_TRADE_ROUTE, false, true)` (UNVERIFIED from the
  tuner); if refused, attack-move onto the Trader's tile and retry, logging
  the failure reasons (geometry, `…_BLOCKED_BY_IMMUNITY`); then
  `RequestCommand`.
- **Reads.** The plunderer's gold and faith before and after (poll until the
  Trader is gone), science and culture progress (UNVERIFIED getters), the
  route's origin era, land or sea, length and yields. Record
  `runs/plunder_<stamp>.jsonl`.
- **Sample.** 12–18 plunders: 3 eras × land/sea × short/long, one repeat per
  cell for determinism. About 2 h.
- **Fit.** H1: 50 stays, marked measured. H2: an era table replaces
  `PLUNDER_ROUTE_GOLD` (`cpu/core/trade.ts`, `plunderGold` in `rules.ts`,
  `_trade_plunder_gold`). H3: the payout from the route's yields in the
  plunder blocks of `phase.ts` and `sim_seats.py`.
- **Risks.** Lisbon, Mandekalu/Bireme escorts (guard radius 4 in the install)
  and an Economic golden age block plunder: read the failure reason. Traders
  reroute on a declaration.

### B-D-S1. A war watched turn by turn
- **Unknown.** The step from war-weariness points to amenities, the decay
  (`TURN_AT_WAR` 50, `TURN_AT_PEACE` 200, `PEACE_DECLARED` 2000), max or sum
  over two enemies (the engines take the max), and the forum-sourced era base
  (`WW_ERA_BASE_*`). No points getter is known (`GetCulture():GetWarWeariness`
  returned err in lab 3).
- **Setup.** `lab4_t150`. Seat 0 declares on one neighbour, later on a second;
  melee units by `Create`.
- **Procedure.** Step 0: dump the methods of `GetDiplomacy()`, `GetCulture()`,
  `GetStats()` for a points reader (UNVERIFIED until it moves with combat).
  Each turn order N attacks in enemy land, counting combats by location and
  deaths; then stop attacking and watch the decay at war. Peace from the
  socket (a `DealManager` item) is UNVERIFIED; without it the peace decay
  stays open.
- **Reads.** Every city's war-weariness loss, gross amenities and need, the
  combats counted, any points getter. Record `runs/ww_watch_<stamp>.jsonl`.
- **Sample.** Two wars of about 20 turns. Amenity steps land every 400 points,
  so counted combats × the candidate era base must hit each step turn, pinning
  the base to about ±5%; two concurrent wars split max from sum. About 1.5 h.
- **Fit.** The era table, decay and aggregation in `cpu/core/weariness.ts` /
  `seats.ts` `WW_*` and their GPU twins.

### B-86-S0 and S1. The lost Nuclear emergency
- **S0 — get an emergency.** Lab 3 read no emergency after 21 warheads. In GS
  an emergency comes through a World Congress proposal. Load `lab4_t225`; the
  human seat nukes an AI city by bomber (README's `WMD_STRIKE`) and becomes the
  target; autoplay up to 15 turns (autoplay votes) reading
  `GetEmergencyInfoTable(p)` for every p each turn. Side try:
  `Players[p]:AttachModifierByID` (shown in BlackDeathScenario.lua; untried
  from the tuner). If none appears, B-86 is blocked on raising an emergency.
- **S1 — where the -1 lands.** H-cit (engines): each member city presses as
  (pop−1)·base·(1−0.1d). H-flat-pre: (pop·base − 1)·(1−0.1d). H-flat-post:
  the total minus 1 after falloff. H-per-citizen: base 1 → 0. A member
  CAPITAL as a source (capital citizens press +1, `CITIZEN_IDENTITY_PRESSURE_
  CAPITAL`) splits H-cit (Δ = 2(1−0.1d)) from H-flat (Δ = 1−0.1d). Keep the
  target alive (defenders and walls by `Create` / `CreateBuilding`); pick a
  probe city (a third party's) within 9 of 6+ member cities at distances 1–9,
  one a capital. Autoplay through the emergency's duration (60 on Standard, 40
  online by `GameSpeed_Durations`). Per turn read the probe's
  `GetCulturalIdentity():GetCityIdentityPressures()` (every field of every
  entry; MinimapPanel_Expansion1.lua 89–99) and each source's population,
  distance and capital flag. Record `runs/emergency_loyalty_<stamp>.jsonl`.
  One before/after pair per source is exact. About 1.5 h. Fit: the
  `emergencyPressureCut` term in `citizenPressure` / `_citizen_pressure_from`.
  The same read measures the capital's +1 and the age term, which neither
  engine carries as the pedia states (see the report's loyalty note).

### B-87-S1. Which buildings pay Pen, Brush and Voice
The install text ("+1 Era Score for constructing a building with a Great Work
Slot") already says a Marae, which has no slot, does not fire. To confirm:
a Maori human (setting the leader in the FrontEnd is UNVERIFIED —
`PlayerConfigurations[0]` setters), play to the first era change and pick the
dedication (`commemorate.lua`); grant Drama & Poetry, Theology and Humanism
(`SetCivic`); Theater in two cities, a Holy Site in one. Build one at a time
with `CreateIncompleteBuilding` + `FinishProgress`: Marae (city 1), Marae
(city 2, clear of the first-unique-building moment), Temple, Art Museum (the
control; if it does not fire, the placement path skips the event — switch to
a purchase or real production). Read `GetPlayerCurrentScore(0)`,
`GetPlayerCurrentEraScoreBreakdown(0)` and `GetAllMomentsData(0, 1)` before
and after each. Record `runs/ded_penbrush_<stamp>.jsonl`. The Temple also
settles whether the Temple, Stave Church and Cathedral belong in the trigger
set. Fit if no fire: `buildingDedications` checks the seat's variant
(`noGreatWorks`), and the GPU needs a per-seat mask beside `_b_gwslot`.

### C-2-S1. The promise's break and the broken-promise operand
- **Answered from the records.** The seat that holds `IsPromiseMade(b, DSNM)`
  is the one settled near; b, the founder, made it. The settle-near act is
  25, not 19: 19 and 18 are 25 read one turn late after the Industrial (6) and
  Renaissance (7) decay.
- **Unknown.** Does a founding by the promiser at border distance 1 or 2
  (city distance ≥ 4) break Don't Settle Near Me, or does it never break
  (every promise in the watches simply lapsed after about 30 turns)? Is the
  "Promise Broken" amount a flat 100 (the notification), 2 × 25 (the multiplier
  on the incursion), or 2 × the act? Which log description does the 25 carry?
- **Setup.** `lab4_t100` / `t125`. Found at border 3 from a rival p
  (`near_probe.py` / `settle_near_scene.lua`), end the turn with endturn (not
  autoplay), answer with `promise_loop.py`'s `LUA_ACCEPT` (POSITIVE) before
  `lab.unstick` closes the session; confirm `IsPromiseMade`; save
  `promise_base`. For Don't Spy, `spy_loop.py` with the same responder until
  the promise stands.
- **Procedure.** From `promise_base`, found at border 1 and at border 2 (a
  `settle_near_scene.lua` variant keyed on `near_border.lua`, checked with
  `CanStartOperation(settler, FOUND_CITY, …)`), one load each; control: border
  1 with no promise. Operand: one offensive mission (`spy_turn.lua`) under
  Don't Spy; optionally a Missionary spread under Don't Convert.
- **Reads.** `IsPromiseMade`, `GetGrievancesAgainst`, and
  `GetGrievanceLogEntries(p, 0)` / `(0, p)` in the turn of the act and after
  one endturn. Record `runs/promise_break_<stamp>.jsonl`.
- **Sample.** Deterministic: 2 distances × 2 foundings + the control; 2 breaks
  (spy, and convert or a second era) tell flat from scaled. About 45 min.
- **Fit.** A break within border k: `promiseIncursion(…, PROMISE_SETTLE, 1)`
  from `grievanceSettledNear` / `_grievance_settled_near`, and `_promise_turn`
  asks the promise. Never: ask 18 closes. The operand re-sources
  `PROMISE_BROKEN_GRIEVANCE` / `_promise_broken_griev`.

### C-16-S1. A counterspy as the pursuer
- **Unknown.** Does `ESPIONAGE_ESCAPE_COUNTERSPY_LEVEL_MODIFIER` -1 per level
  enter the roll, or is the pursuer only a label (the escape screen shows
  "Police and agent {1}" and no odds)? Which posts pursue: the post's own
  district, adjacent districts (the chooser text: "Protect {District} (and all
  adjacent districts)"), or the whole city?
- **Setup.** `lab4_t150`. Make the defender p local:
  `AutoplayManager.SetReturnAsPlayer(p)` plus one autoplay turn (UNVERIFIED for
  an AI seat; `lab.advance` refuses only -1). As p, buy a Spy
  (`CityCommandTypes.PURCHASE`), move it onto a district of its own city and
  start counterspy (`CanStartOperation` / `RequestOperation`); set level 1 or
  3 with `SetPromotion` (`spy_promote.lua`), no Surveillance. Switch back with
  `SetReturnAsPlayer(0)`. Verify the post (`GetOperationTypeName`, or
  `u:GetSpyOperation()` while p is local; both UNVERIFIED).
- **Procedure.** `spy_loop.py` + `spy_turn.lua` at the guarded district, an
  adjacent district, a non-adjacent one and an unguarded control city;
  endturn only. `unblock.lua` logs route, offered routes and pursuer.
- **Reads.** `GetPursuingSpyName()` at the prompt; `spy_history.lua`'s
  EscapeResult. Record `runs/escape_cs_<stamp>.log`, fitted by `escape_fit.py`.
- **Sample.** A level-3 post moves a recruit from 62.5% → 25.9% (wrong guess)
  and 16.2% → 1.9% (right guess); about 40 guarded escapes per arm is about
  4σ. About 1.5 h on two instances.
- **Fit.** The term in `spyEscape` / `_spy_escape`; adjacency in
  `counterspiesGuarding` / `_counterspies_guarding`.
- **Risks.** Spies must be bought, never created (a created spy crashes on
  capture); an unconditional `GetNextEscapingSpyID()` crashes the game.

### C-26-S1. Trajan's grant on a captured city
Attach `TRAIT_ADJUST_NON_CAPITAL_FREE_CHEAPEST_BUILDING` to seat 0 in
`lab4_t100` (`AttachModifierByID`, as `spy_loop` does) and record every
city's buildings (the attach itself is a test); capture three cities (two
without a Monument, one with) through `capture_setup` / `_war` / `_move` /
`_keep.lua`, and found one as a control. Read `HasBuilding` per row before
and after. Record `runs/trajan_<stamp>.jsonl`. About 40 min. Fit: call
`trajansColumn` / `_trajans_column` from `transferCity` and the GPU capture
path if the grant fires.

### C-38-S3. The purchase trigger by intervention
- **Unknown.** Builder buy: H1 "no Builder and bank ≥ price → buys next turn",
  H2 a per-turn chance of about 8%. Military buy: the army threshold (the
  data: 1.7% a rich turn at 0–1 units, 0.4% at 6–7, 0 of 348 at 8+) and the bank
  floor (always ≥ 95 seen).
- **Setup.** `lab4_t100`, 12 minors at peace with seat 0. In GameCore set the
  bank (`GetTreasury():SetGoldBalance(v)`, verified on majors, UNVERIFIED on a
  minor) at v ∈ {60, 110, 160, 300}; strip Builders or cut the army to
  k ∈ {0, 2, 4, 6, 8, 10} with `GetUnits():Destroy`, raise it with `Create`
  (one unit per tile).
- **Procedure.** `lab.py advance --n 5`, a reload per arm.
- **Reads.** `cs_watch.lua` each turn (with the prog fix).
- **Sample.** Builder arm: 24 minor-trials at v = 300 (H1 ≈ 24/24 within 2 turns,
  H2 ≈ 9/24 within 5). Military arm: 6 levels × 12 minors × 2 loads. About 12
  loads, 45 min.
- **Fit.** A purchase body in `minorPhase` / `_city_state_phase`. A threshold
  is BUILD; a rate becomes a per-episode randomised parameter (owner ruling).

### C-60-S3. A grant with no free tile
`lab4_t250`: Ngaruawahia (69,21) grants at t252 and t257, always on (69,20).
Fill its six ring-1 tiles with seat-0 units at war with p62 (the strongest
type `Create` accepts; `Map.GetAdjacentPlot`); variant B fills rings 1 and 2.
Advance with endturn (not autoplay); `unblock.lua` clears blockers. Read p62's
units by id and position and the blockers' health through t257. Two grants
per variant, each decisive; a blocker killed before the grant voids the
trial. Fit: H1 nearest free tile → `grantFreeCityUnit` / `_grant_free_unit`
search outward; H3 the centre → allow it; H2 none → nothing.

### C-60-S4. Bankruptcy over the turns of insolvency
- **Sourced already.** `GOLD_NEGATIVE_BALANCE_AMENITY_LOSS_LINE` 0,
  `_DISBAND_UNIT_LINE` -10, `_SUBSEQUENT_AMENITY_LOSS` -10,
  `_SUBSEQUENT_DISBAND_UNIT` -10 (Base GlobalParameters.xml 324–330); pedia
  GOLD_4: "-1 penalty to your Amenities per every 10 Gold you drop below 0 …
  at -10 Gold you will automatically disband a unit, at -20 two units".
- **Unknown.** Per city or empire-wide; whether 0 to -9 costs 1 or 0; whether
  the balance really goes negative (no `GetGoldBalance` below 0 in 35,000+
  rows); one disband per -10 each turn or once; which unit goes.
- **Setup.** `lab4_t100`, seat 0: `SetGoldBalance(0)`, then `Create` units on
  distinct tiles until net income (`GetGoldYield() − GetTotalMaintenance()`)
  is -5, -15 or -35 a turn; one arm per load.
- **Procedure.** endturn for 8–10 turns; reload between arms.
- **Reads.** Each turn `GetGoldBalance`, `GetGoldYield`, `GetTotalMaintenance`,
  every city's `GetAmenitiesLostFromBankruptcy`, amenities and need
  (`freecity_amenity.lua`, `ZALL=1`), unit ids and types,
  `NotificationManager.GetFirstEndTurnBlocking`. Record
  `runs/bankrupt_<stamp>.jsonl`.
- **Sample.** 3 arms × about 10 turns; the pedia's step every -10 of
  cumulative deficit separates the arms. About 40 min.
- **Fit.** Both engines run the AUDIT reading for every seat, the Free Cities
  seat's treasury included: `bankruptAmenities` / `_bankrupt_amenities` in the
  amenity composers, `bankruptDisband` / `_bankrupt_disband` after the upkeep
  (`phase.ts`, `_seat_upkeep_and_bankruptcy`). The reads confirm or replace
  its counts, its line at 0 and its victim order.

## 6. Instrument 5 — observer watches

### C-38-S1 + C-60-S2. The extended observer watch
- **Unknown, city-states.** The quest pool (8 kinds in `Quests.xml`, no
  weights): frequency by era and minor type, the gap to the next offer, the
  envoy reward. Unit tracks by id and what the units attack (the walker). What
  Builders improve. The research order.
- **Unknown, Free Cities.** The flip pair's rule (world era, the former
  owner's best melee, or the Free City's own techs); the 5-turn grant's type
  draw; the grants' fate when the city joins or falls (deleted or
  transferred); the Free Cities' upkeep and income; their walker and targets.
- **Setup.** All-AI observer games (`game.py new --config
  tools/civ6lab/obs_small.json`; a cfgD-style 12-major setting yields more
  revolts), GS, Online, Prince. GameCore `cs_watch.lua` plus an InGame reader
  (needs the `watch.py` fix). Nothing placed.
- **Procedure.** `watch.py --observer --turns 250`, three instances × 2 rounds.
- **Reads per turn, InGame.** Quests: for each major m, minor p and quest q,
  `Game.GetQuestsManager():HasActiveQuestFromPlayer(m, p, q.Index)` and
  `GetActiveQuestName` (CityStates.lua 255–275; UNVERIFIED for AI majors in an
  observer game). Units: `GetID()`, moves left, XP (`xp_read.lua`), Builders'
  `GetBuildCharges()`, foreign units within 3. Improvements: owner and
  `GetImprovementType` on plots within 5 of each minor. Research: `HasTech`
  diffs. The centre's `GetDefenseStrength` and production progress. Free
  Cities, per city: owner, `GetOriginalOwner`, loyalty, defence, walls,
  production, amenities and need, `GetAmenitiesLostFromBankruptcy`; every p62
  unit's id, type, position, damage, XP; p62's `GetGoldBalance`,
  `GetGoldYield`, `GetTotalMaintenance`; the world era; at a flip, the former
  owner's melee techs and best melee; when a city leaves p62, the new owner
  and every unit within 3 by owner and id the turn before and after (ids are
  per player: match by type and position). Records
  `runs/cs_watch2_<tag>_*.jsonl`.
- **Sample.** About 700 quest offers a game (six games pin 8 kinds to ±3
  points); about 100k id-tracked unit-turns; 25–30 new flips and about 100
  cadence grants. About 3.5 h.
- **Fit.** Quests: a weighted draw over the kinds in `issueQuest` /
  `_seat_quest_phase`, with the measured cooldown and reward. The walker: one
  model for minor and Free City units in `minorPhase` / `_city_state_phase`
  and `freeCitiesPhase` / `_free_cities_phase`. Builders: an improvement pick
  for minors (also unblocks B-24r). Research: confirm or replace
  `minorResearch` / `_minor_research`. Free Cities: the flip pair, the grant
  draw, the build queue, the treasury, the fate in `transferCity` /
  `_transfer_city`.

### C-38-S2 (era half). Later-era starts
Eight new games, one per `start_era` (the `game.py` config key), 12 minors
each, Prince; read at turns 1–2 every minor's centre strength and units by
type against `BonusMinorStartingUnits` (GS swaps Pikeman for Pike and Shot at
Industrial and Modern). Deterministic; about 1 h. The engines have no start
era, so the unit rows wait on one (a BLOCKER, not LAB); the centre strength
feeds C-38-S2's fit.

### C-74-S2. Event watch at Duel size
The engine's world is Duel (44×26); the tallies show the event rate and the
empty share depend on map size. `game.py new` with `MAPSIZE_DUEL`, Continents,
Online, Prince, realism 2, all AI; two instances (`--host 127.0.0.N`);
`watch.py --observer --turns 250 --tag duelN` with the C-74-S1 per-turn read
and `GameClimate.Get*PercentChance`. About 26 one-site events a game at a
factor of 0.25 pin the factor to ±15% and the empty share to ±3%. About 25 min.
Fit: the map factor in `randomEvent` / `_random_event`. Risks:
`AutoSaveFrequency 0` crashes the game (keep 50); autosaves collide across
instances.

## 7. Loose ends from SESSION2 with no AUDIT entry

These were on the previous scene list and have no AUDIT entry. Open work
lives in AUDIT alone, so each either gets an entry or is dropped.

- **The hills-plus-feature defence residual.** Plains Hills + Jungle reads an
  effective +5.93 where +6 is nominal; `plot_defence.lua` with a health sweep
  and a second stacked pair (hills + forest, hills + marsh) would tell a
  rounding of the sum from another stacking rule.
- **Two combat constants nobody has located.** `COMBAT_DAMAGE_MULTIPLIER_
  MINIMUM` 0.25 and `COMBAT_POWER_DAMPENER` 5: the 0.25 does not floor the
  unit-against-unit multiplier. A deterministic `SimulateAttackInto` sweep.
- **The anti-air support term's residual.** Eleven of thirteen rows fit
  `+5 × hp/100`; the 33 HP and 50 HP single-supporter rows read about 0.3 low.
- **The tribal-village draw** (one pop with no visible payout; magnitudes read
  at one era), **experience** (the engine applies the number it previews is
  inferred, not counted) and **the espionage roll's stream use**.

Already absorbed: the counterspy (C-16-S1), the reactor's rate (C-74-S1's
absolute-rate fit), the accident's building rows (C-1-S1), the Nuclear
Emergency reader (B-86-S0), the city-state spending watch (C-38, under the
2026-09-23 ruling). The envoy tile and the tile swap's reach were measured in
lab 4.
