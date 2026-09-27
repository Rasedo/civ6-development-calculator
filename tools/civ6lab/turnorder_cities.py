"""Turn order: the per-city GE events inside each player's start-of-turn block.

    python tools/civ6lab/turnorder_cities.py <record.jsonl> [...]

For every GE.PlayerTurnStarted p .. GE.PlayerTurnStartComplete p block (the
synchronous GameCore events, in the order the DLL fires them), prints the
city-keyed events in order with the sync draws before each, and counts:
  * whether the cities appear in ascending city-id order (no city revisited),
  * per city, which of production (BuildingConstructed / UnitCreated /
    OnDistrictConstructed) and population (OnCityPopulationChanged) came first.
"""
from __future__ import annotations

import collections
import json
import sys

sys.path.insert(0, __import__("pathlib").Path(__file__).parent.as_posix())
from turnorder_analyze import steps  # noqa: E402

PROD = {"GE.BuildingConstructed": 1, "GE.UnitCreated": 3, "GE.OnDistrictConstructed": None}
POP = "GE.OnCityPopulationChanged"


def city_of(ev: str, args: list[str]) -> str | None:
    if ev == "GE.BuildingConstructed" or ev == POP:
        return args[1] if len(args) > 1 else None
    if ev == "GE.UnitCreated":
        return args[3] if len(args) > 3 else None
    return None


def main() -> None:
    order_ok = order_bad = 0
    firsts = collections.Counter()
    for path in sys.argv[1:]:
        rows = [json.loads(l) for l in open(path, encoding="utf-8")]
        rows = [r for r in rows if r.get("state") == "GC"]
        cur = None
        seen: list[str] = []
        per: dict[str, list[str]] = {}
        prev_seed = None
        for r in rows:
            d = steps(prev_seed, r["seed"])
            if r["seed"] is not None:
                prev_seed = r["seed"]
            ev, a = r["ev"], r["args"]
            if ev == "GE.PlayerTurnStarted":
                cur = a[0]
                seen, per = [], {}
                print(f"-- t{r['turn']} player {cur} start")
                continue
            if cur is None:
                continue
            if ev == "GE.PlayerTurnStartComplete":
                ids = [int(x) for x in seen]
                mono = all(ids[i] < ids[i + 1] for i in range(len(ids) - 1))
                if len(ids) > 1:
                    order_ok += mono
                    order_bad += not mono
                for c, evs in per.items():
                    kinds = ["prod" if e in PROD else "pop" for e in evs]
                    if "prod" in kinds and "pop" in kinds:
                        firsts[kinds[0] + "_first"] += 1
                print(f"   complete (d{d}); cities in order {seen} ascending={mono}")
                cur = None
                continue
            c = city_of(ev, a)
            print(f"   d{d:>3} {ev:<28} {'|'.join(a[:5])}")
            if c is not None:
                if not seen or seen[-1] != c:
                    seen.append(c)
                per.setdefault(c, []).append(ev)
    print(f"blocks with ascending city order: {order_ok}, not: {order_bad}")
    print(f"same-city production vs population, which first: {dict(firsts)}")


if __name__ == "__main__":
    main()
