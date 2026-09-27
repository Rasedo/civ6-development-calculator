"""H-3: compare a raw ridge field (br=1, bf=0) with 255*d1/d2 over the seeds
found at the field's zeros, per hex convention; print the residual map.

    python tools/civ6lab/h3_ridgefield.py runs/h3_ridges_<...>.jsonl NAME
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_ridgefit import hexdist  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("name")
    p.add_argument("--seeds", default="", help="x,y;x,y;... (default: the zeros)")
    a = p.parse_args()
    rec = next(json.loads(ln) for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == a.name)
    g = rec["ridged_grid"]
    fx, fy = rec["w"], rec["h"]
    if a.seeds:
        seeds = [tuple(int(v) for v in s.split(",")) for s in a.seeds.split(";")]
    else:
        seeds = [(x, y) for y in range(fy) for x in range(fx) if g[y][x] == 0]
    for conv in ("odd_right", "odd_left"):
        miss = 0
        res = [[0] * fx for _ in range(fy)]
        for y in range(fy):
            for x in range(fx):
                ds = sorted(hexdist(x, y, sx, sy, conv) for sx, sy in seeds)
                v = 255 * ds[0] // ds[1] if ds[1] else 0
                res[y][x] = g[y][x] - v
                miss += v != g[y][x]
        print(conv, "misses", miss, "of", fx * fy)
        for y in range(fy - 1, -1, -1):
            print(f"{y:3d} " + "".join("." if v == 0 else ("+" if v > 0 else "-") for v in res[y]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
