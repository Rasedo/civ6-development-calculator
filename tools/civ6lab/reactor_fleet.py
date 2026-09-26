"""civ6lab reactor_fleet — AUDIT C-1 / task #279: what each nuclear accident
severity DOES, measured over many reactors at once.

    python tools/civ6lab/reactor_fleet.py --host 127.0.0.3 setup --cities 8
    python tools/civ6lab/reactor_fleet.py --host 127.0.0.3 trials --loads 3
    python tools/civ6lab/reactor_fleet.py --host 127.0.0.1 trials --loads 5 --no-later --rig reactor_units_rig.lua --set ZMIL=UNIT_INFANTRY --set ZNAV=UNIT_DESTROYER

`setup` (a fresh human-seat game): found N cities for seat 0 on spaced land
plots, give each population 12, an Industrial Zone with Workshop, Factory and
the nuclear Power Plant (`reactor_scene.lua`, its guards against the double
create that crashed the game), a Farm on every free featureless land plot of
its ring, and save `reactor_base`.
`trials`: per load of `--save` (a failed load stops the run), for each
severity in turn on a FRESH load — snapshot every reactor city, fire the
accident at every reactor, snapshot at once, then (unless `--no-later`) pass a
turn and snapshot again. Each snapshot is read in BOTH states: GameCore (the
population, the Industrial Zone's pillage, each building's presence and
pillage, the ring improvements' pillage, the fallout) and InGame (the
building pillage reader that answers, `CanProduce`, the district, the plant's
age and threshold). Every pillage read prints true / false / "err:<msg>".
One JSONL row per city per accident, `runs/reactor_<save>_<stamp>.jsonl`.
The damage table's Percentages (`RandomEvent_Damages`) are either per-object
CHANCES or PROPORTIONS; enough accidents per severity tell which.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import lab  # noqa: E402
import game  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = lab.GC, lab.IG
SEVERITIES = ("RANDOM_EVENT_NUCLEAR_ACCIDENT_MINOR", "RANDOM_EVENT_NUCLEAR_ACCIDENT_MAJOR",
              "RANDOM_EVENT_NUCLEAR_ACCIDENT_CATASTROPHIC")

LUA_SITES = """
-- land plots where seat 0 could found, at least ZSPACE from every city and
-- from each other, one settler placed on each
local sites = {}
local function farEnough(x, y)
  for _, pl in ipairs(Players) do
    local ok, cs = pcall(function() return pl:GetCities() end)
    if ok and cs then for _, c in cs:Members() do
      if Map.GetPlotDistance(x, y, c:GetX(), c:GetY()) < ZSPACE then return false end
    end end
  end
  for _, s in ipairs(sites) do if Map.GetPlotDistance(x, y, s[1], s[2]) < ZSPACE then return false end end
  return true
end
local w, h = Map.GetGridSize()
for y = 3, h - 4, 2 do
  for x = 3, w - 4, 2 do
    if #sites < ZN then
      local p = Map.GetPlot(x, y)
      if p and not p:IsWater() and not p:IsImpassable() and not p:IsMountain() and p:GetOwner() == -1
         and p:GetFeatureType() < 0 and farEnough(x, y) then
        if UnitManager.InitUnit(0, "UNIT_SETTLER", x, y) then sites[#sites + 1] = {x, y} end
      end
    end
  end
end
for _, s in ipairs(sites) do print(s[1] .. " " .. s[2]) end
"""

LUA_FARMS = """
local c = nil
for _, x in Players[0]:GetCities():Members() do if x:GetX() == ZCX and x:GetY() == ZCY then c = x end end
if c == nil then print("nocity") return end
local farm = GameInfo.Improvements["IMPROVEMENT_FARM"].Index
local n = 0
for d = 0, 5 do
  local p = Map.GetAdjacentPlot(ZCX, ZCY, d)
  if p and not p:IsWater() and not p:IsMountain() and p:GetDistrictType() < 0 and p:GetFeatureType() < 0
     and p:GetImprovementType() < 0 and p:GetResourceType() < 0 then
    ImprovementBuilder.SetImprovementType(p, farm, 0); n = n + 1
  end
end
print("farms " .. n)
"""

# A pcall read as a JSON value: a number or boolean bare, nil as null, a string
# quoted, a call that threw as "err:<msg>" — so a clean false stays false.
LUA_J = r"""
local function esc(s) return (tostring(s):gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end)) end
local function J(ok, v)
  if not ok then return "\"err:" .. esc(v) .. "\"" end
  if type(v) == "number" or type(v) == "boolean" then return tostring(v) end
  if v == nil then return "null" end
  return "\"" .. esc(v) .. "\""
