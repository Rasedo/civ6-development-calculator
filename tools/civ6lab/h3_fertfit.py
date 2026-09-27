"""H-3: StartPositioner.GetPlotFertility(i, -1) as the live-game kernel
experiments give it (h3_fertkern*.lua), scored plot for plot against the
natives probe's `fert` records.

    python tools/civ6lab/h3_fertfit.py runs/h3_session_<stamp>.jsonl [...]

Rule:
  0 on a mountain, an Ice plot, snow (flat, hills), and any plot next to Ice;
  else
    2 food + 2 production + gold + 2 science + 2 culture + 2 faith
      (the plot's yields, feature and resource included)
  + 5 for a luxury resource, and for Horses and Iron
  + 3 on a river plot (land)
  + 2 fresh water without a river (land next to a lake or an oasis, or an
    oasis on the plot)
  + 1 per adjacent mountain plot
  + 1 per distinct natural wonder among the adjacent plots
  - 5 on tundra (flat and hills)
  clamped at 0 (an impassable natural wonder plot scores only its
  adjacency). Exact on 11,364 of 11,364 plots (Duel, Tiny, Small, Standard).
"""
from __future__ import annotations

import collections
import sys

from h3_chf import Plots
from h3_x import Session

TUNDRA = {9, 10}
SNOW = {12, 13, 14}
MOUNTAIN = {2, 5, 8, 11, 14}
# the live database's luxuries (10..39, 49, 50, 51, 53), Horses 42, Iron 43
PLUS5 = set(range(10, 40)) | {49, 50, 51, 53, 42, 43}


def predict(s: Session, P: Plots, i: int, Y, rcls, rname) -> int:
    if s.terrain[i] in MOUNTAIN or s.feature[i] == 1:
        return 0
    if any(q is not None and s.feature[q] == 1 for q in s.g.ring1(i)):
        return 0
    t = s.terrain[i]
    if t in SNOW:
        return 0
    v = 2 * Y[0][i] + 2 * Y[1][i] + Y[2][i] + 2 * Y[3][i] + 2 * Y[4][i] + 2 * Y[5][i]
    r = s.resource[i]
    if r in PLUS5:
        v += 5
    if not P.water[i]:
        if P.river[i]:
            v += 3
        elif P.fresh[i]:
            v += 2
    ring = [q for q in s.g.ring1(i) if q is not None]
    v += sum(1 for q in ring if s.terrain[q] in MOUNTAIN)
    v += len({s.feature[q] for q in ring if P.nw[q]})
    if not P.water[i]:
        if t in TUNDRA:
            v -= 5
    return max(0, v)


def main() -> int:
    tot = collections.Counter()
    miss = collections.Counter()
    for path in [a for a in sys.argv[1:] if not a.startswith("--")]:
        s = Session(path)
        P = Plots(s)
        rcls = {int(i): r.get("ResourceClassType", "?")[14:] for i, r in s.db["R"].items()}
        rname = {int(i): r.get("ResourceType") for i, r in s.db["R"].items()}
        fert = [int(v) for v in s.x1("fert")[1].split(",")]
        Y = [[int(v) for v in s.x1("plot", f"yield{y}")[2].split(",")] for y in range(6)]
        if "--water" in sys.argv:
            tab = collections.defaultdict(collections.Counter)
            for i in range(s.g.n):
                if P.water[i]:
                    p = predict(s, P, i, Y, rcls, rname)
                    tab[(P.dland[i], "lake" if P.lake[i] else "sea")][(fert[i] == 0, fert[i] == p)] += 1
            for k in sorted(tab):
                print("   water dland/kind", k, "(game0, same):", dict(tab[k]))
            rows = collections.defaultdict(collections.Counter)
            for i in range(s.g.n):
                if P.water[i] and not P.imp[i]:
                    near_ice = any(q is not None and s.feature[q] == 1 for q in s.g.ring1(i))
                    rows[i // s.g.w][(fert[i] == 0, near_ice)] += 1
            for y in sorted(rows):
                print("   water row", y, "(game0, next to ice):", dict(rows[y]))
        for i in range(s.g.n):
            kind = "water" if P.water[i] else "land"
            tot[kind] += 1
            p = predict(s, P, i, Y, rcls, rname)
            if p != fert[i]:
                key = (kind, s.terrain[i], s.feature[i], s.resource[i], fert[i] - p)
                miss[key] += 1
                if "--showall" in sys.argv:
                    ring = [q for q in s.g.ring1(i) if q is not None]
                    print(f"   ({i % s.g.w},{i // s.g.w}) t{s.terrain[i]} f{s.feature[i]} nw {P.nw[i]} "
                          f"mtn {sum(s.terrain[q] in MOUNTAIN for q in ring)} "
                          f"adjnw {[s.feature[q] for q in ring if P.nw[q]]} imp {sum(P.imp[q] for q in ring)} "
                          f"game {fert[i]} ours {p} y{[Y[k][i] for k in range(6)]}")
                if "--show" in sys.argv and kind == "land" and s.resource[i] != -1:
                    print(f"   ({i % s.g.w},{i // s.g.w}) t{s.terrain[i]} f{s.feature[i]} r{s.resource[i]} "
                          f"{rcls.get(s.resource[i])} y{[Y[k][i] for k in range(6)]} river {P.river[i]} "
                          f"fresh {P.fresh[i]} game {fert[i]} ours {p} count {s.rcount[i]}")
        print(path[-26:], dict(tot))
    print("misses", sum(miss.values()), "of", sum(tot.values()))
    for k, n in miss.most_common(40):
        print("  ", n, "kind/terrain/feature/resource/game-ours", k)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
