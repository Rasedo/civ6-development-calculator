"""H-3: ridge-wrap misfits of D = d + get(3): per point, the offsets
(o1, o2) on the two nearest plain distances that reproduce the field, beside
get(3) and the raw draw of every seed.

    python tools/civ6lab/h3_ridgewrap5.py DUMP NAME [--n 40]
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
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    fx, fy = rec["w"], rec["h"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    g = rec["ridged_grid"]
    shown = 0
    for x in range(fx):
        for y in range(fy):
            raws = []
            for _ in seeds:
                rng.get(1)
                raws.append(rng.s >> 16)
            d = [hexdist(x, y, s["x"], s["y"]) for s in seeds]
            n3 = [(v * 3) >> 16 for v in raws]
            D = sorted(di + ni for di, ni in zip(d, n3))
            if 255 * D[0] // D[1] == g[y][x]:
                continue
            order = sorted(range(len(seeds)), key=lambda i: d[i])
            i1, i2 = order[0], order[1]
            sols = [(o1, o2) for o1 in range(-3, 8) for o2 in range(-3, 8)
                    if d[i2] + o2 > 0 and 255 * (d[i1] + o1) // (d[i2] + o2) == g[y][x]]
            print(f"({x},{y}) h {g[y][x]} d {d} g3 {n3} raw16/4096 {[v >> 12 for v in raws]} "
                  f"near {i1},{i2} sols {sols[:8]}")
            shown += 1
            if shown >= a.n:
                return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
