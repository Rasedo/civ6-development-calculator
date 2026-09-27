"""H-3: GetPlotFertility(i, -1) grouped by the plot's own facts: for each
(terrain, feature, resource, river, coastal land, fresh water, water next to
land) the values seen; a group with one value is a per-plot rule.

    python tools/civ6lab/h3_fert2.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import sys

from h3_chf import Plots
from h3_x import Session


def main() -> int:
    groups = collections.defaultdict(collections.Counter)
    for path in sys.argv[1:]:
        s = Session(path)
        P = Plots(s)
        fert = [int(v) for v in s.x1("fert")[1].split(",")]
        ylds = [[int(v) for v in s.x1("plot", f"yield{y}")[2].split(",")] for y in range(6)]
        for i in range(s.g.n):
            nearland = P.water[i] and any(q is not None and not P.water[q] for q in s.g.ring1(i))
            key = (s.terrain[i], s.feature[i], s.resource[i], P.river[i], P.coastal[i], P.fresh[i], nearland,
                   tuple(ylds[y][i] for y in range(6)))
            groups[key][fert[i]] += 1
    multi = {k: v for k, v in groups.items() if len(v) > 1}
    print("groups", len(groups), "with more than one value", len(multi))
    for k, v in sorted(groups.items(), key=lambda kv: -sum(kv[1].values()))[:60]:
        print(k, dict(v))
    print("--- multi-valued")
    for k, v in list(multi.items())[:30]:
        print(k, dict(v))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
