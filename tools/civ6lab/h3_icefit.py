"""H-3: Feature_NotNearFeatures (the water wonders avoid FEATURE_ICE): the
radius r that makes CanHaveFeature exact, per session (map size): the row
model with "no plot carrying the avoided feature within hex distance r".

    python tools/civ6lab/h3_icefit.py --rows R --tables T sessions...
"""
from __future__ import annotations

import argparse

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
        P = Plots(s)
        chf = {int(e[1]): unhex(e[3], s.g.n) for e in s.xs("chf")}
        out = []
        for name, avoid in db.not_near.items():
            f = db.fidx[name]
            carriers = [q for q in range(s.g.n) if s.feature[q] in avoid]
            base = [rule(db, P, f, i)[0] for i in range(s.g.n)]
            dmin = [min((s.g.dist(i, q) for q in carriers), default=999) if base[i] else 999 for i in range(s.g.n)]
            ok = [r for r in range(0, 25) if all((base[i] and dmin[i] > r) == chf[f][i] for i in range(s.g.n))]
            out.append(f"{name}: r in {ok[:1]}..{ok[-1:]}" if ok else f"{name}: none")
        print(s.g.w, s.g.h, path[-30:], "; ".join(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
