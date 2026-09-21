# Lab session 3 — the nuclear strike's population loss (2026-09-21, live game, tuner TCP 4318)

Start state: the owner's loaded save, **turn 125**, the timeline lab 2 left behind (eleven
cities already struck, player 0 = NORWAY holding Nidaros, Stavanger and the recaptured
Shizuoka). Nothing was loaded this session — **no reload was needed and none was asked for**.
Ended at **turn 128**, `probe` green, game healthy. 15 new strikes, all from the socket, plus
one city founded on purpose to build the scene the board did not contain.

Run file: `tools/civ6lab/runs/nuke_pop_20260921T013923Z.jsonl` (every reading, one JSON object
per line), fit and rows: `tools/civ6lab/runs/nuke_pop_fit_20260921T031500Z.jsonl`.
New probes: `pop_survey.lua`, `pop_rich.lua`, `pop_scan.lua`, `pop_setup.lua`, `pop_queue.lua`,
`pop_range.lua`, `pop_found.lua`, `pop_foundscan.lua`, `param_grep.lua`, `dump_methods.lua`,
`dump_globals.lua`.

---

## The rule

> **killed = the number of the city's citizens working tiles inside the blast radius.**
> **The city-centre tile does not count** (it is worked for free, by nobody).
> **If that number is the city's whole POPULATION, the strike kills nobody at all** — the loss
> is skipped whole, not floored at 1. The comparison is against the population, so a citizen
> who is on no tile (a specialist, or unemployed) **voids the free pass** for everyone else.
> It lands on the **strike tick**; nothing is lost on the following turns.
>
>     killed = |{ tiles inside the blast worked by this city's citizens, centre excluded }|
>     if killed >= city.population: killed = 0
>     city.population -= killed

Fifteen strikes, fifteen exact predictions, no residue. The wiki's sentence — "citizens
working the affected tiles are eliminated" — is **right**, and lab 2's refutation of it was
the gate clause seen three times in a row (Sendai, Akkad, Otsu were all cities whose every
citizen stood inside the blast).

**The owner's Nidaros-vs-Stavanger observation is the rule exactly.** Stavanger works 4 tiles
and all 4 are within 2 of its centre, so a centred thermonuclear covers every citizen it has
→ the kill is skipped, 4 → 4, however many times you bomb it. Nidaros works tiles out at
distance 3, so a centred blast covers only some of its citizens → they die, and repeated
strikes at different aim points walk it down toward — but never to — zero. "Losses correlated
to working tiles in blast radius completely" is the first clause; "Stavanger, zero losses
despite bombing its every tile" is the second clause, and *because* every tile was bombed.

The decider is row 13: **Stavanger, which had just shrugged off two thermonuclear strikes,
lost 3 of its 4 citizens to a radius-1 nuclear device** — the smaller bomb covered 3 of its
4 worked tiles and left one outside, so the gate did not fire. Immunity was never a property
of the city; it was total coverage.

## The table — every strike this session

All aimed at the city centre unless noted. "in / out" = citizens working tiles inside /
outside the blast radius, measured **before** the strike with
`city:GetCitizens():IsPlotWorked(x, y)`; "idle" = `pop - workers`, citizens on no tile at all.

| # | city | owner | weapon (r) | pop | in | out | idle | pop after | killed | predicted |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | STAVANGER | 0 (mine) | thermo (2) | 4 | **4** | 0 | 0 | **4** | 0 | 0 — gate |
| 2 | NIDAROS | 0 (mine) | *neighbour of #1* | 6 | 1 | 5 | 0 | **5** | 1 | 1 |
| 3 | NIDAROS | 0 (mine) | thermo (2) | 5 | 2 | 3 | 0 | **3** | 2 | 2 |
| 4 | OKAYAMA | 1 | thermo (2) | 6 | 4 | 2 | 0 | **2** | 4 | 4 |
| 5 | TOKYO | 1 | thermo (2) | 5 | 4 | 1 | 0 | **1** | 4 | 4 |
| 6 | MUSCAT | 9 | thermo (2) | 11 | **11** | 0 | 0 | **11** | 0 | 0 — gate |
| 7 | SENDAI | 1 | thermo (2) | 6 | **6** | 0 | 0 | **6** | 0 | 0 — gate |
| 8 | MUSCAT | 9 | nuclear (1) | 11 | 5 | 6 | 0 | **6** | 5 | 5 |
| 9 | NGAZARGAMU | 4 | nuclear (1) | 10 | 4 | 6 | 0 | **6** | 4 | 4 |
| 10 | SENDAI | 1 | nuclear (1) | 6 | 4 | 2 | 0 | **2** | 4 | 4 |
| 11 | AKKAD | 8 | nuclear (1) | 5 | 1 | 4 | 0 | **4** | 1 | 1 |
| 12 | OTSU | 1 | nuclear (1) | 4 | **4** | 0 | 0 | **4** | 0 | 0 — gate |
| 13 | STAVANGER | 0 (mine) | nuclear (1) | 4 | 3 | 1 | 0 | **1** | 3 | 3 |
| 14 | SKEDSMO | 0 (mine) | thermo (2) | 10 | 5 | 0 | **5** | **5** | 5 | 5 — gate **void** |
| 15 | SKEDSMO | 0 (mine) | thermo (2) | 5 | 5 | 0 | 0 | **5** | 0 | 0 — gate |

Four clauses each fall out of a particular row:

* **Row 2 — the kill is not about the struck city.** The thermonuclear aimed at Stavanger's
  centre also covered `37:21`, a MINE four tiles away that **Nidaros** was working. Nidaros —
  centre never touched, not a district of it inside the blast — lost exactly that one citizen,
  6 → 5, and `37:21` came back `worked=false, workerCount=0`. The blast kills the citizens
  standing in it, whoever employs them.
* **Row 5 — the gate is "would the city be emptied", not "would it be left small".** Tokyo
  went to population **1** (4 of its 5 citizens were inside), so a kill down to one citizen is
  allowed. The skip only happens at `killed == pop`.
* **Rows 6-7-12 vs 8-10-13 — the gate is coverage, not the city.** The same three cities that
  lost nothing to a radius-2 device lost 5, 4 and 3 citizens to a radius-1 device aimed at the
  same tile. Nothing about Sendai, Muscat, Otsu or Stavanger is immune.
* **Row 3 — an unfinished district is destroyed.** Nidaros's incomplete DISTRICT_AQUEDUCT at
  `35:22` is **gone** from `GetDistricts():Members()` after the strike (districtsTotal 3 → 2),
  while every complete district survives pillaged. That closes lab 2's one untested wiki
  clause ("any unfinished districts are destroyed and removed").

## What the loss is NOT

* **Not districts in the blast.** Lab 2's "≥3 districts → gutted" fit dies on these rows:
  Nidaros and Stavanger each had exactly **2** complete districts inside the blast and one lost
  2 citizens while the other lost none; Tokyo with **8** complete districts inside lost 4, which
  is its worked-tile count, not a district count. The old fit was a coincidence of which cities
  happened to have citizens out at distance 3 (developed majors) and which did not (compact
  cities and city-states).
* **Not starvation, and not delayed.** Turns 126, 127, 128 were played after the strikes and
  **no city lost another citizen**. They *grew*: Nidaros 3 → 4, Tokyo 1 → 2 → 3, Okayama 2 → 3
  → 4, Sendai 2 → 3 → 4, Muscat 6 → 7. The food box is untouched by the kill (Okayama sat at
  71.6/33 food through a 13 → 6 loss), so the loss is a bare one-tick population change.
* **Not housing, amenities, loyalty or occupation.** Nidaros (housing 9 → 5, amenities 5 → 2)
  and Stavanger (7 → 5, 3 → 2) moved the same way and lost different numbers; neither was
  occupied, both were mine and at peace with themselves.
* **Not a reassignment.** Citizens **stay on the contaminated tiles**: Stavanger's four sat on
  the same four plots before the strike, after it, and three turns later, each with
  `falloutTurns = 20`. The game does not push them off, and the surviving citizens of a gutted
  city do not move to cover the empty tiles either.
* **Not in any data table.** `WMDs.xml` carries only the boolean `AffectPopulation="true"`
  (plus BlastRadius 1/2 and FalloutDuration 10/20); a live-DB sweep of `GameInfo.GlobalParameters()`
  for WMD / NUKE / NUCLEAR / FALLOUT / POPULATION_LOSS / BLAST returns three rows and none is a
  magnitude (`CITY_POPULATION_LOSS_TO_CONQUEST_PERCENTAGE` 0.25, `MAYHEM_NUCLEAR_LAUNCH` 5.0,
  `WAR_WEARINESS_PER_WMD_LAUNCHED` 10). The number is DLL-side; measurement is the only route.

## The gate is compared to the POPULATION — rows 14 and 15, one city, back to back

Rows 1-13 all have **idle = 0**, so two spellings of the gate fit them equally: compare the
kill to the **population**, or compare it to the **number of worked tiles**. They differ only
for a city with a citizen on no tile at all, and the board had no such city inside Bomber
Range. So one was built.

**SKEDSMO** was founded at `32:16` for the scene (a Settler spawned from the socket and
`UnitOperationTypes.FOUND_CITY`). A brand-new city owns exactly its centre and ring 1 — seven
plots — so every citizen it can seat is inside a radius-2 blast and any surplus has nowhere to
go. `ChangePopulation(+9)` took it to **pop 10**, and the layout was then *measured*, not
assumed: **5 citizens on tiles, all 5 inside the blast, 5 citizens on no tile at all.**

| strike | pop | workers in blast | idle | prediction if compared to **pop** | if compared to **worked tiles** | measured |
|---|---|---|---|---|---|---|
| 14 | 10 | 5 | **5** | 10 → 5 | 10 → 10 | **10 → 5** |
| 15 | 5 | 5 | 0 | 5 → 5 | 5 → 5 | **5 → 5** |

Same city, same weapon, same aim plot, thirty seconds apart: **with five idle citizens it lost
five; with none it lost nothing.** The kill is compared to the population. A specialist or an
unemployed citizen does not protect the tile-workers — it condemns them, because the city can
survive without them.

(After row 14 the five survivors immediately took the five now-contaminated tiles, i.e. the
seats a kill frees up *are* refilled at once — while a citizen already standing on contaminated
ground is never moved. Both halves matter to a port.)

## Is it exploitable? Yes — and here are its exact edges

The owner's question: can a city be made to shrug off a thermonuclear strike, population-wise,
by seating its citizens in rings 0-2? **Yes.**

* The ceiling is **18 citizens**, not 19: a radius-2 blast covers 1 + 6 + 12 tiles, and the
  centre is auto-worked by nobody, so it shelters no citizen. Each **district** or unworkable
  tile (mountain, a tile another city owns) inside rings 1-2 lowers the ceiling by one.
* The condition is **all-or-nothing**: every citizen must be on a covered tile. One specialist,
  or one unemployed citizen, and every covered tile-worker dies instead (rows 14-15). A city
  saved by the pass is one the strike *cannot* empty.
* It is **repeatable**, not a one-off immunity: Stavanger took two thermonuclear strikes at
  4 → 4, Sendai and Muscat one each at 6 → 6 and 11 → 11, Skedsmo 5 → 5. Nothing accumulates.
* It protects **population only**. The blast still pillages every district, building and
  improvement in the rings, contaminates all 19 tiles for 20 turns, kills every unit, destroys
  unfinished districts and floors the centre's HP — the city is wrecked, just not depopulated.
* The attacker's counters are cheap and both were measured: **aim off-centre**, or use the
  **smaller weapon**. A radius-1 device covers only rings 0-1, so a fully-seated city with more
  than 6 citizens keeps some workers outside the blast, the pass never fires, and everyone
  inside dies — that is exactly rows 8-13, where Muscat lost 5, Ngazargamu 4, Sendai 4 and
  Stavanger 3 to the *weaker* bomb that their radius-2 coverage had shrugged off.
* And the mirror image: a city is most vulnerable when it is **large and spread out**. Tokyo
  (pop 5, 4 inside) went to 1; Okayama (6, 4 inside) to 2.

For the driver and for anyone playing this: the defensive move is to lock every citizen onto a
tile within 2 of the centre and keep zero specialists; the offensive move is to aim one ring
off the city centre so that the pass cannot fire.

## The exact Lua, by state

**The reader that decides everything (InGame).** A citizen's tile is
`city:GetCitizens():IsPlotWorked(x, y)` — per CITY, as lab 2 established. `plot:GetWorkerCount()`
counts any owner's citizens and leaks the neighbours in; on `37:21` the two disagree by design,
which is exactly the row that proves a neighbouring city's citizen dies.
The InGame citizens object carries **only** `IsPlotWorked`, `IsFavoredYield`, `IsDisfavoredYield`;
the GameCore one carries no plot reader at all, and **neither state exposes a specialist count**
— `idle` has to be derived as `pop - (worked tiles - 1)`.

| probe | state | what it reads |
|---|---|---|
| `pop_survey.lua` | InGame | every city: pop, districts, centre pillage, housing, food, amenities — cheap enough to poll |
| `pop_scan.lua --set ZR=<r>` | InGame | per city, over the 37 plots within 3 of the centre: `workers`, `workersIn` (≤ ZR), `workersOut`, `idle`, `improvedIn`, `falloutOnWorked` — **this is the table above** |
| `pop_rich.lua --set ZCX= ZCY= ZR=3` | InGame | one city in full: the growth clocks (`GetTurnsUntilGrowth` / `GetTurnsUntilStarvation`), housing by source, amenities, happiness, `IsOccupied`, `IsCapital`, every district with its pillage flag, plus one line per plot (owner, worked, improvement + `IsImprovementPillaged`, district, resource, feature, yields, `GetFalloutTurnsRemaining`, units) |
| `pop_setup.lua --set ZBX= ZBY= ZN= ZSTOCK=` | GameCore | `GetWMDs():ChangeWeaponCount`, N Bombers on a tile player 0 has a city on |
| `nuke_one.lua` (lab 2) | InGame | one `UnitManager.RequestOperation(u, UnitOperationTypes.WMD_STRIKE, {PARAM_X, PARAM_Y, PARAM_WMD_TYPE})` |
| `pop_queue.lua` | GameCore | the warhead stock and per-Bomber moves — **the only honest "has it landed yet" test** |
| `param_grep.lua` | InGame | `GameInfo.GlobalParameters()` / `GameInfo.WMDs()` rows as the live DB has them |
| `dump_methods.lua`, `dump_globals.lua` | both | the callable names on city / citizens / growth / plot / fallout manager, and which builder globals exist |

Fallout is `Game.GetFalloutManager():GetFalloutTurnsRemaining(plotIndex)` (20 thermonuclear,
10 nuclear, and a 10-turn strike **does not shorten** a plot already carrying 20).

## What failed, and the traps this session paid for

| call / move | result |
|---|---|
| `rawget`, `load`, `_G`, `_ENV`, `getfenv` | **all nil** inside the tuner's wrapped chunk — a metatable walk has to index `mt["__index"]` inside a `pcall`, and a global's existence has to be probed by naming it literally |
| `Game.GetFalloutManager():GetFalloutPreventsWork(i)` | returns **true for every plot**, contaminated or not (uncontaminated plots at distance 3 included). It is not a per-plot reader; do not use it as one. The behaviour it seems to promise does not happen either — citizens keep working contaminated tiles for at least three turns |
| `UnitManager.CanStartOperation(WMD_STRIKE)` with the bomber **on the aim plot** | `can=false`, silently. A bomber cannot nuke the tile it is standing on — the Nidaros strike had to be flown from Stavanger, 4 tiles away |
| Bombers based in a city that is then struck | **destroyed** (their rows read `x=-9999`). Base the next wave somewhere else, or re-create |
| `plot:IsValidFoundLocation()` | **false for every plot on the map** — a whole-map sweep returns 0 sites, including the plot where a city was then founded without complaint. It is not a usable site reader from the tuner. The real test is `UnitManager.CanStartOperation(settler, UnitOperationTypes.FOUND_CITY, nil, {PARAM_X, PARAM_Y})`, which answered **true** at `32:16`. `GetUnits():Create(UNIT_SETTLER, x, y)` works on any remote land plot (unlike a Bomber), so **a forward base CAN be founded** — an earlier draft of this report said the opposite on the strength of the broken reader |
| `CityManager.RequestCommand(city, CityCommandTypes.MANAGE, {PARAM_MANAGE_CITIZEN, PARAM_X, PARAM_Y})` | `CanStartCommand` **true**, the request returns without error, and **no citizen moves** (tried with the parameter as `1` and as `true`; the UI itself never sets that parameter, `PlotInfo.lua:OnClickCitizen` passes whatever `UI.GetInterfaceModeParameter` holds). `CityManager.GetCommandTargets(city, MANAGE, {})` comes back **empty**. There is no citizen-assignment path from the socket; build the citizen layout out of what a city OWNS instead |
| an enemy unit parked on a worked tile | does **not** push the citizen off, at least not within the turn — 25 hostile Warriors placed on Nidaros's rings 2-3 left `IsPlotWorked` unchanged on every one of them. They were removed again before any turn was played |
| reading populations **while the WMD queue is still draining** | produced three false "no loss" rows in a row (Tokyo, Sendai, Akkad each read unchanged, then read −4, −4, −1 a few seconds later). **The population poll is not a landing test.** The landing test is `GetWMDs():GetWeaponCount(k)`: one warhead leaves the stock per strike that actually executes, and the queue drains at roughly one strike every few seconds |

The last one is the method lesson of the session, and it is the same shape as lab 2's: a clean,
consistent, plausible reading of the *wrong* thing. Lab 2's "the wiki is wrong about citizens"
came from three cities whose every citizen was inside the blast; a fourth reading — any city
with one citizen at distance 3 — would have overturned it. **When a reading agrees with a
published account only for cities of one shape, vary the shape before believing it.**

## What this means for the engine (C-31)

I read both appliers. Neither models the loss, and both say so in the same words:

* `cpu/core/combat.ts:detonate()` — its doc comment ends *"NOT here: 'Citizens `working` the
  affected tiles are eliminated'. Neither engine exposes a worked-tile SELECTION outside its own
  yield walk, so there is no assignment both could read the same way; the loss is recorded
  rather than approximated."* The body walks the blast tiles for units, `tile.pillaged`,
  `tile.districtPillaged`, `tile.falloutTurns`, the Encampment pools, and then floors the
  centre's `hp` at 1 and zeroes `outerHp`. `city.population` is never touched.
* `gpu/core/sim_seats.py:_detonate()` — the same paragraph verbatim in its docstring, and the
  same walk in tensors (`self.pillaged |= blast & (self.improvement >= 0)`,
  `self.district_pillaged`, `self.tile_fallout`, `encamp_hp`, the centre pools). No population
  write.

So C-31's population half is **open work, not a modelled approximation** — there is nothing to
correct, only something to add, and it is now specified exactly:

    killed = |{ tiles inside the blast that this city's citizens work, centre excluded }|
    if killed >= city.population: killed = 0   # compared to POPULATION, specialists included
    city.population -= killed                  # on the strike tick, food box untouched

Four consequences for the port, each measured above and each a place the twins can fork:

1. The loss is **per city, not per struck city** — every city with a citizen inside the blast
   pays, including one whose centre is nowhere near it (row 2). The walk is over the blast's
   tiles, asking each tile which city works it, not over the cities in the radius.
2. The **city-centre tile must be excluded** from the count or Tokyo's row comes out 5 instead
   of 4 and the gate fires wrongly on every fully-covered city.
3. The gate is **skip-whole, not clamp** — `min(killed, pop-1)` would take Stavanger to 1 where
   the game leaves it at 4, and that single clause is the whole of the owner's puzzle.
4. The gate's left-hand side is the **population**, not the worked-tile count, so an engine
   that models specialists must count them in `pop` here or Skedsmo comes out 10 → 10 instead
   of 10 → 5. Both engines seat citizens on tiles for yields; whichever one grows a specialist
   or unemployed citizen first must make sure this comparison still reads the population.

Both engines would also gain the unfinished-district clause (row 3): a district under
construction inside the blast is **removed**, where a complete one is only pillaged.

---

# Part two — the rest of the lab list (turns 128-130)

The owner cleared the whole remaining list, so after the population rule was closed the session
kept going. Run file: `tools/civ6lab/runs/nuke_extra_20260921T040000Z.jsonl`.

## Interception — measured for the first time, and both engines are right

`cpu/core/nuclear.ts:nukeInterceptor` and `gpu/core/sim_seats.py:_nuke_intercepted` ship the
Civilopedia's "Destroyers, Battleships, Missile Cruisers, and Mobile SAMs can protect adjacent
tiles from nuclear strikes" with **no roll** behind it and `NUKE_COVER_RANGE = 1`. Eight
strikes settle every clause of it. A marker unit stood on each aim plot so a landing was never
in doubt, and the warhead stock said whether the strike had executed.

| # | guard beside the aim plot | outcome |
|---|---|---|
| 1 | Japanese **Mobile SAM**, distance 1 | **stopped** — warhead spent, no fallout, marker alive at 100 hp |
| 2 | the same SAM, a **second strike the same turn** | **stopped** again — no interception budget, no roll |
| 3 | SAM removed, same plot, same weapon | **lands** — fallout 20, 19 plots, marker dead |
| 4 | Japanese **Warrior**, distance 1 | **lands** — the guard is CLASS-gated |
| 5 | Mobile SAM at **distance 2** | **lands**, and the SAM dies in the blast — cover range is 1 |
| 6 | **my own** Mobile SAM, distance 1 | **lands** — a seat never shoots down its own |
| 7 | a **neutral** seat's SAM (player 9, at peace with me), distance 1 | **stopped** — peace is irrelevant, and **no war was declared** |
| 8 | the same neutral seat, SAM removed | **lands**, and `IsAtWarWith(9)` flips **false → true** |

So: class-gated, adjacency only, any seat but the launcher, no roll, no per-turn budget, and
**the device is spent either way**. Rows 7 and 8 also confirm the order both engines walk —
an intercepted strike declares no war, a landed one declares war even on a seat at peace.
That is `detonate`'s early `return` after the interception check, measured.

## Fallout — 50 damage a turn is right; everything else about it is weaker than assumed

Both engines take `FALLOUT_DAMAGE = 50` from the pedia with the data file admitting "no install
table carries it". Four of my Warriors, three standing in contamination and one clean control:

| turn | three units in fallout | control on a clean tile |
|---|---|---|
| 128 | 100 hp each | 100 hp |
| 129 | **50 hp each** (damage 50) | 100 hp |
| 130 | **dead** (damage 100) | 50 hp — autoplay had walked it into fallout |

**Exactly 50 per turn, cumulative, and it kills.** Four independent units, no partial numbers.

The yield half is the surprise. `Game.GetFalloutManager():SetFalloutTurnsRemaining(plot, n)`
contaminates a plot **with no blast at all**, so fallout can be measured with nothing pillaged.
All 28 plots within 3 of an untouched city were contaminated, covering every one of its 7
worked tiles:

* the citizens **stayed** on the contaminated tiles, before and after and a turn later;
* each tile's `GetYield` was **unchanged** (2/2 before, 2/2 after);
* the city's **food surplus stayed 5** across two turns and its food box kept filling
  (3.5 → 7.0 → 11.3), `turnsToGrow` counting down normally.

So in this build contamination costs the tile's owner **nothing in yield and nobody in
citizens** — it only damages units that end their turn in it (and marks the tile for a
Builder). That is worth knowing before either engine grows a fallout yield penalty.

One reader to distrust: `GetFalloutPreventsWork(i)` returns **true for every plot**, clean ones
included. It is not a per-plot reader, and the behaviour it seems to promise does not happen.

## C-2, the research agreement's clock — CLOSED, and the answer is that it does not exist

lab 2 left this "blocked on the deal screen". It is not blocked; it is void.
`DLC/Expansion1/Data/Expansion1_Alliances.xml` line 20 is

    <Delete Type="DIPLOACTION_RESEARCH_AGREEMENT" />

and Expansion2 re-ships that file, so by the modinfo load order the action is deleted in both
expansions. The **live** Gathering Storm database confirms it:
`GameInfo.DiplomaticActions["DIPLOACTION_RESEARCH_AGREEMENT"]` is **absent**, and the only
agreement-flagged actions left are OPEN_BORDERS, MAKE_PEACE, ALLIANCE, JOINT_WAR and
THIRD_PARTY_WAR. What replaced it is the **Alliance** (five types, ALLIANCE_RESEARCH among
them), and its clock is a parameter, not a screen:

| parameter | value |
|---|---|
| `DIPLOMACY_ALLIANCE_TIME_LIMIT` | **30** |
| `DIPLOMACY_DECLARED_FRIENDSHIP_TIME_LIMIT` | 30 |
| `ALLIANCE_LEVEL_COUNT` | 3 |
| `ALLIANCE_LEVEL_TWO_XP` / `ALLIANCE_LEVEL_THREE_XP` | 320 / 960 |
| `ALLIANCE_POINTS_MULTIPLIER`, `_FOR_DEAL`, `_FOR_SOCIETY`, `_FOR_TRADE` | 4, 2, 2, 1 |
| `DIPLOMACY_RESEARCH_AGREEMENT_BEAKER_PERCENTAGE` | 10 — a **dead** parameter, like the two dead trade ones from session 1: the action it belonged to is deleted |

`DealManager` is reachable from the socket after all (`GetWorkingDeal`, `GetPossibleDealItems`,
`EditWorkingDeal`, `SendWorkingDeal`, and `DealAgreementTypes.RESEARCH_AGREEMENT` still in the
enum table), so the screen was never the blocker — the row was.

## The Nuclear Emergency did not fire

Both engines end `detonate` by raising `EMERGENCY_NUCLEAR` against the **launcher's own**
capital. After 21 warheads this session, `Game.GetEmergencyManager():GetEmergencyInfoTable(0)`
comes back **empty**. That is one reader on one seat, so it is a flag rather than a verdict —
but nothing in the live game suggests an emergency was raised. Grievances did move: Japan 501,
Muscat 300, Nubia 250, Scotland 250, Akkad 150 against me, while two city-states I nuked twice
sit at 0. Grievances feed the AI's opinion, which is out of scope by the owner's 2026-09-20
ruling, so I did not chase the decomposition.

## The placement API — and the call that took the game down

`city:GetBuildQueue()` carries **`CreateDistrict`, `CreateBuilding`, `CreateIncompleteDistrict`,
`CreateIncompleteBuilding`, `AddProgress`, `FinishProgress`, `RemoveBuilding`, `RemoveDistrict`**,
and `WorldBuilder.CityManager()` carries `CreateDistrict(city, "DISTRICT_X", 100, plotIndex)` /
`CreateBuilding(...)` / `SetCityValue(city, "Population", n)` with `WorldBuilder.PlayerManager()`
beside it. This is a large capability nobody had found: **whole districts and buildings can be
built from the socket**, which is what ask 4 (reactor accidents) was waiting for a save to
provide.

The WorldBuilder route reports what it needs in a status table, and it named the chain exactly:
**BUILDING_POWER_PLANT ← BUILDING_FACTORY ← BUILDING_WORKSHOP ← DISTRICT_INDUSTRIAL_ZONE**
(`NeededBuilding` / `NeededDistrict` come back as indices). It refused the district itself with
a bare `FullFailure`, so I moved to the build-queue route — and that one works:

    city:GetBuildQueue():CreateDistrict(GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].Index,
                                        plot:GetIndex())      -- returned true, HasDistrict true

**The next call in the same probe took the game's tuner down.** The probe tried the same call
again on the **same plot** with an extra argument (`CreateDistrict(idx, plotIndex, 100)`), and
the sentinel never came back; `lab.py probe` has found no listener since, while the
`CivilizationVI` process is still alive and responding. The plausible cause is placing a second
district on a plot that already carries one — an occupied-plot placement — rather than the
extra argument itself, but the two are not separated. **Treat `CreateDistrict` as one shot per
plot, and check `HasDistrict` before calling it again.**

Also worth the README: in Gathering Storm the nuclear reactor is **`BUILDING_POWER_PLANT`** —
`Expansion2_Buildings.xml` gives it `ResourceTypeConvertedToPower="RESOURCE_URANIUM"` and
`NuclearReactor="true"`. There is no `BUILDING_NUCLEAR_POWER_PLANT` row; the coal and oil
plants are `BUILDING_COAL_POWER_PLANT` and `BUILDING_FOSSIL_FUEL_POWER_PLANT`. So ask 4 needs
no new save at all now — only the district placed once, the Workshop and Factory on it, and a
watch of `GetReactorAge` / `GetReactorAccidentThreshold`.

---

# Part three — ask 4, the reactor (turns 130-160, after the reload)

The owner reloaded the turn-130 autosave and relaunched with the tuner up. Ask 4 had been
"waiting for a save with Nuclear Power Plants" since session 2. It did not need one.

## The rig: a reactor built from the socket

In Gathering Storm the reactor is **`BUILDING_POWER_PLANT`** — `Expansion2_Buildings.xml` gives
it `ResourceTypeConvertedToPower="RESOURCE_URANIUM"` and **`NuclearReactor="true"`**. There is
no `BUILDING_NUCLEAR_POWER_PLANT` row; the other two are `BUILDING_COAL_POWER_PLANT` and
`BUILDING_FOSSIL_FUEL_POWER_PLANT`.

    -- GameCore_Tuner, guarded by Has* so nothing is ever placed twice
    city:GetBuildQueue():CreateDistrict(GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].Index, plotIndex)
    city:GetBuildQueue():CreateBuilding(GameInfo.Buildings["BUILDING_WORKSHOP"].Index,  plotIndex)
    city:GetBuildQueue():CreateBuilding(GameInfo.Buildings["BUILDING_FACTORY"].Index,   plotIndex)
    city:GetBuildQueue():CreateBuilding(GameInfo.Buildings["BUILDING_POWER_PLANT"].Index, plotIndex)

