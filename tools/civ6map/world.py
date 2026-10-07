"""The native side of map generation: the plot grid and the engine functions
the map scripts call (TerrainBuilder, Map, AreaBuilder, Areas,
ResourceBuilder, ImprovementBuilder, StartPositioner, Fractal).

The natives are the lab's measured laws (tools/civ6lab/h3_natives_spec.md
and the fractal, ridge and stream models); where a native says it was fitted,
the fit is against the game's own draw-by-draw logs and finished maps.
OPEN_NATIVES names what is not yet specified; each keeps the draw count the
ledger measured.

Grid: Civ 6's hex grid, y = 0 the bottom row, odd rows shifted right, x
wraps on a wrap-X map, y never wraps. Directions NE, E, SE, SW, W, NW = 0..5.
"""
from __future__ import annotations

from . import continents, eastl
from .cvrandom import Rng
from .fractal import Fractal
from .gameinfo import GameInfo

OPEN_NATIVES = {
    "Map.GetContinentPlots": "the order of the plots it answers (plot order here)",
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
        # the volcanoes in the order SetFeatureType laid them: the game's
        # volcano vector (Terrain_Builder 0x896c40 -> 0xa1e370 -> 0xa19360
        # appends each volcano as its feature is set)
        self.volcano_order: list[int] = []
        self.cliff = [[False, False, False] for _ in range(N)]
        self.starting = [False] * N
        self.ice_phase = {}
        self.lowland = {}
        self.area_of = [-1] * N
        self.areas: dict[int, Area] = {}
        self.fractals: list[Fractal] = []
        self.player_start: dict[int, int] = {}
        self.unspecified: list[str] = []
        self.resource_log: list[tuple[int, int]] = []
        self.continent_order: list[int] = []
        # the install's rows the natives read
        self.t_rows = gi.rows("Terrains")
        self.f_rows = gi.rows("Features")
        self.r_rows = gi.rows("Resources")
        self.t_water = [bool(r["Water"]) for r in self.t_rows]
        self.t_hills = [bool(r["Hills"]) for r in self.t_rows]
        self.t_mountain = [bool(r["Mountain"]) for r in self.t_rows]
        self.t_impassable = [bool(r["Impassable"]) for r in self.t_rows]
        self.f_no_resource = [bool(r.get("NoResource")) for r in self.f_rows]
        self.f_double_adj = [bool(r.get("DoubleAdjacentTerrainYield")) for r in self.f_rows]
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
        self.fa_yield = self._yields("Feature_AdjacentYields", "FeatureType", fix, yix)
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
        """Plot:GetYield: nothing on an impassable plot (a mountain, Ice, an
        impassable natural wonder); else the terrain's yield (not on a
        natural wonder's plot; doubled, once, next to a
        DoubleAdjacentTerrainYield feature: Torres del Paine), the
        feature's and the resource's, and the
        adjacency yields of every natural-wonder plot next to it (a
        multi-plot wonder's own plots included)"""
        if self.is_impassable(i):
            return 0
        f = self.feature[i]
        nw = f >= 0 and bool(self.f_rows[f]["NaturalWonder"])
        v = 0 if nw else self.t_yield.get((self.terrain[i], y), 0)
        if any(self.feature[n] >= 0 and self.f_double_adj[self.feature[n]] for n in self.neighbours(i)):
            v *= 2
        if f >= 0:
            v += self.f_yield.get((f, y), 0)
        if self.resource[i] >= 0:
            v += self.r_yield.get((self.resource[i], y), 0)
        for n in self.neighbours(i):
            if self.is_natural_wonder(n):
                v += self.fa_yield.get((self.feature[n], y), 0)
        return v

    def plot_fertility(self, i: int) -> int:
        """StartPositioner.GetPlotFertility(i, -1): 0 on a mountain, snow, an
        Ice plot or a plot next to Ice; else 2 food + 2 production + gold +
        2 science + 2 culture + 2 faith of the plot's yields, +5 for a luxury
        resource or Horses or Iron, +3 on a land river plot or else +2 on
        fresh land or a passable plot under a feature that AddsFreshWater (a
        natural wonder's too), +1 per adjacent mountain, +1 per distinct natural wonder
        among the neighbours, -5 on tundra; at least 0"""
        t = self.t_rows[self.terrain[i]]["TerrainType"]
        if self.is_mountain(i) or self.is_ice(i) or t.startswith("TERRAIN_SNOW"):
            return 0
        nb = self.neighbours(i)
        if any(self.is_ice(n) for n in nb):
            return 0
        y = [self.plot_yield(i, k) for k in range(6)]
        v = 2 * y[0] + 2 * y[1] + y[2] + 2 * y[3] + 2 * y[4] + 2 * y[5]
        r = self.resource[i]
        if r >= 0 and (self.r_rows[r]["ResourceClassType"] == "RESOURCECLASS_LUXURY"
                       or self.r_rows[r]["ResourceType"] in ("RESOURCE_HORSES", "RESOURCE_IRON")):
            v += 5
        if not self.is_water(i):
            f = self.feature[i]
            if self.is_river(i):
                v += 3
            elif self.is_fresh_water(i) or (f >= 0 and self.f_rows[f]["AddsFreshWater"] and not self.is_impassable(i)):
                v += 2
        v += sum(1 for n in nb if self.is_mountain(n))
        v += len({self.feature[n] for n in nb if self.is_natural_wonder(n)})
        if not self.is_water(i) and t.startswith("TERRAIN_TUNDRA"):
            v -= 5
        return max(0, v)

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
        """hex distance: the cube distance of q = x - (y - (y & 1)) / 2, r = y,
        the shorter way round when x wraps"""
        r1, r2 = y1, y2
        q1 = x1 - (y1 >> 1)
        best = None
        for sh in ((-self.W, 0, self.W) if self.wrap_x else (0,)):
            dq = q1 - ((x2 + sh) - (y2 >> 1))
            dr = r1 - r2
            d = (abs(dq) + abs(dr) + abs(dq + dr)) // 2
            best = d if best is None else min(best, d)
        return best

    def within(self, i: int, rng: int) -> list[int]:
        """the plots within hex distance rng of plot i, itself included"""
        x, y = self.xy(i)
        out: dict[int, None] = {}
        for dy in range(-rng, rng + 1):
            for dx in range(-rng, rng + 1):
                p = self.plot(x + dx, y + dy)
                if p is not None and p not in out and self.distance(x, y, *self.xy(p)) <= rng:
                    out[p] = None
        return list(out)

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

    def is_ice(self, i):
        return self.feature[i] == self.fix.get("FEATURE_ICE", -2)

    def is_coastal_land(self, i):
        """land with a water neighbour not covered by Ice (lakes count)"""
        if self.is_water(i):
            return False
        return any(self.is_water(n) and not self.is_ice(n) for n in self.neighbours(i))

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
        """a land plot with a river on one of its edges to another land plot
        (a river flag on an edge to water does not count: the game answers
        IsRiver false on both sides of such an edge); an edge on the map's
        border counts (Tilted_Axis Small 1000: NE of river at (72, 0), its SW
        edge off the map, makes (73, 0) find fresh water within 2)"""
        if self.is_water(i):
            return False
        return any(on and ((n := self.adj(i, d)) is None or not self.is_water(n))
                   for d, on in enumerate(self.river_edges(i)))

    def is_natural_wonder(self, i):
        f = self.feature[i]
        return f >= 0 and bool(self.f_rows[f]["NaturalWonder"])

    def is_fresh_water(self, i):
        """passable land (not water, not impassable) that is a river plot,
        carries a feature that AddsFreshWater and is no natural wonder (an
        Oasis), or is next to a lake or to a feature that AddsFreshWater"""
        if self.is_water(i) or self.is_impassable(i):
            return False
        if self.is_river(i):
            return True
        f = self.feature[i]
        if f >= 0 and self.f_rows[f]["AddsFreshWater"] and not self.f_rows[f]["NaturalWonder"]:
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
        """AreaBuilder.Recalculate: the connected components (x wrapping) of
        three classes, water (lakes included), passable land and mountains,
        numbered k = 1, 2, ... in the order of their lowest plot; area id =
        (k << 16) | (k - 1). Later terrain changes leave the areas as they
        are until the next call."""
        self.area_of = [-1] * self.N
        self.areas = {}
        k = 0
        for s in range(self.N):
            if self.area_of[s] >= 0:
                continue
            k += 1
            aid = (k << 16) | (k - 1)
            wat = self.is_water(s)
            kind = self._area_kind(s)
            a = Area(aid, wat)
            self.areas[aid] = a
            stack = [s]
            self.area_of[s] = aid
            while stack:
                p = stack.pop()
                a.plots.append(p)
                for n in self.neighbours(p):
                    if self.area_of[n] < 0 and self._area_kind(n) == kind:
                        self.area_of[n] = aid
                        stack.append(n)

    def _area_kind(self, i: int) -> int:
        return 0 if self.is_water(i) else 2 if self.is_mountain(i) else 1

    def area_river_edges(self, aid: int) -> int:
        """the river edges its plots own (W, NW, NE of river) now"""
        a = self.areas.get(aid)
        return 0 if a is None else sum(sum(self.river[p]) for p in a.plots)

    # ----------------------------------------------------------- features
    def salt_adjacent(self, i: int) -> bool:
        """a neighbour that is salt water (water, not a lake) not covered by Ice"""
        return any(self.is_water(n) and not self.is_lake(n) and not self.is_ice(n) for n in self.neighbours(i))

    def river_adjacent(self, i: int) -> bool:
        return any(self.is_river(n) for n in self.neighbours(i))

    def can_have_feature(self, i: int, f: int, replace: bool = False) -> bool:
        """CanHaveFeature's single-plot test: 15 clauses in order, each from
        the install's rows (h3_natives_spec.md); with `replace` the plot's
        own feature does not refuse it"""
        if f < 0:
            return True
        fr = self.f_rows[f]
        nb = self.neighbours(i)
        lake = self.is_lake(i)
        if self.feature[i] >= 0 and not replace:                               # 1
            return False
        valid = self.f_valid.get(f)
        if valid and self.terrain[i] not in valid and not (fr["Lake"] and lake):  # 2
            return False
        if fr["NoCoast"] and not self.is_water(i) and self.salt_adjacent(i):   # 3
            return False
        if fr["NoRiver"] and (self.is_river(i) or self.river_adjacent(i)):     # 4
            return False
        if fr["RequiresRiver"] and not self.is_river(i):                       # 5
            return False
        if fr["Lake"] and any(self.is_water(n) and not self.is_ice(n) for n in nb):  # 6
            return False
        if lake and not fr["Lake"]:                                            # 7
            return False
        if fr["Coast"] and not self.salt_adjacent(i):                          # 8
            return False
        lo, hi = fr["MinDistanceLand"] or 0, fr["MaxDistanceLand"] or 0
        if lo or hi:                                                           # 9
            d = self._land_distance(i, max(lo, hi) + 1)
            if (lo and d < lo) or (hi and d > hi):
                return False
        if fr["NoAdjacentFeatures"] and any(self.feature[n] >= 0 for n in nb):  # 10
            return False
        if f in self.f_adj_terrain and not any(self.terrain[n] in self.f_adj_terrain[f] for n in nb):  # 11
            return False
        if f in self.f_not_adj_terrain and any(self.terrain[n] in self.f_not_adj_terrain[f] for n in nb):  # 12
            return False
        if f in self.f_adj_feature and not any(self.feature[n] in self.f_adj_feature[f] for n in nb):  # 13
            return False
        if f in self.f_not_near:                                               # 14
            r = self.avoid_radius()
            if any(self.feature[q] in self.f_not_near[f] for q in self.within(i, r)):
                return False
        mnw = fr["MinDistanceNW"]
        if mnw is not None and mnw > 0:                                        # 15
            if any(self.is_natural_wonder(q) for q in self.within(i, mnw)):
                return False
        return True

    def avoid_radius(self) -> int:
        """Feature_NotNearFeatures' hex radius: W * H times
        AVOID_FEATURE_MAX_MULTIPLIER as 8.8 fixed point (0.004 -> 1/256),
        capped at AVOID_FEATURE_MAX_THRESHOLD"""
        mult = int(float(self.gp.get("AVOID_FEATURE_MAX_MULTIPLIER", 0)) * 256)
        return min((self.N * mult) >> 8, self.gpi("AVOID_FEATURE_MAX_THRESHOLD", 24))

    def footprint(self, i: int, f: int, custom: bool = False, replace: bool = False) -> list[int] | None:
        """the plots a natural wonder with Tiles > 1 and no CustomPlacement
        covers from anchor i: the first orientation d in DirectionTypes order
        whose extra plots all pass the single-plot test (with `replace`, a
        feature already on an extra plot does not refuse it) — 2 plots: the
        neighbour d; 3: the neighbours d and d + 1; 4: those and the neighbour
        d + 1 of neighbour d. None when no orientation fits."""
        fr = self.f_rows[f]
        tiles = fr["Tiles"] or 1
        if tiles < 2 or (fr["CustomPlacement"] is not None and not custom):
            return [i]
        for d in range(6):
            a = self.adj(i, d)
            extra = [a]
            if tiles >= 3:
                extra.append(self.adj(i, (d + 1) % 6))
            if tiles >= 4:
                extra.append(None if a is None else self.adj(a, (d + 1) % 6))
            if all(q is not None and self.can_have_feature(q, f, replace) for q in extra):
                return [i] + extra
        return None

    def can_have_feature_call(self, i: int, f: int, single) -> bool:
        """TerrainBuilder.CanHaveFeature(plot, f, single): the single-plot test
        when the third argument is true or omitted; with false a natural
        wonder of Tiles > 1 also needs a footprint (custom placements too)"""
        if not self.can_have_feature(i, f):
            return False
        if single is None or single or f < 0 or not self.f_rows[f]["NaturalWonder"]:
            return True
        return self.footprint(i, f, custom=True) is not None

    def set_feature(self, i: int, f: int) -> None:
        """SetFeatureType: a natural wonder with Tiles > 1 and no
        CustomPlacement lays its footprint, over a feature already on an
        extra plot (nothing at all when none fits); a lake wonder turns every
        plot it covers into Coast"""
        plots = [i]
        if f >= 0 and self.f_rows[f]["NaturalWonder"]:
            plots = self.footprint(i, f, replace=True)
            if plots is None:
                return
        if f >= 0 and self.f_rows[f]["FeatureType"] == "FEATURE_VOLCANO":
            self.volcano_order.append(i)
        for p in plots:
            self.feature[p] = f
            if f >= 0 and self.f_rows[f]["Lake"]:
                self.terrain[p] = self.tix["TERRAIN_COAST"]

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
        """CanHaveResource: refused when the plot has a resource; is a start
        plot; has a feature not in the resource's ValidFeatures, or no feature
        and a terrain not in its ValidTerrains; NoRiver on a river plot or
        RequiresRiver off one; LakeEligible false on a lake; AdjacentToLand
        with no land neighbour; a neighbour carrying a NoResource feature
        (Torres del Paine)"""
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
        if row.get("NoRiver") and self.is_river(i):
            return False
        if row.get("RequiresRiver") and not self.is_river(i):
            return False
        if row.get("LakeEligible") is False and self.is_lake(i):
            return False
        if row.get("AdjacentToLand") and not any(not self.is_water(n) for n in self.neighbours(i)):
            return False
        if any(self.feature[n] >= 0 and self.f_no_resource[self.feature[n]] for n in self.neighbours(i)):
            return False
        return True

    def adjacent_resource_count(self, i: int) -> int:
        return sum(1 for n in self.neighbours(i) if self.resource[n] >= 0)

    # ---------------------------------------------------------- floodplains
    def river_plots(self) -> dict[int, list[int]]:
        """each river's plots: its setter calls in the order DoRiver made
        them, each adding the plot passed and then its partner across the edge
        (W of river: the E neighbour; NW: the SE neighbour; NE: the SW
        neighbour), each plot once; a partner off the map's edge is a -1
        entry, which breaks a run (Tilted_Axis Tiny 1000: a river leaving
        the south edge, NE of (21, 0), floods nothing with 4 plots)"""
        partner = (E, SE, SW)
        out: dict[int, list[int]] = {}
        for rid, p, edge in self.river_order:
            lst = out.setdefault(rid, [])
            for q in (p, self.adj(p, partner[edge])):
                if q is None:
                    lst.append(-1)
                elif q not in lst:
                    lst.append(q)
        return out

    def generate_floodplains(self, inland: bool, lo: int, hi: int) -> None:
        """GenerateFloodplains(bRiversStartInland, lo, hi): per river, from
        the list's end (rivers start inland: the end is the mouth) or, the
        flag false or nil, from its start (InlandSea lays its rivers from the
        coast; Tilted_Axis passes the unset global), the first maximal run of
        at least `lo` consecutive flat, featureless grassland, plains or
        desert plots; its `hi` plots nearest the walk's start take the
        floodplain of their terrain. Every river is judged on the map as it
        stands before any floodplain (the union of the runs)."""
        fp = {self.tix["TERRAIN_DESERT"]: self.fix["FEATURE_FLOODPLAINS"],
              self.tix["TERRAIN_GRASS"]: self.fix["FEATURE_FLOODPLAINS_GRASSLAND"],
              self.tix["TERRAIN_PLAINS"]: self.fix["FEATURE_FLOODPLAINS_PLAINS"]}
        take: dict[int, int] = {}
        for plots in self.river_plots().values():
            run: list[int] = []
            for p in [*(reversed(plots) if inland else plots), None]:
                if p is not None and p >= 0 and self.terrain[p] in fp and self.feature[p] < 0:
                    run.append(p)
                    continue
                if len(run) >= lo:
                    for q in run[:hi]:
                        take[q] = fp[self.terrain[q]]
                    break
                run = []
        for q, f in take.items():
            self.feature[q] = f

    # ---------------------------------------------------------- continents
    def stamp_continents(self) -> None:
        """StampContinents: 43 draws, Civ 5's shuffleArray of the Continents
        rows (for k < 43: swap k with k + get(43 - k)); continent k of the
        partition takes shuffled[k]; every land, mountain and lake plot
        carries one, ocean -1; the partition is `partition_continents`."""
        rows = self.gi.rows("Continents")
        n = len(rows)
        order = list(range(n))
        for k in range(n):
            j = self.rng.get(n - k) + k
            order[k], order[j] = order[j], order[k]
        self.continent_order = order
        parts = self.partition_continents(self.size_row["Continents"])
        self.continent = [-1 if parts[i] < 0 else order[parts[i]] for i in range(self.N)]

    def partition_continents(self, n: int) -> list[int]:
        """which of the n continents each non-ocean plot joins (-1 ocean):
        `continents.partition` over AreaBuilder's plot classes"""
        kind = [continents.OCEAN if self.is_water(i) and not self.is_lake(i) else continents.LAKE
                if self.is_water(i) else continents.MOUNTAIN if self.is_mountain(i) else continents.LAND
                for i in range(self.N)]
        return continents.partition(self.W, self.H, self.wrap_x, kind, n)

    def continents_in_use(self) -> list[int]:
        return sorted({c for c in self.continent if c >= 0})

    def find_second_continent(self, i: int, rng) -> bool:
        """a land plot with a continent and a land plot of another continent
        within hex distance rng; water plots carrying a continent (lakes)
        count on neither side"""
        c = self.continent[i]
        if c < 0 or self.is_water(i):
            return False
        return any(self.continent[p] not in (-1, c) and not self.is_water(p)
                   for p in self.within(i, int(rng)))

    def find_water(self, i: int, rng, fresh: bool) -> bool:
        """Map.FindWater: a plot within hex distance trunc(rng), the plot
        itself included, that is fresh water (IsFreshWater) with `fresh`,
        else water"""
        for p in self.within(i, int(rng)):
            if self.is_fresh_water(p) if fresh else self.is_water(p):
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
        """GetInlandCorner, 4 draws: Civ 5's shuffleArray of the cases (P,
        P's NE, NW and W neighbours), then the first that exists with no
        water at its SE corner (itself, its E and SE neighbours land)"""
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


class Region:
    """a start region: a box (inclusive edges, x not wrapping) over the plots
    of one continent on one landmass"""
    __slots__ = ("continent", "landmass", "north", "south", "east", "west", "fertility", "civs", "flags",
                 "plots", "used")

    def __init__(self, continent: int, landmass: int, x: int, y: int, fertility: int):
        self.continent, self.landmass = continent, landmass
        self.north = self.south = y
        self.east = self.west = x
        self.fertility = fertility
        self.civs = 0
        self.flags: set[str] = set()
        self.plots: list[int] = []
        self.used = False

    def copy(self) -> "Region":
        r = Region(self.continent, self.landmass, self.west, self.south, self.fertility)
        r.north, r.east = self.north, self.east
        r.flags = set(self.flags)
        return r


# the parts a region of c civs is split into: (civs each, parts)
SPLIT = {2: (1, 2), 3: (1, 3), 4: (2, 2), 5: (2, 3), 6: (2, 3), 7: (4, 2), 8: (4, 2), 9: (3, 3),
         10: (4, 3), 11: (4, 3), 12: (4, 3), 13: (8, 2), 14: (8, 2), 15: (8, 2), 16: (8, 2), 17: (6, 3),
         18: (6, 3), 19: (10, 2), 20: (10, 2), 21: (8, 3), 22: (8, 3), 23: (8, 3), 24: (8, 3)}


class Starts:
    """StartPositioner as the install's DLL codes it (tools/civ6lab/h3_divdll.py,
    h3_gpfdll.py, scored on the natives probe's region and start-picker
    records; tools/civ6lab/h3_regcheck.py runs this code against them).

    Entries: one per (continent, landmass) over the plots with a continent,
    in plot order (a landmass: a component of land and mountains, or of
    water, a lake its own, as the last area recalculation saw it, id
    (k << 16) | (k - 1) by its lowest plot), each with its plots' GetPlotFertility(i,
    -1) sum and a box grown by one bound per plot (x below W: W = x; else x
    above E: E = x; else y below S: S = y; else y above N: N = y), sorted by
    fertility descending (EASTL sort). A region's plots are its entry's
    plots inside its box, in plot order; TotalPlots every plot of the box.

    DivideMapIntoMajorRegions' fourth argument (Terra passes true) gives
    the civs to the entries on the landmass of the most land plots only;
    the others wait for the minor division with the entries below the
    major minimum. The ocean starts (an OceanStart leader, Kupe) are the
    DLL's 0x890940 and 0x890d10 (h3_oceanfit.py)."""

    def __init__(self, world: "World"):
        self.w = world
        self.major: list[Region] = []
        self.minor: list[Region] = []
        self.min_major = self.min_minor = 0
        self.minor_entries: list[Region] = []
        self.lmid: list[int] = []
        self.ocean: list[int] = []

    # ------------------------------------------------------------ entries
    def landmass_ids(self) -> list[int]:
        """per plot its landmass id: the components of land (mountains
        included) and of water, a lake its own, as the last area
        recalculation saw them (a lake wonder's plots stay land)"""
        w = self.w
        wet = [w.areas[w.area_of[p]].water for p in range(w.N)]
        lid = [0] * w.N
        k = 0
        for s in range(w.N):
            if lid[s]:
                continue
            k += 1
            v = (k << 16) | (k - 1)
            lid[s] = v
            stack = [s]
            while stack:
                p = stack.pop()
                for n in w.neighbours(p):
                    if not lid[n] and wet[n] == wet[s]:
                        lid[n] = v
                        stack.append(n)
        return lid

    def entries(self, fert: list[int], lmid: list[int]) -> list[Region]:
        ent: dict[tuple[int, int], Region] = {}
        order = []
        for i in range(self.w.N):
            c = self.w.continent[i]
            if c == -1:
                continue
            x, y = self.w.xy(i)
            e = ent.get((c, lmid[i]))
            if e is None:
                e = ent[(c, lmid[i])] = Region(c, lmid[i], x, y, fert[i])
                order.append(e)
                continue
            e.fertility += fert[i]
            if x < e.west:
                e.west = x
            elif x > e.east:
                e.east = x
            elif y < e.south:
                e.south = y
            elif y > e.north:
                e.north = y
        eastl.sort(order, lambda a, b: a.fertility > b.fertility)
        return order

    def owns(self, r: Region, i: int, lmid: list[int]) -> bool:
        return self.w.continent[i] == r.continent and lmid[i] == r.landmass

    def box(self, r: Region):
        for y in range(r.south, r.north + 1):
            for x in range(r.west, r.east + 1):
                yield y * self.w.W + x

    # ------------------------------------------------------------ division
    def cut(self, src: Region, rows: bool, pct: int, fert: list[int], lmid: list[int]) -> Region:
        """the lines from the south (west) are summed, the entry's own plots
        in each, while the sum is below fertility * pct // 100 and the line
        is below N (E); src ends at the last line summed and keeps that sum,
        the new part starts after it with the rest; the cut side is flagged
        on both (the new part carries no other flag)"""
        dst = src.copy()
        dst.flags = set()
        target = src.fertility * pct // 100
        run = 0
        W = self.w.W
        if rows:
            k = src.south
            while run < target and k < src.north:
                run += sum(fert[k * W + x] for x in range(src.west, src.east + 1) if self.owns(src, k * W + x, lmid))
                k += 1
            src.north, dst.south = k - 1, k
            src.flags.add("N")
            dst.flags.add("S")
        else:
            k = src.west
            while run < target and k < src.east:
                run += sum(fert[y * W + k] for y in range(src.south, src.north + 1) if self.owns(src, y * W + k, lmid))
                k += 1
            src.east, dst.west = k - 1, k
            src.flags.add("E")
            dst.flags.add("W")
        dst.fertility = src.fertility - run
        src.fertility = run
        return dst

    def split(self, e: Region, out: list[Region], fert: list[int], lmid: list[int]) -> None:
        """a region of c civs: 0 or 1 stays whole; else SPLIT[c] parts of
        equal civs, by rows when N - S >= E - W, else by columns: two parts
        cut at 50 %, three cut at 33 % and the rest at 50 %"""
        c = e.civs
        if c <= 1:
            out.append(e)
            return
        if c not in SPLIT:
            self.w.unspecified.append(f"StartPositioner: a region of {c} civs")
            return
        each, ways = SPLIT[c]
        rows = (e.north - e.south) >= (e.east - e.west)
        if ways == 2:
            parts = [e, self.cut(e, rows, 50, fert, lmid)]
        else:
            a = self.cut(e, rows, 33, fert, lmid)
            parts = [e, a, self.cut(a, rows, 50, fert, lmid)]
        for part in parts:
            part.civs = each
            self.split(part, out, fert, lmid)

    def allocate(self, units: list[Region], n: int, fert: list[int], lmid: list[int]) -> list[Region]:
        """n civs one at a time: the units re-sorted by fertility // (civs +
        1) descending (EASTL sort) and the first takes one more; then every
        unit split, the regions sorted by fertility descending (EASTL
        sort), each with its plots"""
        for _ in range(n if units else 0):
            eastl.sort(units, lambda a, b: a.fertility // (a.civs + 1) > b.fertility // (b.civs + 1))
            units[0].civs += 1
        regions: list[Region] = []
        for u in units:
            self.split(u, regions, fert, lmid)
        eastl.sort(regions, lambda a, b: a.fertility > b.fertility)
        for r in regions:
            r.plots = [i for i in range(self.w.N) if self.owns(r, i, lmid) and self.in_rect(i, r)]
        return regions

    def is_major(self, e: Region) -> bool:
        return e.fertility >= self.min_minor and e.fertility >= self.min_major

    # ------------------------------------------------------------ natives
    def DivideMapIntoMajorRegions(self, n, min_major, min_minor, largest_only):
        """the entries of fertility at least both minimums take the n civs;
        the other entries of at least the minor minimum wait for the minor
        division"""
        self.w.rng.ledger.append(("native", "StartPositioner.DivideMapIntoMajorRegions", 0))
        self.min_major, self.min_minor = int(min_major), int(min_minor)
        fert = [self.w.plot_fertility(i) for i in range(self.w.N)]
        self.lmid = self.landmass_ids()
        ent = self.entries(fert, self.lmid)
        keep = lambda e: True  # noqa: E731
        if largest_only:
            # the majors only on the landmass of the most land plots
            size: dict[int, int] = {}
            for i in range(self.w.N):
                if not self.w.is_water(i):
                    size[self.lmid[i]] = size.get(self.lmid[i], 0) + 1
            big = max(size, key=lambda k: size[k]) if size else None
            keep = lambda e: e.landmass == big  # noqa: E731
        self.minor_entries = [e for e in ent if e.fertility >= self.min_minor and not (self.is_major(e) and keep(e))]
        self.major = self.allocate([e for e in ent if self.is_major(e) and keep(e)], int(n), fert, self.lmid)

    def DivideMapIntoMinorRegions(self, n):
        """the major division's minor entries, then a copy of every major
        region with no civs, each re-summed over its box (its own plots) with
        GetPlotFertility(i, -1, true) on the map as it now stands; the n civs
        and the split as for the majors, the cuts on GetPlotFertility(i, -1)"""
        self.w.rng.ledger.append(("native", "StartPositioner.DivideMapIntoMinorRegions", 0))
        fert = [self.w.plot_fertility(i) for i in range(self.w.N)]
        units = [e.copy() for e in self.minor_entries] + [r.copy() for r in self.major]
        for u in units:
            u.fertility = sum(self.GetPlotFertility(i, -1, True) for i in self.box(u) if self.owns(u, i, self.lmid))
        self.minor = self.allocate(units, int(n), fert, self.lmid)

    def GetNumMajorCivStarts(self):
        return len(self.major)

    def GetNumMinorCivStarts(self):
        return len(self.minor)

    def in_rect(self, p: int, r: Region) -> bool:
        x, y = self.w.xy(p)
        return r.west <= x <= r.east and r.south <= y <= r.north

    def _plots(self, regions, i):
        i = int(i)
        return None if not 0 <= i < len(regions) else self.w.lua.table_from(regions[i].plots)

    def GetMajorCivStartPlots(self, i):
        return self._plots(self.major, i)

    def GetMinorCivStartPlots(self, i):
        return self._plots(self.minor, i)

    def _info(self, regions, i):
        i = int(i)
        if not 0 <= i < len(regions):
            return None
        r = regions[i]
        total = (r.east - r.west + 1) * (r.north - r.south + 1)
        return self.w.lua.table_from({"ContinentType": r.continent, "LandmassID": r.landmass,
                                      "Fertility": r.fertility, "TotalPlots": total, "WestEdge": r.west,
                                      "EastEdge": r.east, "NorthEdge": r.north, "SouthEdge": r.south})

    def GetMajorCivStartInfo(self, i):
        return self._info(self.major, i)

    def GetMinorCivStartInfo(self, i):
        return self._info(self.minor, i)

    def MarkMajorRegionUsed(self, i):
        i = int(i)
        if 0 <= i < len(self.major):
            self.major[i].used = True

    def GetPlotFertility(self, i, region=-1, check=False):
        """GetPlotFertility(i, -1) as `World.plot_fertility`, B; for a major
        region r: 0 when r shares a cut edge and the plot's row y is within
        D = START_DISTANCE_MAJOR_CIVILIZATION // 3 of it (north N: y + D > N;
        south S: y - D < S; and, the row against the column edges, east E:
        y + D > E; west W: y - D < W); else B unchecked, or checked
        max(0, trunc((100 - pct) B / 100)) with pct the centre term (cx, cy
        the truncated box centre; 100 when cx == E or cy == N; else
        |trunc(10 (x - cx) / (E - cx))| + |trunc(10 (y - cy) / (N - cy))|)
        plus the distance term. Outside the major regions, checked: the
        distance term alone. The distance term: over the start plots set so
        far in ascending plot order, the largest of 100, 75, 50, 25 at hex
        distance < R, R, R + 1, R + 2, R = START_DISTANCE_FERTILITY_EXCLUSION_ZONE;
        outside the regions R is halved (truncated) before every start
        visited: 3, 1, 0, 0, ..."""
        i = int(i)
        region = -1 if region is None else int(region)
        base = self.w.plot_fertility(i)
        x, y = self.w.xy(i)
        inside = 0 <= region < len(self.major)
        if inside:
            r = self.major[region]
            d = self.w.gpi("START_DISTANCE_MAJOR_CIVILIZATION", 12) // 3
            f = r.flags
            if ("N" in f and y + d > r.north) or ("S" in f and y - d < r.south) or \
                    ("E" in f and y + d > r.east) or ("W" in f and y - d < r.west):
                return 0
            if not check:
                return base
            cx, cy = _tdiv(r.east + r.west, 2), _tdiv(r.north + r.south, 2)
            if cy == r.north or cx == r.east:
                pct = 100
            else:
                pct = abs(_tdiv(10 * (x - cx), r.east - cx)) + abs(_tdiv(10 * (y - cy), r.north - cy))
        elif not check:
            return base
        else:
            pct = 0
        zone = self.w.gpi("START_DISTANCE_FERTILITY_EXCLUSION_ZONE", 6)
        near = 0
        for p in sorted(p for p in self.w.player_start.values() if p is not None):
            if not inside:
                zone //= 2
            dist = self.w.distance(x, y, *self.w.xy(p))
            near = max(near, 100 if dist < zone else 75 if dist == zone else 50 if dist == zone + 1
                       else 25 if dist == zone + 2 else 0)
        pct += near
        if pct <= 0:
            return base
        return max(0, _tdiv((100 - pct) * base, 100))

    # ------------------------------------------------------------ ocean starts
    # the DLL's radius (GameCore_XP2_Release.dll .data 0xF06164 = 3)
    OCEAN_RADIUS = 3

    def _open_ocean(self, i: int) -> bool:
        return self.w.terrain[i] == self.w.tix["TERRAIN_OCEAN"] and self.w.feature[i] < 0

    def _ocean_runs(self, r: int) -> list[int]:
        """the plots, in index order, ending a run (index order, across rows)
        of more than 2r Ocean plots with no feature"""
        out, run = [], 0
        for i in range(self.w.N):
            if self._open_ocean(i):
                run += 1
                if run > 2 * r:
                    out.append(i)
            else:
                run = 0
        return out

    def GetTotalOceanStartCandidates(self, water_map=None):
        """0x890940: the plots ending a run longer than 2R, R the radius (a
        water map: max(1, R - 1))"""
        r = max(1, self.OCEAN_RADIUS - 1) if water_map else self.OCEAN_RADIUS
        return len(self._ocean_runs(r))

    def PlaceOceanStartCivs(self, water_map, n, major_starts):
        """0x890d10, R the radius (a water map: max(1, R - 2)): the
        candidates are the centres (index - R) of the plots ending a run
        longer than 2R; from r = R down to 0 (while fewer than n are kept)
        each candidate is kept, again, when every plot of the hex-space
        offsets (dx, dy) in [-r, r] within range r (GetPlotXYWithRangeCheck)
        is off the map or Ocean with no feature; with at least n kept, n
        times: each kept plot scored by its least hex distance to the major
        starts and the ocean starts so far, sorted by score descending
        (EASTL sort), the first taken. Fewer than n kept places none."""
        n = int(n)
        r0 = max(1, self.OCEAN_RADIUS - 2) if water_map else self.OCEAN_RADIUS
        cands = [i - r0 for i in self._ocean_runs(r0)]
        kept: list[int] = []
        r = r0
        while r >= 0:
            for c in cands:
                x, y = self.w.xy(c)
                ok = True
                for dx in range(-r, r + 1):
                    for dy in range(-r, r + 1):
                        if (abs(dx) + abs(dy) if (dx >= 0) == (dy >= 0) else max(abs(dx), abs(dy))) > r:
                            continue
                        q, yy = x - (y >> 1) + dx, y + dy
                        p = self.w.plot(q + (yy >> 1), yy)
                        if p is not None and not self._open_ocean(p):
                            ok = False
                            break
                    if not ok:
                        break
                if ok:
                    kept.append(c)
            r -= 1
            if len(kept) >= n:
                break
        starts = [int(major_starts[k]) for k in range(1, len(major_starts) + 1)] if major_starts else []
        self.ocean = []
        if len(kept) < n:
            return 0
        while len(self.ocean) < n:
            pairs = []
            for b in kept:
                bx, by = self.w.xy(b)
                pairs.append((b, min((self.w.distance(bx, by, *self.w.xy(s)) for s in starts + self.ocean),
                                     default=0x7FFFFFFF)))
            eastl.sort(pairs, lambda u, v: u[1] > v[1])
            self.ocean.append(pairs[0][0])
        return len(self.ocean)

    def GetOceanStartTile(self, i):
        return self.ocean[int(i)]


def _tdiv(a: int, b: int) -> int:
    """C integer division, truncating toward zero"""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q
