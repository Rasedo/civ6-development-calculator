"""B-31r-S1: a plundered trade route's payout as GameCore_XP2_Release.dll
codes it (Trade_Manager plunder handler 0x5545e0: the yield loop
0x554860..0x554a4e, the origin / destination route yields 0x559b30 /
0x559bc0, the speed scaling 0x5254d0), scored on every plunder record.

    python tools/civ6lab/dll_plunder.py [--rows]

The rule:
  V = sum over the yields y of (origin_y + destination_y) x (1 for Gold,
      GOLD_EQUIVALENT_OTHER_YIELDS 2 otherwise)      (the route's per-turn yields)
  base = max(50, V x (TRADE_ROUTE_TURN_DURATION_BASE 20 scaled by the game
      speed) // 2)  (fixed point 24.8, truncated; the 50 a literal, unscaled)
      — Online 20 x 50% = 10, so max(50, 5 V); Standard max(50, 10 V);
  payout = base + base x pct // 100, pct the plunderer's plunder percent
      (player field 0x1858, when > 0).
  Paid in Gold, no draw.
"""
from __future__ import annotations

import argparse
import glob
import json
import pathlib
import re

RUNS = pathlib.Path(__file__).parent / "runs"
GOLD = 2
AMT = re.compile(r"\{Amount:(-?[\d.]+),YieldIndex:(\d)\}")


def yields(route: str, side: str) -> dict[int, float]:
    m = re.search(side + r"Yields:\{(.*?)\}\}", route)
    return {int(i): float(a) for a, i in AMT.findall(m.group(1) + "}")} if m else {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", action="store_true")
    ap.add_argument("--factor", type=float, default=5.0)
    a = ap.parse_args()
    n = ok = 0
    for path in sorted(glob.glob(str(RUNS / "plunder_*.jsonl"))):
        for line in open(path, encoding="utf-8"):
            r = json.loads(line)
            gone = r.get("routesGone") or []
            gain = r.get("gain")
            if len(gone) != 1 or not gain:
                continue
            o, d = yields(gone[0], "Origin"), yields(gone[0], "Destination")
            v = sum((o.get(y, 0) + d.get(y, 0)) * (1 if y == GOLD else 2) for y in range(6))
            pred = max(50, int(v * a.factor))
            n += 1
            ok += pred == gain[0]
            if a.rows or pred != gain[0]:
                city = re.search(r"from LOC_CITY_NAME_(\w+)", gone[0])
                print(f"{pathlib.Path(path).stem:40s} {city.group(1) if city else '?':14s} O{[o.get(y, 0) for y in range(6)]}"
                      f" D{[d.get(y, 0) for y in range(6)]} V {v:g} rule {pred} read {gain[0]:g}")
    print(f"payout = max(50, {a.factor:g} x sum((O + D) x (Gold 1, other 2))): {ok}/{n} plunders exact")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
