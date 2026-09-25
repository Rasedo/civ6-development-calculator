"""W-MIN: the city-state build table's DRAWS, fitted to the watched games.

    python tools/civ6lab/minor_build_fit.py

The census is tools/civ6lab/runs/cs_watch_*.jsonl (lab4, obs1-6, cfgA-E,
s2n1-5): one record per living minor per turn, holding its city's
CurrentlyBuilding and its units (tools/civ6lab/cs_watch.lua). A minor-game is
(game, player); the Free Cities player is not a minor; lab4's three files are
one game. The opening's first pick (turn 2) is abandoned after one turn in
every game (the AI re-plans at turn 4), so every START below is a start at
turn 4 or later.

Each drawn row gets TWENTY equally likely slots (k = 0..19 at p = (k+.5)/20):
  * a development row (a building or a district): the slot is the turn the row
    becomes wanted — the first-START turn's Kaplan-Meier quantile, censored at
    the minor's last record (the watch's end or its conquest); -1 = never
    (the quantile lies past the estimate's reach);
  * an opening row (a propensity, no timing): 0 while p <= F(end), else -1;
  * the army cap: the quantile of the per-minor cap (one more than the
    largest land army it started a post-opening military unit at, turns
    20-100; the smallest army it idled at when it started none).
Also printed: the Builder's per-turn build rate (three charges over its
standing span, fitted to the spans' median) and the filler's class weights.
"""
from __future__ import annotations

import collections
import json
import math
import pickle
import sys

sys.path.insert(0, "tools/civ6lab")
from minor_census import load, runs_of, TYPES  # noqa: E402

SLOTS = 20
CIV = {"UNIT_SETTLER", "UNIT_BUILDER", "UNIT_TRADER", "UNIT_SUPPLY_CONVOY", "UNIT_MILITARY_ENGINEER"}
NAVAL = {"UNIT_GALLEY", "UNIT_CARAVEL", "UNIT_IRONCLAD", "UNIT_DESTROYER"}
RANGED = {"UNIT_SLINGER", "UNIT_ARCHER", "UNIT_CROSSBOWMAN", "UNIT_FIELD_CANNON", "UNIT_MACHINE_GUN"}
MELEE = {"UNIT_WARRIOR", "UNIT_SWORDSMAN", "UNIT_MAN_AT_ARMS", "UNIT_MUSKETMAN", "UNIT_LINE_INFANTRY",
         "UNIT_INFANTRY", "UNIT_MECHANIZED_INFANTRY"}
CLS = {
    **{u: "MELEE" for u in MELEE}, **{u: "RANGED" for u in RANGED},
    "UNIT_SPEARMAN": "ANTICAV", "UNIT_PIKEMAN": "ANTICAV", "UNIT_PIKE_AND_SHOT": "ANTICAV", "UNIT_AT_CREW": "ANTICAV",
    "UNIT_MODERN_AT": "ANTICAV",
    "UNIT_HORSEMAN": "LIGHT_CAV", "UNIT_COURSER": "LIGHT_CAV", "UNIT_CAVALRY": "LIGHT_CAV", "UNIT_HELICOPTER": "LIGHT_CAV",
    "UNIT_HEAVY_CHARIOT": "HEAVY_CAV", "UNIT_KNIGHT": "HEAVY_CAV", "UNIT_CUIRASSIER": "HEAVY_CAV", "UNIT_TANK": "HEAVY_CAV",
    "UNIT_CATAPULT": "SIEGE", "UNIT_TREBUCHET": "SIEGE", "UNIT_BOMBARD": "SIEGE", "UNIT_ARTILLERY": "SIEGE",
    "UNIT_RANGER": "RECON",
}
TYPE_DISTRICT = {"SCIENTIFIC": "DISTRICT_CAMPUS", "RELIGIOUS": "DISTRICT_HOLY_SITE", "TRADE": "DISTRICT_COMMERCIAL_HUB",
                 "CULTURAL": "DISTRICT_THEATER", "INDUSTRIAL": "DISTRICT_INDUSTRIAL_ZONE",
                 "MILITARISTIC": "DISTRICT_ENCAMPMENT"}
TYPE_T1 = {"SCIENTIFIC": "BUILDING_LIBRARY", "RELIGIOUS": "BUILDING_SHRINE", "TRADE": "BUILDING_MARKET",
           "CULTURAL": "BUILDING_AMPHITHEATER", "INDUSTRIAL": "BUILDING_WORKSHOP", "MILITARISTIC": "BUILDING_BARRACKS"}
TYPE_T2 = {"SCIENTIFIC": "BUILDING_UNIVERSITY", "RELIGIOUS": "BUILDING_TEMPLE", "TRADE": "BUILDING_BANK",
           "CULTURAL": "BUILDING_MUSEUM_ART", "INDUSTRIAL": "BUILDING_FACTORY", "MILITARISTIC": "BUILDING_ARMORY"}
