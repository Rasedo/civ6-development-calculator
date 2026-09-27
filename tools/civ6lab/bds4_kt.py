"""B-D-S4: the tech multiplier kT(T) as an interval per tech count, from every
grant ladder (`bds3_ladder` records, direction +1) at every turn, under
price = R5(base(s) * kT), base(s) = max(10, 50 - 5 s), with s per seat and
turn read off the control's civic completions in
runs/bds2_policy_20260926T102446Z.jsonl. An empty interval kills the
reading; the widths show how tightly each count is pinned.

    python tools/civ6lab/bds4_kt.py
"""
from __future__ import annotations

import collections
import glob
import pathlib
import sys

sys.path.insert(0, pathlib.Path(__file__).parent.as_posix())
from bds3_fit import ladders  # noqa: E402

RUNS = pathlib.Path(__file__).parent / "runs"
# the turn each seat last completed a civic, per turn read (control, lab4_t150)
LAST_CIVIC = {1: [149, 156], 2: [149], 3: [148, 152, 157], 4: [145, 152, 156], 5: [150, 154],
              6: [151], 7: [146, 152, 153, 154]}


def s_of(p: int, turn: int) -> int:
    return turn - max(x for x in LAST_CIVIC[p] if x <= turn)


def main() -> int:
    iv = collections.defaultdict(lambda: [0.0, 99.0, []])
    for path in sorted(glob.glob(str(RUNS / "bds3_ladder_*.jsonl"))):
        for (_, d, turn, p), seq in ladders([path]).items():
            if d != 1:
                continue
            base = max(10, 50 - 5 * s_of(p, turn))
            for t, cost, c, tech in seq:
                if cost <= 0:
                    continue
                lo, hi = (cost - 2.5) / base, (cost + 2.5) / base
                e = iv[t]
                e[0], e[1] = max(e[0], lo), min(e[1], hi)
                e[2].append((turn, p, base, cost))
    for t in sorted(iv):
        lo, hi, rs = iv[t]
        flag = "  EMPTY" if lo > hi else ""
        print(f"T{t}: kT in [{lo:.4f}, {hi:.4f}] from {len(rs)} reads{flag}")
        if lo > hi:
            print("     ", sorted(set(rs)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
