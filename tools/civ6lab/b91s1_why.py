"""B-91-S1: the refusal texts per (city, worship building) row of a
`b91s1_read.lua` record, with the city's temple, holy site, majority, the
owner's founded religion and the worship buildings it already holds.

    python tools/civ6lab/b91s1_why.py tools/civ6lab/runs/b91s1_<save>_<stamp>.jsonl [--only BUILDING_X]
"""
from __future__ import annotations

import argparse
import json


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--only")
    a = ap.parse_args(argv)
    for line in open(a.path, encoding="utf-8"):
        line = line.strip()
        if not line.startswith("{"):
            continue
        r = json.loads(line)
        if r.get("kind") != "city":
            continue
        held = [w["b"] for w in r["worship"] if w["has"]]
        head = (f"p{r['p']} {r['name'][14:]:16s} maj={r['majority']} founded={r['founded']} civ={r.get('ownerMajority')}"
                f" temple={r['temple']} hs={r['holySite']} held={held} rel={r.get('religions')}")
        print(head)
        for w in r["worship"]:
            if a.only and w["b"] != a.only:
                continue
            if w["has"]:
                continue
            print(f"    {w['b']:24s} canEx={w['canEx']!s:5s} can={w['can']!s:5s} buyEx={w['buyEx']!s:5s} buy={w['buy']!s:5s}"
                  f" why={w.get('canWhy')} buyWhy={w.get('buyWhy')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
