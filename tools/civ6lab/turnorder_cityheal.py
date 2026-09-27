"""Turn order: does a city (district) attacked this turn heal at the turn's end?

    python tools/civ6lab/turnorder_cityheal.py <record.jsonl> [...]

Over the GC rows of each game turn, every EV.DistrictDamageChanged
(player, district id, defence type hash, new damage, old damage) is split by
phase: the end phase runs from the barbarians' EV.PlayerTurnDeactivated to
EV.TurnEnd. A pool that took damage (new > old) in a player phase of turn T
was ATTACKED on T; a decrease in T's end phase is the end-of-turn heal. For
every (district, pool) the report prints, per turn: hit this turn, the heal at
the end and its size, and whether the city stood under siege at the end
(the last EV.CitySiegeStatusChanged (player, city id, bool) published for it
before EV.TurnEnd; a city centre's district id is its city id); the tally
splits hit / not hit and besieged / free. Records are read in the order given,
so pass one game's records in turn order.
"""
from __future__ import annotations

import collections
import json
import sys

# DefenseTypes read in the live game (both Lua states): DISTRICT_GARRISON
# 1587009065 (the city's own hit points), DISTRICT_OUTER 1839557181 (the walls)
POOL = {"1587009065": "garrison", "1839557181": "outer"}


def main() -> None:
    rows = []
    for p in sys.argv[1:]:
        rows += [json.loads(l) for l in open(p, encoding="utf-8")]
    rows = [r for r in rows if r.get("state") == "GC"]
    by_turn: dict[int, list] = collections.defaultdict(list)
    for r in rows:
        if isinstance(r["turn"], int):
            by_turn[r["turn"]].append(r)
    tally = collections.Counter()
    siege: dict = {}
    for t, rs in sorted(by_turn.items()):
        hit: dict = collections.defaultdict(float)
        heal: dict = {}
        other_drop: dict = {}
        damaged_seen: dict = {}
        end = False
        for r in rs:
            ev, a = r["ev"], r["args"]
            if ev == "EV.CitySiegeStatusChanged" and len(a) >= 3 and not end:
                siege[(a[0], a[1])] = a[2] == "true"
            if ev == "EV.PlayerTurnDeactivated" and a and a[0] == "63":
                end = True
            if ev == "EV.TurnEnd":
                end = False
            if ev == "EV.DistrictDamageChanged" and len(a) >= 5:
                key = (a[0], a[1], POOL.get(a[2], a[2]))
                new, old = float(a[3]), float(a[4])
                damaged_seen[key] = new
                if new > old and not end:
                    hit[key] += new - old
                elif new < old and end:
                    heal[key] = heal.get(key, 0) + old - new
                elif new < old:
                    other_drop[key] = other_drop.get(key, 0) + old - new
        for key in sorted(set(hit) | set(heal)):
            h = heal.get(key)
            kind = "hit" if key in hit else "not_hit"
            sg = "besieged" if siege.get((key[0], key[1])) else "free"
            tally[(kind, key[2], sg, h is not None)] += 1
            print(f"t{t} p{key[0]} d{key[1]} {key[2]:<8} {kind:<8} {sg:<8} hit={hit.get(key, 0):g} "
                  f"heal_at_end={h} drop_in_play={other_drop.get(key)} last={damaged_seen[key]:g}")
    print("--- (hit this turn?, pool, siege at the end, healed at the end): count")
    for k, n in sorted(tally.items()):
        print(f"   {k[0]:<8} {k[1]:<8} {k[2]:<8} healed={k[3]}: {n}")


if __name__ == "__main__":
    main()
