"""C-96 / C-97: the city build AI's present value as the game DLL codes it
(Release 0x7a16e0, FinalRelease 0x528310; `dll_emu.py pv` runs the shipped
routine and agrees with `pv_fixed` bit for bit), against the value tables
the game logs with its verbose AI logs (AI_CityBuild.csv's PLOT ANALYSIS LOG
beside the runs/h1_duelv* recordings).

    python tools/civ6lab/dll_citybuild.py

A building's value is PV(v, rate, H) - PV(v, rate, T) (0x7a7590) plus terms
added after it: v its per-turn value, rate the GlobalAI's 4.0 online, H the
value horizon (valueHorizons[1], 50 online), T the turns until it stands.
The routine:
  n = 0 -> v; n < 0 -> 0; rate 0 -> v n;
  rate >= 50.0 or rate n fx(0.01) >= 10.0 -> v / (rate fx(0.01));
  else n <= 400, s = a + c/2 + e fx(1/6) with a = n r, c = n(n-1) r^2,
  e = n(n-1)(n-2) r^3 (each product truncated in 24.8, r x = rate x / 25600),
  PV = (s v) / max(r (1 + s), fx(0.01)).
The check: a city-state's Monument is +1 Culture at its weight 0 (v 1.0) and
MONUMENT_CULTURE_AT_FULL_LOYALTY's whole number, so every value the tables
log for it is X + trunc(X), X = PV(1.0, H) - PV(1.0, T), at some whole T
below the horizon. Printed: the logged values, those the routine prints at
some T, those the exact annuity (1 - 1.04^-n) / 0.04 prints at some T.
"""
from __future__ import annotations

import pathlib

HERE = pathlib.Path(__file__).resolve().parent
# the recordings live in the checkout (a worktree under .claude/worktrees reads its parent's)
RUNS = next((p / "runs" for p in (HERE, HERE.parents[4] / "tools" / "civ6lab") if any((p / "runs").glob("h1_duelv*.logs"))),
            HERE / "runs")
RATE = 0x400
HORIZON = 50
MONUMENT = 0  # Buildings rowid order: BUILDING_MONUMENT first


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


def _routine(t: int) -> float:
    x = pv_fixed(256, RATE, HORIZON) - pv_fixed(256, RATE, t)
    return (x + (x >> 8 << 8)) / 256


def _annuity(t: int) -> float:
    a = lambda n: (1 - 1.04 ** -n) / 0.04  # noqa: E731
    x = a(HORIZON) - a(t)
    return x + int(x)


def main() -> int:
    ladders = {"routine": {f"{_routine(t):.2f}" for t in range(HORIZON)},
               "exact annuity": {f"{_annuity(t):.2f}" for t in range(HORIZON)}}
    n = 0
    hits = dict.fromkeys(ladders, 0)
    for log in sorted(RUNS.glob("h1_duelv*.logs/AI_CityBuild.csv")):
        player, state = None, ""
        for line in open(log, encoding="utf-8", errors="replace"):
            if line.startswith(",,,BUILDINGS,"):
                if state == "centre" and player is not None and 2 <= player < 63:
                    v = line.split(",")[4 + MONUMENT].strip()
                    if v != "-9999.00":
                        n += 1
                        for k, lad in ladders.items():
                            hits[k] += v in lad
                continue
            if line.startswith(",,,"):
                continue
            p = [x.strip() for x in line.split(",")]
            if len(p) > 3 and p[3] == "PLOT ANALYSIS LOG":
                player, state = int(p[1]), "header"
            elif len(p) > 3 and p[0].isdigit() and p[2] == "":
                state = "centre" if state == "header" else "plot"
            else:
                state = ""
    print(f"city-state Monument values logged: {n}")
    for k, h in hits.items():
        print(f"  printed by the {k} at some T: {h}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
