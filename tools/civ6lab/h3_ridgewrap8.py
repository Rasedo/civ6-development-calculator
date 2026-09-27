"""H-3: per-seed offsets in ridge-flag fields. Where one of a point's two
nearest seeds is plain (b0 < 3, b2 == 0: D = d + get(3) exactly), the field
fixes the other seed's D to an interval; the offset D - (d + get(3)) is
printed on the grid around that seed.

    python tools/civ6lab/h3_ridgewrap8.py DUMP NAME SEED
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_cvfractal import Rng  # noqa: E402
from h3_fractal import state_after  # noqa: E402
from h3_ridgemodel import hexdist, place  # noqa: E402


def main() -> int:
    dump, name, si = sys.argv[1], sys.argv[2], int(sys.argv[3])
    rec = next(json.loads(ln) for ln in pathlib.Path(dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == name)
    fx, fy = 1 << rec["xe"], 1 << rec["ye"]
    rng = Rng(state_after(rec["pins"]["P2"]))
    seeds = place(rng, rec["plates"], fx, fy)
    for s in seeds:
        print({k: v for k, v in s.items()})
    plain = [s["b0"] < 3 and s["b2"] == 0 for s in seeds]
    g = rec["ridged_grid"]
    grid = {}
    for x in range(fx):
        for y in range(fy):
            base = [hexdist(x, y, s["x"], s["y"]) + rng.get(3) for s in seeds]
            h = g[y][x]
            # candidate: the plain seeds' D exact; the target seed's D unknown
            best = None
            for pi in range(len(seeds)):
                if not plain[pi] or pi == si:
                    continue
                others = [base[k] for k in range(len(seeds)) if k not in (si, pi)]
                sols = []
                for Dt in range(0, 200):
                    D = sorted([Dt, base[pi]] + others)
                    if (255 * D[0] // D[1] if D[1] else 0) == h and Dt in D[:2] and base[pi] in D[:2]:
                        sols.append(Dt - base[si])
                if sols:
                    best = (min(sols), max(sols))
            if best is not None:
                grid[(x, y)] = best
    s = seeds[si]
    print("seed", (s["x"], s["y"]), "offsets (lo..hi) of D - (d + get(3)); rows top down")
    for y in range(fy - 1, -1, -1):
        row = []
        for x in range(fx):
            if (x, y) == (s["x"], s["y"]):
                row.append("  @@ ")
            elif (x, y) in grid:
                lo, hi = grid[(x, y)]
                row.append(f"{lo:+3d}{'~' if hi != lo else ' '} ")
            else:
                row.append("   . ")
        print(f"{y:2d} " + "".join(row))
    return 0


if __name__ == "__main__":
    sys.exit(main())
