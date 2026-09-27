"""H-3: AreaBuilder.Recalculate against a model: areas are the connected
components (6 neighbours, x wraps) of plots of one class, numbered in plot
index order of their first plot, id = (k << 16) | (k - 1) for the k-th.
Classes tried: water / land, water / land / mountain (impassable), and
lake-aware variants. Scored on the finished map's area of every plot (the
map is final: no terrain change after the last Recalculate but those listed).

    python tools/civ6lab/h3_areas.py runs/h3_session_<stamp>.jsonl
"""
from __future__ import annotations

import collections
import sys

from h3_x import Session, unrle

MOUNTAIN = {2, 5, 8, 11, 14}
WATER = {15, 16}


def components(s: Session, cls) -> list[int]:
    n = s.g.n
    lab = [-1] * n
    k = 0
    for i in range(n):
        if lab[i] != -1:
            continue
        k += 1
        aid = (k << 16) | (k - 1)
        c = cls(i)
        stack = [i]
        lab[i] = aid
        while stack:
            j = stack.pop()
            for q in s.g.ring1(j):
                if q is not None and lab[q] == -1 and cls(q) == c:
                    lab[q] = aid
                    stack.append(q)
    return lab


def main() -> int:
    s = Session(sys.argv[1])
    got = unrle(s.x1("plot", "area")[2])
    lake = s.bits("IsLake")
    nw = s.bits("IsNaturalWonder")
    t = s.terrain
    models = {
        "water/land": lambda i: t[i] in WATER,
        "water/land/mountain": lambda i: 2 if t[i] in MOUNTAIN else (1 if t[i] in WATER else 0),
        "ocean/lake/land/mountain": lambda i: 2 if t[i] in MOUNTAIN else (3 if lake[i] else (1 if t[i] in WATER else 0)),
        "water/land/impassable(mountain or NW)": lambda i: 2 if (t[i] in MOUNTAIN or nw[i]) else (1 if t[i] in WATER else 0),
    }
    for name, cls in models.items():
        lab = components(s, cls)
        bad = sum(a != b for a, b in zip(lab, got))
        # the partition alone, ids aside
        pair = collections.defaultdict(set)
        for a, b in zip(lab, got):
            pair[a].add(b)
        split = sum(len(v) > 1 for v in pair.values())
        print(f"{name:40s} ids differ on {bad:5d} of {s.g.n} plots; model areas mapped to >1 game area: {split}")
        if bad and bad < 40:
            for i, (a, b) in enumerate(zip(lab, got)):
                if a != b:
                    print("    plot", i, s.g.xy(i), "terrain", t[i], "feature", s.feature[i], "model", a, "game", b)
    # IsLake: a water plot whose (game) area holds <= LAKE_MAX_AREA_SIZE 9 plots
    size = collections.Counter(got)
    for cut in (8, 9, 10):
        pred = [t[i] in WATER and size[got[i]] <= cut for i in range(s.g.n)]
        bad = [i for i in range(s.g.n) if pred[i] != lake[i]]
        print(f"IsLake = water and area size <= {cut}: {len(bad)} plots differ", [(i, t[i], s.feature[i], size[got[i]], lake[i]) for i in bad[:6]])
    sizes = sorted({size[got[i]] for i in range(s.g.n) if t[i] in WATER and lake[i]})
    print("lake area sizes seen", sizes, "; water non-lake area sizes", sorted({size[got[i]] for i in range(s.g.n) if t[i] in WATER and not lake[i]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
