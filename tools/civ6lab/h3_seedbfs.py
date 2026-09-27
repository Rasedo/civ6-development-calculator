"""H-3: StampContinents' split of one land area into n continents, as the
install's GameCore_XP2_Release.dll codes it (Region_Builder.cpp; read with
h3_dis.py: 0x888570 the split, 0x8846d0 the border sources, 0x885f00 the
BFS, 0x888460 a seed source, 0x8869f0 the Voronoi, 0x884fe0 the stamp,
0x887410 the region mask), scored on every recorded stamp.

    python tools/civ6lab/h3_seedbfs.py [records ...] [--show NAME]

The rule:
  mask: the area's plots, plus every plot outside it that is not water
    (0x1800834d0) with at least 5 of its 6 neighbours in the area;
  seeds, n times: sources = the mask plots with a neighbour outside the mask
    (in bounds), in plot-index order, then the seeds so far in their order;
    a FIFO BFS over the mask from the sources (neighbours in the order NE,
    W, SE, SW, E, NW); the plot appended last is the next seed; a repeat
    of an earlier seed ends the search (fewer continents);
  parts: a FIFO BFS from the seeds in order (label k), same neighbour order;
    continent k of the area = label k.
Coordinates are cube (q = x - (y >> 1), r = y, s = -q - r) and a neighbour's
column is q + (r >> 1) wrapped mod W, as the DLL computes them.
"""
from __future__ import annotations

import collections
import glob
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import h3_stampfit as sf  # noqa: E402

# the DLL's direction table (dq, dr, ds) at 0xF0BF40: NE, W, SE, SW, E, NW
DIRS = ((0, 1, -1), (-1, 0, 1), (1, -1, 0), (0, -1, 1), (1, 0, -1), (-1, 1, 0))
OUT, IN = 0xFE, 0xFF


def cube(g, i):
    x, y = i % g.w, i // g.w
    q = x - (y >> 1)
    return (q, y, -q - y)


def plot_of(g, c):
    q, r, _ = c
    if not 0 <= r < g.h:
        return None
    return r * g.w + (q + (r >> 1)) % g.w


def bfs(g, grid, queue):
    """FIFO over plots marked IN; a reached plot takes its parent's label;
    returns the queue (sources first)"""
    k = 0
    while k < len(queue):
        c, lab = queue[k]
        k += 1
        for dq, dr, ds in DIRS:
            nc = (c[0] + dq, c[1] + dr, c[2] + ds)
            p = plot_of(g, nc)
            if p is not None and grid[p] == IN:
                grid[p] = lab
                queue.append((nc, lab))
    return queue


def mask_of(g, area: set[int], water) -> list[int]:
    grid = [OUT] * g.n
    for i in range(g.n):
        if i in area:
            grid[i] = IN
        elif not water[i]:
            nb = sum(1 for d in DIRS if (p := plot_of(g, tuple(a + b for a, b in zip(cube(g, i), d)))) is not None
                     and p in area)
            if nb > 4:
                grid[i] = IN
    return grid


def seeds_of(g, mask: list[int], n: int) -> list[tuple]:
    seeds = []
    for _ in range(n):
        grid = list(mask)
        queue = []
        for i in range(g.n):
            if grid[i] != IN:
                continue
            c = cube(g, i)
            for d in DIRS:
                p = plot_of(g, (c[0] + d[0], c[1] + d[1], c[2] + d[2]))
                if p is not None and grid[p] == OUT:
                    queue.append((c, 0))
                    grid[i] = 0
                    break
        for s in seeds:
            queue.append((s, 0))
            grid[plot_of(g, s)] = 0
        q = bfs(g, grid, queue)
        cand = q[-1][0]
        if cand in seeds:
            break
        seeds.append(cand)
    return seeds


def parts_of(g, mask: list[int], seeds: list[tuple]) -> list[int]:
    grid = list(mask)
    queue = []
    for k, s in enumerate(seeds):
        grid[plot_of(g, s)] = k
        queue.append((s, k))
    bfs(g, grid, queue)
    return [v if v not in (IN, OUT) else -1 for v in grid]


def score(c: dict, show: bool = False):
    """per passable-land area holding its own parts: (parts right, order right)"""
    g = c["g"]
    water = [not v for v in c["land"]]
    out = []
    for a in sf.areas(c):
        if a["kind"] != "L":
            continue
        area = set(a["plots"])
        truth = [c["part"][i] for i in a["plots"]]
        ks = sorted(set(truth) - {-1})
        # parts shared with another area (a seedless island joined) are skipped
        others = {c["part"][i] for i in range(g.n) if i not in area and c["land"][i]}
        if not ks or set(ks) & others:
            continue
        n = len(ks)
        mask = mask_of(g, area, water)
        seeds = seeds_of(g, mask, n)
        pred = parts_of(g, mask, seeds)
        # label k -> the k-th smallest part number of the area
        ok_part = len(seeds) == n and all(ks[pred[i]] == c["part"][i] for i in a["plots"] if pred[i] >= 0) \
            and all(pred[i] >= 0 for i in a["plots"])
        # partition up to relabelling
        m = {}
        up = len(seeds) == n
        for i in a["plots"]:
            if m.setdefault(pred[i], c["part"][i]) != c["part"][i]:
                up = False
        if len(set(m.values())) != len(m):
            up = False
        out.append((len(a["plots"]), n, ok_part, up, seeds))
        if show:
            print(f"  area {len(a['plots'])} n={n} exact={ok_part} partition={up} seeds="
                  f"{[(plot_of(g, s) % g.w, plot_of(g, s) // g.w) for s in seeds]}")
    return out


def main() -> int:
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    show = sys.argv[sys.argv.index("--show") + 1] if "--show" in sys.argv else None
    if show:
        args = [a for a in args if a != show]
    paths = args or (sorted(glob.glob(str(HERE / "runs" / "h3_stampx_*.json")))
                     + [str(HERE / "runs" / p) for p in sf.EXP]
                     + [str(HERE / "runs" / pathlib.Path(p).name)
                        for p in open(HERE / "runs" / "h3_natives_all.txt").read().split()])
    cases = sf.load_cases(paths)
    tot = collections.Counter()
    for c in cases:
        res = score(c, show=bool(show and (show == "all" or show == c["name"])))
        for size, n, ok, up, _ in res:
            key = "n1" if n == 1 else "multi"
            tot[key, "areas"] += 1
            tot[key, "exact"] += ok
            tot[key, "partition"] += up
            if n > 1 and not ok and (show is None):
                print(f"MISS {c['src']} {c['name']} area {size} n={n} partition={up}")
    for k in ("multi", "n1"):
        print(k, {kk[1]: v for kk, v in tot.items() if kk[0] == k})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
