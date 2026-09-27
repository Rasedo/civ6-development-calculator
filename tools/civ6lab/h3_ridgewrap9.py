"""H-3: the implied distance of one seed in a ridge-flag field. Where a
point's other near seed is plain (D = d + get(3)), the field fixes this
seed's D; printed as D - get(3) on the hex offset (dhx, dy) from the seed.

    python tools/civ6lab/h3_ridgewrap9.py DUMP NAME SEED [--plain 0,2]
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


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("name")
    p.add_argument("seed", type=int)
    p.add_argument("--plain", default="", help="seed indices taken as plain (default: b0 < 3 and b2 == 0)")
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    fx, fy = 1 << rec["xe"], 1 << rec["ye"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    plain = ({int(v) for v in a.plain.split(",")} if a.plain else
             {i for i, s in enumerate(seeds) if s["b0"] < 3 and s["b2"] == 0})
    si = a.seed
    s = seeds[si]
    print("seed", s, "plain", sorted(plain))
    g = rec["ridged_grid"]
    table = {}
    for x in range(fx):
        for y in range(fy):
            n = [rng.get(3) for _ in seeds]
            base = [hexdist(x, y, t["x"], t["y"]) + k for t, k in zip(seeds, n)]
            h = g[y][x]
            others = [i for i in range(len(seeds)) if i != si]
            if not all(i in plain for i in others):
                continue
            sols = []
            for Dt in range(-10, 150):
                D = sorted([(Dt, si)] + [(base[i], i) for i in others])
                v = 255 * D[0][0] // D[1][0] if D[1][0] > 0 else 0
                if v == h and si in (D[0][1], D[1][1]):
                    sols.append(Dt - n[si])
            if len(sols) == 1:
                dhx = (x - (y >> 1)) - (s["x"] - (s["y"] >> 1))
                table[(dhx, y - s["y"])] = (sols[0], hexdist(x, y, s["x"], s["y"]))
    by = collections.defaultdict(list)
    for (dhx, dy), (D, d) in sorted(table.items()):
        by[dy].append(f"{dhx:+d}:{D}/{d}")
    for dy in sorted(by, reverse=True):
        print(f"dy {dy:+3d}: " + " ".join(by[dy][:24]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
