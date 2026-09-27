"""H-3: compare two map dumps (h3_mapdump.py) field by field, the tag aside.

    python tools/civ6lab/h3_mapcmp.py runs/h3_map_A.json runs/h3_map_B.json
"""
from __future__ import annotations

import json
import sys


def main() -> int:
    a = json.load(open(sys.argv[1], encoding="utf-8"))
    b = json.load(open(sys.argv[2], encoding="utf-8"))
    same = True
    for k in sorted(set(a) | set(b)):
        if k == "tag":
            continue
        eq = a.get(k) == b.get(k)
        same &= eq
        extra = ""
        if k == "rows" and not eq:
            diff = sum(x != y for ra, rb in zip(a[k], b[k]) for x, y in zip(ra, rb))
            extra = f" ({diff} plots differ)"
        print(f"{k}: {'same' if eq else 'DIFFERENT'}{extra}")
    print("identical" if same else "maps differ")
    return 0 if same else 1


if __name__ == "__main__":
    sys.exit(main())
