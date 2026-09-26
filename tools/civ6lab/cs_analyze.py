"""civ6lab cs_analyze — read a `watch.py` log and report what the city-states
did (AUDIT C-38).

    python tools/civ6lab/cs_analyze.py tools/civ6lab/runs/cs_watch_lab4_<stamp>.jsonl

Per city-state (the Free Cities player is not one and is left out), turn by
turn:
* its UNITS — living units by type (Builders included, Settlers and Traders
  not), and when each appeared and vanished;
* its UPGRADES — a unit of type L that vanishes on the turn a unit of a type
  L upgrades to appears (the install's `UnitUpgrades`, followed down the
  chain), with the gold drop that turn. An upgrade is never a purchase;
* its BUILDS — each change of the city's current item, in order (the build
  order the engines model as a ladder);
* its PURCHASES — a unit left after the upgrades are paired that appears on
  a turn the gold bank FALLS by more than the turn's income could explain,
  with the drop, set against what the city was producing;
* its WARS and suzerainty.
A purchase trigger shows as the military size (Builders not counted) and the
bank on the turn before each purchase.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "install"))
from xml_check import Install  # noqa: E402

FREE_CITIES = "CIVILIZATION_FREE_CITIES"


def load(path: str) -> dict[int, list[dict]]:
    by_cs: dict[int, list[dict]] = collections.defaultdict(list)
    for ln in open(path, encoding="utf-8"):
        ln = ln.strip()
        if not ln.startswith("{"):
            continue
        r = json.loads(ln)
        if r.get("civ") == FREE_CITIES:
            continue
        by_cs[r["p"]].append(r)
    for rows in by_cs.values():
        rows.sort(key=lambda r: r["t"])
    return by_cs


def upgrade_chains() -> dict[str, set[str]]:
    """unit type -> every type it reaches through the layered install's
    `UnitUpgrades` (the last row written for a unit wins)."""
    step: dict[str, str] = {}
    for cells, _ in Install().tables.get("UnitUpgrades", ()):
        if "Unit" in cells and "UpgradeUnit" in cells:
            step[cells["Unit"]] = cells["UpgradeUnit"]
    reach: dict[str, set[str]] = {}
    for u in step:
        seen: set[str] = set()
        v = step.get(u)
        while v is not None and v not in seen:
            seen.add(v)
            v = step.get(v)
        reach[u] = seen
    return reach


NOT_BOUGHT = {"UNIT_SETTLER", "UNIT_TRADER"}
CIVILIAN = {"UNIT_BUILDER"}


def army(r: dict) -> collections.Counter:
    """the units a city-state can buy, by type: everything but Settlers and
    Traders, Builders included."""
    return collections.Counter(u[0] for u in r["units"] if u[0] not in NOT_BOUGHT)


def military(c: collections.Counter) -> int:
    return sum(n for k, n in c.items() if k not in CIVILIAN)


def pair_upgrades(new: collections.Counter, lost: collections.Counter,
                  reach: dict[str, set[str]]) -> list[tuple[str, str]]:
    """take each (old type, new type) pair an upgrade explains out of `new`
    and `lost` (in place) and return the pairs."""
    pairs: list[tuple[str, str]] = []
    for old in sorted(lost):
        for up in sorted(new):
            while lost[old] > 0 and new[up] > 0 and up in reach.get(old, ()):
                pairs.append((old, up))
                lost[old] -= 1
                new[up] -= 1
    lost += collections.Counter()   # drop the zero counts
    new += collections.Counter()
    return pairs


def report(rows: list[dict], reach: dict[str, set[str]]) -> list[str]:
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
            ups = pair_upgrades(new, lost, reach)
            if d_gold > 0:
                incomes.append(d_gold)
            income = sorted(incomes[-10:])[len(incomes[-10:]) // 2] if incomes else 0.0
            if ups:
                out.append(f"  t{r['t']}: UPGRADE {', '.join(f'{o}->{u}' for o, u in ups)}"
                           f" gold {prev['gold']:.0f} -> {r['gold']:.0f}")
            if new and d_gold < -max(5.0, income):
                out.append(f"  t{r['t']}: BUY? +{dict(new)} gold {prev['gold']:.0f} -> {r['gold']:.0f}"
                           f" (drop {-d_gold:.0f}), military before {military(a0)}, building {cur}")
            elif new:
                out.append(f"  t{r['t']}: +{dict(new)} (gold {prev['gold']:.0f} -> {r['gold']:.0f})")
            if lost:
                out.append(f"  t{r['t']}: -{dict(lost)} (military {military(a1)})")
            if r["war"] != prev["war"]:
                out.append(f"  t{r['t']}: war {prev['war']} -> {r['war']}")
            if r["suz"] != prev["suz"]:
                out.append(f"  t{r['t']}: suzerain {prev['suz']} -> {r['suz']}")
            if faith_spent(prev, r):
                out.append(f"  t{r['t']}: faith {prev['faith']:.0f} -> {r['faith']:.0f}")
        prev = r
    out.append("  builds: " + " > ".join(builds))
    last = rows[-1]
    faith = last["faith"]
    faith = f"{faith:.0f}" if isinstance(faith, (int, float)) else faith
    out.append(f"  end: gold {last['gold']:.0f} faith {faith} units {dict(army(last))}"
               f" pop {[c[2] for c in last['cities']]}")
    return out


def faith_spent(a: dict, b: dict) -> bool:
    """faith is a number, or "err:<msg>" when the watch's read threw"""
    fa, fb = a["faith"], b["faith"]
    return isinstance(fa, (int, float)) and isinstance(fb, (int, float)) and fb < fa - 0.5


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("log", help="a cs_watch_*.jsonl written by watch.py")
    a = p.parse_args(argv)
    reach = upgrade_chains()
    for _, rows in sorted(load(a.log).items()):
        print("\n".join(report(rows, reach)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
