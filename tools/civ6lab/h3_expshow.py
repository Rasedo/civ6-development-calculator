"""H-3: show the StampContinents experiments (civ6lab_mapprobe_exp.lua): per
shape the continents (in order of the 43-draw shuffle, fy_forward), their
plot counts and bounding boxes, and with --map NAME the character map
(north up, odd rows indented).

    python tools/civ6lab/h3_expshow.py runs/h3_session_<stamp>.jsonl [--map rect_center]
"""
from __future__ import annotations

import collections
import sys

from h3_x import Session, unrle


def main() -> int:
    s = Session(sys.argv[1])
    w, h = map(int, s.x1("grid")[1].split(","))
    want = sys.argv[sys.argv.index("--map") + 1] if "--map" in sys.argv else None
    for e in s.xs("exp"):
        name, land, cont = e[1], unrle(e[2]), unrle(e[3])
        cnt = collections.Counter(c for c in cont if c != -1)
        box = {}
        for i, c in enumerate(cont):
            if c == -1:
                continue
            x, y = i % w, i // w
            b = box.setdefault(c, [x, y, x, y])
            b[0], b[1], b[2], b[3] = min(b[0], x), min(b[1], y), max(b[2], x), max(b[3], y)
        print(f"{name:24s} land {land.count(0):5d}  " + "  ".join(f"{c}:{cnt[c]} box{box[c]}" for c in sorted(cnt)) + (f"  {e[4]}" if len(e) > 4 else ""))
        if name == want:
            sym = {}
            for y in range(h - 1, -1, -1):
                row = []
                for x in range(w):
                    c = cont[y * w + x]
                    if c == -1:
                        row.append("." if land[y * w + x] else "?")
                    else:
                        sym.setdefault(c, "ABCDEFGH"[len(sym)])
                        row.append(sym[c])
                print(f"{y:3d} " + (" " if y % 2 else "") + " ".join(row))
            print(sym)
    for e in s.xs("phaseA") + s.xs("real") + s.xs("phaseB"):
        print("|".join(e))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
