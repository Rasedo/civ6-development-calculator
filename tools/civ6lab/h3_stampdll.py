"""H-3: TerrainBuilder.StampContinents as the install's DLL codes it
(GameCore_XP2_Release.dll, Region_Builder.cpp; read with h3_dis.py), end to
end, scored plot for plot on every recorded stamp.

    python tools/civ6lab/h3_stampdll.py [records ...]

0x896880 (the native): L = the map's land plots, N = Maps.Continents,
  T = (L // N) // 3 (a fallback when no area is larger: not reached here).
0x885260: the non-water areas (passable land or mountain) larger than T, each with 1 continent, in area
  order, insertion-sorted by size / continents descending (stable); the
  largest takes one more continent and sinks below every entry whose
  ratio is >= its own, until N are given; surplus entries are dropped from
  the end. Each entry with 2+ continents is split (0x888570, h3_seedbfs)
  and its parts take the next shuffled continents in label order; an entry
  with 1 takes the next continent on its passable plots (0x884f30), so a
  mountain area takes none and uses no continent.
0x884b10: a passable-land area without continents joins the continent whose
  plots a multi-source BFS over every other plot reaches its centroid from
  first (the centroid: the truncated means of q = x - (y >> 1) and y);
  sources: each continent's plots next to a plot of no continent, continent
  by continent, plot-index order.
0x8862a0: every non-water plot or lake plot still without a continent takes
  the continent a BFS from all continent plots (the border ones, plot-index
  order, labels = the continent's shuffled index) reaches it from first.
"""
from __future__ import annotations

import collections
import glob
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import h3_stampfit as sf  # noqa: E402
from h3_seedbfs import DIRS, IN, OUT, bfs, cube, mask_of, parts_of, plot_of, seeds_of  # noqa: E402


def border_sources(g, grid, labels):
    """plots whose value is in `labels` with an in-bounds neighbour of value
    OUT, plot-index order, one pass per label in `labels` order"""
    q = []
    for lab in labels:
        for i in range(g.n):
            if grid[i] != lab:
                continue
            c = cube(g, i)
            for d in DIRS:
                p = plot_of(g, (c[0] + d[0], c[1] + d[1], c[2] + d[2]))
                if p is not None and grid[p] == OUT:
                    q.append((c, lab))
                    break
    return q


def bfs_out(g, grid, queue):
    """the BFS of 0x885f00 with the match value OUT"""
    k = 0
    while k < len(queue):
        c, lab = queue[k]
        k += 1
        for dq, dr, ds in DIRS:
            nc = (c[0] + dq, c[1] + dr, c[2] + ds)
            p = plot_of(g, nc)
            if p is not None and grid[p] == OUT:
                grid[p] = lab
                queue.append((nc, lab))


