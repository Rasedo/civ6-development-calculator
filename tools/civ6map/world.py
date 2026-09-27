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

from .cvrandom import Rng
from .fractal import Fractal
from .gameinfo import GameInfo

OPEN_NATIVES = {
    "TerrainBuilder.StampContinents": "the split of the land among Maps.Continents > 1 continents, and which "
                                      "part takes the shuffle's first entry (every plot joins continent 0 and "
                                      "the run records it in World.unspecified)",
    "Map.GetContinentPlots": "the order of the plots it answers (plot order here)",
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
        natural wonder's plot), the feature's and the resource's, and the
        adjacency yields of every natural-wonder plot next to it (a
        multi-plot wonder's own plots included)"""
        if self.is_impassable(i):
            return 0
        f = self.feature[i]
        nw = f >= 0 and bool(self.f_rows[f]["NaturalWonder"])
        v = 0 if nw else self.t_yield.get((self.terrain[i], y), 0)
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
        fresh land, +1 per adjacent mountain, +1 per distinct natural wonder
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
            if self.is_river(i):
                v += 3
            elif self.is_fresh_water(i):
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
        IsRiver false on both sides of such an edge)"""
        if self.is_water(i):
            return False
        return any(on and (n := self.adj(i, d)) is not None and not self.is_water(n)
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

    def can_have_feature(self, i: int, f: int) -> bool:
        """CanHaveFeature's single-plot test: 15 clauses in order, each from
        the install's rows (h3_natives_spec.md)"""
        if f < 0:
            return True
        fr = self.f_rows[f]
        nb = self.neighbours(i)
        lake = self.is_lake(i)
        if self.feature[i] >= 0:                                               # 1
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
        if fr["Lake"] and any(self.is_water(n) for n in nb):                   # 6
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
            r = self.N // 256
            if any(self.feature[q] in self.f_not_near[f] for q in self.within(i, r)):
                return False
        mnw = fr["MinDistanceNW"]
        if mnw is not None and mnw > 0:                                        # 15
            if any(self.is_natural_wonder(q) for q in self.within(i, mnw)):
                return False
        return True

    def footprint(self, i: int, f: int, custom: bool = False) -> list[int] | None:
        """the plots a natural wonder with Tiles > 1 and no CustomPlacement
        covers from anchor i: the first orientation d in DirectionTypes order
        whose extra plots all pass the single-plot test — 2 plots: the
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
            if all(q is not None and self.can_have_feature(q, f) for q in extra):
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
        CustomPlacement lays its footprint (nothing at all when none fits); a
        lake wonder turns every plot it covers into Coast"""
        plots = [i]
        if f >= 0 and self.f_rows[f]["NaturalWonder"]:
            plots = self.footprint(i, f)
            if plots is None:
                return
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
        with no land neighbour"""
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
        return True

    def adjacent_resource_count(self, i: int) -> int:
        return sum(1 for n in self.neighbours(i) if self.resource[n] >= 0)

    # ---------------------------------------------------------- floodplains
    def river_plots(self) -> dict[int, list[int]]:
        """each river's plots: its setter calls in the order DoRiver made
        them, each adding the plot passed and then its partner across the edge
        (W of river: the E neighbour; NW: the SE neighbour; NE: the SW
        neighbour), each plot once"""
        partner = (E, SE, SW)
        out: dict[int, list[int]] = {}
        for rid, p, edge in self.river_order:
            lst = out.setdefault(rid, [])
            for q in (p, self.adj(p, partner[edge])):
                if q is not None and q not in lst:
                    lst.append(q)
        return out

    def generate_floodplains(self, lo: int, hi: int) -> None:
        """GenerateFloodplains: per river, from the mouth (the list's end)
        towards the source, the first maximal run of at least `lo`
        consecutive flat, featureless grassland, plains or desert plots; its
        `hi` plots nearest the mouth take the floodplain of their terrain.
        Every river is judged on the map as it stands before any floodplain
        (the union of the runs)."""
        fp = {self.tix["TERRAIN_DESERT"]: self.fix["FEATURE_FLOODPLAINS"],
              self.tix["TERRAIN_GRASS"]: self.fix["FEATURE_FLOODPLAINS_GRASSLAND"],
              self.tix["TERRAIN_PLAINS"]: self.fix["FEATURE_FLOODPLAINS_PLAINS"]}
        take: dict[int, int] = {}
        for plots in self.river_plots().values():
            run: list[int] = []
            for p in [*reversed(plots), None]:
                if p is not None and self.terrain[p] in fp and self.feature[p] < 0:
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
        """which of the n continents each non-ocean plot joins (-1 ocean).
        Measured: the first seed is the non-ocean plot of greatest Euclidean
        distance to the nearest ocean plot (centres at (x + 0.5 on odd rows,
        y), rows one unit apart, x wrapping; a tie to the higher plot), and
        every plot joins the nearest seed by land path (6 neighbours through
        non-ocean plots, x wrapping), a tie to the lower seed; seed k's part
        is continent k. Not measured, stood in and recorded in
        `self.unspecified`: the later seeds (the next deepest plot whose land
        path to every seed s is at least s's hex depth - 1) and a plot no
        seed reaches by land (the nearest seed by hex distance)."""
        ocean = [self.is_water(i) and not self.is_lake(i) for i in range(self.N)]
        land = [i for i in range(self.N) if not ocean[i]]
        if not land:
            return [-1] * self.N
        depth = self.euclid_depth(ocean)
        order = sorted(land, key=lambda i: (depth[i], i), reverse=True)
        seeds = [order[0]]
        paths = [self.land_path(order[0], ocean)]
        if n > 1:
            self.unspecified.append("StampContinents: the seeds after the first")
            hexd = self.hex_depth(ocean)
            for i in order[1:]:
                if len(seeds) == n:
                    break
                if all(paths[k][i] < 0 or paths[k][i] >= hexd[s] - 1 for k, s in enumerate(seeds)):
                    seeds.append(i)
                    paths.append(self.land_path(i, ocean))
        self.continent_seeds = seeds
        part = [-1] * self.N
        stray = False
        for i in land:
            reach = [(d[i], k) for k, d in enumerate(paths) if d[i] >= 0]
            if reach:
                part[i] = min(reach)[1]
            else:
                stray = True
                x, y = self.xy(i)
                part[i] = min((self.distance(x, y, *self.xy(s)), k) for k, s in enumerate(seeds))[1]
        if stray and len(seeds) > 1:
            self.unspecified.append("StampContinents: land no seed reaches")
        return part

    def euclid_depth(self, ocean: list[bool]) -> list[int]:
        """per plot, the squared Euclidean distance to the nearest ocean plot
        in quarter units (centres at (2x + (y odd), 2y), x wrapping), as an
        exact integer; (1 << 60) with no ocean"""
        rows: dict[int, list[int]] = {}
        for i in range(self.N):
            if ocean[i]:
                x, y = self.xy(i)
                rows.setdefault(y, []).append(2 * x + (y & 1))
        span = 2 * self.W
        out = [0] * self.N
        for i in range(self.N):
            if ocean[i]:
                continue
            x, y = self.xy(i)
            cx = 2 * x + (y & 1)
            best = 1 << 60
            for dy in range(self.H):
                if 4 * dy * dy >= best:
                    break
                for yy in {y - dy, y + dy}:
                    for ox in rows.get(yy, ()):
                        dx = abs(cx - ox)
                        if self.wrap_x:
                            dx = min(dx, span - dx)
                        d = dx * dx + 4 * dy * dy
                        if d < best:
                            best = d
            out[i] = best
        return out

    def hex_depth(self, ocean: list[bool]) -> list[int]:
        """hex distance to the nearest ocean plot (0 on ocean)"""
        d = [0 if o else -1 for o in ocean]
        front = [i for i in range(self.N) if ocean[i]]
        k = 0
        while front:
            k += 1
            nxt = []
            for u in front:
                for v in self.neighbours(u):
                    if d[v] < 0:
                        d[v] = k
                        nxt.append(v)
            front = nxt
        return d

    def land_path(self, s: int, ocean: list[bool]) -> list[int]:
        """steps from s through non-ocean plots (-1 where no path runs)"""
        d = [-1] * self.N
        d[s] = 0
        front = [s]
        k = 0
        while front:
            k += 1
            nxt = []
            for u in front:
                for v in self.neighbours(u):
                    if d[v] < 0 and not ocean[v]:
                        d[v] = k
                        nxt.append(v)
            front = nxt
        return d

    def continents_in_use(self) -> list[int]:
        return sorted({c for c in self.continent if c >= 0})

    def find_second_continent(self, i: int, rng) -> bool:
        """a continent on the plot and another one within hex distance rng"""
        c = self.continent[i]
        if c < 0:
            return False
        return any(self.continent[p] not in (-1, c) for p in self.within(i, int(rng)))

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
    __slots__ = ("landmass", "west", "east", "south", "north", "plots", "fertility", "continent", "used")

    def __init__(self, landmass, west, east, south, north):
        self.landmass, self.west, self.east, self.south, self.north = landmass, west, east, south, north
        self.plots: list[int] = []
        self.fertility = 0
        self.continent = -1
        self.used = False


class Starts:
    """StartPositioner. Measured (h3_natives_spec.md and the natives probe's
    region records): GetPlotFertility(i, -1); a landmass (as the last area
    recalculation saw it) spans the inclusive rectangle of its plots, x not
    wrapping; a region is a rectangle, its plots the landmass's plots
    inside it in plot order, its fertility their GetPlotFertility sum, its
    TotalPlots every plot of the rectangle; a landmass holding two regions
    is cut by rows from the south after the first row where twice the
    running fertility reaches the total, both parts keeping its columns;
    the regions come in fertility order, largest first.
    Not measured, stood in and recorded in World.unspecified: how many
    regions each landmass takes (fertility per region, largest first), a
    cut into three or more (one region's share at a time), a cut by columns
    (when the rectangle is wider than tall), the count GetNumMajorCivStarts
    answers, the minor regions (the same machinery over the minor count and
    the same fertility; the game's minor Fertility is another measure),
    GetPlotFertility with a major, and the ocean starts (none: a roster
    without an ocean-start leader never reads them)."""

    def __init__(self, world: "World"):
        self.w = world
        self.major: list[Region] = []
        self.minor: list[Region] = []

    # ------------------------------------------------------------ landmasses
    def landmasses(self) -> dict[int, list[int]]:
        """the components of land (mountains included) and of water as the
        last area recalculation saw them (a lake wonder's plots stay land),
        numbered k = 1, 2, ... by their lowest plot, id (k << 16) | (k - 1);
        the land ones, with their plots in plot order"""
        w = self.w
        wet = [w.areas[w.area_of[p]].water for p in range(w.N)]
        seen = [0] * w.N
        out: dict[int, list[int]] = {}
        k = 0
        for s in range(w.N):
            if seen[s]:
                continue
            k += 1
            lid = (k << 16) | (k - 1)
            water = wet[s]
            comp, stack = [], [s]
            seen[s] = lid
            while stack:
                p = stack.pop()
                comp.append(p)
                for n in w.neighbours(p):
                    if not seen[n] and wet[n] == water:
                        seen[n] = lid
                        stack.append(n)
            if not water:
                out[lid] = sorted(comp)
        return out

    def bounds(self, plots: list[int]) -> tuple[int, int, int, int]:
        """the smallest inclusive rectangle (west, east, south, north) holding
        the plots, x not wrapping: a landmass across the seam spans x 0..W-1"""
        xs = [p % self.w.W for p in plots]
        ys = [p // self.w.W for p in plots]
        return min(xs), max(xs), min(ys), max(ys)

    def in_rect(self, p: int, r: Region) -> bool:
        x, y = self.w.xy(p)
        return r.west <= x <= r.east and r.south <= y <= r.north

    def region(self, lid: int, plots: list[int], rect: tuple) -> Region:
        """the region over a rectangle: the landmass's plots inside it"""
        r = Region(lid, *rect)
        r.plots = [p for p in plots if self.in_rect(p, r)]
        r.fertility = sum(self.w.plot_fertility(p) for p in r.plots)
        conts = [self.w.continent[p] for p in r.plots if self.w.continent[p] >= 0]
        r.continent = max(set(conts), key=conts.count) if conts else -1
        return r

    def divide(self, lid: int, plots: list[int], rect: tuple, k: int) -> list[Region]:
        """k regions over the rectangle: two by rows from the south, after
        the first row where twice the running fertility reaches the total,
        each part keeping the rectangle's columns (measured); by columns from
        the west when the rectangle is wider than tall, and one region's
        share at a time for three or more (not measured)"""
        whole = self.region(lid, plots, rect)
        west, east, south, north = rect
        if k <= 1 or len(whole.plots) < 2 or (west == east and south == north):
            return [whole]
        if k > 2:
            self.w.unspecified.append(f"StartPositioner: a landmass cut into {k} regions")
        fert = {p: self.w.plot_fertility(p) for p in whole.plots}
        by_col = east - west > north - south
        if by_col:
            self.w.unspecified.append("StartPositioner: a region cut by columns")
            line, span = [p % self.w.W for p in whole.plots], range(west, east)
        else:
            line, span = [p // self.w.W for p in whole.plots], range(south, north)
        run = 0
        cut = span[-1]
        for c in span:
            run += sum(fert[p] for p, q in zip(whole.plots, line) if q == c)
            if k * run >= whole.fertility:
                cut = c
                break
        if by_col:
            first, rest = (west, cut, south, north), (cut + 1, east, south, north)
        else:
            first, rest = (west, east, south, cut), (west, east, cut + 1, north)
        return self.divide(lid, plots, first, 1) + self.divide(lid, plots, rest, k - 1)

    def allocate(self, n: int, lms: dict[int, list[int]]) -> list[Region]:
        """n regions over the landmasses (how many each takes: fertility per
        region, largest first, not measured), in fertility order, largest
        first"""
        fert = {lid: sum(self.w.plot_fertility(p) for p in pl) for lid, pl in lms.items()}
        count = {lid: 0 for lid in lms}
        for _ in range(n):
            lid = max(lms, key=lambda m: (fert[m] / (1 + count[m]), -m))
            count[lid] += 1
        regions: list[Region] = []
        for lid in lms:
            if count[lid]:
                regions += self.divide(lid, lms[lid], self.bounds(lms[lid]), count[lid])
        return sorted(regions, key=lambda r: -r.fertility)

    # ------------------------------------------------------------ natives
    def DivideMapIntoMajorRegions(self, n, fert, minor_fert, flag):
        self.w.rng.ledger.append(("native", "StartPositioner.DivideMapIntoMajorRegions", 0))
        self.w.unspecified.append("StartPositioner: the regions per landmass")
        self.major = self.allocate(int(n), self.landmasses())

    def DivideMapIntoMinorRegions(self, n):
        self.w.rng.ledger.append(("native", "StartPositioner.DivideMapIntoMinorRegions", 0))
        self.w.unspecified.append("StartPositioner: the minor regions")
        self.minor = self.allocate(int(n), self.landmasses())

    def GetNumMajorCivStarts(self):
        return len(self.major)

    def GetNumMinorCivStarts(self):
        return len(self.minor)

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
        total = sum(1 for p in range(self.w.N) if self.in_rect(p, r))
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

    def GetPlotFertility(self, i, major=-1, check=False):
        if major is not None and major >= 0 and check:
            self.w.unspecified.append("StartPositioner.GetPlotFertility(i, major, true)")
        return self.w.plot_fertility(int(i))

    def GetTotalOceanStartCandidates(self, water_map=None):
        return 0

    def PlaceOceanStartCivs(self, *a):
        return 0

    def GetOceanStartTile(self, i):
        return -1
