"""H-3: GetPlotFertility(i, region, true) against the same call's
GetPlotFertility(i, -1) (gpf records: index:checked:base:unchecked, taken
together in the start picker), per plot with the plot's facts, and the
difference tabulated by candidate terms.

    python tools/civ6lab/h3_gpf2.py runs/h3_session_<stamp>.jsonl [--rows]
"""
from __future__ import annotations

import collections
import sys

from h3_chf import Plots
from h3_x import Session


def main() -> int:
    for path in [a for a in sys.argv[1:] if not a.startswith("--")]:
        s = Session(path)
        g = s.g
        P = Plots(s)
        Y = [[int(v) for v in s.x1("plot", f"yield{y}")[2].split(",")] for y in range(6)]
        picks = []
        tab = collections.defaultdict(collections.Counter)
        for e in s.x:
            parts = e.split("|")
            if parts[0] == "pick":
                picks.append(int(parts[3]) if parts[3] not in ("nil", "") else None)
                continue
            if parts[0] != "gpf":
                continue
            reg = int(parts[1])
            blk = [tuple(int(x) for x in it.split(":")) for it in parts[3].split(",")]
            inreg = {t[0] for t in blk}
            if "--edge" in sys.argv:
                # the hex distance to the nearest plot outside the region's list
                dout = {}
                fr = [q for q in range(g.n) if q not in inreg]
                dist = {q: 0 for q in fr}
                k = 0
                while fr:
                    k += 1
                    nx = []
                    for u in fr:
                        for w_ in g.ring1(u):
                            if w_ is not None and w_ not in dist:
                                dist[w_] = k
                                nx.append(w_)
                    fr = nx
                pk = [p for p in picks if p is not None]
                et = collections.defaultdict(collections.Counter)
                for i, v, b, nc in blk:
                    if b > 0:
                        dmin = min((g.dist(i, p) for p in pk), default=99)
                        et[(min(dist.get(i, 99), 6), dmin <= 8)]["zero" if v == 0 else "pen%d" % (b - v)] += 1
                print("  region", reg, "edge distance, near an earlier pick -> outcome:",
                      {k_: dict(v_) for k_, v_ in sorted(et.items())})
            for it in parts[3].split(","):
                i, v, b, nc = (int(x) for x in it.split(":"))
                d = b - v
                ring = [q for q in g.ring1(i) if q is not None]
                y = [Y[k][i] for k in range(6)]
                key = (f"food {y[0]}", f"prod {y[1]}", f"base {b}")
                tab[d][key] += 1
                if "--feat" in sys.argv and b > 0:
                    near = sum(1 for q in ring if P.water[q])
                    land3 = sum(1 for q in range(g.n) if g.dist(i, q) <= 3 and not P.water[q])
                    pk = [p for p in picks if p is not None]
                    dmin = min((g.dist(i, p) for p in pk), default=99)
                    tab2 = globals().setdefault("TAB2", collections.defaultdict(collections.Counter))
                    tab2[(f"b%{b % 5}", f"waterNb {near}")][d] += 1
                    tab3 = globals().setdefault("TAB3", collections.defaultdict(collections.Counter))
                    tab3[(b, min(dmin, 9))][d] += 1
                    tab4 = globals().setdefault("TAB4", collections.defaultdict(collections.Counter))
                    zero = "zero" if v == 0 else ("pen%d" % d)
                    tab4[(f"water {P.water[i]}", f"coast {P.coastal[i]}", f"hills {s.terrain[i] % 3 == 1 and s.terrain[i] < 15}",
                          f"near pick {dmin <= 8}", f"river {P.river[i]}", f"fresh {P.fresh[i]}")][zero] += 1
                if "--rows" in sys.argv and d not in (0, 1):
                    print(f"  reg {reg} ({i % g.w},{i // g.w}) base {b} checked {v} d {d} y {y} t {s.terrain[i]} "
                          f"f {s.feature[i]} r {s.resource[i]} river {P.river[i]} fresh {P.fresh[i]} "
                          f"picked {[(p % g.w, p // g.w) for p in picks if p is not None]}")
        print(path[-26:])
        if "--feat" in sys.argv:
            for k, v in sorted(globals()["TAB4"].items()):
                print("   base, dist to an earlier pick", k, "penalty:", dict(v))
            continue
        for d in sorted(tab):
            print("  base - checked", d, dict(sorted(tab[d].items())[:30]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