Four calls, and `GetFalloutManager():GetReactorCount()` went 0 → **1**. (Population gates how
many districts a city may hold; `WorldBuilder.CityManager():SetCityValue(city, "Population", n)`
lifts it.)

## The readers, and the signature that was hiding

`GetReactorByIndex(i)` hands back the whole record — **`{ Age, CityID, LastAccidentTurn, Owner,
PlotIndex }`** — and it works in either state. The other two do **not** take an index, a plot or
that record; they take a **CITY object**, and they are **InGame only**:

    Game.GetFalloutManager():GetReactorAge(pCity)
    Game.GetFalloutManager():GetReactorAccidentThreshold(pCity)

(`DLC/Expansion2/UI/Loaders/ToolTipLoader_Expansion2.lua:172`, the Recommission Reactor
tooltip.) Eight argument shapes were tried in GameCore before the UI was read — GameCore's
fallout manager simply does not carry those two methods, which is why every shape failed.

## The age clock and the risk gates — measured

`Expansion2_RandomEvents.xml` carries three rows with `EffectOperatorType="NUCLEAR_ACCIDENT"`:

| event | Severity | **MinTurnAtRisk** | occurrences per game (minimal / light / moderate / heavy) |
|---|---|---|---|
| `RANDOM_EVENT_NUCLEAR_ACCIDENT_MINOR` | 0 | **10** | 2 / 1 / 1 / 1 |
| `RANDOM_EVENT_NUCLEAR_ACCIDENT_MAJOR` | 1 | **20** | 2 / 1 / 1 / 1 |
| `RANDOM_EVENT_NUCLEAR_ACCIDENT_CATASTROPHIC` | 2 | **30** | 2 / 1 / 1 / 1 |

