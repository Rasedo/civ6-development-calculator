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
LUA_BLOCKER = """
local b = NotificationManager.GetFirstEndTurnBlocking(Game.GetLocalPlayer())
local name = "none"
for k, v in pairs(EndTurnBlockingTypes) do if v == b then name = k end end
print("blocker " .. name)
"""


# ---------------------------------------------------------------------------
def turn(t: Tuner) -> int:
    return int(t.run(GC, LUA_TURN)[0])


def local_player(t: Tuner) -> int:
    for st, lua in ((IG, "print(Game.GetLocalPlayer())"), (GC, LUA_TURN)):
        try:
            v = t.run(st, lua)[0]
            if st == IG:
                return int(v)
        except TunerError:
            pass
    return 0


def advance(t: Tuner, how: str, lp: int, wait: float) -> int:
    """Move the game ONE turn and return the new turn number."""
    t0 = turn(t)
    if how == "autoplay":
        print("   ", t.run(GC, LUA_AUTOPLAY % lp)[0])
    else:
        print("   ", t.run(IG, LUA_ENDTURN)[0])
    deadline = time.monotonic() + wait
    nagged = 0.0
    while time.monotonic() < deadline:
        time.sleep(2.0)
        try:
            tn = turn(t)
        except TunerError:
            continue
        if tn > t0:
            return tn
        if how == "endturn" and time.monotonic() - nagged > 20:
            nagged = time.monotonic()
            try:
                print("   ", t.run(IG, LUA_BLOCKER)[0],
                      "— clear it in the game (or rerun with --advance autoplay)")
            except TunerError as e:
                print("   ", e)
    raise TunerError(f"turn did not advance past {t0} within {wait}s")


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
    a = p.parse_args(argv)
    try:
        return a.fn(a)
    except TunerError as e:
        print("TUNER:", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
