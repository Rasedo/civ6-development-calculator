"""Turn order from RandCalls.csv: the sync stream's per-draw reasons, in order.

    python tools/civ6lab/turnorder_randcalls.py <RandCalls.csv> [--segment K] [--turns a-b] [--summary]

The file appends across loads, so it is cut into SEGMENTS wherever the game
turn goes backwards (a reload). Each turn of a segment prints its reasons with
consecutive repeats folded ("reason x N"). `--summary` prints, over every
complete turn of every segment, the order in which each reason FIRST appears
in the turn and the pairwise precedence counts (A before B: how many turns
every A precedes every B).
"""
from __future__ import annotations

import argparse
import collections
import itertools


def read(path: str) -> list[list[tuple[int, int, int, int, str]]]:
    rows = []
    with open(path, encoding="utf-8", errors="replace") as f:
        next(f)
        for line in f:
            parts = [p.strip() for p in line.rstrip("\n").split(",", 5)]
            if len(parts) < 6:
                continue
            try:
                t, r, v, s = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
            except ValueError:
                continue
            rows.append((t, r, v, s, parts[5]))
    segs: list[list] = []
    cur: list = []
    for row in rows:
        if cur and row[0] < cur[-1][0]:
            segs.append(cur)
            cur = []
        cur.append(row)
    if cur:
        segs.append(cur)
    return segs


def by_turn(seg):
    out = collections.OrderedDict()
    for row in seg:
        out.setdefault(row[0], []).append(row)
    return out


def fold(rows):
    out = []
    for reason, grp in itertools.groupby(rows, key=lambda r: r[4]):
        n = len(list(grp))
        out.append(f"{reason} x{n}" if n > 1 else reason)
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("path")
    p.add_argument("--segment", type=int, default=-1)
    p.add_argument("--turns", default="")
    p.add_argument("--summary", action="store_true")
    a = p.parse_args()
    segs = read(a.path)
    print(f"segments {len(segs)}: " + ", ".join(f"[{s[0][0]}..{s[-1][0]}]" for s in segs))
    if a.summary:
        prec = collections.Counter()
        seen = collections.Counter()
        for seg in segs:
            turns = by_turn(seg)
            keys = list(turns)
            for t in keys[1:-1]:  # a segment's first and last turns may be partial
                rs = [r[4] for r in turns[t]]
                first = {}
                last = {}
                for i, x in enumerate(rs):
                    first.setdefault(x, i)
                    last[x] = i
                for x in first:
                    seen[x] += 1
                for x, y in itertools.permutations(first, 2):
                    if last[x] < first[y]:
                        prec[(x, y)] += 1
        names = sorted(seen, key=lambda x: -seen[x])
        for x in names:
            print(f"{seen[x]:5d} {x}")
        print("--- strictly-before counts (A all before B) / turns both present")
        for x, y in itertools.permutations(names, 2):
            both = 0
            for seg in segs:
                turns = by_turn(seg)
                for t in list(turns)[1:-1]:
                    rs = {r[4] for r in turns[t]}
                    if x in rs and y in rs:
                        both += 1
            if both and prec[(x, y)] == both and prec[(y, x)] == 0:
                print(f"  ALWAYS {x!r} < {y!r}  ({both})")
        return
    seg = segs[a.segment]
    turns = by_turn(seg)
    lo, hi = -1, 10**9
    if a.turns:
        lo, hi = (int(x) for x in a.turns.split("-"))
    for t, rows in turns.items():
        if not lo <= t <= hi:
            continue
        print(f"== turn {t} ({len(rows)} draws)")
        for s in fold(rows):
            print("   " + s)


if __name__ == "__main__":
    main()