# the worship buildings: a religious minor's third tier is whichever its
# majority religion's Worship belief names
WORSHIP = {"BUILDING_CATHEDRAL", "BUILDING_GURDWARA", "BUILDING_MEETING_HOUSE", "BUILDING_MOSQUE", "BUILDING_PAGODA",
           "BUILDING_SYNAGOGUE", "BUILDING_WAT", "BUILDING_STUPA", "BUILDING_DAR_E_MEHR"}
TYPE_T3 = {"MILITARISTIC": "BUILDING_MILITARY_ACADEMY", "SCIENTIFIC": "BUILDING_RESEARCH_LAB",
           "CULTURAL": "BUILDING_BROADCAST_CENTER", "TRADE": "BUILDING_STOCK_EXCHANGE", "RELIGIOUS": WORSHIP}
# the type district's project (the Encampment's Training: never started)
TYPE_PROJECT = {"SCIENTIFIC": "PROJECT_ENHANCE_DISTRICT_CAMPUS", "RELIGIOUS": "PROJECT_ENHANCE_DISTRICT_HOLY_SITE",
                "TRADE": "PROJECT_ENHANCE_DISTRICT_COMMERCIAL_HUB", "CULTURAL": "PROJECT_ENHANCE_DISTRICT_THEATER",
                "INDUSTRIAL": "PROJECT_ENHANCE_DISTRICT_INDUSTRIAL_ZONE",
                "MILITARISTIC": "PROJECT_ENHANCE_DISTRICT_ENCAMPMENT"}
# the development rows the engine hosts: engine id <- census id
DEV = [("WATER_MILL", "BUILDING_WATER_MILL"), ("HARBOR", "DISTRICT_HARBOR"), ("ANCIENT_WALLS", "BUILDING_WALLS"),
       ("LIGHTHOUSE", "BUILDING_LIGHTHOUSE"), ("MEDIEVAL_WALLS", "BUILDING_CASTLE"),
       ("RENAISSANCE_WALLS", "BUILDING_STAR_FORT"), ("SHIPYARD", "BUILDING_SHIPYARD"),
       ("SEAPORT", "BUILDING_SEAPORT"), ("NEIGHBORHOOD", "DISTRICT_NEIGHBORHOOD"), ("SEWER", "BUILDING_SEWER"),
       ("TRADER", "UNIT_TRADER"), ("FLOOD_BARRIER", "BUILDING_FLOOD_BARRIER"),
       ("FOOD_MARKET", "BUILDING_FOOD_MARKET"), ("HARBOR_PROJECT", "PROJECT_ENHANCE_DISTRICT_HARBOR")]


def land(r):
    return sum(1 for u in r["units"] if u[0] not in CIV and u[0] not in NAVAL)


MIN_AT_RISK = 8
HORIZON = 100


def km(events, horizon=None):
    """events: [(time, observed)] -> [(t, F(t))] the Kaplan-Meier CDF steps.
    The estimate stops where fewer than MIN_AT_RISK minors remain watched
    (its reach) or past `horizon`."""
    times = sorted({t for t, o in events if o})
    s = 1.0
    out = []
    for t in times:
        if horizon is not None and t > horizon:
            break
        at_risk = sum(1 for tt, _ in events if tt >= t)
        if at_risk < MIN_AT_RISK:
            break
        d = sum(1 for tt, o in events if tt == t and o)
        s *= 1 - d / at_risk
        out.append((t, 1 - s))
    return out


def slots_timed(events):
    cdf = km(events)
    out = []
    for k in range(SLOTS):
        p = (k + 0.5) / SLOTS
        hit = next((t for t, f in cdf if f >= p - 1e-12), -1)
        out.append(hit)
    return out, (cdf[-1][1] if cdf else 0.0)


def slots_propensity(events):
    cdf = km(events, HORIZON)
    f_end = cdf[-1][1] if cdf else 0.0
    return [0 if (k + 0.5) / SLOTS <= f_end + 1e-12 else -1 for k in range(SLOTS)], f_end


