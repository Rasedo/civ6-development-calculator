"""H-3: explore Fractal:GetHeight(percent) against candidate quantile rules.

    python tools/civ6lab/h3_pct_explore.py runs/h3_fractal_<stamp>.jsonl [--case NAME]

Candidates, each scored over p = 0..100 on every non-rift case:
    plots_k : sorted plot heights s (N = w*h), value s[min(N-1, p*N//100)]
    grid_k  : the same over the fractal's own (fx+1)x(fy+1) array
    bisect_*: Civ 5's getHeightFromPercent bisection variants
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_cvfractal import Fractal, Rng, clamp  # noqa: E402


def cands(f: Fractal, rec: dict) -> dict[str, list[int]]:
    ph = sorted(f.height(x, y) for x in range(f.xs) for y in range(f.ys))
    N = len(ph)
    wx, wy = "FRAC_WRAP_X" in rec["flags"], "FRAC_WRAP_Y" in rec["flags"]
    gx = f.fx + (0 if wx else 1)
    gy = f.fy + (0 if wy else 1)
    gh = sorted(f.a[x][y] for x in range(gx) for y in range(gy))
    G = len(gh)
    out = {}
    gi = sorted(f.a[x][y] for x in range(f.fx) for y in range(f.fy))
    Gi = len(gi)
    out["inner_floor"] = [gi[min(Gi - 1, p * Gi // 100)] for p in range(101)]
    gin = sorted(f.a[x][y] for x in range(1, f.fx) for y in range(1, f.fy))
    Gn = len(gin)
    out["interior_floor"] = [gin[min(Gn - 1, p * Gn // 100)] for p in range(101)]
    out["plots_floor"] = [ph[min(N - 1, p * N // 100)] for p in range(101)]
    out["plots_floor_p100_255"] = [255 if p == 100 else ph[min(N - 1, p * N // 100)] for p in range(101)]
    out["grid_floor"] = [gh[min(G - 1, p * G // 100)] for p in range(101)]
    out["grid_floor_p100_255"] = [255 if p == 100 else gh[min(G - 1, p * G // 100)] for p in range(101)]
    out["plots_ceilm1"] = [ph[clamp(-(-p * N // 100) - 1, 0, N - 1)] for p in range(101)]

    def bis(heights, n, strict_count, le):
        res = []
        for p in range(101):
            lo, hi = 0, 255
            est = 255 * p // 100
            it = 0
            while est != lo and it < 64:
                it += 1
                c = sum(1 for h in heights if (h < est if strict_count else h <= est))
                q = c * 100 // n
                if (q <= p) if le else (q < p):
                    lo = est
                    est = (est + hi) // 2
                else:
                    hi = est
                    est = (est + lo) // 2
            res.append(est)
        return res
    for sc in (True, False):
        for le in (True, False):
            out[f"bisect_plots_{'lt' if sc else 'le'}count_{'le' if le else 'lt'}"] = bis(ph, N, sc, le)
            out[f"bisect_grid_{'lt' if sc else 'le'}count_{'le' if le else 'lt'}"] = bis(gh, G, sc, le)
            out[f"bisect_inner_{'lt' if sc else 'le'}count_{'le' if le else 'lt'}"] = bis(gi, Gi, sc, le)
            out[f"bisect_interior_{'lt' if sc else 'le'}count_{'le' if le else 'lt'}"] = bis(gin, Gn, sc, le)
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("--case", default="")
    a = p.parse_args()
    tot = {}
    for ln in pathlib.Path(a.dump).read_text(encoding="utf-8").splitlines():
        rec = json.loads(ln)
        if rec.get("rift"):
            continue
        f = Fractal(rec["w"], rec["h"], rec["grain"], Rng(rec["state_before"]), set(rec["flags"]), rec["xe"], rec["ye"])
        c = cands(f, rec)
        if rec["name"] == a.case:
            print("game ", rec["pct"])
            for k, v in c.items():
                print(k, v)
        for k, v in c.items():
            tot[k] = tot.get(k, 0) + sum(x == y for x, y in zip(v, rec["pct"]))
    for k, v in sorted(tot.items(), key=lambda kv: -kv[1]):
        print(f"{v:5d}  {k}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
