"""B-D-S2: for every tech count T, the interval the multiplier k(T) must lie
in so that every row of a `bds2_policy` record reproduces, under
price = R(base(s) * k), base(s) = max(10, 50 - 5 s), s = turns since the
seat's last civic (a rise in the arm's own civics count), R = the nearest
multiple of 5. Rows with an empty intersection name the law's failure.

    python tools/civ6lab/bds2_intervals.py tools/civ6lab/runs/bds2_policy_<stamp>.jsonl [--s0 p=s,...]
"""
from __future__ import annotations

import argparse
import collections
import json
import sys

sys.path.insert(0, __import__("pathlib").Path(__file__).parent.as_posix())
from bds2_law import rows_of, jumps  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--s0", default="", help="the seat's s at the first read, p=s,... (else searched)")
    a = ap.parse_args(argv)
    rows = [r for r in rows_of(a.path) if r[3] and r[3] > 0]
    jmp = jumps(rows)
    first = min(r[2] for r in rows)
    fixed = {int(k): int(v) for k, v in (x.split("=") for x in a.s0.split(",") if x)}

    def s_of(arm, p, turn, s0):
        js = sorted(x for x in jmp.get((arm, p), set()) if x <= turn)
        return turn - js[-1] if js else s0 + (turn - first)

    seats = sorted({r[1] for r in rows})
    # per seat, the s0 whose rows leave the per-T intervals widest (non-empty)
    chosen = {}
    for p in seats:
        best = None
        for s0 in ([fixed[p]] if p in fixed else range(0, 11)):
            iv = collections.defaultdict(lambda: [0.0, 99.0])
            for arm, q, turn, cost, t, c in rows:
                if q != p:
                    continue
                base = max(10, 50 - 5 * s_of(arm, p, turn, s0))
                lo, hi = (cost - 2.5) / base, (cost + 2.5) / base
                iv[t][0] = max(iv[t][0], lo)
                iv[t][1] = min(iv[t][1], hi)
            bad = sum(1 for v in iv.values() if v[0] > v[1])
            if best is None or bad < best[0]:
                best = (bad, s0)
        chosen[p] = best[1]
    print("s at the first read per seat:", chosen)
    iv = collections.defaultdict(lambda: [0.0, 99.0, []])
    for arm, p, turn, cost, t, c in rows:
        base = max(10, 50 - 5 * s_of(arm, p, turn, chosen[p]))
        lo, hi = (cost - 2.5) / base, (cost + 2.5) / base
        e = iv[t]
        e[0], e[1] = max(e[0], lo), min(e[1], hi)
        e[2].append((p, arm, turn, cost, base, round(lo, 3), round(hi, 3)))
    for t in sorted(iv):
        lo, hi, rs = iv[t]
        flag = "" if lo <= hi else "  EMPTY"
        print(f"T{t}: k in [{lo:.4f}, {hi:.4f}]  ({len(rs)} rows){flag}")
        if lo > hi:
            # the rows that bind the two ends
            los = sorted(rs, key=lambda r: -r[5])[:3]
            his = sorted(rs, key=lambda r: r[6])[:3]
            print("     binding low:", los)
            print("     binding high:", his)
    return 0


if __name__ == "__main__":
    sys.exit(main())
