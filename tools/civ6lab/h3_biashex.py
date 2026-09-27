"""H-3: the ridge-bias residual cells of one biased seed drawn on hex
coordinates relative to the seed (column dhx = (x - (y >> 1)) - (sx - (sy >> 1)),
row dy), '+' for +strength, '-' for -strength, '.' for 0, '?' other.

    python tools/civ6lab/h3_biashex.py DUMP NAME
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_biaszones import residuals  # noqa: E402
from h3_cvfractal import Rng  # noqa: E402
from h3_fractal import state_after  # noqa: E402
from h3_ridgemodel import place  # noqa: E402


def main() -> int:
    dump, name = sys.argv[1], sys.argv[2]
    rec = next(r for r in (json.loads(ln) for ln in pathlib.Path(dump).read_text(encoding="utf-8").splitlines())
               if r["name"] == name)
    fx, fy = 1 << rec["xe"], 1 << rec["ye"]
    seeds = place(Rng(state_after(rec["pins"]["P2"])), rec["plates"], fx, fy)
    for si, s in enumerate(seeds):
        if s["b2"] != 1:
            continue
        _, cells = residuals(rec, si)
        st = ((s["c2"] * 8) >> 16) - 4
        dr = (s["b1"] * 6) >> 16
        print(f"seed {si} ({s['x']},{s['y']}) strength {st} dir {dr} cells {len(cells)}")
        if not cells:
            continue
        pts = {}
        for (x, y), r in cells.items():
            h = (x - (y >> 1)) - (s["x"] - (s["y"] >> 1))
            pts[(h, y - s["y"])] = "+" if r == st and st else "-" if r == -st and st else "." if r == 0 else "?"
        hs = [p[0] for p in pts]
        lo, hi = min(hs), max(hs)
        for dy in range(max(p[1] for p in pts), min(p[1] for p in pts) - 1, -1):
            row = "".join("@" if (h, dy) == (0, 0) else pts.get((h, dy), " ") for h in range(lo, hi + 1))
            print(f"{dy:4d} {row}")
        print("     " + "".join("|" if h == 0 else " " for h in range(lo, hi + 1)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
