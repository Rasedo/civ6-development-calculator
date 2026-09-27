"""The embedded VM: Lua 5.1 (lupa) running the install's map scripts, read at
run time in modinfo order (Base/Assets/Maps and Maps/Utility, then
DLC/Expansion1/Maps, then DLC/Expansion2/Maps over them, the last layer
winning a file name), with the native API rebuilt in `world.py` and bound to
the scripts' globals by the Lua prelude below.

Plots are one Lua table per plot, created once, so a plot used as a table
key (RiversLakes' `_rivers[plot]`) finds the same entry every time.

The scripts are Havok Script, not stock Lua 5.1: hks.py strips its type
annotations, and HKS_PAIRS / HKS_SORT give pairs and table.sort the orders
the game's logs show (see each).
"""
from __future__ import annotations

import pathlib

import lupa.lua51 as lua51

from .fractal import Fractal
from .gameinfo import INSTALL
from .hks import strip_annotations, table_order
from .world import World

LAYERS = [INSTALL / "Base/Assets/Maps", INSTALL / "Base/Assets/Maps/Utility",
          INSTALL / "DLC/Expansion1/Maps", INSTALL / "DLC/Expansion1/Maps/Utility",
          INSTALL / "DLC/Expansion2/Maps", INSTALL / "DLC/Expansion2/Maps/Utility"]


def resolve(name: str) -> pathlib.Path:
    stem = name[:-4] if name.lower().endswith(".lua") else name
    hit = None
    for d in LAYERS:
        if not d.exists():
            continue
        for f in d.iterdir():
            if f.suffix.lower() == ".lua" and f.stem.lower() == stem.lower():
                hit = f
    if hit is None:
        raise FileNotFoundError(name)
    return hit


