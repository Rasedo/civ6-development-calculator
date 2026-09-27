"""H-3: the shapes SetFeatureType lays for a multi-plot natural wonder with no
CustomPlacement (nwexp records of civ6lab_mapprobe_exp.lua, plus the nw
records of natives sessions): per wonder, each placement's anchor, the six
neighbours' single-plot validity (NE E SE SW W NW) and the carried plots as
offsets (a direction name, or a two-step path) from the anchor, and the
terrain change.

    python tools/civ6lab/h3_nwshape.py runs/h3_session_<exp>.jsonl
"""
from __future__ import annotations

import collections
import sys

from h3_x import DIRS, Grid, Session


def offset(g: Grid, a: int, b: int) -> str:
    if a == b:
        return "@"
    for d in range(6):
        if g.adj(a, d) == b:
            return DIRS[d]
    for d in range(6):
        m = g.adj(a, d)
        if m is None:
            continue
        for d2 in range(6):
            if g.adj(m, d2) == b:
                return DIRS[d] + "+" + DIRS[d2]
    return "far"


def main() -> int:
    s = Session(sys.argv[1])
    grid = s.x1("grid")
    w, h = map(int, grid[1].split(",")) if grid else s.dump["grid"]
    g = Grid(w, h)
    names = {}
    for path in sys.argv[2:]:
        names = {int(i): r.get("FeatureType") for i, r in Session(path).db["F"].items()}
    by = collections.defaultdict(list)
    for e in s.xs("nwexp"):
        f = int(e[1])
        ax, ay = map(int, e[2].split(","))
        a = ay * w + ax
        carried = []
        tchg = []
        for part in e[4].split(","):
            if not part:
                continue
            q, tb, ta, fb = part.split(":")
            q = int(q)
            carried.append(offset(g, a, q))
            if tb != ta:
                tchg.append(f"{offset(g, a, q)}:{tb}>{ta}")
        by[f].append((e[2], e[3], sorted(carried, key=lambda o: ("@" != o, o)), tchg))
    for f in sorted(by):
        print(f"feature {f} {names.get(f, '')}")
        pats = collections.Counter(tuple(c) for _, _, c, _ in by[f])
        for anchor, valid, carried, tchg in by[f]:
            print(f"   anchor {anchor:7s} valid NE,E,SE,SW,W,NW={valid}  carried {carried}  {' '.join(tchg)}")
        print("   shapes:", dict(pats))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
