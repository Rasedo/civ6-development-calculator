"""Fractal.Create / CreateRifts / GetHeight / BuildRidges as measured in the
game (the lab's pinned models: tools/civ6lab/h3_cvfractal.py and
h3_ridgemodel.py), driven by the map generator's stream.

Create: Civ 5's CvFractal diamond-square over a 2^xe x 2^ye array (defaults
7 and 6), one draw per array point, smoothing clamp(minExp - grain, 0,
minExp), FRAC_POLAR / FRAC_WRAP_X / FRAC_WRAP_Y / FRAC_INVERT_HEIGHTS,
bilinear GetHeight(x, y) at FLOAT_PRECISION 1000. CreateRifts: Civ 4/5's
tectonicAction after the diamond-square, before INVERT_HEIGHTS (which
inverts x < fx, y < fy only). GetHeight(percent): a bisection over the
array itself. BuildRidges: max(trunc(n), 3) seeds with their draws, hex
distances without wrap, one get(3) per (point, seed) under any ridge flag,
the directional bias, blended (h * br + a * bf) // max(br + bf, 1).
"""
from __future__ import annotations

from .cvrandom import A, C, M32, Rng

FP = 1000  # FLOAT_PRECISION
MIN_SEED_DISTANCE = 7


def cdiv(a: int, b: int) -> int:
    """C integer division (truncates toward zero)"""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


def clamp(v: int, lo: int, hi: int) -> int:
    return lo if v < lo else hi if v > hi else v


class Fractal:
    def __init__(self, xs: int, ys: int, grain: int, rng: Rng, flags: set, xexp: int = -1, yexp: int = -1,
                 rifts: "Fractal | None" = None):
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
            screen = (1 << (p + 1)) - 1
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
            self._tectonic_action(rifts)
        if "FRAC_INVERT_HEIGHTS" in flags:
            for x in range(fx):
                for y in range(fy):
                    a[x][y] = 255 - a[x][y]

    def _tectonic_action(self, rifts: "Fractal") -> None:
        fx, a = self.fx, self.a
        rift2x = (fx // 4) * 3
        width = 16
        deep = 0

        def wrap(x):
            return x + fx if x < 0 else x - fx if x >= fx else x

        for y in range(self.fy + 1):
            c = cdiv(cdiv((rifts.a[rift2x][y] - 128) * fx, 128), 8)
            for x in range(width):
                rx = wrap(c + x)
                lx = wrap(c - x)
                a[rx][y] = (a[rx][y] * x + deep * (width - x)) // width
                a[lx][y] = (a[lx][y] * x + deep * (width - x)) // width
        for y in range(self.fy + 1):
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

    def height_from_percent(self, pct: int) -> int:
        """a bisection on the estimate over the array a[x][y], x < fx, y < fy:
        count the values below the estimate; count * 100 // (fx * fy) <=
        percent raises the lower bound"""
        heights = sorted(self.a[x][y] for x in range(self.fx) for y in range(self.fy))
        n_all = len(heights)
        lo, hi = 0, 255
        pct = clamp(int(pct), 0, 100)
        est = 255 * pct // 100
        import bisect
        while est != lo:
            n = bisect.bisect_left(heights, est)
            if n * 100 // n_all <= pct:
                lo = est
                est = (est + hi) // 2
            else:
                hi = est
                est = (est + lo) // 2
        return est

    def build_ridges(self, rng: Rng, plates, rflags: set, br: int, bf: int) -> None:
        seeds = _place_seeds(rng, plates, self.fx, self.fy)
        den = max(br + bf, 1)
        a = self.a
        if not rflags:
            for x in range(self.fx):
                for y in range(self.fy):
                    ds = sorted(_hexdist(x, y, sx, sy) for sx, sy, *_ in seeds)
                    h = 255 * ds[0] // ds[1] if ds[1] else 0
                    a[x][y] = (h * br + a[x][y] * bf) // den
            return
        # any ridge flag: one get(3) per (point, seed), x outer, y inner,
        # seeds innermost; the stream is stepped inline for speed
        s = rng.s
        n0 = rng.n
        for x in range(self.fx):
            for y in range(self.fy):
                hx = x - (y >> 1)
                d1 = d2 = 1 << 30
                for sx, sy, shx, weak, st, dr in seeds:
                    s = (A * s + C) & M32
                    n = ((s >> 16) * 3) >> 16
                    dx, dy = shx - hx, sy - y
                    if (dx >= 0) == (dy >= 0):
                        d = abs(dx) + abs(dy)
                    else:
                        d = max(abs(dx), abs(dy))
                    b = 0
                    if st is not None:
                        e = _direction(hx - shx, y - sy)
                        if e == dr:
                            b = st
                        elif e >= 0 and e == (dr + 3) % 6:
                            b = -st
                    D = d + n + weak + b
                    if D < 1:
                        D = 1
                    if D < d1:
                        d1, d2 = D, d1
                    elif D < d2:
                        d2 = D
                h = 255 * d1 // d2 if d2 > 0 else 0
                a[x][y] = (h * br + a[x][y] * bf) // den
        rng.s = s
        rng.n = n0 + self.fx * self.fy * len(seeds)


def _hexdist(x1, y1, x2, y2):
    hx1, hx2 = x1 - (y1 >> 1), x2 - (y2 >> 1)
    dx, dy = hx2 - hx1, y2 - y1
    if (dx >= 0) == (dy >= 0):
        return abs(dx) + abs(dy)
    return max(abs(dx), abs(dy))


def _raw(rng: Rng) -> int:
    rng.get(1)
    return rng.s >> 16


def _place_seeds(rng: Rng, n, fx: int, fy: int) -> list[tuple]:
    """(x, y, hex x, weakness, bias strength or None, bias direction) per
    seed: y = get(fy), x = get(fx), b0 = get(7) (a second draw when b0 >= 3:
    weakness = get(7) - 3), b1 = the bias direction draw, b2 = get(2) (a
    second draw when b2 = 1: strength = get(8) - 4); a seed within hex
    distance 7 of an earlier one moves to hx = get(fx), y = get(fy),
    x = hx + (y >> 1), unwrapped"""
    n = max(int(n), 3)
    out: list[dict] = []
    while len(out) < n:
        y = rng.get(fy)
        x = rng.get(fx)
        b0 = rng.get(7)
        c0 = _raw(rng) if b0 >= 3 else None
        b1 = _raw(rng)
        b2 = rng.get(2)
        c2 = _raw(rng) if b2 == 1 else None
        while any(_hexdist(x, y, o["x"], o["y"]) < MIN_SEED_DISTANCE for o in out):
            hx = rng.get(fx)
            y = rng.get(fy)
            x = hx + (y >> 1)
        out.append({"x": x, "y": y, "b0": b0, "c0": c0, "b1": b1, "b2": b2, "c2": c2})
    seeds = []
    for o in out:
        weak = ((o["c0"] * 7) >> 16) - 3 if o["b0"] >= 3 else 0
        st = ((o["c2"] * 8) >> 16) - 4 if o["b2"] == 1 else None
        dr = (o["b1"] * 6) >> 16
        seeds.append((o["x"], o["y"], o["x"] - (o["y"] >> 1), weak, st, dr))
    return seeds


def _direction(q: int, r: int) -> int:
    """the point's direction from the seed, offset q = dhx, r = dy read as
    cartesian axes: the largest dot product with NE, E, SW, W, NW (SE never
    occurs); a tie (q = 0) goes to NW above the seed and SW below; the seed's
    own plot has none"""
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
