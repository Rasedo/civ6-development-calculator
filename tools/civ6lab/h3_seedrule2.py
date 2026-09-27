"""H-3: search per-seed layouts where a loop redraws until its value differs
(under get(R)) from an earlier draw of the same seed.

    python tools/civ6lab/h3_seedrule2.py DUMP [DUMP ...] [--first]
Layout: extras = f1 fixed draws (the reference is extras[ref]), then a loop
drawing until r(v, R) != r(ref, R) (or ==, <, >), then f2 fixed draws.
"""
from __future__ import annotations

import sys
import pathlib

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_seedrule import clean_seeds  # noqa: E402
from h3_ridgefit import r  # noqa: E402

OPS = {"!=": lambda a, b: a != b, "==": lambda a, b: a == b, "<": lambda a, b: a < b,
       ">": lambda a, b: a > b, "<=": lambda a, b: a <= b, ">=": lambda a, b: a >= b}


def fits(ex, f1, ref, f2, R, op):
    L = len(ex) - f1 - f2
    if L < 1 or ref >= f1:
        return False
    rv = r(ex[ref], R)
    vals = [r(v, R) for v in ex[f1:f1 + L]]
    t = OPS[op]
    return all(not t(v, rv) for v in vals[:-1]) and t(vals[-1], rv)


def main() -> int:
    seeds = clean_seeds([x for x in sys.argv[1:] if not x.startswith("--")])
    if "--first" in sys.argv:
        seeds = [s for s in seeds if s[1]]
    print("seeds", len(seeds))
    hits = []
    for f1 in range(1, 4):
        for ref in range(f1):
            for f2 in range(0, 4):
                for R in range(2, 33):
                    for op in OPS:
                        ok = sum(fits(ex, f1, ref, f2, R, op) for _, _, ex in seeds)
                        hits.append((ok, f1, ref, f2, R, op))
    hits.sort(reverse=True)
    for h in hits[:15]:
        print(h)
    return 0


if __name__ == "__main__":
    sys.exit(main())
