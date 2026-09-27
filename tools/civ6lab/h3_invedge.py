"""H-3: does FRAC_INVERT_HEIGHTS cover the array's far edge (x = fx or
y = fy)? Scores the invert dumps (h3_ridges.py --set invert) with the far
edge left alone (the model) and with it inverted too.

    python tools/civ6lab/h3_invedge.py runs/h3_ridges_invert_<stamp>.jsonl
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_cvfractal import Fractal, Rng  # noqa: E402


def main() -> int:
    for ln in pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
        rec = json.loads(ln)
        flags = set(rec["flags"])
        if "FRAC_INVERT_HEIGHTS" not in flags:
            continue
        f = Fractal(rec["w"], rec["h"], rec["grain"], Rng(rec["state_before"]), flags, rec["xe"], rec["ye"])
        g = rec["grid"]

        def hits():
            return sum(f.height(x, y) == g[y][x] for y in range(rec["h"]) for x in range(rec["w"]))

        h_model = hits()
        edge = [(f.fx, y) for y in range(f.fy + 1)] + [(x, f.fy) for x in range(f.fx)]
        reads = sum(1 for y in range(rec["h"]) for x in range(rec["w"])
                    if (f.xinc * x) // 1000 >= f.fx - 1 and (f.xinc * x) % 1000
                    or (f.yinc * y) // 1000 >= f.fy - 1 and (f.yinc * y) % 1000)
        for (x, y) in edge:
            f.a[x][y] = 255 - f.a[x][y]
        h_full = hits()
        print(f"{rec['name']}: plots {rec['w'] * rec['h']} reading the far edge {reads}; "
              f"edge kept {h_model} hits, edge inverted {h_full} hits")
    return 0


if __name__ == "__main__":
    sys.exit(main())
