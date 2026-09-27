"""B-91-S1: whose religion a worship building follows. Reads `b91s1_read.lua`
records (one JSON line per religion and per city) and scores three readings
of "this city may build worship building W" against the exclusion test
(`CanProduce(hash, true)`) and the faith purchase's exclusion test. A row is
OFFERED when the test passes or when the full test refuses it WITH a reason
(a missing Holy Site, a pillaged one); a silent refusal is not offered:

  owner     W's belief is in the religion the city's OWNER founded
  majority  W's belief is in the CITY's majority religion
  civ       W's belief is in the owner's majority-of-cities religion

A building is matched to its belief by name (BUILDING_X <- BELIEF_X).

    python tools/civ6lab/b91s1_fit.py tools/civ6lab/runs/b91s1_<save>_<stamp>.jsonl ...
"""
from __future__ import annotations

import json
import sys


def main(paths: list[str]) -> int:
    for path in paths:
        rels: dict[int, set[str]] = {}
        cities = []
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line.startswith("{"):
                continue
            r = json.loads(line)
            if r.get("kind") == "religion":
                rels[r["religion"]] = set(r["beliefs"])
            elif r.get("kind") == "city":
                cities.append(r)
        score = {h: [0, 0] for h in ("owner", "majority", "civ")}
        buy = {h: [0, 0] for h in ("owner", "majority", "civ")}
        rows = 0
        misses: dict[str, list] = {h: [] for h in score}
        for c in cities:
            src = {"owner": c["founded"], "majority": c["majority"], "civ": c.get("ownerMajority")}
            for w in c["worship"]:
                belief = w["b"].replace("BUILDING_", "BELIEF_")
                if w["has"]:
                    continue
                rows += 1
                for h, rel in src.items():
                    pred = isinstance(rel, int) and belief in rels.get(rel, set())
                    offered = w["canEx"] is True or bool(w.get("canWhy"))
                    ok = pred == offered
                    score[h][0 if ok else 1] += 1
                    if not ok and len(misses[h]) < 6:
                        misses[h].append((c["name"], c["p"], w["b"], rel, w["canEx"]))
                    okb = pred == (w["buyEx"] is True or bool(w.get("buyWhy")))
                    buy[h][0 if okb else 1] += 1
        print(f"== {path}: {len(cities)} cities, {rows} (city, worship building) rows without the building")
        for h in score:
            print(f"  {h:9s} CanProduce fit {score[h][0]}/{rows}   purchase fit {buy[h][0]}/{rows}")
            for m in misses[h]:
                print("     miss", m)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
