"""H-3: ridge-flag BuildRidges: placement draw counts (total minus one draw
per (array point, seed)) against the placement model, and per seed the
offset the field needs over d + get(3) where that seed is one of the two
nearest and the other is fitted exactly.

    python tools/civ6lab/h3_ridgewrap6.py DUMP [--seed-detail NAME]
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
    a = p.parse_args()
    for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines():
        rec = json.loads(ln)
        fx, fy = 1 << rec["xe"], 1 << rec["ye"]
        rng = Rng(state_after(rec["pins"]["P2"]))
        seeds = place(rng, rec["plates"], fx, fy)
        game = rec["draws"]["P2->P3"] - fx * fy * len(seeds)
        print(f"{rec['name']}: seeds {len(seeds)} placement model {rng.n} game {game} "
              f"{'OK' if rng.n == game else 'MISS'} seeds {[(s['x'], s['y'], s['b0'], s['b2']) for s in seeds]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
