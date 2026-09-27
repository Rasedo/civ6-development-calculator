"""H-3: GenerateFloodplains against a run model. Each river's plots (the
RiverManager plot list, post-game, source first) are scanned from the mouth
(the list's end) upstream; eligible = flat (not hills, not mountain) desert,
plains or grassland without a feature before the call; the first maximal run
of consecutive eligible plots of length >= MIN (4) becomes floodplain, capped
at MAX (10) plots nearest the mouth. The prediction is compared with the
flood diff (features the call added).

    python tools/civ6lab/h3_floodfit.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import re
import sys

from h3_x import Session

FLAT = {0, 3, 6}


def main() -> int:
    for path in sys.argv[1:]:
        s = Session(path)
        flood = {}
        fe = s.x1("flood")
        if fe and fe[1]:
            for part in fe[1].split(","):
                i, _, ch = part.partition(":")
                b, _, a = ch.partition(">")
                flood[int(i)] = (int(b), int(a))
        pred = set()
        for ln in s.postgen("RIVER"):
            m = re.match(r"RIVER (\d+) id=(-?\d+) type=(-?\d+) keys=.* plots=(.*)$", ln)
            pl = [int(v) for v in m.group(4).split(",") if v]
            before_feature = {p: (flood[p][0] if p in flood else s.feature[p]) for p in pl}
            elig = [s.terrain[p] in FLAT and before_feature[p] == -1 for p in pl]
            k = len(pl) - 1
            while k >= 0:
                if not elig[k]:
                    k -= 1
                    continue
                j = k
                while j >= 0 and elig[j]:
                    j -= 1
                run = pl[j + 1:k + 1]
                if len(run) >= 4:
                    pred |= set(run[-10:])
                    break
                k = j
        got = set(flood)
        print(f"{path[-30:]} floodplain plots game {len(got)} model {len(pred)} both {len(got & pred)} "
              f"game-only {sorted(s.g.xy(i) for i in got - pred)[:10]} model-only {sorted(s.g.xy(i) for i in pred - got)[:10]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
