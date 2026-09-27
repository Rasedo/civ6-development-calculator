"""H-3: for one feature, the plots the row model admits but the game refuses
(and the reverse), tabulated against candidate facts: the row y and its
latitude band, the hex distance to the nearest plot carrying a given feature,
lake, river adjacency, fresh water, resource.

    python tools/civ6lab/h3_chfwhy.py --rows R --tables T --feature FEATURE_REEF --near FEATURE_ICE sessions...
"""
from __future__ import annotations

import argparse
import collections

from h3_chf import DB, Plots, load_tables, rule
from h3_x import Session, unhex


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--rows", required=True)
    p.add_argument("--tables", required=True)
    p.add_argument("--feature", required=True)
    p.add_argument("--near", default="")
    p.add_argument("--arg", default="true", choices=("false", "true", "none"))
    p.add_argument("sessions", nargs="+")
    a = p.parse_args()
    db = DB(Session(a.rows), load_tables(a.tables))
    f = db.fidx[a.feature]
    near = db.fidx.get(a.near)
    tab = collections.Counter()
    for path in a.sessions:
        s = Session(path)
        P = Plots(s)
        radj = s.bits("IsRiverAdjacent")
        e = next(e for e in s.xs("chf") if int(e[1]) == f)
        got = unhex(e[{"false": 2, "true": 3, "none": 4}[a.arg]], s.g.n)
        carriers = [q for q in range(s.g.n) if near is not None and s.feature[q] == near]
        for i in range(s.g.n):
            pred, why = rule(db, P, f, i)
            if not pred and got[i]:
                print("  game admits, model refuses:", s.g.xy(i), why)
            if pred:
                y = s.g.xy(i)[1]
                lat = round(abs(y - (s.g.h - 1) / 2) / ((s.g.h - 1) / 2), 2)
                dn = min((s.g.dist(i, q) for q in carriers), default=99)
                key = (got[i], "lat>=" + str(int(lat * 10) / 10), "near" + str(min(dn, 4)), "radj" + str(radj[i]),
                       "fresh" + str(P.fresh[i]))
                tab[key] += 1
    for k in sorted(tab, key=str):
        print(k, tab[k])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
