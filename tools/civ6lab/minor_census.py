"""W-MIN census pass 1: every minor-game's build runs, their completions and units.

A game is one watch (lab4's three files are one game split by restarts). A
minor-game is (game, player). Free Cities (p62 / CIVILIZATION_FREE_CITIES) is
not a minor. A RUN is a maximal stretch of turns with one CurrentlyBuilding
value; a run of UNIT_X "completes" when the next record shows one more X than
the run's last record (trained), and a run of a building / district
"completes" when the item never recurs later for that minor.
"""
from __future__ import annotations

import collections
import glob
import json
import pickle
import re

TYPES = {}
for ln in open("tools/civ6lab/minor_census_types.txt", encoding="utf-8"):
    a, b = ln.split()
    TYPES["CIVILIZATION_" + a] = b


def game_of(path: str) -> str:
    m = re.search(r"cs_watch_([A-Za-z0-9]+)_", path)
    return m.group(1)


def load():
    games: dict[str, dict[int, dict[int, dict]]] = collections.defaultdict(lambda: collections.defaultdict(dict))
    for f in sorted(glob.glob("tools/civ6lab/runs/cs_watch_*.jsonl")):
        g = game_of(f)
        for ln in open(f, encoding="utf-8"):
            ln = ln.strip()
            if not ln.startswith("{"):
                continue
            r = json.loads(ln)
            if r["civ"] == "CIVILIZATION_FREE_CITIES":
                continue
            games[g][r["p"]][r["t"]] = r
    out = {}
    for g, ps in games.items():
        for p, byt in ps.items():
            rows = [byt[t] for t in sorted(byt)]
            out[(g, p)] = rows
    return out


def runs_of(rows):
    """[(item, t_first, t_last, idx_first, idx_last)] over rows holding a city."""
    runs = []
    for i, r in enumerate(rows):
        if not r["cities"]:
            continue
        it = r["cities"][0][3]
        if runs and runs[-1][0] == it and rows[runs[-1][4]]["t"] == r["t"] - 1:
            runs[-1][2] = r["t"]
            runs[-1][4] = i
        else:
            runs.append([it, r["t"], r["t"], i, i])
    return runs


def ucount(r, typ):
    return sum(1 for u in r["units"] if u[0] == typ)


def main():
    data = load()
    mg = {}
    for key, rows in data.items():
        civ = rows[0]["civ"]
        typ = TYPES.get(civ, "?")
        rn = runs_of(rows)
        events = []  # (item, start, end, completed)
        for k, (it, t0, t1, i0, i1) in enumerate(rn):
            done = None
            if it.startswith("UNIT_"):
                if i1 + 1 < len(rows):
                    done = ucount(rows[i1 + 1], it) > ucount(rows[i1], it)
            elif it not in ("NONE", "?"):
                done = not any(r2[0] == it for r2 in rn[k + 1:])
            events.append((it, t0, t1, done))
        mg[key] = {"civ": civ, "type": typ, "events": events, "tmax": rows[-1]["t"], "tmin": rows[0]["t"]}
    pickle.dump(mg, open(".claude/scratchpad/wmin_census.pkl", "wb"))
    print(len(mg), "minor-games")
    print(collections.Counter(v["type"] for v in mg.values()))


if __name__ == "__main__":
    main()
