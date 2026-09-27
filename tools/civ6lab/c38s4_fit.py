"""C-38-S4: the levy price per arm (pair_run `c38s4_levy` records) — seat ZP's
`GetLevyMilitaryCost` for every living minor beside the minor's military
units' summed gold purchase price, per arm, and the ratio to the control.

    python tools/civ6lab/c38s4_fit.py tools/civ6lab/runs/c38s4_levy_<stamp>.jsonl [--p 0]
"""
from __future__ import annotations

import argparse
import json


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--p", type=int, default=0)
    a = ap.parse_args(argv)
    recs = [json.loads(l) for l in open(a.path, encoding="utf-8")]
    table: dict[int, dict[str, object]] = {}
    sums: dict[int, object] = {}
    for r in recs:
        for x in r["pre"][0]["json"]:
            if x.get("kind") != "levy":
                continue
            sums[x["minor"]] = (x["unitGoldSum"], len(x["units"]), x["suzerain"])
            for pr in x["prices"]:
                if pr["p"] == a.p:
                    table.setdefault(x["minor"], {})[r["arm"]] = pr["cost"]
        for key in ("gc", "steps"):
            v = r.get(key)
            for blk in (v if isinstance(v, list) else [v] if v else []):
                for js in blk.get("json", []):
                    print(r["arm"], "attach:", js)
    arms = [r["arm"] for r in recs]
    print("minor  sum25%  units suz | " + " ".join(f"{x:>11s}" for x in arms))
    for m in sorted(table):
        s, n, suz = sums[m]
        ctl = table[m].get("control")
        cells = []
        for arm in arms:
            v = table[m].get(arm)
            ratio = f"{v / ctl:.3f}" if isinstance(v, (int, float)) and isinstance(ctl, (int, float)) and ctl else "-"
            cells.append(f"{v!s:>5s}/{ratio:>5s}")
        print(f"p{m:<4d} {s * 0.25:7.2f} {n:5d} {suz!s:>3s} | " + " ".join(cells))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
