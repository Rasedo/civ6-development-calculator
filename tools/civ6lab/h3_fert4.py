"""H-3: GetPlotFertility residuals (fert - (2F + 2P + G + S + C + Fa) of the plot's
own yields) against candidate neighbour terms, for land plots and water
plots apart: per residual, the counts of (resource on the plot, resources in
ring 1, river plots in ring 1, the plot's resource class, water distance to
land).

    python tools/civ6lab/h3_fert4.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import sys

from h3_chf import Plots
from h3_x import Session


def main() -> int:
    tab = collections.defaultdict(collections.Counter)
    for path in sys.argv[1:]:
        s = Session(path)
        P = Plots(s)
        rcls = {int(i): r.get("ResourceClassType", "?")[14:] for i, r in s.db["R"].items()} if s.db["R"] else {}
        fert = [int(v) for v in s.x1("fert")[1].split(",")]
        Y = [[int(v) for v in s.x1("plot", f"yield{y}")[2].split(",")] for y in range(6)]
        for i in range(s.g.n):
            base = 2 * Y[0][i] + 2 * Y[1][i] + sum(Y[k][i] for k in range(2, 6))
            res = fert[i] - base
            ring = [q for q in s.g.ring1(i) if q is not None]
            if P.water[i]:
                key = ("water", s.terrain[i], "dland", P.dland[i], "ice" if s.feature[i] == 1 else "",
                       "res" if s.resource[i] != -1 else "")
            else:
                if P.river[i] or P.fresh[i] or P.imp[i] or s.terrain[i] in (9, 10, 12, 13):
                    continue
                key = ("land flat/hill", "own res " + rcls.get(s.resource[i], "-") if s.resource[i] != -1 else "no res",
                       "ring res", sum(1 for q in ring if s.resource[q] != -1),
                       "ring feat", sum(1 for q in ring if s.feature[q] != -1))
            tab[key][res] += 1
    for k in sorted(tab, key=str)[:80]:
        print(k, dict(sorted(tab[k].items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
