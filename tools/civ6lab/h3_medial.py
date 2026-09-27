"""H-3: the land's medial axis as a Voronoi graph: the Delaunay triangulation
of the coastal ocean plots' centres (hex geometry: x + 0.5 on odd rows,
rows sqrt(3)/2 apart), each triangle's circumcentre a Voronoi vertex with
its circumradius (the largest empty circle there). The vertices inside the
land approximate the medial axis; StampContinents' seeds are tested as
those vertices taken greedily by radius, snapped to plots.

    from h3_medial import voronoi_vertices
    verts = voronoi_vertices(case)   # [(cx, cy, r, plot)], plot = the land plot nearest the centre
"""
from __future__ import annotations

import math

S3 = math.sqrt(3) / 2


def centre(g, i, rowh: float = S3) -> tuple[float, float]:
    x, y = i % g.w, i // g.w
    return x + 0.5 * (y & 1), y * rowh


def _circum(ax, ay, bx, by, cx, cy):
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(d) < 1e-12:
        return None
    a2, b2, c2 = ax * ax + ay * ay, bx * bx + by * by, cx * cx + cy * cy
    ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d
    uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d
    return ux, uy, math.hypot(ax - ux, ay - uy)


def delaunay(pts: list[tuple[float, float]]) -> list[tuple[int, int, int]]:
    """Bowyer-Watson; returns index triples into pts"""
    n = len(pts)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    mx, my = min(xs), min(ys)
    span = max(max(xs) - mx, max(ys) - my) + 10
    P = list(pts) + [(mx - 20 * span, my - 20 * span), (mx + 20 * span, my - 20 * span), (mx, my + 20 * span)]
    tris = {(n, n + 1, n + 2): _circum(*P[n], *P[n + 1], *P[n + 2])}
    for k in range(n):
        px, py = P[k]
        bad = [t for t, cc in tris.items() if cc and math.hypot(px - cc[0], py - cc[1]) < cc[2] - 1e-9]
        edges: dict = {}
        for t in bad:
            for e in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                key = tuple(sorted(e))
                edges[key] = edges.get(key, 0) + 1
            del tris[t]
        for (a, b), cnt in edges.items():
            if cnt == 1:
                t = (a, b, k)
                tris[t] = _circum(*P[a], *P[b], *P[k])
    return [t for t in tris if max(t) < n]


def voronoi_vertices(c: dict, rowh: float = S3, pad: int = 2):
    """(cx, cy, r, plot) for every Delaunay triangle of the ocean plots next
    to (within `pad` of) land whose circumcentre lies over land"""
    g = c["g"]
    land = c["land"]
    near = set()
    for i in range(g.n):
        if land[i]:
            fr = [i]
            seen = {i}
            for _ in range(pad):
                nx = []
                for u in fr:
                    for v in g.ring1(u):
                        if v is not None and v not in seen:
                            seen.add(v)
                            nx.append(v)
                fr = nx
            near |= {v for v in seen if not land[v]}
    water = sorted(near)
    pts = [centre(g, i, rowh) for i in water]
    # unwrap x around the land's own gap
    cols = sorted({i % g.w for i in range(g.n) if land[i]})
    gaps = [((cols[(k + 1) % len(cols)] - cols[k]) % g.w, cols[(k + 1) % len(cols)]) for k in range(len(cols))]
    start = max(gaps)[1] if len(cols) > 1 else 0
    shift = lambda x: (x - start + pad + 1) % g.w
    pts = [(shift(px - 0.5 * ((water[k] // g.w) & 1)) + 0.5 * ((water[k] // g.w) & 1), py) for k, (px, py) in enumerate(pts)]
    lcent = {i: (shift(i % g.w) + 0.5 * ((i // g.w) & 1), (i // g.w) * rowh) for i in range(g.n) if land[i]}
    out = []
    for t in delaunay(pts):
        cc = _circum(*pts[t[0]], *pts[t[1]], *pts[t[2]])
        if cc is None:
            continue
        ux, uy, r = cc
        best, bd = None, 1e9
        for i, (lx, ly) in lcent.items():
            if abs(ly - uy) > 1.5 or abs(lx - ux) > 1.5:
                continue
            d = math.hypot(lx - ux, ly - uy)
            if d < bd:
                best, bd = i, d
        if best is not None and bd < 0.8:
            out.append((ux, uy, r, best, tuple(water[q] for q in t)))
    return out
