"""civ6lab c60s4_fit — C-60-S4 from `c60s4_run.py` records: per turn the
bank, gold yield, maintenance, net (yield - maintenance), the cumulative
deficit since the bank first read 0, each city's loss to bankruptcy, and
every unit that vanished (id, type, its maintenance from the install) or
appeared since the last read.

    python tools/civ6lab/c60s4_fit.py tools/civ6lab/runs/bankrupt_*.jsonl
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "install"))
from xml_check import Install  # noqa: E402


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("logs", nargs="+")
    a = p.parse_args(argv)
    maint = {}
    for cells, _ in Install().tables.get("Units", ()):
        if "UnitType" in cells:
            maint[cells["UnitType"]] = cells.get("Maintenance", maint.get(cells["UnitType"], "0"))
    for path in a.logs:
        seats, cities = {}, {}
        spec = None
        for ln in open(path, encoding="utf-8"):
            r = json.loads(ln)
            spec = r.get("units_spec", spec)
            if r.get("kind") == "seat":
                seats[r["turn"]] = r
            elif r.get("kind") == "city":
                cities.setdefault(r["turn"], []).append(r)
        print(f"== {path}  units {spec}")
        prev = None
        cum = 0.0
        for t in sorted(seats):
            s = seats[t]
            net = s["goldYield"] - s["maintenance"]
            if prev is not None:
                cum += min(0.0, prev["goldYield"] - prev["maintenance"])
            u0 = {u[0]: u[1] for u in prev["units"]} if prev else {}
            u1 = {u[0]: u[1] for u in s["units"]}
            gone = [f"{k}:{u0[k][5:]}(m{maint.get(u0[k], '?')})" for k in u0 if k not in u1]
            came = [f"{k}:{u1[k][5:]}" for k in u1 if k not in u0] if prev else []
            lost = " ".join(f"{c['name'][14:]}:{c['lostBankruptcy']}({c['amenities']}/{c['need']})" for c in cities.get(t, []))
            print(f"  t{t} bank {s['balance']} yield {s['goldYield']} maint {s['maintenance']} net {net:+g} cum {cum:+g} "
                  f"lost {lost} gone {gone} came {came}")
            prev = s
    return 0


if __name__ == "__main__":
    sys.exit(main())
