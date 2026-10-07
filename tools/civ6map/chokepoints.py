"""TerrainBuilder.AnalyzeChokepoints: the map's chokepoints, as the install's
DLL computes them (XP2/Common/MapGen/MapAnalysis.cpp, 0x86c030; read in
tools/civ6lab/dll_readings.md, "The map's regions").

The obstacles are the water and impassable plots. Their centres are
triangulated (a divide and conquer Delaunay triangulation in the plots' hex
coordinates, float tests on the true hex geometry), the triangulation's dual
(the Voronoi graph of the obstacles) is pruned to the passable land's medial
graph, and a chokepoint is drawn across each narrow passage between two
obstacles. `regions.py` floods the regions over them.
"""
from __future__ import annotations

import math
import struct

# --------------------------------------------------------------- numbers

_F = struct.Struct("<f")


def f32(v: float) -> float:
    return _F.unpack(_F.pack(v))[0]


def fsqrt(v: float) -> float:
    return f32(math.sqrt(v))


def i32(v: int) -> int:
    return ((v + 0x80000000) & 0xffffffff) - 0x80000000


# The dual graph's numbers are 24.8 fixed point (Math_FixedPointT): a float
# converts as floor << 8 | the fraction's 256ths; products and quotients
# carry the eight bits in 64-bit integers, kept to 32.

def fx(v: float) -> int:
    fl = float(math.floor(v))
    frac = int(f32(f32(v - fl) * 256.0)) & 0xff
    return i32((int(fl) << 8) | frac)


def fmul(a: int, b: int) -> int:
    return i32((a * b) >> 8)


def fdiv(a: int, b: int) -> int:
    n = a << 8
    q = abs(n) // abs(b)
    return i32(q if (n >= 0) == (b > 0) else -q)


def ffloat(v: int) -> float:
    """a fixed value as float: its 256ths plus its integer part"""
    return f32(f32((v & 0xff) * 0.00390625) + (v >> 8))


# -------------------------------------------------------------- geometry

HALF, K3, K225 = 0.5, 3.0, 2.25


def _sign(v: int) -> int:
    """0 on a line, else 1 for negative, 2 for positive"""
    v = i32(v)
    return 0 if v == 0 else (1 if v < 0 else 2)


def orient(a, b, c) -> int:
    """the turn a -> b -> c on X = 2q + r, Y = r (0x881ed0's form)"""
    xa, xb, xc = 2 * a[0] + a[1], 2 * b[0] + b[1], 2 * c[0] + c[1]
    return _sign((xb - xa) * (c[1] - b[1]) - (xc - xb) * (b[1] - a[1]))


def _on_segment(p, a, b) -> bool:
    if tuple(a) == tuple(p) or tuple(b) == tuple(p):
        return False
    px, ax, bx = 2 * p[0] + p[1], 2 * a[0] + a[1], 2 * b[0] + b[1]
    return min(ax, bx) <= px <= max(ax, bx) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])


def segments_meet(p1, p2, p3, p4) -> bool:
    """0x8808f0"""
    o1, o2 = orient(p1, p2, p3), orient(p1, p2, p4)
    o3, o4 = orient(p3, p4, p1), orient(p3, p4, p2)
    if o1 and o2 and o3 and o4 and o1 != o2 and o3 != o4:
        return True
    return ((o1 == 0 and _on_segment(p3, p1, p2)) or (o2 == 0 and _on_segment(p4, p1, p2))
            or (o3 == 0 and _on_segment(p1, p3, p4)) or (o4 == 0 and _on_segment(p2, p3, p4)))


def in_circle(a, b, c, d) -> bool:
    """0x878f90: d inside the circle through a, b, c (float, hex geometry)"""
    def norm(p):
        x = f32(f32(p[1] * HALF) + p[0])
        return f32(f32(f32(x * K3) * x) + f32(f32(p[1] * K225) * p[1]))
    nd = norm(d)
    la, lb, lc = f32(norm(a) - nd), f32(norm(b) - nd), f32(norm(c) - nd)
    xd = 2 * d[0] + d[1]
    dxa, dxb, dxc = i32(2 * a[0] + a[1] - xd), i32(2 * b[0] + b[1] - xd), i32(2 * c[0] + c[1] - xd)
    dya, dyb, dyc = i32(a[1] - d[1]), i32(b[1] - d[1]), i32(c[1] - d[1])
    s = f32(f32(float(i32(dyb * dxa)) * lc) + f32(float(i32(dyc * dxb)) * la))
    s = f32(s + f32(float(i32(dya * dxc)) * lb))
    s = f32(s - f32(f32(dxa * lb) * dyc))
    s = f32(s - f32(f32(dxb * lc) * dya))
    s = f32(s - f32(f32(dxc * la) * dyb))
    return s > 0


def _angle(base, v) -> float:
    """the candidate's rank: base . v / |v| on the hex geometry (0x87ad12)"""
    dxb, dyb = base
    dxc, dyc = v
    xb = f32(f32(dyb * HALF) + dxb)
    xc = f32(f32(dyc * HALF) + dxc)
    dot = f32(f32(f32(xb * K3) * xc) + f32(f32(dyb * K225) * dyc))
    n2 = f32(f32(f32(xc * K3) * xc) + f32(f32(dyc * K225) * dyc))
    return f32(dot / fsqrt(n2))


def _norm(p) -> float:
    x = f32(f32(p[1] * HALF) + p[0])
    return f32(f32(f32(x * K3) * x) + f32(f32(p[1] * K225) * p[1]))


