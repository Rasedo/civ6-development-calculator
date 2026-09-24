# civ6lab — the real game as the oracle

The question ledger's DLL-side asks have no XML row and no readable source,
but the running game answers them if asked. Civilization VI opens a debug
socket (FireTuner, TCP 4318) when `EnableTuner 1` is set; `tuner.py` speaks
that protocol from Python, so a Lua snippet runs INSIDE the live game in any
of its Lua states and its `print()`s come back here. No mod, no GUI, no
screen-reading.

Three sessions have run against it. **The record is
`reports/lab2_report.md` and `reports/lab3_report.md`** — every table, every
draw, every retraction. This file is the working reference: the calls that
work, the calls that do not, the traps, and an index of what is here.

## One-time setup (done on this box 2026-09-13)

* Steam > Tools > *Sid Meier's Civilization VI SDK* installed (it is).
* `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VI\AppOptions.txt`
  — the LIVE user dir; `Desktop\My Games\...` is a 2019 fossil — has
  `EnableTuner 1` and `EnableDebugMenu 1` under `[Debug]`.
* FireTuner.exe must be CLOSED while the lab runs: the game accepts one client.

## No clicks: `game.py`

    python tools/civ6lab/game.py launch                         # the DX11 binary -> main menu
    python tools/civ6lab/game.py new --config tools/civ6lab/lab4.json
    python tools/civ6lab/game.py load <save name>              # Begin/Continue pressed by the game
    python tools/civ6lab/game.py save <save name>

Every click the owner used to make rides the game's OWN automation hooks
(Firaxis's smoke test, `Base/Assets/UI/Automation/Automation_DailySmokeTest.lua`):
`Automation.SetAutoStartEnabled(true)` makes the loading screen press Begin /
Continue itself (`FrontEnd/LoadScreen.lua`); a new game is `GameConfiguration` /
`MapConfiguration` written in the `FrontEnd` state and
`Network.HostGame(ServerType.SERVER_TYPE_NONE)`; a load matches the save
list's `Path` (its `Name` is not the file name) and calls `Network.LoadGame`.
Hash="1" setup parameters take `DB.MakeHash(name)` (speed, difficulty, map
size — verified by readback). The socket RESETS across a load or a host;
`game.py` reconnects and waits for `GameCore_Tuner`. Verified 2026-09-23:
new game, save, load, all with the input context reading `World` after.

Two box facts it needed:
* The Steam launch opens 2K's LaunchPad (a Play click); `game.py launch`
  starts `Base/Binaries/Win64Steam/CivilizationVI.exe` (DX11) directly —
  Steam must be running.
* The COPYRIGHT-SCREEN HANG (no Continue button, the engine stalled in its
  async init after FiraxisLive and EOS start) is the game waiting on its
  online services. Windows Firewall outbound BLOCK rules on both binaries
  ("Civ6 lab offline DX11" / "... DX12") cure it — with the firewall ON (it
  was off on this box, so the rules did nothing at first). `PlayIntroVideo 0`
  in AppOptions skips the intro.

## The lab profile, the startup patch, several instances

    python tools/civ6lab/game.py patch apply        # logos off, copyright delay 0, steam_appid.txt
    python tools/civ6lab/game.py profile apply      # the lean options (owner's files backed up)
    python tools/civ6lab/game.py --host 127.0.0.2 launch   # instance 2, tiled into the window grid
    python tools/civ6lab/game.py --host 127.0.0.2 bench --save lab4_t100 --turns 15
    python tools/civ6lab/game.py profile restore    # the owner's options back, byte for byte
    python tools/civ6lab/game.py patch revert

Measured 2026-09-23 (Ryzen 9 3900X, RTX 4070 SUPER, 32 GB; save lab4_t100,
15 Autoplay turns):

| setup | s/turn | GPU | RAM per game |
|---|---|---|---|
| lean graphics, VSync OFF, 2 s poll (DX12) | 5.56 | 44 %, 40 W | 3.5 GB |
| the same, 0.25 s poll | 2.67 | — | 3.3 GB |
| + VSync ON + `UIOnlyRendering 1` (no 3D world) | 2.87 | 20 %, 22 W | 3.4 GB |
| the same, window MINIMISED | 3.41 | 34 %, 31 W (worse) | 3.3 GB |
| TWO DX11 instances at once | 3.13 each (1.84x throughput) | 33 %, 21 W, 6 GB VRAM | 2.8 GB |

What each finding is:
* Graphics settings barely move turn time — the turn is the AI's. The poll
  interval was the tooling's own waste (`advance` polls every 0.25 s and
  unsticks only a turn stalled 5 s).
* VSync OFF lets the game render as fast as it can; ON caps it. A minimised
  window renders MORE, not less — keep the windows visible (`window.ps1 grid`).
* `AutoSaveFrequency 0` CRASHES the game (EXCEPTION_INT_DIVIDE_BY_ZERO at the
  first turn end) — the profile uses 50.
* DX11: `CivilizationVI.exe` started outside Steam exits with code 53 and
  Steam relaunches the game through ITS launch path (the DX12 build). A
  `steam_appid.txt` (289070) beside the binary makes it run as itself.
* SEVERAL INSTANCES: they run side by side once the app id file is in; the
  tuner listens on `-TunerIP <address>`:4318, so instance N is launched with
  `-TunerIP 127.0.0.N` (`game.py --host 127.0.0.N launch`) and every command
  takes the same `--host`. Without the flag a new instance takes 4318 from
  the old one. All instances share one user dir (options, logs, saves) —
  name saves per instance; autosaves collide.
