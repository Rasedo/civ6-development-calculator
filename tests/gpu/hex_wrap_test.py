"""A MAP THAT WRAPS IN X — the GPU's hex tables (tests/cpu/map/hex.test.ts is
the TS twin). Columns 0 and W - 1 are neighbours, a distance goes the
shorter way round, a disk and a ring hold each plot once on a narrow map,
and a line of sight crosses the seam. The literals marked TS are what
`world/hex.ts` / `hexLineBetween` answer on the same maps.

    python tests/gpu/hex_wrap_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core.simbase import (axial_delta, hex_distance_from, los_tables, neighbor_table, pair_distances,  # noqa: E402
                          ring_walk_places, tiles_from_offsets, tiles_within_offsets)


def ts_distance(w: int, wrap: bool, a: int, b: int) -> int:
    """`hexDistance` transcribed: the cube norm, the least over shifts 0, -w, +w."""
    ac, ar, bc, br = a % w, a // w, b % w, b // w
    dq = (bc - ((br - (br & 1)) >> 1)) - (ac - ((ar - (ar & 1)) >> 1))
    dr = br - ar
    shifts = (0, -w, w) if wrap else (0,)
    return min((abs(dq + s) + abs(dr) + abs(dq + s + dr)) // 2 for s in shifts)


def main() -> None:
    # -- 1: neighbours across the seam
    W, H = 10, 8
    nb = neighbor_table(W, H, True)
    at = lambda c, r: r * W + c  # noqa: E731
    assert int(nb[at(0, 2), 3]) == at(W - 1, 2) and int(nb[at(W - 1, 2), 0]) == at(0, 2), "W / E across the seam"
    assert int(nb[at(0, 2), 2]) == at(W - 1, 1) and int(nb[at(0, 2), 4]) == at(W - 1, 3), "NW / SW off column 0"
    assert int(nb[at(W - 1, 3), 1]) == at(0, 2) and int(nb[at(W - 1, 3), 5]) == at(0, 4), "NE / SE off the last column"
    assert int(nb[at(3, 0), 1]) == -1, "rows do not wrap"
    flat = neighbor_table(W, H, False)
    assert int(flat[at(0, 2), 3]) == -1, "a bounded map has no W neighbour on column 0"
    for t in range(W * H):
        for d in range(6):
            n = int(nb[t, d])
            if n >= 0:
                assert int(nb[n, (d + 3) % 6]) == t, f"neighbour {t} -> {n} is not mutual"
    print("  1 neighbours OK — the seam joins columns 0 and W - 1, rows stay bounded")

    # -- 2: distance the shorter way round, the pair table, adjacency agreeing
    for (w, h) in ((10, 8), (4, 9), (3, 5)):
        pd = pair_distances(w, h, True)
        for a in range(w * h):
            row = hex_distance_from(w, h, True, a)
            for b in range(w * h):
                want = ts_distance(w, True, a, b)
                assert int(row[b]) == want and int(pd[a, b]) == want, f"{w}x{h}: dist {a}-{b} {int(row[b])} != {want}"
    assert int(pair_distances(10, 8, True)[at(0, 2), at(9, 2)]) == 1
    assert int(pair_distances(10, 8, False)[at(0, 2), at(9, 2)]) == 9
    pd = pair_distances(W, H, True)
    for a in range(W * H):
        for b in range(W * H):
            assert (int(pd[a, b]) == 1) == (b in nb[a].tolist()), f"adjacency and distance 1 disagree at {a}-{b}"
    # TS: hexDistance over every pair of the 4 x 9 wrapping map
    h = 0
    pd4 = pair_distances(4, 9, True)
    for a in range(36):
        for b in range(36):
            h = (h * 31 + int(pd4[a, b])) % 1000000007
    assert h == 739019632, f"the 4 x 9 distance table's hash {h} is not TS's"
    dq, dr = axial_delta(torch.tensor([at(1, 3)]), torch.tensor([at(8, 3)]), W, True)
    assert (int(dq), int(dr)) == (-3, 0), "the axial step from (1,3) to (8,3) goes west across the seam"
    print("  2 distances OK — every pair the shorter way round, TS's table on 4 x 9")

    # -- 3: a disk on a narrow map holds each plot once, in TS's order
    w4 = 4
    c = 4 * w4 + 1
    for r, want in ((2, [19, 23, 24, 15, 16, 20, 25, 8, 12, 17, 21, 26, 9, 13, 18, 22, 10, 14]),
                     (3, [18, 22, 27, 31, 14, 19, 23, 24, 28, 11, 15, 16, 20, 25, 29, 7, 8, 12, 17, 21, 26, 30, 4,
                          9, 13, 5, 10, 6])):
        got = [int(x) for x in tiles_from_offsets(torch.tensor([c]), tiles_within_offsets(r), w4, 9, True)[0].tolist()
               if int(x) >= 0]
        assert got == want, f"the radius-{r} disk on 4 x 9 is {got}, TS walks {want}"
    # a wide wrapping map: the disk is the bounded one, shifted round
    wide = tiles_from_offsets(torch.tensor([at(0, 4)]), tiles_within_offsets(2), W, H, True)[0]
    plain = tiles_from_offsets(torch.tensor([at(3, 4)]), tiles_within_offsets(2), W, H, False)[0]
    assert all(int(x) >= 0 for x in plain)
    assert [int(x) for x in wide] == [(int(x) // W) * W + (int(x) % W - 3) % W for x in plain], "a wide disk shifts"
    print("  3 disks OK — each plot once on 4 x 9, TS's order; a wide map's disk shifts round")

    # -- 4: a ring walk on a narrow map: each plot once, at its first place
    k = pair_distances(w4, 9, True)[c].long().unsqueeze(0)
    pos = ring_walk_places(torch.tensor([c]), k, w4, 9, True)[0]
    for r, want in ((2, [19, 15, 8, 9, 10, 14, 22, 26, 25, 24, 23]), (3, [11, 7, 4, 5, 6, 27, 30, 29, 28, 31])):
        ring = sorted((int(pos[t]), t) for t in range(w4 * 9) if int(k[0, t]) == r)
        got = [t for _, t in ring]
        assert got == want, f"the ring {r} walk on 4 x 9 is {got}, TS walks {want}"
        assert len({p for p, _ in ring}) == len(ring), "two plots share a ring place"
    print("  4 rings OK — TS's walk on 4 x 9")

    # -- 5: the line of sight across the seam
    W12 = 12
    tgt, mid = los_tables(W12, 8, True, 5)
    p12 = lambda c, r: r * W12 + c  # noqa: E731

    def line(a: int, b: int) -> list[int]:
        row = [int(x) for x in tgt[a].tolist()]
        assert b in row, f"{b} is not a target of {a}"
        return [int(m) for m in mid[a, row.index(b)].tolist() if int(m) >= 0]

    assert line(p12(1, 3), p12(10, 3)) == [36, 47], "TS: the line (1,3) -> (10,3) passes (0,3), (11,3)"
    assert line(p12(11, 2), p12(2, 6)) == [47, 48, 49, 61], "TS: the line (11,2) -> (2,6)"
    pd12 = pair_distances(W12, 8, True)
    for a in range(W12 * 8):
        row = [int(x) for x in tgt[a].tolist() if int(x) >= 0]
        assert len(row) == len(set(row)), f"a target repeats from {a}"
        want = {b for b in range(W12 * 8) if 1 <= int(pd12[a, b]) <= 5}
        assert set(row) == want, f"the targets of {a} are not the plots within 5"
    flat_t, flat_m = los_tables(16, 16, False, 5)
    assert len([x for x in flat_t[10 * 16 + 5].tolist() if x >= 0]) == 90
    print("  5 lines OK — the sight lines cross the seam as TS's do, every target once")


if __name__ == "__main__":
    main()
    print("hex_wrap_test: ALL OK")
