"""B-D-S2: fit the policy-unlock price law to a pair_run `bds2_policy` record.

Model: price = R(base(s) * k), base(s) = max(MIN, MAX - DROP * s) with the
Online row (50 / 5 / 10), s = turns since the seat's last civic completed
(0 on the turn the price jumps), R a rounding to a multiple of 5.
Each row gives an interval for k; a candidate law k(T) (T = techs held)
is scored by how many rows it satisfies.

For every seat the offset s at the first read is searched (0..10) so the
seat's rows are as consistent as possible; a jump (a price rise with no tech
change in the control) resets s to 0.

    python tools/civ6lab/bds2_law.py tools/civ6lab/runs/bds2_policy_<stamp>.jsonl
"""
from __future__ import annotations

import itertools
import json
import math
import sys

MAX, DROP, MIN = 50, 5, 10


def rows_of(path: str):
    recs = [json.loads(l) for l in open(path, encoding="utf-8")]
    out = []  # (arm, p, turn, cost, techs, civics)
    for i, r in enumerate(recs):
        arm = r["arm"] if r["arm"] != "control" else f"control{i}"
        # the pre read's tech count is stale after a grant (HasTech lags one
        # tuner call): take the arm's grant record instead
        granted = {}
        for js in (r.get("gc") or {}).get("json", []):
            if js.get("kind") == "grant":
                granted[js["p"]] = js["techs"]
        seq = [(r["pre"][0]["json"], True)] + [(e["reads"][0]["json"], False) for e in r["each"]]
        for js, pre in seq:
            for x in js:
                t = x["techs"]
                if pre and x["p"] in granted:
                    t = granted[x["p"]]
                out.append((arm, x["p"], x["turn"], x["cost"], t, x["civics"]))
    return out


def rnd(v: float, how: str) -> int:
    if how == "half_up":
        return int(math.floor(v / 5 + 0.5)) * 5
    if how == "half_down":
        return int(math.ceil(v / 5 - 0.5)) * 5
    if how == "floor":
        return int(math.floor(v / 5 + 1e-9)) * 5
    if how == "ceil":
        return int(math.ceil(v / 5 - 1e-9)) * 5
    if how == "trunc_then":  # k*base truncated to an integer, then nearest 5
        return int(math.floor(math.floor(v + 1e-9) / 5 + 0.5)) * 5
    raise ValueError(how)


def jumps(rows):
    """Per (arm, seat), the turns a civic completed (the arm's own civics
    count rose since the turn before) — the price's reset."""
    j: dict[tuple, set[int]] = {}
    prev: dict[tuple, tuple] = {}
    for arm, p, turn, cost, t, c in sorted(rows, key=lambda r: (r[0], r[1], r[2])):
        k = (arm, p)
        if k in prev and c > prev[k][5]:
            j.setdefault(k, set()).add(turn)
        prev[k] = (arm, p, turn, cost, t, c)
    return j


def s_of(arm: str, p: int, turn: int, s0: int, jmp: dict[tuple, set[int]], first: int) -> int:
    js = sorted(x for x in jmp.get((arm, p), set()) if x <= turn)
    if js:
        return turn - js[-1]
    return s0 + (turn - first)


def main(path: str) -> int:
    rows = [r for r in rows_of(path) if r[3] and r[3] > 0]
    jmp = jumps(rows)
    first = min(r[2] for r in rows)
    seats = sorted({r[1] for r in rows})
    # candidate laws: k = a + b*T over a grid, each rounding
    best = []
    for how in ("half_up", "half_down", "floor", "ceil", "trunc_then"):
        for a10 in range(0, 40):
            for b100 in range(5, 16):
                a, b = a10 / 10, b100 / 100
                total, ok = 0, 0
                for p in seats:
                    pr = [r for r in rows if r[1] == p]
                    bestp = 0
                    for s0 in range(0, 11):
                        n = 0
                        for arm, _, turn, cost, t, c in pr:
                            base = max(MIN, MAX - DROP * s_of(arm, p, turn, s0, jmp, first))
                            if rnd(base * (a + b * t), how) == cost:
                                n += 1
                        bestp = max(bestp, n)
                    ok += bestp
                    total += len(pr)
                best.append((ok, total, how, a, b))
    best.sort(reverse=True)
    print("k = a + b*T, the best 12 (rows fitting / rows):")
    for ok, total, how, a, b in best[:12]:
        print(f"  {ok}/{total}  {how:10s} a={a:.1f} b={b:.2f}")
    print("jumps:", {f"{k[0]}/p{k[1]}": sorted(v) for k, v in jmp.items()})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
