"""H-3: TerrainBuilder.GetInlandCorner(plot) against its 4 draws. For each
call (the corner records, in call order, beside the ledger's stream state
before each call): the forward Fisher-Yates shuffle of [0, 1, 2, 3]
(j = i + get(4 - i), the Civ 5 shuffleArray), the answer's offset from the
plot, and each candidate's water test on the map at AddRivers (fwstate).

    python tools/civ6lab/h3_corner.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import sys

from h3_x import DIRS, Session, get, unrle


def shuffle4(s: int) -> list[int]:
    a = [0, 1, 2, 3]
    for i in range(4):
        s, v = get(s, 4 - i)
        j = i + v
        a[i], a[j] = a[j], a[i]
    return a


def main() -> int:
    tally = collections.Counter()
    for path in sys.argv[1:]:
        s = Session(path)
        water = unrle(s.x1("fwstate")[1])  # 0 land / 1 water / 2 lake
        recs = s.xs("corner")
        pos = s.positions("TerrainBuilder.GetInlandCorner")
        print(path, "calls", len(recs), "ledger positions", len(pos))
        for k, e in enumerate(recs):
            px, py = map(int, e[1].split(","))
            p = py * s.g.w + px
            if e[2] == "nil":
                q = None
            else:
                qx, qy = map(int, e[2].split(","))
                q = qy * s.g.w + qx
            st = s.state_before("TerrainBuilder.GetInlandCorner", k)
            order = shuffle4(st)
            if q is None:
                off = "nil"
            elif q == p:
                off = "self"
            else:
                off = next((DIRS[d] for d in range(6) if s.g.adj(p, d) == q), "far")
            # which plots touch the SE corner of a candidate: itself, E, SE
            def se_wet(c):
                if c is None:
                    return None
                for t in (c, s.g.adj(c, 1), s.g.adj(c, 2)):
                    if t is None or water[t] != 0:
                        return True
                return False
            cands = {"self": p, **{DIRS[d]: s.g.adj(p, d) for d in range(6)}}
            wet = {k2: se_wet(v) for k2, v in cands.items()}
            tally[(order[0], off)] += 1
            print(f"  {e[1]:>7} -> {e[2]:>7} ({off:4s}) shuffle {order}  SE-corner wet: " +
                  " ".join(f"{k2}={'W' if w else '.'}" for k2, w in wet.items()))
    print("first shuffled case vs answer:", dict(tally))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
