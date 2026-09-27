"""H-3: Civ 5's CvFractal (diamond-square with grain) driven by the map
generator's LCG, scored against the in-game Fractal dumps (h3_fractal.py).

    python tools/civ6lab/h3_cvfractal.py runs/h3_fractal_<stamp>.jsonl

The generator is Civ 5's CvRandom: s' = 1103515245 s + 12345 mod 2^32,
get(n) = ((s' >> 16) & 0xFFFF) * (n & 0xFFFF) >> 16. The fractal is the
Civ 5 SDK's fracInitInternal / getHeight / getHeightFromPercent, written
from that source's shape; each case starts from the pinned state
`state_before` and must consume exactly the recorded draw count.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

M32 = 0xFFFFFFFF
FP = 1000  # FLOAT_PRECISION


class Rng:
    def __init__(self, s: int):
        self.s = s & M32
        self.n = 0

    def get(self, r: int) -> int:
        self.s = (1103515245 * self.s + 12345) & M32
        self.n += 1
        return (((self.s >> 16) & 0xFFFF) * (r & 0xFFFF)) >> 16


def cdiv(a: int, b: int) -> int:
    """C integer division (truncates toward zero)"""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


def clamp(v: int, lo: int, hi: int) -> int:
    return lo if v < lo else hi if v > hi else v


class Fractal:
    def __init__(self, xs, ys, grain, rng: Rng, flags: set, xexp=-1, yexp=-1, rifts=None):
        if xexp < 0:
            xexp = 7
        if yexp < 0:
            yexp = 6
        self.xs, self.ys, self.flags = xs, ys, flags
        self.fx, self.fy = 1 << xexp, 1 << yexp
        fx, fy = self.fx, self.fy
        a = [[0] * (fy + 1) for _ in range(fx + 1)]
        self.xinc = (fx * FP) // xs
        self.yinc = (fy * FP) // ys
        wx, wy, polar = "FRAC_WRAP_X" in flags, "FRAC_WRAP_Y" in flags, "FRAC_POLAR" in flags
        minexp = min(xexp, yexp)
        smooth = clamp(minexp - grain, 0, minexp)
        for p in range(smooth, -1, -1):
            screen = 0
            for i in range(p + 1):
                screen |= 1 << i
            if wy:
                for x in range(fx + 1):
                    a[x][fy] = a[x][0]
            elif polar:
                for x in range(fx + 1):
                    a[x][0] = 0
                    a[x][fy] = 0
            if wx:
                for y in range(fy + 1):
                    a[fx][y] = a[0][y]
            elif polar:
                for y in range(fy + 1):
                    a[0][y] = 0
                    a[fx][y] = 0
            for x in range((fx >> p) + (0 if wx else 1)):
                for y in range((fy >> p) + (0 if wy else 1)):
                    X, Y = x << p, y << p
                    if p == smooth:
                        a[X][Y] = rng.get(256)
                        continue
                    if X & screen:
                        if Y & screen:  # centre
                            s = (a[(x - 1) << p][(y - 1) << p] + a[(x + 1) << p][(y - 1) << p]
                                 + a[(x - 1) << p][(y + 1) << p] + a[(x + 1) << p][(y + 1) << p]) >> 2
                        else:  # horizontal
                            s = (a[(x - 1) << p][Y] + a[(x + 1) << p][Y]) >> 1
                    else:
                        if Y & screen:  # vertical
                            s = (a[X][(y - 1) << p] + a[X][(y + 1) << p]) >> 1
                        else:
                            continue
                    s += rng.get(1 << (8 - smooth + p))
                    s -= 1 << (7 - smooth + p)
                    a[X][Y] = clamp(s, 0, 255)
        self.a = a
        if rifts is not None:
            self.tectonic_action(rifts)
        if "FRAC_INVERT_HEIGHTS" in flags:
            for x in range(fx):
                for y in range(fy):
                    a[x][y] = 255 - a[x][y]

    def tectonic_action(self, rifts: "Fractal") -> None:
        """Civ 4/5's tectonicAction: a rift 16 columns wide either side of a
        centre that wanders with the rift fractal's column fx/4*3"""
        fx, fy, a = self.fx, self.fy, self.a
        rift2x = (fx // 4) * 3
        width = 16
        deep = 0

        def yield_x(x):
            return x + fx if x < 0 else x - fx if x >= fx else x

        for y in range(fy + 1):
            c = cdiv(cdiv((rifts.a[rift2x][y] - 128) * fx, 128), 8)
            for x in range(width):
                rx = yield_x(c + x)
                lx = yield_x(c - x)
                a[rx][y] = (a[rx][y] * x + deep * (width - x)) // width
                a[lx][y] = (a[lx][y] * x + deep * (width - x)) // width
        for y in range(fy + 1):
            a[fx][y] = a[0][y]

    def height(self, x: int, y: int) -> int:
        lx = (self.xinc * x) // FP
        if lx > self.fx - 1:
            lx = self.fx - 1
        ly = (self.yinc * y) // FP
        if ly > self.fy - 1:
            ly = self.fy - 1
        ex = (self.xinc * x) % FP
        ey = (self.yinc * y) % FP
        a = self.a
        s = ((FP - ex) * (FP - ey) * a[lx][ly] + ex * (FP - ey) * a[lx + 1][ly]
             + (FP - ex) * ey * a[lx][ly + 1] + ex * ey * a[lx + 1][ly + 1])
        return clamp(s // (FP * FP), 0, 255)


def height_from_percent(f: Fractal, pct: int) -> int:
    """GetHeight(percent): a bisection on the estimate over the fractal's OWN
    array a[x][y], x < fx, y < fy (not the plots): count the values below the
    estimate; count * 100 // (fx * fy) <= percent raises the lower bound"""
    heights = [f.a[x][y] for x in range(f.fx) for y in range(f.fy)]
    n_all = len(heights)
    lo, hi = 0, 255
    pct = clamp(pct, 0, 100)
    est = 255 * pct // 100
    while est != lo:
        n = sum(1 for h in heights if h < est)
        q = n * 100 // n_all
        if q <= pct:
            lo = est
            est = (est + hi) // 2
        else:
            hi = est
            est = (est + lo) // 2
    return est


def score(rec: dict) -> dict:
    rng = Rng(rec["state_before"])
    rifts = None
    draws_game = rec["draws"].get("P0->P2")
    if rec.get("rift"):
        from h3_fractal import state_after
        rifts = Fractal(rec["w"], rec["h"], rec["rift"], rng, set(), rec["xe"], rec["ye"])
        n_rifts = rng.n
        rng = Rng(state_after(rec["pins"]["P1"]))
        draws_game = [rec["draws"]["P0->P1"], rec["draws"]["P1->P2"]]
    f = Fractal(rec["w"], rec["h"], rec["grain"], rng, set(rec["flags"]), rec["xe"], rec["ye"], rifts=rifts)
    draws_model = rng.n if rifts is None else [n_rifts, rng.n]
    got = rec["grid"]
    hit = tot = 0
    first = None
    for y in range(rec["h"]):
        for x in range(rec["w"]):
            tot += 1
            v = f.height(x, y)
            if v == got[y][x]:
                hit += 1
            elif first is None:
                first = (x, y, v, got[y][x])
    mod = [height_from_percent(f, q) for q in range(101)]
    pct = sum(m == g for m, g in zip(mod, rec["pct"]))
    return {"name": rec["name"], "draws_model": draws_model, "draws_game": draws_game,
            "plots": tot, "hits": hit, "first_miss": first, "pct_hits_of_101": pct}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    a = p.parse_args()
    for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines():
        print(json.dumps(score(json.loads(ln))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
