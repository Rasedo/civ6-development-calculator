"""C-38-S1 + C-60-S2: the extended observer watch, summarised.

    python tools/civ6lab/c38s1_fit.py [tag glob, default c38s1_ext*]

Reads `runs/c38s1_watch_<tag>_*.jsonl` (`c38s1_watch.lua`, InGame, one read a
turn) and prints:
* QUESTS — every offer (a (major, minor, QuestType) that appears), by kind,
  by world era at the offer and by the minor's category; how long a quest
  stands; the gap from one quest's end to the next offer on the same
  (major, minor) pair; how many stand at once on a pair; the reward text;
* UNITS — the city-states' units tracked by id: the step per turn (hexes) and
  the distance from the nearest own centre, land military against Builders;
  the Builders' charges; the improvements the city-states own, as they appear;
* RESEARCH — each minor's tech count by turn and the order techs arrive;
* FREE CITIES (p62) — every city that joins p62 (turn, world era), its
  units as they appear (type, turn, the gap between grants), the units near a
  city that leaves p62 before and after, p62's gold, gold yield and upkeep.
"""
from __future__ import annotations

import collections
import json
import pathlib
import re
import statistics
import sys

RUNS = pathlib.Path(__file__).parent / "runs"
INSTALL = pathlib.Path(r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI")


def fix(s):
    """the game's UTF-8 text arrives decoded as cp1251"""
    try:
        return s.encode("cp1251").decode("utf-8")
    except (UnicodeError, AttributeError):
        return s


def categories():
    out = {}
    for f in list(INSTALL.glob("Base/Assets/Gameplay/Data/Civilizations.xml")) + list(INSTALL.glob("DLC/*/Data/*Civilizations*.xml")):
        for m in re.finditer(r'Type="(CIVILIZATION_[A-Z_]+)" Name="CityStateCategory" Value="([A-Z]+)"',
                             f.read_text(encoding="utf-8", errors="replace")):
            out[m.group(1)] = m.group(2)
    return out


def cube(x, y):
    return x - (y - (y & 1)) // 2, y


def hexd(a, b, W):
    best = None
    for dx in (-W, 0, W):
        q1, r1 = cube(*a)
        q2, r2 = cube(b[0] + dx, b[1])
        d = (abs(q1 - q2) + abs(r1 - r2) + abs((q1 + r1) - (q2 + r2))) // 2
        best = d if best is None else min(best, d)
    return best


def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else "c38s1_ext*"
    cats = categories()
    for f in sorted(RUNS.glob(f"c38s1_watch_{pat}_*.jsonl")):
        era, quests, minors, imps = {}, {}, collections.defaultdict(dict), collections.defaultdict(dict)
        for ln in open(f, encoding="utf-8"):
            if not ln.startswith("{"):
                continue
            r = json.loads(ln)
            k, t = r["kind"], r["turn"]
            if k == "era":
                era[t] = r["worldEra"]
            elif k == "quests":
                quests[t] = r
            elif k == "minor":
                minors[t][r["p"]] = r
            elif k == "imps":
                imps[t][r["p"]] = r["plots"]
        ts = sorted(minors)
        W = 84  # Standard
        print(f"\n===== {f.name}: turns {ts[0]}..{ts[-1]}")
        civ = {}
        for t in ts:
            for p, r in minors[t].items():
                civ[p] = r["civ"]

        # QUESTS
        errs = {q["err"] for q in quests.values() if q.get("err")}
        if errs:
            print("   quest read errors:", list(errs)[:2])
        active = {}
        offers, ends, durations, gaps = [], [], [], []
        last_end = {}
        concurrent = collections.Counter()
        rewards = collections.Counter()
        for t in sorted(quests):
            cur = {(a, b, c): (n, rw) for a, b, c, n, rw in quests[t]["q"]}
            per_pair = collections.Counter((a, b) for a, b, _ in cur)
            for n in per_pair.values():
                concurrent[n] += 1
            for key, (n, rw) in cur.items():
                if key not in active:
                    active[key] = t
                    offers.append((t, key))
                    rewards[re.sub(r"\s+", " ", fix(rw))] += 1
                    le = last_end.get(key[:2])
                    if le is not None and not any(k2[:2] == key[:2] for k2 in active if k2 != key):
                        gaps.append(t - le)
            for key in list(active):
                if key not in cur:
                    durations.append(t - active.pop(key))
                    last_end[key[:2]] = t
                    ends.append((t, key))
        kinds = collections.Counter(k[2] for _, k in offers)
        print(f"   QUESTS: {len(offers)} offers over {len(quests)} turns; by kind {dict(kinds.most_common())}")
        by_era = collections.defaultdict(collections.Counter)
        by_cat = collections.defaultdict(collections.Counter)
        for t, k in offers:
            by_era[era.get(t)][k[2]] += 1
            by_cat[cats.get(civ.get(k[1]), "?")][k[2]] += 1
        for e in sorted(by_era, key=lambda x: (x is None, x)):
            print(f"      world era {e}: {dict(by_era[e].most_common())}")
        for c in sorted(by_cat):
            print(f"      category {c}: {dict(by_cat[c].most_common())}")
        if durations:
            print(f"   quest standing turns: n {len(durations)} median {statistics.median(durations)} "
                  f"mean {statistics.mean(durations):.1f}; distribution {sorted(collections.Counter(min(d, 99) for d in durations).items())}")
        if gaps:
            print(f"   gap end -> next offer on the same pair (no other quest standing): n {len(gaps)} median {statistics.median(gaps)}; "
                  f"distribution {sorted(collections.Counter(min(g, 40) for g in gaps).items())}")
        print(f"   quests standing at once on a pair (pair-turns): {dict(sorted(concurrent.items()))}")
        print(f"   reward texts: {dict(rewards.most_common(6))}")

        # UNITS (city-states only)
        steps = collections.defaultdict(collections.Counter)
        dist = collections.defaultdict(collections.Counter)
        prevpos = {}
        for t in ts:
            for p, r in minors[t].items():
                if p == 62:
                    continue
                centres = [(c[1], c[2]) for c in r["cities"]]
                for u in r["units"]:
                    uid, typ, x, y = u[0], u[1], u[2], u[3]
                    if x < 0:
                        continue
                    cls = "builder" if typ == "UNIT_BUILDER" else ("trader" if typ == "UNIT_TRADER" else "military")
                    key = (p, uid)
                    if key in prevpos and prevpos[key][0] == t - 1:
                        steps[cls][min(hexd(prevpos[key][1], (x, y), W), 6)] += 1
                    prevpos[key] = (t, (x, y))
                    if centres:
                        dist[cls][min(min(hexd((x, y), c, W) for c in centres), 8)] += 1
        for cls in ("military", "builder", "trader"):
            n = sum(steps[cls].values())
            if n:
                print(f"   UNITS {cls}: step per turn {({k: round(v / n, 3) for k, v in sorted(steps[cls].items())})} over {n}; "
                      f"distance from own centre {({k: round(v / sum(dist[cls].values()), 3) for k, v in sorted(dist[cls].items())})}")
        # improvements the city-states own, as they appear
        seen = {}
        new = collections.Counter()
        for t in sorted(imps):
            for p, plots in imps[t].items():
                for i, owner, imp, pil in plots:
                    if owner == p and (p, i) not in seen:
                        seen[(p, i)] = imp
                        if t > sorted(imps)[0]:
                            new[imp] += 1
        print(f"   city-states' improvements appearing on their own plots: {dict(new.most_common())}")

        # RESEARCH
        first = collections.defaultdict(dict)
        for t in ts:
            for p, r in minors[t].items():
                if p == 62:
                    continue
                for ti in r["techs"]:
                    first[p].setdefault(ti, t)
        counts = {t: statistics.mean(len(minors[t][p]["techs"]) for p in minors[t] if p != 62) for t in ts if any(p != 62 for p in minors[t])}
        for t in (25, 50, 100, 150, 200, 250):
            if t in counts:
                print(f"   RESEARCH mean techs per city-state at t{t}: {counts[t]:.1f}")
        order = collections.Counter()
        for p, d in first.items():
            seq = [ti for ti, _ in sorted(d.items(), key=lambda kv: kv[1])]
            order[tuple(seq[:6])] += 1
        print(f"   first six techs (index order) by minor: {order.most_common(3)}")

        # FREE CITIES
        fc_cities, fc_units = {}, {}
        joins, leaves, grants = [], [], collections.defaultdict(list)
        for t in ts:
            r = minors[t].get(62)
            if not r:
                continue
            cur_c = {c[0]: c for c in r["cities"]}
            for cid, c in cur_c.items():
                if cid not in fc_cities:
                    joins.append((t, era.get(t), c[1], c[2], c[8]))
            for cid, c in fc_cities.items():
                if cid not in cur_c:
                    leaves.append((t, c[1], c[2]))
            cur_u = {u[0]: u for u in r["units"]}
            for uid, u in cur_u.items():
                if uid not in fc_units:
                    near = min(((hexd((u[2], u[3]), (c[1], c[2]), W), cid) for cid, c in cur_c.items()), default=(None, None))
                    grants[near[1]].append((t, u[1], near[0]))
            fc_cities, fc_units = cur_c, cur_u
        print(f"   FREE CITIES: {len(joins)} cities joined p62 (turn, world era, x, y, original owner): {joins}")
        print(f"   cities that left p62 (turn, x, y): {leaves}")
        for cid, g in grants.items():
            tt = [x[0] for x in g]
            print(f"   p62 units appearing near city {cid}: {[(x[0], x[1][5:], x[2]) for x in g][:20]}; gaps {[b - a for a, b in zip(tt, tt[1:])][:20]}")
        gold = [(t, minors[t][62]["gold"], minors[t][62]["goldYield"], minors[t][62]["maintenance"]) for t in ts
                if 62 in minors[t] and minors[t][62]["cities"]]
        if gold:
            print(f"   p62 (turn, gold, gold yield, upkeep) sample: {gold[::10][:25]}")


if __name__ == "__main__":
    main()
