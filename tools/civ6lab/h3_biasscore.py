"""H-3: score ridge-flag bias hypotheses on the full flagged BuildRidges law
over every flagged case (raw br = 1, bf = 0 and blended): total missed cells
and exact cases per hypothesis.

    python tools/civ6lab/h3_biasscore.py DUMP [DUMP ...]

A hypothesis is (coords, vectors, ties, clamp): the point's direction from
the seed is the largest dot product of its offset (array dx, hex dhx with odd
rows shifted right or left, cartesian with or without the √3/2 row pitch)
with a direction vector set (Civ 5's 45-degree set, the 60-degree set, the
axial set, and the 60-degree set with SE never winning); ties go to the lower
index (strict) or the higher one (>=, the seed itself excluded); the clamp
max(1, .) is taken once after the bias or also before it. A seed with
b2 == 1 adds strength where the direction is b1 and -strength where it is
b1 + 3. Only (hex, SE never wins, ties to the higher index, one clamp) is
exact on every case.
"""
from __future__ import annotations

import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_cvfractal import Fractal, Rng  # noqa: E402
from h3_fractal import state_after  # noqa: E402
from h3_ridgemodel import hexdist, place, weakness  # noqa: E402

S2 = 1 / math.sqrt(2.0)
C60, S60 = 0.5, math.sqrt(3) / 2
VECS = {
    # Civ 5 estimateDirection: NE, E, SE, SW, W, NW at 45 degrees
    "civ5": [(S2, S2), (1, 0), (S2, -S2), (-S2, -S2), (-1, 0), (-S2, S2)],
    "hex60": [(C60, S60), (1, 0), (C60, -S60), (-C60, -S60), (-1, 0), (-C60, S60)],
    "axial": [(0, 1), (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1)],
    # the 60-degree set with SE never winning: SE's vector is SW's, or zero
    "hex60_sedup": [(C60, S60), (1, 0), (-C60, -S60), (-C60, -S60), (-1, 0), (-C60, S60)],
    "hex60_sezero": [(C60, S60), (1, 0), (0, 0), (-C60, -S60), (-1, 0), (-C60, S60)],
}


KINDS = ("array", "hex", "hexr", "cart", "cart3", "hexcart")


def coords(kind: str, x, y, sx, sy):
    if kind == "array":
        return x - sx, y - sy
    if kind == "hex":
        return (x - (y >> 1)) - (sx - (sy >> 1)), y - sy
    if kind == "hexr":  # odd rows shifted left
        return (x - ((y + 1) >> 1)) - (sx - ((sy + 1) >> 1)), y - sy
    if kind == "cart":
        return (x + 0.5 * (y & 1)) - (sx + 0.5 * (sy & 1)), y - sy
    if kind == "cart3":
        return (x + 0.5 * (y & 1)) - (sx + 0.5 * (sy & 1)), (y - sy) * math.sqrt(3) / 2
    if kind == "hexcart":
        a, b = (x - (y >> 1)) - (sx - (sy >> 1)), y - sy
        return a + b / 2, b
    raise ValueError(kind)


def estimate(DX, DY, vecs, strict=True):
    """strict: ties to the lower index; else (>=) ties to the higher one,
    the origin included (it returns the last index)"""
    best, bi = 0.0, -1
    for i, (vx, vy) in enumerate(vecs):
        dp = DX * vx + DY * vy
        if dp > best or (not strict and dp >= best and (DX or DY)):
            best, bi = dp, i
    return bi


