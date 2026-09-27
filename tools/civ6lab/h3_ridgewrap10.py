"""H-3: ridge-flag bias residuals. Every seed's D = d + get(3) + w - 1 with
w = get(7) - 2 of the second weakness draw (c0) when b0 >= 3, else 1. For a
target seed with b2 == 1, where the other near seed has b2 == 0, the field
fixes the target's D; printed as the residual D - (d + get(3) + w - 1) on
the hex offset (dhx, dy) from the seed.

    python tools/civ6lab/h3_ridgewrap10.py DUMP NAME SEED
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_cvfractal import Rng  # noqa: E402
from h3_fractal import state_after  # noqa: E402
from h3_ridgemodel import hexdist, place  # noqa: E402


def weakness(s: dict) -> int:
    return ((s["c0"] * 7) >> 16) - 2 if s["b0"] >= 3 else 1


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("name")
    p.add_argument("seed", type=int)
    p.add_argument("--wrap", action="store_true", help="distance: min over the seed and its copies at x +- fx")
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    fx, fy = 1 << rec["xe"], 1 << rec["ye"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    si = a.seed
    s = seeds[si]
    for i, t in enumerate(seeds):
        print(i, {k: v for k, v in t.items()}, "w", weakness(t),
              "b1/6", (t["b1"] * 6) >> 16, "c2/raw16", t["c2"])
    g = rec["ridged_grid"]

    def dist(x, y, t):
        if a.wrap:
            return min(hexdist(x, y, t["x"] + k * fx, t["y"]) for k in (-1, 0, 1))
        return hexdist(x, y, t["x"], t["y"])

    by = collections.defaultdict(dict)
    for x in range(fx):
        for y in range(fy):
            n = [rng.get(3) for _ in seeds]
            base = [dist(x, y, t) + k + weakness(t) - 1 for t, k in zip(seeds, n)]
            others = [i for i in range(len(seeds)) if i != si]
            if any(seeds[i]["b2"] == 1 for i in others):
                continue
            sols = []
            for Dt in range(-30, 150):
                D = sorted([(Dt, si)] + [(base[i], i) for i in others])
                v = 255 * D[0][0] // D[1][0] if D[1][0] > 0 else 0
                if v == g[y][x] and si in (D[0][1], D[1][1]):
                    sols.append(Dt - base[si])
            if len(sols) == 1:
                dhx = (x - (y >> 1)) - (s["x"] - (s["y"] >> 1))
                by[y - s["y"]][dhx] = sols[0]
    for dy in sorted(by, reverse=True):
        row = by[dy]
        print(f"dy {dy:+3d}: " + " ".join(f"{k:+d}:{row[k]:+d}" for k in sorted(row)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
