"""The native side of map generation: the plot grid and the engine functions
the map scripts call (TerrainBuilder, Map, AreaBuilder, Areas,
ResourceBuilder, ImprovementBuilder, StartPositioner, Fractal).

Where each native's behaviour comes from is said at the native: the lab's
pinned models (the stream, the fractals, the ledger's draw counts), the
install's rows, or a fit against the game's own logs of Duel Continents map
seeds 1000 and 2024 (the draw-by-draw probe records and the finished maps).
OPEN_NATIVES names what is not yet specified; each keeps the draw count
the ledger measured.

Grid: Civ 6's hex grid, y = 0 the bottom row, odd rows shifted right, x
wraps on a wrap-X map, y never wraps. Directions NE, E, SE, SW, W, NW = 0..5.
"""
from __future__ import annotations

from .cvrandom import Rng
from .fractal import Fractal
from .gameinfo import GameInfo

OPEN_NATIVES = {
    "TerrainBuilder.GenerateFloodplains": "0 draws; places no floodplain",
    "TerrainBuilder.StampContinents": "43 draws; the split of the land among more than one continent "
                                      "(Maps.Continents > 1) raises",
    "TerrainBuilder.AnalyzeChokepoints": "0 draws; keeps no state",
    "TerrainBuilder.AddIce": "0 draws; records the sea-level phase only",
    "TerrainBuilder.AddCoastalLowland": "0 draws; records the lowland level only",
    "ResourceBuilder.CanHaveResource": "the lab's row model; the game refuses a few plots it admits "
                                       "(luxuries on Duel seed 1000, strategics on 2024)",
    "StartPositioner": "regions, fertility and ocean starts: no region is offered, no start is placed",
    "ImprovementBuilder.CanHaveImprovement": "the install's Improvement_ValidTerrains / ValidFeatures",
    "Plot.GetYield": "terrain + feature + resource yield rows",
}

NE, E, SE, SW, W, NW = range(6)
_EVEN = ((0, 1), (1, 0), (0, -1), (-1, -1), (-1, 0), (-1, 1))
_ODD = ((1, 1), (1, 0), (1, -1), (0, -1), (-1, 0), (0, 1))


class Area:
    __slots__ = ("id", "water", "plots")

    def __init__(self, aid: int, water: bool):
        self.id, self.water, self.plots = aid, water, []


