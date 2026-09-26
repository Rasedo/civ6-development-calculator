"""C-20-S1: how many sweep rows each single change to the fitted efficiency
rule breaks — the discriminating power behind each term.

    python tools/civ6lab/trade_eff_alt.py tools/civ6lab/runs/trade_sweep_X.jsonl
"""
from __future__ import annotations

import math
import sys

from trade_eff_fit import counts, load


def pred(r, a=2, b=2, c=0, e=15, ends="noorigin", tp_rule="path_foreign", sw_once=0, cap=1.0, q=256):
    w, rl, sw, pt, tp = counts(r, ends, "each", tp_rule)
    mixed = 1 if (w > 0 and w < len(r["tok"])) else 0
    score = a * w + b * rl + c * sw + e * pt + sw_once * mixed
    x = score / r["n"]
    if q:
        x = math.floor(q * x + 1e-9) / q
    return r["D"] * min(cap, x) + tp


def main() -> int:
    rows = [r for r in load(sys.argv[1:]) if r["D"] > 0 or r["P"] > 0]
    base = sum(1 for r in rows if abs(pred(r) - r["P"]) < 1e-6)
    print(f"fitted rule: {base}/{len(rows)}")
    alts = {
        "water 1 per plot": dict(a=1),
        "water 0": dict(a=0),
        "rail 0": dict(b=0),
        "portal 0": dict(e=0),
        "portal 30": dict(e=30),
        "switch 15 each": dict(c=15),
        "switch 15 once per mixed route": dict(sw_once=15),
        "endpoints both counted": dict(ends="all"),
        "endpoints both excluded": dict(ends="mid"),
        "no trading posts": dict(tp_rule="none"),
        "posts in own cities too": dict(tp_rule="path"),
        "posts but not the destination": dict(tp_rule="between_foreign"),
        "no 1/256 floor": dict(q=0),
        "1/128 floor": dict(q=128),
    }
    for name, kw in alts.items():
        broke = sum(1 for r in rows if abs(pred(r, **kw) - r["P"]) >= 1e-6)
        print(f"  {name:36s} breaks {broke} rows")
    # rows where each term is non-zero and the ratio is not saturated
    uns = [r for r in rows if pred(r, cap=99) - counts(r, 'noorigin', 'each', 'path_foreign')[4] < r["D"] - 1e-9]
    print(f"unsaturated rows: {len(uns)}; with water {sum(1 for r in uns if counts(r,'noorigin','each','none')[0])}"
          f", rail {sum(1 for r in uns if counts(r,'noorigin','each','none')[1])}"
          f", portal {sum(1 for r in uns if counts(r,'noorigin','each','none')[3])}"
          f", land<->water switch {sum(1 for r in uns if counts(r,'noorigin','each','none')[2])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
