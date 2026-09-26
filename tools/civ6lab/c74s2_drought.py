"""C-74-S2: which plot a drought starts on, against its city's plots.

    python tools/civ6lab/c74s2_drought.py [tag glob, default c74s2_duel*]

For every drought with a start plot and a whole-map read (`dmap`, taken on the
read after the start), the start plot's owner, owning city, terrain, feature,
improvement, district, river and fresh water, its distance to the nearest city
centre, and how the start compares with the plots of the city that owns it
(or, if unowned, the nearest city's plots within 3): how many of them share
each attribute. A drought with StartLocation -1 is counted apart (the row was
drawn and found no plot).
"""
from __future__ import annotations

import collections
import json
import pathlib
import re
import sys

RUNS = pathlib.Path(__file__).parent / "runs"


def cube(x, y):
    return x - (y - (y & 1)) // 2, y


def dist(a, b, W):
    best = None
    for dx in (-W, 0, W):
        q1, r1 = cube(*a)
        q2, r2 = cube(b[0] + dx, b[1])
        d = (abs(q1 - q2) + abs(r1 - r2) + abs((q1 + r1) - (q2 + r2))) // 2
        best = d if best is None else min(best, d)
    return best


def main() -> int:
    pat = sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*"
    stats = collections.Counter()
    nosite = collections.Counter()
    rows = []
    for f in sorted(RUNS.glob(f"c74s2_turn_{pat}_*.jsonl")):
        tag = re.match(r"c74s2_turn_(.*)_\d{8}T\d{6}Z\.jsonl", f.name).group(1)
        cities = {}
        seen = set()
        for ln in open(f, encoding="utf-8"):
            if not ln.startswith("{"):
                continue
            r = json.loads(ln)
            if r["kind"] == "cities":
                cities[r["turn"]] = r["c"]
            if r["kind"] != "dmap":
                continue
            for key in ("evPrev", "evNow"):
                e = r.get(key)
                if not (isinstance(e, dict) and "DROUGHT" in str(e.get("type"))):
                    continue
                if (e["StartTurn"], e.get("StartLocation")) in seen or e["StartTurn"] not in (r["turn"], r["turn"] - 1):
                    continue
                seen.add((e["StartTurn"], e.get("StartLocation")))
                s = e.get("StartLocation")
                if s is None or s < 0:
                    nosite[e["type"]] += 1
                    continue
                W, H = r["grid"]
                terr = {i: n[8:] for i, n in r["terrains"]}
                feat = {i: n[8:] for i, n in r["features"]}
                imp = {i: n[12:] for i, n in r["improvements"]}
                dis = {i: n[9:] for i, n in r["districts"]}
                plots = {p[0]: p for p in r["plots"]}
                cs = cities.get(r["turn"], [])
                sp = plots.get(s)
                sxy = (s % W, s // W)
                near = sorted((dist(sxy, (c[2], c[3]), W), c[0], c[1]) for c in cs)
                city = sp[2] if sp and isinstance(sp[2], int) and sp[2] >= 0 else None
                if city is not None:
                    mine = [p for p in r["plots"] if p[2] == city]
                else:
                    c0 = near[0] if near else None
                    cc = next((c for c in cs if c0 and c[1] == c0[2] and c[0] == c0[1]), None)
                    mine = [p for p in r["plots"] if cc and dist((p[0] % W, p[0] // W), (cc[2], cc[3]), W) <= 3]

                def desc(p):
                    return (terr.get(p[3], p[3]), feat.get(p[4], "none"), imp.get(p[5], "none"), dis.get(p[7], "none"))

                d0 = desc(sp) if sp else None
                bare = [p for p in mine if p[4] < 0 and terr.get(p[3]) in ("PLAINS", "GRASS") and p[7] < 0]
                rows.append((tag, e["StartTurn"], e["type"][13:], s, sxy, e.get("Name"), d0, sp[1] if sp else None,
                             city, near[:2], len(mine), len(bare), sp in bare if sp else None,
                             sum(1 for p in mine if p[5] >= 0 and p[7] < 0)))
                stats["with plot"] += 1
                stats[("start dist to nearest centre", near[0][0] if near else None)] += 1
                stats[("start is featureless Plains/Grass, no district", sp in bare if sp else None)] += 1
                stats[("start owned", (sp[1] >= 0) if sp else None)] += 1
                stats[("start improvement", d0[2] if d0 else None)] += 1
                stats[("start terrain|feature", f"{d0[0]}|{d0[1]}" if d0 else None)] += 1
    for row in rows:
        print("   ", row)
    print("\nno-plot droughts:", dict(nosite))
    for k, v in sorted(stats.items(), key=str):
        print(f"   {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
