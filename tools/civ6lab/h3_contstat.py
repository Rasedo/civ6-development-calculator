"""H-3: continent statistics of map dumps (h3_mapdump.py): per continent
type the plot count, how many are water, and the bounding box.

    python tools/civ6lab/h3_contstat.py runs/h3_map_A.json [runs/h3_map_B.json ...]
"""
from __future__ import annotations

import collections
import json
import sys

WATER = {15, 16}  # TERRAIN_COAST, TERRAIN_OCEAN (Terrains row order)


def main() -> int:
    for path in sys.argv[1:]:
        rec = json.load(open(path, encoding="utf-8"))
        w, h = rec["grid"]
        cnt = collections.Counter()
        wat = collections.Counter()
        box = {}
        for y, row in enumerate(rec["rows"]):
            for x, p in enumerate(row):
                f = p.split(".")
                t, c = int(f[0]), int(f[5])
                cnt[c] += 1
                if t in WATER:
                    wat[c] += 1
                b = box.setdefault(c, [x, y, x, y])
                b[0], b[1], b[2], b[3] = min(b[0], x), min(b[1], y), max(b[2], x), max(b[3], y)
        print(path.split("\\")[-1].split("/")[-1], rec["grid"], "seeds", rec.get("map_seed"), rec.get("game_seed"))
        for c in sorted(cnt):
            print(f"   continent {c:3d}: {cnt[c]:5d} plots, {wat[c]:4d} water, box {box[c]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
