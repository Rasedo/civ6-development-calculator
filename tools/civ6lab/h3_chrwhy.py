"""H-3: CanHaveResource refusals the row model does not explain, tabulated
against the hex distance to the nearest start plot (the map dump's starts)
and against whether the plot is a start plot's neighbour.

    python tools/civ6lab/h3_chrwhy.py --rows R --tables T sessions...
"""
from __future__ import annotations

import argparse
import collections

from h3_chf import DB, Plots, load_tables
from h3_chr import rrule
from h3_x import Session, unhex


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--rows", required=True)
    p.add_argument("--tables", required=True)
    p.add_argument("sessions", nargs="+")
    a = p.parse_args()
    db = DB(Session(a.rows), load_tables(a.tables))
    tab = collections.Counter()
    for path in a.sessions:
        s = Session(path)
        P = Plots(s)
        starts = [y * s.g.w + x for _, x, y in s.dump["starts"]]
        dstart = [min((s.g.dist(i, q) for q in starts), default=99) for i in range(s.g.n)]
        for e in s.xs("chr"):
            r = int(e[1])
            got = unhex(e[2], s.g.n)
            for i in range(s.g.n):
                pred, _ = rrule(db, P, r, i)
                if pred:
                    tab[(got[i], min(dstart[i], 6))] += 1
    for k in sorted(tab):
        print("game", k[0], "start distance", k[1], tab[k])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
