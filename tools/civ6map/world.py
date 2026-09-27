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
        carries one, ocean -1. With Maps.Continents = 1 the partition is the
        whole: the rest of it is `partition_continents`."""
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
        Measured for n = 1 only; for more the game's split is not specified
        (h3_natives_spec.md) and every plot joins continent 0, recorded in
        `self.unspecified`"""
        if n != 1:
            self.unspecified.append(f"StampContinents: the land split among {n} continents")
        return [0 if (not self.is_water(i) or self.is_lake(i)) else -1 for i in range(self.N)]

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
