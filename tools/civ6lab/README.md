# civ6lab — the real game as the oracle

The question ledger's DLL-side asks have no XML row and no readable source,
but the running game answers them if asked. Civilization VI opens a debug
socket (FireTuner, TCP 4318) when `EnableTuner 1` is set; `tuner.py` speaks
that protocol from Python, so a Lua snippet runs INSIDE the live game in any
of its Lua states and its `print()`s come back here. No mod, no GUI, no
screen-reading.

## One-time setup (done on this box 2026-09-13)

* Steam > Tools > *Sid Meier's Civilization VI SDK* installed (it is).
* `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VI\AppOptions.txt`
  — the LIVE user dir; `Desktop\My Games\...` is a 2019 fossil — has
  `EnableTuner 1` and `EnableDebugMenu 1` under `[Debug]`.
* FireTuner.exe must be CLOSED while the lab runs: the game accepts one client.

## A session

1. Launch Civ 6, start or load any Gathering Storm game, reach the map.
2. `python tools/civ6lab/lab.py probe` — lists the Lua states and reads the
   turn, grid and majors from `GameCore_Tuner`. Green = the wire is up.
3. Run an experiment. Records go to `runs/` as JSONL plus a printed summary.

The game must have the box: never run a battery in the same window.

## The states that matter

| state | what lives there |
|---|---|
| `GameCore_Tuner` | authoritative state: `Players[]`, `Map`, `Game`, `GameClimate`, `AutoplayManager` — the Player / Storms / Autoplay panels' home |
| `TunerGameRandomEvents` | `GameRandomEvents.ApplyEvent{EventType, Location}` — strikes a disaster at a plot |
| `InGame` | the UI's state: `UI.*`, `UnitManager.*` (incl. `GetResultProbability`), notifications |

The panel definitions in `<install>\Debug\*.ltp` are the API reference: each
names its state and shows working calls.

## Experiments

### `storm` — ASK 16, the storm walk

`Expansion2_RandomEvents.xml` gives a hurricane `Hexes=19 Movement=8
Duration=3 Spacing=15` and nothing says what `Movement` measures. The
experiment strikes `RANDOM_EVENT_HURRICANE_CAT_5` at an ocean plot ~8 from
the human capital, then for `--turns` turns records every active storm's
`CurrentLocation`, `CurrentDirection`, `StartTurn` and footprint, and prints
per turn how far the centre moved (in `Map.GetPlotDistance`) from the last
turn and from the strike plot. Turns advance by Autoplay (1 turn, return as
the human) so end-turn blockers never stall it; `--advance endturn` uses the
UI's End Turn instead and names the blocker if one stops it.

    python tools/civ6lab/lab.py storm --turns 5 --repeat 2

What settles the ask: distance per movement turn, how many turns it moves,
and whether it moves once (the pedia's three stages) or twice (the wiki).

RESULT (2026-09-13, 31 storms): one movement turn displaces the centre 4-8
hexes in open water (1-5 against the ice), always along the storm's
`PrevailingWinds` band, with off-axis wobble — eight unit steps, each drawn
from the band; the dissipation turn displaces the record once more and adds
no observed damage. Written up in `docs/AUDIT.md` under ask 16 / C-49.

### `spy_probe.lua` — the mission roll (InGame)

    python tools/civ6lab/lab.py lua --state InGame --file tools/civ6lab/spy_probe.lua \
        --set SPYID=<unit id> --set TX=<x> --set TY=<y>

Reads `UnitManager.GetResultProbability` for every offensive mission of one
Spy against one district plot — the UI's own source. Spawn the spy first
from `GameCore_Tuner`: `Players[0]:GetUnits():Create(GameInfo.Units["UNIT_SPY"].Index, x, y)`
(the civic `CIVIC_DIPLOMATIC_SERVICE` via `GetCulture():SetCivic(idx, true)`).
`spy_promote.lua` grants a promotion (`SetPromotion`); a Spy's XP cannot be
raised from the tuner.

RESULT: one 3d6 roll against `BaseProbability - k`, six outcome bands by
margin, k = 2 for a fresh spy, +2 under Gain Sources; district, pillage and
garrison do not enter. Full table in `docs/AUDIT.md` under C-16.

BEWARE AUTOPLAY: it plays YOUR units too. The first spy left in a city came
back nine turns later with a Gain Sources boost on that city and a mission
running, and the boost read as a mystery +2 until the city's
`GetSourceTurnsRemaining` was checked. Spawn fresh actors for each reading,
or read before advancing turns.

### Turn advancement and the Autoplay trap

`lab.py advance --n N` passes turns by Autoplay (1 turn, return as the
human seat). NEVER let `SetReturnAsPlayer` see -1: the UI's
`Game.GetLocalPlayer()` reads -1 while Autoplay holds the seat, and a
return player of -1 parks the game with no local player and a turn that
never ends — `SetActive(false)`, `SetTurns(0)` and every seat-setting call
in both states were tried and none recovers it; only loading the autosave
does. `local_player()` now falls back to the human major in GameCore and
`advance()` refuses -1.

### Other probes

* `trade_probe.lua` (InGame) — a route's yields decomposed the UI's way
  (`--set OOWNER=<player> --set ONAME=<city name fragment>` picks the
  origin; default player 0's capital).
* `sight_find.lua` (GameCore) + `sight_read.lua` (InGame) — the sight
  matrix: observer elevation x first-tile kind, visibility along one ray.
* `volcano_snap.lua` / `volcano_erupt.lua` (GameCore) — plots within 3 of a
  volcano before/after `RANDOM_EVENT_VOLCANO_*` (the event needs the
  NAMED volcano's index, matched by the plot's displayed name).
* `cs_probe.lua` (InGame) — every city-state's gold, faith, units, build.
* `prod_state.lua` (InGame) — a city's per-item production ledger.

### `xml_modifiers.py` — the install's modifier ledger, both XML styles

    python tools/civ6lab/xml_modifiers.py MODIFIER_PLAYER_ADJUST_SPY_BONUS ...

Policies.xml and friends write modifier rows as child ELEMENTS, not
attributes; a line grep for `ModifierType="..."` returns nothing there and
reads as "no such modifier exists". This parses the XML and prints each
modifier's arguments and what attaches it.

### `lua` — anything else

    python tools/civ6lab/lab.py lua "print(GameClimate.GetNumActiveStorms())"
    python tools/civ6lab/lab.py lua --state InGame "print(Game.GetLocalPlayer())"

The next asks in line: ASK 14 spy odds via
`UnitManager.GetResultProbability(op, spy, plot)` (InGame; the UI reads its
percentages from this call), and the district/unit cost progressions via
`GetDistrictCost` / `GetUnitCost` under controlled tech and district counts.
