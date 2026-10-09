"""C-96 / C-97: the city build AI's present value as the game DLL codes it
(Release 0x7a16e0, FinalRelease 0x528310; `dll_emu.py pv` runs the shipped
routine and agrees with `pv_fixed` bit for bit), against the Default
Specialization values the game logs (AI_CityBuild.csv beside every H-1
recording).

    python tools/civ6lab/dll_citybuild.py [--rows]

A building's value is PV(v, rate, H) - PV(v, rate, T) (0x7a7590) plus terms
added after it: v its per-turn value, rate the global AI's 2.0 (GlobalAI
+0x290), H the value horizon (valueHorizons[1]), T the turns until it stands.
The routine:
  n = 0 -> v; n < 0 -> 0; rate 0 -> v n;
  rate >= 50.0 or rate n fx(0.01) >= 10.0 -> v / (rate fx(0.01));
  else n <= 400, s = a + c/2 + e fx(1/6) with a = n r, c = n(n-1) r^2,
  e = n(n-1)(n-2) r^3 (each product truncated in 24.8, r x = rate x / 25600),
  PV = (s v) / max(r (1 + s), fx(0.01)).
Scored on every Default Specialization Monument pick of a city-state (+1
Culture, no maintenance; a city-state's Culture weight is 0, so v = 1.0):
the city's production from the record of the pick's turn (t + 1 for a city
founded that turn); T at Online's cost 30 or the Standard cost 60, H 50 or
100, the shipped routine or the exact annuity (1 - 1.02^-n) / 0.02; a hit
prints the logged value at its one decimal.
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
    return v * (1 - (1 + r) ** -n) / r if n > 0 else (v if n == 0 else 0.0)


MODELS = {
    "dll   H 50  T at cost 30": (lambda n: pv_fixed(256, RATE, n) / 256, 50, 30),
    "dll   H 100 T at cost 60": (lambda n: pv_fixed(256, RATE, n) / 256, 100, 60),
    "exact H 50  T at cost 30": (lambda n: pv_exact(1.0, 0.02, n), 50, 30),
    "exact H 100 T at cost 60": (lambda n: pv_exact(1.0, 0.02, n), 100, 60),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", action="store_true")
    ap.add_argument("--runs", default=str(RUNS))
    a = ap.parse_args()
    hits = dict.fromkeys(MODELS, 0)
    n = 0
    for log in sorted(pathlib.Path(a.runs).glob("h1_duelw*_20261007T232459Z.logs/AI_CityBuild.csv")):
        stem = str(log.parent)[:-len(".logs")]
        recs = {}
        for line in open(stem + ".jsonl", encoding="utf-8"):
            d = json.loads(line)
            recs[d["turn"]] = d
        for row in csv.reader(open(log, encoding="utf-8", errors="replace")):
            row = [c.strip() for c in row]
            if len(row) < 7 or not row[0].isdigit() or row[5] != "BUILDING_MONUMENT" \
                    or row[6] != "Default Specialization" or int(row[1]) < 2:
                continue
            turn, player, logged = int(row[0]), int(row[1]), row[-1].split()[-1]
            n += 1
            city = None
            for t in (turn, turn + 1):
                rec = recs.get(t)
                city = next((c for c in rec["cities"] if c["owner"] == player and c["name"] == row[2]), None) \
                    if rec else None
                if city:
                    break
            prod = city["yields"][1] if city else 0
            if prod <= 0:
                continue
            out = []
            for name, (pv, horizon, cost) in MODELS.items():
                turns = math.ceil(cost / prod)
                value = pv(horizon) - pv(turns) if turns < horizon else None
                hit = value is not None and f"{value:.1f}" == logged
                hits[name] += hit
                out.append(f"{'-' if value is None else f'{value:.2f}':>6}{'*' if hit else ' '}")
            if a.rows:
                print(f"{log.parent.name[8:12]} t{turn:<3} p{player} {row[2][14:]:<14} prod {prod:<7.3f} "
                      f"logged {logged:>5}  " + " ".join(out))
    print(f"city-state Monument picks: {n}")
    for name, h in hits.items():
        print(f"  {name}: {h}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
