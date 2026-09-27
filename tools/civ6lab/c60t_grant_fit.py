"""C-60, the grant's order among free plots at one distance. Tests candidate
search orders against the placements read by `c60t_grant_run.py` (the
`PLACED` events, lab4_t250, Ngaruawahia at 69:21, odd-r offset map 84 wide):
each observation is (plots held or otherwise unusable, the plot the grant
was placed on). A candidate order must pick the observed plot as the first
usable plot at the smallest distance.

    python tools/civ6lab/c60t_grant_fit.py
"""
from __future__ import annotations

import itertools

W = 84
C = (69, 21)
# land plots with no district, no mountain (free_tiles.lua at t250)
USABLE = {(69, 20), (68, 19), (69, 19), (68, 20), (67, 19), (67, 20), (68, 18), (69, 18), (67, 22), (67, 23)}
OBS = [  # (held, placed) — held includes plots another unit stood on at the grant
    (set(), (69, 20)),
    ({(69, 20)}, (68, 19)),
    ({(69, 20), (68, 19), (69, 19), (68, 20)}, (67, 19)),
    ({(69, 20), (68, 19), (69, 19), (68, 20), (68, 18), (69, 18)}, (67, 19)),
    ({(69, 20), (68, 19), (69, 19), (68, 20), (68, 18), (69, 18), (67, 19)}, (67, 20)),
    ({(69, 20), (68, 19), (69, 19), (68, 20), (67, 19), (67, 20)}, (68, 18)),
]
# axial directions, Civ6 DirectionTypes order NE, E, SE, SW, W, NW
DIRS = [(1, -1), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1)]


def to_ax(p):
    x, y = p
    return (x - (y - (y & 1)) // 2, y)


def to_off(a):
    q, r = a
    return (q + (r - (r & 1)) // 2, r)


def dist(a, b):
    (q1, r1), (q2, r2) = to_ax(a), to_ax(b)
    return (abs(q1 - q2) + abs(r1 - r2) + abs((q1 + r1) - (q2 + r2))) // 2


def bfs_order(dirs):
    c = to_ax(C)
    seen = {c}
    order = []
    frontier = [c]
    while frontier and len(order) < 60:
        nxt = []
        for a in frontier:
            for d in dirs:
                b = (a[0] + d[0], a[1] + d[1])
                if b not in seen:
                    seen.add(b)
                    nxt.append(b)
                    order.append(to_off(b))
        frontier = nxt
    return order


def ring_order(start, turn):
    """Hex rings walked from the corner in direction `start`, turning by `turn`."""
    c = to_ax(C)
    order = []
    for k in range(1, 4):
        a = (c[0] + DIRS[start][0] * k, c[1] + DIRS[start][1] * k)
        for side in range(6):
            d = DIRS[(start + 2 * turn + side * turn) % 6]
            for _ in range(k):
                order.append(to_off(a))
                a = (a[0] + d[0], a[1] + d[1])
    return order


def check(order):
    rank = {p: i for i, p in enumerate(order)}
    for held, placed in OBS:
        free = [p for p in USABLE if p not in held]
        dmin = min(dist(C, p) for p in free)
        best = min((p for p in free if dist(C, p) == dmin), key=lambda p: rank.get(p, 10 ** 6))
        if best != placed:
            return False
    return True


def metrics():
    def evenr(a, b):
        def ax(p):
            x, y = p
            return (x - (y + (y & 1)) // 2, y)
        (q1, r1), (q2, r2) = ax(a), ax(b)
        return (abs(q1 - q2) + abs(r1 - r2) + abs((q1 + r1) - (q2 + r2))) // 2

    def eucl(a, b):  # hex centres, odd rows shifted right
        (x1, y1), (x2, y2) = a, b
        cx1, cx2 = x1 + 0.5 * (y1 & 1), x2 + 0.5 * (y2 & 1)
        return round((cx1 - cx2) ** 2 + 0.75 * (y1 - y2) ** 2, 3)

    def grid(a, b):
        return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

    def cheb(a, b):
        return max(abs(a[0] - b[0]), abs(a[1] - b[1]))

    return {"hex": dist, "even-r": evenr, "euclid": eucl, "grid": grid, "cheb": cheb}


def check_metric(m, key):
    for held, placed in OBS:
        free = [p for p in USABLE if p not in held]
        best = min(free, key=lambda p: (m(C, p), key(p)))
        if best != placed:
            return False
    return True


def main() -> None:
    keys = {"index": lambda p: p[1] * W + p[0], "-index": lambda p: -(p[1] * W + p[0]),
            "x,y": lambda p: p, "-x,y": lambda p: (-p[0], p[1]), "x,-y": lambda p: (p[0], -p[1])}
    for mn, m in metrics().items():
        for kn, k in keys.items():
            if check_metric(m, k):
                print("fits: metric", mn, "tie", kn)
    idx = sorted(USABLE, key=lambda p: p[1] * W + p[0])
    print("lowest index:", check(idx))
    print("x then y:", check(sorted(USABLE)))
    for perm in itertools.permutations(range(6)):
        dirs = [DIRS[i] for i in perm]
        if check(bfs_order(dirs)):
            print("BFS fits, direction order", perm)
    for s in range(6):
        for tr in (1, -1):
            if check(ring_order(s, tr)):
                print("ring walk fits: start", s, "turn", tr)


if __name__ == "__main__":
    main()
