"""H-3: nearest-seed tests on one StampContinents experiment (exp records):
for each pair of continents and each metric, the number of seed pairs (seeds
anywhere on the map) that separate the two strictly, with ties allowed,
and the best pair's misplaced plot count.

    python tools/civ6lab/h3_expvor.py runs/h3_session_<stamp>.jsonl <experiment>
"""
from __future__ import annotations

import itertools
import sys

import numpy as np

from h3_voronoi import metric
from h3_x import Grid, Session, unrle


def main() -> int:
    s = Session(sys.argv[1])
    w, h = map(int, s.x1("grid")[1].split(","))
    g = Grid(w, h)
    e = next(e for e in s.xs("exp") if e[1] == sys.argv[2])
    cont = unrle(e[3])
    conts = sorted({c for c in cont if c != -1})
    plots = {c: [i for i in range(g.n) if cont[i] == c] for c in conts}
    seeds = list(range(g.n))
    for name in ("hex", "euclid", "offset2", "civ5skew"):
        for c1, c2 in itertools.combinations(conts, 2):
            pts = plots[c1] + plots[c2]
            lab = np.array([0] * len(plots[c1]) + [1] * len(plots[c2]))
            D = metric(g, name, seeds, pts)
            strict = weak = 0
            best = (10 ** 9, None, None)
            for ia in range(len(seeds)):
                dA = D[ia][None, :]
                bad = np.where(lab == 0, dA >= D, D >= dA).sum(axis=1)
                badw = np.where(lab == 0, dA > D, D > dA).sum(axis=1)
                strict += int((bad == 0).sum())
                weak += int((badw == 0).sum())
                j = int(np.argmin(bad))
                if bad[j] < best[0]:
                    best = (int(bad[j]), g.xy(seeds[ia]), g.xy(seeds[j]))
            print(f"{name:9s} {c1}/{c2}: strict {strict:7d} ties-allowed {weak:7d} best {best}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
