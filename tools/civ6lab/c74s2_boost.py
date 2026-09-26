"""C-74-S2: the climate screen's family chances against a first-occurrence
boost, read every turn of the Duel games (and any game the per-turn reader
`c74s2_turn.lua` watched).

    python tools/civ6lab/c74s2_boost.py [tag glob, default c74s2_duel*]

Model: family percent = floor(100 x sum over eligible (row, site) of
    Occ(row) x b(row, site) x (1 + CIPD(row)/100 x T) / N_kind)
with b = 1 + B/100 while the pair has NOT yet occurred in this game, else 1
(`FIRST_TIME_OCCURRENCE_BOOST` B = 30 in the install), and N_kind one
normaliser for the rows counted per site (floods per floodable river,
eruptions per active volcano and per volcano wonder) and one for the rows
counted once per map (storms, droughts, fires). A pair has occurred once an
event of that row started at that site on a turn before the read (a flood's
site is its river, keyed by the river's first floodplain plot = the event's
StartLocation; an eruption's is its volcano plot; a once-per-map row's is the
map). For each family and each boost granularity (per (row, site), per row,
per site, none) the script prints the interval of N every read allows, and
the reads that break it.
"""
from __future__ import annotations

import collections
import json
import math
import pathlib
import re
import sys

RUNS = pathlib.Path(__file__).parent / "runs"
# (row, Occ, CIPD) at MODERATE, the install's RandomEvent_Frequencies and RandomEvents
FLOOD = [("FLOOD_MODERATE", 2, 20), ("FLOOD_MAJOR", 1.5, 20), ("FLOOD_1000_YEAR", 1, 20)]
ERUPT = [("VOLCANO_GENTLE", 4, 0), ("VOLCANO_CATASTROPHIC", 2.5, 0), ("VOLCANO_MEGACOLOSSAL", 1.5, 0)]
NW = {"FEATURE_KILIMANJARO": [("KILIMANJARO_GENTLE", 4, 0), ("KILIMANJARO_CATASTROPHIC", 2.5, 0)],
      "FEATURE_EYJAFJALLAJOKULL": [("EYJAFJALLAJOKULL_CATASTROPHIC", 4, 0), ("EYJAFJALLAJOKULL_MEGACOLOSSAL", 2.5, 0)],
      "FEATURE_VESUVIUS": [("VESUVIUS_MEGACOLOSSAL", 7, 0)]}
STORM = [("BLIZZARD_CRIPPLING", 2, 50), ("BLIZZARD_SIGNIFICANT", 8, 0), ("DUST_STORM_GRADIENT", 8, 0),
         ("DUST_STORM_HABOOB", 2, 50), ("HURRICANE_CAT_4", 15, 0), ("HURRICANE_CAT_5", 3, 50),
         ("TORNADO_FAMILY", 15, 0), ("TORNADO_OUTBREAK", 3, 50)]
DROUGHT = [("DROUGHT_MAJOR", 23, 0), ("DROUGHT_EXTREME", 5, 50)]
FIRE = [("FOREST_FIRE", 6, 50), ("JUNGLE_FIRE", 6, 50)]
KEYS = {"flood": "GetFloodPercentChance", "erupt": "GetEruptionPercentChance", "storm": "GetStormPercentChance",
        "drought": "GetDroughtPercentChance", "fire": "GetFirePercentChance"}


def load(tag):
    turns = collections.defaultdict(dict)
    for f in sorted(RUNS.glob(f"c74s2_turn_{tag}_*.jsonl")):
        for ln in open(f, encoding="utf-8"):
            if ln.startswith("{"):
                r = json.loads(ln)
                if r["kind"] != "dmap":
                    turns[r["turn"]][r["kind"]] = r
    events = []
    for f in sorted(RUNS.glob(f"event_history_{tag}_*.txt")):
        for ln in open(f, encoding="utf-8"):
            if ln.startswith("{"):
                h = json.loads(ln)
                if h.get("kind") == "turn" and isinstance(h.get("event"), dict):
                    e = h["event"]
                    events.append((e["StartTurn"], (h.get("eventType") or "")[13:], e.get("StartLocation")))
    return turns, events


