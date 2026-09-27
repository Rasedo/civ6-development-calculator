"""H-3: fit the ridge-flag directional bias. A seed with b2 == 1 carries
strength s = get(8) - 4 of its second draw c2 and direction b1 = get(6)
(Civ 6 order NE, E, SE, SW, W, NW); a point whose estimated direction from
the seed equals the bias direction gets D += s, the opposite direction
D -= s. Scores direction estimators on the residual cells of
h3_biaszones.residuals.

    python tools/civ6lab/h3_biasfit.py DUMP
"""
from __future__ import annotations

import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_biaszones import residuals  # noqa: E402
from h3_cvfractal import Rng  # noqa: E402
from h3_fractal import state_after  # noqa: E402
from h3_ridgemodel import place  # noqa: E402

ANG = [60, 0, -60, -120, 180, 120]  # NE, E, SE, SW, W, NW


def coords(kind, x, y, sx, sy):
    if kind == "cart":
        return (x + 0.5 * (y & 1)) - (sx + 0.5 * (sy & 1)), (y - sy) * math.sqrt(3) / 2
    if kind == "array":
        return x - sx, y - sy
    if kind == "axial":  # hex x = x - (y >> 1), axes E and NE drawn as cartesian
        a, b = (x - (y >> 1)) - (sx - (sy >> 1)), y - sy
        return a + b / 2, b * math.sqrt(3) / 2
    if kind == "axial_raw":
        return (x - (y >> 1)) - (sx - (sy >> 1)), y - sy
    raise ValueError(kind)


def est_dir(X, Y, vecs):
    best, bi = None, -1
    for i, (vx, vy) in enumerate(vecs):
        dp = X * vx + Y * vy
        if best is None or dp > best:
            best, bi = dp, i
    return bi


def main() -> int:
    recs = [json.loads(ln) for ln in pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()]
    data = []
    for rec in recs:
        if rec["br"] != 1 or rec["bf"] != 0 or not rec["rflags"]:
            continue
        fx, fy = 1 << rec["xe"], 1 << rec["ye"]
        seeds = place(Rng(state_after(rec["pins"]["P2"])), rec["plates"], fx, fy)
        for si, s in enumerate(seeds):
            if s["b2"] != 1:
                continue
            _, cells = residuals(rec, si)
            if len(cells) < 40:
                continue
            strength = ((s["c2"] * 8) >> 16) - 4
            direction = (s["b1"] * 6) >> 16
            data.append((rec["name"], s, strength, direction, cells))
    print("biased seeds", len(data))
    vec_sets = {
        "hex6": [(math.cos(math.radians(a)), math.sin(math.radians(a))) for a in ANG],
        "axint": [(0, 1), (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1)],
        "axnorm": [(0, 1), (1, 0), (0.7071, -0.7071), (0, -1), (-1, 0), (-0.7071, 0.7071)],
    }
    for kind in ("cart", "array", "axial", "axial_raw"):
        for vn, vecs in vec_sets.items():
            for sign in (1, -1):
                hit = tot = 0
                per = []
                for name, s, st, dr, cells in data:
                    h = t = 0
                    for (x, y), r in cells.items():
                        if (x, y) == (s["x"], s["y"]):
                            continue
                        X, Y = coords(kind, x, y, s["x"], s["y"])
                        e = est_dir(X, Y, vecs)
                        want = sign * st if e == dr else -sign * st if e == (dr + 3) % 6 else 0
                        h += want == r
                        t += 1
                    per.append(f"{name}:{h}/{t}")
                    hit += h
                    tot += t
                print(f"{kind:9s} {vn} sign {sign:+d}: {hit}/{tot}  " + " ".join(per))
    for name, s, st, dr, cells in data:
        print(name, (s["x"], s["y"]), "strength", st, "direction", dr, "residual values", sorted(set(cells.values())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
