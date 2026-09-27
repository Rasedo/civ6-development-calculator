"""H-3: a biased seed's residual classes by angle: each cell of a
h3_ridgewrap10 table at its angle around the seed (array coords and
cartesian hex coords), sorted, with the class runs printed.

    python tools/civ6lab/h3_biasangles.py runs/h3_wrap10_<...>.txt SX SY [--cart]
"""
from __future__ import annotations

import math
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_ridgemodel import hexdist  # noqa: E402


def main() -> int:
    path, sx, sy = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    cart = "--cart" in sys.argv
    cells = []
    for ln in pathlib.Path(path).read_text(encoding="utf-8-sig").splitlines():
        m = re.match(r"dy\s+([+-]\d+): (.*)", ln)
        if not m:
            continue
        dy = int(m.group(1))
        for c in m.group(2).split():
            dhx, r = (int(v) for v in c.split(":"))
            if abs(r) > 1:
                continue
            y = sy + dy
            x = dhx + (y >> 1) + (sx - (sy >> 1))
            d = hexdist(x, y, sx, sy)
            if d <= 3:
                continue
            if cart:
                X, Y = (x + 0.5 * (y & 1)) - (sx + 0.5 * (sy & 1)), (y - sy) * math.sqrt(3) / 2
            else:
                X, Y = x - sx, y - sy
            cells.append((math.degrees(math.atan2(Y, X)) % 360, r, x - sx, y - sy, d))
    cells.sort()
    runs = []
    for ang, r, dx, dy, d in cells:
        if runs and runs[-1][2] == r:
            runs[-1][1] = ang
            runs[-1][3] += 1
        else:
            runs.append([ang, ang, r, 1])
    for a, b, r, n in runs:
        print(f"{a:7.2f}..{b:7.2f}  {r:+d}  x{n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
