"""H-3: Map.FindSecondContinent(plot, r) and Map.GetContinentsInUse() against
models on the finished map: FindSecondContinent true when a plot within hex
distance r carries a continent other than -1 and other than the plot's own
(variants: own -1 counts or not); GetContinentsInUse the continent types in
use in ascending order, or in order of first plot index.

    python tools/civ6lab/h3_fsc.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import sys

from h3_x import Session, unhex


def main() -> int:
    for path in sys.argv[1:]:
        s = Session(path)
        g = s.g
        c = s.continent
        for e in s.xs("fsc"):
            r = int(e[1])
            got = unhex(e[2], g.n)
            variants = {}
            for name, own_neg_ok in (("own continent any", True), ("own continent must be set", False)):
                pred = []
                for i in range(g.n):
                    if not own_neg_ok and c[i] == -1:
                        pred.append(False)
                        continue
                    pred.append(any(c[q] != -1 and c[q] != c[i] for q in range(g.n) if g.dist(i, q) <= r))
                variants[name] = sum(p != q for p, q in zip(pred, got))
            print(path[-30:], "FindSecondContinent r", r, "wrong:", variants, "true on", sum(got))
        ciu = s.x1("ciu")
        used_sorted = sorted({v for v in c if v != -1})
        first = []
        for v in c:
            if v != -1 and v not in first:
                first.append(v)
        print("   GetContinentsInUse", ciu[1] if ciu else None, "sorted", used_sorted, "first-plot order", first)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
