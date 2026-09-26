"""civ6lab c60s3_fit — C-60-S3 from `c60s3_run.py` records: for each turn a
Free Cities unit first appears (a grant), the plot it stands on, its distance
from the city, and the rig's state around it — every plot within the rig's
rings, whether a unit stood there at the read before the grant (after any
re-rig) and at the read after it (a plot held at both was held when the
grant landed), and the nearest plot to the city that was free at both reads.

    python tools/civ6lab/c60s3_fit.py tools/civ6lab/runs/c60s3_r*.jsonl
"""
from __future__ import annotations

import argparse
import collections
import json
import sys


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("logs", nargs="+")
    a = p.parse_args(argv)
    for path in a.logs:
        rows = [json.loads(ln) for ln in open(path, encoding="utf-8")]
        rings = rows[0].get("rings", 0)
        occ = collections.defaultdict(dict)      # turn -> {(x, y): [owner:type]}
        ringof = {}
        rigged = collections.defaultdict(set)    # turn -> plots the rig filled or held
        p62 = collections.defaultdict(dict)      # turn -> {id: row}
        for r in rows:
            k = r.get("kind")
            if k == "ring":
                occ[r["turn"]].setdefault((r["x"], r["y"]), []).append(f"{r['owner']}:{r['type'][5:]}")
                ringof[(r["x"], r["y"])] = r["ring"]
            elif k == "rig":
                ringof[(r["x"], r["y"])] = r["ring"]
                if r["made"] != "none":
                    rigged[r["turn"]].add((r["x"], r["y"]))
            elif k == "p62":
                p62[r["turn"]][r["id"]] = r
        turns = sorted(p62.keys() | occ.keys())
        print(f"== {path} rings {rings}")
        seen: set[int] = set()
        for i, t in enumerate(turns):
            for uid, u in p62[t].items():
                if uid in seen:
                    continue
                seen.add(uid)
                prev = turns[i - 1] if i else t
                held = {xy for xy in ringof if xy in occ[prev] or xy in rigged[prev]}
                after = {xy for xy in ringof if xy in occ[t]}
                free = sorted((ringof[xy], xy) for xy in ringof if xy not in held and xy not in after)
                print(f"  t{t} grant {u['type']} id {uid} at {u['x']}:{u['y']} dist {u['dist']} damage {u['damage']}")
                for r in range(1, max(ringof.values(), default=0) + 1):
                    plots = sorted(xy for xy in ringof if ringof[xy] == r)
                    marks = " ".join(f"{x}:{y}={'H' if (x, y) in held and (x, y) in after else ('h' if (x, y) in held else ('a' if (x, y) in after else '.'))}"
                                     for x, y in plots)
                    print(f"      ring {r}: {marks}")
                print(f"      nearest plot free at both reads: {free[0] if free else 'none'}")
    print("H = held before and after the grant, h = before only, a = after only, . = free")
    return 0


if __name__ == "__main__":
    sys.exit(main())
