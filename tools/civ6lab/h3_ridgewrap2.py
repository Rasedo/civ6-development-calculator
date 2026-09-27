"""H-3: ridge-wrap residuals. With D = d + get(3) per seed (plain hex
distance), take the nearest D1 as given and list which integer D2 values the
field allows, against the second-nearest D and every seed's D.

    python tools/civ6lab/h3_ridgewrap2.py DUMP NAME [--R 3]
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
    p.add_argument("--R", type=int, default=3)
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    fx, fy = rec["w"], rec["h"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    g = rec["ridged_grid"]
    diffs = collections.Counter()
    for x in range(fx):
        for y in range(fy):
            n = [rng.get(a.R) for _ in seeds]
            D = sorted(hexdist(x, y, s["x"], s["y"]) + k for s, k in zip(seeds, n))
            h = g[y][x]
            ok = [d2 for d2 in range(1, 200) if 255 * D[0] // d2 == h]
            diffs[tuple(sorted({d2 - D[1] for d2 in ok}))[:3] if ok else ("none",)] += 1
    for k, v in diffs.most_common(20):
        print(v, k)
    return 0


if __name__ == "__main__":
    sys.exit(main())
