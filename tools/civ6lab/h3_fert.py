"""H-3: StartPositioner.GetPlotFertility(i, -1) against the plot and its
rings: prints the value beside the plot's own yields/terrain/feature for a
sample, and fits (least squares) the value as a sum over the plot, ring 1
and ring 2 of per-yield weights, reporting the residual.

    python tools/civ6lab/h3_fert.py runs/h3_session_<stamp>.jsonl [--sample 30]
"""
from __future__ import annotations

import argparse

import numpy as np

from h3_x import Session


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("session")
    p.add_argument("--sample", type=int, default=0)
    a = p.parse_args()
    s = Session(a.session)
    g = s.g
    fert = [int(v) for v in s.x1("fert")[1].split(",")]
    ylds = [[int(v) for v in s.x1("plot", f"yield{y}")[2].split(",")] for y in range(6)]
    for e in s.xs("fertw"):
        w = [int(v) for v in e[3].split(",")]
        same = sum(1 for i in range(g.n) if w[i] == fert[i])
        print(f"fertw major {e[1]} check {e[2]}: equal to fert(-1) on {same} of {g.n}")
    import collections
    print("value histogram (top):", collections.Counter(fert).most_common(12))
    if a.sample:
        for i in range(0, g.n, max(1, g.n // a.sample)):
            print(g.xy(i), "fert", fert[i], "t", s.terrain[i], "f", s.feature[i], "r", s.resource[i],
                  "yields", [ylds[y][i] for y in range(6)])
    rings = []
    for i in range(g.n):
        r1 = [q for q in g.ring1(i) if q is not None]
        r2 = [q for q in range(g.n) if g.dist(i, q) == 2] if False else None
        rings.append(r1)
    X = []
    for i in range(g.n):
        row = [ylds[y][i] for y in range(6)] + [sum(ylds[y][q] for q in rings[i]) for y in range(6)] + [1]
        X.append(row)
    X = np.array(X, dtype=float)
    Y = np.array(fert, dtype=float)
    coef, *_ = np.linalg.lstsq(X, Y, rcond=None)
    res = Y - X @ coef
    print("fit own yields + ring-1 yields + const:", np.round(coef, 2), "max |residual|", round(float(np.abs(res).max()), 2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
