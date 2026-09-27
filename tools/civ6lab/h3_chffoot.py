"""H-3: CanHaveFeature(plot, f, false) for a multi-plot natural wonder: the
single-plot test on the plot and on the extra plots of at least one
orientation (h3_nwfit's shapes: 2 plots the neighbour d, 3 the neighbours d
and d+1, 4 those and the plot beyond them), scored on the natives sessions'
chf records (the false column).

    python tools/civ6lab/h3_chffoot.py --rows R --tables T sessions...
"""
from __future__ import annotations

import argparse
import collections

from h3_chf import DB, Plots, load_tables, rule
from h3_x import Session, unhex


def footprints(g, anc, tiles):
    out = []
    for d in range(6):
        if tiles == 2:
            out.append([g.adj(anc, d)])
        elif tiles == 3:
            out.append([g.adj(anc, d), g.adj(anc, (d + 1) % 6)])
        else:
            m = g.adj(anc, d)
            out.append([m, g.adj(anc, (d + 1) % 6), g.adj(m, (d + 1) % 6) if m is not None else None])
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--rows", required=True)
    p.add_argument("--tables", required=True)
    p.add_argument("sessions", nargs="+")
    a = p.parse_args()
    db = DB(Session(a.rows), load_tables(a.tables))
    bad = collections.Counter()
    tot = collections.Counter()
    for path in a.sessions:
        s = Session(path)
        P = Plots(s)
        g = s.g
        for e in s.xs("chf"):
            f = int(e[1])
            if db.F[f].get("NaturalWonder") != "true":
                continue
            tiles = db.fi(f, "Tiles", 1)
            got = unhex(e[2], g.n)
            one = [rule(db, P, f, i)[0] for i in range(g.n)]
            for i in range(g.n):
                if tiles <= 1:
                    pred = one[i]
                else:
                    pred = one[i] and any(all(q is not None and one[q] for q in fp) for fp in footprints(g, i, tiles))
                tot[db.F[f]["FeatureType"]] += 1
                if pred != got[i]:
                    bad[db.F[f]["FeatureType"]] += 1
    for k in sorted(tot):
        print(f"{k:28s} tiles {db.fi(db.fidx[k], 'Tiles', 1)} wrong {bad[k]} of {tot[k]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
