"""H-3: a raw BuildRidges case's model seeds (h3_ridgemodel.place) beside
the field's zeros.

    python tools/civ6lab/h3_ridgecmp.py DUMP NAME [--mind 7] [--noxmod]
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
from h3_ridgemodel import place  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("name")
    p.add_argument("--mind", type=int, default=7)
    p.add_argument("--noxmod", action="store_true")
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    fx, fy = rec["w"], rec["h"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds, tries = place(rng, rec["plates"], fx, fy, a.mind, "hex", xmod=not a.noxmod)
    g = rec["ridged_grid"]
    zeros = sorted((x, y) for y in range(fy) for x in range(fx) if g[y][x] == 0)
    print("zeros", zeros)
    print("model", sorted((s["x"], s["y"]) for s in seeds), "draws", rng.n, "game", rec["draws"]["P2->P3"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
