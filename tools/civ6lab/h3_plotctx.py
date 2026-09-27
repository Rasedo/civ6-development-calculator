"""H-3: a plot's context on a session's finished map: terrain, feature,
resource, water/lake/coastal/river facts, cliff and river flags, and the six
neighbours (NE, E, SE, SW, W, NW) the same way; with --ring 2 the second
ring's terrain/feature too.

    python tools/civ6lab/h3_plotctx.py runs/h3_session_<stamp>.jsonl x,y [x,y ...] [--ring 2]
"""
from __future__ import annotations

import sys

from h3_chf import Plots
from h3_x import DIRS, Session


def desc(s, P, i):
    if i is None:
        return "-"
    return (f"{s.g.xy(i)} t{s.terrain[i]} f{s.feature[i]} r{s.resource[i]}"
            f"{' W' if P.water[i] else ''}{' L' if P.lake[i] else ''}{' C' if P.coastal[i] else ''}"
            f"{' R' if P.river[i] else ''}{' fl' + str(s.flags[i]) if s.flags[i] else ''} dl{P.dland[i]}")


def main() -> int:
    s = Session(sys.argv[1])
    P = Plots(s)
    ring2 = "--ring" in sys.argv
    for a in sys.argv[2:]:
        if "," not in a:
            continue
        x, y = map(int, a.split(","))
        i = y * s.g.w + x
        print(desc(s, P, i))
        for d in range(6):
            print(f"   {DIRS[d]:2s} {desc(s, P, s.g.adj(i, d))}")
        if ring2:
            r2 = sorted({q for q in range(s.g.n) if s.g.dist(i, q) == 2})
            print("   ring2:", " | ".join(f"{s.g.xy(q)} t{s.terrain[q]} f{s.feature[q]}" for q in r2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
