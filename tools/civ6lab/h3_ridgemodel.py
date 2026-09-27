"""H-3: Fractal:BuildRidges (Civ 5's CvFractal::ridgeBuilder) as measured,
scored against the pinned dumps (h3_ridges.py / h3_fractal.py records).

    python tools/civ6lab/h3_ridgemodel.py DUMP [DUMP ...] [-v]

Seeds: max(trunc(numPlates), 3), placed in order. A seed draws
    y = get(fy), x = get(fx), b0 = get(7); if b0 >= 3: one more draw;
    b1 = one draw; b2 = get(2); if b2 == 1: one more draw
(weakness, bias direction and strength; without ridge flags they never touch
the field). While its hex distance to an earlier seed is < 7 it is moved:
hx = get(fx), y = get(fy), x = hx + (y >> 1), not wrapped (a moved seed may
sit past the array's east edge and still counts).
Field over the array x < fx, y < fy: d1, d2 the two smallest (modified, with
ridge flags) hex distances (odd rows shifted right) to the seeds,
h = 255 * d1 // d2, blended into the fractal a' = (h * br + a * bf) // max(br + bf, 1).
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_cvfractal import Fractal, Rng, height_from_percent  # noqa: E402
from h3_fractal import state_after  # noqa: E402

MIN_SEED_DISTANCE = 7


def hexdist(x1, y1, x2, y2):
    hx1, hx2 = x1 - (y1 >> 1), x2 - (y2 >> 1)
    dx, dy = hx2 - hx1, y2 - y1
    if (dx >= 0) == (dy >= 0):
        return abs(dx) + abs(dy)
    return max(abs(dx), abs(dy))


def place_one(rng: Rng, fx: int, fy: int) -> dict:
    y = rng.get(fy)
    x = rng.get(fx)
    b0 = rng.get(7)
    c0 = (rng.get(1), rng.s >> 16)[1] if b0 >= 3 else None
    b1 = (rng.get(1), rng.s >> 16)[1]
    b2 = rng.get(2)
    c2 = (rng.get(1), rng.s >> 16)[1] if b2 == 1 else None
    return {"x": x, "y": y, "b0": b0, "c0": c0, "b1": b1, "b2": b2, "c2": c2}


def place(rng: Rng, n, fx: int, fy: int) -> list[dict]:
    n = max(int(n), 3)
    seeds: list[dict] = []
    while len(seeds) < n:
        s = place_one(rng, fx, fy)
        while any(hexdist(s["x"], s["y"], o["x"], o["y"]) < MIN_SEED_DISTANCE for o in seeds):
            hx = rng.get(fx)
            s["y"] = rng.get(fy)
            s["x"] = hx + (s["y"] >> 1)
        seeds.append(s)
    return seeds


def ridge_height(seeds, x, y) -> int:
    ds = sorted(hexdist(x, y, s["x"], s["y"]) for s in seeds)
    return 255 * ds[0] // ds[1] if ds[1] else 0


def weakness(s: dict) -> int:
    """the distance offset: b0 = get(7); when b0 >= 3 a second draw c0 gives
    get(7) - 3 (a double-evaluating max), else 0"""
    return ((s["c0"] * 7) >> 16) - 3 if s["b0"] >= 3 else 0


def direction(q: int, r: int) -> int:
    """the point's direction from the seed, from its offset q = dhx (odd rows
    shifted right), r = dy read as cartesian axes: the largest dot product with
    NE (1/2, √3/2), E (1, 0), SW (-1/2, -√3/2), W (-1, 0), NW (-1/2, √3/2);
    SE is never returned (its sector splits between E and SW at -60°); a tie
    (q = 0) goes to NW above the seed and SW below; the seed itself has none.
    Exact integer form of that partition."""
    if q == 0 and r == 0:
        return -1
    if r > 0:
        if q > 0:
            return 0 if q * q < 3 * r * r else 1
        return 5 if q * q < 3 * r * r else 4
    if r == 0:
        return 1 if q > 0 else 4
    if q > 0:
        return 1 if 3 * q * q > r * r else 3
    return 4 if q * q > 3 * r * r else 3


def bias(s: dict, x: int, y: int) -> int:
    """a seed with b2 == 1 (the first draw of max(0, get(8) - 4) >= 0) has
    strength get(8) - 4 of its second draw c2 (-4..3) and direction get(6)
    of b1 (NE, E, SE, SW, W, NW); + strength where the point's direction()
    is b1, - strength where it is b1 + 3 (mod 6)"""
    if s["b2"] != 1:
        return 0
    st = ((s["c2"] * 8) >> 16) - 4
    dr = (s["b1"] * 6) >> 16
    e = direction((x - (y >> 1)) - (s["x"] - (s["y"] >> 1)), y - s["y"])
    return st if e == dr else -st if e >= 0 and e == (dr + 3) % 6 else 0


def ridge_height_flagged(seeds, x, y, rng: Rng) -> int:
    """any ridge flag draws get(3) per (point, seed), seeds in order;
    D = max(1, d + get(3) + weakness + bias), d the plain hex distance
    (FRAC_WRAP_X wraps nothing), bias() the directional bias."""
    ds = []
    for s in seeds:
        n = rng.get(3)
        ds.append(max(1, hexdist(x, y, s["x"], s["y"]) + n + weakness(s) + bias(s, x, y)))
    ds.sort()
    return 255 * ds[0] // ds[1] if ds[1] > 0 else 0


def build_ridges(f: Fractal, rng: Rng, plates, rflags: set, br: int, bf: int) -> None:
    seeds = place(rng, plates, f.fx, f.fy)
    den = max(br + bf, 1)
    for x in range(f.fx):
        for y in range(f.fy):
            h = (ridge_height_flagged(seeds, x, y, rng) if rflags
                 else ridge_height(seeds, x, y))
            f.a[x][y] = (h * br + f.a[x][y] * bf) // den


def score(rec: dict) -> dict:
    rng = Rng(rec["state_before"])
    f = Fractal(rec["w"], rec["h"], rec["grain"], rng, set(rec["flags"]), rec["xe"], rec["ye"])
    rng = Rng(state_after(rec["pins"]["P2"]))
    build_ridges(f, rng, rec["plates"], set(rec["rflags"]), rec["br"], rec["bf"])
    got = rec["ridged_grid"]
    miss = [(x, y, f.height(x, y), got[y][x]) for y in range(rec["h"]) for x in range(rec["w"])
            if f.height(x, y) != got[y][x]]
    pct = [height_from_percent(f, q) for q in range(101)]
    fx = 1 << (rec["xe"] if rec["xe"] >= 0 else 7)
    fy = 1 << (rec["ye"] if rec["ye"] >= 0 else 6)
    seeds = place(Rng(state_after(rec["pins"]["P2"])), rec["plates"], fx, fy)
    return {"name": rec["name"], "rflags": sorted(rec["rflags"]), "seeds_with_bias": sum(s["b2"] for s in seeds),
            "draws_model": rng.n, "draws_game": rec["draws"]["P2->P3"],
            "plots": rec["w"] * rec["h"], "misses": len(miss), "first_miss": miss[:3],
            "pct_hits_of_101": sum(a == b for a, b in zip(pct, rec["ridged_pct"]))}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dumps", nargs="+")
    p.add_argument("-v", action="store_true")
    a = p.parse_args()
    tot = exact = 0
    for dump in a.dumps:
        for ln in pathlib.Path(dump).read_text(encoding="utf-8").splitlines():
            rec = json.loads(ln)
            if "ridged_grid" not in rec:
                continue
            s = score(rec)
            tot += 1
            ok = s["misses"] == 0 and s["draws_model"] == s["draws_game"] and s["pct_hits_of_101"] == 101
            exact += ok
            if a.v or not ok:
                print(json.dumps(s))
    print(f"cases {tot} exact (grid, draw count, 101 percentiles) {exact}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
