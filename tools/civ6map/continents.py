"""TerrainBuilder.StampContinents' partition: which of the map size's N
continents every non-ocean plot joins, as the install's DLL codes it
(Region_Builder.cpp; tools/civ6lab/h3_stampdll.py and h3_seedbfs.py, scored
on every recorded stamp).

The plot classes are AreaBuilder's: ocean, lakes (both water here), passable
land and mountains; an area is a connected component of one class (6
neighbours), in the order of its lowest plot.

1. L = the land and mountain plots, T = (L // N) // 3. The land and
   mountain areas larger than T (none: the first largest area) take one
   continent each, sorted by size descending (stable); while fewer than N
   are given, the first takes one more and sinks below every entry whose
   size / continents is at least its own; surplus entries are dropped from
   the end.
2. An entry of one continent is one part, but a mountain area of one
   continent takes none. An entry of c continents is split: the mask is
   its plots plus every non-water plot outside it with at least 5 of its 6
   neighbours in it; c times, a FIFO search over the mask from its plots
   next to a plot outside it (plot order) and then the seeds so far, and
   the plot reached last is the next seed (a repeat ends it: fewer parts);
   then a FIFO search from the seeds in order labels the mask. Searches
   step NE, W, SE, SW, E, NW in cube coordinates (q = x - (y >> 1)). The
   parts take the next part numbers in entry order, label order.
3. A land area without a part joins the part a search over every plot of
   no part (from each part's land plots next to one, part by part, plot
   order) reaches its centroid from (the truncated means of q and y).
4. Every land, mountain and lake plot still without a part takes the part
   a search from all parts' plots next to a plot of no part (plot order)
   reaches it from.
"""
from __future__ import annotations

OCEAN, LAND, MOUNTAIN, LAKE = 0, 1, 2, 3
OUT, IN = -2, -3
# the DLL's direction table (dq, dr): NE, W, SE, SW, E, NW
DIRS = ((0, 1), (-1, 0), (1, -1), (0, -1), (1, 0), (-1, 1))


class Grid:
    def __init__(self, w: int, h: int, wrap_x: bool):
        self.w, self.h, self.wrap_x = w, h, wrap_x
        self.n = w * h
        self.cube = [(i % w - ((i // w) >> 1), i // w) for i in range(self.n)]
        self.nb = [[self.plot(q + dq, r + dr) for dq, dr in DIRS] for q, r in self.cube]

    def plot(self, q: int, r: int) -> int | None:
        if not 0 <= r < self.h:
            return None
        x = q + (r >> 1)
        if self.wrap_x:
            x %= self.w
        elif not 0 <= x < self.w:
            return None
        return r * self.w + x


def components(g: Grid, kind: list[int]) -> list[list[int]]:
    """the non-ocean components of one class each, by lowest plot, plots sorted"""
    seen = [False] * g.n
    out = []
    for s in range(g.n):
        if seen[s] or kind[s] == OCEAN:
            continue
        seen[s] = True
        comp, stack = [], [s]
        while stack:
            u = stack.pop()
            comp.append(u)
            for v in g.nb[u]:
                if v is not None and not seen[v] and kind[v] == kind[s]:
                    seen[v] = True
                    stack.append(v)
        out.append(sorted(comp))
    return out


def search(g: Grid, grid: list[int], queue: list[tuple[int, int]], match: int) -> list[tuple[int, int]]:
    """FIFO from the queue of (plot, label): a reached plot of value `match`
    takes its parent's label; the queue as it ends"""
    k = 0
    while k < len(queue):
        p, lab = queue[k]
        k += 1
        for v in g.nb[p]:
            if v is not None and grid[v] == match:
                grid[v] = lab
                queue.append((v, lab))
    return queue


def split(g: Grid, area: set[int], water: list[bool], c: int) -> list[int]:
    """step 2: every plot's label, -1 outside the mask"""
    mask = [OUT] * g.n
    for i in range(g.n):
        if i in area or (not water[i] and sum(1 for v in g.nb[i] if v is not None and v in area) > 4):
            mask[i] = IN
    seeds: list[int] = []
    for _ in range(c):
        grid = list(mask)
        queue = []
        for i in range(g.n):
            if grid[i] == IN and any(v is not None and grid[v] == OUT for v in g.nb[i]):
                queue.append((i, 0))
                grid[i] = 0
        for s in seeds:
            queue.append((s, 0))
            grid[s] = 0
        last = search(g, grid, queue, IN)[-1][0]
        if last in seeds:
            break
        seeds.append(last)
    grid = list(mask)
    queue = []
    for k, s in enumerate(seeds):
        grid[s] = k
        queue.append((s, k))
    search(g, grid, queue, IN)
    return [v if v >= 0 else -1 for v in grid]


def border(g: Grid, grid: list[int], labels) -> list[tuple[int, int]]:
    """the plots of each label in turn with a neighbour of value OUT, plot order"""
    out = []
    for lab in labels:
        for i in range(g.n):
            if grid[i] == lab and any(v is not None and grid[v] == OUT for v in g.nb[i]):
                out.append((i, lab))
    return out


def partition(w: int, h: int, wrap_x: bool, kind: list[int], n: int) -> list[int]:
    """the part number of every plot, -1 on ocean"""
    g = Grid(w, h, wrap_x)
    water = [k in (OCEAN, LAKE) for k in kind]
    areas = [a for a in components(g, kind) if kind[a[0]] in (LAND, MOUNTAIN)]
    part = [-1] * g.n
    if not areas:
        return part
    t = (sum(len(a) for a in areas) // n) // 3
    ent = [[a, 1] for a in areas if len(a) > t] or [[max(areas, key=len), 1]]
    ent.sort(key=lambda e: -len(e[0]))
    for _ in range(n - len(ent)):
        ent[0][1] += 1
        for k in range(1, len(ent)):
            if len(ent[k - 1][0]) / ent[k - 1][1] > len(ent[k][0]) / ent[k][1]:
                break
            ent[k - 1], ent[k] = ent[k], ent[k - 1]
    ent = ent[:n]
    nxt = 0
    for a, c in ent:
        if c == 1:
            if kind[a[0]] == MOUNTAIN:
                continue
            for i in a:
                part[i] = nxt
            nxt += 1
            continue
        lab = split(g, set(a), water, c)
        for i in range(g.n):
            if lab[i] >= 0:
                part[i] = nxt + lab[i]
        nxt += max(lab) + 1
    if not nxt:
        return part
    chosen = {id(e[0]) for e in ent}
    seedless = [a for a in areas if id(a) not in chosen and kind[a[0]] == LAND]
    if seedless:
        grid = [part[i] if part[i] >= 0 and kind[i] == LAND else OUT for i in range(g.n)]
        search(g, grid, border(g, grid, range(nxt)), OUT)
        for a in seedless:
            p = g.plot(int(sum(g.cube[i][0] for i in a) / len(a)), int(sum(g.cube[i][1] for i in a) / len(a)))
            if p is None or grid[p] < 0:
                continue
            for i in a:
                if part[i] == -1:
                    part[i] = grid[p]
    grid = [part[i] if part[i] >= 0 else OUT for i in range(g.n)]
    search(g, grid, sorted(border(g, grid, range(nxt))), OUT)
    for i in range(g.n):
        if kind[i] != OCEAN and part[i] == -1 and grid[i] >= 0:
            part[i] = grid[i]
    return part
