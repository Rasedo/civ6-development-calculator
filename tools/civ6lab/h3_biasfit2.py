"""H-3: search the ridge-bias sector geometry: X = dhx + alpha * dy (dhx
from x - (y >> 1), or dx from array x with --array), Y = beta * dy, sectors
of 60 degrees centred on 60k + phi, the sector's owner by angle (ties to the
lower index) or by the largest dot product. Scored on the residual cells of
h3_biaszones.residuals with strength get(8) - 4 and direction get(6).

    python tools/civ6lab/h3_biasfit2.py DUMP
"""
from __future__ import annotations

import json
import math
import pathlib
import pickle
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_biaszones import residuals  # noqa: E402
from h3_cvfractal import Rng  # noqa: E402
from h3_fractal import state_after  # noqa: E402
from h3_ridgemodel import place  # noqa: E402

ANG = [60, 0, -60, -120, 180, 120]


def load(dump: str):
    cache = pathlib.Path(dump).with_suffix(".biascells.pkl")
    if cache.exists():
        return pickle.loads(cache.read_bytes())
    data = []
    for ln in pathlib.Path(dump).read_text(encoding="utf-8").splitlines():
        rec = json.loads(ln)
        if rec["br"] != 1 or rec["bf"] != 0 or not rec["rflags"]:
            continue
        fx, fy = 1 << rec["xe"], 1 << rec["ye"]
        seeds = place(Rng(state_after(rec["pins"]["P2"])), rec["plates"], fx, fy)
        for si, s in enumerate(seeds):
            if s["b2"] != 1:
                continue
            _, cells = residuals(rec, si)
            if len(cells) >= 40:
                data.append((rec["name"], s["x"], s["y"], ((s["c2"] * 8) >> 16) - 4, (s["b1"] * 6) >> 16, cells))
    cache.write_bytes(pickle.dumps(data))
    return data


def main() -> int:
    data = load(sys.argv[1])
    data = [d for d in data if d[3] != 0]
    best = []
    for mode in ("hex", "array"):
        for alpha in (0.0, 0.5, -0.5, 1.0, -1.0):
            for beta in (1.0, math.sqrt(3) / 2, 0.5, 2 / math.sqrt(3)):
                for phi in range(-15, 16, 5):
                    hit = tot = 0
                    for name, sx, sy, st, dr, cells in data:
                        for (x, y), r in cells.items():
                            if (x, y) == (sx, sy):
                                continue
                            dx = ((x - (y >> 1)) - (sx - (sy >> 1))) if mode == "hex" else (x - sx)
                            dy = y - sy
                            X, Y = dx + alpha * dy, beta * dy
                            ang = math.degrees(math.atan2(Y, X))
                            e = min(range(6), key=lambda i: abs(((ang - ANG[i] - phi + 180) % 360) - 180))
                            want = st if e == dr else -st if e == (dr + 3) % 6 else 0
                            hit += want == r
                            tot += 1
                    best.append((hit, tot, mode, alpha, round(beta, 3), phi))
    best.sort(reverse=True)
    for b in best[:12]:
        print(b)
    return 0


if __name__ == "__main__":
    sys.exit(main())
