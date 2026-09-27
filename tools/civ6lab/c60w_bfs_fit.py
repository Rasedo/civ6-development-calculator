"""C-60 (lab, host 4): the Free City grant's plot among free plots at one
distance. Ngaruawahia (69:21, lab4_t250); the map is odd-r (odd rows shifted
right; the game's Map.GetPlotDistance read by free_tiles.lua agrees). Two
families of search order are scored: a breadth-first walk from the centre
(every direction order; crossing every plot, or land plots only), taking
the first usable plot it discovers; and a walk around each hex ring in turn
from one corner, one way round. Each observation is (the free usable plots
at placement, the plot placed), the occupants replayed to the placement
(`c60w_occ.py`).

    python tools/civ6lab/c60w_bfs_fit.py
"""
from __future__ import annotations

import itertools

C = (69, 21)
# free_tiles.lua at t250: land, no district, no mountain
USABLE = {(69, 20), (68, 19), (68, 20), (69, 19), (67, 19), (67, 20), (67, 22), (67, 23), (68, 18), (69, 18)}
LAND_DISTRICTS = {(69, 21), (68, 21), (67, 21), (68, 22)}
LAND = USABLE | LAND_DISTRICTS
R2 = {(69, 20), (68, 19), (69, 19), (68, 20)}
D3 = {(67, 19), (67, 20), (67, 22), (67, 23), (68, 18), (69, 18)}
OBS = [  # (free usable plots at placement, plot placed): c60w_occ.py over runs/c60t_grant_*
    ({(69, 20)} | R2 | D3, (69, 20)),                                     # ctl (no block)
    ({(68, 19), (69, 19)} | D3, (68, 19)),                                # w_x1 (68:20 held by a p2 unit)
    ({(67, 19), (67, 22), (67, 23), (68, 18), (69, 18)}, (67, 19)),       # C3 x4 burns, w_r2_tb0/tb7
    ({(67, 20), (67, 22), (67, 23), (68, 18), (69, 18)}, (67, 20)),       # F
    ({(67, 22), (67, 23)}, (67, 23)),                                     # H, w_x4
    ({(67, 19), (67, 22), (67, 23)}, (67, 19)),                           # w_e2, w_x2
    ({(67, 19), (67, 20), (68, 18), (69, 18)}, (67, 20)),                 # w_e3, w_x3
    ({(67, 19), (67, 22), (67, 23), (68, 18)}, (67, 19)),                 # w_e4
    ({(67, 19), (67, 20), (67, 22), (67, 23), (69, 18)}, (67, 20)),       # w_r2_t257, the t256 grant
]
AX_DIRS = [(1, -1), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1)]  # axial NE, E, SE, SW, W, NW (odd-r)


def to_ax(p):
    x, y = p
    return (x - (y - (y & 1)) // 2, y)


def to_off(a):
    q, r = a
    return (q + (r - (r & 1)) // 2, r)


def ring_walk(start, turn):
    """rings 1..3 from the corner in direction `start`, walking the ring in
    direction order (turn +1) or against it (-1)"""
    c = to_ax(C)
    out = []
    for k in range(1, 4):
        a = (c[0] + AX_DIRS[start][0] * k, c[1] + AX_DIRS[start][1] * k)
        for side in range(6):
            d = AX_DIRS[(start + 2 * turn + side * turn) % 6]
            for _ in range(k):
                out.append(to_off(a))
                a = (a[0] + d[0], a[1] + d[1])
    return out
# Civ 6 DirectionTypes: NE, E, SE, SW, W, NW; odd-r neighbours
ODD = [(1, -1), (1, 0), (1, 1), (0, 1), (-1, 0), (0, -1)]
EVEN = [(0, -1), (1, 0), (0, 1), (-1, 1), (-1, 0), (-1, -1)]


def nb(p, d):
    x, y = p
    dx, dy = (ODD if y & 1 else EVEN)[d]
    return (x + dx, y + dy)


def walk(order, land_only):
    seen = {C}
    out = []
    frontier = [C]
    while frontier and len(out) < 80:
        nxt = []
        for p in frontier:
            for d in order:
                q = nb(p, d)
                if q in seen or abs(q[0] - C[0]) > 5 or abs(q[1] - C[1]) > 5:
                    continue
                seen.add(q)
                out.append(q)
                if not land_only or q in LAND:
                    nxt.append(q)
        frontier = nxt
    return out


def ok(seq):
    return sum(next((p for p in seq if p in free), None) == placed for free, placed in OBS)


def main() -> None:
    n = len(OBS)
    for land_only in (False, True):
        best = max((ok(walk(o, land_only)), o) for o in itertools.permutations(range(6)))
        print(f"breadth-first ({'land-only' if land_only else 'all plots'}): best {best[0]}/{n} at {best[1]}")
    for start in range(6):
        for turn in (1, -1):
            k = ok(ring_walk(start, turn))
            print(f"ring walk from corner {'NE E SE SW W NW'.split()[start]} turning {turn:+d}: {k}/{n}")


if __name__ == "__main__":
    main()