The live game matches exactly. One reactor, read every ten turns of its life:

| reactor age | 1 | 10 | 20 | 30 |
|---|---|---|---|---|
| `GetReactorAccidentThreshold(city)` | **0** | **1** | **2** | **3** |

So the threshold is simply **how many severities the reactor has aged into**:
`threshold = |{ s : age >= MinTurnAtRisk(s) }|` over 10/20/30 — which is exactly how the game's
own tooltip reads it (`> 0` means a level-1 accident is possible, `> 1` means level 2). The age
itself ticks **+1 per turn** while the plant stands, and the record's `Age` and the city reader
agree at every reading.

**Thirty turns at risk and no accident fired by itself** (`LastAccidentTurn` stayed −1 through
ages 10-30 with the threshold at 1, then 2, then 3), so whatever the per-turn roll is, it is
rare. That is one data point on rarity, not a rate.

## What an accident does — all three severities, on three FRESH reactors

`GameRandomEvents.ApplyEvent{ EventType = def.Index, Location = reactorPlotIndex }` fires one on
purpose, the same door session 1 used for storms and volcanoes — and **it ignores the age gate**
(a severity-2 event fired cleanly on a reactor of age 0), so the 10/20/30 windows govern the
game's own selection, not what can be applied.

Three reactors were built in three different cities so each severity could be fired at a
reactor with **no accident history and an unpillaged Industrial Zone**:

| severity | event | city | fallout on the reactor tile | plots contaminated | population | district pillaged | plant removed |
|---|---|---|---|---|---|---|---|
| **0** MINOR | `..._MINOR` | Stavanger | **2 turns** | **1** — its own tile | 10 → **10** | **no** | no |
| **1** MAJOR | `..._MAJOR` | Oslo | **10 turns** | **1** — its own tile | 10 → **10** | **no** | no |
| **2** CATASTROPHIC | `..._CATASTROPHIC` | Nidaros | **20 turns** | **1** — its own tile | 12 → **11** | **YES** | no |

Four clauses fall out of that, and none of them is in either engine:

* **There is no blast radius.** Every severity contaminates exactly **one plot — the reactor's
  own** — and the map-wide contaminated count rose by exactly one each time. A meltdown is not
  a small nuke.
