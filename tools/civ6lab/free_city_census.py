"""civ6lab free_city_census — the Free Cities' grants over the watched games
(C-60): every Free City's first read, the units standing at it (the revolt's
pair), and each new Free Cities unit after it — its turn offset from that
read, its type, and whether the city was building it the turn before
(trained) or not (granted). Then the class mix of the grants on the measured
cadence (first read + 4, + 9, + 14, ...), the weights
`FREE_CITY_GRANT_WEIGHTS` carries.

    python tools/civ6lab/free_city_census.py

Reads `runs/cs_watch_*.jsonl` (per-turn rows of player 62,
CIVILIZATION_FREE_CITIES: its cities `[x, y, pop, building, _]` and units
`[type, x, y, damage]`, no ids — a new unit is a count rise of its type) and
`runs/rebel_watch_rebel3b/3c_*.jsonl` (unit rows with ids; the Free City at
(72, 24) first read on turn 222).
"""
from __future__ import annotations

import collections
import glob
import json
import re
import sys

RUNS = "tools/civ6lab/runs"
CLASS = {
    "WARRIOR": "MELEE", "SWORDSMAN": "MELEE", "MAN_AT_ARMS": "MELEE", "MUSKETMAN": "MELEE",
    "LINE_INFANTRY": "MELEE", "INFANTRY": "MELEE", "MECHANIZED_INFANTRY": "MELEE",
    "SLINGER": "RANGED", "ARCHER": "RANGED", "CROSSBOWMAN": "RANGED", "FIELD_CANNON": "RANGED",
    "MACHINE_GUN": "RANGED",
    "HORSEMAN": "LIGHT_CAV", "COURSER": "LIGHT_CAV", "CAVALRY": "LIGHT_CAV", "HELICOPTER": "LIGHT_CAV",
    "SCOUT": "RECON", "SKIRMISHER": "RECON", "RANGER": "RECON", "SPEC_OPS": "RECON",
    "BUILDER": "BUILDER",
}
REBEL_FIRST_READ = 222


def hexdist(a, b) -> int:
    """Civ 6 offset coordinates, odd rows shifted right."""
    def cube(x, y):
        q = x - (y - (y & 1)) // 2
        return q, y, -q - y
    (ax, ay, az), (bx, by, bz) = cube(*a), cube(*b)
    return max(abs(ax - bx), abs(ay - by), abs(az - bz))


def watch_games():
    """(game, first reads {city: (turn, units at it)}, new units [(city, offset, type, how)])"""
    for f in sorted(glob.glob(f"{RUNS}/cs_watch_*.jsonl")):
        game = re.search(r"cs_watch_([A-Za-z0-9]+_\d+T\d+Z)", f).group(1)
        rows = {}
        for ln in open(f, encoding="utf-8"):
            if ln.startswith("{"):
                r = json.loads(ln)
                if r["civ"] == "CIVILIZATION_FREE_CITIES":
                    rows[r["t"]] = r
        first: dict = {}
        new = []
        prev_units = collections.Counter()
        prev_build: dict = {}
        started = False
        for t in sorted(rows):
            r = rows[t]
            cur = collections.Counter(u[0] for u in r["units"])
            for c in r["cities"]:
                first.setdefault((c[0], c[1]), (t, dict(cur)))
            if started and r["cities"]:
                for ty, n in cur.items():
                    for _ in range(max(0, n - prev_units.get(ty, 0))):
                        near = min(((hexdist((u[1], u[2]), (c[0], c[1])), (c[0], c[1]))
                                    for u in r["units"] if u[0] == ty for c in r["cities"]))[1]
                        if first[near][0] == t:
                            continue
                        how = "trained" if prev_build.get(near) == ty else "granted"
                        new.append((near, t - first[near][0], ty[5:], how))
            started = True
            prev_units = cur
            prev_build = {(c[0], c[1]): c[3] for c in r["cities"]}
        if first:
            yield game, first, new


def rebel_grants():
    """the on-cadence grants of the rebel3b / rebel3c Free City, by id"""
    out = []
    for f in sorted(glob.glob(f"{RUNS}/rebel_watch_rebel3[bc]_*.jsonl")):
        seen = {}
        for ln in open(f, encoding="utf-8"):
            r = json.loads(ln)
            if r["kind"] == "unit" and r["p"] == 62 and r["id"] not in seen:
                seen[r["id"]] = (r["turn"], r["type"][5:])
        for turn, ty in sorted(seen.values()):
            if turn > REBEL_FIRST_READ and (turn - REBEL_FIRST_READ) % 5 == 4:
                out.append((f, turn - REBEL_FIRST_READ, ty))
    return out


def main() -> int:
    grants = []
    for game, first, new in watch_games():
        for city, (t, units) in sorted(first.items(), key=lambda kv: kv[1][0]):
            print(f"{game} {city}: first read t{t}, units {units}")
        for city, off, ty, how in new:
            print(f"    {city} +{off} {ty} {how}")
            if how == "granted" and off % 5 == 4:
                grants.append(ty)
    for f, off, ty in rebel_grants():
        print(f"{f.split('/')[-1]} +{off} {ty}")
        grants.append(ty)
    mix = collections.Counter(CLASS[ty] for ty in grants)
    print(f"\n{len(grants)} grants on the cadence; class mix {dict(mix.most_common())}")
    print(f"types {dict(collections.Counter(grants).most_common())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
