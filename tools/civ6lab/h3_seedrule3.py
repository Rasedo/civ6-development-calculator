"""H-3: search per-seed layouts with up to two threshold loops:
extras = F1 fixed, loop1 (draw get(R1) until test1), F2 fixed,
[loop2 (get(R2) until test2)], F3 fixed.

    python tools/civ6lab/h3_seedrule3.py DUMP [DUMP ...] [--first]
"""
from __future__ import annotations

import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_seedrule import clean_seeds  # noqa: E402
from h3_ridgefit import r  # noqa: E402


def tests():
    out = []
    for R in range(2, 17):
        for c in range(R):
            out.append((R, "==", c))
            out.append((R, "!=", c))
            if 0 < c:
                out.append((R, "<", c))
                out.append((R, ">=", c))
    return out


def ok(v, R, op, c):
    x = r(v, R)
    return x == c if op == "==" else x != c if op == "!=" else x < c if op == "<" else x >= c


def ends(ex, start, t):
    """the index after a loop starting at `start` with test t, or None"""
    R, op, c = t
    for i in range(start, len(ex)):
        if ok(ex[i], R, op, c):
            return i + 1
    return None


def main() -> int:
    seeds = clean_seeds([x for x in sys.argv[1:] if not x.startswith("--")])
    if "--first" in sys.argv:
        seeds = [s for s in seeds if s[1]]
    exs = [ex for _, _, ex in seeds]
    print("seeds", len(exs))
    T = tests()
    best = []
    # one loop
    for f1 in range(4):
        for f3 in range(4):
            for t in T:
                n = sum(1 for ex in exs if (e := ends(ex, f1, t)) is not None and e + f3 == len(ex))
                best.append((n, "one", f1, t, f3))
    # two loops, F1 + F2 + F3 <= 1
    for f1, f2, f3 in ((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)):
        for t1 in T:
            e1s = [ends(ex, f1, t1) for ex in exs]
            if sum(e is not None for e in e1s) < len(exs) - 3:
                continue
            for t2 in T:
                n = 0
                for ex, e1 in zip(exs, e1s):
                    if e1 is None:
                        continue
                    e2 = ends(ex, e1 + f2, t2)
                    if e2 is not None and e2 + f3 == len(ex):
                        n += 1
                best.append((n, "two", f1, t1, f2, t2, f3))
    best.sort(key=lambda b: -b[0])
    for b in best[:20]:
        print(b)
    return 0


if __name__ == "__main__":
    sys.exit(main())
