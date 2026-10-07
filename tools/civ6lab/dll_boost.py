"""THE BOOST AMOUNT (dll_readings.md, "a boost lands as progress") scored on
the H-1 duels: every boost a record pair shows landing on the item a major
researched in both records, its progress gain against the DLL's amount plus
the turn's yield.

    python tools/civ6lab/dll_boost.py [runs-dir]

China's m_iModifiedBoost is Dynastic Cycle's 10; every other major's 0.
"""
from __future__ import annotations

import glob
import json
import pathlib
import sys

RUNS = pathlib.Path(__file__).parent / "runs"


def amount(cost: int, pct: int, points: int) -> int:
    """0x4cd900 / 0x3a3c00 in 24.8 fixed point"""
    if cost <= 0:
        return 0
    b = pct * cost // 100
    q = (b << 16) // (cost << 8)
    return ((cost << 8) * (q * 100 + (points << 8)) // 25600) >> 8


def main(runs: pathlib.Path) -> int:
    exact = other = 0
    for path in sorted(glob.glob(str(runs / "h1_duelw11*.jsonl"))):
        recs = [r for r in (json.loads(x) for x in open(path, encoding="utf-8")) if "players" in r]
        for a, b in zip(recs, recs[1:]):
            pa = {p["id"]: p for p in a["players"]}
            for p1 in b["players"]:
                p0 = pa.get(p1["id"])
                if not p0 or not p1.get("major"):
                    continue
                for bits, cur, prog, cost, yld in (("techBoosts", "researching", "researchProgress", "researchCost", "scienceYield"),
                                                   ("civicBoosts", "civic", "civicProgress", "civicCost", "cultureYield")):
                    new = [i for i, (x, y) in enumerate(zip(p0.get(bits, ""), p1.get(bits, ""))) if x == "0" and y == "1"]
                    for i in new:
                        if i != int(p0[cur]) or i != int(p1[cur]) or not float(p0.get(prog) or 0):
                            continue
                        c = int(float(p1[cost]))
                        am = amount(c, 40, 10 if "CHINA" in str(p1["civ"]) else 0)
                        rest = float(p1[prog]) - float(p0[prog]) - am
                        if abs(rest - float(p0[yld])) < 0.01 or abs(rest - float(p1[yld])) < 0.01:
                            exact += 1
                        else:
                            other += 1
                            print(f"{pathlib.Path(path).name[:14]} t{b['turn']} {p1['civ']} {bits} {i}: cost {c} amount {am} left {rest:.3f}")
    print(f"boost amount: {exact} exact, {other} with a second grant")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else RUNS))
