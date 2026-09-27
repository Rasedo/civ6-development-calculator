"""B-D-S4: fit the policy price's two multipliers from the s = 0 reads.

The price at the top of its fall (the turn a civic completed, base 50) is
50 x max(kT(T), kC(C)) rounded to 5: removing techs lowers it only down to a
floor that removing civics then lowers (`bds4_probe` records), and the
grant ladders (`bds3_ladder` records, direction +1) give kT alone. This
collects every s = 0 read as (T, C, price), prints each term's table (the
multiplier a price pins, price / 50), and scores linear laws kX = a + b X.

    python tools/civ6lab/bds4_fit.py
"""
from __future__ import annotations

import collections
import glob
import json
import math
import pathlib
import sys

sys.path.insert(0, pathlib.Path(__file__).parent.as_posix())
from bds3_fit import ladders  # noqa: E402

RUNS = pathlib.Path(__file__).parent / "runs"
# turn -> the seats whose civic completed that turn (s = 0), read off the
# control reads of runs/bds2_policy_20260926T102446Z.jsonl
TOP = {152: {3, 4, 7}, 154: {5, 7}, 156: {1, 4}}


def r5(v):
    return int(math.floor(v / 5 + 0.5 + 1e-9)) * 5


def rows():
    out = []  # (T, C, price, source)
    for path in sorted(glob.glob(str(RUNS / "bds3_ladder_*.jsonl"))):
        for (_, d, turn, p), seq in ladders([path]).items():
            if p in TOP.get(turn, set()) and d == 1:
                for t, cost, c, tech in seq:
                    out.append((t, c, cost, f"ladder t{turn} p{p}"))
    for path in sorted(glob.glob(str(RUNS / "bds4_probe_*.jsonl"))):
        recs = [json.loads(l) for l in open(path, encoding="utf-8")]
        turn = recs[0]["turn"]
        steps = [r for r in recs if r["kind"] in ("step", "final")]
        # a step prints the counts BEFORE it: the price after step i goes
        # with the counts step i+1 printed
        for a, b in zip(steps, steps[1:]):
            after = {s["p"]: (s["T"], s["C"]) for s in b["step"]}
            for x in a["price"]:
                if x["p"] in TOP.get(turn, set()) and x["p"] in after:
                    out.append((after[x["p"]][0], after[x["p"]][1], x["cost"], f"probe t{turn} p{x['p']} {a['phase']}"))
    return out


def main() -> int:
    data = rows()
    print(len(data), "s=0 rows")
    kt = collections.defaultdict(set)
    for t, c, price, src in data:
        if src.startswith("ladder"):
            kt[t].add(price)
    print("tech term (grant ladders), T: price:", " ".join(f"{t}:{'/'.join(map(str, sorted(v)))}" for t, v in sorted(kt.items())))
    best = []
    for aT in [x / 100 for x in range(0, 250)]:
        for bT in [x / 10000 for x in range(1000, 1300, 5)]:
            n = sum(1 for t, v in kt.items() for price in v if r5(50 * (aT + bT * t)) == price)
            best.append((n, aT, bT))
    best.sort(reverse=True)
    print("  linear kT, cells fit / cells:", sum(len(v) for v in kt.values()), best[:4])
    # the civic term: probe rows whose price the tech term cannot reach
    aT, bT = best[0][1], best[0][2]
    kc = collections.defaultdict(set)
    for t, c, price, src in data:
        if src.startswith("probe") and r5(50 * (aT + bT * t)) < price:
            kc[c].add(price)
    print("civic term (probe rows above the tech term), C: price:", " ".join(f"{c}:{'/'.join(map(str, sorted(v)))}" for c, v in sorted(kc.items())))
    bestc = []
    for aC in [x / 100 for x in range(0, 250)]:
        for bC in [x / 10000 for x in range(1000, 2000, 5)]:
            n = sum(1 for c, v in kc.items() for price in v if r5(50 * (aC + bC * c)) == price)
            bestc.append((n, aC, bC))
    bestc.sort(reverse=True)
    print("  linear kC, cells fit / cells:", sum(len(v) for v in kc.values()), bestc[:4])
    aC, bC = bestc[0][1], bestc[0][2]
    ok = sum(1 for t, c, price, _ in data if r5(50 * max(aT + bT * t, aC + bC * c)) == price)
    print(f"max law on every s=0 row: {ok}/{len(data)}")
    for t, c, price, src in data:
        pred = r5(50 * max(aT + bT * t, aC + bC * c))
        if pred != price:
            print("   miss", src, "T", t, "C", c, "price", price, "pred", pred)
    return 0


if __name__ == "__main__":
    sys.exit(main())
