"""H-3: explore BuildRidges with ridge FRAC_WRAP_X on a raw case (br=1,
bf=0): one draw per (plot, seed) after placement, x outer, y inner, seeds
innermost. Prints each point's plain and wrapped hex distances per seed,
the draws (get(3) and raw >> 8), the field value and the d + get(3) guess.

    python tools/civ6lab/h3_ridgewrap.py DUMP NAME [--n 40] [--miss]
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
    p.add_argument("--n", type=int, default=40)
    p.add_argument("--miss", action="store_true")
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    fx, fy = rec["w"], rec["h"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    print("seeds", [(s["x"], s["y"]) for s in seeds], "placement draws", rng.n)
    g = rec["ridged_grid"]
    shown = 0
    for x in range(fx):
        for y in range(fy):
            raws = []
            for _ in seeds:
                rng.get(1)
                raws.append(rng.s >> 16)
            dp = [hexdist(x, y, s["x"], s["y"]) for s in seeds]
            dw = [min(hexdist(x, y, s["x"] + k * fx, s["y"]) for k in (-1, 0, 1)) for s in seeds]
            n3 = [(v * 3) >> 16 for v in raws]
            D = sorted(d + n for d, n in zip(dp, n3))
            guess = 255 * D[0] // D[1] if D[1] else 0
            if a.miss and guess == g[y][x]:
                continue
            print(f"({x:2d},{y:2d}) h={g[y][x]:3d} guess {guess:3d} plain {dp} wrap {dw} g3 {n3} raw8 {[v >> 8 for v in raws]}")
            shown += 1
            if shown >= a.n:
                return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
