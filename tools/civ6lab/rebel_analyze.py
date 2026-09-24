"""civ6lab rebel_analyze — read a `rebel_watch.lua` log (C-60, REBELLION):
every barbarian or Free City unit that first appears within --reach of a
major's city standing in Unrest or Revolt (that turn or the one before) is a
rebel candidate; they group by (turn, city) into squads, printed with their
types beside the city's tier, and the unhappy city-turns are counted so a
per-turn chance can be read off.

    python tools/civ6lab/rebel_analyze.py tools/civ6lab/runs/rebel_watch_*.jsonl
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict

TIER = {0: "REVOLT", 1: "UNREST"}


def hexdist(a: tuple[int, int], b: tuple[int, int]) -> int:
    """Civ 6 offset coordinates, odd rows shifted right."""
    def cube(x: int, y: int) -> tuple[int, int, int]:
        q = x - (y - (y & 1)) // 2
        return q, y, -q - y
    (ax, ay, az), (bx, by, bz) = cube(*a), cube(*b)
    return max(abs(ax - bx), abs(ay - by), abs(az - bz))


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("logs", nargs="+")
    p.add_argument("--reach", type=int, default=2)
    a = p.parse_args(argv)
    for path in a.logs:
        cities = defaultdict(list)      # turn -> unhappy cities
        units = defaultdict(dict)       # turn -> {(p, id): row}
        for line in open(path, encoding="utf-8"):
            if not line.startswith("{"):
                continue
            r = json.loads(line)
            if r["kind"] == "city":
                cities[r["turn"]].append(r)
            else:
                units[r["turn"]][(r["p"], r["id"])] = r
        turns = sorted(units)
        seen: set = set(units[turns[0]]) if turns else set()
        squads = defaultdict(list)
        for t in turns[1:]:
            near = cities[t] + cities.get(t - 1, [])
            for key, u in units[t].items():
                if key in seen:
                    continue
                seen.add(key)
                best = min(((hexdist((u["x"], u["y"]), (c["x"], c["y"])), c) for c in near),
                           key=lambda dc: dc[0], default=(99, None))
                if best[0] <= a.reach:
                    c = best[1]
                    squads[(t, c["p"], c["id"])].append((u["type"], u["p"], best[0], c))
        unhappy = sum(len(v) for v in cities.values())
        by_tier = defaultdict(int)
        for v in cities.values():
            for c in v:
                by_tier[TIER.get(c["tier"], c["tier"])] += 1
        print(f"== {path}: turns {turns[0] if turns else '-'}..{turns[-1] if turns else '-'}, "
              f"unhappy city-turns {unhappy} {dict(by_tier)}, squads {len(squads)}")
        for (t, cp, cid), us in sorted(squads.items()):
            c = us[0][3]
            kinds = defaultdict(int)
            for ty, up, _, _ in us:
                kinds[f"{ty}@p{up}"] += 1
            print(f"  t{t} city p{cp}#{cid} at {c['x']}:{c['y']} {TIER.get(c['tier'], c['tier'])} "
                  f"pop {c['pop']} amen {c['amen']}/{c['need']}: {dict(kinds)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