* The startup patch touches the install (the two logo movies renamed
  `.lab-off`, IntroScreen.lua's ACCEPT_DELAY 0 with a `.lab-backup`) — a
  Steam file check or a game update undoes it; `patch apply` again.

## A session

1. Launch Civ 6, start or load any Gathering Storm game, reach the map.
2. `python tools/civ6lab/lab.py probe` — lists the Lua states and reads the
   turn, grid and majors from `GameCore_Tuner`. Green = the wire is up.
3. Run an experiment. Records go to `runs/` as JSONL plus a printed summary.

The game must have the box: never run a battery in the same window.

## The states that matter

| state | what lives there |
|---|---|
| `GameCore_Tuner` | authoritative state and every WRITE: `Players[]`, `Map`, `Game` (incl. the rng), `GameClimate`, `GameRandomEvents`, `AutoplayManager`, `WorldBuilder`, `ImprovementBuilder` |
| `InGame` | the UI's state and most READS: `UI.*`, `UnitManager.*`, `CityManager.*`, `CombatManager.*`, `Cities.*`, the city's Gold / CulturalIdentity / Citizens / Growth objects, notifications |
| `FrontEnd` | before a game starts: `GameConfiguration.*`, `PlayerConfigurations[]` |
| `TunerGameRandomEvents` | did NOT exist in sessions 2 and 3 — `lab.py storm` falls back to `GameRandomEvents` in GameCore |

The panel definitions in `<install>\Debug\*.ltp` are the API reference: each
names its state and shows working calls. The shipped UI under
`<install>\Base\Assets\UI` and `DLC\Expansion*\UI` is the second reference,
and twice it was the only one that had the right call shape.

---

# The calls that work, by state

## `GameCore_Tuner` — writes

| call | note |
|---|---|
| `Players[p]:GetUnits():Create(GameInfo.Units["UNIT_X"].Index, x, y)` / `:Destroy(u)` / `:FindID(id)` | a **Bomber** can only be created on a tile its owner has a CITY on; a Settler lands on any remote land plot, so a forward base can be founded |
| `u:SetDamage(v)` / `u:GetMaxDamage()` | wounds; full damage does **not** remove the unit — `Destroy` does |
| `u:GetReligion():SetReligionType("RELIGION_CATHOLICISM")` | a **string**, per `Debug/Unit.ltp`; the getter is GameCore too |
| `city:ChangeLoyalty(n)`, `city:ChangePopulation(n)` | loyalty moves the STOCK, not the pressure — it cannot force a revolt |
| `city:GetDistricts():GetDistrictByType(idx)` / `GetDistrictByIndex` / `GetNumDistricts` / `SetDistrictPillaged` / `RemoveDistrict` | no `Members()` here |
| `d:SetDamage(DefenseTypes.DISTRICT_GARRISON` \| `DISTRICT_OUTER, v)` / `d:GetMaxDamage(...)` | the setter bites only in GameCore |
| `city:GetBuildQueue():CreateDistrict(idx, plotIndex)` / `CreateBuilding` / `CreateIncompleteDistrict` / `CreateIncompleteBuilding` / `AddProgress` / `FinishProgress` / `RemoveBuilding` / `RemoveDistrict` | **the placement API** — whole districts and buildings from the socket, on an AI's city too. ONE SHOT PER PLOT (see the traps) |
| `WorldBuilder.CityManager():CreateDistrict(city, "DISTRICT_X", 100, plotIndex)` / `CreateBuilding(...)` / `SetCityValue(city, "Population", n)`; `WorldBuilder.PlayerManager()` | the WorldBuilder route reports its prerequisites in a status table (`NeededBuilding` / `NeededDistrict` as indices) and refused the district itself; `SetCityValue` lifts the population gate on district count |
| `Players[0]:GetDiplomacy():DeclareWarOn(p, WarTypes.SURPRISE_WAR, true)`, `:SetHasDeclaredFriendship(...)` | `DeclareWarOn(p)` alone returns ok and leaves `IsAtWarWith` false |
| `Players[p]:GetInfluence():ChangeTokensToGive(n)` / `:GetTokensToGive()` | GameCore only |
| `Players[p]:GetTreasury():SetGoldBalance(v)`, `:GetReligion():ChangeFaithBalance(v)`, `:GetTechs():SetTech(i, true)`, `:GetCulture():SetCivic(i, true)` | all 77 techs grant in one loop |
| `Players[p]:GetWMDs():ChangeWeaponCount(idx, n)` / `:GetWeaponCount(idx)` / `:CanDeployWMD(...)` | `GetWeaponCount` is the only honest "has the strike landed yet" test |
| `Game.GetRandNum(range, "reason")`, `Game.GetRandomSeed()`, `Game.SetRandomSeed(s)` | **GameCore only** — none of the three exists on the InGame `Game`. This is the seed-accounting instrument |
| `Game.GetFalloutManager():GetFalloutTurnsRemaining(i)` / `:SetFalloutTurnsRemaining(i, n)` / `:HasFallout(i)` / `:GetReactorCount()` / `:GetReactorByIndex(i)` | `GetReactorByIndex` hands back `{Age, CityID, LastAccidentTurn, Owner, PlotIndex}` and works in either state. **`SetFalloutTurnsRemaining` contaminates a plot with no blast at all** — the way to measure fallout with nothing pillaged |
| `GameRandomEvents.ApplyEvent{ EventType = def.Index, Location = plotIndex }` | fires a named event on purpose; it **ignores** an event's own age/eligibility gates |
| `ImprovementBuilder.SetImprovementType(plot, GameInfo.Improvements["IMPROVEMENT_GOODY_HUT"].Index, -1)` | plants a tribal village (or a Missile Silo) |
| `GameClimate.GetFloodPercentChance()` / `GetStormPercentChance` / `GetDroughtPercentChance` / `GetEruptionPercentChance` / `GetFirePercentChance` | the REALISED per-turn chance for this map; reads 0 on turn 1 and populates after the first turn is processed |

## `InGame` — reads, operations and commands

| call | note |
|---|---|
| `city:GetGold():GetPurchaseCost(GameInfo.Yields["YIELD_GOLD"].Index, row.Hash [, MilitaryFormationTypes.STANDARD_MILITARY_FORMATION])` | buildings and districts take no formation argument |
| `city:GetBuildQueue():GetUnitCost` / `GetBuildingCost` / `GetDistrictCost` / `GetUnitProgress` | the city's SPEED-SCALED cost, which is what the purchase price is built from |
| `city:GetReligion():GetReligionsInCity()` (`.Religion .Followers .Pressure`, `-1` = the unconverted) / `:GetMajorityReligion()`; `Players[p]:GetReligion():GetReligionInMajorityOfCities()` / `:GetReligionTypeCreated()` | |
| `city:GetCulturalIdentity():GetLoyalty()` / `GetMaxLoyalty()` / `GetLoyaltyPerTurn()` / `GetLoyaltyLevel()` | |
| `city:GetGrowth():GetAmenities()` / `GetAmenitiesNeeded()` / `GetHappiness()` / `GetTurnsUntilGrowth()` / `GetTurnsUntilStarvation()` | happiness is a `GameInfo.Happinesses` index: 0 REVOLT, 1 UNREST, 2 UNHAPPY, 3 DISPLEASED, 4 CONTENT, 5 HAPPY, 6 ECSTATIC |
| **`city:GetCitizens():IsPlotWorked(x, y)`** | the per-CITY worked-tile reader — the one that decides the nuclear population rule. The object carries only this, `IsFavoredYield` and `IsDisfavoredYield`; **no specialist count exists on either side**, so idle = `pop - (worked tiles - 1)` |
| **`city:GetBuildings():IsPillaged(row.Hash)`** | the WONDER/building pillage reader. `district:IsPillaged()` on a wonder tile always answers false |
| `city:GetDistricts():Members()`, `d:GetDefenseStrength()`, `d:GetDamage(DefenseTypes.X)`, `d:GetMaxDamage(DefenseTypes.X)`, `district:IsPillaged()` | |
| `Cities.GetCityInPlot(x, y)`, `Cities.GetPlotPurchaseCity(plot)`, `CityManager.GetCityAt(x, y)` | `GetPlotPurchaseCity` is the city a silo launch must be requested through |
| `UnitManager.RequestOperation(u, hash, params)` / `CanStartOperation` / `GetOperationTargets` / `RequestCommand(u, UnitCommandTypes.DELETE)` / `GetResultProbability(op.Index, spy, plot)` | see the operations table below |
| `CityManager.RequestCommand(city, CityCommandTypes.PURCHASE` \| `DESTROY` \| `WMD_STRIKE, params)` / `CanStartCommand` / `GetCommandTargets` | |
| `UI.RequestPlayerOperation(0, PlayerOperations.GIVE_INFLUENCE_TOKEN, {[PlayerOperations.PARAM_PLAYER_ONE]=id})` | one envoy per call |
| **`CombatManager.SimulateAttackInto(unit:GetComponentID(), CombatTypes.AIR, x, y)`** | the UI's own preview: ATTACKER / DEFENDER / **ANTI_AIR** / **INTERCEPTOR** blocks keyed by `CombatResultParameters` hashes, giving the chosen interceptor's ID and tile, its base anti-air strength, the support bonus as TEXT and `DAMAGE_FROM`. **Deterministic** — seven seeds give byte-identical output — so the whole damage curve can be swept without firing. `SimulateAttackVersus(att, def [, CombatTypes.X])` is the same shape for a normal attack and refuses pairings that are not a legal attack |
| `Game.GetFalloutManager():GetReactorAge(pCity)` / `:GetReactorAccidentThreshold(pCity)` | **InGame only, and they take a CITY object** — not an index, a plot or the reactor record (`ToolTipLoader_Expansion2.lua:172`) |
| `Network.SaveGame{Name=, Location=SaveLocations.LOCAL_STORAGE, Type=SaveTypes.SINGLE_PLAYER, IsAutosave=false, IsQuicksave=false}` / `Network.LoadGame(...)` | saves land in `Documents\My Games\Sid Meier's Civilization VI\Saves\Single\`. **A LOAD COSTS THE OWNER A CLICK** — the call returns true, the game loads and then stops on a Start Game button unless `Automation.SetAutoStartEnabled(true)` was called first — `game.py load` does, and needs no click |
| `GameRandomEvents.GetEventsForTurn(t)` | one record per turn: `{RandomEvent, Name, StartTurn, EndTurn, CurrentLocation, PopLost, UnitsLost, TilesDamaged, FertilityAdded, Volcano, River}` — walking every turn is a complete event history |
| `Game.GetEmergencyManager():GetEmergencyInfoTable(0)` | empty after 21 warheads |
| `NotificationManager.GetFirstEndTurnBlocking(me)` | names the blocker when autoplay stalls |
| `DealManager.GetWorkingDeal` / `GetPossibleDealItems` / `EditWorkingDeal` / `SendWorkingDeal` | reachable — the deal SCREEN was never the blocker on C-2 |

## `FrontEnd` — before the game starts

`GameConfiguration.SetTurnLimitType(TurnLimitTypes.NONE)` / `SetMaxTurns` /
`SetStartEra` / `SetGameSpeedType` / `SetValue` / `RegenerateSeeds`, and
`PlayerConfigurations[i]:GetSlotStatus()` (`SS_OPEN` / `COMPUTER` / `CLOSED` /
`TAKEN` / `OBSERVER`). The turn limit is an engine option the setup UI never
exposes — `SetTurnLimitType` appears only in `Base/Assets/UI/Automation/*` —
so the socket can set `NONE` before Start and `Game.GetMaxGameTurns()` then
reads 0 instead of 250.

## The operations and commands that had to be got right

| what | the call that works |
|---|---|
| attack-move onto a city | `UnitManager.RequestOperation(u, UnitOperationTypes.MOVE_TO, {PARAM_X, PARAM_Y, PARAM_MODIFIERS = UnitOperationMoveModifiers.ATTACK + UnitOperationMoveModifiers.MOVE_IGNORE_UNEXPLORED_DESTINATION})` — without `PARAM_MODIFIERS` the request is accepted and the unit never moves |
| answer the Keep/Raze prompt | `CityManager.RequestCommand(CityManager.GetCityAt(cx, cy), CityCommandTypes.DESTROY, {[UnitOperationTypes.PARAM_FLAGS] = CityDestroyDirectives.KEEP})`. `CityDestroyDirectives`: LIBERATE_FOUNDER 0, LIBERATE_PREVIOUS_OWNER 1, KEEP 2, RAZE 3, REJECT 4. Between the two steps the city is half-captured — `GetOwner` reads the new owner while `GetDefenseStrength` throws |
| a nuclear strike from a unit | `UnitManager.RequestOperation(u, UnitOperationTypes.WMD_STRIKE, {PARAM_X, PARAM_Y, PARAM_WMD_TYPE = GameInfo.WMDs["WMD_THERMONUCLEAR_DEVICE"].Index})` |
| a nuclear strike from a MISSILE SILO | `CityManager.RequestCommand(Cities.GetPlotPurchaseCity(siloPlot), CityCommandTypes.WMD_STRIKE, {PARAM_X0 = siloX, PARAM_Y0 = siloY, PARAM_X1 = targetX, PARAM_Y1 = targetY, PARAM_WMD_TYPE = eWMD})` — **four** plot parameters (`WorldInput.lua:ICBMStrike`, `CityBannerManager.lua:UpdateWMDBanner`). `PARAM_X`/`PARAM_Y` is the UNIT vocabulary and is refused |
| spread religion | `UnitManager.RequestOperation(u, GameInfo.UnitOperations["UNITOPERATION_SPREAD_RELIGION"].Hash, {PARAM_X, PARAM_Y})` — the enum table does not carry the row |
| found a city | `UnitManager.RequestOperation(settler, UnitOperationTypes.FOUND_CITY, ...)`; `CanStartOperation(settler, FOUND_CITY, nil, {PARAM_X, PARAM_Y})` is the only working site test |
| a spy's destinations | `UnitManager.GetOperationTargets(spy, UnitOperationTypes.SPY_TRAVEL_NEW_CITY)` — one key (1933683541) holding a flat list of **plot indices**, not city ids |
| counterspy duty | `UnitManager.CanStartOperation(spy, op.Hash, nil, true)` answers true where a `{PARAM_X, PARAM_Y}` table answers false; the request then takes an empty table. Its `CategoryInUI` is `MOVE`, not `DEFENSIVESPY` |
| buy a unit in a city | `CityManager.RequestCommand(city, CityCommandTypes.PURCHASE, ...)` — the unit lands with 0 moves and its operation targets are empty until the next turn |

---

# The calls that FAILED, and how

Nobody should type these again.

| call | state | failure |
|---|---|---|
| `city:GetGold()` | GameCore | `function expected instead of nil` — the Gold object is InGame only |
| `Players[p]:GetUnits():Create` | InGame | nil — creation is GameCore only |
| `UnitManager.*` / `CanStartOperation` | GameCore | nil — the operation API is InGame only |
| `city:GetCulturalIdentity()` | GameCore | nil |
| `city:GetDistricts():Members()` | GameCore | nil — use `GetDistrictByType` |
| `d:SetDamage(...)` | InGame | accepted silently, **pool unchanged** |
| `Players[0]:GetDiplomacy():SetAtWarWith(p, true)` | both | nil — a Civ5 spelling left in `Debug/Player.ltp` |
| `Players[p]:GetInfluence():ChangeTokensToGive(n)` | InGame | nil — GameCore only |
| `u:GetReligion():GetReligionType()` | InGame | nil — GameCore only |
| `UnitOperationTypes.SPREAD_RELIGION` / `.FOUND_RELIGION` | both | **nil** — the enum table does not carry them; use the DB hash (1592408602) |
| `Players[0]:GetUnits():Create(UNIT_TANK, ...)` | GameCore | returned nil with no error; UNIT_SWORDSMAN on the same tile succeeded |
| `MOVE_TO` without `PARAM_MODIFIERS` | InGame | accepted, `CanStartOperation` true, **the unit never moves** (`GetMoveToPath` routes 23 plots AROUND an adjacent hostile centre) |
| `Players[p]:GetCulture():SetCivic(idx, true)` | GameCore | works, but `HasCivic` reads false until the NEXT tuner call |
| `rawget`, `load`, `_G`, `_ENV`, `getfenv` | both | **all nil** inside the tuner's wrapped chunk — walk a metatable with `mt["__index"]` inside a `pcall`, and probe a global by naming it literally |
| `Game.GetFalloutManager():GetFalloutPreventsWork(i)` | both | returns **true for every plot**, clean ones included. Not a per-plot reader, and the behaviour it promises does not happen |
| `GetReactorAge` / `GetReactorAccidentThreshold` | GameCore | absent — eight argument shapes tried before the UI was read; they are InGame and take a CITY |
| `CanStartOperation(WMD_STRIKE)` with the bomber ON the aim plot | InGame | `can=false`, silently — a bomber cannot nuke the tile it stands on |
| `plot:IsValidFoundLocation()` | both | **false for every plot on the map**, including one a city was then founded on. Not a usable site reader |
| `CityManager.RequestCommand(city, CityCommandTypes.MANAGE, {PARAM_MANAGE_CITIZEN, PARAM_X, PARAM_Y})` | InGame | `CanStartCommand` true, request returns ok, **no citizen moves**; `GetCommandTargets` comes back empty. There is no citizen-assignment path from the socket — build the layout out of what a city OWNS |
| `UI.RequestPlayerOperation(me, PlayerOperations.COMMEMORATE, {PARAM_COMMEMORATION_TYPE = hash})` | InGame | does not clear `ENDTURN_BLOCKING_COMMEMORATION_AVAILABLE` because the parameter is the row's INDEX, not its Hash (`DedicationPopup.lua` OnConfirm passes `commemorationInfo.Index`, from `GetPlayerCommemorateChoices`). `commemorate.lua` passes the index, once per allowed Dedication, and `lab.py advance` runs it when the turn stalls on that blocker |
| `Game.TriggerWMDAttack` / `Game.TriggerWMDStrike` / a `WMDManager` global | both | **nil** — a script circulating online that uses them is fabricated |
| `CityCommandTypes.WMD_STRIKE` with `PARAM_X`/`PARAM_Y` | InGame | refused — the silo takes `PARAM_X0/Y0/X1/Y1` |
| `city:GetBuildings():IsPillaged(hash)` for a building made by `CreateBuilding` | InGame | **throws** until the game has pillaged it once |
| `Players[p]:GetEras()` | both | only `GetEra` / `SetEra` / `SetStartingEra` — the available-dedication list is not exposed |
| `UI.RequestAction(ACTION_ENDTURN, {REASON="UserForced"})`, an unconditional `GetNextEscapingSpyID()` | InGame | **crash** (dumps 7C1DF660, B31A4D66) |
| `SET_ESCAPE_ROUTE` for a socket-spawned spy whose roll ends CAPTURED or KILLED | InGame | **EXCEPTION_ACCESS_VIOLATION at 0xb0** — spawned spies lack whatever the capture path dereferences. Train and travel real spies |
| `city:ChangeLoyalty(-10)` as a way to make a Free City | GameCore | moves the STOCK; pressure stays positive and the city recovers next turn. A CAPTURE is the route |
| `UnitManager.RequestOperation(u, RANGE_ATTACK)` for a unit created this turn | InGame | target list empty even for a visible enemy one tile away; a melee `MOVE_TO` onto an enemy resolves only at turn processing |

---

# The generator

`Game.GetRandNum(range, "reason")`, `Game.GetRandomSeed()` and
`Game.SetRandomSeed(s)` (GameCore) identify it exactly. The same seed twice
gives the same stream: no hidden entropy, no per-call reseed, and **it is not
save-specific** (seed 12345 reproduced the same 24 draws in a different game,
map, era and ruleset).

    state' = (1103515245 * state + 12345) mod 2^32      -- the ANSI/glibc LCG, signed int32
    r16    = range mod 65536                            -- the range argument is TRUNCATED to 16 bits
    if r16 == 0:  return 0 and DO NOT advance the state
    draw   = ((state' >> 17) * r16) >> 15               -- top 15 bits, scaled (not modulo)

Confirmed on 8 seed→seed pairs, 18 (range, draw) pairs spanning the 2^15 and
2^16 boundaries, and a 24-draw stream reproduced exactly.

* multiply-and-shift, so **no modulo bias** — but only 32768 distinct values,
  and above range 32768 some outcomes are unreachable;
* **the range is truncated to 16 bits**: `GetRandNum(100000)` really draws in
  [0, 34464), `GetRandNum(1000000)` in [0, 16960), and any multiple of 65536
  returns 0 without advancing the state;
* **seed accounting**: set a seed, act, read the seed back, step the LCG — that
  gives how many draws an action consumed and what each one was. It works for
  anything that resolves INSIDE the call (combat, a tribal village, an
  interception) and fails cleanly for anything that resolves on a later turn
  (an espionage mission consumes 0 draws when requested).

---

# The traps

Each one produced a confident wrong number or cost a session.

* **`CreateDistrict` twice on one plot took the game's tuner down** — one shot
  per plot, and check `HasDistrict` before calling it again.
* **`--set TOKEN=VALUE` is a bare substring replace**: a token `REL` rewrote the
  `REL` inside `UNITOPERATION_SPREAD_RELIGION`; `CX` rewrote `local CX`. Use
  `Z`-prefixed tokens and never declare a local of that name.
* **Operations resolve on the GAME's clock**, not inside the calling command —
  roughly one WMD every few seconds. Poll `GetWMDs():GetWeaponCount(k)`: one
  warhead leaves the stock per strike that executes. **Never poll population
  as a landing test** — it produced three false "no loss" rows in a row.
* **A requested `WMD_STRIKE` does not spend the bomber's moves until it
  executes**, so a "first bomber with moves" rule hands the same unit to every
  call in a batch and only one strike of four lands. One bomber per strike.
* **A plausible getter on the WRONG OBJECT answers cleanly.**
  `district:IsPillaged()` on a wonder tile, `plot:GetWorkerCount()` for a city's
  citizens, `plot:IsValidFoundLocation()` for a site: tidy numbers, no error, no
  nil, all answering a different question. **When a measurement contradicts a
  published account of the same mechanic, re-derive the reader before rejecting
  the account** — and when a reading agrees with the account only for objects of
  one shape, vary the shape before believing it.
* **The tuner listener needs a fresh game launch after a crash**: the process
  stays alive and responding while 127.0.0.1:4318 answers nothing, and only the
  owner can bring it back.
* **Both player slots AI = `localPlayer` −1 = no toolkit.** Check
  `PlayerConfigurations[i]:GetSlotStatus()` before Start.
* **`SetTurnLimitType NONE` is socket-only** — the setup UI never exposes it.
* **One military unit per tile before an autoplay turn** — two spawned on one
  tile hang the AI turn forever.
* **`SetReturnAsPlayer` must never see −1** — `lab.py advance` refuses it; a
  return player of −1 parks the game with no local player and only loading an
  autosave recovers it.
* **The aim plot must be REVEALED** or a strike is refused with no error text
  (a revealed city is not enough). Spawning any unit within sight reveals it.
  A silo fires at any revealed plot in range — current visibility is not
  required — and **a warhead cannot be aimed within its own blast radius of the
  silo that fires it**.
* **Never set a population before measuring one.** An inflated city is not
  supported by its own housing and food and snaps down for reasons that are not
  the experiment.
* **Spawn the whole rig before the first measurement.** A friendly unit added
  next to the defender changes the attacker's support bonus, so the strength
  difference moves under the reading. Heal the defender to full between shots
  for the same reason.
* **A fitted constant does not travel**: the combat base of 28.6 measured in one
  game predicted 23 in another where the answer was 32. Only the SHAPE transfers.
* **Bombers based in a city that is then struck are destroyed** (`x=-9999`).
* **A spent submarine still occupies its tile**, so `Create` returns nil and a
  battery reads the failure as a refused launch. Clear the previous one first.
* **The ANTI_AIR and INTERCEPTOR preview blocks return garbage (592, 24211)
  when no such unit exists** — gate on the block's `ID`, never on its strength.
* **Only the FIRST random event of a turn is logged** — a forced second event
  still applies, so the event log is not ground truth for what happened.
* **Autoplay plays YOUR units too** (a spy left in a city came back with a Gain
  Sources boost running). Spawn fresh actors, or read before advancing turns.
* **Refusal texts arrive in the game's locale** — decode `FAILURE_REASONS`
  bytes as cp1251 on this box.
* **`Network.LoadGame` costs the owner's click** (above). A run that needs N
  reloads needs the owner present for N clicks; never plan an unattended loop.
* **`sleep`, shell heredocs and `python -` are banned here.** A stray `python -`
  at the head of a compound command burned a core for 169 minutes: whenever the
  harness reports a command as backgrounded, check for orphans with
  `tasklist | grep python`. Write the script to a file and run the file.

---

# What the sessions measured

One line each; the detail and the evidence are in `reports/`.

| mechanic | the measured rule | where |
|---|---|---|
| combat damage | `damage = round((24 + GetRandNum(12)) * 1.04^(S_att - S_def))`, capped at 100, floored at 1. The community's `30 * e^(0.04Δ)` is **refuted** (wrong at 5 of 11 swept deltas under floor, round and ceil) | lab3 part six |
| the combat roll | ONE draw per attack, uniform over 12 values; the published 80%–120% multiplier is confirmed at both endpoints | lab3 parts four, five |
| combat strength | keep it a FLOAT: every catalog value and shipped modifier is an integer, but health-scaled support terms are fractional and only the DISPLAY floors them (three 50 HP supporters print +2, +5, +7) | lab3 part six |
| nuclear population loss | `killed = citizens working tiles inside the blast, centre excluded`; **if `killed >= pop` the strike kills nobody** (skip whole, not clamp); it lands on the strike tick. 15 strikes, 15 exact predictions | lab3 part one |
| nuclear blast | units die 100% inside the radius and 0% outside, deterministic, no partial damage; everything inside is PILLAGED and nothing destroyed — except an **unfinished district, which is removed**; the footprint is centred on the AIM plot; fallout 20 turns thermonuclear / 10 nuclear | lab2 scene D, lab3 part one |
| nuclear interception | any unit with `AntiAirCombat > 0` adjacent to the AIM plot, of any class or domain, any seat but the launcher; the strongest fires and the others add `+5 * hp/100` each; the warhead is spent either way and an intercepted strike declares no war | lab3 parts two, six, eight |
| interception, bomber channel | an anti-air ATTACK on the bomber at the same damage law, `S_def` = the delivering unit's own `Combat`; **cancelled iff damage > 50** (exactly 50 lands) | lab3 parts two, eight |
| interception, ICBM channels | the SAME roll, but the launcher is never attacked: `D = 75 - (aim plot terrain + feature DefenseModifier)` for a missile silo, `D = 80 - (same)` for a nuclear submarine. Rough ground makes a nuke EASIER to shoot down; launch distance does nothing | lab3 part eight |
| fallout | exactly **50 damage per turn**, cumulative, to units that end their turn in it — and nothing else: yields unchanged, citizens neither killed nor moved, the food box untouched | lab3 part two |
| random events | **at most ONE event per turn** (79 of 175 turns carried one); `OccurrencesPerGame` is a WEIGHT into a per-turn draw over the currently ELIGIBLE events, not an expected count. The engines roll each family independently — a structural fork | lab3 part three |
| reactor accidents | age +1/turn while the plant stands; `threshold = |{severities with age >= MinTurnAtRisk}|` over 10/20/30. Payloads: 2 / 10 / 20 turns of fallout on the reactor's OWN tile and nowhere else, −1 population and the Industrial Zone pillaged at severity 2 only, the plant never removed. Zero fired by the game in ~150 reactor-turns (95% bound < 2% per reactor-turn) | lab3 part three |
| experience | **never drawn** — flat constants, per-combat cap 8 (Base ships 10, Expansion2 overrides), attacker 4 / defender 6 / 8 when lethal, invariant across seven seeds and six attacker strengths. `EXPERIENCE_KILL_BONUS` is an outcome term, so the realised XP still depends on the roll | lab3 part seven |
| espionage | one **3d6** roll against `BaseProbability - 2` for a fresh spy; the six bands come back as truncated 1/256 fixed point. The roll happens at the COMPLETION turn, so seed accounting cannot isolate it | lab3 part five, session 1 |
| the counterspy term | **absent from `GetResultProbability`** — byte-identical odds with and without a counterspy assigned, like district, pillage and garrison. Whether it enters the actual roll is unsettled and has no reader | lab3 part three |
| tribal villages | draw 1 picks the category as `floor(6u)` over the six XML rows; draw 2 picks the subtype by cumulative weight (15 LARGE / 30 MEDIUM / 55 SMALL); a simple payout costs exactly 2 draws, a unit reward 3. Two pre-registered seeds paid the predicted +10 faith | lab3 part five |
| majority religion | argmax of FOLLOWERS over all groups **including the unconverted**, ties broken by that group's total PRESSURE, and the winner must satisfy `2 * followers >= population`; the unconverted winning means no majority. Civ-wide needs **strictly more than half** the player's cities. An Apostle spread adds +220 of its own and multiplies every other religion's pressure by 0.75 | lab2 scene E |
| purchase price | `price = floor(mult * C / 5) * 5` with mult 4 gold / 2 faith, `C` = the CITY's speed-scaled production cost (units and districts use the truncated integer, buildings the fractional one). **Progress does not reduce it.** 302 of 302 rows | lab2 scene G |
| envoys and tiles | **+1 owned tile per envoy**, no cap through 16, slope unchanged by suzerainty (`CanAnnexTilesWithReceivedInfluence`) | lab2, C-80 rule 2 |
| a capture | the Encampment's garrison pool rides through byte for byte; the centre comes up at exactly half its maximum; **both outer pools read 0/0 because the WALLS are destroyed**, not because the capture touched them; an incomplete district vanishes; population −25%; the city ID is re-keyed | lab2 scene C |
| a Free City | a captured city revolts on the THIRD turn after the capture (loyalty −20/turn); defence a flat 72; two Man-At-Arms on the flip turn and a third unit five turns later, all GRANTS — it builds buildings and trains nothing; it attacks what stands beside it; amenities 0–2 against a need of 5; its own loyalty resets to 100 and falls again; **not spy ground** — a Free City is absent from `SPY_TRAVEL_NEW_CITY` | lab2 scene B |
| the research agreement | **it does not exist in Gathering Storm** — `<Delete Type="DIPLOACTION_RESEARCH_AGREEMENT"/>` in Expansion1_Alliances.xml, re-shipped by Expansion2, and absent from the live DB. Alliances replaced it at `DIPLOMACY_ALLIANCE_TIME_LIMIT` 30; the beaker parameter is dead | lab3 part two |
| the Pop Star | gold at **25%** of the concert's tourism — `ROCKBAND_POP` writes `Amount = -75` on an additional-yield modifier, i.e. a percentage adjustment away from 100 | lab3 part three |
| the nuclear reactor's name | in Gathering Storm it is **`BUILDING_POWER_PLANT`** (`NuclearReactor="true"`); there is no `BUILDING_NUCLEAR_POWER_PLANT` row | lab3 parts two, three |
| disaster chances | `GameClimate.Get*PercentChance()` reports the REALISED chance for this map (eruption 0 with no volcano), so it is weight × eligible targets and cannot be carried between maps | lab3 part five |

## The retractions — carry the corrected fact, never the first one

| first claim | corrected |
|---|---|
| "the wonder is never pillaged, even at ground zero" | **wonders ARE pillaged** — read `city:GetBuildings():IsPillaged(hash)`, not `district:IsPillaged()` |
| "the wiki is wrong: citizens working the blast are not killed" | **the wiki is right** — the three cities that kept everyone were cities whose EVERY citizen was inside the blast, which is the gate clause |
| "the loss tracks the number of districts in the blast (≥3 → gutted)" | a coincidence of which cities work tiles at distance 3; the rule is the worked-tile count |
| "interception has no roll" | it is the ordinary combat roll; a weakened interceptor leaks everything (20 launches, 20 detonations at a 1 HP gun) |
| "naval anti-air is defensive, it gives no area cover" | Destroyer, Battleship, Missile Cruiser and Minas Geraes all cover an adjacent aim plot, land or water. The earlier negative was a bad scene |
| "no Missile Cruiser exists in this install" | it exists at `AntiAirCombat` 110 — the AIR-domain unit list was searched, which contains no ships |
| "a missile silo launch is unreachable from the socket" | the parameter list was wrong: `PARAM_X0/Y0` + `PARAM_X1/Y1`, 143 targets offered |
| "silo and submarine launches are stopped outright" | they obey the damage law with a fixed warhead defence (75 / 80 minus the aim tile's modifier) |
| "`Network.LoadGame` needs no human click" | it does — the owner was clicking Start each time |
| "a forward base cannot be founded" | it can; `IsValidFoundLocation` is the broken reader |

---

# The index

## Probes by scene (`*.lua`)

| scene | probes |
|---|---|
| purchase price | `purchase_scan.lua`, `purchase_verify.lua` |
| religion | `religion_snap/push/spread/read/player.lua`, `apostle_clear.lua` |
| envoys | `envoy_probe.lua`, `envoy_step.lua` |
| capture and the Free City | `capture_setup/war/move/keep.lua`, `city_probe.lua`, `district_survey.lua`, `district_damage.lua`, `buy_unit.lua`, `declare_war.lua`, `free_pair.lua`, `state_snap.lua` |
| the blast | `nuke_setup/snap/strike/one.lua`, `nuke_wave_setup/read.lua`, `nuke_pass_setup/plan/strike/read.lua`, `nuke_natural_setup/read.lua`, `blast_setup/check/content/pops.lua`, `city_wmd.lua`, `wmd_table.lua`, `wmd_targets.lua`, `wonder_check.lua`, `citizens_before.lua`, `wiki_check.lua` |
| the population rule | `pop_survey.lua` (every city, cheap to poll), `pop_scan.lua --set ZR=<r>` (workers in/out of the radius, the table of 15 strikes), `pop_rich.lua` (one city in full, plot by plot), `pop_setup.lua`/`pop_setup2.lua` (warheads + bombers), `pop_queue.lua` (**the landing test**), `pop_range.lua`, `pop_found/foundcity/foundscan/sitescan.lua`, `pop_inflate.lua`, `pop_block/unblock.lua`, `pop_manage.lua`, `pop_manage_targets.lua`, `pop_wars.lua` |
| interception | `intercept_stack.lua` (rebuild the scene), `intercept_bomber.lua`, `intercept_outcome.lua`, `intercept_reset.lua`, `nuke_intercept_setup/read.lua`, `aa_block/cover/strength/units/weaken.lua`, `antiair_census.lua`, `air_census.lua`, `aim_neighbours.lua`, `clear_aim.lua`, `range_targets.lua`, `plot_defence.lua`, `reveal_check.lua` |
| silo and submarine | `build_silo.lua`, `silo_launch.lua`, `sub_launch.lua`, `sub_fire.lua`, `dist_aims.lua` |
| the reactor | `reactor_build*.lua`, `reactor_scene.lua`, `reactor_watch.lua`, `reactor_city_watch.lua`, `reactor_threshold.lua`, `reactor_accident.lua`, `reactor_pillage.lua`, `build_district.lua`, `accident_freq_probe.lua`, `accident_law_probe.lua`, `accident_rate_fit.lua`, `realism_probe.lua`, `event_history.lua`, `event_log_probe.lua`, `emergency_read.lua`, `era_probe.lua`, `commemorate.lua` |
| the generator | `rng_seed.lua`, `rng_stream.lua`, `rng_fold2.lua`, `rng_surface.lua`, `rng_transition.lua` |
| combat and fractional strength | `combat_roll_setup/shot/read/fleet.lua`, `combat_sim*.lua`, `frac_sim.lua`, `frac_read.lua`, `frac_pop.lua`, `frac_versus.lua`, `frac_versus_read.lua`, `set_unit_damage.lua` |
| experience | `xp_read.lua`, `xp_scene.lua`, `xp_spawn.lua`, `xp_attack.lua`, `xp_melee.lua`, `xp_census.lua`, `xp2_probe.lua` |
| espionage | `spy_probe.lua`, `spy_promote.lua`, `spy_start.lua`, `spy_history.lua`, `spy_targets.lua`, `spy_census.lua`, `spy_mission.lua`, `spy_odds.lua`, `counterspy_setup.lua`, `counterspy_arm.lua` |
| tribal villages | `goody_setup.lua`, `goody_pop.lua`, `goody_read.lua` |
| fallout | `fallout_scan.lua`, `fallout_read.lua`, `fallout_scene.lua`, `fallout_yield.lua`, `launch_fallout_state.lua` |
| the front end | `setup_probe.lua`, `setup_slots.lua`, `setup_decode.lua`, `turnlimit_probe.lua`, `turnlimit_setup.lua` |
| diplomacy | `deal_probe.lua`, `deal_agreements.lua` |
| session 1 | `sight_find.lua` + `sight_read.lua` (the sight matrix), `volcano_snap.lua` + `volcano_erupt.lua`, `cs_probe.lua`, `prod_state.lua`, `trade_probe.lua`, `unblock.lua` |
| API discovery | `dump_methods.lua`, `dump_globals.lua`, `dump_unit.lua`, `dump_buildqueue.lua`, `dump_citycmd.lua`, `catalog_probe.lua`, `param_grep.lua`, `unit_ops.lua`, `blocker_read.lua`, `find_coastal.lua`, `fuel_probe.lua`, `gdr_tech.lua`, `save_named.lua`, `load_named.lua` |

## Fits and batteries (`*.py`)

| script | purpose |
|---|---|
| `rng_fit.py` | fits the LCG transition and the range fold against the recorded streams |
| `combat_roll_fit.py` | fits damage against the known draw; `combat_clean.py`, `combat_endpoint.py`, `combat_roll_run.py` drive the shots |
| `curve_fit.py`, `frac_curve.py` | the damage curve — `1.04^Δ` against `e^(0.04Δ)` |
| `frac_support.py`, `frac_support2.py` | the health-scaled anti-air support term |
| `hp_calib.py` | the damaged-strength coefficient from the preview ladder (c ≈ 10) |
| `icbm_law.py`, `intercept_law.py`, `intercept_predict.py` | the silo/submarine warhead defence and the pre-registered flip points |
| `intercept_battery.py`, `intercept_seeded.py`, `intercept_stack.py`, `silo_battery.py`, `sub_battery.py`, `sub_pin.py`, `aa_sweep.py`, `aa_cover_run.py`, `aa_cell_read.py`, `gdr_aa.py`, `cell_run.py`, `cell_run2.py`, `dist_run.py` | the interception suite's cells |
| `seed_for_u.py`, `draw_count.py`, `once_per_turn.py` | pick a seed for a wanted draw; count the draws an action consumed |
| `goody_run.py`, `goody_count.py`, `goody_predict.py`, `goody_verify.py` | the tribal-village draw and its predictions |
| `spy_band_fit.py` | the mission bands against 3d6 tails |
| `xp_battery.py`, `xp_run.py`, `xp_melee_run.py` | the experience readings |
| `escape_fit.py` | escape rates against the candidate readings of `ESPIONAGE_ESCAPE_BASE_CHANCE` (session 1) |
| **`evidence.py`** | scores every claim against a stated null (an exact prediction in a window of width W gives `W^-k`, a binary outcome `0.5^k`) so weak claims are visible instead of buried in adjectives |
| `steelman.py` | the rival-model predictions written down before firing |
| `xml_modifiers.py`, `xml_check.py` | the install's modifier ledger (see below) |

**`INTERCEPT_SUITE.md`** is the interception test matrix, cell by cell, with
each round's pre-registered prediction and its result — written before the
runs, so every cell is a test rather than a fit.

## `runs/` — what each file measured

| file | what it holds | report |
|---|---|---|
| `purchase_20260920T181359Z.jsonl`, `..181552Z.jsonl` | 303 rows each of XML cost / city cost / gold / faith, at two turns | lab2 G |
| `religion_20260920T183900Z.jsonl` | the city religion ledgers and the six pushed draws that settle the tie-break | lab2 E |
| `envoy_20260920T190500Z.jsonl` | Akkad's owned plots at 2–16 envoys | lab2 C-80 |
| `capture_20260921T000500Z.jsonl` | Shizuoka's district pools before and after the capture | lab2 C |
| `freecity_20260920T193000Z.jsonl` | the FAILED first attempt and its exact refusals | lab2 B |
| `freecity_watch_20260921T001500Z.jsonl`, `freecity_20260921T003000Z.jsonl` | the ten-turn Free City watch: amenities, defence, grants, queue | lab2 B |
| `nuke_20260921T010000Z.jsonl` | scene D, every plot and every draw of the four wonder/ring strikes | lab2 D |
| `nuke_summary_20260921T013000Z.jsonl` | its conclusions | lab2 D |
| `nuke_natural_20260921T030000Z.jsonl` | eight cities at natural population, one centred thermonuclear each | lab2 D |
| `nuke_population_20260921T033000Z.jsonl`, `nuke_wave_20260921T023000Z.jsonl`, `nuke_pass_20260921T020000Z.jsonl`, `nuke_content_20260921T040000Z.jsonl`, `nuke_population_fit_20260921T044500Z.jsonl` | the eleven-city wave with the blast content measured before each strike — the data behind the district fit that lab 3 then killed | lab2 D |
| `nuke_pop_20260921T013923Z.jsonl` | the fifteen strikes of the population rule, every reading | lab3 one |
| `nuke_pop_fit_20260921T031500Z.jsonl` | the rule, its gate and the fifteen predictions | lab3 one |
| `nuke_extra_20260921T040000Z.jsonl` | interception, fallout damage and yield, C-2, the placement API | lab3 two |
| `wiki_validate_20260921T050000Z.jsonl`, `wiki_validation_20260921T053000Z.jsonl` | the Civilopedia's blast claims checked one by one, with the two retractions | lab3 one, two |
| `rng_20260921T090000Z.jsonl` | the generator: seed→seed pairs, the fold, the 24-draw stream, the combat battery | lab3 four |
| `rng2_20260921T100000Z.jsonl` | the second game: the stream reproduced, tribal villages, espionage, the interception suite, the silo, XP | lab3 five–eight |
| `storm_20260913T*.jsonl` | 31 storms, the movement walk | session 1 |

---

# Standing sections from session 1

### Turn advancement and the Autoplay trap

`lab.py advance --n N` passes turns by Autoplay (1 turn, return as the
human seat). NEVER let `SetReturnAsPlayer` see -1: the UI's
`Game.GetLocalPlayer()` reads -1 while Autoplay holds the seat, and a
return player of -1 parks the game with no local player and a turn that
never ends — `SetActive(false)`, `SetTurns(0)` and every seat-setting call
in both states were tried and none recovers it; only loading the autosave
does. `local_player()` falls back to the human major in GameCore and
`advance()` refuses -1.

Turn rate, measured: ~2.3 s/turn early, ~5.9 s/turn by the Medieval era
(about 10 turns a minute) with the game in the foreground. Autoplay also
stalls on end-turn blockers — read the blocker with
`NotificationManager.GetFirstEndTurnBlocking(me)`; a new era's Dedication
(`ENDTURN_BLOCKING_COMMEMORATION_AVAILABLE`) cannot be cleared from the
socket and costs the owner a click. The table is `CommemorationTypes`, not
`Commemorations`, and each row has a `MinimumGameEra`/`MaximumGameEra` window.

### `storm` — ASK 16, the storm walk

    python tools/civ6lab/lab.py storm --turns 5 --repeat 2

Strikes `RANDOM_EVENT_HURRICANE_CAT_5` at an ocean plot and records every
active storm's `CurrentLocation`, `CurrentDirection`, `StartTurn` and
footprint per turn.

RESULT (2026-09-13, 31 storms): one movement turn displaces the centre 4-8
hexes in open water (1-5 against the ice), always along the storm's
`PrevailingWinds` band, with off-axis wobble — eight unit steps, each drawn
from the band; the dissipation turn displaces the record once more and adds
no observed damage. The model ships as `stormWalk` (cpu/core/disasters.ts)
/ `_storm_walk` (gpu/core/sim_economy.py).

### `spy_probe.lua` — the mission roll (InGame)

    python tools/civ6lab/lab.py lua --state InGame --file tools/civ6lab/spy_probe.lua \
        --set SPYID=<unit id> --set TX=<x> --set TY=<y>

Reads `UnitManager.GetResultProbability` for every offensive mission of one
Spy against one district plot — the UI's own source. Spawn the spy first
from `GameCore_Tuner`, or buy one with `CityCommandTypes.PURCHASE` (a Spy
costs exactly what scene G's formula predicts). Every offensive mission
targets a DISTRICT, so a city with only its centre refuses everything —
`buildQueue:CreateDistrict` on the target city fixes that.

RESULT: one 3d6 roll against `BaseProbability - k`, six outcome bands by
margin, k = 2 for a fresh spy, +2 under Gain Sources; district, pillage,
garrison and a counterspy do not enter. The band table ships as
`missionOutcome` (cpu/core/espionage.ts) / `_mission_outcome`.

### The escape — `spy_loop.py`

    python tools/civ6lab/spy_loop.py --host 127.0.0.1 --save lab4_t100 --turns 100 --extra 12
    python tools/civ6lab/escape_fit.py tools/civ6lab/runs/escape_lab4_*.log

Spies are BOUGHT in a city of the human seat (a socket-SPAWNED spy crashes
the game when its escape ends in capture or death). The loop grants the seat
the four spy civics and `--extra` more copies of `CIVIC_GRANT_SPY` (they do
raise the capacity), then each turn runs `spy_turn.lua` (buy up to `--cap`,
send idle spies to foreign majors' centres, start `--op`, take an offered
promotion other than Ace Driver) and ends the turn through `unblock.lua`.
That resolver answers an escape prompt FIRST, found by its notification —
a city that keeps asking for production otherwise stays the first blocker
and the prompt is never answered — with a route the city offers, rotated by
the spy's id, and logs the route, the routes on offer, the city and the
pursuer. `escape_fit.py` pairs each must-escape mission with its prompt and
splits the outcomes by level, route, routes on offer and prompt lag.

RESULT (129 escapes): the police guess one offered route uniformly; the spy
gets away when 3d6 lands at or under 10 + level - 4 on a right guess. The
counterspy's term is unmeasured (every pursuer was the police).

### Results log (2026-09-13, session 1, turns 1-74)

| ask | finding |
|---|---|
| 16 storm walk | 8 band-drawn unit steps in one movement turn, 4-8 hexes net; a second displacement on the dissipation turn, no damage seen then |
| C-16 mission roll | 3d6 vs BaseProbability - k, six bands; k=2 fresh, +2 Gain Sources; district/pillage/garrison/promotions (other ops) do not enter |
| 11 sight | occlusion by elevation (through-height > observer height), no range from hills |
| 15 trade per district | `District_TradeRouteYields` is the composition; origin side 0; the two GlobalParameters are dead |
| 1 volcanic soil | radius-1 ring, a proportion painted, improvements pillaged or removed, bonus resources destroyed |
| 7 mid-build purchase | per-item progress survives every switch; buying a BUILDING clears its entry and its hammers land on the next item through overflow (Walls 30 -> 64/50 at 16.8/turn); buying a UNIT leaves its per-type progress in place |
| 9 city-state spending | 7 turns: banks drift with income minus unit upkeep; Mexico City spent ~207 of 260 to buy a unit after its army fell 4 -> 1 |
| formation turn-spend (stylized) | forming a Corps leaves the merged unit at 0 moves that turn (2/2 + 2/2 -> 0/2, formation 1) |
| GDR jump | `UNITCOMMAND_MOVE_JUMP` refused on a fresh GDR at 5/5 moves everywhere within 3 — needs the Enhanced Mobility project; not measured |

### `xml_modifiers.py` — the install's modifier ledger, both XML styles

    python tools/civ6lab/xml_modifiers.py MODIFIER_PLAYER_ADJUST_SPY_BONUS ...

Policies.xml and friends write modifier rows as child ELEMENTS, not
attributes; a line grep for `ModifierType="..."` returns nothing there and
reads as "no such modifier exists". This parses the XML and prints each
modifier's arguments and what attaches it.

### `lua` — anything else

    python tools/civ6lab/lab.py lua "print(GameClimate.GetNumActiveStorms())"
    python tools/civ6lab/lab.py lua --state InGame "print(Game.GetLocalPlayer())"

## What to ask next

`SESSION5.md` is the remaining scene list — every LAB line open in AUDIT, as
automated scenes, cheapest instrument first.
