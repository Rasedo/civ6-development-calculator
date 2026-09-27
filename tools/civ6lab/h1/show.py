"""H-1: print a report's distinct failures, per check, the clean ones (no
importer gap on the subject) first.

    python tools/civ6lab/h1/show.py tools/civ6lab/runs/h1_x.report.json [--check city.yields] [--n 5] [--gapped]
"""
from __future__ import annotations

import argparse
import collections
import json


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("report")
    p.add_argument("--check", help="only this check")
    p.add_argument("--n", type=int, default=4, help="failures shown per check")
    p.add_argument("--gapped", action="store_true", help="show the gap-tainted failures too")
    a = p.parse_args()
    r = json.load(open(a.report, encoding="utf-8"))
    by = collections.defaultdict(list)
    for f in r["failures"]:
        if a.check and f["check"] != a.check:
            continue
        if f.get("gaps") and not a.gapped:
            continue
        by[f["check"]].append(f)
    for k, v in sorted(by.items()):
        v.sort(key=lambda f: -f["count"])
        print(f"== {k}: {len(v)} distinct, {sum(f['count'] for f in v)} rows")
        for f in v[: a.n]:
            print(f"   {f['subject']} t{f['firstTurn']}-{f['lastTurn']} x{f['count']} game {json.dumps(f['game'])[:140]}"
                  f" ours {json.dumps(f['ours'])[:140]} gaps {f.get('gaps')}")
            if f.get("state"):
                print(f"      state {json.dumps(f['state'])[:400]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