def main():
    data = load()
    games = {k: v for k, v in data.items() if v[0]["t"] <= 3}  # a known opening
    first = {}
    for key, rows in games.items():
        fs = {}
        for (it, t0, t1, i0, i1) in runs_of(rows):
            if t0 < 4:
                continue
            fs.setdefault(it, t0)
            c = CLS.get(it)
            if c:
                fs.setdefault("CLASS_" + c, t0)
        first[key] = (fs, rows[-1]["t"], TYPES.get(rows[0]["civ"], "?"))

    def ev(item, only_type=None):
        """the first START of `item` (one census id, or a set of them: the
        earliest of the set) per minor-game, censored at its last record"""
        items = item if isinstance(item, set) else {item}
        out = []
        for key, (fs, tend, typ) in first.items():
            if only_type and typ != only_type:
                continue
            ts = [fs[i] for i in items if i in fs]
            out.append((min(ts), True) if ts else (tend, False))
        return out

    # the opening's propensities are COMPLETIONS by turn 100: a run of a unit
    # completes when the next record holds one more of it, a building's when
    # it never recurs (minor_census.py)
    mg = pickle.load(open(".claude/scratchpad/wmin_census.pkl", "rb"))

    def ev_done(match):
        out = []
        for key, (fs, tend, typ) in first.items():
            t_done = next((t1 for it, t0, t1, d in mg[key]["events"] if d and match(it)), None)
            out.append((t_done, True) if t_done is not None else (tend, False))
        return out

    table = {}
    table["MONUMENT"] = slots_propensity(ev_done(lambda it: it == "BUILDING_MONUMENT"))
    table["GRANARY"] = slots_propensity(ev_done(lambda it: it == "BUILDING_GRANARY"))
    table["MELEE"] = slots_propensity(ev_done(lambda it: CLS.get(it) == "MELEE"))
    table["RANGED"] = slots_propensity(ev_done(lambda it: CLS.get(it) == "RANGED"))
    for eng, cen in DEV:
        table[eng] = slots_timed(ev(cen))
    for name, per in (("TYPE_DISTRICT", TYPE_DISTRICT), ("TYPE_T1", TYPE_T1), ("TYPE_T2", TYPE_T2),
                      ("TYPE_T3", TYPE_T3), ("TYPE_PROJECT", TYPE_PROJECT)):
        table[name] = {}
        for typ in TYPE_DISTRICT:
            if typ not in per:
                table[name][typ] = ([-1] * SLOTS, 0.0)
                continue
            table[name][typ] = slots_timed(ev(per[typ], typ))

    # the army cap
    caps = []
    for key, rows in games.items():
        rn = runs_of(rows)
        seen_w = seen_a = False
        mil_max = None
        idle_min = None
        for (it, t0, t1, i0, i1) in rn:
            if t0 < 4:
                continue
            if it.startswith("UNIT_") and it not in CIV and it not in NAVAL:
                c = CLS.get(it)
                if c == "MELEE" and not seen_w:
                    seen_w = True
                    continue
                if c == "RANGED" and not seen_a:
                    seen_a = True
                    continue
                if 20 <= t0 <= 100:
                    a = land(rows[i0])
                    mil_max = a if mil_max is None else max(mil_max, a)
            elif it == "NONE" and 20 <= t0 <= 100:
                a = land(rows[i0])
                idle_min = a if idle_min is None else min(idle_min, a)
        if mil_max is not None:
            caps.append(mil_max + 1)
        elif idle_min is not None:
            caps.append(idle_min)
    caps.sort()
    cap_slots = [caps[min(len(caps) - 1, int((k + 0.5) / SLOTS * len(caps)))] for k in range(SLOTS)]

    # the filler's class weights: post-opening military starts by class
    wts = collections.Counter()
    for key, rows in games.items():
        seen_w = seen_a = False
        for (it, t0, t1, i0, i1) in runs_of(rows):
            if t0 < 4 or not it.startswith("UNIT_") or it in CIV or it in NAVAL:
                continue
            c = CLS.get(it)
            if c == "MELEE" and not seen_w:
                seen_w = True
                continue
            if c == "RANGED" and not seen_a:
                seen_a = True
                continue
            if c:
                wts[c] += 1

    # the Builder's build rate: three charges over the span; the NB median
    spans = []
    for key, rows in data.items():
        cur = None
        for r in rows:
            bl = [(u[1], u[2]) for u in r["units"] if u[0] == "UNIT_BUILDER"]
            if len(bl) > 1:
                cur = None
                continue
            if bl and cur is None:
                cur = r["t"]
            elif not bl and cur is not None:
                spans.append(r["t"] - cur)
                cur = None
    spans.sort()
    med = spans[len(spans) // 2]

    def nb_median(p):
        # the smallest n with P(3rd success by trial n) >= 1/2, i.e. with
        # P(Bin(n, p) <= 2) <= 1/2
        n = 3
        while n < 2000:
            below = sum(math.comb(n, k) * p ** k * (1 - p) ** (n - k) for k in range(0, 3))
            if below <= 0.5:
                return n
            n += 1
        return n

    lo = min(pm for pm in range(20, 1000) if nb_median(pm / 1000) <= med)

    out = {
        "n_minor_games": len(games),
        "table": {k: (v if not isinstance(v, dict) else v) for k, v in table.items()},
        "armyCap": cap_slots, "armyCapN": len(caps),
        "classWeights": dict(wts),
        "builderSpanMedian": med, "builderSpans": len(spans), "builderRatePermille": lo,
    }
    if "--compact" in sys.argv:
        for k, v in out["table"].items():
            if isinstance(v, dict):
                for t, (sl, f) in v.items():
                    print(f"{k}.{t}: {sl}  F={f:.3f}")
            else:
                print(f"{k}: {v[0]}  F={v[1]:.3f}")
        print("armyCap", out["armyCap"], "classWeights", out["classWeights"])
        return
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
