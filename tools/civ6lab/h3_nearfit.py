"""H-3: Feature_NotNearFeatures' distance per map (the water wonders keep
away from Ice): every radius r scored on the chf records (arg true) of the
features with a NotNearFeatures row, the other clauses as h3_chf has them.

    python tools/civ6lab/h3_nearfit.py --rows <dbrows session> --tables <dbtables session> runs/h3_session_<stamp>.jsonl [...]
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
    p.add_argument("sessions", nargs="+")
    a = p.parse_args()
    db = DB(Session(a.rows), load_tables(a.tables))
    for path in a.sessions:
        s = Session(path)
        g = s.g
        P = Plots(s)
        wrong = collections.Counter()
        for e in s.xs("chf"):
            f = int(e[1])
            name = db.F[f]["FeatureType"]
            nn = db.not_near.get(name)
            if not nn:
                continue
            got = unhex(e[3], g.n)
            avoid = [q for q in range(g.n) if s.feature[q] in nn]
            for i in range(g.n):
                ok, why = rule(db, P, f, i, skip={"NotNearFeatures", "MinDistanceNW"})
                mnw = db.fi(f, "MinDistanceNW", -1)
                if ok and mnw > 0 and any(g.dist(i, q) <= mnw for q in P.nwplots):
                    ok = False
                dmin = min((g.dist(i, q) for q in avoid), default=999)
                for r in range(0, 40):
                    pred = ok and not dmin <= r
                    wrong[r] += pred != got[i]
        best = sorted(wrong, key=lambda r: (wrong[r], r))
        fits = [r for r in range(40) if wrong[r] == 0]
        print(f"{path[-26:]} {g.w}x{g.h} (W*H)//256 = {g.n // 256}: radii with no miss {fits}; "
              f"best {best[0]} ({wrong[best[0]]} misses)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
