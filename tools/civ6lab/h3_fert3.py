"""H-3: GetPlotFertility(i, -1) against base = 2*food + 2*production + gold
(+ science, culture, faith weights w) from the plot's own yields; the
residual tabulated against the plot's terrain and river / fresh water /
coastal facts and the count of neighbours of each kind.

    python tools/civ6lab/h3_fert3.py runs/h3_session_<stamp>.jsonl [...]
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
        fert = [int(v) for v in s.x1("fert")[1].split(",")]
        Y = [[int(v) for v in s.x1("plot", f"yield{y}")[2].split(",")] for y in range(6)]
        for i in range(s.g.n):
            base = 2 * Y[0][i] + 2 * Y[1][i] + Y[2][i] + Y[3][i] + Y[4][i] + Y[5][i]
            res = fert[i] - base
            key = (s.terrain[i], "riv" if P.river[i] else "", "fresh" if P.fresh[i] else "",
                   "coastal" if P.coastal[i] else "", "imp" if P.imp[i] else "")
            tab[key][res] += 1
    for k in sorted(tab, key=lambda k: -sum(tab[k].values()))[:40]:
        print(k, dict(sorted(tab[k].items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