PRELUDE = r"""
local N = ...
local unpack = unpack
local _PLOTS = {}
local PlotMT = {}
PlotMT.__index = PlotMT
local W, H = N.W, N.H
for i = 0, W * H - 1 do
  _PLOTS[i] = setmetatable({_i = i, _x = i % W, _y = math.floor(i / W)}, PlotMT)
end
local function P(i) if i == nil then return nil end return _PLOTS[i] end
local function I(p) if p == nil then return nil end return p._i end
_CIV6MAP_PLOTS = _PLOTS

function PlotMT:GetX() return self._x end
function PlotMT:GetY() return self._y end
function PlotMT:GetIndex() return self._i end
for _, m in ipairs({"IsWater", "IsLake", "IsHills", "IsMountain", "IsImpassable", "GetTerrainType",
    "GetFeatureType", "GetResourceType", "GetResourceCount", "GetResourceTypeHash", "GetImprovementType",
    "GetContinentType", "IsRiver", "IsNEOfRiver", "IsNWOfRiver", "IsWOfRiver", "IsNEOfCliff",
    "IsNWOfCliff", "IsWOfCliff", "IsCoastalLand", "IsNaturalWonder", "IsRiverAdjacent", "IsFreshWater",
    "GetYield", "IsStartingPlot", "GetPlotType", "GetRiverCrossingCount", "IsCliff"}) do
  local f = N["plot_" .. m]
  PlotMT[m] = function(self, ...) return f(self._i, ...) end
end
function PlotMT:GetArea() return _AREA(N.plot_GetArea(self._i)) end
function PlotMT:SetPlotType(t, a, b) return N.plot_SetPlotType(self._i, t) end
function PlotMT:GetNumberAdjacentVolcanoes() return N.plot_GetNumberAdjacentVolcanoes(self._i) end

local AreaMT = {}
AreaMT.__index = AreaMT
local _AREAS = {}
function _AREA(id)
  if id == nil or id < 0 then return nil end
  local a = _AREAS[id]
  if a == nil then a = setmetatable({_id = id}, AreaMT); _AREAS[id] = a end
  return a
end
function AreaMT:GetID() return self._id end
function AreaMT:GetPlotCount() return N.area_GetPlotCount(self._id) end
function AreaMT:GetRiverEdgeCount() return N.area_GetRiverEdgeCount(self._id) end
function AreaMT:IsWater() return N.area_IsWater(self._id) end
function AreaMT:HasNoFlatCoast() return N.area_HasNoFlatCoast(self._id) end

local function tolist(t)
  local out = {}
  for _, v in ipairs(t) do out[#out + 1] = v end
  return out
end

Map = {}
function Map.GetGridSize() return W, H end
function Map.GetPlot(x, y) return P(N.Map_GetPlot(x, y)) end
function Map.GetPlotByIndex(i) return P(N.Map_GetPlotByIndex(i)) end
function Map.GetPlotXY(x, y, dx, dy) return P(N.Map_GetPlotXY(x, y, dx, dy)) end
function Map.GetPlotXYWithRangeCheck(x, y, dx, dy, r) return P(N.Map_GetPlotXYWithRangeCheck(x, y, dx, dy, r)) end
function Map.GetAdjacentPlot(x, y, d) return P(N.Map_GetAdjacentPlot(x, y, d)) end
function Map.GetPlotDistance(x1, y1, x2, y2) return N.Map_GetPlotDistance(x1, y1, x2, y2) end
function Map.GetMapSize() return N.Map_GetMapSize() end
function Map.GetPlotCount() return W * H end
function Map.IsWrapX() return N.wrap_x end
function Map.IsWrapY() return false end
function Map.FindSecondContinent(p, r) return N.Map_FindSecondContinent(I(p), r) end
function Map.GetContinentsInUse() return N.Map_GetContinentsInUse() end
function Map.GetContinentPlots(c) return N.Map_GetContinentPlots(c) end
function Map.FindWater(p, r, fresh) return N.Map_FindWater(I(p), r, fresh) end

TerrainBuilder = {}
function TerrainBuilder.GetRandomNumber(n, reason) return N.TB_GetRandomNumber(n, reason) end
function TerrainBuilder.GetFractalFlags() return N.TB_GetFractalFlags() end
function TerrainBuilder.SetTerrainType(p, t) return N.TB_SetTerrainType(I(p), t) end
function TerrainBuilder.SetFeatureType(p, f) return N.TB_SetFeatureType(I(p), f) end
function TerrainBuilder.CanHaveFeature(p, f, single) return N.TB_CanHaveFeature(I(p), f, single) end
function TerrainBuilder.GetAdjacentFeatureCount(p, f) return N.TB_GetAdjacentFeatureCount(I(p), f) end
function TerrainBuilder.SetWOfRiver(p, b, d, id) return N.TB_SetRiver(I(p), 0, b, d, id, "TerrainBuilder.SetWOfRiver") end
function TerrainBuilder.SetNWOfRiver(p, b, d, id) return N.TB_SetRiver(I(p), 1, b, d, id, "TerrainBuilder.SetNWOfRiver") end
function TerrainBuilder.SetNEOfRiver(p, b, d, id) return N.TB_SetRiver(I(p), 2, b, d, id, "TerrainBuilder.SetNEOfRiver") end
function TerrainBuilder.SetWOfCliff(p, b) return N.TB_SetCliff(I(p), 0, b) end
function TerrainBuilder.SetNWOfCliff(p, b) return N.TB_SetCliff(I(p), 1, b) end
function TerrainBuilder.SetNEOfCliff(p, b) return N.TB_SetCliff(I(p), 2, b) end
function TerrainBuilder.GetInlandCorner(p) return P(N.TB_GetInlandCorner(I(p))) end
function TerrainBuilder.StampContinents() return N.TB_StampContinents() end
function TerrainBuilder.AnalyzeChokepoints() return N.TB_AnalyzeChokepoints() end
function TerrainBuilder.GenerateFloodplains(a, b, c) return N.TB_GenerateFloodplains(a, b, c) end
function TerrainBuilder.AddIce(i, e) return N.TB_AddIce(i, e) end
function TerrainBuilder.AddCoastalLowland(i, e) return N.TB_AddCoastalLowland(i, e) end
function TerrainBuilder.SetMultiPlotFeatureType(plots, f)
  local ids = {}
  for k, p in ipairs(plots) do if type(p) == "number" then ids[k] = p else ids[k] = I(p) end end
  return N.TB_SetMultiPlotFeatureType(ids, f)
end

AreaBuilder = {}
function AreaBuilder.Recalculate() return N.AB_Recalculate() end
function AreaBuilder.Calculate() return N.AB_Recalculate() end
Areas = {}
function Areas.FindBiggestArea(water) return _AREA(N.Areas_FindBiggestArea(water)) end

ResourceBuilder = {}
function ResourceBuilder.CanHaveResource(p, r) return N.RB_CanHaveResource(I(p), r) end
function ResourceBuilder.SetResourceType(p, r, n) return N.RB_SetResourceType(I(p), r, n) end
function ResourceBuilder.GetAdjacentResourceCount(p) return N.RB_GetAdjacentResourceCount(I(p)) end

ImprovementBuilder = {}
function ImprovementBuilder.CanHaveImprovement(p, imp, team) return N.IB_CanHaveImprovement(I(p), imp, team) end
function ImprovementBuilder.SetImprovementType(p, imp, pl) return N.IB_SetImprovementType(I(p), imp, pl) end

StartPositioner = {}
for _, m in ipairs({"DivideMapIntoMajorRegions", "DivideMapIntoMinorRegions", "GetNumMajorCivStarts",
    "GetNumMinorCivStarts", "GetMajorCivStartPlots", "GetMinorCivStartPlots", "GetMajorCivStartInfo",
    "GetMinorCivStartInfo", "MarkMajorRegionUsed", "GetPlotFertility", "GetTotalOceanStartCandidates",
    "PlaceOceanStartCivs", "GetOceanStartTile"}) do
  local f = N["SP_" .. m]
  StartPositioner[m] = function(...) return f(...) end
end

local FracMT = {}
FracMT.__index = FracMT
function FracMT:GetHeight(a, b) return N.frac_GetHeight(self._id, a, b) end
function FracMT:BuildRidges(n, flags, br, bf) return N.frac_BuildRidges(self._id, n, flags, br, bf) end
Fractal = {}
function Fractal.Create(w, h, g, flags, xe, ye)
  return setmetatable({_id = N.frac_Create(w, h, g, flags, xe, ye)}, FracMT)
end
function Fractal.CreateRifts(w, h, g, flags, rifts, xe, ye)
  return setmetatable({_id = N.frac_CreateRifts(w, h, g, flags, rifts._id, xe, ye)}, FracMT)
end

MapConfiguration = {}
function MapConfiguration.GetValue(k) return N.MapConfiguration_GetValue(k) end
GameConfiguration = {}
function GameConfiguration.GetValue(k) return N.GameConfiguration_GetValue(k) end
function GameConfiguration.GetStartEra() return N.GameConfiguration_GetStartEra() end
GameCapabilities = {}
function GameCapabilities.HasCapability(c) return false end

local PlayerMT = {}
PlayerMT.__index = PlayerMT
function PlayerMT:SetStartingPlot(p) return N.player_SetStartingPlot(self._id, I(p)) end
function PlayerMT:GetStartingPlot() return P(N.player_GetStartingPlot(self._id)) end
function PlayerMT:WasEverAlive() return N.player_IsAlive(self._id) end
function PlayerMT:IsAlive() return N.player_IsAlive(self._id) end
function PlayerMT:IsMajor() return N.player_IsMajor(self._id) end
local ConfigMT = {}
ConfigMT.__index = ConfigMT
function ConfigMT:GetLeaderTypeName() return N.config_Leader(self._id) end
function ConfigMT:GetCivilizationTypeName() return N.config_Civ(self._id) end
Players = {}
PlayerConfigurations = {}
for p = 0, 63 do
  Players[p] = setmetatable({_id = p}, PlayerMT)
  PlayerConfigurations[p] = setmetatable({_id = p}, ConfigMT)
end
PlayerManager = {}
function PlayerManager.GetAliveMajorIDs() return N.PM_Majors() end
function PlayerManager.GetAliveMinorIDs() return N.PM_Minors() end
function PlayerManager.GetAliveMajorsCount() return #N.PM_Majors() end
function PlayerManager.GetAliveMinorsCount() return #N.PM_Minors() end
function PlayerManager.GetWasEverAliveCount() return N.PM_EverAliveCount() end

FlowDirectionTypes = {NO_FLOWDIRECTION = -1, FLOWDIRECTION_NORTH = 0, FLOWDIRECTION_NORTHEAST = 1,
  FLOWDIRECTION_SOUTHEAST = 2, FLOWDIRECTION_SOUTH = 3, FLOWDIRECTION_SOUTHWEST = 4,
  FLOWDIRECTION_NORTHWEST = 5, NUM_FLOWDIRECTION_TYPES = 6}

GlobalParameters = N.GlobalParameters()

GameInfo = setmetatable({}, {__index = function(t, name)
  local rows = N.gi_rows(name)
  if rows == nil then return nil end
  local pk = N.gi_pk(name)
  local byKey = {}
  for _, r in ipairs(rows) do
    if pk ~= nil and r[pk] ~= nil then byKey[r[pk]] = r end
    if r.Hash ~= nil then byKey[r.Hash] = r end
  end
  local n = #rows
  local tbl = setmetatable({}, {
    __call = function() local i = 0; return function() i = i + 1; return rows[i] end end,
    __index = function(_, k)
      if type(k) == "number" and k >= 0 and k < n and k == math.floor(k) then return rows[k + 1] end
      return byKey[k]
    end})
  rawset(t, name, tbl)
  return tbl
end})

function math.clamp(v, lo, hi) if v < lo then return lo elseif v > hi then return hi end return v end
function table.fill(v, n) local t = {} for i = 1, n do t[i] = v end return t end
function table.count(t) local n = 0 for _ in pairs(t) do n = n + 1 end return n end

function include(name) return N.include(name) end
function print(...) return N.print(...) end
"""


