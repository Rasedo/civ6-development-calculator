"""H-3: print clean seeds' positions and extras under a range.

    python tools/civ6lab/h3_seedprint.py R DUMP [DUMP ...]
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_ridgefit import raws, r  # noqa: E402


def main() -> int:
    R = int(sys.argv[1])
    rows = []
    for dump in sys.argv[2:]:
        for ln in pathlib.Path(dump).read_text(encoding="utf-8").splitlines():
            rec = json.loads(ln)
            if "ridged_grid" not in rec or rec["w"] != 1 << rec["xe"] or rec["h"] != 1 << rec["ye"]:
                continue
            fx, fy = rec["w"], rec["h"]
            n = rec["draws"]["P2->P3"]
            if n > 2000:
                continue
            d = raws(rec, "P2", n)
            g = rec["ridged_grid"]
            zeros = {(x, y) for y in range(fy) for x in range(fx) if g[y][x] == 0}
            ks = [k for k in range(n - 1) if (r(d[k + 1], fx), r(d[k], fy)) in zeros]
            full = len(ks) == len(zeros)
            ks2 = ks + [n] if full else ks
            for a, b in zip(ks2, ks2[1:]):
                if b - a - 2 <= 6:
                    x, y = r(d[a + 1], fx), r(d[a], fy)
                    rows.append((b - a - 2, a == 0, rec["name"], fx, fy, x, y, [r(v, R) for v in d[a + 2:b]]))
    rows.sort()
    for row in rows:
        print(*row)
    return 0


if __name__ == "__main__":
    sys.exit(main())
