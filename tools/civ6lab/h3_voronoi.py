"""H-3: is StampContinents' split a nearest-seed (Voronoi) split? For each
pair of continents and each metric, count the seed pairs (a in the first
continent, b in the second; any plot with --any) that put every non-ocean
plot of the two continents strictly on its own side (and with ties allowed).
Metrics: hex (cube) distance, Euclidean between hex centres, Civ 5's
skewed hexDistance of the offset difference, squared offset distance; all
with x wrapping.

    python tools/civ6lab/h3_voronoi.py runs/h3_session_<stamp>.jsonl [--any]
"""
from __future__ import annotations

import itertools
import sys

import numpy as np

from h3_x import Session, unrle


def coords(g, idx):
    idx = np.array(idx)
    return idx % g.w, idx // g.w


def metric(g, name, a, b):
    xa, ya = coords(g, a)
    xb, yb = coords(g, b)
    best = None
    for sh in (-g.w, 0, g.w):
        xs = xb + sh
        if name == "hex":
            qa = xa - (ya - (ya & 1)) // 2
            qb = xs - (yb - (yb & 1)) // 2
            dq = qa[:, None] - qb[None, :]
            dr = ya[:, None] - yb[None, :]
            d = (np.abs(dq) + np.abs(dr) + np.abs(dq + dr)) / 2
        elif name == "euclid":
            cxa = xa + 0.5 * (ya & 1)
            cxb = xs + 0.5 * (yb & 1)
            d = np.hypot(cxa[:, None] - cxb[None, :], (ya[:, None] - yb[None, :]) * (3 ** 0.5 / 2))
        elif name == "civ5skew":
            dx = xa[:, None] - xs[None, :]
            dy = ya[:, None] - yb[None, :]
            same = (dx >= 0) == (dy >= 0)
            d = np.where(same, np.abs(dx) + np.abs(dy), np.maximum(np.abs(dx), np.abs(dy)))
        elif name == "offset2":
            d = (xa[:, None] - xs[None, :]) ** 2 + (ya[:, None] - yb[None, :]) ** 2
        best = d if best is None else np.minimum(best, d)
    return best


def main() -> int:
    s = Session(sys.argv[1])
    after = unrle(s.x1("stamp", "after")[2])
    conts = sorted({c for c in after if c != -1})
    plots = {c: [i for i in range(s.g.n) if after[i] == c] for c in conts}
    anyseed = "--any" in sys.argv
    for name in ("hex", "euclid", "civ5skew", "offset2"):
        for c1, c2 in itertools.combinations(conts, 2):
            pts = plots[c1] + plots[c2]
            lab = np.array([0] * len(plots[c1]) + [1] * len(plots[c2]))
            ca = list(range(s.g.n)) if anyseed else plots[c1]
            cb = list(range(s.g.n)) if anyseed else plots[c2]
            da = metric(s.g, name, ca, pts)
            db = metric(s.g, name, cb, pts)
            strict = weak = 0
            for ia in range(len(ca)):
                dA = da[ia][None, :]
                strict += int(np.where(lab == 0, dA < db, db < dA).all(axis=1).sum())
                weak += int(np.where(lab == 0, dA <= db, db <= dA).all(axis=1).sum())
            print(f"{name:9s} {c1:3d} ({len(plots[c1]):4d}) / {c2:3d} ({len(plots[c2]):4d}): strict {strict:7d}  ties allowed {weak:7d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
