"""H-3: Map.FindWater(plot, range, flag) against models. The map at AddRivers
(fwstate: 0 land / 1 water / 2 lake) is fixed while rivers are laid, so the
only thing that changes between the calls is the rivers: the river setters
after the k-th GetInlandCorner in LOG are the river laid after the k-th
corner record in X. Each call is scored with the rivers laid before it.

    python tools/civ6lab/h3_findwater.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import math
import re
import sys

from h3_x import Session, unrle

SETTER = re.compile(r"<TerrainBuilder\.Set(W|NW|NE)OfRiver\(@(\d+),(\d+),(\w+),(-?\d+),(-?\d+)\)")


def river_batches(s: Session) -> list[list[tuple[str, int]]]:
    """the river edges set after each GetInlandCorner call, in call order:
    [(flag, plot index), ...] per corner"""
    batches = []
    for e in s.log:
        if e.startswith("<TerrainBuilder.GetInlandCorner"):
            batches.append([])
        m = SETTER.match(e)
        if m and batches:
            fl, x, y = m.group(1), int(m.group(2)), int(m.group(3))
            batches[-1].append((fl, y * s.g.w + x))
    return batches


def is_river(s: Session, flags: dict, p: int) -> bool:
    own = flags.get(p, set())
    if own:
        return True
    w, nw, ne = s.g.adj(p, 4), s.g.adj(p, 5), s.g.adj(p, 0)
    return ("W" in flags.get(w, set())) or ("NW" in flags.get(nw, set())) or ("NE" in flags.get(ne, set()))


def _edge_inside(s: Session, q: int, fl: set, near: list[int]) -> bool:
    """a river edge of q whose other plot is within range too (W flag: the E
    neighbour, NW: the SE neighbour, NE: the SW neighbour)"""
    other = {"W": 1, "NW": 2, "NE": 3}
    ns = set(near)
    return any(s.g.adj(q, other[f]) in ns for f in fl)


def main() -> int:
    score = collections.Counter()
    total = collections.Counter()
    fails = collections.defaultdict(list)
    for path in sys.argv[1:]:
        s = Session(path)
        water = unrle(s.x1("fwstate")[1])
        batches = river_batches(s)
        flags = collections.defaultdict(set)
        k = 0
        for e in s.x:
            tag = e.split("|", 1)[0]
            if tag == "corner":
                for fl, p in batches[k]:
                    flags[p].add(fl)
                k += 1
                continue
            if tag != "fw":
                continue
            _, xy, r, flag, res = e.split("|")
            px, py = map(int, xy.split(","))
            p = py * s.g.w + px
            r = float(r)
            flag = flag == "true"
            res = res == "true"
            shapes = []
            for rname, rr in (("trunc", int(r)), ("ceil", math.ceil(r))):
                shapes.append((rname, [q for q in range(s.g.n) if s.g.dist(p, q) <= rr]))
                sq = []
                for dx in range(-rr, rr + 1):
                    for dy in range(-rr, rr + 1):
                        q = s.g.idx(px + dx, py + dy)
                        if q is not None and s.g.dist(p, q) <= rr:
                            sq.append(q)
                shapes.append((rname + " offset-square", sq))
                shapes.append((rname + " civ5 range-check", s.g.range_check(p, rr)))
            for rname, near in shapes:
                preds = {
                    "river": any(is_river(s, flags, q) for q in near),
                    "own river flag": any(flags.get(q) for q in near),
                    "river, self excluded": any(is_river(s, flags, q) for q in near if q != p),
                    "river edge fully inside": any(flags.get(q) and _edge_inside(s, q, flags[q], near) for q in near),
                    "river|lake": any(is_river(s, flags, q) or water[q] == 2 for q in near),
                    "fresh, mountains never": any(
                        s.terrain[q] not in (2, 5, 8, 11, 14) and (
                            is_river(s, flags, q) or water[q] == 2 or
                            any(a is not None and water[a] == 2 for a in s.g.ring1(q))) for q in near),
                    "fresh (river, lake or next to a lake)": any(
                        is_river(s, flags, q) or water[q] == 2 or
                        any(a is not None and water[a] == 2 for a in s.g.ring1(q)) for q in near),
                    "water": any(water[q] != 0 for q in near),
                    "ocean": any(water[q] == 1 for q in near),
                    "river|water": any(is_river(s, flags, q) or water[q] != 0 for q in near),
                }
                for name, pred in preds.items():
                    key = (flag, rname, name)
                    score[key] += pred == res
                    total[key] += 1
                    if pred != res and len(fails[key]) < 5:
                        fails[key].append((path[-24:], xy, r, res))
    for flag in (True, False):
        best = sorted((k for k in score if k[0] == flag), key=lambda k: -score[k])
        for k in best[:5]:
            print(f"flag={flag}: {score[k]:5d}/{total[k]}  range {k[1]}, true when {k[2]} within it  fails {fails[k][:3]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
