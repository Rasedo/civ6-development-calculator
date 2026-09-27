"""H-3: a ridge-wrap raw field beside the plain model field over the same
seeds, row by row.

    python tools/civ6lab/h3_ridgewrap4.py DUMP NAME [--rows 0,1,2]
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
from h3_ridgemodel import place, ridge_height  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("name")
    p.add_argument("--rows", default="0,1,2,10,20")
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    fx, fy = rec["w"], rec["h"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    print("seeds", [(s["x"], s["y"]) for s in seeds])
    g = rec["ridged_grid"]
    for y in [int(v) for v in a.rows.split(",")]:
        print(f"row {y} game ", " ".join(f"{g[y][x]:3d}" for x in range(fx)))
        print(f"row {y} plain", " ".join(f"{ridge_height(seeds, x, y):3d}" for x in range(fx)))
        sh = [dict(s, x=s["x"] + fx) for s in seeds] + [dict(s, x=s["x"] - fx) for s in seeds] + seeds
        print(f"row {y} wrap3", " ".join(f"{ridge_height(sh, x, y):3d}" for x in range(fx)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
