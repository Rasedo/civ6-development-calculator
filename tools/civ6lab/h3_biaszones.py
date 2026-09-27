"""H-3: the directional bias of ridge-flag seeds (b2 == 1). Everything else
is the measured flagged law (h3_ridgemodel.ridge_height_flagged): D =
max(1, d + get(3) + weakness). Where a point's other near seed is unbiased,
the field fixes the biased seed's residual D - base; printed as a grid around
the seed (array offsets dx, dy) per seed, with the seed's b1 and c2 draws.

    python tools/civ6lab/h3_biaszones.py DUMP [--grid]
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
from h3_ridgemodel import hexdist, place, weakness  # noqa: E402


def residuals(rec: dict, si: int):
    fx, fy = 1 << rec["xe"], 1 << rec["ye"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    g = rec["ridged_grid"]
    others = [i for i in range(len(seeds)) if i != si]
    ok = not any(seeds[i]["b2"] == 1 for i in others)
    out = {}
    for x in range(fx):
        for y in range(fy):
            n = [rng.get(3) for _ in seeds]
            if not ok:
                continue
            base = [max(1, hexdist(x, y, t["x"], t["y"]) + k + weakness(t)) for t, k in zip(seeds, n)]
            sols = []
            for Dt in range(1, 150):
                D = sorted([(Dt, si)] + [(base[i], i) for i in others])
                v = 255 * D[0][0] // D[1][0]
                if v == g[y][x] and si in (D[0][1], D[1][1]):
                    sols.append(Dt - base[si])
            if len(sols) == 1 and abs(sols[0]) <= 4:
                out[(x, y)] = sols[0]
    return seeds, out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("--grid", action="store_true")
    a = p.parse_args()
    for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines():
        rec = json.loads(ln)
        if rec["br"] != 1 or rec["bf"] != 0 or not rec["rflags"]:
            continue
        fx, fy = 1 << rec["xe"], 1 << rec["ye"]
        seeds = place(Rng(state_after(rec["pins"]["P2"])), rec["plates"], fx, fy)
        for si, s in enumerate(seeds):
            if s["b2"] != 1:
                continue
            _, cells = residuals(rec, si)
            if len(cells) < 40:
                continue
            vals = sorted(set(cells.values()))
            print(f"{rec['name']} seed {si} ({s['x']},{s['y']}) w {weakness(s)} b1 {s['b1']} b1/6 {(s['b1'] * 6) >> 16} "
                  f"c2 {s['c2']} c2/4 {(s['c2'] * 4) >> 16} cells {len(cells)} residuals {vals}")
            if a.grid:
                for y in range(fy - 1, -1, -1):
                    row = ""
                    for x in range(fx):
                        if (x, y) == (s["x"], s["y"]):
                            row += "@"
                        elif (x, y) in cells:
                            r = cells[(x, y)]
                            row += "." if r == 0 else (str(r) if r > 0 else chr(ord("a") - 1 - r))
                        else:
                            row += " "
                    print(f"   {y:2d} {row}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
