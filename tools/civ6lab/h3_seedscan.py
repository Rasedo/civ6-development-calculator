"""H-3: for raw BuildRidges dumps, find each field zero's (y, x) draw pair
(y = get(fy) at k, x = get(fx) at k + 1) and print the draws between them.

    python tools/civ6lab/h3_seedscan.py DUMP [--ranges 6,4]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_ridgefit import raws, r  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("--ranges", default="")
    p.add_argument("--all-pairs", action="store_true", help="also list every (y,x) pair position, zero or not")
    a = p.parse_args()
    for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines():
        rec = json.loads(ln)
        if "ridged_grid" not in rec or rec["w"] != 1 << rec["xe"] or rec["h"] != 1 << rec["ye"]:
            continue
        fx, fy = rec["w"], rec["h"]
        n = rec["draws"]["P2->P3"]
        if n > 2000:
            continue
        d = raws(rec, "P2", n + 2)
        g = rec["ridged_grid"]
        zeros = {(x, y) for y in range(fy) for x in range(fx) if g[y][x] == 0}
        ks = [k for k in range(n - 1) if (r(d[k + 1], fx), r(d[k], fy)) in zeros]
        print(f"{rec['name']} {fx}x{fy} draws {n} zeros {len(zeros)} pair-starts {ks}")
        for rg in [int(x) for x in a.ranges.split(",") if x]:
            print(f"   r{rg}", "".join(str(r(v, rg)) if r(v, rg) < 10 else "*" for v in d[:n]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
