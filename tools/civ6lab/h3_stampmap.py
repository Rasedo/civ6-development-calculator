"""H-3: StampContinents' map: for the areas at the stamp (the last
AreaBuilder.Recalculate before it) the continent types each one received,
and a character map of the continents.

    python tools/civ6lab/h3_stampmap.py runs/h3_session_<stamp>.jsonl [--map]
"""
from __future__ import annotations

import collections
import sys

from h3_x import Session, unrle


def main() -> int:
    s = Session(sys.argv[1])
    before = unrle(s.x1("stamp", "before")[2])
    after = unrle(s.x1("stamp", "after")[2])
    # the Recalculate records up to the stamp: the stamp follows the areas
    # record written just before it in X order
    last = None
    for e in s.x:
        if e.startswith("areas|"):
            last = e
        if e.startswith("stamp|before"):
            break
    parts = last.split("|")
    area = unrle(parts[2])
    sizes = {int(a.split(":")[0]): (int(a.split(":")[1]), a.split(":")[2]) for a in parts[3].split(",")}
    by = collections.defaultdict(collections.Counter)
    for i in range(s.g.n):
        by[area[i]][after[i]] += 1
    print("areas at the stamp (id: plots water) -> continent types")
    for a in sorted(by, key=lambda a: -sizes[a][0]):
        print(f"  {a:9d} {sizes[a][0]:5d} {sizes[a][1]:5s} -> {dict(by[a])}")
    print("water classes (0 land / 1 water / 2 lake) -> continent:",
          {k: dict(v) for k, v in _cross(before, after).items()})
    if "--map" in sys.argv:
        sym = {}
        for y in range(s.g.h - 1, -1, -1):
            row = []
            for x in range(s.g.w):
                i = y * s.g.w + x
                c = after[i]
                if c == -1:
                    row.append("." if before[i] == 1 else "~")
                else:
                    sym.setdefault(c, "ABCDEFGHIJKLMNOP"[len(sym)])
                    row.append(sym[c])
            print(("  " if y % 2 else "") + " ".join(row))
        print(sym)
    return 0


def _cross(a, b):
    out = collections.defaultdict(collections.Counter)
    for x, y in zip(a, b):
        out[x][y] += 1
    return out


if __name__ == "__main__":
    raise SystemExit(main())
