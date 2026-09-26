"""H-3: fit TerrainBuilder.GetRandomNumber streams.

    python tools/civ6lab/h3_fit.py state <draw> <draw> ...     # range-32768 draws in a row -> the LCG state(s)
    python tools/civ6lab/h3_fit.py dist <seed> <state> [--max N]   # steps from seed to state
    python tools/civ6lab/h3_fit.py gen <seed> <range> <n> [--skip K]  # the stream a seed gives

The candidate law is the game's sync LCG (README "The generator"):
    s' = (A s + C) mod 2^32;  draw = ((s' >> 17) * (range & 0xFFFF)) >> 15
with (A, C) tried over the usual constant pairs.
"""
from __future__ import annotations

import argparse
import sys

import numpy as np

M32 = 0xFFFFFFFF
PAIRS = [(1103515245, 12345), (1664525, 1013904223), (214013, 2531011), (22695477, 1),
         (134775813, 1), (69069, 1), (1103515245, 1013904223)]


def step(s: int, a: int = 1103515245, c: int = 12345) -> int:
    return (a * s + c) & M32


def draw(s_after: int, rng: int) -> int:
    return ((s_after >> 17) * (rng & 0xFFFF)) >> 15


def find_state(draws: list[int], a: int, c: int) -> list[int]:
    """states s1 (the state AFTER the first draw) consistent with a run of
    range-32768 draws"""
    hi = draws[0] << 17
    s = np.arange(1 << 17, dtype=np.uint64) + np.uint64(hi)
    cand = s.copy()
    for d in draws[1:]:
        cand = (np.uint64(a) * cand + np.uint64(c)) & np.uint64(M32)
        keep = (cand >> np.uint64(17)) == np.uint64(d)
        s, cand = s[keep], cand[keep]
        if len(s) == 0:
            break
    return [int(x) for x in s]


def affine_pow(a: int, c: int, n: int) -> tuple[int, int]:
    """(A_n, C_n) with step^n(s) = A_n s + C_n mod 2^32"""
    A, C = 1, 0
    ba, bc = a, c
    while n:
        if n & 1:
            A, C = (ba * A) & M32, (ba * C + bc) & M32
        ba, bc = (ba * ba) & M32, (ba * bc + bc) & M32
        n >>= 1
    return A, C


def distance(seed: int, target: int, a: int, c: int, maxn: int) -> int | None:
    B = 1 << 20
    An = np.empty(B, dtype=np.uint64)
    Cn = np.empty(B, dtype=np.uint64)
    A, C = 1, 0
    for i in range(B):
        An[i], Cn[i] = A, C
        A, C = (a * A) & M32, (a * C + c) & M32
    AB, CB = A, C
    s = seed & M32
    base = 0
    while base < maxn:
        st = (An * np.uint64(s) + Cn) & np.uint64(M32)
        hit = np.nonzero(st == np.uint64(target))[0]
        if len(hit):
            return base + int(hit[0])
        s = (AB * s + CB) & M32
        base += B
    return None


def main() -> int:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("state")
    q.add_argument("draws", nargs="+", type=int)
    q = sub.add_parser("dist")
    q.add_argument("seed", type=int)
    q.add_argument("state", type=int)
    q.add_argument("--max", type=int, default=1 << 32)
    q = sub.add_parser("gen")
    q.add_argument("seed", type=int)
    q.add_argument("range", type=int)
    q.add_argument("n", type=int)
    q.add_argument("--skip", type=int, default=0)
    a = p.parse_args()
    if a.cmd == "state":
        for A, C in PAIRS:
            st = find_state(a.draws, A, C)
            print(f"A={A} C={C}: {len(st)} states {st[:4]}")
    elif a.cmd == "dist":
        print(distance(a.seed, a.state, 1103515245, 12345, a.max))
    elif a.cmd == "gen":
        s = a.seed & M32
        for _ in range(a.skip):
            s = step(s)
        out = []
        for _ in range(a.n):
            s = step(s)
            out.append(draw(s, a.range))
        print(" ".join(map(str, out)), "| state", s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
