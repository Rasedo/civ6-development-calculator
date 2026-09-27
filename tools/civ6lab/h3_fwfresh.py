"""H-3: Map.FindWater(plot, range, true) against the spec's IsFreshWater
(land, not a mountain, and a river plot — land-to-land river edges only — or
next to a lake), with the rivers laid before each call; the misses printed
with the plots in range that make the model say fresh.

    python tools/civ6lab/h3_fwfresh.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import sys

from h3_findwater import river_batches
from h3_x import Session, unrle

MTN = (2, 5, 8, 11, 14)
OTHER = {"W": 1, "NW": 2, "NE": 3}  # the plot across a W / NW / NE edge: E / SE / SW


def river_edges(s, flags, p, water, land_only: bool):
    """the river edges on p's six sides: (flag owner, flag); land-to-land only
    when asked"""
    out = []
    for f in flags.get(p, ()):  # own edges
        o = s.g.adj(p, OTHER[f])
        out.append((p, o))
    for d, f in ((4, "W"), (5, "NW"), (0, "NE")):
        q = s.g.adj(p, d)
        if q is not None and f in flags.get(q, ()):
            out.append((q, p))
    if land_only:
        out = [(a, b) for a, b in out if a is not None and b is not None and water[a] == 0 and water[b] == 0]
    return out


def fresh(s, flags, water, q, land_only=True):
    if water[q] != 0 or s.terrain[q] in MTN:
        return False
    if river_edges(s, flags, q, water, land_only):
        return True
    return any(a is not None and water[a] == 2 for a in s.g.ring1(q))


def main() -> int:
    tot = collections.Counter()
    for path in sys.argv[1:]:
        s = Session(path)
        water = unrle(s.x1("fwstate")[1])
        batches = river_batches(s)
        flags = collections.defaultdict(set)
        k = 0
        for e in s.x:
            tag = e.split("|", 1)[0]
            if tag == "corner":
                for fl, p in batches[k]:
                    flags[p].add(fl)
                k += 1
                continue
            if tag != "fw":
                continue
            _, xy, r, flag, res = e.split("|")
            if flag != "true":
                continue
            px, py = map(int, xy.split(","))
            p = py * s.g.w + px
            rr = int(float(r))
            near = [q for q in range(s.g.n) if s.g.dist(p, q) <= rr]
            for lo in (True, False):
                pred = any(fresh(s, flags, water, q, lo) for q in near)
                tot["land_only" if lo else "any_edge", "calls"] += 1
                tot["land_only" if lo else "any_edge", "ok"] += pred == (res == "true")
                if lo and pred != (res == "true"):
                    why = [(q % s.g.w, q // s.g.w, s.terrain[q], sorted(flags.get(q, ())),
                            river_edges(s, flags, q, water, True)) for q in near if fresh(s, flags, water, q, lo)]
                    print(f"  {path[-24:]} {xy} r{rr} game {res} model {pred}: {why[:4]}")
    print(dict(tot))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