def family_rows(fam, tr):
    """[(row, Occ, CIPD, site)] eligible at this read"""
    out = []
    if fam == "flood":
        for r in tr["rv"]["r"]:
            if r[3] > 0:
                out += [(n, o, c, r[1]) for n, o, c in FLOOD]
    elif fam == "erupt":
        for v in tr["volc"]["v"]:
            if v[1] is not True:
                continue
            if v[4]:
                out += [(n, o, c, "nw:" + v[5]) for n, o, c in NW.get(v[5], [])] if len(v) > 5 else []
            else:
                out += [(n, o, c, v[0]) for n, o, c in ERUPT]
    else:
        rows = {"storm": STORM, "drought": DROUGHT, "fire": FIRE}[fam]
        out = [(n, o, c, "map") for n, o, c in rows]
    if fam == "flood":
        # two rivers can share a first floodplain plot (a confluence): each is a site
        return out
    # a volcano wonder spans several plots: its rows once per wonder
    seen, uniq = set(), []
    for x in out:
        if x not in seen:
            seen.add(x)
            uniq.append(x)
    return uniq


def site_of(fam, row, loc, tr):
    if fam in ("storm", "drought", "fire"):
        return "map"
    if fam == "erupt":
        for v in tr["volc"]["v"]:
            if v[0] == loc:
                return ("nw:" + v[5]) if v[4] and len(v) > 5 else v[0]
        return loc
    return loc  # a flood starts on its river's first floodplain plot


def fam_of(row):
    for fam, rows in (("flood", FLOOD), ("erupt", ERUPT), ("storm", STORM), ("drought", DROUGHT), ("fire", FIRE)):
        if row in {n for n, _, _ in rows}:
            return fam
    if any(row in {n for n, _, _ in v} for v in NW.values()):
        return "erupt"
    return None


def fit(tags, fam, mode, boost=30, count_nosite=True, verbose=False):
    lo, hi = 0.0, math.inf
    reads = 0
    breaks = []
    for tag in tags:
        turns, events = load(tag)
        for t in sorted(turns):
            tr = turns[t]
            if t < 2 or "t" not in tr or "rv" not in tr or "volc" not in tr:
                continue
            cl = tr["t"]["climate"]
            y = cl.get(KEYS[fam])
            T = cl.get("GetTemperatureChange")
            if not isinstance(y, (int, float)) or not isinstance(T, (int, float)):
                continue
            occurred = collections.Counter()
            for st, row, loc in events:
                if st >= t or fam_of(row) != fam:
                    continue
                if loc is None or loc < 0:
                    if not count_nosite:
                        continue
                site = site_of(fam, row, loc, tr)
                key = {"pair": (row, site), "row": row, "site": site, "none": None}[mode]
                occurred[key] += 1
            mass = 0.0
            used = collections.Counter()
            for row, occ, cipd, site in family_rows(fam, tr):
                key = {"pair": (row, site), "row": row, "site": site, "none": None}[mode]
                # rivers sharing a first plot: an event there un-boosts one of them per
                # occurrence (the record's River field is not keyed to the reader's z)
                lost = mode == "none" or (used[key] < occurred[key] if mode == "pair" else key in occurred)
                used[key] += 1
                b = 1.0 if lost else 1 + boost / 100
                mass += occ * b * (1 + cipd / 100 * T)
            if mass <= 0:
                continue
            reads += 1
            # floor: y <= 100 mass / N < y + 1
            a = 100 * mass / (y + 1)
            b_ = 100 * mass / y if y > 0 else math.inf
            nlo, nhi = max(lo, a), min(hi, b_)
            if nlo >= nhi and len(breaks) < 8:
                breaks.append((tag, t, y, round(mass, 3), round(a, 1), round(b_, 1)))
            lo, hi = max(lo, a), min(hi, b_)
    return lo, hi, reads, breaks


def main() -> int:
    pat = sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*"
    tags = sorted({re.match(r"c74s2_turn_(.*)_\d{8}T\d{6}Z\.jsonl", f.name).group(1)
                   for f in RUNS.glob(f"c74s2_turn_{pat}_*.jsonl")})
    tags = [t for t in tags if list(RUNS.glob(f"event_history_{t}_*.txt"))]
    print("games:", tags)
    for fam in ("flood", "erupt", "storm", "drought", "fire"):
        for mode in ("pair", "row", "site", "none"):
            for cn in ((True, False) if fam in ("storm", "drought") else (True,)):
                lo, hi, n, br = fit(tags, fam, mode, count_nosite=cn)
                tagm = f"{mode}{'' if cn else ' (no-site events not counted)'}"
                print(f"{fam:<8} boost per {tagm:<40} N in ({lo:8.2f}, {hi:8.2f}]  {'EMPTY' if lo >= hi else 'ok':<5} {n} reads"
                      + (f"  first breaks {br[:3]}" if lo >= hi else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