def prep(rec: dict):
    fx, fy = 1 << rec["xe"], 1 << rec["ye"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    draws = {}
    for x in range(fx):
        for y in range(fy):
            draws[(x, y)] = [rng.get(3) for _ in seeds]
    return fx, fy, seeds, draws


def field(rec, pre, bias_fn, clamp_first=False):
    fx, fy, seeds, draws = pre
    out = {}
    for x in range(fx):
        for y in range(fy):
            ds = []
            for s, n in zip(seeds, draws[(x, y)]):
                d = hexdist(x, y, s["x"], s["y"])
                b = bias_fn(s, x, y) if s["b2"] == 1 else 0
                if clamp_first:
                    D = max(1, max(1, d + n + weakness(s)) + b)
                else:
                    D = max(1, d + n + weakness(s) + b)
                ds.append(D)
            ds.sort()
            out[(x, y)] = 255 * ds[0] // ds[1] if ds[1] > 0 else 0
    return out


def misses(rec, pre, bias_fn, clamp_first=False, show=False):
    fx, fy, seeds, draws = pre
    h = field(rec, pre, bias_fn, clamp_first)
    if rec["br"] == 1 and rec["bf"] == 0:
        g = rec["ridged_grid"]
        bad = [(x, y) for x in range(fx) for y in range(fy) if h[(x, y)] != g[y][x]]
        if show:
            for x, y in bad:
                rel = [(i, s["b2"], (s["b1"] * 6) >> 16, ((s["c2"] * 8) >> 16) - 4 if s["b2"] else None,
                        (x - (y >> 1)) - (s["x"] - (s["y"] >> 1)), y - s["y"], hexdist(x, y, s["x"], s["y"]))
                       for i, s in enumerate(seeds)]
                print("   miss", rec["name"], (x, y), "model", h[(x, y)], "game", g[y][x],
                      "seeds (i, b2, dir, st, dhx, dy, d)", rel)
        return len(bad)
    f = Fractal(rec["w"], rec["h"], rec["grain"], Rng(rec["state_before"]), set(rec["flags"]), rec["xe"], rec["ye"])
    den = max(rec["br"] + rec["bf"], 1)
    g = rec["ridged_grid"]
    for x in range(fx):
        for y in range(fy):
            f.a[x][y] = (h[(x, y)] * rec["br"] + f.a[x][y] * rec["bf"]) // den
    return sum(f.height(x, y) != g[y][x] for y in range(rec["h"]) for x in range(rec["w"]))


def make_bias(kind, vn, sign, strict=True, opp="plus3"):
    vecs = VECS[vn]

    def fn(s, x, y):
        st = ((s["c2"] * 8) >> 16) - 4
        dr = (s["b1"] * 6) >> 16
        DX, DY = coords(kind, x, y, s["x"], s["y"])
        e = estimate(DX, DY, vecs, strict)
        if e < 0:
            return 0
        if e == dr:
            return sign * st
        if opp == "plus3" and e == (dr + 3) % 6:
            return -sign * st
        if opp == "none":
            return 0
        if opp == "rest":
            return -sign * st
        return 0
    return fn


def main() -> int:
    recs = []
    for dump in sys.argv[1:]:
        for ln in pathlib.Path(dump).read_text(encoding="utf-8").splitlines():
            r = json.loads(ln)
            if "ridged_grid" in r and r["rflags"]:
                recs.append(r)
    pres = [prep(r) for r in recs]
    print("cases", len(recs))
    base = [misses(r, p, lambda s, x, y: 0) for r, p in zip(recs, pres)]
    print("no bias:", sum(base), "exact", sum(m == 0 for m in base))
    res = []
    for kind in KINDS:
        for vn in VECS:
            for strict in (True, False):
                for cf in (False, True):
                    fn = make_bias(kind, vn, 1, strict)
                    m = [misses(r, p, fn, cf) for r, p in zip(recs, pres)]
                    res.append((sum(m), sum(x == 0 for x in m), kind, vn, strict, cf))
                    print(res[-1], flush=True)
                    if sum(m) and sum(m) < 300:
                        print("   ", [(r["name"], x) for r, x in zip(recs, m) if x])
                        if sum(m) < 20:
                            for r, p, x in zip(recs, pres, m):
                                if x:
                                    misses(r, p, fn, cf, show=True)
    res.sort()
    print("best")
    for r in res[:10]:
        print(r)
    return 0


if __name__ == "__main__":
    sys.exit(main())
