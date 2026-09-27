"""H-3: fit BuildRidges (Civ 5's CvFractal::ridgeBuilder) to pinned dumps.

    python tools/civ6lab/h3_ridgefit.py runs/h3_ridges_<...>.jsonl [--name X]

Each record carries the pins around Fractal.Create and BuildRidges, the grid
before (`grid`) and after (`ridged_grid`); on a raw case (w = 2^xe,
h = 2^ye) the grids are the array itself.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_fractal import state_after  # noqa: E402
from h3_fit import step  # noqa: E402


def raws(rec: dict, pin: str, n: int) -> list[int]:
    s = state_after(rec["pins"][pin])
    out = []
    for _ in range(n):
        s = step(s)
        out.append(s >> 16)
    return out


def r(raw: int, n: int) -> int:
    return (raw * (n & 0xFFFF)) >> 16


def hexdist(x1, y1, x2, y2, conv):
    if conv == "odd_right":  # odd rows shifted right: hex x = x - (y >> 1)
        hx1, hx2 = x1 - (y1 >> 1), x2 - (y2 >> 1)
    else:  # odd rows shifted left
        hx1, hx2 = x1 - ((y1 + 1) >> 1), x2 - ((y2 + 1) >> 1)
    dx, dy = hx2 - hx1, y2 - y1
    if (dx >= 0) == (dy >= 0):
        return abs(dx) + abs(dy)
    return max(abs(dx), abs(dy))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("--name", default="")
    p.add_argument("--conv", default="odd_right")
    a = p.parse_args()
    for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines():
        rec = json.loads(ln)
        if a.name and rec["name"] != a.name:
            continue
        if "ridged_grid" not in rec or rec["w"] != 1 << rec["xe"]:
            continue
        fx, fy = rec["w"], rec["h"]
        nd = rec["draws"]["P2->P3"]
        d = raws(rec, "P2", nd)
        g = rec["ridged_grid"]
        zeros = [(x, y) for y in range(fy) for x in range(fx) if g[y][x] == 0]
        print(rec["name"], "draws", nd, "zeros", zeros)
        # which draw index and range reproduce each zero's x and y
        for (zx, zy) in zeros:
            ix = [i for i in range(nd) if r(d[i], fx) == zx]
            iy = [i for i in range(nd) if r(d[i], fy) == zy]
            print("   zero", (zx, zy), "x at", ix, "y at", iy)
    return 0


if __name__ == "__main__":
    sys.exit(main())
