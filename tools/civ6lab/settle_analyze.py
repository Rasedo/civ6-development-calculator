"""civ6lab settle_analyze — ask 18 from a `settle_watch.lua` log: for every
city a seat FOUNDS (a new city id whose original owner is the founder) while
it holds a Don't-Settle-Near-Me promise to another seat, print the distance
from the new city to the promisee's nearest city, whether the promise is
still standing --after turns later, and how the promisee's grievances
against the founder moved over that window. A broken promise shows as the
promise gone and a grievance jump; the distances of kept and broken ones
bracket the reach. The game's grievance log entries of the promisee against
the founder in that window follow each line, each entry once.

    python tools/civ6lab/settle_analyze.py tools/civ6lab/runs/settle_watch_*.jsonl
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict

from rebel_analyze import hexdist


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("logs", nargs="+")
    p.add_argument("--after", type=int, default=2)
    a = p.parse_args(argv)
    for path in a.logs:
        promises = defaultdict(set)      # turn -> {(a, b)}
        griev = defaultdict(dict)        # turn -> {(a, b): g}
        cities = defaultdict(dict)       # turn -> {(p, id): row}
        glog = defaultdict(dict)         # (a, b) -> {entry key: entry}, each entry once
        for line in open(path, encoding="utf-8"):
            if not line.startswith("{"):
                continue
            r = json.loads(line)
            t = r["turn"]
            if r["kind"] == "promise" and r.get("made", True) is True:
                promises[t].add((r["a"], r["b"]))
            elif r["kind"] == "grievance":
                griev[t][(r["a"], r["b"])] = r["g"]
            elif r["kind"] == "grievlog" and "entry" in r:
                e = r["entry"]
                glog[(r["a"], r["b"])][json.dumps(e, sort_keys=True)] = e
            elif r["kind"] == "city":
                cities[t][(r["p"], r["id"])] = r
        turns = sorted(cities)
        print(f"== {path}: turns {turns[0]}..{turns[-1]}, promise-turns {sum(len(v) for v in promises.values())}")
        for i, t in enumerate(turns[1:], 1):
            prev = turns[i - 1]
            for key, c in cities[t].items():
                if key in cities[prev] or c["orig"] != c["p"]:
                    continue
                founder = c["p"]
                for (pa, pb) in sorted(promises[prev]):
                    if pa != founder:
                        continue
                    theirs = [x for x in cities[t].values() if x["p"] == pb]
                    d = min((hexdist((c["x"], c["y"]), (x["x"], x["y"])) for x in theirs), default=-1)
                    later = min((u for u in turns if u >= t + a.after), default=turns[-1])
                    kept = (pa, pb) in promises[later]
                    g0 = griev[prev].get((pb, pa), 0)
                    g1 = griev[later].get((pb, pa), 0)
                    print(f"  t{t} p{founder} founds at {c['x']}:{c['y']}, promised to p{pb}: nearest p{pb} "
                          f"city {d} away; promise {'KEPT' if kept else 'GONE'} at t{later}; "
                          f"p{pb}'s grievances vs p{founder} {g0} -> {g1}")
                    for e in glog[(pb, pa)].values():
                        if isinstance(e.get("Turn"), int) and prev <= e["Turn"] <= later:
                            print(f"      log t{e['Turn']}: {e.get('Amount')} {e.get('Description')}"
                                  f" (initiator p{e.get('Initiator')}, target p{e.get('Target')})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
