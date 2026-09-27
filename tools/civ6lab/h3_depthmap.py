"""H-3: the distance-to-water (depth) of every land plot of one
StampContinents experiment, printed as a map with the continent letter,
north up, for rows y0..y1.

    python tools/civ6lab/h3_depthmap.py runs/h3_session_<exp>.jsonl rect_tall [y0 y1]
"""
from __future__ import annotations

import sys

import numpy as np

from h3_stampmodel import water_distance
from h3_x import Grid, Session, unrle


def main() -> int:
    s = Session(sys.argv[1])
    w, h = map(int, s.x1("grid")[1].split(","))
    g = Grid(w, h)
    e = next(e for e in s.xs("exp") if e[1] == sys.argv[2])
    land = np.array([v == 0 for v in unrle(e[2])])
    cont = unrle(e[3])
    wd = water_distance(g, land)
    y0, y1 = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (0, h - 1)
    xs = [x for x in range(w) if any(land[y * w + x] for y in range(h))]
    x0, x1 = min(xs), max(xs)
    sym = {}
    for y in range(y1, y0 - 1, -1):
        row = []
        for x in range(x0, x1 + 1):
            i = y * w + x
            if not land[i]:
                row.append(" . ")
            else:
                c = cont[i]
                sym.setdefault(c, "ABCDEFGH"[len(sym)])
                row.append(f"{sym[c]}{wd[i]:<2d}")
        print(f"{y:3d} {'  ' if y % 2 else ''}{''.join(row)}")
    print("x from", x0, sym)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
