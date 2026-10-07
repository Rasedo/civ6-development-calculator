"""The map's regions (Map_Region), as TerrainBuilder.AnalyzeChokepoints
leaves them: the chokepoints (`chokepoints.py`) and Region_Builder's flood
over them (XP2/Common/MapGen/Region_Builder.cpp, 0x887810), read from the
install's DLL (tools/civ6lab/dll_readings.md, "The map's regions").

Region_Builder walks the plots in index order; a passable land plot (not
impassable, not water) of no region seeds a new one, and a flood from it
takes every plot its step test (0x887aa0) admits. A step goes onto passable
land of no region of the flood's own; a step between two plots of which
neither lies on a chokepoint's line is free; otherwise each chokepoint whose
line holds either plot is tested in order:
- both plots on its line: a step not meeting the line's segment is free;
  one that meets it is refused when either plot lies off the line;
- one plot on its line: a step meeting the segment is refused unless the
  target lies on the line and the source off it, and then the target is
  taken only while no region holds it.
The segment and orientation tests run on the plot centres in hex
coordinates (X = 2q + r, Y = r, q = x - floor(y / 2)). A chokepoint's line is
the plots a float walk from one end to the other rounds to (0x371d0, cube
rounding 0x38070), the ends left out. Each region keeps its plot count (the
game also keeps its area, which the engines read off the region's first plot).
"""
from __future__ import annotations

from collections import deque

from .chokepoints import hex_line, orient, segments_meet, to_axial


class Chokepoint:
    """a chokepoint object (0x371d0): its ends and its line's plots"""

    def __init__(self, e0: tuple[int, int], e1: tuple[int, int]):
        self.ends = (tuple(e0), tuple(e1))
        self.plots = set(hex_line(e0, e1))


def build_regions(W: int, H: int, water: list[bool], impassable: list[bool],
                  chokes: list[tuple[tuple[int, int], tuple[int, int]]], neighbours) -> dict:
    """Region_Builder (0x887810): per plot its region (-1 for none), per
    region its plot count. `neighbours(i)` lists a plot's
    neighbours; `chokes` the analysis' (end, end) pairs in its order."""
    N = W * H
    cps = [Chokepoint(a, b) for a, b in chokes]
    on_line = set().union(*(c.plots for c in cps)) if cps else set()
    region = [-1] * N
    sizes: list[int] = []
    land = [not water[i] and not impassable[i] for i in range(N)]

    def xy(i):
        return i % W, i // W

    def step(cur: int, f: int, t: int) -> bool:
        if not land[t]:
            return False
        tp, fp = xy(t), xy(f)
        t_in, f_in = tp in on_line, fp in on_line
        if region[t] == cur:
            return False
        if not t_in and not f_in:
            return True
        ta, fa = to_axial(*tp), to_axial(*fp)
        for c in cps:
            ti = t_in and tp in c.plots
            fi = f_in and fp in c.plots
            if not ti and not fi:
                continue
            c0, c1 = to_axial(*c.ends[0]), to_axial(*c.ends[1])
            if ti and fi:
                if not segments_meet(c0, c1, ta, fa):
                    return True
                if orient(ta, c0, c1) != 0:
                    return False
                return orient(fa, c0, c1) == 0
            if not segments_meet(c0, c1, ta, fa):
                continue
            if orient(fa, c0, c1) == 0:
                return False
            if orient(ta, c0, c1) != 0:
                return False
            if region[t] == cur:
                continue
            return region[t] == -1
        return True

    for s in range(N):
        if region[s] != -1 or not land[s]:
            continue
        cur = len(sizes)
        sizes.append(0)
        region[s] = cur
        # the flood: a node joins the region as the search closes it
        seen = {s}
        q = deque([s])
        while q:
            p = q.popleft()
            region[p] = cur
            sizes[cur] += 1
            for n in neighbours(p):
                if n in seen:
                    continue
                if step(cur, p, n):
                    seen.add(n)
                    q.append(n)
    return {"region": region, "sizes": sizes,
            "chokepoints": [[list(c.ends[0]), list(c.ends[1])] for c in cps]}
