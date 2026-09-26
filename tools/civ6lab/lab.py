"""civ6lab — end-to-end experiments against the REAL game.

The question ledger's DLL-side asks (storm walk, spy odds, cost progressions)
have no XML row and no readable source. They DO have an oracle: the running
game, reached over the tuner socket (`tuner.py`). Each subcommand here is one
experiment — it sets a scene through the debug states, advances turns, and
records what the engine did, so the ledger can cite a measurement instead of
a forum post.

    python tools/civ6lab/lab.py probe                # is the wire up, which states exist
    python tools/civ6lab/lab.py lua "print(1)"       # run a snippet (default state GameCore_Tuner)
    python tools/civ6lab/lab.py storm                # ASK 16: trigger a hurricane, follow it

Records land in tools/civ6lab/runs/ (JSONL + a summary), named by UTC time.

What the owner does: set `EnableTuner 1` in AppOptions.txt (done on this box),
close FireTuner.exe if it is open, launch Civ 6, start or load ANY Gathering
Storm game and reach the map. Everything after that is this file.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import time
from collections.abc import Callable

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402

GC = "GameCore_Tuner"
RE = "TunerGameRandomEvents"
IG = "InGame"
RUNS = pathlib.Path(__file__).parent / "runs"


# ---------------------------------------------------------------------------
# small Lua helpers, kept as strings so a failure prints the game's own error
# ---------------------------------------------------------------------------
LUA_TURN = "print(Game.GetCurrentGameTurn())"

LUA_PROBE_GC = """
local w, h = Map.GetGridSize()
print("turn=" .. Game.GetCurrentGameTurn())
print("grid=" .. w .. "x" .. h)
local ok, lp = pcall(function() return Game.GetLocalPlayer() end)
print("localPlayer=" .. tostring(ok and lp or "n/a"))
print("GameClimate=" .. tostring(GameClimate ~= nil))
print("GameRandomEvents=" .. tostring(GameRandomEvents ~= nil))
print("AutoplayManager=" .. tostring(AutoplayManager ~= nil))
print("UnitManager=" .. tostring(UnitManager ~= nil))
if GameClimate ~= nil then print("activeStorms=" .. GameClimate.GetNumActiveStorms()) end
local alive = {}
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    alive[#alive + 1] = p .. ":" .. tostring(PlayerConfigurations[p]:GetCivilizationTypeName())
  end
end
print("majors=" .. table.concat(alive, " "))
"""

LUA_PROBE_RE = 'print("GameRandomEvents=" .. tostring(GameRandomEvents ~= nil))'
LUA_PROBE_IG = ('print("UnitManager=" .. tostring(UnitManager ~= nil))\n'
                'print("localPlayer=" .. tostring(Game.GetLocalPlayer()))')

# The storm table's fields, as the game's own readers spell them:
# Debug/Storms.ltp prints StormType, Severity, StartTurn, CurrentDirection,
# CurrentLocation (a plot index — ClimateScreen.lua:226 hands it to
# Map.GetPlotByIndex). Everything else is dumped by pairs() so an unknown
# field shows up instead of being missed.
LUA_STORMS = """
local n = GameClimate.GetNumActiveStorms()
local now = Game.GetCurrentGameTurn()
print("turn " .. now .. " storms " .. n)
-- the game's own ledger of an event, keyed by its START turn: StartTurn,
-- EndTurn, StartLocation, CurrentLocation, TilesDamaged... read for the last
-- four start turns so a storm's record is seen at every stage of its life
for st = now - 3, now do
  local ok, ev = pcall(GameRandomEvents.GetEventsForTurn, st)
  if ok and type(ev) == "table" and ev.RandomEvent ~= nil then
    local parts = {}
    for k, v in pairs(ev) do parts[#parts + 1] = tostring(k) .. "=" .. tostring(v) end
    table.sort(parts)
    print("event " .. st .. " " .. table.concat(parts, " "))
    -- and the ground truth under the record's CURRENT location: pillaged
    -- plots within 2, so a stage that damages shows up even when
    -- TilesDamaged stays flat
    if ev.CurrentLocation ~= nil then
      local c = Map.GetPlotByIndex(ev.CurrentLocation)
      if c ~= nil then
        local pil = {}
        for i = 0, Map.GetPlotCount() - 1 do
          local q = Map.GetPlotByIndex(i)
          if Map.GetPlotDistance(c:GetX(), c:GetY(), q:GetX(), q:GetY()) <= 2 then
            local oki, ip = pcall(function() return q:IsImprovementPillaged() end)
            local okd, dp = pcall(function() return q:IsDistrictPillaged() end)
            if (oki and ip) or (okd and dp) then pil[#pil + 1] = q:GetX() .. ":" .. q:GetY() end
          end
        end
        print("pillaged " .. st .. " at " .. c:GetX() .. ":" .. c:GetY() .. " n=" .. #pil .. " " .. table.concat(pil, ","))
      end
    end
  end
end
for i = 0, n - 1 do
  local s = GameClimate.GetActiveStormByIndex(i)
  local parts = {}
  for k, v in pairs(s) do parts[#parts + 1] = tostring(k) .. "=" .. tostring(v) end
  table.sort(parts)
  local tdef = GameInfo.RandomEvents[s.StormType]
  print("storm " .. i .. " type=" .. tostring(tdef and tdef.RandomEventType or s.StormType)
        .. " " .. table.concat(parts, " "))
  if s.CurrentLocation ~= nil then
    local pl = Map.GetPlotByIndex(s.CurrentLocation)
    if pl ~= nil then print("loc " .. i .. " " .. pl:GetX() .. ":" .. pl:GetY()) end
    local ok, id = pcall(GameClimate.GetActiveStormIDAtPlot, pl:GetX(), pl:GetY())
    if ok and id ~= nil and id >= 0 then
      local ok2, plots = pcall(GameClimate.GetStormPlotsByID, id)
      if ok2 and type(plots) == "table" then
        local xs = {}
        for _, p in pairs(plots) do
          local pi = (type(p) == "table") and (p.PlotIndex or p.Index or p[1]) or p
          local q = Map.GetPlotByIndex(pi)
          if q ~= nil then xs[#xs + 1] = q:GetX() .. ":" .. q:GetY() end
        end
        table.sort(xs)
        print("plots " .. i .. " id=" .. id .. " n=" .. #xs .. " " .. table.concat(xs, ","))
      end
    end
  end
end
"""

LUA_PICK_PLOT = """
local want = %d
local cap = nil
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() and pl:IsHuman() then
    cap = pl:GetCities():GetCapitalCity()
    if cap ~= nil then break end
  end
end
if cap == nil then
  for p = 0, 62 do
    local pl = Players[p]
    if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
      cap = pl:GetCities():GetCapitalCity(); if cap ~= nil then break end
    end
  end
end
local cx, cy
if cap ~= nil then
  cx, cy = cap:GetX(), cap:GetY()
else
  -- turn 1: no city yet, so the human's first unit (the Settler) is home
  for p = 0, 62 do
    local pl = Players[p]
    if pl ~= nil and pl:IsAlive() and pl:IsMajor() and pl:IsHuman() then
      for _, u in pl:GetUnits():Members() do cx, cy = u:GetX(), u:GetY(); break end
    end
    if cx ~= nil then break end
  end
end
if cx == nil then print("nocapital") return end
local ocean = GameInfo.Terrains["TERRAIN_OCEAN"].Index
local best, bestd, bx, by = -1, 1e9, -1, -1
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  if q:GetTerrainType() == ocean then
    local d = math.abs(Map.GetPlotDistance(cx, cy, q:GetX(), q:GetY()) - want)
    if d < bestd then best, bestd, bx, by = i, d, q:GetX(), q:GetY() end
  end
end
print("capital " .. cx .. ":" .. cy)
print("plot " .. best .. " " .. bx .. ":" .. by .. " dist " .. Map.GetPlotDistance(cx, cy, bx, by))
"""

LUA_PICK_ROW = """
local row, reach = %d, %d
local ocean = GameInfo.Terrains["TERRAIN_OCEAN"].Index
local w, h = Map.GetGridSize()
local best, bestopen, bx = -1, -1, -1
for x = 0, w - 1 do
  local q = Map.GetPlot(x, row)
  if q ~= nil and q:GetTerrainType() == ocean then
    -- openness: the nearest plot that is NOT deep ocean, within `reach`
    local open = reach + 1
    for i = 0, Map.GetPlotCount() - 1 do
      local o = Map.GetPlotByIndex(i)
      if o:GetTerrainType() ~= ocean or o:GetFeatureType() ~= -1 then
        local d = Map.GetPlotDistance(x, row, o:GetX(), o:GetY())
        if d < open then open = d end
      end
    end
    if open > bestopen then best, bestopen, bx = q:GetIndex(), open, x end
  end
end
if best < 0 then print("noocean") return end
print("row " .. row .. " open-water radius " .. bestopen)
print("plot " .. best .. " " .. bx .. ":" .. row .. " dist " .. bestopen)
"""

LUA_APPLY = """
local def = GameInfo.RandomEvents["%s"]
if def == nil then print("noevent") return end
GameRandomEvents.ApplyEvent({ EventType = def.Index, Location = %d })
print("applied " .. def.RandomEventType .. " at " .. %d)
"""

LUA_AUTOPLAY = """
AutoplayManager.SetReturnAsPlayer(%d)
AutoplayManager.SetTurns(1)
AutoplayManager.SetActive(true)
print("autoplay " .. tostring(AutoplayManager.IsActive()))
"""

LUA_ENDTURN = 'UI.RequestAction(ActionTypes.ACTION_ENDTURN); print("endturn requested")'
# the blocker resolver (`unblock.lua`: escape routes, research, civic, idle
# cities, pantheon, governors, ...) — it never ends the turn itself
UNBLOCK = pathlib.Path(__file__).parent / "unblock.lua"
# the seat's first end-turn blocker, by name ("none" when nothing blocks) —
# a pending escape prompt first, found by its notification, since it can sit
# behind another blocker (`unblock.lua` answers it the same way)
LUA_BLOCKER = """
local b = NotificationManager.GetFirstEndTurnBlocking(ZSEAT)
local name = "none"
for k, v in pairs(EndTurnBlockingTypes) do if v == b then name = k end end
for _, nid in ipairs(NotificationManager.GetList(ZSEAT) or {}) do
  local n = NotificationManager.Find(ZSEAT, nid)
  if n ~= nil and n:GetType() == NotificationTypes.SPY_CHOOSE_ESCAPE_ROUTE then name = "ENDTURN_BLOCKING_SPY_CHOOSE_ESCAPE_ROUTE" end
end
print("blocker " .. name)
"""


# ---------------------------------------------------------------------------
def turn(t: Tuner) -> int:
    return int(t.run(GC, LUA_TURN)[0])


LUA_HUMAN_SEAT = """
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() and pl:IsHuman() then print(p) return end
end
print(0)
"""


def local_player(t: Tuner) -> int:
    """The seat Autoplay must hand control back to. The UI's
    Game.GetLocalPlayer() reads -1 WHILE Autoplay holds the seat — passing
    that to SetReturnAsPlayer parks the game with no local player and no
    turn end, ever (it did). So: the UI's answer when it is a seat, else the
    first human major in GameCore, else seat 0."""
    try:
        v = int(t.run(IG, "print(Game.GetLocalPlayer())")[0])
        if v >= 0:
            return v
    except (TunerError, ValueError):
        pass
    try:
        return int(t.run(GC, LUA_HUMAN_SEAT)[0])
    except (TunerError, ValueError):
        return 0


HERE = pathlib.Path(__file__).parent
COMMEMORATE = HERE / "commemorate.lua"
CLOSE_SESSIONS = HERE / "close_sessions.lua"

# The screens that can stand over a turn, each with the close its own script
# defines (the install's UI Lua: the diplomacy view's `OnForceClose` is what
# the game runs when a turn ends under a timer). None: the first of
# OnForceClose / OnClose / Close the context has. Each lives in its own Lua
# state, named after its context.
POPUPS: dict[str, str | None] = {
    "DiplomacyActionView": "OnForceClose",
    "DiplomacyDealView": "OnUserRequestClose",
    "LeaderScene": None,
    "InGamePopup": "OnClosePopup",
    "EraCompletePopup": "Close",
    "EraReviewPopup": "OnClose",
    "HistoricMoments": "Close",
    "NaturalWonderPopup": "Close",
    "NaturalDisasterPopup": "Close",
    "WonderBuiltPopup": "Close",
    "ProjectBuiltPopup": "Close",
    "BoostUnlockedPopup": "OnClose",
    "TechCivicCompletedPopup": "Close",
    "GreatPeoplePopup": "Close",
    "GreatWorkShowcase": "HideScreen",
    "WorldCongressIntro": "OnClose",
    "WorldCongressPopup": "OnClose",
    "WorldCrisisPopup": "Close",
    "RockBandPopup": "Close",
    "RockBandMoviePopup": "Close",
    "EventPopup": "OnClose",
    "DeclareWarPopup": "OnClose",
    "UnitPromotionPopup": "Close",
    "EspionagePopup": "Close",
    "UnitCaptured": None,
    "PlayerChange": "OnRequestClose",
}
LUA_VISIBLE = 'print((ContextPtr ~= nil and not ContextPtr:IsHidden()) and "open" or "hidden")'
LUA_CLOSE = """
if ContextPtr == nil or ContextPtr:IsHidden() then print("hidden") return end
local f = ZCLOSE
if f == nil then print("open, no close") return end
local ok, err = pcall(f)
print(ok and "closed" or ("close failed: " .. tostring(err)))
"""
GENERIC_CLOSE = "OnForceClose or OnClose or Close"
# the open diplomacy sessions between the seat and anyone
LUA_SESSIONS = """
local open = {}
for p = 0, 62 do
  if p ~= ZSEAT and Players[p] ~= nil then
    local ok, id = pcall(function() return DiplomacyManager.FindOpenSessionID(ZSEAT, p) end)
    if ok and id ~= nil and id >= 0 then open[#open + 1] = p .. ":" .. id end
  end
end
print("sessions " .. table.concat(open, ","))
"""
COMMEMORATION = "ENDTURN_BLOCKING_COMMEMORATION_AVAILABLE"
# the blockers `unblock.lua` answers (the escape prompt, found by its
# notification, whatever the first blocker is)
UNBLOCKED = frozenset("ENDTURN_BLOCKING_" + n for n in (
    "SPY_CHOOSE_ESCAPE_ROUTE", "RESEARCH", "CIVIC", "PRODUCTION", "PANTHEON",
    "GOVERNOR_APPOINTMENT", "GOVERNOR_PROMOTION", "CONSIDER_GOVERNMENT_CHANGE",
    "GIVE_INFLUENCE_TOKEN", "CONSIDER_RAZE_CITY"))


def _seat(lua: str, lp: int) -> str:
    return lua.replace("ZSEAT", str(lp))


def diagnose(t: Tuner, lp: int) -> list[tuple[str, str]]:
    """What holds the turn, as (kind, name) causes: the seat's first end-turn
    blocker ("blocker"), each open diplomacy session with the seat
    ("session", "<player>:<id>"), and each visible screen ("popup", its
    context). With no seat (lp < 0, an observer game) only the screens."""
    causes: list[tuple[str, str]] = []
    if lp >= 0:
        name = t.run(IG, _seat(LUA_BLOCKER, lp))[-1].split()[-1]
        if name != "none":
            causes.append(("blocker", name))
        out = t.run(IG, _seat(LUA_SESSIONS, lp))[-1].split()
        causes += [("session", s) for s in (out[1].split(",") if len(out) > 1 else [])]
    for s in POPUPS:
        if s in t.states:
            try:
                if t.run(s, LUA_VISIBLE, timeout=5)[-1] == "open":
                    causes.append(("popup", s))
            except (TunerError, IndexError):
                continue
    return causes


def handle(t: Tuner, lp: int, cause: tuple[str, str], session_lua: str | None = None) -> str | None:
    """Answer one cause the way its screen would; None when there is no
    handler for it. `session_lua` answers a session (default: close it)."""
    kind, name = cause
    if kind == "blocker":
        if name == COMMEMORATION:
            lua = COMMEMORATE.read_text(encoding="utf-8").replace("ZPICK", "")
        elif name in UNBLOCKED:
            lua = UNBLOCK.read_text(encoding="utf-8")
        else:
            return None
        return t.run(IG, _seat(lua, lp), timeout=30)[-1]
    if kind == "session":
        lua = session_lua if session_lua is not None else CLOSE_SESSIONS.read_text(encoding="utf-8")
        out = t.run(IG, _seat(lua, lp), timeout=30)
        return " | ".join(out) if out else "answered"
    if kind == "popup":
        return t.run(name, LUA_CLOSE.replace("ZCLOSE", POPUPS.get(name) or GENERIC_CLOSE), timeout=5)[-1]
    return None


def unstick(t: Tuner, lp: int) -> list[str]:
    """The blind sweep, for a turn held by nothing `diagnose` names: close
    every session of the seat and every visible screen. Returns what was
    done."""
    done = []
    if lp >= 0:
        try:
            out = t.run(IG, _seat(CLOSE_SESSIONS.read_text(encoding="utf-8"), lp))[-1]
            if not out.endswith("[]"):
                done.append(out)
        except (TunerError, IndexError):
            pass
    for s, fn in POPUPS.items():
        if s not in t.states:
            continue
        try:
            out = t.run(s, LUA_CLOSE.replace("ZCLOSE", fn or GENERIC_CLOSE), timeout=5)
        except TunerError:
            continue
        if out and out[-1] != "hidden":
            done.append(f"{s}: {out[-1]}")
    return done


def wait_turn(t: Tuner, t0: int, lp: int, wait: float, log: Callable[[str], None] = print,
              nudge: Callable[[], None] | None = None, session_lua: str | None = None,
              first: float = 5.0, poll: float = 3.0, blind: float = 30.0, ai_blockers: float = 15.0) -> int:
    """Wait for the turn counter to pass `t0` and return the new turn. Once
    the turn has stood `first` seconds, every `poll` seconds `diagnose` reads
    what holds it and each named cause is answered at once (`handle`) and
    logged by name — except a blocker the seat's AI answers itself under
    Autoplay (every one but the Dedication), which waits until the turn has
    stood `ai_blockers` seconds (0 in the endturn mode, where no AI plays the
    seat). `nudge` (the endturn mode's end-turn request) runs after an answer
    and every 20 s. The blind sweep (`unstick`) runs only when `blind`
    seconds pass with no cause answered."""
    start = time.monotonic()
    deadline = start + wait
    looked = start + first - poll
    answered = start
    nudged = start
    unknown: set[tuple[str, str]] = set()
    while time.monotonic() < deadline:
        # a short poll: the turn's own time is the AI's, and a coarse poll
        # adds up to its whole interval to every turn
        time.sleep(0.25)
        try:
            tn = turn(t)
        except TunerError:
            continue
        if tn > t0:
            return tn
        now = time.monotonic()
        if now - looked >= poll:
            looked = now
            try:
                causes = diagnose(t, lp)
            except (TunerError, IndexError) as e:
                log(f"    diagnose failed: {e}")
                causes = []
            acted = False
            for c in causes:
                if c[0] == "blocker" and c[1] != COMMEMORATION and now - start < ai_blockers:
                    continue
                try:
                    out = handle(t, lp, c, session_lua)
                except (TunerError, IndexError) as e:
                    out = f"failed: {e}"
                if out is None:
                    if c not in unknown:
                        unknown.add(c)
                        log(f"    cause {c[0]} {c[1]}: no handler")
                    continue
                acted = True
                log(f"    cause {c[0]} {c[1]} -> {out}")
            if acted:
                answered = now
                if nudge is not None:
                    nudge()
                    nudged = now
            elif now - answered >= blind:
                answered = now
                for msg in unstick(t, lp):
                    log(f"    blind sweep: {msg}")
        if nudge is not None and now - nudged >= 20:
            nudged = now
            nudge()
    raise TunerError(f"turn did not advance past {t0} within {wait}s")


def advance(t: Tuner, how: str, lp: int, wait: float, log: Callable[[str], None] = print,
            session_lua: str | None = None, **waits: float) -> int:
    """Move the game ONE turn and return the new turn number. `autoplay`
    hands the seat to the AI for one turn; `endturn` answers the seat's
    blocker (`unblock.lua`) and requests the end of the turn, again after
    each answered cause and every 20 s. `session_lua` and `waits` (first,
    poll, blind) go to `wait_turn`."""
    t0 = turn(t)
    if lp < 0:
        raise TunerError("refusing to autoplay with no seat to return to (lp=-1)")

    def end_turn() -> None:
        # a request sent once the next turn has begun ends that turn too,
        # leaving the seat a turn whose operations are all refused: request
        # only while the turn is still t0 (`IsTurnActive` is no guard — it
        # reads false at the start of some ordinary turns)
        try:
            if turn(t) != t0:
                return
            t.run(IG, LUA_ENDTURN)
        except (TunerError, IndexError) as e:
            log(f"    end turn: {e}")

    if how == "autoplay":
        log("    " + t.run(GC, LUA_AUTOPLAY % lp)[0])
        return wait_turn(t, t0, lp, wait, log, session_lua=session_lua, **waits)
    log("    " + t.run(IG, _seat(UNBLOCK.read_text(encoding="utf-8"), lp), timeout=30)[-1])
    end_turn()
    return wait_turn(t, t0, lp, wait, log, nudge=end_turn, session_lua=session_lua,
                     **{"first": 1.0, **waits, "ai_blockers": 0.0})


def parse_storms(lines: list[str]) -> list[dict]:
    out: dict[int, dict] = {}
    for ln in lines:
        w = ln.split()
        if not w:
            continue
        if w[0] == "storm":
            i = int(w[1])
            row = out.setdefault(i, {"i": i})
            for kv in w[2:]:
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    row[k] = _num(v)
        elif w[0] == "loc":
            x, y = w[2].split(":")
            out.setdefault(int(w[1]), {"i": int(w[1])})["xy"] = [int(x), int(y)]
        elif w[0] == "event":
            ev = {"startTurn": int(w[1])}
            for kv in w[2:]:
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    ev[k] = _num(v)
            out.setdefault(-1 - int(w[1]), {"i": -1, "event": ev})
            print(f"     event started t{w[1]}: " + " ".join(
                kv for kv in w[2:] if kv.split("=")[0] in ("EndTurn", "TilesDamaged", "UnitsLost", "PopLost", "FertilityAdded", "CurrentLocation")))
        elif w[0] == "pillaged":
            print(f"     pillaged within 2 of the t{w[1]} record's location {w[3]}: {w[4]} {w[5] if len(w) > 5 else ''}")
        elif w[0] == "plots":
            row = out.setdefault(int(w[1]), {"i": int(w[1])})
            row["stormId"] = int(w[2].split("=")[1])
            row["nPlots"] = int(w[3].split("=")[1])
            row["plots"] = w[4].split(",") if len(w) > 4 else []
    return [out[k] for k in sorted(out)]


def _num(v: str):
    try:
        return int(v)
    except ValueError:
        try:
            return float(v)
        except ValueError:
            return v


# ---------------------------------------------------------------------------
def cmd_probe(a) -> int:
    t = Tuner(a.host, a.port).connect()
    print("game  :", t.app)
    print("states:", ", ".join(f"{n}={i}" for n, i in sorted(t.states.items(), key=lambda kv: kv[1])))
    for st, lua in ((GC, LUA_PROBE_GC), (RE, LUA_PROBE_RE), (IG, LUA_PROBE_IG)):
        try:
            for ln in t.run(st, lua):
                print(f"{st:24s} {ln}")
        except TunerError as e:
            print(f"{st:24s} !! {e}")
    t.close()
    return 0


def cmd_lua(a) -> int:
    code = pathlib.Path(a.file).read_text(encoding="utf-8") if a.file else a.code
    if not code:
        print("give Lua inline or with --file")
        return 2
    for kv in a.set or []:
        k, v = kv.split("=", 1)
        code = code.replace(k, v)
    t = Tuner(a.host, a.port).connect()
    for ln in t.run(a.state, code, timeout=a.timeout):
        print(ln)
    t.close()
    return 0


def cmd_storm(a) -> int:
    t = Tuner(a.host, a.port).connect()
    lp = local_player(t)
    RUNS.mkdir(exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    jl = RUNS / f"storm_{stamp}.jsonl"
    print(f"local player {lp}; record -> {jl}")

    # the scene: which plot to strike
    if a.plot == "auto" or a.plot.startswith("row:"):
        if a.plot == "auto":
            got = t.run(GC, LUA_PICK_PLOT % a.dist)
        else:
            # the most open deep-ocean plot on one ROW: a walk that cannot
            # touch land or ice for `--dist` hexes, at a chosen latitude
            got = t.run(GC, LUA_PICK_ROW % (int(a.plot[4:]), a.dist), timeout=120)
        print("   ", " | ".join(got))
        plot_line = [g for g in got if g.startswith("plot ")]
        if not plot_line:
            print("no ocean plot found; pass --plot X,Y")
            return 2
        plot_idx = int(plot_line[0].split()[1])
        origin = plot_line[0].split()[2]
    else:
        x, y = (int(v) for v in a.plot.split(","))
        plot_idx = int(t.run(GC, f"print(Map.GetPlotIndex({x}, {y}))")[0])
        origin = f"{x}:{y}"

    re_state = RE if RE in t.states else GC
    event = a.type if a.type.startswith("RANDOM_EVENT_") else "RANDOM_EVENT_" + a.type
    rows: list[dict] = []

    def snapshot(tag: str) -> None:
        lines = t.run(GC, LUA_STORMS)
        tn = int(lines[0].split()[1])
        storms = parse_storms(lines[1:])
        print(f"  t{tn} [{tag}] {len(storms)} active storm(s)")
        for s in storms:
            print(f"     #{s['i']} {s.get('type')} sev={s.get('Severity')} start={s.get('StartTurn')}"
                  f" dir={s.get('CurrentDirection')} at={s.get('xy')} plots={s.get('nPlots')}")
            rows.append({"turn": tn, "tag": tag, "origin": origin, **s})
        with jl.open("a", encoding="utf-8") as f:
            for s in storms:
                f.write(json.dumps({"turn": tn, "tag": tag, "origin": origin, **s}) + "\n")

    for rep in range(a.repeat):
        snapshot("before")
        print("   ", t.run(re_state, LUA_APPLY % (event, plot_idx, plot_idx))[0])
        snapshot("after-apply")
        for k in range(a.turns):
            tn = advance(t, a.advance, lp, a.wait)
            snapshot(f"turn+{k + 1}")
        print(f"  repeat {rep + 1}/{a.repeat} done at turn {tn}")

    # the measurement: how far each storm's CurrentLocation moved per turn,
    # in the game's own metric (Map.GetPlotDistance), from the previous
    # location and from the strike plot
    by_id: dict = {}
    for r in rows:
        key = r.get("stormId", r.get("StartTurn"))
        by_id.setdefault(key, []).append(r)
    print("\nSUMMARY  (distance = Map.GetPlotDistance; dir = CurrentDirection)")
    ox, oy = (int(v) for v in origin.split(":"))
    for key, seq in by_id.items():
        seq = [s for s in seq if s.get("xy")]
        seq.sort(key=lambda s: s["turn"])
        prev = None
        for s in seq:
            x, y = s["xy"]
            d_prev = "-"
            if prev is not None and prev["turn"] != s["turn"]:
                d_prev = t.run(GC, f"print(Map.GetPlotDistance({prev['xy'][0]},{prev['xy'][1]},{x},{y}))")[0]
            d_org = t.run(GC, f"print(Map.GetPlotDistance({ox},{oy},{x},{y}))")[0]
            print(f"  storm {key}: turn {s['turn']:>4}  at {x:>3}:{y:<3} dir {str(s.get('CurrentDirection')):>3}"
                  f"  moved {d_prev:>2} from last turn, {d_org:>2} from strike, footprint {s.get('nPlots')}")
            if prev is None or prev["turn"] != s["turn"]:
                prev = s
    t.close()
    return 0


def cmd_advance(a) -> int:
    t = Tuner(a.host, a.port).connect()
    lp = local_player(t)
    for _ in range(a.n):
        print("turn", advance(t, a.advance, lp, a.wait))
    t.close()
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=4318)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("probe", help="handshake, list states, sanity-read the game").set_defaults(fn=cmd_probe)
    q = sub.add_parser("lua", help="run a Lua snippet and print its output")
    q.add_argument("code", nargs="?", default="")
    q.add_argument("--file", help="read the Lua from a file instead")
    q.add_argument("--set", action="append", metavar="TOKEN=VALUE",
                   help="textual substitution applied to the Lua before it runs (repeatable)")
    q.add_argument("--state", default=GC)
    q.add_argument("--timeout", type=float, default=15.0)
    q.set_defaults(fn=cmd_lua)
    s = sub.add_parser("storm", help="ASK 16: trigger a storm and record its walk")
    s.add_argument("--type", default="HURRICANE_CAT_5", help="RandomEvents row (Hexes 19, Movement 8, Duration 3)")
    s.add_argument("--plot", default="auto",
                   help="X,Y to strike; auto = ocean ~--dist from the capital; row:Y = the most open deep-ocean plot on row Y")
    s.add_argument("--dist", type=int, default=8)
    s.add_argument("--turns", type=int, default=5, help="turns to follow after the strike")
    s.add_argument("--repeat", type=int, default=1)
    s.add_argument("--advance", choices=("autoplay", "endturn"), default="autoplay")
    s.add_argument("--wait", type=float, default=300.0, help="seconds to allow one turn to pass")
    s.set_defaults(fn=cmd_storm)
    v = sub.add_parser("advance", help="pass N turns (Autoplay by default)")
    v.add_argument("--n", type=int, default=1)
    v.add_argument("--advance", choices=("autoplay", "endturn"), default="autoplay")
    v.add_argument("--wait", type=float, default=300.0)
    v.set_defaults(fn=cmd_advance)
    a = p.parse_args(argv)
    try:
        return a.fn(a)
    except TunerError as e:
        print("TUNER:", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
