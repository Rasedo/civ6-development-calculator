"""B-D-S4: the price's fall. From the (T, s) price table of the grant ladders
(one price per tech count T and turns-since-civic s, identical across seats),
score fall laws with a free multiplier k per T and ONE global parameter:

  lin_d   P = R5(k * (50 - d s))            d the per-turn drop of the base
  add_c   P = R5(k * (50 - 5 s) + c)        c an additive term
  geo_q   P = R5(k * 50 * q^s)              a geometric fall

    python tools/civ6lab/bds4_fall.py
"""
from __future__ import annotations

import collections
import glob
import math
import pathlib
import sys

sys.path.insert(0, pathlib.Path(__file__).parent.as_posix())
from bds3_fit import ladders  # noqa: E402
from bds4_kt import s_of, RUNS  # noqa: E402


def r5(v):
    return int(math.floor(v / 5 + 0.5 + 1e-9)) * 5


def table():
    m = collections.defaultdict(dict)
    for path in sorted(glob.glob(str(RUNS / "bds3_ladder_*.jsonl"))):
        for (_, d, turn, p), seq in ladders([path]).items():
            if d != 1:
                continue
            s = s_of(p, turn)
            for t, cost, c, tech in seq:
                if cost > 0:
                    m[t].setdefault(s, set()).add(cost)
    return m


def score(m, law, par):
    ks = [3.5 + i * 0.0005 for i in range(11001)]
    fit = total = 0
    for t, row in m.items():
        cells = [(s, c) for s, v in row.items() for c in v]
        total += len(cells)
        fit += max(sum(1 for s, c in cells if law(k, s, par) == c) for k in ks)
    return fit, total


LAWS = {
    "lin_d": (lambda k, s, d: r5(k * max(10, 50 - d * s)), [4.8 + i * 0.01 for i in range(31)]),
    "add_c": (lambda k, s, c: r5(k * max(10, 50 - 5 * s) + c), [i * 0.25 for i in range(-8, 25)]),
    "geo_q": (lambda k, s, q: r5(k * 50 * q ** s), [0.88 + i * 0.002 for i in range(20)]),
}


def main() -> int:
    m = table()
    for name, (law, grid) in LAWS.items():
        res = sorted(((*score(m, law, g), g) for g in grid), reverse=True)[:3]
        print(name, [(f, t, round(g, 4)) for f, t, g in res])
    return 0


if __name__ == "__main__":
    sys.exit(main())