def _int(v) -> int:
    """a native's integer argument: nil reads 0, a fraction truncates"""
    return int(v or 0)


class Api:
    """the Python side of the natives; names are the Lua prelude's"""

    def __init__(self, world: World, lua: lua51.LuaRuntime, log_print: bool):
        self.w = world
        self.lua = lua
        world.lua = lua
        self.W, self.H = world.W, world.H
        self.wrap_x = world.wrap_x
        self.log_print = log_print
        self.prints: list[str] = []
        self.included: list[str] = []

    # ------------------------------------------------------------ runtime
    def include(self, name):
        f = resolve(str(name))
        self.included.append(str(f.relative_to(INSTALL)))
        src = f.read_text(encoding="utf-8", errors="replace").lstrip("﻿")
        chunk = self.lua.execute("return function(src, name) local f, e = loadstring(src, name) "
                                 "if not f then error(e) end return f end")(strip_annotations(src), "@" + f.name)
        return chunk()

    def print(self, *args):
        if self.log_print:
            self.prints.append("\t".join(str(a) for a in args))

    def hks_order(self, keys):
        return self._list(table_order([int(keys[k]) for k in keys]))

    def _list(self, xs):
        return self.lua.table_from(list(xs))

    def GlobalParameters(self):
        out = {}
        for k, v in self.w.gp.items():
            if v is None:
                continue
            s = str(v)
            try:
                out[k] = int(s) if s.lstrip("-").isdigit() else float(s)
            except ValueError:
                out[k] = True if s.lower() == "true" else False if s.lower() == "false" else s
        return self.lua.table_from(out)

    def gi_rows(self, name):
        name = str(name)
        if name not in self.w.gi.tables:
            return None
        return self._list(self.lua.table_from({k: v for k, v in r.items() if v is not None})
                          for r in self.w.gi.rows(name))

    def gi_pk(self, name):
        return self.w.gi.pk(str(name))

    # --------------------------------------------------------------- map
    def Map_GetPlot(self, x, y):
        return self.w.plot(x, y)

    def Map_GetPlotByIndex(self, i):
        return int(i) if i is not None and 0 <= i < self.w.N else None

    def Map_GetPlotXY(self, x, y, dx, dy, *_):
        return self.w.plot(_int(x) + _int(dx), _int(y) + _int(dy))

    def Map_GetPlotXYWithRangeCheck(self, x, y, dx, dy, r):
        """Civ 5's plotXYWithRangeCheck: the offset plot, refused beyond hex
        distance r"""
        x, y, dx, dy, r = _int(x), _int(y), _int(dx), _int(dy), _int(r)
        if abs(dx) > r or abs(dy) > r:
            return None
        p = self.w.plot(x + dx, y + dy)
        if p is not None and self.w.distance(x, y, *self.w.xy(p)) > r:
            return None
        return p

    def Map_GetAdjacentPlot(self, x, y, d):
        i = self.w.plot(x, y)
        d = _int(d)
        return None if i is None or not 0 <= d < 6 else self.w.adj(i, d)

    def Map_GetPlotDistance(self, x1, y1, x2, y2):
        return self.w.distance(_int(x1), _int(y1), _int(x2), _int(y2))

    def Map_GetMapSize(self):
        return self.w.size_row["Index"]

    def Map_FindSecondContinent(self, i, r):
        return self.w.find_second_continent(i, r)

    def Map_GetContinentsInUse(self):
        self._native("Map.GetContinentsInUse")
        return self._list(self.w.continents_in_use())

    def Map_GetContinentPlots(self, c):
        return self._list(i for i in range(self.w.N) if self.w.continent[i] == c)

    def Map_FindWater(self, i, r, fresh):
        return self.w.find_water(i, r, bool(fresh))

    # --------------------------------------------------------- terrain
    def TB_GetRandomNumber(self, n, reason):
        return self.w.rng.lua_draw(n, reason)

    def TB_GetFractalFlags(self):
        return self.lua.table_from({"FRAC_WRAP_X": True} if self.w.wrap_x else {})

    def TB_SetTerrainType(self, i, t):
        self.w.terrain[i] = int(t)

    def TB_SetFeatureType(self, i, f):
        self.w.set_feature(i, int(f))

    def TB_CanHaveFeature(self, i, f, single=None):
        return self.w.can_have_feature_call(i, int(f), single)

    def TB_GetAdjacentFeatureCount(self, i, f):
        return self.w.adjacent_feature_count(i, int(f))

    def TB_SetRiver(self, i, edge, b, d, rid, name):
        self._native(name)
        self.w.river[i][edge] = bool(b)
        self.w.river_flow[i][edge] = int(d) if b else -1
        self.w.river_id[i][edge] = int(rid) if b and rid is not None else -1
        if b:
            self.w.river_order.append((int(rid) if rid is not None else -1, i, edge))

    def TB_SetCliff(self, i, edge, b):
        self.w.cliff[i][edge] = bool(b)

    def TB_GetInlandCorner(self, i):
        s = self.w.rng.n
        p = self.w.inland_corner(i)
        self.w.rng.native("TerrainBuilder.GetInlandCorner", s)
        return p

    def TB_StampContinents(self):
        s = self.w.rng.n
        self.w.stamp_continents()
        self.w.rng.native("TerrainBuilder.StampContinents", s)
        self._facts("TerrainBuilder.StampContinents")

    def TB_AnalyzeChokepoints(self):
        self._native("TerrainBuilder.AnalyzeChokepoints")

    def TB_GenerateFloodplains(self, inland, lo, hi):
        self._native("TerrainBuilder.GenerateFloodplains")
        self.w.generate_floodplains(_int(lo), _int(hi))
        self._facts("TerrainBuilder.GenerateFloodplains")

    def TB_AddIce(self, i, e):
        self._native("TerrainBuilder.AddIce")
        self.w.ice_phase[int(i)] = int(e)

    def TB_AddCoastalLowland(self, i, e):
        self._native("TerrainBuilder.AddCoastalLowland")
        self.w.lowland[int(i)] = int(e)

    def TB_SetMultiPlotFeatureType(self, ids, f):
        self._native("TerrainBuilder.SetMultiPlotFeatureType")
        for k in ids:
            self.w.feature[ids[k]] = int(f)

    def _native(self, name):
        self.w.rng.ledger.append(("native", name, 0))

    def _facts(self, name):
        """the map facts the lab's probe logs after some natives"""
        w = self.w
        cont: dict[int, int] = {}
        for i in range(w.N):
            if w.continent[i] != -1:
                cont[w.continent[i]] = cont.get(w.continent[i], 0) + 1
        cs = "/".join(sorted(f"{k}:{v}" for k, v in cont.items()))
        s = (f"land={sum(not w.is_water(i) for i in range(w.N))} hills={sum(w.is_hills(i) for i in range(w.N))} "
             f"mtn={sum(w.is_mountain(i) for i in range(w.N))} lake={sum(w.is_lake(i) for i in range(w.N))} "
             f"feat={sum(f != -1 for f in w.feature)} cont={cs}")
        w.rng.ledger.append(("facts", name, s))

    # ------------------------------------------------------------ areas
    def AB_Recalculate(self):
        self._native("AreaBuilder.Recalculate")
        self.w.recalculate_areas()
        self._facts("AreaBuilder.Recalculate")

    def Areas_FindBiggestArea(self, water):
        best = None
        for a in self.w.areas.values():
            if a.water == bool(water) and (best is None or len(a.plots) > len(best.plots)):
                best = a
        return None if best is None else best.id

    def area_GetPlotCount(self, aid):
        a = self.w.areas.get(aid)
        return 0 if a is None else len(a.plots)

    def area_GetRiverEdgeCount(self, aid):
        return self.w.area_river_edges(aid)

    def area_IsWater(self, aid):
        a = self.w.areas.get(aid)
        return a is not None and a.water

    def area_HasNoFlatCoast(self, aid):
        a = self.w.areas.get(aid)
        if a is None:
            return True
        return not any(self.w.is_coastal_land(p) and not self.w.is_hills(p) and not self.w.is_mountain(p)
                       for p in a.plots)

    # ------------------------------------------------------------ plots
    def plot_IsWater(self, i): return self.w.is_water(i)
    def plot_IsLake(self, i): return self.w.is_lake(i)
    def plot_IsHills(self, i): return self.w.is_hills(i)
    def plot_IsMountain(self, i): return self.w.is_mountain(i)
    def plot_IsImpassable(self, i): return self.w.is_impassable(i)
    def plot_GetTerrainType(self, i): return self.w.terrain[i]
    def plot_GetFeatureType(self, i): return self.w.feature[i]
    def plot_GetResourceType(self, i): return self.w.resource[i]
    def plot_GetResourceCount(self, i): return self.w.res_count[i]
    def plot_GetImprovementType(self, i): return self.w.improvement[i]
    def plot_GetContinentType(self, i): return self.w.continent[i]
    def plot_IsRiver(self, i): return self.w.is_river(i)
    def plot_IsWOfRiver(self, i): return self.w.river[i][0]
    def plot_IsNWOfRiver(self, i): return self.w.river[i][1]
    def plot_IsNEOfRiver(self, i): return self.w.river[i][2]
    def plot_IsWOfCliff(self, i): return self.w.cliff[i][0]
    def plot_IsNWOfCliff(self, i): return self.w.cliff[i][1]
    def plot_IsNEOfCliff(self, i): return self.w.cliff[i][2]
    def plot_IsCoastalLand(self, i): return self.w.is_coastal_land(i)
    def plot_IsNaturalWonder(self, i): return self.w.is_natural_wonder(i)
    def plot_IsFreshWater(self, i): return self.w.is_fresh_water(i)
    def plot_IsStartingPlot(self, i): return self.w.starting[i]
    def plot_GetArea(self, i): return self.w.area_of[i]
    def plot_GetRiverCrossingCount(self, i): return sum(self.w.river_edges(i))

    def plot_IsCliff(self, i):
        return any(self.w.cliff[i])

    def plot_IsRiverAdjacent(self, i):
        return self.w.river_adjacent(i)

    def plot_GetResourceTypeHash(self, i):
        r = self.w.resource[i]
        return -1 if r < 0 else self.w.r_rows[r]["Hash"]

    def plot_GetPlotType(self, i):
        if self.w.is_water(i):
            return 3
        return 0 if self.w.is_mountain(i) else 1 if self.w.is_hills(i) else 2

    def plot_SetPlotType(self, i, t):
        raise NotImplementedError("Plot:SetPlotType")

    def plot_GetNumberAdjacentVolcanoes(self, i):
        v = self.w.fix.get("FEATURE_VOLCANO", -2)
        return sum(1 for n in self.w.neighbours(i) if self.w.feature[n] == v)

    def plot_GetYield(self, i, y):
        return self.w.plot_yield(i, int(y))

    # -------------------------------------------------------- resources
    def RB_CanHaveResource(self, i, r):
        return self.w.can_have_resource(i, self._res_index(r))

    def RB_SetResourceType(self, i, r, n):
        self.w.resource_log.append((i, self._res_index(r)))
        self.w.resource[i] = self._res_index(r)
        self.w.res_count[i] = int(n) if n is not None else 1

    def RB_GetAdjacentResourceCount(self, i):
        return self.w.adjacent_resource_count(i)

    def _res_index(self, r):
        """a resource named by Index or by Hash"""
        r = int(r)
        if 0 <= r < len(self.w.r_rows) or r == -1:
            return r
        for row in self.w.r_rows:
            if row["Hash"] == r:
                return row["Index"]
        return -1

    def IB_CanHaveImprovement(self, i, imp, team):
        return self.w.can_have_improvement(i, int(imp))

    def IB_SetImprovementType(self, i, imp, pl):
        self.w.improvement[i] = int(imp)

    # ---------------------------------------------------------- fractal
    def _flags(self, t):
        if t is None:
            return set()
        return {str(k) for k, v in t.items() if v}

    def frac_Create(self, w, h, g, flags, xe, ye):
        s = self.w.rng.n
        f = Fractal(int(w), int(h), int(g), self.w.rng, self._flags(flags), int(xe), int(ye))
        self.w.rng.native("Fractal.Create", s)
        self.w.fractals.append(f)
        return len(self.w.fractals) - 1

    def frac_CreateRifts(self, w, h, g, flags, rid, xe, ye):
        s = self.w.rng.n
        f = Fractal(int(w), int(h), int(g), self.w.rng, self._flags(flags), int(xe), int(ye),
                    rifts=self.w.fractals[rid])
        self.w.rng.native("Fractal.CreateRifts", s)
        self.w.fractals.append(f)
        return len(self.w.fractals) - 1

    def frac_GetHeight(self, fid, a, b):
        f = self.w.fractals[fid]
        if b is None:
            return f.height_from_percent(a)
        return f.height(int(a), int(b))

    def frac_BuildRidges(self, fid, n, flags, br, bf):
        s = self.w.rng.n
        self.w.fractals[fid].build_ridges(self.w.rng, n, self._flags(flags), int(br), int(bf))
        self.w.rng.native("Fractal:BuildRidges", s)

    # ---------------------------------------------------- configuration
    def MapConfiguration_GetValue(self, k):
        return self.w.options.get(str(k))

    def GameConfiguration_GetValue(self, k):
        return None

    def GameConfiguration_GetStartEra(self):
        r = self.w.gi.find("Eras", EraType=self.w.roster.get("start_era", "ERA_ANCIENT"))
        return r["Hash"]

    # ---------------------------------------------------------- players
    def PM_Majors(self):
        return self._list(range(len(self.w.roster["majors"])))

    def PM_Minors(self):
        n = len(self.w.roster["majors"])
        return self._list(range(n, n + len(self.w.roster["minors"])))

    def PM_EverAliveCount(self):
        return len(self.w.roster["majors"]) + len(self.w.roster["minors"])

    def _slot(self, pid):
        majors, minors = self.w.roster["majors"], self.w.roster["minors"]
        if pid < len(majors):
            return majors[pid]
        if pid - len(majors) < len(minors):
            return minors[pid - len(majors)]
        return None

    def config_Leader(self, pid):
        s = self._slot(pid)
        return None if s is None else s["leader"]

    def config_Civ(self, pid):
        s = self._slot(pid)
        return None if s is None else s["civ"]

    def player_IsAlive(self, pid):
        return self._slot(pid) is not None

    def player_IsMajor(self, pid):
        return pid < len(self.w.roster["majors"])

    def player_SetStartingPlot(self, pid, i):
        old = self.w.player_start.get(pid)
        if old is not None:
            self.w.starting[old] = False
        self.w.player_start[pid] = i
        if i is not None:
            self.w.starting[i] = True

    def player_GetStartingPlot(self, pid):
        return self.w.player_start.get(pid)

    # --------------------------------------------------- start positioner
    def __getattr__(self, name):
        if name.startswith("SP_"):
            return getattr(self.w.starts, name[3:])
        raise AttributeError(name)


