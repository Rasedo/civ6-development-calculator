"""H-3: GetPlotFertility(i, major, bCheckOthers) against GetPlotFertility(i, -1)
on the natives probe's end-of-map records (fertw|0|false / true, fert): the
difference per plot tabulated by the hex distance to the nearest start plot
of another player (majors, minors) and to major 0's own start, and by the
major region the plot lies in.

    python tools/civ6lab/h3_fertw.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import sys

from h3_x import Session


def main() -> int:
    for path in sys.argv[1:]:
        s = Session(path)
        g = s.g
        fert = [int(v) for v in s.x1("fert")[1].split(",")]
        fw = {e[2]: [int(v) for v in e[3].split(",")] for e in s.xs("fertw")}
        starts = [i for i in range(g.n) if s.flags[i] & 64]
        own = s.dump["starts"]
        print(path[-26:], "starts", len(starts), "dump starts", own[:4])
        own0 = next((y * g.w + x for p, x, y in own if p == 0), None)
        for chk in ("false", "true"):
            tab = collections.defaultdict(collections.Counter)
            for i in range(g.n):
                d = fw[chk][i] - fert[i]
                dn = min((g.dist(i, j) for j in starts if j != own0), default=99)
                d0 = g.dist(i, own0) if own0 is not None else 99
                tab[(min(dn, 12), min(d0, 12))][d] += 1
            print("  check", chk)
            for k in sorted(tab):
                if set(tab[k]) != {0}:
                    print("    dist other/own", k, dict(sorted(tab[k].items())))
            same = sum(1 for i in range(g.n) if fw[chk][i] == fert[i])
            print("    equal to fert(-1):", same, "of", g.n)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
