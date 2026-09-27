"""H-3: fit the ridge-wrap per-(plot, seed) draw: h = 255 * D1 // D2 over
D = d * K + get(R) + C, d the plain hex distance, the draws in one of four
loop orders (seed innermost or outermost; x or y outer).

    python tools/civ6lab/h3_ridgewrapfit.py DUMP NAME [--pts 400]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_cvfractal import Rng  # noqa: E402
from h3_fractal import state_after  # noqa: E402
from h3_ridgemodel import hexdist, place  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("name")
    p.add_argument("--pts", type=int, default=400)
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    fx, fy = rec["w"], rec["h"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    g = rec["ridged_grid"]
    ns = len(seeds)
    npts = fx * fy
    raws = []
    for _ in range(npts * ns):
        rng.get(1)
        raws.append(rng.s >> 16)

    def idx(order, x, y, i):
        pxy = x * fy + y
        pyx = y * fx + x
        return {"xy_s": pxy * ns + i, "yx_s": pyx * ns + i, "s_xy": i * npts + pxy, "s_yx": i * npts + pyx}[order]

    pts = [(x, y) for x in range(fx) for y in range(fy)][:a.pts]
    best = []
    for order in ("xy_s", "yx_s", "s_xy", "s_yx"):
        for K in (1, 2, 3, 4):
            for R in range(1, 4 * K + 3):
                for C in (-2, -1, 0, 1, 2):
                    hit = 0
                    for (x, y) in pts:
                        D = sorted(hexdist(x, y, s["x"], s["y"]) * K + ((raws[idx(order, x, y, i)] * R) >> 16) + C
                                   for i, s in enumerate(seeds))
                        hit += (255 * D[0] // D[1] if D[1] > 0 else 0) == g[y][x]
                    best.append((hit, order, K, R, C))
    best.sort(reverse=True)
    for b in best[:12]:
        print(b)
    return 0


if __name__ == "__main__":
    sys.exit(main())