def stamp(c: dict) -> list[int]:
    g = c["g"]
    n_cont = c["n"]
    cls = c.get("cls") or [("L" if v else None) for v in c["land"]]
    water = [x in (None, "K") for x in cls]
    lake = [x == "K" for x in cls]
    areas = [a for a in sf.areas(c) if a["kind"] in ("L", "M")]
    L = sum(1 for x in cls if x in ("L", "M"))
    T = (L // n_cont) // 3
    ent = [[a, 1] for a in areas if len(a["plots"]) > T]
    if not ent:
        big = max(areas, key=lambda a: len(a["plots"]))  # first max
        ent = [[big, 1]]
    # stable insertion sort by size / count descending
    ent.sort(key=lambda e: -len(e[0]["plots"]))
    if len(ent) < n_cont:
        for _ in range(n_cont - len(ent)):
            ent[0][1] += 1
            for k in range(1, len(ent)):
                prev = len(ent[k - 1][0]["plots"]) / ent[k - 1][1]
                cur = len(ent[k][0]["plots"]) / ent[k][1]
                if prev > cur:
                    break
                ent[k - 1], ent[k] = ent[k], ent[k - 1]
    elif len(ent) > n_cont:
        ent = ent[:n_cont]
    cont = [-1] * g.n
    nxt = 0
    for a, cnt in ent:
        area = set(a["plots"])
        if cnt == 1 or not connected(g, area):
            # 0x884f30: the area's passable plots (0x887230); a mountain
            # area has none and takes no continent
            if a["kind"] == "M":
                continue
            for i in area:
                cont[i] = nxt
            nxt += 1
            continue
        mask = mask_of(g, area, water)
        seeds = seeds_of(g, mask, cnt)
        lab = parts_of(g, mask, seeds)
        for k in range(len(seeds)):
            for i in range(g.n):
                if lab[i] == k:
                    cont[i] = nxt
            nxt += 1
    # seedless areas
    chosen = {id(e[0]) for e in ent}
    seedless = [a for a in areas if id(a) not in chosen and a["kind"] == "L"]
    if seedless and nxt:
        grid = [OUT] * g.n
        for i in range(g.n):
            if cont[i] >= 0 and not water[i] and cls[i] != "M":
                grid[i] = cont[i]
        queue = border_sources(g, grid, range(nxt))
        bfs_out(g, grid, queue)
        for a in seedless:
            qs = [cube(g, i) for i in a["plots"]]
            qa = int(sum(q[0] for q in qs) / len(qs))
            ra = int(sum(q[1] for q in qs) / len(qs))
            p = plot_of(g, (qa, ra, -qa - ra))
            if p is None or grid[p] in (OUT, IN) or grid[p] >= nxt:
                continue
            for i in a["plots"]:
                if cont[i] == -1:
                    cont[i] = grid[p]
    # the final pass
    grid = [cont[i] if cont[i] >= 0 else OUT for i in range(g.n)]
    queue = border_sources(g, grid, sorted(set(cont) - {-1}))
    queue.sort(key=lambda e: plot_of(g, e[0]))  # one row-major pass, not per label
    bfs_out(g, grid, queue)
    for i in range(g.n):
        if (not water[i] or lake[i]) and cont[i] == -1 and grid[i] != OUT:
            cont[i] = grid[i]
    return cont


def connected(g, area: set[int]) -> bool:
    start = min(area)
    seen = {start}
    st = [start]
    while st:
        u = st.pop()
        for v in g.ring1(u):
            if v is not None and v in area and v not in seen:
                seen.add(v)
                st.append(v)
    return len(seen) == len(area)


def main() -> int:
    argv = sys.argv[1:]
    opt = {}
    for k in ("--land", "--mtn", "--show"):
        if k in argv:
            j = argv.index(k)
            opt[k] = argv[j + 1]
            del argv[j:j + 2]
    paths = argv or (sorted(glob.glob(str(HERE / "runs" / "h3_stampx_*.json")))
                     + [str(HERE / "runs" / p) for p in sf.EXP]
                     + [str(HERE / "runs" / pathlib.Path(p).name)
                        for p in open(HERE / "runs" / "h3_natives_all.txt").read().split()])
    cases = sf.load_cases(paths)
    # stamp-probe records with the shape's terrain: mountains and lakes
    import json
    from h3_x import unrle
    ter = {}
    for p in paths:
        if pathlib.Path(p).name.startswith("h3_stampx_"):
            d = json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
            for e in d["stamps"]:
                if "terrain" in e:
                    ter[(pathlib.Path(p).stem[-7:], e["name"])] = unrle(e["terrain"])
    for c in cases:
        t = ter.get((c["src"], c["name"]))
        if t:
            c["cls"] = [None if v == 16 else "K" if v == 15 else "M" if v % 3 == 2 else "L" for v in t]
    tot = collections.Counter()
    for c in cases:
        if c["off"] is None:
            continue
        pred = stamp(c)
        truth = c["part"]
        bad = [i for i in range(c["g"].n) if pred[i] != truth[i]]
        kind = "natural" if c["name"] == "natural" else "controlled"
        tot[kind, "stamps"] += 1
        tot[kind, "exact"] += not bad
        tot[kind, "plots"] += c["g"].n
        tot[kind, "plots_ok"] += c["g"].n - len(bad)
        if bad:
            w = c["g"].w
            print(f"MISS {c['src']} {c['name']}: {len(bad)} plots, e.g. "
                  f"{[(i % w, i // w, pred[i], truth[i], c['cls'][i] if c.get('cls') else '') for i in bad[:6]]}")
    for k in ("controlled", "natural"):
        print(k, {kk[1]: v for kk, v in tot.items() if kk[0] == k})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