class World:
    def __init__(self, gi: GameInfo, size: str, map_seed: int, *, wrap_x: bool = True,
                 roster: dict | None = None, options: dict | None = None):
        self.gi = gi
        row = gi.find("Maps", MapSizeType=size)
        if row is None:
            raise SystemExit(f"no Maps row {size}")
        self.size_row = row
        self.W, self.H = row["GridWidth"], row["GridHeight"]
        self.N = self.W * self.H
        self.wrap_x, self.wrap_y = wrap_x, False
        self.rng = Rng(map_seed)
        self.options = options or {}
        self.roster = roster or {"majors": [], "minors": []}
        N = self.N
        self.terrain = [-1] * N
        self.feature = [-1] * N
        self.resource = [-1] * N
        self.res_count = [0] * N
        self.improvement = [-1] * N
        self.continent = [-1] * N
        self.river = [[False, False, False] for _ in range(N)]   # W, NW, NE of river
        self.river_flow = [[-1, -1, -1] for _ in range(N)]
        self.river_id = [[-1, -1, -1] for _ in range(N)]
        self.river_order: list[tuple[int, int, int]] = []   # (river id, plot, edge) in the order set
        self.cliff = [[False, False, False] for _ in range(N)]
        self.starting = [False] * N
        self.ice_phase = {}
        self.lowland = {}
        self.area_of = [-1] * N
        self.areas: dict[int, Area] = {}
        self.fractals: list[Fractal] = []
        self.player_start: dict[int, int] = {}
        # the install's rows the natives read
        self.t_rows = gi.rows("Terrains")
        self.f_rows = gi.rows("Features")
        self.r_rows = gi.rows("Resources")
        self.t_water = [bool(r["Water"]) for r in self.t_rows]
        self.t_hills = [bool(r["Hills"]) for r in self.t_rows]
        self.t_mountain = [bool(r["Mountain"]) for r in self.t_rows]
        self.t_impassable = [bool(r["Impassable"]) for r in self.t_rows]
        tix = {r["TerrainType"]: r["Index"] for r in self.t_rows}
        fix = {r["FeatureType"]: r["Index"] for r in self.f_rows}
        rix = {r["ResourceType"]: r["Index"] for r in self.r_rows}
        self.tix, self.fix, self.rix = tix, fix, rix
        self.f_valid = {f: set() for f in range(len(self.f_rows))}
        for r in gi.rows("Feature_ValidTerrains"):
            if r["FeatureType"] in fix and r["TerrainType"] in tix:
                self.f_valid[fix[r["FeatureType"]]].add(tix[r["TerrainType"]])
        self.f_adj_terrain = self._pairs("Feature_AdjacentTerrains", "FeatureType", "TerrainType", fix, tix)
        self.f_not_adj_terrain = self._pairs("Feature_NotAdjacentTerrains", "FeatureType", "TerrainType", fix, tix)
        self.f_adj_feature = self._pairs("Feature_AdjacentFeatures", "FeatureType", "FeatureTypeAdjacent", fix, fix)
        self.f_not_near = self._pairs("Feature_NotNearFeatures", "FeatureType", "FeatureTypeAvoid", fix, fix)
        self.r_valid_t = self._pairs("Resource_ValidTerrains", "ResourceType", "TerrainType", rix, tix)
        self.r_valid_f = self._pairs("Resource_ValidFeatures", "ResourceType", "FeatureType", rix, fix)
        self.gp = {r["Name"]: r["Value"] for r in gi.rows("GlobalParameters")}
        yix = {r["YieldType"]: r["Index"] for r in gi.rows("Yields")}
        self.t_yield = self._yields("Terrain_YieldChanges", "TerrainType", tix, yix)
        self.f_yield = self._yields("Feature_YieldChanges", "FeatureType", fix, yix)
        self.r_yield = self._yields("Resource_YieldChanges", "ResourceType", rix, yix)
        iix = {r["ImprovementType"]: r["Index"] for r in gi.rows("Improvements")}
        self.i_rows = gi.rows("Improvements")
        self.i_valid_t = self._pairs("Improvement_ValidTerrains", "ImprovementType", "TerrainType", iix, tix)
        self.i_valid_f = self._pairs("Improvement_ValidFeatures", "ImprovementType", "FeatureType", iix, fix)
        self.starts = Starts(self)

    def _yields(self, table, col, ix, yix):
        out: dict[tuple[int, int], int] = {}
        for r in self.gi.rows(table):
            if r.get(col) in ix and r.get("YieldType") in yix:
                k = (ix[r[col]], yix[r["YieldType"]])
                out[k] = out.get(k, 0) + int(r["YieldChange"])
        return out

    def plot_yield(self, i: int, y: int) -> int:
        """INSTALL rows: terrain + feature + resource yield changes"""
        v = self.t_yield.get((self.terrain[i], y), 0)
        if self.feature[i] >= 0:
            v += self.f_yield.get((self.feature[i], y), 0)
        if self.resource[i] >= 0:
            v += self.r_yield.get((self.resource[i], y), 0)
        return v

    def can_have_improvement(self, i: int, imp: int) -> bool:
        """INSTALL rows: the terrain in the improvement's ValidTerrains, and a
        feature (when there is one) in its ValidFeatures"""
        if imp < 0:
            return True
        if self.terrain[i] not in self.i_valid_t.get(imp, ()):
            return False
        f = self.feature[i]
        if f >= 0 and f not in self.i_valid_f.get(imp, ()):
            return False
        return True

    def _pairs(self, table, a, b, ia, ib):
        out: dict[int, set] = {}
        for r in self.gi.rows(table):
            if r.get(a) in ia and r.get(b) in ib:
                out.setdefault(ia[r[a]], set()).add(ib[r[b]])
        return out

    def gpi(self, name: str, default: int) -> int:
        v = self.gp.get(name)
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return default

    # ------------------------------------------------------------------ grid
    def xy(self, i: int) -> tuple[int, int]:
        return i % self.W, i // self.W

    def plot(self, x, y) -> int | None:
        """the plot at (x, y); a nil coordinate reads as 0, as a native's
        integer argument does (RiversLakes' IsAdjacentToRiver passes the
        unset globals x and y and so tests plot (0, 0) and then the
        neighbours: the game's cliffs skip every hill beside a river)"""
        x, y = int(x or 0), int(y or 0)
        if self.wrap_x:
            x %= self.W
        elif not 0 <= x < self.W:
            return None
        if not 0 <= y < self.H:
            return None
        return y * self.W + x

    def adj(self, i: int, d: int) -> int | None:
        x, y = i % self.W, i // self.W
        dx, dy = (_ODD if y & 1 else _EVEN)[d]
        return self.plot(x + dx, y + dy)

    def neighbours(self, i: int) -> list[int]:
        return [n for n in (self.adj(i, d) for d in range(6)) if n is not None]

    def distance(self, x1, y1, x2, y2) -> int:
        """Civ 5's plotDistance: the offset dx wrapped into [-W/2, W/2], then
        hex-space distance"""
        dx = x2 - x1
        if self.wrap_x:
            if dx > self.W // 2:
                dx -= self.W
            elif dx < -(self.W // 2):
                dx += self.W
        dy = y2 - y1
        h1 = x1 - (y1 >> 1)
        h2 = (x1 + dx) - ((y1 + dy) >> 1)
        hdx = h2 - h1
        if (hdx >= 0) == (dy >= 0):
            return abs(hdx) + abs(dy)
        return max(abs(hdx), abs(dy))

    def within(self, i: int, rng: int) -> list[int]:
        """plots in Civ 5's plotXYWithRangeCheck order: dx outer, dy inner"""
        x, y = self.xy(i)
        out = []
        for dx in range(-rng, rng + 1):
            for dy in range(-rng, rng + 1):
                p = self.plot(x + dx, y + dy)
                if p is not None and self.distance(x, y, *self.xy(p)) <= rng:
                    out.append(p)
        return out

    # ----------------------------------------------------------- plot facts
    def is_water(self, i):
        t = self.terrain[i]
        return t >= 0 and self.t_water[t]

    def is_hills(self, i):
        t = self.terrain[i]
        return t >= 0 and self.t_hills[t]

    def is_mountain(self, i):
        t = self.terrain[i]
        return t >= 0 and self.t_mountain[t]

    def is_impassable(self, i):
        t, f = self.terrain[i], self.feature[i]
        return (t >= 0 and self.t_impassable[t]) or (f >= 0 and bool(self.f_rows[f]["Impassable"]))

    def area_size(self, i):
        a = self.areas.get(self.area_of[i])
        return len(a.plots) if a else 0

    def is_lake(self, i):
        return self.is_water(i) and self.area_size(i) <= self.gpi("LAKE_MAX_AREA_SIZE", 9)

    def is_coastal_land(self, i):
        """land beside any water, lakes included (the game's AddRivers pass 2
        draws once per land plot that is not coastal: 231 on Duel Continents
        seed 1000, as this counts; an ocean-size threshold would give 237)"""
        if self.is_water(i):
            return False
        return any(self.is_water(n) for n in self.neighbours(i))

    def river_edges(self, i) -> list[bool]:
        """the six edges NE, E, SE, SW, W, NW of plot i carrying a river"""
        wr, nwr, ner = self.river[i]
        out = [False] * 6
        out[E], out[SE], out[SW] = wr, nwr, ner
        n = self.adj(i, W)
        out[W] = n is not None and self.river[n][0]
        n = self.adj(i, NW)
        out[NW] = n is not None and self.river[n][1]
        n = self.adj(i, NE)
        out[NE] = n is not None and self.river[n][2]
        return out

    def is_river(self, i):
        return any(self.river_edges(i))

    def is_natural_wonder(self, i):
        f = self.feature[i]
        return f >= 0 and bool(self.f_rows[f]["NaturalWonder"])

    def is_fresh_water(self, i):
        if self.is_water(i):
            return False
        if self.is_river(i):
            return True
        for n in self.neighbours(i):
            if self.is_lake(n):
                return True
            f = self.feature[n]
            if f >= 0 and self.f_rows[f]["AddsFreshWater"]:
                return True
        return False

    # ---------------------------------------------------------------- areas
    def recalculate_areas(self) -> None:
        """AreaBuilder.Recalculate: connected components of water, of
        passable land and of mountains, numbered in plot order. Mountains
        stand apart: AddRivers' pass 3 and 4 test the plot's area's river
        edges against its size, and the game's rivers from Duel seed 1000's
        mountains (10,6) and (8,7) are drawn although their landmass is
        already past its share"""
        self.area_of = [-1] * self.N
        self.areas = {}
        nid = 0
        for s in range(self.N):
            if self.area_of[s] >= 0:
                continue
            wat = self.is_water(s)
            kind = self._area_kind(s)
            a = Area(nid, wat)
            self.areas[nid] = a
            stack = [s]
            self.area_of[s] = nid
            while stack:
                p = stack.pop()
                a.plots.append(p)
                for n in self.neighbours(p):
                    if self.area_of[n] < 0 and self._area_kind(n) == kind:
                        self.area_of[n] = nid
                        stack.append(n)
            nid += 1

    def _area_kind(self, i: int) -> int:
        return 0 if self.is_water(i) else 2 if self.is_mountain(i) else 1

    def area_river_edges(self, aid: int) -> int:
        """the river edges its plots own (W, NW, NE of river) now"""
        a = self.areas.get(aid)
        return 0 if a is None else sum(sum(self.river[p]) for p in a.plots)

    # ----------------------------------------------------------- features
    def salt_adjacent(self, i: int) -> bool:
        """beside water that is neither a lake nor under ice"""
        ice = self.fix.get("FEATURE_ICE", -2)
        return any(self.is_water(n) and not self.is_lake(n) and self.feature[n] != ice for n in self.neighbours(i))

    def river_adjacent(self, i: int) -> bool:
        return any(self.is_river(n) for n in self.neighbours(i))

    def can_have_feature(self, i: int, f: int) -> bool:
        """the single-plot test: the install's Feature columns and child
        tables, in the clause order the lab measures (tools/civ6lab/h3_chf.py)"""
        if f < 0:
            return True
        if self.feature[i] >= 0:
            return False
        fr = self.f_rows[f]
        lake = self.is_lake(i)
        if self.terrain[i] not in self.f_valid.get(f, ()) and not (lake and fr["Lake"]):
            return False
        if fr["NoCoast"] and not self.is_water(i) and self.salt_adjacent(i):
            return False
        if fr["NoRiver"] and (self.is_river(i) or self.river_adjacent(i)):
            return False
        if fr["RequiresRiver"] and not self.is_river(i):
            return False
        nb = self.neighbours(i)
        if fr["Lake"] and any(self.is_water(n) for n in nb):
            return False
        if lake and not fr["Lake"]:
            return False
        if fr["Coast"] and not self.salt_adjacent(i):
            return False
        lo, hi = fr["MinDistanceLand"], fr["MaxDistanceLand"]
        if lo or hi:
            d = self._land_distance(i, max(lo, hi) + 1)
            if (lo and d < lo) or (hi and d > hi):
                return False
        if fr["NoAdjacentFeatures"] and any(self.feature[n] >= 0 for n in nb):
            return False
        if f in self.f_adj_terrain and not any(self.terrain[n] in self.f_adj_terrain[f] for n in nb):
            return False
        if f in self.f_not_adj_terrain and any(self.terrain[n] in self.f_not_adj_terrain[f] for n in nb):
            return False
        if f in self.f_adj_feature and not any(self.feature[n] in self.f_adj_feature[f] for n in nb):
            return False
        if f in self.f_not_near:
            r = self.N // 256
            x, y = self.xy(i)
            if any(self.feature[q] in self.f_not_near[f] and self.distance(x, y, *self.xy(q)) <= r
                   for q in range(self.N)):
                return False
        mnw = fr["MinDistanceNW"]
        if mnw is not None and mnw > 0:
            x, y = self.xy(i)
            if any(self.is_natural_wonder(q) and self.distance(x, y, *self.xy(q)) <= mnw for q in range(self.N)):
                return False
        return True

    def footprint(self, i: int, f: int) -> list[int] | None:
        """the plots a natural wonder of Tiles > 1 with no CustomPlacement
        takes from anchor i: the first orientation d in direction order whose
        extra plots all pass the single-plot test — 2 plots: the neighbour d;
        3: the neighbours d and d + 1; 4: those and the plot two steps out
        between them (the lab's shape model, tools/civ6lab/h3_nwfit.py)"""
        fr = self.f_rows[f]
        tiles = fr["Tiles"] or 1
        if tiles < 2 or fr["CustomPlacement"] is not None:
            return [i]
        for d in range(6):
            a = self.adj(i, d)
            extra = [a]
            if tiles >= 3:
                extra.append(self.adj(i, (d + 1) % 6))
            if tiles >= 4:
                extra.append(None if a is None else self.adj(a, (d + 1) % 6))
            if all(q is not None and self.can_have_feature(q, f) for q in extra):
                return [i] + extra
        return None

    def can_have_feature_placed(self, i: int, f: int, single: bool) -> bool:
        """TerrainBuilder.CanHaveFeature(plot, f, single): with single set the
        plot alone, else a multi-plot wonder's whole footprint too"""
        if not self.can_have_feature(i, f):
            return False
        if single or f < 0 or not self.f_rows[f]["NaturalWonder"]:
            return True
        return self.footprint(i, f) is not None

    def set_feature(self, i: int, f: int) -> None:
        """SetFeatureType: a multi-plot wonder with no CustomPlacement lays
        its whole footprint"""
        plots = [i]
        if f >= 0 and self.f_rows[f]["NaturalWonder"]:
            plots = self.footprint(i, f) or [i]
        for p in plots:
            self.feature[p] = f

    def _land_distance(self, i, cap):
        """hex distance to the nearest land plot (0 on land), cap + 1 when none is within cap"""
        if not self.is_water(i):
            return 0
        x, y = self.xy(i)
        best = cap + 1
        for p in self.within(i, cap):
            if not self.is_water(p):
                best = min(best, self.distance(x, y, *self.xy(p)))
        return best

    def adjacent_feature_count(self, i: int, f: int) -> int:
        return sum(1 for n in self.neighbours(i) if self.feature[n] == f)

    # ---------------------------------------------------------- resources
    def can_have_resource(self, i: int, r: int) -> bool:
        """the install's rows, in the clause order the lab measures
        (tools/civ6lab/h3_chr.py): no resource yet, not a start plot, the
        feature in ValidFeatures (or no feature and the terrain in
        ValidTerrains), LakeEligible, AdjacentToLand"""
        if r < 0:
            return True
        if self.resource[i] >= 0 or self.starting[i]:
            return False
        f = self.feature[i]
        if f >= 0:
            if f not in self.r_valid_f.get(r, ()):
                return False
        elif self.terrain[i] not in self.r_valid_t.get(r, ()):
            return False
        row = self.r_rows[r]
        if row.get("LakeEligible") is False and self.is_lake(i):
            return False
        if row.get("AdjacentToLand") and not any(not self.is_water(n) for n in self.neighbours(i)):
            return False
        return True

    def adjacent_resource_count(self, i: int) -> int:
        return sum(1 for n in self.neighbours(i) if self.resource[n] >= 0)

    # ---------------------------------------------------------- continents
    def stamp_continents(self) -> None:
        """one draw per Continents row: Civ 5's shuffleArray of the rows
        (for k < n, swap k with k + get(n - k)); the map's first continent is
        the shuffle's first entry (Duel Continents, seeds 1000 and 2024: 9
        and 15, as the game stamps them). With the size's Maps.Continents = 1
        every land plot and every lake takes it (the game's facts after
        the native: 399 land + 2 lake plots on continent 9). How the land is
        split among more continents is not specified: that raises."""
        rows = self.gi.rows("Continents")
        n = len(rows)
        order = list(range(n))
        for k in range(n):
            j = self.rng.get(n - k) + k
            order[k], order[j] = order[j], order[k]
        want = self.size_row["Continents"]
        if want != 1:
            raise NotImplementedError(f"StampContinents with {want} continents is not specified")
        self.continent = [order[0] if (not self.is_water(i) or self.is_lake(i)) else -1 for i in range(self.N)]

    def continents_in_use(self) -> list[int]:
        return sorted({c for c in self.continent if c >= 0})

    def find_second_continent(self, i: int, rng: int) -> bool:
        c = self.continent[i]
        for p in self.within(i, int(rng)):
            o = self.continent[p]
            if o >= 0 and o != c and not self.is_water(p):
                return True
        return False

    def find_water(self, i: int, rng, fresh: bool) -> bool:
        """Map.FindWater: fresh = a lake or a plot with fresh water (a river
        on it or beside a lake, river or oasis) in range, else any water in
        range; a fractional range truncates. Fitted on the game's AddRivers
        logs (Duel Continents seeds 1000 and 2024: every GetInlandCorner call
        of the four passes lands where the game's does)"""
        for p in self.within(i, int(rng)):
            if (self.is_lake(p) or self.is_fresh_water(p)) if fresh else self.is_water(p):
                return True
        return False

    def has_coast_at_se_corner(self, i: int) -> bool:
        if self.is_water(i):
            return True
        for d in (E, SE):
            n = self.adj(i, d)
            if n is not None and self.is_water(n):
                return True
        return False

    def inland_corner(self, i: int) -> int | None:
        """Civ 5's getInlandCorner, 4 draws: shuffleArray(4) of the corner
        cases (the plot itself, NE, NW, W), then the first case whose SE
        corner has no water. Cases 1..3 fitted on the game's river logs;
        case 0 (the plot itself) never decided a river there."""
        sh = list(range(4))
        for k in range(4):
            j = self.rng.get(4 - k) + k
            sh[k], sh[j] = sh[j], sh[k]
        for c in sh:
            d = (None, NE, NW, W)[c]
            p = i if d is None else self.adj(i, d)
            if p is not None and not self.has_coast_at_se_corner(p):
                return p
        return None


class Starts:
    """StartPositioner, OPEN: the regions, fertility and ocean starts are not
    specified; no region is offered, so the scripts place no start"""

    def __init__(self, world: "World"):
        self.w = world

    def DivideMapIntoMajorRegions(self, n, fert, minor_fert, flag):
        self.w.rng.ledger.append(("native", "StartPositioner.DivideMapIntoMajorRegions", 0))

    def DivideMapIntoMinorRegions(self, n):
        self.w.rng.ledger.append(("native", "StartPositioner.DivideMapIntoMinorRegions", 0))

    def GetNumMajorCivStarts(self):
        return 0

    def GetNumMinorCivStarts(self):
        return 0

    def GetMajorCivStartPlots(self, i):
        return None

    def GetMinorCivStartPlots(self, i):
        return None

    def GetMajorCivStartInfo(self, i):
        return None

    def GetMinorCivStartInfo(self, i):
        return None

    def MarkMajorRegionUsed(self, i):
        return None

    def GetPlotFertility(self, i, major=-1, check=False):
        return 0

    def GetTotalOceanStartCandidates(self, water_map=None):
        return 0

    def PlaceOceanStartCivs(self, *a):
        return 0

    def GetOceanStartTile(self, i):
        return -1
