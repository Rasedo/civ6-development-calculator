"""H-3: a raw flagged BuildRidges case's miss map under h3_ridgemodel's
flagged law (+ game above the model, - below), with each biased seed's
residual sector marks.

    python tools/civ6lab/h3_ridgemiss.py DUMP NAME
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
from h3_ridgemodel import place, ridge_height_flagged, weakness  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("name")
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    fx, fy = 1 << rec["xe"], 1 << rec["ye"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    for s in seeds:
        print("seed", (s["x"], s["y"]), "w", weakness(s), "b2", s["b2"],
              "dir", (s["b1"] * 6) >> 16, "strength", ((s["c2"] * 8) >> 16) - 4 if s["b2"] else None)
    g = rec["ridged_grid"]
    grid = [["."] * fx for _ in range(fy)]
    miss = 0
    for x in range(fx):
        for y in range(fy):
            h = ridge_height_flagged(seeds, x, y, rng)
            if h != g[y][x]:
                miss += 1
                grid[y][x] = "+" if g[y][x] > h else "-"
    for s in seeds:
        grid[s["y"]][s["x"]] = "@"
    print("misses", miss)
    for y in range(fy - 1, -1, -1):
        print(f"{y:2d} " + "".join(grid[y]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
