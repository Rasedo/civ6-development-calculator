"""H-3: ridge-flag fields under D = d + get(R) (plain hex distance, one draw
per (point, seed), x outer, y inner, seeds innermost); hit rates overall and
over points whose two nearest seeds are "plain" (b0 < 3 and b2 == 0).

    python tools/civ6lab/h3_ridgewrap7.py DUMP [--R 3]
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
    p.add_argument("--R", type=int, default=3)
    a = p.parse_args()
    for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines():
        rec = json.loads(ln)
        if rec["br"] != 1 or rec["bf"] != 0:
            continue
        fx, fy = 1 << rec["xe"], 1 << rec["ye"]
        rng = Rng(state_after(rec["pins"]["P2"]))
        seeds = place(rng, rec["plates"], fx, fy)
        plain = [s["b0"] < 3 and s["b2"] == 0 for s in seeds]
        g = rec["ridged_grid"]
        hit = tot = phit = ptot = 0
        for x in range(fx):
            for y in range(fy):
                D = [(hexdist(x, y, s["x"], s["y"]) + rng.get(a.R), i) for i, s in enumerate(seeds)]
                D.sort()
                v = 255 * D[0][0] // D[1][0] if D[1][0] else 0
                tot += 1
                hit += v == g[y][x]
                if plain[D[0][1]] and plain[D[1][1]]:
                    ptot += 1
                    phit += v == g[y][x]
        print(f"{rec['name']}: hits {hit}/{tot}; two nearest plain {phit}/{ptot}  plain seeds {plain}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
