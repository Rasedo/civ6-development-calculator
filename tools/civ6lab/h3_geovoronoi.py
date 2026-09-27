"""H-3: is the split of one landmass into two continents a nearest-seed split
in LAND PATH distance (breadth-first over the land plots at the stamp, 6
neighbours, x wrapping)? For two continents c1, c2 on one landmass, count
the seed pairs (a in c1, b in c2) that put every plot of the two strictly
on its own side, and with ties allowed.

    python tools/civ6lab/h3_geovoronoi.py runs/h3_session_<stamp>.jsonl c1 c2
"""
from __future__ import annotations

import collections
import sys

import numpy as np

from h3_x import Session, unrle


def main() -> int:
    s = Session(sys.argv[1])
    c1, c2 = int(sys.argv[2]), int(sys.argv[3])
    before = unrle(s.x1("stamp", "before")[2])
    after = unrle(s.x1("stamp", "after")[2])
    pts = [i for i in range(s.g.n) if after[i] in (c1, c2)]
    pos = {p: k for k, p in enumerate(pts)}
    land = {i for i in range(s.g.n) if before[i] != 1}
    D = np.full((len(pts), len(pts)), 10 ** 6, dtype=np.int32)
    for k, src in enumerate(pts):
        dist = {src: 0}
        dq = collections.deque([src])
        while dq:
            u = dq.popleft()
            for v in s.g.ring1(u):
                if v is not None and v in land and v not in dist:
                    dist[v] = dist[u] + 1
                    dq.append(v)
        for p, d in dist.items():
            if p in pos:
                D[k, pos[p]] = d
    lab = np.array([0 if after[p] == c1 else 1 for p in pts])
    A = [k for k, p in enumerate(pts) if after[p] == c1]
    B = [k for k, p in enumerate(pts) if after[p] == c2]
    reach = (D < 10 ** 6)
    print("plots", len(pts), "unreachable pairs", int((~reach).sum()))
    strict = weak = 0
    best = None
    for a in A:
        dA = D[a][None, :]
        dB = D[B]
        ok_s = np.where(lab == 0, dA < dB, dB < dA).all(axis=1)
        ok_w = np.where(lab == 0, dA <= dB, dB <= dA).all(axis=1)
        strict += int(ok_s.sum())
        weak += int(ok_w.sum())
        bad = np.where(lab == 0, dA >= dB, dB >= dA).sum(axis=1)
        j = int(np.argmin(bad))
        if best is None or bad[j] < best[0]:
            best = (int(bad[j]), s.g.xy(pts[a]), s.g.xy(pts[B[j]]))
    print(f"land-path Voronoi {c1}/{c2}: strict {strict}, ties allowed {weak}; best pair misplaces {best}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