HKS_PAIRS = r"""
-- pairs over a table whose keys are all numbers visits them in Havok
-- Script's node order (hks.table_order); any other table keeps next's order
local N = ...
local next_ = next
function pairs(t)
  local keys, allnum = {}, true
  for k in next_, t do
    if type(k) ~= "number" then allnum = false; break end
    keys[#keys + 1] = k
  end
  if not allnum or #keys < 2 then return next_, t, nil end
  local order = N.hks_order(keys)
  local i = 0
  return function() i = i + 1; local k = order[i]; if k ~= nil then return k, t[k] end end, t, nil
end
"""

HKS_SORT = r"""
-- table.sort as Havok Script 2013.2.0 sorts (measured: every permutation and
-- every comparator call sequence of 1178 probed sorts, tools/civ6lab/h3_hksort.py):
-- the median of three (t[u] before t[l] swaps them; then t[l] not before
-- t[m] swaps m and l, else t[m] not before t[u] swaps m and u), the pivot
-- left in place, a Wirth partition (i from l + 1, j from u - 1, swapping
-- while i <= j), then [l, j] and [i, u], the left part first
local function sort(t, lt)
  lt = lt or function(a, b) return a < b end
  local function aux(l, u)
    if l >= u then return end
    if lt(t[u], t[l]) then t[l], t[u] = t[u], t[l] end
    if u - l == 1 then return end
    local m = math.floor((l + u) / 2)
    if not lt(t[l], t[m]) then t[m], t[l] = t[l], t[m]
    elseif not lt(t[m], t[u]) then t[m], t[u] = t[u], t[m] end
    if u - l == 2 then return end
    local P = t[m]
    local i, j = l + 1, u - 1
    while i <= j do
      while lt(t[i], P) do i = i + 1 end
      while lt(P, t[j]) do j = j - 1 end
      if i <= j then
        t[i], t[j] = t[j], t[i]
        i = i + 1
        j = j - 1
      end
    end
    aux(l, j)
    aux(i, u)
  end
  aux(1, #t)
end
table.sort = sort
"""


def run(world: World, script: str, *, log_print: bool = False, hks: bool = True) -> Api:
    """load the prelude, include the map script, call its GenerateMap; with
    hks set the Havok Script behaviours (pairs order, table.sort) replace Lua
    5.1's"""
    lua = lua51.LuaRuntime(unpack_returned_tuples=True)
    api = Api(world, lua, log_print)
    lua.compile(PRELUDE)(api)
    if hks:
        lua.execute(HKS_SORT)
        lua.compile(HKS_PAIRS)(api)
    api.include(script)
    lua.globals().GenerateMap()
    return api
