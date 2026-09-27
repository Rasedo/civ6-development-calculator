"""Seeds whose k-th draw (1-based) on range R falls in [lo, hi].

    python tools/civ6lab/c1d_seeds.py --k 4 --range 100 --lo 80 --hi 99 --n 4 --start 2000
"""
import argparse

M, A, C = 1 << 32, 1103515245, 12345


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--k", type=int, required=True)
    p.add_argument("--range", type=int, default=100)
    p.add_argument("--lo", type=int, required=True)
    p.add_argument("--hi", type=int, required=True)
    p.add_argument("--n", type=int, default=4)
    p.add_argument("--start", type=int, default=2000)
    a = p.parse_args()
    out, s0 = [], a.start
    while len(out) < a.n:
        s = s0
        for _ in range(a.k):
            s = (A * s + C) % M
        v = ((s >> 17) * a.range) >> 15
        if a.lo <= v <= a.hi:
            out.append(s0)
        s0 += 1
    print(" ".join(map(str, out)))


if __name__ == "__main__":
    main()
