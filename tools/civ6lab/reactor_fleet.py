"""civ6lab reactor_fleet — AUDIT C-1 / task #279: what each nuclear accident
severity DOES, measured over many reactors at once.

    python tools/civ6lab/reactor_fleet.py --host 127.0.0.3 setup --cities 8
    python tools/civ6lab/reactor_fleet.py --host 127.0.0.3 trials --loads 3

`setup` (a fresh human-seat game): found N cities for seat 0 on spaced land
plots, give each population 12, an Industrial Zone with Workshop, Factory and
the nuclear Power Plant (`reactor_scene.lua`, its guards against the double
create that crashed the game), a Farm on every free featureless land plot of
its ring, and save `reactor_base`.
`trials`: per load of `reactor_base`, for each severity in turn on a FRESH
load — snapshot every reactor city, fire the accident at every reactor, pass a
turn, snapshot again. One JSONL row per city per accident under runs/: the
population, the Industrial Zone's pillage, each building's presence and
pillage, the ring improvements' pillage, the fallout.
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

# one JSON line per reactor city: what an accident can touch
LUA_SNAP = """
local fm = Game.GetFalloutManager()
local iz = GameInfo.Districts["DISTRICT_INDUSTRIAL_ZONE"].Index
for k = 0, fm:GetReactorCount() - 1 do
  local r = fm:GetReactorByIndex(k)
  local c = CityManager.GetCity(r.Owner, r.CityID)
  if c then
    local bl, ds = c:GetBuildings(), c:GetDistricts()
    local d = ds:GetDistrict(iz)
    local izPil = d and d:IsPillaged() or false
    local bs = {}
    for row in GameInfo.Buildings() do
      if bl:HasBuilding(row.Index) then
        local okp, pil = pcall(function() return bl:IsPillaged(row.Hash) end)
        bs[#bs + 1] = "\\"" .. row.BuildingType .. "\\":" .. tostring(okp and pil or false)
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
    print("{\\"reactor\\":" .. k .. ",\\"city\\":" .. r.CityID .. ",\\"pop\\":" .. c:GetPopulation()
      .. ",\\"izPillaged\\":" .. tostring(izPil) .. ",\\"buildings\\":{" .. table.concat(bs, ",") .. "}"
      .. ",\\"improvements\\":" .. imps .. ",\\"impPillaged\\":" .. pils
      .. ",\\"falloutPlots\\":" .. fall .. ",\\"falloutMaxDist\\":" .. fallMax
      .. ",\\"falloutAtReactor\\":" .. fm:GetFalloutTurnsRemaining(r.PlotIndex) .. "}")
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
    return {r["reactor"]: r for r in (json.loads(x) for x in t.run(GC, LUA_SNAP, timeout=120) if x.startswith("{"))}


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
    out = lab.RUNS / f"reactor_{stamp}.jsonl"
    with open(out, "w", encoding="utf-8") as fh:
        for load in range(a.loads):
            for sev in SEVERITIES:
                game.cmd_load(argparse.Namespace(host=a.host, port=4318, name="reactor_base", wait=600.0))
                t = Tuner(a.host).connect()
                lp = lab.local_player(t)
                before = snap(t)
                print(f"load {load} {sev.split('_')[-1]}:", t.run(GC, LUA_FIRE.replace("ZEVENT", sev))[-1], flush=True)
                now = snap(t)
                lab.advance(t, "autoplay", lp, 300.0)
                later = snap(t)
                for k, b in before.items():
                    fh.write(json.dumps({"load": load, "sev": sev, "before": b, "now": now.get(k),
                                         "later": later.get(k)}) + "\n")
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
    s.set_defaults(fn=cmd_trials)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
