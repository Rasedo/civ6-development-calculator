"""H-3: FindWater(plot, r, true): the result against the nearest river plot's
hex distance (IsRiver from the flags laid so far, lakes too), tallied as
(r, nearest distance, result).

    python tools/civ6lab/h3_fwdist.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import sys

from h3_findwater import is_river, river_batches
from h3_x import Session, unrle


def main() -> int:
    tally = collections.Counter()
    for path in sys.argv[1:]:
        s = Session(path)
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
            riv = [q for q in range(s.g.n) if is_river(s, flags, q) or water[q] == 2]
            d = min((s.g.dist(p, q) for q in riv), default=99)
            tally[(float(r), min(d, 9), res)] += 1
            if (d > float(r)) == (res == "true"):
                near = sorted((s.g.dist(p, q), s.g.xy(q), sorted(flags.get(q, set())), water[q]) for q in riv)[:3]
                print(f"  {path[-30:]} call {xy} r={r} game={res} nearest {near}")
    for k in sorted(tally):
        print(k, tally[k])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
