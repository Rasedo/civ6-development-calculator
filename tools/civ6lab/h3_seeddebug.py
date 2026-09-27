"""H-3: print a raw BuildRidges case's draws as (index, get(fy), get(fx),
get(7), get(2), raw >> 8) with the field's zeros.

    python tools/civ6lab/h3_seeddebug.py DUMP NAME
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_ridgefit import raws, r  # noqa: E402


def main() -> int:
    dump, name = sys.argv[1], sys.argv[2]
    rec = next(json.loads(ln) for ln in pathlib.Path(dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == name)
    fx, fy = rec["w"], rec["h"]
    n = rec["draws"]["P2->P3"]
    d = raws(rec, "P2", n)
    g = rec["ridged_grid"]
    print("zeros", [(x, y) for y in range(fy) for x in range(fx) if g[y][x] == 0], "draws", n)
    for i, v in enumerate(d):
        print(f"{i:3d} y{r(v, fy):3d} x{r(v, fx):3d} r7 {r(v, 7)} r2 {r(v, 2)} r6 {r(v, 6)} raw8 {v >> 8}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
