"""H-3: AreaBuilder.Recalculate against the LAST recalculation the map
script made (the natives probe's last areas record: each plot's area id
then) on the terrain of that moment, rebuilt from the final map with the
changes made after it undone: natural wonders' plots (SetFeatureType's nw
records keep the terrain before) — the final plot|area record is stale on
those. Components of water / passable land / mountain, x wrapping, numbered
by lowest plot index, id = (k << 16) | (k - 1).

    python tools/civ6lab/h3_areas2.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import sys

from h3_x import Session, unrle

MTN = (2, 5, 8, 11, 14)


def cls_of(t: int) -> str:
    return "W" if t >= 15 else "M" if t in MTN else "L"


def main() -> int:
    tot = collections.Counter()
    for path in sys.argv[1:]:
        s = Session(path)
        g = s.g
        last = s.xs("areas")[-1]
        truth = unrle(last[2])
        ter = list(s.terrain)
        # undo the wonders' terrain changes (nw|feature|x,y|i:before:after,...)
        for e in s.xs("nw"):
            for it in e[3].split(","):
                if it:
                    i, before, _after = it.split(":")
                    if before not in ("nil", ""):
                        ter[int(i)] = int(before)
        cls = [cls_of(t) for t in ter]
        seen = [False] * g.n
        pred = [0] * g.n
        k = 0
        for i in range(g.n):
            if seen[i]:
                continue
            k += 1
            st = [i]
            seen[i] = True
            while st:
                u = st.pop()
                pred[u] = (k << 16) | (k - 1)
                for v in g.ring1(u):
                    if v is not None and not seen[v] and cls[v] == cls[i]:
                        seen[v] = True
                        st.append(v)
        bad = [i for i in range(g.n) if pred[i] != truth[i]]
        tot["maps"] += 1
        tot["plots"] += g.n
        tot["plots_ok"] += g.n - len(bad)
        tot["maps_exact"] += not bad
        print(f"{path[-26:]} areas at the last Recalculate: {g.n - len(bad)}/{g.n}"
              + (f" e.g. {[(i % g.w, i // g.w, ter[i], s.terrain[i]) for i in bad[:6]]}" if bad else ""))
    print(dict(tot))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
