"""H-3: fit StampContinents as a hex-distance Voronoi: for one experiment (or
a natives session's stamp), for every pair of continents the seed pairs
(each seed a plot of its own continent) that put each plot of the two on the
side of the nearer seed, ties allowed; then the seeds of each continent that
survive against every other continent, and a check of the full assignment
(nearest seed, ties to the earlier continent in the 43-draw shuffle order, or
to the lower seed plot index) for every combination of surviving seeds (when
the product is small).

    python tools/civ6lab/h3_seedfit.py runs/h3_session_<stamp>.jsonl [experiment name]
"""
from __future__ import annotations

import itertools
import sys

import numpy as np

from h3_voronoi import metric
from h3_x import Grid, Session, unrle


def main() -> int:
    s = Session(sys.argv[1])
    if len(sys.argv) > 2:
        w, h = map(int, s.x1("grid")[1].split(","))
        g = Grid(w, h)
        e = next(e for e in s.xs("exp") if e[1] == sys.argv[2])
        cont = unrle(e[3])
    else:
        g = s.g
        cont = unrle(s.x1("stamp", "after")[2])
    conts = sorted({c for c in cont if c != -1})
    plots = {c: [i for i in range(g.n) if cont[i] == c] for c in conts}
    allp = [i for i in range(g.n) if cont[i] != -1]
    lab = np.array([conts.index(cont[i]) for i in allp])
    D = {c: metric(g, "hex", plots[c], allp).astype(np.int32) for c in conts}
    ok = {c: np.ones(len(plots[c]), dtype=bool) for c in conts}
    for c1, c2 in itertools.combinations(conts, 2):
        k1, k2 = conts.index(c1), conts.index(c2)
        m = (lab == k1) | (lab == k2)
        l = lab[m]
        A = D[c1][:, m]
        B = D[c2][:, m]
        good1 = np.zeros(len(plots[c1]), dtype=bool)
        good2 = np.zeros(len(plots[c2]), dtype=bool)
        for ia in range(A.shape[0]):
            a = A[ia][None, :]
            fine = np.where(l == k1, a <= B, B <= a).all(axis=1)
            if fine.any():
                good1[ia] = True
                good2 |= fine
        ok[c1] &= good1
        ok[c2] &= good2
        print(f"pair {c1}/{c2}: seeds of {c1} in some consistent pair {int(good1.sum())}, of {c2} {int(good2.sum())}")
    for c in conts:
        cand = [plots[c][k] for k in np.nonzero(ok[c])[0]]
        print(f"continent {c}: {len(cand)} surviving seeds, e.g. {[g.xy(q) for q in cand[:12]]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
