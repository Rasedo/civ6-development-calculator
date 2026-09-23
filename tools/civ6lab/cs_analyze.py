"""civ6lab cs_analyze — read a `watch.py` log and report what the city-states
did (AUDIT C-38).

    python tools/civ6lab/cs_analyze.py tools/civ6lab/runs/cs_watch_lab4_<stamp>.jsonl

Per city-state, turn by turn:
* its ARMY — living units by type, and when each appeared and vanished;
* its BUILDS — each change of the city's current item, in order (the build
  order the engines model as a ladder);
* its PURCHASES — a unit that appears on a turn the gold bank FALLS by more
  than the turn's income could explain, with the drop (a bought unit), set
  against what the city was producing;
* its WARS and suzerainty.
A purchase trigger shows as the army size and the bank on the turn before
each purchase.
"""
from __future__ import annotations

import collections
import json
import sys


def load(path: str) -> dict[int, list[dict]]:
    by_cs: dict[int, list[dict]] = collections.defaultdict(list)
    for ln in open(path, encoding="utf-8"):
        ln = ln.strip()
        if not ln.startswith("{"):
            continue
        r = json.loads(ln)
        by_cs[r["p"]].append(r)
    for rows in by_cs.values():
        rows.sort(key=lambda r: r["t"])
    return by_cs


MILITARY_SKIP = {"UNIT_SETTLER", "UNIT_BUILDER", "UNIT_TRADER"}


def army(r: dict) -> collections.Counter:
    return collections.Counter(u[0] for u in r["units"] if u[0] not in MILITARY_SKIP)


def report(rows: list[dict]) -> list[str]:
    out = [f"== p{rows[0]['p']} {rows[0]['civ']}  turns {rows[0]['t']}-{rows[-1]['t']}"]
    prev = None
    builds: list[str] = []
    incomes: list[float] = []
    for r in rows:
        cur = r["cities"][0][3] if r["cities"] else "-"
        if not builds or builds[-1].split(" ")[0] != cur:
            builds.append(f"{cur} (t{r['t']})")
        if prev is not None:
            d_gold = r["gold"] - prev["gold"]
            a0, a1 = army(prev), army(r)
            new = a1 - a0
            lost = a0 - a1
            if d_gold > 0:
                incomes.append(d_gold)
            income = sorted(incomes[-10:])[len(incomes[-10:]) // 2] if incomes else 0.0
            if new and d_gold < -max(5.0, income):
                out.append(f"  t{r['t']}: BUY? +{dict(new)} gold {prev['gold']:.0f} -> {r['gold']:.0f}"
                           f" (drop {-d_gold:.0f}), army before {sum(a0.values())}, building {cur}")
            elif new:
                out.append(f"  t{r['t']}: +{dict(new)} (gold {prev['gold']:.0f} -> {r['gold']:.0f})")
            if lost:
                out.append(f"  t{r['t']}: -{dict(lost)} (army {sum(a1.values())})")
            if r["war"] != prev["war"]:
                out.append(f"  t{r['t']}: war {prev['war']} -> {r['war']}")
            if r["suz"] != prev["suz"]:
                out.append(f"  t{r['t']}: suzerain {prev['suz']} -> {r['suz']}")
            if faith_spent(prev, r):
                out.append(f"  t{r['t']}: faith {prev['faith']:.0f} -> {r['faith']:.0f}")
        prev = r
    out.append("  builds: " + " > ".join(builds))
    last = rows[-1]
    out.append(f"  end: gold {last['gold']:.0f} faith {last['faith']:.0f} army {dict(army(last))}"
               f" pop {[c[2] for c in last['cities']]}")
    return out


def faith_spent(a: dict, b: dict) -> bool:
    return b["faith"] < a["faith"] - 0.5


def main(argv=None) -> int:
    path = (argv or sys.argv[1:])[0]
    for p, rows in sorted(load(path).items()):
        print("\n".join(report(rows)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
