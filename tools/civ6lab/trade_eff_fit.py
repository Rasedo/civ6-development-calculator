"""C-20-S1: fit the route's transportation efficiency against the sweep
(`trade_sweep.lua` records): path gold P against the destination-district
gold D and the path's plot tokens. A candidate predicts
    P = D * min(1, floor(256 * score / n) / 256) + trading posts
    score = a*water + b*rail + c*switches + e*portal
where each count follows a stated rule (endpoints in or out, what a switch
is, which trading posts count). A candidate survives a row when the
prediction is within 1e-6 of the game's number. Prints the best candidates'
hit counts and the first misses of the best.

    python tools/civ6lab/trade_eff_fit.py tools/civ6lab/runs/trade_sweep_X.jsonl
"""
from __future__ import annotations

import itertools
import json
import math
import re
import sys


def load(paths: list[str]) -> list[dict]:
    rows = []
    for p in paths:
        for line in open(p, encoding="utf-8"):
            if line.startswith("{"):
                r = json.loads(line)
                if r.get("kind") == "tradesweep" and isinstance(r.get("D"), (int, float)):
                    r["tok"] = r["s"].split()
                    rows.append(r)
    return rows


def counts(r: dict, ends: str, sw_rule: str, tp_rule: str) -> tuple[int, int, int, int, int]:
    tok = r["tok"]
    idx = range(len(tok))
    if ends == "mid":
        idx = range(1, len(tok) - 1)
    elif ends == "noorigin":
        idx = range(1, len(tok))
    water = sum(1 for i in idx if tok[i].startswith("w"))
    rail = sum(1 for i in idx if tok[i][1:2] == "r")
    # a switch is a change of domain between consecutive plots; a portal hop
    # (an entrance followed by its exit) is not a step on the ground
    dom = ["w" if t.startswith("w") else "l" for t in tok]
    sw = sum(1 for i in range(1, len(tok)) if dom[i] != dom[i - 1])
    if sw_rule == "pairs":
        sw = (sw + 1) // 2
    portal = sum(1 for t in tok if "P" in t)
    me = int(r["o"].split(":")[0])

    def post(t: str, foreign_only: bool) -> bool:
        m = re.search(r"C(\d+)(t?)", t)
        if not m or not m.group(2):
            return False
        return not foreign_only or int(m.group(1)) != me
    if tp_rule == "path":        # every city on the path but the origin, destination included
        tp = sum(1 for t in tok[1:] if post(t, False))
    elif tp_rule == "path_foreign":
        tp = sum(1 for t in tok[1:] if post(t, True))
    elif tp_rule == "between_foreign":   # foreign cities strictly between origin and destination
        tp = sum(1 for t in tok[1:-1] if post(t, True))
    elif tp_rule == "between":
        tp = sum(1 for t in tok[1:-1] if post(t, False))
    else:
        tp = 0
    return water, rail, sw, portal, tp


def predict(r, a, b, c, e, ends, sw_rule, tp_rule, cap_first):
    w, rl, sw, pt, tp = counts(r, ends, sw_rule, tp_rule)
    score = a * w + b * rl + c * sw + e * pt
    x = math.floor(256 * score / r["n"] + 1e-9) / 256
    return r["D"] * min(1.0, x) + tp


def main() -> int:
    rows = [r for r in load(sys.argv[1:]) if r["D"] > 0 or r["P"] > 0]
    print(f"{len(rows)} rows (D or P > 0)")
    res = []
    for a, b, c, e in itertools.product((1, 2), (2,), (0, 15), (0, 15)):
        for ends in ("all", "mid", "noorigin"):
            for sw_rule in ("each", "pairs"):
                for tp_rule in ("none", "path", "path_foreign", "between", "between_foreign"):
                    hit = sum(1 for r in rows if abs(predict(r, a, b, c, e, ends, sw_rule, tp_rule, True) - r["P"]) < 1e-6)
                    res.append((hit, a, b, c, e, ends, sw_rule, tp_rule))
    res.sort(reverse=True)
    for h in res[:10]:
        print(f"hits {h[0]}/{len(rows)}  water={h[1]} rail={h[2]} switch={h[3]} portal={h[4]} ends={h[5]} sw={h[6]} tp={h[7]}")
    h = res[0]
    miss = [r for r in rows if abs(predict(r, *h[1:], True) - r["P"]) >= 1e-6]
    print(f"{len(miss)} misses of the best; first 25:")
    for r in miss[:25]:
        w, rl, sw, pt, tp = counts(r, h[5], h[6], h[7])
        print(f"MISS {r['o']}->{r['d']} n={r['n']} w={w} r={rl} sw={sw} pt={pt} tp={tp} D={r['D']} P={r['P']}"
              f" pred={predict(r, *h[1:], True):.6f} | {r['s']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
