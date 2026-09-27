"""B-D-S2: score structural price laws against a `bds2_policy` record, each
with a FREE multiplier k per tech count T (grid-searched), so a law is judged
by its shape alone: how many rows the best k per T reproduces.

    python tools/civ6lab/bds2_models.py tools/civ6lab/runs/bds2_policy_<stamp>.jsonl
"""
from __future__ import annotations

import collections
import math
import sys

sys.path.insert(0, __import__("pathlib").Path(__file__).parent.as_posix())
from bds2_law import rows_of, jumps  # noqa: E402


def r5(v):
    return int(math.floor(v / 5 + 0.5 + 1e-9)) * 5


def f5(v):
    return int(math.floor(v / 5 + 1e-9)) * 5


def c5(v):
    return int(math.ceil(v / 5 - 1e-9)) * 5


def ri(v):
    return int(math.floor(v + 0.5 + 1e-9))


MODELS = {
    "r5(k*max(10,50-5s))": lambda k, s: r5(k * max(10, 50 - 5 * s)),
    "f5(k*max(10,50-5s))": lambda k, s: f5(k * max(10, 50 - 5 * s)),
    "c5(k*max(10,50-5s))": lambda k, s: c5(k * max(10, 50 - 5 * s)),
    "max(r5(10k), r5(50k)-s*r5(5k))": lambda k, s: max(r5(10 * k), r5(50 * k) - s * r5(5 * k)),
    "max(r5(10k), r5(50k-s*ri(5k)))": lambda k, s: max(r5(10 * k), r5(50 * k - s * ri(5 * k))),
    "max(r5(10k), r5(ri(50k)-s*ri(5k)))": lambda k, s: max(r5(10 * k), r5(ri(50 * k) - s * ri(5 * k))),
    "r5(max(10k, 50k - s*5k)) int k*10": lambda k, s: r5(max(10 * k, 50 * k - s * 5 * k)),
    "r5(k*(50-5s)) floor 10k, k 1/10": lambda k, s: r5(round(k, 1) * max(10, 50 - 5 * s)),
}


def main(path: str) -> int:
    rows = [r for r in rows_of(path) if r[3] and r[3] > 0]
    jmp = jumps(rows)
    first = min(r[2] for r in rows)
    seats = sorted({r[1] for r in rows})
    grid = [4.0 + i * 0.0025 for i in range(1401)]
    for name, law in MODELS.items():
        # per seat s0 searched jointly is costly; take the s0 that the
        # r5 law likes (the intervals script's pick) for every model
        best_total = 0
        s0s = {}
        for p in seats:
            bp = (-1, 0)
            for s0 in range(0, 11):
                by_t = collections.defaultdict(list)
                for arm, q, turn, cost, t, c in rows:
                    if q != p:
                        continue
                    js = sorted(x for x in jmp.get((arm, p), set()) if x <= turn)
                    s = turn - js[-1] if js else s0 + (turn - first)
                    by_t[t].append((s, cost))
                n = sum(max(sum(1 for s, cost in v if law(k, s) == cost) for k in grid) for v in by_t.values())
                if n > bp[0]:
                    bp = (n, s0)
            s0s[p] = bp[1]
            best_total += bp[0]
        print(f"{best_total:4d}/{len(rows)}  {name}   s0={s0s}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