* **The fallout durations are the warheads' own**: 2, then **10** (a Nuclear Device's) and
  **20** (a Thermonuclear Device's).
* **Only the catastrophic one costs a citizen**, and it costs exactly **one**.
* **Only the catastrophic one pillages the Industrial Zone.** The plant itself is never removed
  and the reactor keeps being counted and keeps ageing, so a city can have the same reactor melt
  down repeatedly.

One reader caveat, because it nearly became a wrong row: `city:GetBuildings():IsPillaged(hash)`
**throws** for a building created through `buildQueue:CreateBuilding` and starts answering only
once the game has pillaged it. So in the table above "district pillaged" is the trustworthy
signal (`district:IsPillaged()` answers cleanly throughout); the building flags went `err → true`
for the Factory and the Power Plant at **every** severity, and for the Workshop only at
catastrophic, which reads as "the accident damages the plant's buildings at any severity and the
whole district only at severity 2" — but it rests on a reader that was erroring a moment before,
so it is the one line here I would re-measure before shipping.

Also worth the README: the GameCore fallout manager's own `IsPillaged`-style answer for the
power plant stayed `false` throughout while the InGame reader said otherwise — the same
wrong-object trap lab 2 paid for twice.

## What an accident does — severity 0, first pass (kept for the record)

`GameRandomEvents.ApplyEvent{ EventType = def.Index, Location = reactorPlotIndex }` fires one on
purpose, the same door session 1 used for storms and volcanoes. Firing
`RANDOM_EVENT_NUCLEAR_ACCIDENT_MINOR` (severity 0) at a reactor of age 30:

| | before | after |
|---|---|---|
| `LastAccidentTurn` | **−1** | **160** (the firing turn) |
| fallout on the reactor's plot | 0 | **2 turns** |
| contaminated plots, whole map | 0 | **1** — the reactor's own tile and nothing else |
| city population | 8 | **8** |
| Power Plant present / pillaged | true / false | **true / false** |
| reactor still counted | 1 | **1** |

So a **minor** accident is a two-turn contamination of the reactor's own tile, a stamp on
`LastAccidentTurn`, and nothing else: no population loss, no pillage, no destroyed plant, and
the reactor keeps running. Severities 1 and 2 were next.

## The turn stopped, and why — a trap for every future session

Autoplay stalled at turn 160: `lab.py advance` gave up after 300 s while the tuner stayed
perfectly healthy. The turn had in fact reached 161 and then stuck, and the reason is readable:

    NotificationManager.GetFirstEndTurnBlocking(me) -> ENDTURN_BLOCKING_COMMEMORATION_AVAILABLE

a new **era** had begun and the game wants a **Dedication** chosen. The UI's own call is
`UI.RequestPlayerOperation(me, PlayerOperations.COMMEMORATE, {PARAM_COMMEMORATION_TYPE = hash})`
(`DLC/Expansion2/UI/Additions/DedicationPopup.lua:214`) and it **does not clear the blocker from
the socket** — tried with an era-legal choice and with an illegal one, twice, and the blocker
stands. The popup appears to need its own UI context, so **this one costs the owner a click**.

Two facts found on the way, both worth the README: the table is **`CommemorationTypes`**, not
`Commemorations`, and each row has a `MinimumGameEra`/`MaximumGameEra` window, so the first row
in the table is the wrong answer late in the game (at `ERA_MODERN` the legal four are
EXPLORATION, ECONOMIC, INDUSTRIAL, MILITARY). The player's own `GetEras()` object carries only
`GetEra / SetEra / SetStartingEra` — the available-dedication list is not exposed.

## What the engines have today

Both engines already track the clock and nothing else. `cpu/core/stockpile.ts:resolveSeatPower`
increments `city.reactorAge` every turn the city holds `NUCLEAR_POWER_PLANT` and clears it when
the plant is lost (`cpu/core/production.ts:111`), `cpu/core/types.ts` documents it with the
pedia's own words, and `gpu/core/sim_seats.py:8655` is its twin. A grep for "accident" across
both engines finds **only those comments** — there is no roll, no severity, no effect. So:

* the **age clock** both engines ship is CORRECT against the live game (+1/turn, cleared with
  the building);
* the **risk gates** are new and now sourced: 10 / 20 / 30 turns for severities 0 / 1 / 2, with
  the threshold reading as a count of unlocked severities;
* the **payloads** are new and now measured for all three severities: 2 / 10 / 20 turns of
  fallout on the reactor's own tile and nowhere else, −1 population at severity 2 only, the
  Industrial Zone pillaged at severity 2 only, and the plant never removed.

## Ask H, the Pop Star's gold — answered from the install

A Rock Band never had to be built. `UNIT_ROCK_BAND` (Index 121, Cost 300, `MustPurchase`, civic
`CIVIC_COLD_WAR`) draws twelve level-1 promotions, and the Pop Star is `PROMOTION_POP`:

    PROMOTION_POP -> ModifierId ROCKBAND_POP
      ModifierType  MODIFIER_PLAYER_UNIT_ADJUST_TOURISM_BOMB_ADDITIONAL_YIELD
      YieldType     YIELD_GOLD
      Amount        -75

and the shipped text for it reads "Gain Gold equal to **25%** of the Tourism generated"
(confirmed in two locales). So the modifier's `Amount` is a **percentage adjustment away from
100**: −75 means the concert pays gold at 25% of its tourism. That is the provenance the ask
wanted; a live concert would only confirm the percentage, not source it.

Two related facts for whoever builds the scene later: the Rock Band's concert is **not** a
`UnitOperation` or a `UnitCommand` — a sweep of both tables for ROCK/CONCERT finds nothing, so
it is triggered by entering the target city — and `PlayerOperations` carries **no WMD entry**,
so a Missile Silo launch is not a player operation either. `IMPROVEMENT_MISSILE_SILO` (Index 15,
`TECH_ROCKETRY`) and `UNIT_NUCLEAR_SUBMARINE` (Index 84, `TECH_TELECOMMUNICATIONS`) both exist,
so the silo/submarine delivery scene is still open and still needs its launch verb found.

## How OFTEN an accident fires — the rate law, as far as the game will say

The owner asked whether several Industrial Zones can be stacked in one city to sample faster.
**No**: `GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].OnePerCity` is **true**, and the Power
Plant is one per city behind it, so **one reactor per city** — a sample of N reactors is N
cities. (Founding cities from the socket is cheap, so that is a limit on effort, not on scale.)

**Where the rate lives.** Each accident row points at a `RandomEvent_Frequencies` collection,
keyed by realism setting, whose only column is `OccurrencesPerGame`:

| realism | MINIMAL | LIGHT | MODERATE | HEAVY | HYPERREAL |
|---|---|---|---|---|---|
| each accident severity | **2** | 1 | **1** | 1 | 1 |

This game is `GAME_REALISM = 2` = **MODERATE**, so 1 apiece. The accident rows carry **no chance
column at all** — `ChanceIncreasePerDegree`, `Duration`, `Hexes`, `Spacing` are all 0 and
`TargetCities`/`Global` are false — and `GameClimate`, which exposes `GetFloodPercentChance`,
`GetStormPercentChance`, `GetDroughtPercentChance`, `GetEruptionPercentChance` and
`GetFirePercentChance`, has **no equivalent for accidents**. So the per-turn chance is not
published anywhere; only the weight and the age gate are.

**The instrument, found:** `GameRandomEvents.GetEventsForTurn(t)` returns **one record per
turn** — `{RandomEvent (an index into GameInfo.RandomEvents), Name, StartTurn, EndTurn,
CurrentLocation, PopLost, UnitsLost, TilesDamaged, FertilityAdded, Volcano, River}`. Walking
every turn played is therefore a complete event history of the game.

**Two laws fall straight out of 175 turns of that history:**

1. **At most ONE random event per turn.** The log has a single slot per turn, and **79 of 175
   turns** carried an event — a ~45% chance that *something* fires on a given turn, across all
   families. (A forced second event on the same turn still *applies* — my two catastrophic
   accidents on turn 161 both did their damage — but only the first is logged, which is a trap
   for anyone reading the log as ground truth.)
2. **`OccurrencesPerGame` is a WEIGHT, not an expected count.** Observed against parameter, over
   175 of the game's 250 turns:

| event | parameter | observed |
|---|---|---|
| FLOOD_1000_YEAR | 1 | **14** |
| FLOOD_MODERATE | 2 | 14 |
| FLOOD_MAJOR | 1.5 | 11 |
| DROUGHT_MAJOR | **23** | 9 |
| TORNADO_FAMILY | **15** | 5 |
| HURRICANE_CAT_4 | 15 | 4 |
| VOLCANO_GENTLE | 4 | 4 |
| DUST_STORM_GRADIENT | 8 | 3 |
| FOREST_FIRE | 6 | 1 |
| METEOR_SHOWER | 6 | 1 |

A parameter of 1 fired fourteen times and a parameter of 23 fired nine, so the number is not an
expected count and not a cap. It reads as a weight into a **per-turn draw among the events that
are currently ELIGIBLE**, and eligibility is what the map supplies: floodplains for floods,
volcanoes for eruptions, the right terrain for tornadoes — and, for an accident, **a reactor
whose age has passed that severity's `MinTurnAtRisk`**.

**So the shape of the accident law is:** each turn the game draws at most one event from the
eligible pool with these weights; an accident is eligible only per reactor past 10 / 20 / 30
turns of age, and carries weight 1 (2 at MINIMAL) against a pool that, on this map, produced 79
events in 175 turns dominated by floods, volcanoes and droughts. That is why a single reactor
sat at risk for 30 turns and nothing happened, and it predicts that the accident's share of the
draw should rise with the number of eligible reactors — the one part of the law a sampling run
can still test.

### The sampling run: zero in ~150 reactor-turns

Five reactors (Skedsmo, Nidaros, Stavanger, Oslo, Otsu — one per city, because the district is
`OnePerCity`), all aged past every gate, watched from turn 175 to **turn 205**:

| | turns 175 → 205 |
|---|---|
| reactors at risk | 5, thresholds all **3** (ages 75 / 44 / 44 / 44 / 30) |
| reactor-turns at risk | ~**150** |
| other random events that fired | **17** (turns with an event: 79 → 96) |
| **nuclear accidents fired by the game** | **0** |

The only two accidents in the whole 205-turn log are the ones I forced. So the per-reactor-turn
probability is bounded: zero in ~150 reactor-turns puts the 95% upper bound (rule of three) at
about **2% per reactor-turn**, and under 10% per turn for a five-reactor empire — against a
system that fired 17 other events in the same 30 turns. That is consistent with the weight
reading: weight 1 against an eligible pool dominated by floods, volcanoes and droughts.

One thing this run cannot separate, and it needs saying: `OccurrencesPerGame` may also be a
**per-game budget**, and my forced MINOR and MAJOR both landed in the log, so the game may have
considered those two spent. Only a fresh game with reactors and no forced events can tell "rare"
from "already used up".

### What that means for the engines, beyond the reactor

`cpu/core/disasters.ts:disasterPhase` rolls each family **independently** every turn —
`if (nextRandom(state) < FLOOD_CHANCE * rate)` and the same again for drought — so the engine can
fire a flood *and* a drought on the same turn. The live game cannot: its log has **one slot per
turn**, and 79 of 175 turns carried exactly one event. Whatever the accident work becomes, the
per-turn draw itself is a structural difference worth recording: Civ 6 picks **at most one**
event from a weighted pool of the currently eligible, the engine rolls each family on its own
clock.

## The counterspy term — a negative result, and the reason it is only that

Session 1 fitted the offensive mission roll as 3d6 against `BaseProbability - k` and left the
**counterspy** column unmeasured. `UnitManager.GetResultProbability(op.Index, spy, plot)` is the
UI's own source, so the odds can be read with and without a defender — no mission, no roll, no
crash risk. Measured at Tokyo with a fresh level-1 spy, the whole band table came back for every
offensive operation (base 13 → success-undetected `0.2578125`, base 14 → `0.16015625`, base 15 →
`0.08984375`, base 16 → `0.04296875`, and the matching captured/killed/escape bands).

Then a counterspy was put in the target city — twice, once as the defender's own spy in its city
and once as mine in mine:

* `UNITOPERATION_SPY_COUNTERSPY` **can be started from the socket**, but only with the UI's own
  call shape: `UnitManager.CanStartOperation(spy, op.Hash, nil, true)` answers **true** where a
  `{PARAM_X, PARAM_Y}` table answers **false**, and the request then takes an empty table. Its
  `CategoryInUI` is `MOVE`, not `DEFENSIVESPY`, so it cannot be found by category either.
* **A spy put on counterspy duty vanishes from the unit list by the next turn** — both the AI's
  and my own. A whole-map spy census found it gone, so from the tuner there is no way to confirm
  a counterspy is standing in a city.
* With the counterspy assigned, **the odds did not move at all** — byte-identical to the
  undefended baseline, on the same turn and a turn later.

So the honest reading: **the counterspy does not enter the probabilities the UI reads**, which
matches session 1's finding that district, pillage and garrison do not either. Whether it enters
the actual roll is NOT settled — that needs a sample of real missions against a city whose
counterspy can be confirmed standing, and the confirmation reader does not exist on this side of
the socket.

## Ask 9, the city-state watch — deliberately not run

The watch was set up (banks snapshotted at turn 131 and again at 173: Ngazargamu 57.5 → 12.5,
Antananarivo 229.9 → 253.9, Nan Madol 64.6 → 84.3, Armagh 3.9 → 0.0, Akkad and Muscat flat), but
what it measures — **what a city-state chooses to spend its gold on** — is AI behaviour, and the
owner's 2026-09-20 ruling puts the AI out of scope ("we model Civ 6's ENGINE, never its AI").
The engine-side halves of it (city-state income, unit upkeep) are already modelled. Recorded
rather than pursued, so the turns went to ask 4 instead.

---

# Part four — the laws of randomness (turn 205)

Run file: `tools/civ6lab/runs/rng_20260921T090000Z.jsonl`; the fits are
`tools/civ6lab/rng_fit.py` and `combat_roll_fit.py` (both re-runnable).

## The generator itself — identified exactly

`Game` in GameCore carries **`GetRandNum(range, "reason")`, `GetRandomSeed()` and
`SetRandomSeed(s)`** (none of the three exists on the InGame `Game` object). That is enough to
read the generator off directly rather than infer it from mechanics. Setting a seed and drawing
gives the state transition; the same seed twice gives the same stream, so there is no hidden
entropy and no per-call reseed.

    state' = (1103515245 * state + 12345) mod 2^32      -- the ANSI/glibc LCG, signed int32
    r16    = range mod 65536                            -- the range argument is TRUNCATED to 16 bits
    if r16 == 0:  return 0 and DO NOT advance the state
    draw   = ((state' >> 17) * r16) >> 15               -- top 15 bits, scaled (not modulo)

**Confirmed on every observation**: 8 seed→seed pairs, 18 (range, draw) pairs spanning the 2^15
and 2^16 boundaries, and a 24-draw stream from seed 12345 reproduced exactly.

Three consequences:

* the fold is multiply-and-shift, so there is **no modulo bias** — but the resolution is 32768
  distinct values, and for a range above 32768 some outcomes are simply unreachable;
* **the range argument is truncated to 16 bits.** `GetRandNum(100000)` really draws in
  [0, 34464); `GetRandNum(1000000)` draws in [0, 16960); and any multiple of 65536 returns 0
  *without even advancing the state*. That is a real bug in the exposed call, and it is why the
  first fit of the fold failed on large ranges;
* the stream is **seed-reproducible from the socket**, which makes every random mechanic in the
  game measurable by seed accounting: set a seed, act, read the seed back, and step the LCG to
  learn how many draws the action consumed and what each one was.

## Combat's random multiplier — measured against the known stream

Both engines ship `damage = 30 * e^(0.04 * strengthDifference) * randomBetween(80%, 120%)` on
the wiki's word (`cpu/core/combat.ts:damageRoll`, GPU twin `_damage_roll`). Seed accounting
tests it directly: six ranged shots, each from a fresh Archer at a healed Warrior, each with the
rng state set beforehand.

| set seed | draws consumed | u = v/32768 | damage |
|---|---|---|---|
| 100000 | **1** | 0.2165 | 25 |
| 31337 | **1** | 0.4832 | 28 |
| 5000 | **1** | 0.6608 | 30 |
| 999999 | **1** | 0.9078 | 33 |
| 1000 | **1** | 0.9283 | 34 |
| 777777 | **1** | 0.9322 | 34 |

* **One attack consumes exactly one draw.** Every shot advanced the state by a single LCG step.
* Damage is monotone in that draw and linear in it: least squares gives
  `damage = 22.10 + 12.45u`, i.e. a base of ~28.3 with a spread of **44%** of base against the
  published 40%.
* Taking the published form literally, `damage = round(base * (0.8 + 0.4u))` with **base = 28.6**
  reproduces **all six** observations exactly (round-half-up). So the multiplier is
  **0.8 + 0.4 * (v / 32768)** — uniform across 32768 steps, drawn once per attack.

So the 80%–120% rule both engines took from the wiki is **right**, and it is now sourced from
the game rather than from a wiki sentence — including the shape (linear in one uniform draw) and
the cost (one draw per attack).

One trap paid for here: the first shot of the battery read 64 damage because the defender was
still at 66 HP from the previous test, and a wounded unit fights weaker. The defender must be
healed to full between shots or the strength difference moves under the measurement.

## What else is random, and what the game will say about it

| system | status |
|---|---|
| the generator | **identified exactly** (above) |
| combat damage multiplier | **measured**: one draw, `0.8 + 0.4u` |
| nuclear interception | **measured: no roll at all** — 2/2 stopped, deterministic on class + adjacency + ownership |
| nuclear blast kill | **measured: no roll** — 100% inside the radius, 0% outside, and the population rule is deterministic |
| spy mission outcome | the six band probabilities are readable per mission (`GetResultProbability`) and are exact 1/256-style fixed point (e.g. base 13 → 66/256 success-undetected). What the ROLL consumes is now measurable by seed accounting, and is not yet done |
| reactor accidents | gates and payloads measured; the per-turn selection is a weight-1 entry in the one-event-per-turn draw, bounded at <2% per reactor-turn |
| natural disasters | the per-turn chances are **readable directly**: `GameClimate.GetFloodPercentChance()` 21, storm 11, drought 5, eruption 14, fire 2 at climate level 0, each with a `Get*ClimateIncreasedChance()` companion — plus the one-event-per-turn draw and the 205-turn event log to validate against |
| goody huts, barbarian spawns, promotion offers, great-person draws | untouched, and all now cheap: seed accounting makes each one a set-seed / act / read-seed loop |

---

# Part five — the second game: no turn limit, and three more laws

The owner started a fresh game for the randomness work. Setup, read off the front end and
recorded: **ERA_INFORMATION** start (nukes, reactors, spies available from turn one),
**GAMESPEED_ONLINE**, **RULESET_EXPANSION_2**, realism **4 = HYPERREAL** (max disaster
intensity), 44x26 map, Aztec (human, seat 0) vs Portugal plus three city-states, and
**`TurnLimitType = NONE`, `maxTurns = 0`**. Run file
`tools/civ6lab/runs/rng2_20260921T100000Z.jsonl`.

**The turn limit is an engine option the setup UI never exposes.** `TurnLimitTypes` =
`{GAMESPEED, CUSTOM, NONE=-2137446946}` and `GameConfiguration.SetTurnLimitType` / `SetMaxTurns`
are live in the FrontEnd state — but a grep of the whole setup UI finds `SetTurnLimitType` only
in `Base/Assets/UI/Automation/*`. So the socket can set it before the game starts, and the
in-game `Game.GetMaxGameTurns()` then reads 0 instead of 250.

Also worth the README: the front end exposes the whole pre-game configuration —
`SetStartEra`, `SetGameSpeedType`, `SetMaxTurns`, `SetTurnLimitType`, `SetValue`,
`RegenerateSeeds`, and `PlayerConfigurations[i]:GetSlotStatus()` (`SS_OPEN/COMPUTER/CLOSED/
TAKEN/OBSERVER`). Checking the slots before Start caught a setup with **no human seat**, which
would have left every probe facing `localPlayer = -1`.

## The generator is not save-specific

Seed 12345 in the new game produces **the identical 24-draw stream** measured in the old one, on
a different map, a different era and a different ruleset load. So

    state' = (1103515245 * state + 12345) mod 2^32,  draw = ((state'>>17) * (range mod 65536)) >> 15

is the game's generator, not a property of one save.

## Disaster chances are map-dependent, not intensity-dependent alone

At realism 2 (old game, turn 175): flood **21**, storm **11**, drought **5**, eruption **14**,
fire **2**. At realism **4** (new game, turn 209, max intensity): flood **6**, storm **8**,
drought **4**, eruption **0**, fire **2** — *lower*, on a small map with no volcanoes. So
`GetFloodPercentChance()` and friends report the realised chance for THIS map, and eruption 0
with no volcano on the map is the tell. The chance is a function of **weight (realism) x eligible
targets (map)**, which is the same weight/eligibility model the 175-turn event history implied.

Two practical consequences:

* measuring at max intensity is safe for the **mechanism**, and every intensity's weights are
  already sourced from `RandomEvent_Frequencies` — but the realised chance cannot be carried
  from one map to another;
* the chance readers return 0 on the very first turn of a game and populate after the first turn
  is processed, which is an easy way to mis-read them as "disasters are off".

## Espionage: seed accounting says no, the probability table says 3d6

**Seed accounting fails here, and cleanly.** With the state set to 12345, starting
`UNITOPERATION_SPY_SIPHON_FUNDS` left the state at **12345, unchanged** — an espionage mission
consumes no draws when it is requested, so the outcome is rolled at the completion turn, where
the stream is shared with every other actor. Combat can be isolated this way; espionage cannot.

(Getting that far needed one thing worth recording: every offensive mission targets a particular
district, and a fresh Information-era city has only its centre, so `CanStartOperation` refuses
everything. `buildQueue:CreateDistrict` works on an AI's city too — a Commercial Hub was built
in Lisbon to make Siphon Funds legal.)

**But the returned probabilities settle it anyway.** `GetResultProbability` hands back six bands
as exact 1/256 fractions that sum to ~253/256 — the signature of truncated 8-bit fixed point,
not of a 256-sided die. Against 3d6:

| base | measured success | nearest 3d6 tail | tail |
|---|---|---|---|
| 13 | 0.49609 = 127/256 | 0.50000 | **P(3d6 >= 11)** |
| 14 | 0.37109 = 95/256 | 0.37500 | **P(3d6 >= 12)** |
| 15 | 0.25391 = 65/256 | 0.25926 | **P(3d6 >= 13)** |
| 16 | 0.15625 = 40/256 | 0.16204 | **P(3d6 >= 14)** |

Every row sits 1 to 1.5 parts in 256 below the exact tail — exactly the truncation of two bands
each rounded down — and the threshold is **base - 2** in all four, which is session 1's
`3d6 vs BaseProbability - k` with `k = 2` for a fresh spy. So the espionage roll is **3d6**, the
engine's `missionOutcome` model is correct, and the strange 253/256 sums are six truncations
rather than a different die. No missions were needed to establish it.

## Tribal villages — the draw decoded, then predicted

A goody hut is the last mechanic that resolves INSIDE the call, so seed accounting works on it
the way it worked on combat. `GoodyHuts.xml` is a two-level weighted table: six categories at
weight 100 each, then subtypes at 15 / 30 / 55 gated by a minimum `Turn` and by `MinOneCity`.
Huts were planted with `ImprovementBuilder.SetImprovementType(plot, IMPROVEMENT_GOODY_HUT, -1)`
and popped by walking a unit onto them between a seed set and a seed read.

Eight pops, then four predictions:

| draw | what it selects | evidence |
|---|---|---|
| **1** | **the category, as `floor(u * 6)`** over the six rows in XML order — 0 CULTURE, 1 GOLD, 2 FAITH, 3 MILITARY, 4 SCIENCE, 5 SURVIVORS | three pops with u1 in [1/6, 2/6) all paid **gold**; two seeds aimed at [2/6, 3/6) both paid **faith** |
| **2** | **the subtype by cumulative weight** — [0,15) LARGE, [15,45) MEDIUM, [45,100) SMALL | u2 = 0.2055 -> MEDIUM paid **+37 gold**; u2 = 0.4598 and 0.8525 -> SMALL paid **+20** each; two SMALL faith pops paid **+10** each |
| **3+** | only when the reward itself rolls something | a unit reward consumed **3** draws, one pop consumed 4; every simple payout consumed exactly **2** |

The predictive test is the part that matters: seeds 998 and 6980 were chosen *in advance* from
the fit to land in the FAITH bucket with a SMALL subtype, and both paid exactly **+10 faith**.
Of the other two, seed 12962 never popped its hut (no mover with moves left — a void row, not a
miss) and seed 5983 popped with no visible payout, which is unexplained and recorded as such;
the likeliest reading is that its reward landed a tick after the read, since the battery's read
is immediate while the first pop of the session — read in a later call — did show its unit.

Observed magnitudes at this era, for the record: SMALL gold 20, MEDIUM gold 37, SMALL faith 10.

## The combat multiplier, tested at both ends — and the confound that nearly ate it

The six-shot battery fitted `0.8 + 0.4u` but spanned only u = 0.22..0.93, so both ENDS of the
published multiplier were extrapolated. Since the stream is seedable, the endpoints can be
aimed at directly: seeds were chosen whose first draw lands at u = 0.00000 and u = 0.99997, and
the rival predictions were written down **before** firing.

The first attempt failed, and the failure was methodological, not physical: archers were spawned
BETWEEN shots, and Civ 6 gives the attacker a support/flanking bonus for each friendly unit
adjacent to the defender — so the strength difference moved under the measurement. (The original
six-shot battery was sound only because all six archers were spawned before any of them fired.)

Re-run with the board frozen — three archers already in place, defender healed to full between
shots, nothing else touched:

| u | damage | `round(32.0 * (0.8 + 0.4u))` |
|---|---|---|
| 0.00000 | **26** | 26 |
| 0.50000 | **32** | 32 |
| 0.99997 | **38** | 38 |

* the measured ratio 38/26 = **1.462**, and integer rounding puts the true ratio in
  **[1.415, 1.510]**;
* the published `0.8 + 0.4u` predicts **1.500** — inside the band;
* a plausible rival `0.9 + 0.2u` (a +/-10% spread) predicts **1.222** — excluded;
* one base, 32.0, reproduces all three damages exactly.

So the 80%-120% multiplier both engines ship is confirmed **at its endpoints**, measured rather
than extrapolated, and the linear-in-one-uniform-draw shape holds across the whole range.

Two standing lessons from this, for the next session:

* **spawn the whole rig before the first measurement.** Any unit added next to the defender
  changes the attacker's support bonus and therefore the base the multiplier multiplies.
* **a fitted constant does not travel.** The base of 28.6 measured in the old game predicted 23
  for the first shot here and the answer was 32: different map, different terrain, different
  adjacency. Only the SHAPE transfers between scenes; the base has to be refitted per pairing.

## Nuclear interception — the real law, and the retraction of "no roll"

The owner challenged the earlier grade of "effectively proof" for interception, and the
challenge was right: the old evidence was 3/3 successes (which barely bounds a probability)
plus one A/B pair per clause. The re-test with the seed instrument overturned the headline
claim and produced the actual mechanism.

**It is not a percentage roll and it is not certain.** A qualifying interceptor makes ONE
anti-air attack on the delivering bomber, using the ordinary combat damage roll — the same
`0.8 + 0.4u` multiplier and the same single draw measured for combat — and the strike is
cancelled only if that attack takes the bomber below half health:

    S_att  = max over adjacent qualifying interceptors of [ AA_base - 10*(1 - HP/100) ]
             + 5 * (sum over the OTHER adjacent interceptors of HP/100)
    S_def  = 86          (the Bomber's Combat is 85; 86 is what fits every row)
    damage = round( 30 * e^(0.04*(S_att - S_def)) * (0.8 + 0.4u) )     -- ONE rng draw
    cancelled  <=>  damage > 50

Every row below is the same seed (u = 0.04999) unless stated, so damage differences are
attributable to the variable under test:

| cell | scene | predicted | measured | outcome |
|---|---|---|---|---|
| A1 | 1 Mobile SAM (AA 100), full HP | — (baseline) | **43** | lands |
| A2 | 1 Anti-Air Gun (AA 90) | **29** | **29** | lands |
| A3 | 1 Giant Death Robot (AA 90) | **29** | **29** | lands |
| D1 | 1 Mobile SAM at 50 HP | **35** | **35** | lands |
| — | 2 SAMs, full HP | — | 52 | cancelled |
| — | 3 SAMs, full HP | 63 | **64** | cancelled |
| — | 4 SAMs, full HP | 78 | **77** | cancelled |
| D2 | SAM full + SAM 50 HP | — | **48** | lands |
| D2' | the same two, tiles swapped | 48 | **48** | lands |

What each row establishes:

* **Any unit with `AntiAirCombat > 0` intercepts**, not just the four the wiki names — an
  Anti-Air Gun and a Giant Death Robot both do, and both land exactly on the damage their AA
  value predicts. The unit's class is irrelevant; only `AntiAirCombat` enters.
* **Health enters through Civ 6's damaged-strength penalty**: a SAM at 50 HP attacks at
  AA 95 (-10 x half) and did exactly the predicted 35.
* **Stacking is additive in STRENGTH, multiplicative in damage.** Each additional adjacent
  interceptor adds about +5 combat strength (x1.21 damage), and adds NO extra attack —
  one draw in every case, 1 through 4 interceptors.
* **The strongest interceptor is the one that fires.** A healthy SAM beside a wounded one
  gives 48, not the 42 the wounded one alone would produce; swapping their tiles changes
  nothing, so the choice is by strength and not by tile order. The wounded one still
  contributes support, scaled by its own health (+5 x 0.5 = +2.5, which is what the 48 fits).
* The threshold is strictly `> 50`: a row that did exactly 50 damage **landed**.
* Attacker terrain is irrelevant (SAM on Plains vs Grass Hills: 43 both), and an interceptor
  at distance 2 contributes nothing at all.

Three of those were **pre-registered exact predictions** (29, 35, 29) rather than fits, which
is the strength of evidence the earlier claim only pretended to.

**Readers, for the next session:** `unit:GetAntiAirCombat()` and `unit:GetCombat()` return the
**XML base** values (Mobile SAM 100, Bomber 85) with no bonuses folded in — which is why the
modified strength had to be inferred from damage. `CombatManager.SimulateAttackVersus(attackerComponentID,
defenderComponentID [, CombatTypes.X])` is the UI's own preview and would give the modified
numbers directly, but it refused every argument shape tried here, most likely because a bomber
parked at its home base is not a legal anti-air target. `CombatTypes` carries
**MELEE, RANGED, BOMBARD, AIR, RELIGIOUS and ICBM** — the ICBM entry is the likeliest home of
the separate "chance to be shot down" that silo- and submarine-launched weapons are said to have.

The full matrix is `tools/civ6lab/INTERCEPT_SUITE.md`, and it has since been run.

## The rest of the matrix — and a SECOND interception rule

**The preview reader, which removed the need to infer anything.**
`CombatManager.SimulateAttackInto(bomber:GetComponentID(), CombatTypes.AIR, x, y)` returns
ATTACKER / DEFENDER / **ANTI_AIR** / **INTERCEPTOR** blocks keyed by `CombatResultParameters`
hashes. The ANTI_AIR block hands over the chosen interceptor's **ID and tile**, its base
anti-air strength, the support bonus **as text** ("+15 anti-air unit support") and
`DAMAGE_FROM`, the expected damage — so the stacking bonus I had inferred from damage was then
read straight out of the game. `SimulateAttackVersus` works the same way but refuses pairings
that are not a legal attack, which is why asking the SAM to attack the bomber had failed.

| cell | result |
|---|---|
| **weapon type** | **irrelevant**: the nuclear device matched the thermonuclear at three draws — 43 (lands), 49 (lands), **52 (cancelled)**. The threshold crossing is the part that matters; a single below-threshold round proves nothing about the threshold |
| **naval interceptors** | **they do not provide area cover at all.** A Destroyer adjacent on water gave no ANTI_AIR block over a land aim *or* over a water aim; the same for Battleship and Missile Cruiser. Attacked directly by a bomber, a Destroyer defends with **90 — its AntiAirCombat** — instead of its Combat 85. So naval `AntiAirCombat` is a DEFENSIVE stat, and the wiki's "Destroyers, Battleships and Missile Cruisers protect adjacent tiles" is **wrong for bomber-delivered nukes** in this build |
| **fighters** | no interception observed — the INTERCEPTOR block stayed empty with three enemy fighters in range, and no air-patrol stance exists in `UnitOperations` or `UnitCommandTypes` |
| **mixed types** | SAM (100) + AA gun (90): the preview **names the SAM** as the chosen unit and gives the gun as **+5 support** — "strongest fires" read directly rather than inferred |
| **supporter health** | a half-dead supporter contributes **+2**, not +5 — the support scales with the supporter's own HP |
| **promotions** | answered by the database: `UNIT_MOBILE_SAM` has `CanEarnExperience="false"` and cannot be promoted |
| **missile silo** | **not reachable from the socket.** `CityCommandTypes.WMD_STRIKE` exists but refuses with and without a silo placed; every WMD call in the shipped UI is a UNIT operation |
| **submarine** | **a different rule entirely — see below.** Also: a submarine has a **minimum range**; a target at distance 1 is offered as no legal target, distance 2 fires |

### Submarine-launched weapons obey a different rule

| | bomber | submarine |
|---|---|---|
| what the interceptor does | attacks the delivering unit | **nothing to the launcher — 0 damage** |
| draws consumed, interceptor present | 1 | 1 |
| draws consumed, no interceptor | 0 | **0** |
| outcome at u = 0.05 | **lands** (43 damage < 51) | **stopped** |
| outcome across u = 0.05 / 0.30 / 0.80 / 0.97 | depends on damage | **stopped every time** |
| control, no interceptor | lands | **lands** |

So the bomber rule is an attack whose damage decides, while the submarine rule is a straight
interception that did not vary with the draw at all. Four rounds spanning the whole draw range
were all stopped; the 95% lower bound on that rate is about **0.47**, so "an adjacent SAM always
stops a submarine launch" is consistent with the data but not established — it needs more
rounds, and that is the honest state of it.

### A circulating script, refuted

A script offered as a way to launch from a silo calls `Game.TriggerWMDAttack(playerID, originIdx,
targetIdx, wmdType)`. In this build **`Game.TriggerWMDAttack` is nil**, so is
`Game.TriggerWMDStrike`, there is no `WMDManager` global, and scanning every method on `Game`
for *WMD*, *Trigger* or *Attack* returns nothing. It is fabricated. The real verb, used by the
shipped UI and by every working launch here, is
`UnitManager.RequestOperation(unit, UnitOperationTypes.WMD_STRIKE, {PARAM_X, PARAM_Y, PARAM_WMD_TYPE})`.

### Strength of evidence, per claim

`tools/civ6lab/evidence.py` scores each claim against a stated null (an exact integer prediction
in a window of width W gives `W^-k`; a binary outcome gives `0.5^k`), so the weak claims are
visible rather than buried in adjectives:

| claim | p under null |
|---|---|
| RNG stream / fold / recurrence | 1e-78 .. 1e-109 |
| population loss rule (15 exact) | 3.1e-20 |
| espionage roll is 3d6 | 2.3e-10 |
| AA-strength law (3 pre-registered exact damages) | 1.9e-6 |
| support = +5 per interceptor | 6.3e-6 |
| weapon type irrelevant | 1.9e-6 |
| combat multiplier 0.8+0.4u | 1.9e-6 |
| damage > 50 cancels | 3.9e-3 |
| naval AA is defensive | 0.125 |
| submarine rule differs | 0.0625 |
| "strongest interceptor fires" | 0.25 |
| goody hut category = floor(6u) | 0.25 |

## State left behind — read this before playing on

**Final state: turn 175, game healthy, socket green.** Player 0 holds five cities — NIDAROS
(pop 11), STAVANGER (10), SKEDSMO (7), OSLO (9) and OTSU (5, which flipped in on loyalty) — and
**four working nuclear reactors** (Skedsmo, Nidaros, Stavanger, Oslo), three of which have been
made to melt down on purpose. Several cities were inflated with `ChangePopulation` /
`SetCityValue` for the scenes and are larger than they earned; war with Japan is still on.

*The paragraph below records the mid-session crash, which the owner recovered from by reloading
the turn-130 autosave.*

**Part two ended on turn 130 with the tuner socket gone.** The `CivilizationVI` process is
still alive and Windows reports it responding; the listener at 127.0.0.1:4318 stopped answering
immediately after the duplicate `CreateDistrict` call described above and did not come back
over six retries. Nothing was killed from here — the session only ever sent Lua over the
socket, and no save was written after turn 130. **Only the owner can bring it back**, and the
last clean state is whatever autosave turn 129 or 130 left.

Below is the state as of turn 128-130, when it was last readable. Player 0 held **five**
cities:

| city | pop | note |
|---|---|---|
| NIDAROS `36:22` | 4 | struck twice; its incomplete Aqueduct is gone |
| STAVANGER `38:19` | 1 | struck three times |
| SHIZUOKA `21:22` | 6 | never struck |
| **SKEDSMO `32:16`** | 5 | **founded by this session** for rows 14-15, inflated to 10 with `ChangePopulation`, struck twice |
| **OSLO `35:18`** | 1 | **appeared during this session and I cannot fully account for it** |

**SHIZUOKA revolted to the Free Cities seat (player 62) during turns 126-128** and is no longer
player 0's — it is the city the fallout-yield scene was run on, and it is now contaminated out
to radius 3 by hand (12 turns), with no blast damage of any kind.

Two things the owner should know before playing on:

* **Oslo is mine to explain and I can't, fully.** I spawned a scratch Settler at `34:17` while
  probing whether a forward base could be founded, then destroyed it — the destroy call printed
  `settler destroyed` — and later a city called OSLO appeared two tiles away at `35:18`,
  population 1. The most likely reading is that the destroy removed a different unit and that
  Settler founded the city when the FOUND_CITY request went out. Either delete it or keep it;
  it costs a little amenity pressure and nothing else. Skedsmo is deliberate and can go the
  same way.
* **War was declared on Japan** (player 1) to test whether enemy units blockade a worked tile.
  They do not, and all 26 blockading Warriors were destroyed again before any turn was played —
  but the war itself is still on.

Stock: 25 thermonuclear and 9 nuclear devices on player 0, a couple of Bombers with moves at
Nidaros and spent ones elsewhere. The repo changes are the new `.lua` probes and the three run
files under `tools/civ6lab/`.

## What is still open, and what it costs now

The placement API found in the last half hour changes the price of nearly all of it: districts,
buildings and population can be built from the socket, so "needs a later save" is no longer a
real blocker for most of the list.

| ask | state | what it needs now |
|---|---|---|
| **4 — reactor accidents** | **CLOSED** | age clock, risk gates and all three payloads measured; only the per-turn probability of the game firing one itself is open, and that wants a long watch |
| **H — the Pop Star's gold** | **CLOSED from the install** | `ROCKBAND_POP`: gold at **25%** of the concert's tourism (`Amount = -75` on the additional-yield modifier). A live concert would confirm, not source it |
| **C-2 — the research agreement** | **CLOSED** | the action is deleted in both expansions; Alliances replaced it at a 30-turn limit |
| **the counterspy term** | **negative result** | it does not enter `GetResultProbability`; settling whether it enters the ROLL needs real missions against a city whose counterspy can be confirmed standing, and no reader exposes that |
| **silo / submarine delivery** | **CLOSED** | both channels fire from the socket and both are stopped outright by one adjacent interceptor — see part six. The silo's launch verb was never missing; my parameter list was wrong |
| **14 — the thirty escape routes** | open | spies can be bought for gold and gold set from the socket; the blocker was always the number of runs |
| **9 — the city-state watch** | **out of scope** | what a city-state spends on is AI behaviour (owner's 2026-09-20 ruling); banks were snapshotted twice and recorded |
| **the Nuclear Emergency** | measured as "did not fire" | one reader on one seat after 21 launches; worth a second look with the World Congress state |

---

# Part six — the damage formula, the fractional strength, the silo, the GDR

Four questions from the owner. The first two turned into the largest single result of the
session, so they are answered first and at length.

## 1. Is a combat strength strictly an integer, or can it be fractional on the backend?

**It can be fractional, and the fraction is used.** The catalog inputs are integers and every
shipped modifier is an integer, but the engine scales some terms continuously and the display
floors what it shows.

What is integer, from the install:

* `01_GameplaySchema.sql` declares `Combat`, `RangedCombat`, `Bombard`, `ReligiousStrength` and
  `AntiAirCombat` as `INTEGER NOT NULL`;
* a sweep of every gameplay XML in Base, Expansion1 and Expansion2 finds **no fractional
  `Amount` anywhere** — not one modifier ships a decimal;
* every numeric field of a live attack preview, printed at `%.6f`, is an exact integer —
  `COMBAT_STRENGTH`, `STRENGTH_MODIFIER`, `DAMAGE_TO`, even the pre-cap `FINAL_DAMAGE_TO` of 159.

What is fractional. `GlobalParameters.xml` ships `COMBAT_ANTI_AIR_SUPPORT_BONUS_MODIFIER = 5`,
and the bonus scales with the supporting unit's health. Sweeping ONE supporter's health against
an otherwise fixed scene, reading the preview's own text beside its damage:

| supporter HP | 20 | 33 | 40 | 50 | 60 | 70 | 80 | 90 | 100 |
|---|---|---|---|---|---|---|---|---|---|
| `5 * hp/100` | 1.0 | 1.65 | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 4.5 | 5.0 |
| bonus the game PRINTS | +1 | +1 | +2 | +2 | +3 | +3 | +4 | +4 | +5 |
| expected damage | 56 | 57 | 58 | 59 | 61 | 62 | 63 | 64 | 66 |

40 HP is exactly +2 and 60 HP exactly +3. A 50 HP supporter prints "+2" like the 40 HP one, but
its damage is 59 — strictly between the 58 of +2 and the 61 of +3. The 33 HP and 90 HP rows do
the same thing. **The text floors the term; the damage uses the fraction.** Stacked, three 50 HP
supporters print "+2, +5, +7" — that is `floor(2.5)`, `floor(5.0)`, `floor(7.5)`, i.e. one
floating-point sum floored ONCE, not three floored terms (which would print +2, +4, +6).

So for the engine: keep strength as a float. Every base value and every modifier you will ever
read from the XML is an integer, but the health-scaled support terms are not, and rounding them
early changes the damage by a point.

### The damage formula itself — and the community formula is wrong

`CombatManager.SimulateAttackInto` turns out to be **deterministic**: four repeat reads agreed,
and seeding the generator to seven different values before each read changed nothing. So the
ANTI_AIR block's `DAMAGE_FROM` is a READ, not a draw, and the whole curve can be swept without
firing a shot. Three interceptors (`AntiAirCombat` 90, 100, 130) against all six air units in
the database give eleven values of `delta = S_att - S_def`, and the readings agree wherever two
different interceptors produce the same delta — so damage is a function of the DIFFERENCE alone.

    delta                     -20  -15  -10   -5    0    5   10   15   20   25   30
    measured                   14   17   20   25   30   36   44   54   66   80   97
    round(30 * 1.04^delta)     14   17   20   25   30   36   44   54   66   80   97
    round(30 * e^(0.04*d))     13   16   20   25   30   37   45   55   67   82  100

The formula every wiki and spreadsheet quotes, `30 * e^(0.04 * delta)`, **is refuted**: it is
wrong at five of the eleven, and under floor, round and ceil alike. The truth is the plain
compound rate: `COMBAT_POWER_SCALING = 0.04` is a rate per strength point, so the multiplier is
`(1 + 0.04)^delta`. The two agree near delta = 0 and drift apart by 3 points at delta = 30,
which is exactly why the error survived.

Putting the roll back in reproduces the five fired bomber rounds exactly:

    damage = round( (COMBAT_BASE_DAMAGE + GetRandNum(COMBAT_MAX_EXTRA_DAMAGE))
                    * (1 + COMBAT_POWER_SCALING) ^ (S_att - S_def) )

    u              0.05  0.30  0.40  0.45  0.48
    floor(12u)        0     3     4     5     5
    predicted        43    49    50    52    52
    measured         43    49    50    52    52

with `COMBAT_BASE_DAMAGE = 24`, `COMBAT_MAX_EXTRA_DAMAGE = 12`, `COMBAT_POWER_SCALING = 0.04`
all read straight out of `GlobalParameters.xml`. The preview substitutes half of
`COMBAT_MAX_EXTRA_DAMAGE` for the draw, which is the base 30 in the table above. Damage is
capped at `COMBAT_MAX_HIT_POINTS = 100` and floored at `COMBAT_MINIMUM_DAMAGE = 1`.

Two related constants that the same sweep cleared up:

* `COMBAT_DAMAGE_MULTIPLIER_MINIMUM = 0.25` does **not** floor this multiplier: a Warrior (20)
  previewed against a Giant Death Robot (135 effective) deals **1**, not the 7.5 the floor would
  give. Whatever that parameter clamps, it is not the unit-vs-unit damage multiplier.
* the ANTI_AIR and INTERCEPTOR blocks return **garbage** when no such unit exists (592, 24211).
  Always gate on the block's `ID`, never on its `COMBAT_STRENGTH`.

## 2. Is there a tech that upgrades a GDR's anti-air, and is the value unique?

Yes, and no.

`UNIT_GIANT_DEATH_ROBOT` ships `AntiAirCombat = 90` — **matched by the Destroyer, the Battleship
and the Anti-Air Gun**, so the base value is not unique and is not special-cased: the
interception law reads whatever `AntiAirCombat` the unit has and nothing about its class.

`TECH_ADVANCED_AI` grants `PROMOTION_GDR_AA_DEFENSE` through
`MODIFIER_PLAYER_UNITS_GRANT_PROMOTION` with the subject requirement
`REQUIRES_UNIT_GIANT_DEATH_ROBOT`. That promotion carries
`MODIFIER_SINGLE_UNIT_ADJUST_ANTI_AIR_STRENGTH_MODIFIER`, **Amount 40**, gated by
`PLAYER_IS_DEFENDER_REQUIREMENTS` AND `OPPONENT_IS_AIR_UNIT_REQUIREMENTS`. Whether those gates
are satisfied by an INTERCEPTION — as opposed to the GDR being attacked directly — was the open
question, and the discriminator was pre-registered before the grant.

    before the grant:  AntiAirCombat 90,  expected damage 36,  a fired round did 29 and LANDED
    after the grant:   AntiAirCombat 130, expected damage 100, a fired round did 100 and the
                       bomber was DESTROYED and the strike CANCELLED

So the +40 applies to interception, and 130 is the highest anti-air value reachable in the game.
It is also lethal by construction: `round(30 * 1.04^(130 - 85)) = 174`, above 100 at every roll,
so a teched GDR adjacent to the aim plot shoots down any bomber-delivered warhead with
certainty. The promotion is unique to the GDR; the 130 it produces is not matched by anything.

## 3. Silo controls

**The silo works, and the earlier "unreachable" entry was my mistake, not the engine's.** The
shipped UI (`Base/Assets/UI/WorldInput.lua`, `OnICBMStrikeEnd` / `ICBMStrike`, and
`CityBannerManager.lua`, `UpdateWMDBanner`) passes FOUR plot parameters, not two:

    tParameters[CityCommandTypes.PARAM_X0] = siloX        -- the SILO's plot
    tParameters[CityCommandTypes.PARAM_Y0] = siloY
    tParameters[CityCommandTypes.PARAM_X1] = targetX      -- the target
    tParameters[CityCommandTypes.PARAM_Y1] = targetY
    tParameters[CityCommandTypes.PARAM_WMD_TYPE] = eWMD
    CityManager.RequestCommand( Cities.GetPlotPurchaseCity(siloPlot),
                                CityCommandTypes.WMD_STRIKE, tParameters )

My earlier attempt used `PARAM_X` / `PARAM_Y`, which is the UNIT operation's vocabulary. With
the right ones the command offers **143 targets** and fires. The city is the one that PURCHASED
the silo's plot, not the nearest city.

Then the result, twelve rounds at chosen seeds:

| scene | rounds | outcome |
|---|---|---|
| one Mobile SAM (AA 100) adjacent to the aim | 9 | **9 stopped** — no fallout, the marker on the aim plot alive, the SAM at 100 HP, the warhead spent |
| one Anti-Air Gun (AA 90) adjacent | 3 | **3 stopped** — so the interceptor's strength does not enter this channel either |
| nothing adjacent | 3 | **3 detonations** — fallout on the aim, the marker destroyed |

The silo behaves like the submarine and nothing like the bomber: the launcher is never attacked,
no damage threshold is involved, and the strike is simply stopped. It is not a coincidence of
one channel — `CombatTypes` carries `ICBM` alongside `AIR`, and both ICBM-class channels obey it.

## 4. The two open cells

**B2, Jet Bomber.** Combat 90 against the Bomber's 85, same lone SAM, same scene. Predicted
`round(30 * 1.04^(100-90)) = 44`. Measured **44**. The delivery unit's `Combat` is the defence in
the anti-air attack, exactly as the law says; nothing about the Bomber is special.

**B4, Nuclear Submarine.** Five more rounds, at u = 0.13, 0.40, 0.80, 0.86, 0.998 — all
intercepted, launcher undamaged. (A stacking bug in the rig was eating half the rounds: a spent
submarine still occupies its tile and a naval unit cannot stack, so `Create` returned nil and the
battery read the failure as a refused launch. Fixed by clearing the previous submarine first.)

**Together: 9 submarine rounds and 12 silo rounds, 21 launches, 21 stopped**, spanning u = 0.05 to
0.998, against 3 unguarded controls that all detonated. The one-sided 95% lower bound on the stop
probability is 0.87. I am not claiming it is 1 — 21 rounds cannot — but no measured quantity
moves it (not the roll, not the interceptor's strength), and the honest statement is "at least
0.87, most likely certain".

**B5, Missile Cruiser.** Answered by the database rather than a round: no such unit exists in
this install. The only WMD-carrying unit is `UNIT_NUCLEAR_SUBMARINE`, and the only air units at
all are Biplane 80, Bomber 85, Jet Bomber 90, Fighter 100, P-51 105, Jet Fighter 110.

## What this part leaves open

* the support total at three FULL supporters (+15) reads 97 where the law says 97 — consistent —
  but the 33 HP and 50 HP single-supporter rows sit about 0.3 strength below `5 * hp/100`. Eleven
  of the thirteen support rows fit the term exactly and two are one damage point low. Sub-unit,
  unexplained, and worth one more sweep if the engine ever needs support to the point.
* whether the ICBM stop probability is exactly 1, or merely very high. Neither the roll nor the
  interceptor's strength moves it over 21 rounds, but 21 rounds only bound it at 0.87.
* `COMBAT_DAMAGE_MULTIPLIER_MINIMUM = 0.25` and `COMBAT_POWER_DAMPENER = 5` are shipped and
  neither has been located in a measured path.

## New probes from this part

`frac_pop.lua`, `frac_read.lua`, `frac_sim.lua`, `frac_versus.lua`, `frac_versus_read.lua`,
`frac_support.py`, `frac_support2.py`, `frac_curve.py`, `curve_fit.py`, `air_census.lua`,
`pop_setup2.lua`, `gdr_tech.lua`, `silo_launch.lua`, `silo_battery.py`, `blast_check.lua`, and a
stacking fix in `sub_launch.lua`. Part seven adds `xp_read.lua`, `xp_scene.lua`, `xp_spawn.lua`,
`xp_attack.lua`, `xp_melee.lua`, `xp_census.lua`, `range_targets.lua`, `clear_aim.lua`,
`xp_battery.py`, `xp_run.py`, `xp_melee_run.py` and `once_per_turn.py`. Rows appended to
`tools/civ6lab/runs/rng2_20260921T100000Z.jsonl`.

---

# Part seven — experience, and whether a nuke can ever get past an interceptor

## Is experience gain a roll?

**No — the amount is never drawn.** Three independent lines say so.

**The constants.** Every experience quantity in `GlobalParameters.xml` is a single fixed integer
and **not one of them is a range**. Read live from the running game:

| parameter | value | what it is |
|---|---|---|
| `EXPERIENCE_COMBAT_RANGED` | 1 | a ranged combat |
| `EXPERIENCE_NOT_COMBAT_RANGED` | 2 | a melee combat |
| `EXPERIENCE_COMBAT_ATTACKER_BONUS` | 1 | extra for being the attacker |
| `EXPERIENCE_KILL_BONUS` | 2 | extra for killing |
| `EXPERIENCE_DISTRICT_VS_UNIT` | 2 | a district firing on a unit |
| `EXPERIENCE_MAXIMUM_ONE_COMBAT` | **8** | the per-combat cap — Base ships 10, **Expansion2 overrides it to 8** |
| `EXPERIENCE_ACTIVATE_GOODY_HUT` | 5 | the Scout's tribal village |
| `EXPERIENCE_REVEAL_NATURAL_WONDER` | 10 | the Scout's natural wonder |
| `EXPERIENCE_CITY_CAPTURED` | 10 | capturing a city |
| `EXPERIENCE_UNIT_VS_DISTRICT_NOT_CITY_CAPTURED` | 3 | hitting a district without taking the city |
| `EXPERIENCE_MAX_BARB_LEVEL` / `EXPERIENCE_BARB_SOFT_CAP` | 2 / 1 | the anti-barbarian-farming cap: a unit stops banking barbarian experience past level 2 |
| `EXPERIENCE_NEEDED_FOR_NEXT_LEVEL_MULTIPLIER` / `EXPERIENCE_MAX_LEVEL` | 5 / 6 | the promotion ladder |

So the Scout channels the owner named are flat by construction: a tribal village is always 5, a
natural wonder always 10, a captured city always 10.

**The engine's own preview is seed-independent.** `SimulateAttackInto` hands back an
`EXPERIENCE_CHANGE` per block. Reading it for the SAME attacker at seven different seeds
(4, 8, 16, 32, 64, 128, 999999) gives byte-identical output every time — the same experience AND
the same damage. Whatever the engine is doing, it is not drawing.

**The award does not track the damage.** Six attackers of increasing strength against one
identical defender:

| attacker | strength | damage it takes | **attacker XP** | damage the defender takes | **defender XP** |
|---|---|---|---|---|---|
| Warrior | 20 | 43 | **4** | 21 | 6 |
| Spearman | 25 | 43 | **4** | 21 | 6 |
| Swordsman | 35 | 24 | **4** | 38 | 6 |
| Musketman | 55 | 11 | **4** | 83 | 6 |
| Infantry | 75 | 5 | **4** | 100 (dies) | 8 |
| Mechanized Infantry | 85 | 3 | **4** | 100 (dies) | 8 |

The attacker banks **4 regardless**, across damage from 3 to 43 and strength from 20 to 85. The
defender banks **6** — defending pays more than attacking — and **8**, the cap, when the combat
is lethal. A Warrior attacking a Giant Death Robot, which kills the Warrior, likewise reads 8.

**The one honest caveat.** I could not make a melee actually RESOLVE from the socket: a
`MOVE_TO` onto an enemy plot is accepted (`CanStartOperation` true, `RequestOperation` returns
ok) but nothing moves and no damage lands until the turn processes, and `RANGE_ATTACK` is
refused outright for a unit created this turn (its target list comes back empty even for a
visible enemy one tile away, while the WMD operations execute immediately because they target a
PLOT, not a unit). So the three lines above are the constants, the engine's own computation, and
its invariance — not a banked-and-counted XP total. What that leaves open is only whether the
engine applies the number it previews.

And one structural point that matters more than it looks: **`EXPERIENCE_KILL_BONUS` is an
outcome term.** The amount is not drawn, but *whether you killed* is, so the realised experience
of a combat still depends on the roll through the outcome. "Not RNG-based" is true of the
amount, not of the sequence.

**Anti-air units never earn any.** Five real interceptions banked exactly 0, and the database
says why: `UNIT_ANTIAIR_GUN`, `UNIT_MOBILE_SAM` and `UNIT_GIANT_DEATH_ROBOT` all ship
`CanEarnExperience="false"`. An interceptor can never promote.

## Can a warhead ever get past an interceptor on a non-bomber channel?

> **RETRACTED — see part eight.** Everything below this heading down to the next rule was
> written before the owner asked me to steelman it. The steelman broke it: the silo and
> submarine stop is **not** unconditional, it is the ordinary combat roll with a fixed warhead
> defence, and a weakened interceptor lets everything through. The counts below are real but the
> conclusion drawn from them is wrong — they were all high-strength interceptors, for which the
> leak probability happens to be zero. Read part eight instead.

Short answer: **on the bomber channel yes, easily; on the silo and submarine channels I have not
found a way.**

**The bomber channel has a real gap, and it is the roll.** Cancellation needs damage > 50, and
the damage is `round((24 + rand(0..11)) * 1.04^(AA - Combat))`. So:

* against a lone **Anti-Air Gun (90)** a Bomber takes 29..43 — **never above 50**, so a gun alone
  can never stop a nuke at any roll. Measured: the strike landed and killed the gun.
* against a lone **Mobile SAM (100)** the Bomber takes 43..63, so it is cancelled only when the
  draw gives `24 + n > 27.7`, i.e. `n >= 4`, i.e. **u >= 0.333**. Two thirds of the time it is
  stopped; a third of the time it gets through. Both outcomes were observed at the predicted
  seeds (u = 0.771 stopped, u = 0.312 landed).
* against a **GDR with `TECH_ADVANCED_AI` (130)** the damage is 174 at the worst roll — always
  above 50, so there is no gap at all.

**The silo and the submarine have no such gap.** Those channels are not an attack: the launcher
is never damaged, no threshold is involved, the strike is simply stopped. Everything I could vary
was varied and none of it moved the outcome:

| what was varied | rounds | stopped |
|---|---|---|
| the roll (u = 0.05 … 0.998) | 21 | 21 |
| the interceptor's strength — Anti-Air Gun 90 | 3 | 3 |
| the interceptor's strength — **teched GDR 130** (asked for explicitly) | 4 | 4 |
| repeat fire at the SAME interceptor in one turn, no rebuild between shots | 4 + 4 | 8 |
| **total, silo + submarine** | **29** | **29** |
| control: nothing adjacent | 4 | 0 stopped (all 4 detonated) |

The "fire twice and exhaust it" idea was the most promising route and it does not work: four
consecutive silo launches at one unmoved Mobile SAM were all stopped, and so were four at one
GDR. The same is true on the bomber channel — five consecutive strikes against one unmoved stack
of four Anti-Air Guns were all cancelled — so **there is no once-per-turn interception limit in
this game**, on either channel.

So the ranking, for the owner's purpose:

* a **silo or submarine** launch is the *worse* choice against a defended tile, not the better
  one. Its launcher is safe, but the warhead is stopped with what looks like certainty by any
  qualifying interceptor adjacent to the aim plot, however weak and however many times it has
  already fired this turn.
* a **bomber** is the only channel with a gap, and the gap is the damage roll. The price is that
  the bomber itself takes the hit.
* the way to beat an interceptor is therefore not the channel and not repetition — it is to
  **aim at a plot that has no qualifying interceptor within one tile**, which the earlier rounds
  already established as the only geometry that matters.

---

# Part eight — the coverage table, and a conclusion I had to retract

The owner asked two things: a table of every anti-air unit and how far it covers, and a steelman
of the "a silo launch cannot get past an interceptor" claim. The steelman **broke the claim**,
and it took two other claims down with it. This part is the correction.

## The coverage table

`ABILITY_ANTI_AIR_COVER` is attached to units by the `CLASS_ANTI_AIR` tag and carries **no
radius of its own**, so the radius is not in the database and had to be measured: one
interceptor placed at exactly distance d from the aim plot with nothing else of that player
within 4, then read the preview's ANTI_AIR block.

| unit | AntiAirCombat | domain | covers d=1 | covers d=2 | covers d=3 |
|---|---|---|---|---|---|
| Anti-Air Gun | 90 | land | **yes** | no | no |
| Mobile SAM | 100 | land | **yes** | no | no |
| Giant Death Robot | 90 (**130** with `TECH_ADVANCED_AI`) | land | **yes** | no | no |
| Destroyer | 90 | sea | **yes** | no | no |
| Battleship | 90 | sea | **yes** | no | no |
| Brazilian Minas Geraes | **95** | sea | **yes** | no | no |
| Missile Cruiser | **110** | sea | **yes** | no | no |

**Every anti-air unit in the game covers exactly one ring — the six tiles adjacent to it — and
nothing beyond.** There is no unit with a wider umbrella, and the `Range` column (1 for the two
land AA units, 3 for the ships and the GDR) is the RANGED ATTACK range and has nothing to do
with cover.

Each reading also re-confirmed the damage law to the point: Minas Geraes 95 gives 44
(`round(30·1.04^10) = 44`), Missile Cruiser 110 gives 80 (`round(30·1.04^25) = 80`).

### Two retractions this table forced

* **"Naval anti-air is defensive, not area cover" (suite A4/A5) is WRONG.** A Missile Cruiser on
  water covers an adjacent **land** aim plot — tested at four different land aims, all covered —
  and so do the Destroyer and the Battleship. The earlier negative was a bad scene, not a rule.
  The rule is uniform: *any* unit with `AntiAirCombat > 0` adjacent to the aim plot, whatever its
  domain.
* **"No Missile Cruiser exists in this install" (suite B5) is WRONG.** It exists, and at
  `AntiAirCombat` 110 it is the strongest interceptor short of a teched GDR. I had checked the
  AIR-domain unit list, which of course does not contain a ship.

## The steelman, and what it found

The owner's instinct was right and my conclusion was wrong. Three things made the difference:

**1. A silo launch consumes exactly ONE random draw when an interceptor is adjacent, and ZERO
when none is.** Measured by reading `Game.GetRandomSeed` either side of the shot and stepping
the known LCG between them: 1 draw with a SAM adjacent (3/3), 0 without (3/3). Something *is*
rolled — so "stopped outright" was never a safe reading.

**2. The weakest interceptor the socket can build leaks EVERYTHING.** The floor is
`AntiAirCombat` 90 (Anti-Air Gun, Destroyer, Battleship, unteched GDR) minus the health penalty
`10 × (1 − hp/100)`, i.e. **80.1** at 1 HP. Twenty silo launches at a 1 HP Anti-Air Gun, with
seeds chosen so the draw spanned its whole range: **20 detonations out of 20.**

*(The owner's other lever, the strategic-resource deficit, is real —
`COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL = 20` in Expansion2, and `Units_XP2` says the
Destroyer and Missile Cruiser pay `RESOURCE_OIL` 1 and the GDR `RESOURCE_URANIUM` 3 — but it is
charged at turn processing, which a mid-turn socket cannot induce. Zeroing the owner's oil
changed nothing. The two land AA units pay no upkeep at all, so they can never suffer it.)*

**3. Wounding the interceptor by degrees produced a smooth leak curve, not a cliff** — and the
curve is the bomber channel's own law with ONE new constant. The warhead defends at a fixed
value instead of a delivering unit's `Combat`:

    damage     = round( (24 + GetRandNum(12)) * 1.04^(S_att - D) )
    cancelled  <=>  damage > 50

    D = 85   bomber delivery      (the Bomber's own Combat)
    D = 72   MISSILE SILO         (measured, bracket [72.11, 72.33))
    D = 77   NUCLEAR SUBMARINE    (measured, bracket [76.98, 77.81), from integer strengths only)

Pre-registered and fired, with seeds chosen so the draw `n = GetRandNum(12)` takes **every value
0..11 exactly once**, so the round where the outcome flips is pinned rather than sampled:

| channel | interceptor | S_att | predicted flip at n | measured | correct |
|---|---|---|---|---|---|
| silo | Anti-Air Gun 60 HP | 86.0 | 6 | **6** | 12/12 |
| silo | Anti-Air Gun 35 HP | 83.5 | 9 | **9** | 12/12 |
| silo | Mobile SAM 30 HP | 93.0 | 0 (always) | **0** | 12/12 |
| submarine | Anti-Air Gun 100 HP | 90.0 | 7 | **7** | 12/12 |
| submarine | Mobile SAM 1 HP | 90.1 | 7 | **7** | 12/12 |

**60 of 60 pre-registered rounds correct**, including the exact `> 50` boundary: at 86 strength
the n=5 round previews 50 and **lands**, the n=6 round previews 52 and is **stopped**.

### So: yes, a warhead can get past an interceptor on every channel

The interception probability, for an interceptor of effective strength `S` and warhead defence
`D`, is the fraction of the twelve equally likely draws that clear 50:

    P(stopped) = (# of n in 0..11 with round((24+n) * 1.04^(S-D)) > 50) / 12

| interceptor | effective S | vs a SILO launch (D=72) | vs a SUBMARINE launch (D=77) |
|---|---|---|---|
| Anti-Air Gun / Destroyer / Battleship, full health | 90 | **11/12 = 92%** | **5/12 = 42%** |
| Anti-Air Gun at 60 HP | 86 | 6/12 = 50% | 0 |
| Anti-Air Gun at 1 HP | 80.1 | **0** | **0** |
| Minas Geraes, full health | 95 | 12/12 | 11/12 = 92% |
| Mobile SAM, full health | 100 | 12/12 | 12/12 |
| Missile Cruiser / teched GDR | 110 / 130 | 12/12 | 12/12 |

That completely reverses the practical advice I gave in part seven:

* a **submarine** launch is the *best* channel against an ordinary 90-strength interceptor, not
  the worst — it gets through **7 times in 12**, and the launcher cannot be shot at. Against a
  Mobile SAM it is still hopeless.
* a **silo** launch beats a 90-strength interceptor only 1 time in 12, but beats a merely
  wounded one routinely.
* a **bomber** is the only channel where the interceptor takes the damage and can be worn down —
  and against a lone Anti-Air Gun it always gets through, because 90 vs the Bomber's 85 tops out
  at 43 damage.
* **wounding the interceptor is the real lever**, and it is steep: an Anti-Air Gun at 60 HP
  stops half as often as at 100 HP, and at 1 HP it stops nothing on any channel.

### Does the LAUNCH DISTANCE matter? No — but the TARGET'S TERRAIN does

The owner asked why I had not tested this, which was a fair hit: I had listed it as open instead
of testing it. It is also where the unexplained `D` came from.

The silo stayed at `37:17` and the aim moved, with the interceptor held at a 60 HP Anti-Air Gun
(S = 86) so the flip between "lands" and "stopped" sits in the middle of the draw range, where a
change in `D` of one point moves it. Each round pins the draw by choosing the seed.

| silo → aim | distance | aim terrain | terrain + feature defence | flip at n | implied D |
|---|---|---|---|---|---|
| 36:15 | 2 | Grassland Hills | **+3** | 6 | 72.1–73.0 |
| 34:15 | 4 | Plains + Forest | **+3** | 6 | 72.1–73.0 |
| 32:15 | 6 | Plains + Jungle | **+3** | 6 | 72.1–73.0 |
| 35:15 | 3 | Plains Hills + Jungle | **+6** | 2 | 68.3–69.3 |
| 30:15 | 8 | Grassland, no feature | **0** | 9 | 74.6–75.4 |

**Distance does nothing.** Three aims at distance 2, 4 and 6 with the same terrain bonus give the
*same* flip point, so the same warhead defence to within the resolution of a draw. The two aims
that looked like a distance effect were a jungle hill (easier) and bare grassland (harder).

**The aim plot's own defence modifier is SUBTRACTED from the warhead's defence** — rough ground
makes a nuke *easier* to shoot down, not harder:

    D = base - (aim plot's terrain DefenseModifier + feature DefenseModifier)
    base = 75     MISSILE SILO        bracket (74.86, 75.07]
    base ~ 80.3   NUCLEAR SUBMARINE   bracket (80.04, 80.56] -- 80 misses by 0.04

Pre-registered and fired: with `D = 75 - bonus`, a 60 HP gun should stop *nothing* at draws 0..3
on the three +3 tiles and the bare tile, and should stop draws 2 and 3 on the +6 tile.
**20 rounds, exactly those 2 stops and 18 lands.** The submarine was then re-measured at the +6
tile and moved by the predicted 3 points (D = 77.0–77.8 at +3, 74.3–75.2 at +6).

**The bomber channel is NOT affected by the aim plot's terrain.** The same Mobile SAM previews
54 damage against a Bomber aimed at the +3 tile and 54 at the +6 tile — because on that channel
the anti-air attacks the *bomber*, which is not standing on the aim plot, and its defence is its
own `Combat` of 85. On the ICBM channels there is no unit to attack, so the engine resolves the
shot over the target tile and the tile's modifier comes with it.

So for the owner's engine: rough terrain protects a *unit* standing on it and simultaneously
makes a *nuclear strike on that tile* easier to intercept. Nuking a city on flat ground is the
harder thing to stop.

### RESOLVED: both are integers — 75 and 80

The owner asked whether the decimals mattered and whether the submarine could be pinned. They
did matter, and it could. Two things were wrong with the brackets below: both submarine scenes
sat on tiles with a terrain bonus (so the answer carried the assumption that the tile term is
exactly `terrain + feature DefenseModifier`), and both flips fell at low draws where consecutive
damages are furthest apart.

**Fix 1 — stop assuming the health rule, measure it.** `hp_calib.py` reads the bomber preview at
16 healths. The preview is deterministic, is not affected by the aim plot's terrain, and the
Bomber defends with its own Combat 85, so `DAMAGE_FROM = round(30 * 1.04^(S - 85))` turns each
reading into a bracket on S. The damage ladder came out 36/36/35/34/34/33/32/32/31/31/30/29/28/
27/26/25 for hp 100→1, and **every step lands where `S = 90 - c*(1 - hp/100)` puts it**, with the
step positions confining `c` to roughly [9.85, 10.15]. The rule is real, not assumed.

**Fix 2 — aim at a BARE tile and walk the flip to the top of the draw range.** `30:15` is
Grassland with no feature, defence modifier 0, so the measured defence IS the base with nothing
to subtract. Sweeping the interceptor's health walks the flip into n = 10/11, where consecutive
damages differ by only 35/34 = 2.9% — 0.74 strength points instead of 1.04.

    SUBMARINE at the bare tile        SILO at the bare tile
    hp 100  flip 11                   hp 51  flip 11
    hp  97  flip 11                   hp 50  flip 11
    hp  95  flip 11   <-- last flip   hp 44  flip 11   <-- last flip
    hp  93  NO flip                   hp 43  NO flip
    hp  91  NO flip
    => base in (79.952, 80.152]       => base in (74.954, 75.054]

**Submarine = 80.** The window is 0.2 wide and centred on 80; the full-health row alone, which
assumes nothing about health at all, already gives (79.913, 80.652]. And 80 is the Nuclear
Submarine's own `Combat`, so the coincidence was the explanation after all.

**Silo = 75.** Window 0.1 wide around 75. One further row (hp 51, where n=10 landed) pushes the
lower edge to 75.013 — a miss of 0.013, which is entirely absorbed by the health coefficient's
own ±0.15: at c = 10.15 rather than 10.0 that row lands at 74.94 and contains 75.

**The earlier ~80.3 was the terrain assumption, not the warhead.** Checking the tile term
separately: terrain-only +3 (Grassland Hills, `36:15`) and feature-only +3 (Plains + Jungle,
`32:15`) give the *same* flip at 7, both consistent with base 80. The single tile that still
wobbles is the STACKED one, Plains Hills + Jungle at `35:15` (nominal +6), which implies an
effective bonus of about 5.93 rather than 6.00. So the residual sits in how hills and a feature
combine, not in the warhead — and it is 0.07 of a strength point.

    FINAL:  D = 75 - (aim plot terrain + feature DefenseModifier)   MISSILE SILO
            D = 80 - (same)                                          NUCLEAR SUBMARINE
            D = the delivering unit's Combat, no terrain term        BOMBER

### The brackets as they stood before that sweep

Every bracket here comes from a flip point between two adjacent draws, so the width depends on
where the cancellation test is applied. The bomber channel settles that: a measured damage of
**exactly 50 lands** and 52 cancels, and 50 and 52 are the INTEGER damages the bomber took. So
the engine rounds first and tests the integer — `round(x) > 50`, i.e. `x >= 50.5`. Re-deriving
every bracket that way:

| channel | scene (no health-penalty assumption unless noted) | base bracket |
|---|---|---|
| silo | full-HP AA gun, +3 tile, flip n=1 | (74.030, 75.072] |
| silo | 60 HP AA gun, +3 tile, flip n=6 | (74.858, 75.722] |
| silo | 60 HP AA gun, 0 tile, flip n=9 | (74.335, 75.133] |
| silo | 60 HP AA gun, +6 tile, flip n=2 | (74.003, 75.082] |
| **silo, all four** | | **(74.858, 75.072]** |
| submarine | full-HP AA gun, +3 tile, flip n=7 | (79.722, 80.561] |
| submarine | full-HP AA gun, +6 tile, flip n=4 | (80.037, 80.964] |
| **submarine, both** | | **(80.037, 80.561]** |

**The silo is 75 and I would write that down.** Four independent scenes, at three different
terrain bonuses and two interceptor healths, close to a 0.21-wide window that contains exactly
one round number.

**The submarine looked like it was NOT 80** — two scenes closing to (80.04, 80.56], missing 80
by four hundredths. **That was the second of the two candidate explanations, and the bare-tile
sweep above confirms it:** the tile term on the stacked hills-plus-jungle aim is about 5.93, not
6.00, and with the terrain term removed entirely the submarine measures 80.

The bases remain unsourced either way: the `WMDs` table has no strength column at all — only
`BlastRadius`, `FalloutDuration`, `ICBMStrikeRange` and `Maintenance`.

### Which side does the terrain modifier actually sit on?

Only the DIFFERENCE `S_att - D` is observable, so "the tile's modifier is subtracted from the
warhead" and "the tile's modifier is added to the interceptor" are the same measurement. The
second is the more natural reading and makes this an ordinary rule rather than a special case:
on the ICBM channels there is no unit to shoot at, so the engine resolves the shot **over the
target plot**, with the warhead as the attacker at a fixed strength and the anti-air unit as the
defender — and a defender gets the combat plot's terrain bonus, exactly as in any other fight.
On the bomber channel the anti-air is the ATTACKER and its target is an aircraft that is not
standing anywhere, so no tile modifier can enter on either side.

### A bonus rule the distance sweep turned up

Two far aims were refused as silo targets although they sat inside the nuclear device's
`ICBMStrikeRange` of 12. They are simply **unrevealed**. A third at distance 8 was *revealed but
not currently visible* and was a legal target. So a silo can fire at **any revealed plot in
range** — current visibility is not required, exploration is.

### One void result, recorded so it is not mistaken for data

A 12-round thermonuclear silo battery came back "12 stopped" and it is **worthless**: the
thermonuclear was never launched. Its blast radius is 2 and the silo at `37:17` is 2 tiles from
the aim at `36:15`, so the game refused the target outright — `targetOffered: false`,
`canStart: false`, 141 offered targets instead of the nuclear device's 143, and the stock never
moved. **A warhead cannot be aimed within its own blast radius of the silo that fires it**, which
is itself a rule worth keeping. Nothing is claimed here about whether weapon type changes the
ICBM interception.

## State this part left in the live game

* **player 1 now has `TECH_ADVANCED_AI`** — granted deliberately for the GDR test and never
  taken back. Their Giant Death Robots intercept at 130.
* a `IMPROVEMENT_MISSILE_SILO` stands at `37:17`, built by the socket.
* player 0's city at `39:16` had its population set to 6, 7, 8, 9, 10 and finally **11** by the
  fractional-strength probe.
* warhead stock on player 0: 40 thermonuclear, 27 nuclear at the last read. Fallout covers most
  of the ring around `36:15` (20 turns) from the interception rounds, and `36:15` itself carries
  10 turns from the last unguarded silo control.
* a scratch Warrior of player 0 sits at `38:14` (the `frac_versus` attacker), and a marker
  Warrior of player 1 is on `36:15` or was destroyed, depending on the last round fired.
