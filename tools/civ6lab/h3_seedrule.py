"""H-3: search the per-seed draw layout of BuildRidges: after the (y, x) pair,
F1 fixed draws, then a loop drawing get(R) until the value satisfies a test,
then F2 fixed draws. Every clean seed's extras (h3_seedextras) must fit.

    python tools/civ6lab/h3_seedrule.py DUMP [DUMP ...]
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_ridgefit import raws, r  # noqa: E402


def clean_seeds(dumps):
    out = []
    for dump in dumps:
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
                    out.append((rec["name"], a == 0, d[a + 2:b]))
    return out


def fits(ex, f1, f2, R, test):
    L = len(ex) - f1 - f2
    if L < 1:
        return False
    loop = ex[f1:f1 + L]
    vals = [r(v, R) for v in loop]
    return all(not test(v) for v in vals[:-1]) and test(vals[-1])


def main() -> int:
    seeds = clean_seeds([x for x in sys.argv[1:] if not x.startswith("--")])
    if "--first" in sys.argv:
        seeds = [s for s in seeds if s[1]]
    print("clean seeds", len(seeds))
    tests = {}
    for c in range(0, 12):
        tests[f"=={c}"] = (lambda c: lambda v: v == c)(c)
        tests[f"!={c}"] = (lambda c: lambda v: v != c)(c)
        tests[f"<{c}"] = (lambda c: lambda v: v < c)(c)
        tests[f">={c}"] = (lambda c: lambda v: v >= c)(c)
    hits = []
    for f1 in range(0, 4):
        for f2 in range(0, 4):
            for R in range(2, 17):
                for tn, t in tests.items():
                    ok = sum(fits(ex, f1, f2, R, t) for _, _, ex in seeds)
                    if ok >= len(seeds) - 2:
                        hits.append((ok, f1, f2, R, tn))
    hits.sort(reverse=True)
    for h in hits[:30]:
        print(h)
    return 0


if __name__ == "__main__":
    sys.exit(main())
