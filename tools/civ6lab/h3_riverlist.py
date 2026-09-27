"""H-3: rebuild each river's plot list (RiverManager.GetRiverByIndex(i,
"plots").Plots, post-game) from the river setters in LOG (river id = the
last argument, calls in the order made): each edge adds its two plots
(W-of: the plot and its E neighbour; NW-of: the plot and its SE neighbour;
NE-of: the plot and its SW neighbour) when not yet listed. Variants: the
plot passed first, the other first, or by flow direction (the plot on the
flow's right bank first).

    python tools/civ6lab/h3_riverlist.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import re
import sys

from h3_x import Session

SETTER = re.compile(r"<TerrainBuilder\.Set(W|NW|NE)OfRiver\(@(\d+),(\d+),(\w+),(-?\d+),(-?\d+)\)")
OTHER = {"W": 1, "NW": 2, "NE": 3}


def build(s: Session, variant: str) -> dict[int, list[int]]:
    rivers = collections.defaultdict(list)
    for e in s.log:
        m = SETTER.match(e)
        if not m:
            continue
        fl, x, y, flow, rid = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(5)), int(m.group(6))
        p = y * s.g.w + x
        q = s.g.adj(p, OTHER[fl])
        pair = [p, q]
        if variant == "other":
            pair = [q, p]
        elif variant == "flow":
            # FlowDirection 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW: flowing N/NE/SE the passed plot
            # is on the west/left side; take it first when flowing "up", else the other
            if flow in (3, 4, 5):
                pair = [q, p]
        for v in pair:
            if v is not None and v not in rivers[rid]:
                rivers[rid].append(v)
    return rivers


def main() -> int:
    for path in sys.argv[1:]:
        s = Session(path)
        truth = {}
        for ln in s.postgen("RIVER"):
            m = re.match(r"RIVER (\d+) id=(-?\d+) type=(-?\d+) keys=.* plots=(.*)$", ln)
            truth[int(m.group(2))] = [int(v) for v in m.group(4).split(",") if v]
        for variant in ("passed", "other", "flow"):
            b = build(s, variant)
            same = sum(1 for rid, pl in truth.items() if b.get(rid) == pl)
            setsame = sum(1 for rid, pl in truth.items() if set(b.get(rid, [])) == set(pl))
            print(f"{path[-30:]} {variant:7s} lists equal {same}/{len(truth)}, as sets {setsame}/{len(truth)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