end
"""

# GameCore: one JSON line per reactor city — what an accident can touch
LUA_SNAP = LUA_J + """
local fm = Game.GetFalloutManager()
local iz = GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].Index
for k = 0, fm:GetReactorCount() - 1 do
  local r = fm:GetReactorByIndex(k)
  local c = CityManager.GetCity(r.Owner, r.CityID)
  if c then
    local bl, ds = c:GetBuildings(), c:GetDistricts()
    local d = ds:GetDistrict(iz)
    local izPil = d and J(pcall(function() return d:IsPillaged() end)) or "null"
    local bs = {}
    for row in GameInfo.Buildings() do
      if bl:HasBuilding(row.Index) then
        bs[#bs + 1] = "\\"" .. row.BuildingType .. "\\":" .. J(pcall(function() return bl:IsPillaged(row.Hash) end))
      end
    end
    local imps, pils = 0, 0
    for i = 0, Map.GetPlotCount() - 1 do
      local p = Map.GetPlotByIndex(i)
      if p:GetImprovementType() >= 0 and Map.GetPlotDistance(p:GetX(), p:GetY(), c:GetX(), c:GetY()) <= 3 then
        imps = imps + 1
        if p:IsImprovementPillaged() then pils = pils + 1 end
      end
    end
    local fall, fallMax = 0, -1
    local rp = Map.GetPlotByIndex(r.PlotIndex)
    for i = 0, Map.GetPlotCount() - 1 do
      if fm:GetFalloutTurnsRemaining(i) > 0 then
        fall = fall + 1
        local p = Map.GetPlotByIndex(i)
        local dd = Map.GetPlotDistance(p:GetX(), p:GetY(), rp:GetX(), rp:GetY())
        if dd > fallMax then fallMax = dd end
      end
    end
    -- every unit within 3 of the reactor: id, type, distance, damage
    local us = {}
    for q = 0, 63 do
      local o = Players[q]
      if o ~= nil and o:IsAlive() then
        for _, u in o:GetUnits():Members() do
          local dd = Map.GetPlotDistance(u:GetX(), u:GetY(), rp:GetX(), rp:GetY())
          if dd <= 3 then
            us[#us + 1] = "[" .. u:GetID() .. ",\\"" .. GameInfo.Units[u:GetType()].UnitType .. "\\"," .. dd
              .. "," .. J(pcall(function() return u:GetDamage() end)) .. "," .. q .. "]"
          end
        end
      end
    end
    local centre = ds:GetDistrict(GameInfo.Districts["DISTRICT_CITY_CENTER"].Index)
    local gar = centre and J(pcall(function() return centre:GetDamage(DefenseTypes.DISTRICT_GARRISON) end)) or "null"
    print("{\\"reactor\\":" .. k .. ",\\"city\\":" .. r.CityID .. ",\\"pop\\":" .. c:GetPopulation()
      .. ",\\"izPillaged\\":" .. izPil .. ",\\"buildings\\":{" .. table.concat(bs, ",") .. "}"
      .. ",\\"units\\":[" .. table.concat(us, ",") .. "],\\"garrisonDamage\\":" .. gar
      .. ",\\"improvements\\":" .. imps .. ",\\"impPillaged\\":" .. pils
      .. ",\\"falloutPlots\\":" .. fall .. ",\\"falloutMaxDist\\":" .. fallMax
      .. ",\\"falloutAtReactor\\":" .. fm:GetFalloutTurnsRemaining(r.PlotIndex) .. "}")
  end
end
"""

# InGame: the same reactors through the UI's readers — the building pillage
# reader lab 2 proved (`city:GetBuildings():IsPillaged(row.Hash)`, where the
# GameCore object answers false for a building the InGame one calls
# pillaged), `CanProduce(row.Hash, true)` as a second reader (UNVERIFIED as a
# pillage test: ProductionPanel.lua asks it before listing a repair), the
# Industrial Zone's `IsPillaged`, and the plant's age and accident threshold
# (`GetReactorAge` / `GetReactorAccidentThreshold` take the CITY).
LUA_SNAP_IG = LUA_J + """
local fm = Game.GetFalloutManager()
local iz = GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].Index
for k = 0, fm:GetReactorCount() - 1 do
  local r = fm:GetReactorByIndex(k)
  local okc, c = pcall(function() return Players[r.Owner]:GetCities():FindID(r.CityID) end)
  if not okc or c == nil then
    print("{\\"reactor\\":" .. k .. ",\\"city\\":" .. J(okc, c) .. "}")
  else
    local bl, bq = c:GetBuildings(), c:GetBuildQueue()
    local izPil = "null"
    for _, d in c:GetDistricts():Members() do
      if d:GetType() == iz then izPil = J(pcall(function() return d:IsPillaged() end)) end
    end
    local bs, cp = {}, {}
    for row in GameInfo.Buildings() do
      if bl:HasBuilding(row.Index) then
        bs[#bs + 1] = "\\"" .. row.BuildingType .. "\\":" .. J(pcall(function() return bl:IsPillaged(row.Hash) end))
        cp[#cp + 1] = "\\"" .. row.BuildingType .. "\\":" .. J(pcall(function() return bq:CanProduce(row.Hash, true) end))
      end
    end
    print("{\\"reactor\\":" .. k .. ",\\"city\\":" .. r.CityID .. ",\\"pop\\":" .. c:GetPopulation()
      .. ",\\"izPillaged\\":" .. izPil .. ",\\"buildings\\":{" .. table.concat(bs, ",") .. "}"
      .. ",\\"canProduce\\":{" .. table.concat(cp, ",") .. "}"
      .. ",\\"age\\":" .. J(pcall(function() return fm:GetReactorAge(c) end))
      .. ",\\"threshold\\":" .. J(pcall(function() return fm:GetReactorAccidentThreshold(c) end)) .. "}")
  end
end
"""

LUA_FIRE = """
local fm = Game.GetFalloutManager()
local def = GameInfo.RandomEvents["ZEVENT"]
local n = 0
for k = 0, fm:GetReactorCount() - 1 do
  local r = fm:GetReactorByIndex(k)
  if pcall(function() GameRandomEvents.ApplyEvent({ EventType = def.Index, Location = r.PlotIndex }) end) then n = n + 1 end
end
print("fired " .. n)
"""


def snap(t: Tuner) -> dict[int, dict]:
    """reactor index -> {"gc": the GameCore read, "ig": the InGame read}"""
    out: dict[int, dict] = {}
    for key, state, lua in (("gc", GC, LUA_SNAP), ("ig", IG, LUA_SNAP_IG)):
        for x in t.run(state, lua, timeout=120):
            if x.startswith("{"):
                r = json.loads(x)
                out.setdefault(r["reactor"], {})[key] = r
    return out


def load(host: str, save: str) -> None:
    """load `save` through `game.py load`; a failed load stops the run"""
    rc = game.cmd_load(argparse.Namespace(host=host, port=4318, name=save, wait=600.0))
    if rc != 0:
        raise SystemExit(f"load of {save!r} on {host} failed (game.py load returned {rc})")


def cmd_setup(a) -> int:
    t = Tuner(a.host).connect()
    sites = [tuple(map(int, ln.split())) for ln in
             t.run(GC, LUA_SITES.replace("ZSPACE", "6").replace("ZN", str(a.cities))) if ln.strip()]
    print("settlers at", sites, flush=True)
    found = (HERE / "pop_foundcity.lua").read_text(encoding="utf-8")
    scene = (HERE / "reactor_scene.lua").read_text(encoding="utf-8")
    for x, y in sites:
        print("   ", t.run(IG, found.replace("ZX", str(x)).replace("ZY", str(y)))[-1], flush=True)
    for x, y in sites:
        out = t.run(GC, scene.replace("ZCX", str(x)).replace("ZCY", str(y)).replace("ZPOP", "12"), timeout=60)
        print("   ", out[-1] if out else "?", flush=True)
        print("   ", t.run(GC, LUA_FARMS.replace("ZCX", str(x)).replace("ZCY", str(y)))[-1], flush=True)
    print("reactors:", t.run(GC, "print(Game.GetFalloutManager():GetReactorCount())")[-1], flush=True)
    save = (HERE / "save_named.lua").read_text(encoding="utf-8")
    print("   ", t.run(IG, save.replace("SAVENAME", "reactor_base"))[-1], flush=True)
    t.close()
    return 0


def cmd_trials(a) -> int:
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"reactor_{a.save}_{stamp}.jsonl"
    with open(out, "w", encoding="utf-8") as fh:
        for n in range(a.loads):
            for sev in SEVERITIES:
                load(a.host, a.save)
                t = Tuner(a.host).connect()
                lp = lab.local_player(t)
                turn = lab.turn(t)
                if a.rig:
                    # the rig is placed on the loaded game itself: a saved
                    # rig does not survive the load (the units move)
                    lua = (HERE / a.rig).read_text(encoding="utf-8")
                    for kv in a.set:
                        k, v = kv.split("=", 1)
                        lua = lua.replace(k, v)
                    placed = [x for x in t.run(GC, lua, timeout=60) if '"ok":true' in x]
                    print(f"    rig: {len(placed)} placed", flush=True)
                before = snap(t)
                # a load replays the same random stream, so every load of one
                # save repeats one outcome: burn a load-dependent number of
                # draws off the shared game RNG first
                t.run(GC, f"for i = 1, {n * 97} do TerrainBuilder.GetRandomNumber(100, 'lab burn') end")
                print(f"load {n} {sev.split('_')[-1]}:", t.run(GC, LUA_FIRE.replace("ZEVENT", sev))[-1], flush=True)
                now = snap(t)
                later = {}
                if a.later:
                    lab.advance(t, "autoplay", lp, 300.0)
                    later = snap(t)
                for k, b in before.items():
                    fh.write(json.dumps({"save": a.save, "load": n, "turn": turn, "sev": sev, "before": b,
                                         "now": now.get(k), "later": later.get(k)}) + "\n")
                fh.flush()
                t.close()
    print("->", out.name)
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.3")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("setup")
    s.add_argument("--cities", type=int, default=8)
    s.set_defaults(fn=cmd_setup)
    s = sub.add_parser("trials")
    s.add_argument("--loads", type=int, default=3)
    s.add_argument("--save", default="reactor_base", help="the named save each trial loads")
    s.add_argument("--rig", help="a GameCore Lua placed after each load, before the first snapshot")
    s.add_argument("--set", action="append", default=[], metavar="TOKEN=VALUE", help="token for the rig")
    s.add_argument("--no-later", dest="later", action="store_false",
                   help="read only before and right after the accident; pass no turn")
    s.set_defaults(fn=cmd_trials)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
