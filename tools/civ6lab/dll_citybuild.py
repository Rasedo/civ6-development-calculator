"""C-96 / C-97: the city build AI's present value as GameCore_XP2_Release.dll
codes it (0x7a16e0; FinalRelease 0x528310), against the Default
Specialization values the game logs (AI_CityBuild.csv beside every H-1
recording).

    python tools/civ6lab/dll_citybuild.py [--item BUILDING_MONUMENT --cost 60 --v 1.0] [--rows]

A building's value is PV(v, rate, H) - PV(v, rate, T) (0x7a7590): v its
per-turn value, rate the global AI's 2.0 (GlobalAI +0x290), H the value
horizon (valueHorizons[1]), T the turns until it stands. The routine as read:
  n = 0 -> v; n < 0 -> 0; rate 0 -> v n;
  rate >= 50.0 or rate n fx(0.01) >= 10.0 -> v / (rate fx(0.01));
  else n <= 400, s = a + c/2 + e fx(1/6) with a = n r, c = n(n-1) r^2,
  e = n(n-1)(n-2) r^3 (each product truncated in 24.8, r x = rate x / 25600),
  PV = (s v) / max(r (1 + s), fx(0.01)).
Scored on the Monument (+1 Culture, no maintenance, cost 60): every Default
Specialization pick of it whose city's production reads the same in the
records t-1, t and t+1, so T = ceil(60 / production) is certain. Both the
routine as read and the exact annuity v (1 - 1.02^-n) / 0.02 are printed;
a hit is within 0.05 of the logged value.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import pathlib

RUNS = pathlib.Path(__file__).parent / "runs"
RATE = 0x200


def _pct(x: int) -> int:
    """x / 25600 truncated toward zero (the /100 magic with shift 14)"""
    return int(x / 25600) if x >= 0 else -int(-x / 25600)


def pv_fixed(v: int, rate: int, n: int) -> int:
    """0x7a16e0 in 24.8 fixed point"""
    if n == 0:
        return v
    if n < 0:
        return 0
    if rate == 0:
        return (v * (n << 8)) >> 8
    if rate >= 0x3200 or ((((rate * (n << 8)) >> 8) * 2) >> 8) >= 2560:
        return int((v << 8) / ((rate * 2) >> 8))
    n = min(n, 400)
    a = _pct((n << 8) * rate)
    b = _pct(rate * a)
    c = (b * ((n - 1) << 8)) >> 8
    d = _pct(rate * c)
    e = (d * ((n - 2) << 8)) >> 8
    s = ((128 * c) >> 8) + ((42 * e) >> 8) + a
    if s + 256 < 256:
        return 0
    den = max(_pct(rate * (s + 256)), 2)
    return int((((s * v) >> 8) << 8) / den)


def pv_exact(v: float, r: float, n: int) -> float:
    return v * (1 - (1 + r) ** -n) / r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--item", default="BUILDING_MONUMENT")
    ap.add_argument("--cost", type=float, default=60)
    ap.add_argument("--v", type=float, default=1.0)
    ap.add_argument("--h", type=int, default=100)
    ap.add_argument("--rows", action="store_true")
    ap.add_argument("--runs", default=str(RUNS))
    a = ap.parse_args()
    vf = round(a.v * 256)
    n = hit_fixed = hit_exact = 0
    for log in sorted(pathlib.Path(a.runs).glob("h1_duelw*_20261007T232459Z.logs/AI_CityBuild.csv")):
        stem = str(log.parent)[:-len(".logs")]
        recs = {}
        for line in open(stem + ".jsonl", encoding="utf-8"):
            d = json.loads(line)
            recs[d["turn"]] = d
        for row in csv.reader(open(log, encoding="utf-8", errors="replace")):
            if not row or not row[0].strip().isdigit():
                continue
            row = [c.strip() for c in row]
            if len(row) < 7 or row[5] != a.item or row[6] != "Default Specialization":
                continue
            turn, player = int(row[0]), int(row[1])
            prods = []
            for t in (turn - 1, turn, turn + 1):
                r = recs.get(t)
                c = next((c for c in r["cities"] if c["owner"] == player and c["name"] == row[2]), None) if r else None
                prods.append(c["yields"][1] if c else None)
            if prods[0] is None or len(set(prods)) != 1:
                continue
            got = float(row[-1].split()[-1])
            T = math.ceil(a.cost / prods[0])
            fixed = (pv_fixed(vf, RATE, a.h) - pv_fixed(vf, RATE, T)) / 256
            exact = pv_exact(a.v, 0.02, a.h) - pv_exact(a.v, 0.02, T)
            n += 1
            hit_fixed += abs(fixed - got) <= 0.05
            hit_exact += abs(exact - got) <= 0.05
            if a.rows:
                print(f"{log.parent.name[8:12]} t{turn} p{player} {row[2][14:]:<14} prod {prods[0]:<6} T {T:<3} "
                      f"logged {got:6.1f}  as read {fixed:6.2f}  exact {exact:6.2f}")
    print(f"{a.item}: {n} picks with the production steady; within 0.05: as read {hit_fixed}, exact annuity {hit_exact}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