def _len(dq: int, dr: int) -> float:
    x = f32(f32(dr * HALF) + dq)
    return fsqrt(f32(f32(f32(x * K3) * x) + f32(f32(dr * K225) * dr)))


def _half(y: int) -> int:
    """floor(y / 2), as the DLL's `y >= 0 ? y >> 1 : (y - 1) / 2`"""
    return y >> 1 if y >= 0 else -((-(y - 1)) // 2)


def to_axial(x: int, y: int) -> tuple[int, int]:
    return x - _half(y), y


def _roundf(v: float) -> float:
    """0xce7230: half away from zero, the half added in float"""
    return float(int(f32(v + 0.5) if v >= 0 else f32(v - 0.5)))


def cube_round(q: float, r: float, s: float) -> tuple[float, float, float]:
    """0x38070: round each coordinate; when they do not sum to zero, the one
    whose rounding moved least against the sum's sign is rebuilt from the
    other two"""
    rq, rr, rs = _roundf(q), _roundf(r), _roundf(s)
    tot = f32(f32(rr + rq) + rs)
    if tot == 0:
        return rq, rr, rs
    if tot > 0:
        dq, dr, ds = f32(q - rq), f32(r - rr), f32(s - rs)
    else:
        dq, dr, ds = f32(rq - q), f32(rr - r), f32(rs - s)
    m = dq if dq < dr else dr
    if m > ds:
        m = ds
    if m == dq:
        return -f32(rs + rr), rr, rs
    if m == dr:
        return rq, -f32(rs + rq), rs
    return rq, rr, -f32(rr + rq)


def hex_line(e0: tuple[int, int], e1: tuple[int, int]) -> list[tuple[int, int]]:
    """0x371d0: the plots between two ends (offset coordinates), the ends
    left out, each once, in walk order from the lesser end in axial order"""
    a0, a1 = to_axial(*e0), to_axial(*e1)
    if a0 > a1:
        a0, a1 = a1, a0
    dq, dr = a1[0] - a0[0], a1[1] - a0[1]
    n = max(abs(dq), abs(dr), abs(dq + dr))
    out: list[tuple[int, int]] = []
    if n <= 0:
        return out
    sq, sr = f32(dq / n), f32(dr / n)
    q, r = float(a0[0]), float(a0[1])
    for _ in range(n):
        q, r = f32(q + sq), f32(r + sr)
        s = f32(-q - r)
        cq, cr, _cs = cube_round(q, r, s)
        yy = int(cr)
        xx = int(cq) + _half(yy)
        p = (xx, yy)
        if p == tuple(e0) or p == tuple(e1) or p in out:
            continue
        out.append(p)
    return out


# --------------------------------------------------------- triangulation

def obstacle_points(W: int, H: int, obstacle) -> list[tuple[int, int]]:
    """0x87a030: the obstacles' plots, sorted by x, even rows before odd,
    then y, as axial (q, r)"""
    pts = [(i % W, i // W) for i in range(W * H) if obstacle[i]]
    pts.sort(key=lambda p: (p[0], p[1] & 1, p[1]))
    return [(x - (y >> 1), y) for x, y in pts]


class Tri:
    """a merge's new triangle: three edge indices, each an A edge, a B edge
    or a new cross edge (0x88 records)"""
    __slots__ = ("e", "isA", "isB")

    def __init__(self):
        self.e = [0, 0, 0]
        self.isA = [False, False, False]
        self.isB = [False, False, False]


class Region:
    """a triangulation in progress (0xa8 records): its points (global
    indices), edges (local index pairs) and triangles (edge index triples)"""

    def __init__(self):
        self.verts: list[int] = []
        self.edges: list[list[int]] = []
        self.tris: list[list[int]] = []


def leaf(pts, idx: list[int]) -> Region:
    """0x86b440: two or three points"""
    r = Region()
    r.verts = list(idx)
    if len(idx) > 1:
        r.edges.append([0, 1])
    if len(idx) > 2:
        p0, p1, p2 = pts[idx[0]], pts[idx[1]], pts[idx[2]]
        if orient(p0, p1, p2) != 0:
            r.edges.append([2, 0])
            r.tris.append([0, 1, 2])
        r.edges.append([1, 2])
    return r


def _bridge(pts, A: Region, B: Region):
    """the first pair, walking both sides' points in (r, q) order, whose
    segment crosses no edge of either side (0x86a460)"""
    key = lambda i: (pts[i][1], pts[i][0])  # noqa: E731
    sA = sorted(A.verts, key=key)
    sB = sorted(B.verts, key=key)
    i = j = 0
    while i < len(sA) and j < len(sB):
        P, Q = pts[sA[i]], pts[sB[j]]
        hit = any(segments_meet(P, Q, pts[A.verts[e[0]]], pts[A.verts[e[1]]]) for e in A.edges) or \
            any(segments_meet(P, Q, pts[B.verts[e[0]]], pts[B.verts[e[1]]]) for e in B.edges)
        if not hit:
            return A.verts.index(sA[i]), B.verts.index(sB[j])
        if i + 1 == len(sA):
            j += 1
        elif j + 1 == len(sB):
            i += 1
        else:
            pa, pb = pts[sA[i + 1]], pts[sB[j + 1]]
            if pa[1] < pb[1]:
                i += 1
            elif pb[1] < pa[1]:
                j += 1
            elif pa[0] < pb[0]:
                i += 1
            else:
                j += 1
    return None


def _drop_edge(side: Region, new_tris: list[Tri], k: int, flag: str) -> None:
    """an edge deleted from one side: its triangles go, later indices shift"""
    side.tris = [t for t in side.tris if k not in t]
    keep = []
    for t in new_tris:
        if getattr(t, flag)[0] and t.e[0] == k:
            continue
        keep.append(t)
    new_tris[:] = keep
    for t in side.tris:
        for s in range(3):
            if t[s] >= k:
                t[s] -= 1
    for t in new_tris:
        fl = getattr(t, flag)
        for s in range(3):
            if fl[s] and t.e[s] >= k:
                t.e[s] -= 1
    del side.edges[k]


def _side_candidate(pts, side: Region, apex_local: int, a, b, base, is_b: bool, new_tris, A_pt, B_pt) -> int:
    """the best candidate of one side (0x87a8c0 / 0x87b3d0), deleting the
    edges the next best's circle test condemns"""
    excluded: list[int] = []
    while True:
        best = second = -1
        vbest = vsecond = 0.0
        nbrs = {e[1] for e in side.edges if e[0] == apex_local} | {e[0] for e in side.edges if e[1] == apex_local}
        for k in sorted(nbrs):
            if k == apex_local or k in excluded:
                continue
            c = pts[side.verts[k]]
            if orient(a, b, c) != 2:
                continue
            ap = pts[side.verts[apex_local]]
            v = (c[0] - ap[0], c[1] - ap[1]) if is_b else (ap[0] - c[0], ap[1] - c[1])
            ang = _angle(base, v)
            if best == -1 or ang > vbest:
                second, vsecond = best, vbest
                best, vbest = k, ang
            elif second == -1 or ang > vsecond:
                second, vsecond = k, ang
        if best == -1:
            return -1
        if second == -1:
            return best
        if not in_circle(A_pt, B_pt, pts[side.verts[best]], pts[side.verts[second]]):
            return best
        excluded.append(best)
        for ei, e in enumerate(side.edges):
            if (e[0] == best or e[1] == best) and (e[0] == apex_local or e[1] == apex_local):
                _drop_edge(side, new_tris, ei, "isB" if is_b else "isA")
                break


def _edge_index(side: Region, u: int, v: int) -> int:
    k = -1
    for i, e in enumerate(side.edges):
        if (e[0] == u or e[0] == v) and (e[1] == u or e[1] == v):
            k = i
    return k


def merge(pts, A: Region, B: Region) -> Region:
    """0x86a460: two triangulations joined"""
    out = Region()
    cross: list[list[int]] = []
    new_tris: list[Tri] = []
    br = _bridge(pts, A, B)
    if br is not None:
        cross.append([br[0], br[1]])
        while True:
            lo, hi = cross[-1]
            a, b = pts[A.verts[lo]], pts[B.verts[hi]]
            base = (a[0] - b[0], a[1] - b[1])
            rc = _side_candidate(pts, B, hi, a, b, base, True, new_tris, a, b)
            lc = _side_candidate(pts, A, lo, a, b, base, False, new_tris, a, b)
            if lc == -1 and rc == -1:
                break
            t = Tri()
            if lc != -1 and rc != -1:
                take_a = in_circle(a, b, pts[B.verts[rc]], pts[A.verts[lc]])
            else:
                take_a = lc != -1
            if take_a:
                cross.append([lc, hi])
                t.e[0] = _edge_index(A, lo, lc)
                t.isA[0] = True
                t.e[1], t.e[2] = len(cross) - 2, len(cross) - 1
            else:
                cross.append([lo, rc])
                t.e[0] = _edge_index(B, hi, rc)
                t.isB[0] = True
                t.e[1], t.e[2] = len(cross) - 1, len(cross) - 2
            new_tris.append(t)
    nA, eA, nX = len(A.verts), len(A.edges), len(cross)
    out.verts = A.verts + B.verts
    out.edges = [list(e) for e in A.edges] + [[e[0], e[1] + nA] for e in cross] + \
        [[e[0] + nA, e[1] + nA] for e in B.edges]
    out.tris = [list(t) for t in A.tris]
    for t in new_tris:
        out.tris.append([t.e[s] + (eA + nX if t.isB[s] else 0 if t.isA[s] else eA) for s in range(3)])
    out.tris += [[x + eA + nX for x in t] for t in B.tris]
    return out


def triangulate(pts) -> Region | None:
    """0x87a470 + 0x87eff0: leaves of three (two where the count leaves one
    or two over), merged pairwise until one is left"""
    n = len(pts)
    rem = n % 3
    regions: list[Region] = []
    i = 0
    while i < n:
        if (i == 0 and rem == 1) or (i + 3 > n and rem != 0):
            regions.append(leaf(pts, [i, i + 1]))
            i += 2
        else:
            regions.append(leaf(pts, [i, i + 1, i + 2]))
            i += 3
    while len(regions) > 1:
        nxt = []
        for k in range(0, len(regions), 2):
            nxt.append(merge(pts, regions[k], regions[k + 1]) if k + 1 < len(regions) else regions[k])
        regions = nxt
    return regions[0] if regions else None


def _adjacent_length(p, q) -> bool:
    """an edge between neighbouring plots: |length^2 - 3| < 0.001"""
    dx, dy = p[0] - q[0], p[1] - q[1]
    x = f32(f32(dy * HALF) + dx)
    l2 = f32(f32(f32(x * K3) * x) + f32(f32(dy * K225) * dy))
    return abs(f32(l2 - 3.0)) < 0.0010000000474974513


def prune_triangles(pts, r: Region) -> None:
    """0x87f7a0: a triangle of touching obstacles goes — every edge between
    neighbours, or all but one, that one two plots apart (length^2 9)"""
    keep = []
    for t in r.tris:
        flag = False
        drop = True
        for e in t:
            a, b = pts[r.verts[r.edges[e][0]]], pts[r.verts[r.edges[e][1]]]
            if _adjacent_length(a, b):
                continue
            if flag:
                drop = False
                break
            dx, dy = a[0] - b[0], a[1] - b[1]
            x = f32(f32(dy * HALF) + dx)
            l2 = f32(f32(f32(x * K3) * x) + f32(f32(dy * K225) * dy))
            if abs(f32(l2 - 9.0)) < 0.0010000000474974513:
                flag = True
            else:
                drop = False
                break
        if not drop:
            keep.append(t)
    r.tris = keep


# ------------------------------------------------------------ dual graph

def circumcircle(A, B, C):
    """0x86f1a0 (maps of at most 106 x 66): the circumcentre (fixed, in the
    dual graph's coordinates) and radius of a triangle, None when its points
    are collinear"""
    nA, nB, nC = fx(_norm(A)), fx(_norm(B)), fx(_norm(C))
    yA, yB, yC = fx(f32(A[1] * 1.5)), fx(f32(B[1] * 1.5)), fx(f32(C[1] * 1.5))
    half = fx(0.5)
    p48, p60, p98 = fmul(nC, yB), fmul(yA, nC), fmul(nB, yA)
    p50, p90, pb0 = fmul(yC, nB), fmul(nA, yC), fmul(nA, yB)
    numx = i32(i32(i32(i32(i32(pb0 - p90) + p50) - p98) + p60) - p48)
    cx = fmul(numx, half)
    xA = fx(f32(f32(A[1] * HALF) + A[0]))
    xB = fx(f32(f32(B[1] * HALF) + B[0]))
    xC = fx(f32(f32(C[1] * HALF) + C[0]))
    q80, q78, q70 = fmul(xC, nB), fmul(xC, nA), fmul(xB, nA)
    q68, q38, q88 = fmul(xB, nC), fmul(xA, nC), fmul(xA, nB)
    numy = i32(i32(i32(i32(i32(q88 - q38) + q68) - q70) + q78) - q80)
    cy = fmul(half, numy)
    d = i32(i32(i32(i32(i32(fmul(xA, yB) - fmul(xA, yC)) + fmul(xB, yC)) - fmul(xB, yA)) + fmul(xC, yA))
            - fmul(xC, yB))
    if d == 0:
        return None
    cx, cy = fdiv(cx, d), fdiv(cy, d)
    P1, P2, P3 = i32(p48 - p50), i32(p90 - p60), i32(p98 - pb0)
    s = f32(f32(f32(ffloat(P1) * ffloat(xA)) + f32(ffloat(xB) * ffloat(P2))) + f32(ffloat(P3) * ffloat(xC)))
    sf = fx(s)
    three = fx(3.0)
    r2 = i32(i32(fmul(cy, cy) + fdiv(fmul(cx, cx), three)) + fdiv(sf, d))
    if r2 >= 0:
        radius = fx(fsqrt(ffloat(r2)))
    else:
        a = fx(_len(B[0] - A[0], B[1] - A[1]))
        bc = fx(_len(C[0] - B[0], C[1] - B[1]))
        ca = fx(_len(A[0] - C[0], A[1] - C[1]))
        xbc = f32(f32((C[1] - B[1]) * HALF) + (C[0] - B[0]))
        xca = f32(f32((A[1] - C[1]) * HALF) + (A[0] - C[0]))
        area = fx(f32(f32(f32((A[1] - C[1]) * xbc) - f32(xca * (C[1] - B[1]))) * 2.598076105117798))
        den = fmul(ca, bc)
        t = fdiv(area, den)
        if t == 0:
            return None
        radius = fdiv(a, i32((t << 9) >> 8))
    ox = fdiv(i32(cx - cy), three)
    oy = fdiv(i32((cy << 9) >> 8), three)
    return (ox, oy), radius


class Cell:
    """a Voronoi vertex (0x78 records): a triangle's circumcentre (fixed
    axial q, r), its clearance radius, its triangles, its neighbours and its
    graph edges (pairs)"""
    __slots__ = ("x", "y", "rad", "tris", "adj", "pairs", "flags")

    def __init__(self, x, y, rad):
        self.x, self.y, self.rad = x, y, rad
        self.tris: list[int] = []
        self.adj: list[int] = []
        self.pairs: list[int] = []
        self.flags = [0, 0, 0]

    def dump(self):
        return [self.x, self.y, self.rad, list(self.tris), list(self.adj), list(self.pairs), list(self.flags)]


def dual_graph(pts, r: Region) -> list[Cell]:
    """0x872580: a cell per triangle with a circumcircle; two cells are
    neighbours when their triangles share an edge between plots that are not
    neighbours (a passage)"""
    cells: list[Cell] = []
    cell_of = [0] * len(r.tris)
    for i, t in enumerate(r.tris):
        a, b = r.edges[t[0]]
        c = r.edges[t[1]][0]
        if c in (a, b):
            c = r.edges[t[1]][1]
        cc = circumcircle(pts[r.verts[a]], pts[r.verts[b]], pts[r.verts[c]])
        if cc is None:
            continue
        (x, y), rad = cc
        k = len(cells)
        cell_of[i] = k
        cell = Cell(x, y, rad)
        cell.tris.append(i)
        cells.append(cell)
        for j in range(i):
            for e in r.tris[j]:
                ea, eb = r.edges[e]
                if _adjacent_length(pts[r.verts[ea]], pts[r.verts[eb]]):
                    continue
                if e in t:
                    cj = cell_of[j]
                    if cj != k:
                        cells[k].adj.append(cj)
                        cells[cj].adj.append(k)
                    break
            # a shared edge ends the scan of j either way
    return cells


def erase_cell(cells: list[Cell], k: int) -> None:
    """0x87fd00"""
    for c in cells:
        c.adj = [a - 1 if a > k else a for a in c.adj if a != k]
        out = []
        for i in range(0, len(c.pairs) - 1, 2):
            a, b = c.pairs[i], c.pairs[i + 1]
            if a == k or b == k:
                continue
            out += [a - 1 if a > k else a, b - 1 if b > k else b]
        if len(c.pairs) % 2:
            out.append(c.pairs[-1])
        c.pairs = out
    del cells[k]


def prune_cells(cells: list[Cell]) -> None:
    """0x87f480: cells with no neighbour go"""
    k = 0
    while k < len(cells):
        if not cells[k].adj:
            erase_cell(cells, k)
            k -= 1
        k += 1


def point_to_plot(x: int, y: int, refine: bool = True):
    """0x871f00: the plot (offset) holding a fixed axial point, and the
    point's fixed remainder from its centre"""
    fq, fr = x >> 8, y >> 8
    ax, ay = x - (fq << 8), y - (fr << 8)
    ox = fq + _half(fr)
    if not refine:
        return (ox, fr), (ax, ay)
    t1, t2, half, one = fx(0.3333), fx(0.6667), fx(0.5), fx(1.0)

    def next_row(both: bool):
        nonlocal ox, fr, ax, ay
        m = int(math.fmod(fr, 2))
        ox += m + (1 if both else 0)
        fr += 1
        if both:
            ax -= one
        ay -= one
    if ay < t1 and ax > fx(f32(f32(1.0 - ffloat(ay)) * HALF)):
        ox += 1
        ax -= one
        return (ox, fr), (ax, ay)
    if not ax < ay and ay >= t1 and ay < t2 and ay < fx(f32(f32(2.0 - ffloat(ax)) * HALF)):
        ox += 1
        ax -= one
        return (ox, fr), (ax, ay)
    if ax < t1 and ay > fx(f32(f32(1.0 - ffloat(ax)) * HALF)):
        next_row(False)
        return (ox, fr), (ax, ay)
    if ax < ay and ax >= t1 and ay >= t1 and ay < t2 and ax < fx(f32(f32(2.0 - ffloat(ay)) * HALF)):
        next_row(False)
        return (ox, fr), (ax, ay)
    if ax > half or ay > half:
        next_row(True)
    return (ox, fr), (ax, ay)


def plot_distance(p, c, frac) -> int:
    """0x877890: from a plot's centre to a point (a plot and a remainder)"""
    dq = i32(((p[0] - _half(p[1])) - (c[0] - _half(c[1]))) << 8) - frac[0]
    dq = i32(dq)
    dr = i32(((p[1] - c[1]) << 8) - frac[1])
    k = fx(0.75)
    t = fmul(i32((dr * dr) >> 8), k)
    n = dr << 8
    h = i32(-((-n) // 512) if n < 0 else n // 512)
    x = i32(h + dq)
    s = i32(fmul(x, x) + t)
    return fx(fsqrt(ffloat(s)))


def cell_radii(cells: list[Cell], W: int, H: int, wrap: bool, obstacle) -> None:
    """0x8801d0: a cell's radius shrinks to its nearest obstacle plot,
    searched over its radius' rings"""
    def getplot(x, y, dq, dr, R):
        d = abs(dq) + abs(dr) if (dq ^ dr) >= 0 else max(abs(dq), abs(dr))
        if d > R:
            return None
        yy = y + dr
        xx = (x - _half(y)) + dq + _half(yy)
        if wrap:
            xx %= W
        if not (0 <= xx < W and 0 <= yy < H):
            return None
        return xx, yy
    for c in cells:
        (px, py), frac = point_to_plot(c.x, c.y)
        i = 0
        while i <= (c.rad >> 8):
            j = 0
            while j <= (c.rad >> 8):
                R = (c.rad >> 8) + (1 if c.rad & 0xff else 0)
                for dq, dr in ((i, j), (i, -j), (-i, j), (-i, -j)):
                    p = getplot(px, py, dq, dr, R)
                    if p is not None and obstacle[p[1] * W + p[0]]:
                        d = plot_distance(p, (px, py), frac)
                        if d < c.rad:
                            c.rad = d
                j += 1
            i += 1


def _prune_leaves(cells: list[Cell], test) -> bool:
    """0x87f1b0 / 0x87f5b0: a leaf cell (one neighbour) the test condemns
    goes; whether any went"""
    any_gone = False
    k = 0
    while k < len(cells):
        c = cells[k]
        if len(c.adj) == 1 and test(c):
            erase_cell(cells, k)
            k -= 1
            any_gone = True
        k += 1
    return any_gone


# --------------------------------------------------------------- marking

def _dist2(a: Cell, b: Cell) -> int:
    """the squared distance of two cells (fixed): 3 X^2 + 2.25 dy^2"""
    dx, dy = i32(a.x - b.x), i32(a.y - b.y)
    t = fmul(fx(2.25), fmul(dy, dy))
    n = dy << 8
    h = i32(-((-n) // 512) if n < 0 else n // 512)
    x = i32(dx + h)
    return i32(i32(3 * fmul(x, x)) + t)


def mark_rooms(cells: list[Cell]) -> None:
    """0x87d6a0: flag 0 on a cell of other than two neighbours, or of two
    whose radius (3 r^2 over 12) beats every other cell's within it"""
    thr = fx(12.0)
    for a in cells:
        if len(a.adj) != 2:
            a.flags[0] = 1
            continue
        R = i32(3 * fmul(a.rad, a.rad))
        if R <= thr:
            continue
        beaten = False
        for b in cells:
            d = _dist2(a, b)
            if 0 < d <= R and b.rad >= a.rad:
                beaten = True
                break
        if not beaten:
            a.flags[0] = 1


def link_marked(cells: list[Cell]) -> None:
    """0x8759a0: from each flagged cell, each path of unflagged cells to the
    next flagged one; the path's narrowest cell (the last of the least
    radius, the far end counted) is flagged 1, keeps the pair, and is linked
    to both ends — once per pair, from the lower end"""
    for i in range(len(cells)):
        ci = cells[i]
        if not ci.flags[0]:
            continue
        n = len(ci.adj)
        for k in range(n):
            min_rad, min_cell, prev = ci.rad, i, i
            cur = ci.adj[k]
            while not cells[cur].flags[0]:
                cc = cells[cur]
                if cc.rad <= min_rad:
                    min_cell, min_rad = cur, cc.rad
                nxt = cc.adj[1] if cc.adj[0] == prev else cc.adj[0]
                prev, cur = cur, nxt
            if cells[cur].rad < min_rad:
                min_cell = cur
            if cur <= i:
                continue
            m = cells[min_cell]
            m.flags[1] = 1
            m.pairs += [i, cur]
            if min_cell not in ci.adj and min_cell != i:
                m.adj.append(i)
                ci.adj.append(min_cell)
            ce = cells[cur]
            if min_cell not in ce.adj and min_cell != cur:
                ce.adj.append(min_cell)
                m.adj.append(cur)


def clean_cells(cells: list[Cell]) -> None:
    """0x871d70: only flagged cells stay"""
    k = 0
    while k < len(cells):
        if not cells[k].flags[0] and not cells[k].flags[1]:
            erase_cell(cells, k)
            k -= 1
        k += 1


def _merge_into(cells: list[Cell], a: int, b: int, c: int) -> bool:
    """0x87df70: cell a joins cell b (its neighbours but c and b move over,
    pairs naming a name b); then a goes, and c too if it is left with no
    pairs; whether the pass is over"""
    for n in list(cells[a].adj):
        if n == c or n == b:
            continue
        cells[b].adj.append(n)
        cells[n].adj.append(b)
    for cell in cells:
        p = cell.pairs
        for i in range(0, len(p) - 1, 2):
            if p[i] == a and p[i + 1] != b:
                p[i] = b
            if p[i + 1] == a and p[i] != b:
                p[i + 1] = b
    erase_cell(cells, a)
    if a == c:
        return True
    c2 = c if a >= c else c - 1
    if not cells[c2].pairs:
        erase_cell(cells, c2)
        return True
    return False


def merge_step(cells: list[Cell]) -> bool:
    """0x87e150: the widest unprocessed chokepoint cell (flag 1) merges the
    cells of its pairs whose radius it nearly matches (0.9 of the narrower,
    else 0.85 of the wider; 0.9 / 0.85 of the other when itself an end)"""
    best, best_rad = -1, 0
    for k, c in enumerate(cells):
        if c.flags[1] and not c.flags[2]:
            if best < 0 or c.rad > best_rad:
                best, best_rad = k, c.rad
    if best < 0:
        return False
    cells[best].flags[2] = 1
    k9, k85 = fx(0.8999999761581421), fx(0.8500000238418579)
    p = 0
    while p < len(cells[best].pairs):
        pairs = cells[best].pairs
        a, b = pairs[p], pairs[p + 1]
        ra, rb = cells[a].rad, cells[b].rad
        if (cells[a].flags[1] and ra > best_rad) or (cells[b].flags[1] and rb > best_rad):
            p += 2
            continue
        if a == best:
            ok = best_rad >= fmul(k9 if rb < ra else k85, rb)
        elif b == best:
            ok = best_rad >= fmul(k9 if ra < rb else k85, ra)
        else:
            ok = best_rad >= fmul(k9, rb if ra >= rb else ra) or best_rad >= fmul(k85, rb if ra <= rb else ra)
        if not ok:
            p += 2
            continue
        if ra < rb:
            done = _merge_into(cells, a, b, best)
            best -= 1 if a < best else 0
        else:
            done = _merge_into(cells, b, a, best)
            best -= 1 if b < best else 0
        if done:
            return True
    return True


# ----------------------------------------------------------- chokepoints

def _cross_fixed(a, b) -> int:
    """0x8737c0: X(a) Y(b) - Y(a) X(b), a fixed, b an integer vector"""
    xb = fx(f32(f32(float(b[0]) + float(b[0])) + float(b[1])))
    t = fmul(a[1], xb)
    xa = i32(a[1] + i32((a[0] << 9) >> 8))
    return i32(fmul(xa, i32(b[1] << 8)) - t)


def cell_triangle(pts, r: Region, cell: Cell) -> int:
    """0x876830: the first triangle holding the cell's point (barycentric,
    fixed), -1 if none"""
    zero, one = fx(0.0), fx(1.0)
    for t, tri in enumerate(r.tris):
        e0, e1 = r.edges[tri[0]], r.edges[tri[1]]
        ia, ib = r.verts[e0[0]], r.verts[e0[1]]
        v = e1[0]
        if v == e0[0] or v == e0[1]:
            v = e1[1]
        ic = r.verts[v]
        A, B, C = pts[ia], pts[ib], pts[ic]
        abq, abr = i32(B[0] - A[0]), i32(B[1] - A[1])
        acq, acr = i32(C[0] - A[0]), i32(C[1] - A[1])
        xab = f32(f32(float(abq) + float(abq)) + float(abr))
        xac = f32(f32(float(acq) + float(acq)) + float(acr))
        d = fx(f32(f32(xab * acr) - f32(xac * abr)))
        xa = f32(f32(float(A[0]) + float(A[0])) + float(A[1]))
        e = fx(f32(f32(xa * acr) - f32(float(A[1]) * xac)))
        u = fdiv(i32(_cross_fixed((cell.x, cell.y), (acq, acr)) - e), d)
        d2 = fx(f32(f32(xab * acr) - f32(xac * abr)))
        e2 = fx(f32(f32(xa * abr) - f32(float(A[1]) * xab)))
        v2 = fdiv(i32(-i32(_cross_fixed((cell.x, cell.y), (abq, abr)) - e2)), d2)
        if u < zero or v2 < zero:
            continue
        if i32(v2 + u) <= one:
            return t
    return -1


def _orient_cell(P, Q, R) -> int:
    """0x881350: the turn P -> Q -> R, P and Q fixed cells, R an integer
    plot (X = 2q + r)"""
    xq = i32(i32((Q[0] << 9) >> 8) + Q[1])
    xp = i32(i32((P[0] << 9) >> 8) + P[1])
    xr = i32((2 * R[0] + R[1]) << 8)
    a = fmul(i32(xr - xq), i32(Q[1] - P[1]))
    b = fmul(i32(xq - xp), i32(i32(R[1] << 8) - Q[1]))
    v = i32(b - a)
    return 0 if v == 0 else (1 if v < 0 else 2)


def _orient_plots(A, B, C) -> int:
    """0x881a10: the turn A -> B -> C, A and B integer plots, C a fixed cell"""
    xc = i32(C[1] + i32((C[0] << 9) >> 8))
    xb_ = i32(B[0] << 9)
    s = fmul(i32(i32(xc - xb_) - i32(B[1] << 8)), i32((B[1] - A[1]) << 8))
    xba = i32((2 * (B[0] - A[0]) - A[1] + B[1]) << 8)
    v = i32(fmul(xba, i32(C[1] - i32(B[1] << 8))) - s)
    return 0 if v == 0 else (1 if v < 0 else 2)


def _plot_on_cells(R, P, Q) -> bool:
    """0x880c70: integer plot R inside the box of fixed cells P, Q, and
    neither of them"""
    if (float(R[0]) == ffloat(P[0]) and float(R[1]) == ffloat(P[1])) or \
            (float(R[0]) == ffloat(Q[0]) and float(R[1]) == ffloat(Q[1])):
        return False
    xq = i32(fmul(Q[0], 512) + Q[1])
    xp = i32(i32((P[0] << 9) >> 8) + P[1])
    xr = float(2 * R[0] + R[1])
    mx = i32(fmul(P[0], 512) + P[1]) if xp > xq else i32(fmul(Q[0], 512) + Q[1])
    if ffloat(mx) < xr:
        return False
    mn = i32(fmul(P[0], 512) + P[1]) if xp < xq else i32(fmul(Q[0], 512) + Q[1])
    if xr < ffloat(mn):
        return False
    my = Q[1] if P[1] <= Q[1] else P[1]
    if ffloat(my) < float(R[1]):
        return False
    ly = Q[1] if P[1] >= Q[1] else P[1]
    return not (float(R[1]) < ffloat(ly))


def _cell_on_plots(P, A, B) -> bool:
    """0x880a90: fixed cell P inside the box of integer plots A, B (its
    second end test reads B's r for both coordinates, as the game does)"""
    if P[0] == i32(A[0] << 8) and P[1] == i32(A[1] << 8):
        return False
    if P[0] == i32(B[1] << 8) and P[1] == i32(B[1] << 8):
        return False
    xa, xb = 2 * A[0] + A[1], 2 * B[0] + B[1]
    xp = i32(fmul(P[0], 512) + P[1])
    if xp > i32(max(xa, xb) << 8):
        return False
    if xp < i32(min(xa, xb) << 8):
        return False
    if P[1] > i32(max(A[1], B[1]) << 8):
        return False
    return not (P[1] < i32(min(A[1], B[1]) << 8))


def _crosses(c, o, p, q) -> bool:
    """the cell segment c-o meets the plot segment p-q (0x8783c0's test)"""
    oa, ob = _orient_cell(c, o, p), _orient_cell(c, o, q)
    s1, s2 = _orient_plots(p, q, c), _orient_plots(p, q, o)
    if s2 * s1 * ob * oa != 0 and oa != ob and s1 != s2:
        return True
    if oa == 0 and _plot_on_cells(p, c, o):
        return True
    if ob == 0 and _plot_on_cells(q, c, o):
        return True
    if s1 == 0 and _cell_on_plots(c, p, q):
        return True
    return s2 == 0 and _cell_on_plots(o, p, q)


def _plot_dist2(a, b) -> int:
    """0x877e00: the squared distance of two plots (fixed, hex steps)"""
    dq, dr = i32((a[0] - b[0]) << 8), i32((a[1] - b[1]) << 8)
    t = fmul(fx(0.75), i32((dr * dr) >> 8))
    n = dr << 8
    h = i32(-((-n) // 512) if n < 0 else n // 512)
    x = i32(h + dq)
    return i32(fmul(x, x) + t)


def _cell_line_dist2(A, B, P) -> int:
    """0x873b00: the squared distance of fixed point P from the line AB"""
    dq, dr = B[0] - A[0], B[1] - A[1]
    xc = fx(f32(float(dq) + f32(float(dr) * HALF)))
    fy = fx(float(dr))
    xp = i32(P[0] + fdiv(P[1], 0x200))
    r12 = fx(f32(f32(f32(B[1] * HALF) + B[0]) * A[1]))
    r13 = fx(f32(f32(f32(A[1] * HALF) + A[0]) * B[1]))
    r15 = fmul(P[1], xc)
    cross = i32(i32(i32(fmul(xp, fy) - r15) - r13) + r12)
    k = fx(0.75)
    l2 = i32(fmul(fmul(fy, fy), k) + fmul(xc, xc))
    return fdiv(fmul(fmul(cross, cross), k), l2)


def choke_points(pts, r: Region, cells: list[Cell]) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    """0x8783c0: for each chokepoint cell, the triangle holding it; per pair
    of its, across each path cell the nearest pair of the triangle's
    obstacles whose edge the cell's link crosses (more than a step apart),
    else the triangle edge nearest the cell; the axial end pairs in order"""
    out = []
    for c in cells:
        if not c.flags[1]:
            continue
        t = cell_triangle(pts, r, c)
        if t < 0 or t >= len(r.tris):
            continue
        tri = r.tris[t]
        a, b = r.edges[tri[0]]
        v = r.edges[tri[1]][0]
        if v == a or v == b:
            v = r.edges[tri[1]][1]
        pA, pB, pC = pts[r.verts[a]], pts[r.verts[b]], pts[r.verts[v]]
        cp = (c.x, c.y)
        best = -1
        bA = bB = None
        k = 0
        while k < len(c.pairs):
            for _ in range(2):
                o = cells[c.pairs[k]]
                op = (o.x, o.y)
                hit = None
                for p, q in ((pA, pB), (pB, pC), (pC, pA)):
                    if _crosses(cp, op, p, q):
                        hit = (p, q)
                        break
                if hit is not None:
                    d = _plot_dist2(hit[0], hit[1]) >> 8
                    if float(d) > 1.0 and (best < 0 or d < best):
                        bA, bB, best = hit[0], hit[1], d
                if (c.flags[0] and c.x == o.x and c.y == o.y) or best < 0:
                    m = None
                    for p, q in ((pA, pB), (pB, pC), (pC, pA)):
                        dd = _cell_line_dist2(p, q, cp)
                        if m is None or m < 0 or dd < m:
                            m, bA, bB = dd, p, q
                    best = m >> 8
                k += 1
            if best >= 0:
                out.append((bA, bB))
    return out


def chokepoint_records(chokes, W: int, wrap: bool, area) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    """0x87cff0: each end pair (offset plots) whose line's plots between
    the ends all lie in one area, once per ordered pair"""
    out = []
    for A, B in chokes:
        a = (A[0] + _half(A[1]), A[1])
        b = (B[0] + _half(B[1]), B[1])
        first = None
        same = True
        for x, y in hex_line(a, b):
            xx = x % W if wrap else x
            k = area[y * W + xx]
            if first is None:
                first = k
            elif k != first:
                same = False
        if same and (a, b) not in out:
            out.append((a, b))
    return out


def analyze(W: int, H: int, wrap: bool, obstacle, area, stages: bool = False) -> dict:
    """AnalyzeChokepoints' analysis (0x86c030): the chokepoints, each its two
    end plots (offset coordinates)"""
    out: dict = {"stages": {}, "chokes": []}
    pts = obstacle_points(W, H, obstacle)
    r = triangulate(pts)
    if r is None:
        return out
    prune_triangles(pts, r)
    cells = dual_graph(pts, r)
    snap = (lambda name: out["stages"].__setitem__(name, [c.dump() for c in cells])) if stages else (lambda name: None)
    snap("dual")
    prune_cells(cells)
    snap("cellprune")
    cell_radii(cells, W, H, wrap, obstacle)
    snap("radius")
    while _prune_leaves(cells, lambda c: c.rad < cells[c.adj[0]].rad):
        pass
    small = fx(1.5)
    while _prune_leaves(cells, lambda c: c.rad < small):
        pass
    snap("pruned")
    mark_rooms(cells)
    snap("d6a0")
    link_marked(cells)
    snap("marked")
    clean_cells(cells)
    snap("cleaned")
    while merge_step(cells):
        pass
    snap("merged")
    recs = chokepoint_records(choke_points(pts, r, cells), W, wrap, area)
    out["chokes"] = [[a[0], a[1], b[0], b[1]] for a, b in recs]
    return out
