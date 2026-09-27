"""H-3: the plot predicates the map natives read, derived from a map dump
alone (terrain, feature, river flags) and scored against the game's own
answers (the natives probe's plot|<name> bits):
  IsWater     terrain Coast or Ocean
  IsLake      water whose water area (6-connected water) holds <= 9 plots
              (LAKE_MAX_AREA_SIZE)
  IsRiver     a river on any of the six edges (own W/NW/NE-of flags, the W
              neighbour's W-of, the NW neighbour's NE-of... see river_edges)
  IsRiverAdjacent  a neighbour IsRiver
  IsCoastalLand    land with a water neighbour not covered by Ice
  IsFreshWater     land, not a mountain, and IsRiver or a lake neighbour
                   (or an Oasis neighbour)
  IsImpassable     a mountain, or an Impassable feature

    python tools/civ6lab/h3_plotfacts.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import sys

from h3_x import Session

MOUNTAIN = {2, 5, 8, 11, 14}
WATER = {15, 16}
IMPASSABLE_FEATURES = {1}  # FEATURE_ICE; natural wonders with Impassable="true" added from the rows


def derive(s: Session, impassable_features: set[int] | None = None) -> dict[str, list[bool]]:
    g = s.g
    t, f, fl = s.terrain, s.feature, s.flags
    water = [t[i] in WATER for i in range(g.n)]
    area = [-1] * g.n
    size = {}
    k = 0
    for i in range(g.n):
        if area[i] != -1 or not water[i]:
            continue
        k += 1
        stack, area[i], cnt = [i], k, 0
        while stack:
            u = stack.pop()
            cnt += 1
            for v in g.ring1(u):
                if v is not None and water[v] and area[v] == -1:
                    area[v] = k
                    stack.append(v)
        size[k] = cnt
    lake = [water[i] and size[area[i]] <= 9 for i in range(g.n)]

    def own(i, bit):
        return i is not None and bool(fl[i] & bit)
    river = []
    for i in range(g.n):
        r = own(i, 1) or own(i, 2) or own(i, 4)
        r |= own(g.adj(i, 4), 4)   # W neighbour is W of a river on its E edge = my W edge
        r |= own(g.adj(i, 5), 2)   # NW neighbour NW of a river on its SE edge = my NW edge
        r |= own(g.adj(i, 0), 1)   # NE neighbour NE of a river on its SW edge = my NE edge
        river.append(r)
    radj = [any(q is not None and river[q] for q in g.ring1(i)) for i in range(g.n)]
    coastal = [not water[i] and any(q is not None and water[q] and f[q] != 1 for q in g.ring1(i)) for i in range(g.n)]
    fresh = [not water[i] and t[i] not in MOUNTAIN and (river[i] or any(
        q is not None and (lake[q] or f[q] == 4) for q in g.ring1(i))) for i in range(g.n)]
    imp_f = impassable_features if impassable_features is not None else IMPASSABLE_FEATURES
    imp = [t[i] in MOUNTAIN or f[i] in imp_f for i in range(g.n)]
    return {"IsWater": water, "IsLake": lake, "IsRiver": river, "IsRiverAdjacent": radj,
            "IsCoastalLand": coastal, "IsFreshWater": fresh, "IsImpassable": imp}


def main() -> int:
    for path in sys.argv[1:]:
        s = Session(path)
        impf = {int(i) for i, r in s.db["F"].items() if r.get("Impassable") == "true"} or None
        d = derive(s, impf)
        out = []
        for name, vals in d.items():
            got = s.bits(name)
            bad = [i for i in range(s.g.n) if vals[i] != got[i]]
            out.append(f"{name} {len(bad)} wrong" + (f" e.g. {[(s.g.xy(i), s.terrain[i], s.feature[i], got[i]) for i in bad[:3]]}" if bad else ""))
        print(path[-30:], "; ".join(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
