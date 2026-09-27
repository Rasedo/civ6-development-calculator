"""C-1 (lab, host 4): the reactor accident's building and district rows,
tallied from `reactor_fleet.py trials --repair` records (the GameCore read:
`IsPillaged(row.Index)` per building, the Industrial Zone's `IsPillaged`).
Per severity: each event's outcome as (Industrial Zone pillaged, the
buildings newly pillaged among Workshop / Factory / Power Plant), counted;
the population change; the units within 3 by distance and outcome.

    python tools/civ6lab/c1w_tally.py tools/civ6lab/runs/reactor_reactor_base_<stamp>.jsonl ...
"""
from __future__ import annotations

import collections
import json
import sys

WATCH = ("BUILDING_WORKSHOP", "BUILDING_FACTORY", "BUILDING_POWER_PLANT")


def main() -> None:
    rows = [json.loads(ln) for f in sys.argv[1:] for ln in open(f, encoding="utf-8")]
    by = collections.defaultdict(list)
    for r in rows:
        if r.get("now") and r.get("repaired"):
            by[r["sev"].split("_")[-1]].append(r)
    for sev in ("MINOR", "MAJOR", "CATASTROPHIC"):
        rs = by.get(sev, [])
        if not rs:
            continue
        combos = collections.Counter()
        clean = 0
        pop = collections.Counter()
        units = collections.Counter()
        for r in rs:
            b, n = r["before"]["gc"], r["now"]["gc"]
            if all(b["buildings"].get(k) is False for k in WATCH) and b.get("izPillaged") is False:
                clean += 1
            hit = tuple(k[9:] for k in WATCH if n["buildings"].get(k) is True and b["buildings"].get(k) is not True)
            combos[(n.get("izPillaged") is True, hit)] += 1
            pop[n["pop"] - b["pop"]] += 1
            ub = {u[0]: u for u in b.get("units", [])}
            un = {u[0]: u for u in n.get("units", [])}
            for uid, u in ub.items():
                if uid not in un:
                    units[(u[2], "gone")] += 1
                else:
                    units[(u[2], "hit" if un[uid][3] > u[3] else "untouched")] += 1
        print(f"== {sev}: {len(rs)} events ({clean} started with all three buildings and the zone unpillaged)")
        for (iz, hit), c in sorted(combos.items(), key=lambda kv: -kv[1]):
            print(f"   zone {'PILLAGED' if iz else 'intact  '} buildings pillaged {list(hit) or '-'}: {c}")
        print("   population change:", dict(pop))
        print("   units within 3 (distance, outcome):", dict(sorted(units.items())))


if __name__ == "__main__":
    main()
