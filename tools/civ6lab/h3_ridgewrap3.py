"""H-3: ridge-wrap per-seed noise ranges. D_i = d_i + get(R_i) (plain or
wrapped hex distance), R_i searched per seed; prints the seeds' parameters
and the best range tuples.

    python tools/civ6lab/h3_ridgewrap3.py DUMP NAME [--pts 300] [--maxr 10]
"""
from __future__ import annotations

import argparse
import itertools
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
    p.add_argument("--pts", type=int, default=300)
    p.add_argument("--maxr", type=int, default=10)
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    fx, fy = rec["w"], rec["h"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    for s in seeds:
        print({k: (v >> 8 if k in ("c0", "b1", "c2") and v is not None else v) for k, v in s.items()})
    g = rec["ridged_grid"]
    pts = [(x, y) for x in range(fx) for y in range(fy)][:a.pts]
    raws = []
    for _ in range(len(pts) * len(seeds)):
        rng.get(1)
        raws.append(rng.s >> 16)
    ns = len(seeds)
    for dist in ("plain", "wrap"):
        dd = []
        for (x, y) in pts:
            if dist == "plain":
                dd.append([hexdist(x, y, s["x"], s["y"]) for s in seeds])
            else:
                dd.append([min(hexdist(x, y, s["x"] + k * fx, s["y"]) for k in (-1, 0, 1)) for s in seeds])
        best = []
        for Rs in itertools.product(range(0, a.maxr + 1), repeat=ns):
            hit = 0
            for pi, (x, y) in enumerate(pts):
                D = sorted(dd[pi][i] + ((raws[pi * ns + i] * Rs[i]) >> 16) for i in range(ns))
                hit += (255 * D[0] // D[1] if D[1] else 0) == g[y][x]
            best.append((hit, Rs))
        best.sort(reverse=True)
        print(dist, best[:6])
    return 0


if __name__ == "__main__":
    sys.exit(main())
