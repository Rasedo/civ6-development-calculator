"""H-3: the FindWater(plot, r, true) calls the river model gets wrong, in
detail: every plot within r that the model counts as river, its distance,
its own flags and the neighbour flags that make it a river plot.

    python tools/civ6lab/h3_fwfail.py runs/h3_session_<stamp>.jsonl
"""
from __future__ import annotations

import collections
import sys

from h3_findwater import is_river, river_batches
from h3_x import Session, unrle


def main() -> int:
    s = Session(sys.argv[1])
    water = unrle(s.x1("fwstate")[1])
    batches = river_batches(s)
    flags = collections.defaultdict(set)
    k = 0
    for e in s.x:
        tag = e.split("|", 1)[0]
        if tag == "corner":
            for fl, p in batches[k]:
                flags[p].add(fl)
            k += 1
            continue
        if tag != "fw":
            continue
        _, xy, r, flag, res = e.split("|")
        if flag != "true":
            continue
        px, py = map(int, xy.split(","))
        p = py * s.g.w + px
        rr = int(float(r))
        near = [q for q in range(s.g.n) if s.g.dist(p, q) <= rr]
        pred = any(is_river(s, flags, q) or water[q] == 2 for q in near)
        if pred != (res == "true"):
            print(f"call at {xy} r={r} game={res} model={pred} (after {k} corners)")
            for q in near:
                if is_river(s, flags, q) or water[q] == 2:
                    nb = {d: sorted(flags.get(s.g.adj(q, d), set())) for d in (0, 4, 5)}
                    print(f"   {s.g.xy(q)} d={s.g.dist(p, q)} own={sorted(flags.get(q, set()))} NE/W/NW nbrs={nb} lake={water[q] == 2}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
