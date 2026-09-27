"""H-3: for one StampContinents experiment and two of its continents c1, c2,
the seed pairs (s1 in c1, s2 in c2) whose hex-distance Voronoi reproduces the
two exactly on c1 u c2 when a tie goes to s1 (--tie first), to s2 (second),
or to the seed of lower (low) / higher (high) plot index.

    python tools/civ6lab/h3_seedpair.py runs/h3_session_<exp>.jsonl rect_tall c1 c2 [--tie first]
"""
from __future__ import annotations

import argparse

import numpy as np

from h3_voronoi import metric
from h3_x import Grid, Session, unrle


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("session")
    p.add_argument("exp")
    p.add_argument("c1", type=int)
    p.add_argument("c2", type=int)
    p.add_argument("--tie", default="first", choices=("first", "second", "low", "high"))
    p.add_argument("--show", type=int, default=20)
    a = p.parse_args()
    s = Session(a.session)
    w, h = map(int, s.x1("grid")[1].split(","))
    g = Grid(w, h)
    e = next(e for e in s.xs("exp") if e[1] == a.exp)
    cont = unrle(e[3])
    p1 = [i for i in range(g.n) if cont[i] == a.c1]
    p2 = [i for i in range(g.n) if cont[i] == a.c2]
    pts = p1 + p2
    lab = np.array([0] * len(p1) + [1] * len(p2))
    D1 = metric(g, "hex", p1, pts)
    D2 = metric(g, "hex", p2, pts)
    hits = []
    for i1 in range(len(p1)):
        d1 = D1[i1][None, :]
        if a.tie == "first":
            to1 = d1 <= D2
        elif a.tie == "second":
            to1 = d1 < D2
        else:
            s1 = p1[i1]
            s2 = np.array(p2)[:, None]
            first_wins = (s1 < s2) if a.tie == "low" else (s1 > s2)
            to1 = (d1 < D2) | ((d1 == D2) & first_wins)
        good = np.where(lab == 0, to1, ~to1).all(axis=1)
        for i2 in np.nonzero(good)[0]:
            hits.append((g.xy(p1[i1]), g.xy(p2[int(i2)])))
    print(f"{a.exp} {a.c1}/{a.c2} tie {a.tie}: {len(hits)} exact seed pairs")
    for hpair in hits[: a.show]:
        print("  ", hpair)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
