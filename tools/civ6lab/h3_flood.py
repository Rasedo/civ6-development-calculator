"""H-3: GenerateFloodplains' data laid out per river: the RiverManager plot
list (post-game), each plot's terrain, feature before (flood diff) and after,
and the river's setters (id, flow) from LOG.

    python tools/civ6lab/h3_flood.py runs/h3_session_<stamp>.jsonl
"""
from __future__ import annotations

import collections
import re
import sys

from h3_x import Session

SETTER = re.compile(r"<TerrainBuilder\.Set(W|NW|NE)OfRiver\(@(\d+),(\d+),(\w+),(-?\d+),(-?\d+)\)")
TN = {0: "grass", 1: "grassH", 2: "grassM", 3: "plains", 4: "plainsH", 5: "plainsM", 6: "desert", 7: "desertH",
      8: "desertM", 9: "tundra", 10: "tundraH", 11: "tundraM", 12: "snow", 13: "snowH", 14: "snowM", 15: "coast",
      16: "ocean"}


def main() -> int:
    s = Session(sys.argv[1])
    flood = {}
    fe = s.x1("flood")
    if fe and fe[1]:
        for part in fe[1].split(","):
            i, _, ch = part.partition(":")
            b, _, a = ch.partition(">")
            flood[int(i)] = (int(b), int(a))
    setters = collections.defaultdict(list)
    for e in s.log:
        m = SETTER.match(e)
        if m:
            setters[int(m.group(6))].append((m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(5))))
    fp_river = {}
    for ln in s.postgen("FP"):
        _, i, r = ln.split()
        fp_river[int(i)] = r.split("=")[1]
    print("flood diff:", len(flood), "plots; FP owners:", collections.Counter(fp_river.values()))
    for ln in s.postgen("RIVER"):
        m = re.match(r"RIVER (\d+) id=(-?\d+) type=(-?\d+) keys=.* plots=(.*)$", ln)
        idx, rid, typ, plots = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
        pl = [int(v) for v in plots.split(",") if v]
        segs = setters.get(rid, [])
        print(f"river index {idx} id {rid} type {typ}: {len(pl)} plots, {len(segs)} edges; first edge {segs[:1]} last {segs[-1:]}")
        row = []
        for p in pl:
            t = TN.get(s.terrain[p], s.terrain[p])
            mark = ""
            if p in flood:
                mark = f"*FP{flood[p][1]}"
            if p in fp_river:
                mark += f"(r{fp_river[p]})"
            row.append(f"{s.g.xy(p)}{t}{'/f' + str(s.feature[p]) if s.feature[p] != -1 and p not in flood else ''}{mark}")
        print("    " + "  ".join(row))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
