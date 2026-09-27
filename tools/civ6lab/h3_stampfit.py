"""H-3: StampContinents' partition: the recorded stamps (exp records of
civ6lab_mapprobe_exp.lua, and the natives probe's natural stamps) with each
part's number k (the part that takes shuffled[k]), and candidate partition
rules scored on them.

    python tools/civ6lab/h3_stampfit.py show runs/h3_session_<exp>.jsonl [--map NAME]
    python tools/civ6lab/h3_stampfit.py score [runs ...]

The exp probe stamps shape after shape before the real generation, each
StampContinents taking its 43 draws: stamp j starts at the map seed's state
advanced 43 j (checked: every stamp's types are shuffled[0..N-1]).
"""
from __future__ import annotations

import collections
import glob
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_x import Grid, Session, advance, unrle, M32  # noqa: E402
from h3_stamp import shuffles  # noqa: E402

NCONT = {44: 1, 60: 2, 74: 3, 84: 4, 96: 5, 106: 6}
EXP = ["h3_session_20260927T021509Z.jsonl", "h3_session_20260927T023441Z.jsonl",
       "h3_session_20260927T023549Z.jsonl", "h3_session_20260927T024959Z.jsonl"]


def load_cases(paths: list[str]) -> list[dict]:
    """every stamp: grid, land mask at the stamp (0 land / 1 water), the
    continent per plot, and part[i] = k (shuffled[k]) or -1"""
    out = []
    for p in paths:
        if pathlib.Path(p).name.startswith("h3_stampx_"):
            import json
            d = json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
            w, h = d["grid"]
            g = Grid(w, h)
            n = NCONT[w]
            seed = d["map_seed"] & M32
            sts = d["stamps"]
            off = None
            for o in range(0, 200):
                if all(set(unrle(e["cont"])) - {-1} <= set(shuffles(advance(seed, o + 43 * j))["fy_forward"][:n])
                       for j, e in enumerate(sts)):
                    off = o
                    break
            for j, e in enumerate(sts):
                cont = unrle(e["cont"])
                land = [v == 0 for v in unrle(e["land"])]
                a = shuffles(advance(seed, (off or 0) + 43 * j))["fy_forward"] if off is not None else None
                rank = {c: a.index(c) for c in set(cont) - {-1}} if a else {}
                out.append({"src": pathlib.Path(p).stem[-7:], "name": e["name"], "g": g, "n": n, "land": land,
                            "cont": cont, "part": [rank.get(c, -1) if c != -1 else -1 for c in cont],
                            "off": off, "cls": [("L" if v else None) for v in land]})
            continue
        s = Session(p)
        if s.xs("exp"):
            w, h = map(int, s.x1("grid")[1].split(","))
            g = Grid(w, h)
            n = NCONT[w]
            seed = s.rec["map_seed"] & M32
            exps = s.xs("exp")
            # the draw offset of the first stamp: the one that makes every
            # stamp's continent types shuffled[0..n-1]
            off = None
            for o in range(0, 200):
                good = True
                for j, e in enumerate(exps):
                    cont = set(unrle(e[3])) - {-1}
                    a = shuffles(advance(seed, o + 43 * j))["fy_forward"]
                    if not cont <= set(a[:n]):
                        good = False
                        break
                if good:
                    off = o
                    break
            for j, e in enumerate(exps):
                cont = unrle(e[3])
                land = [v == 0 for v in unrle(e[2])]
                a = shuffles(advance(seed, (off or 0) + 43 * j))["fy_forward"] if off is not None else None
                rank = {c: a.index(c) for c in set(cont) - {-1}} if a else {}
                cls = [("L" if v else None) for v in land]
                if e[1] in ("rect_mountain_wall", "rectB_grass_mountain_col"):
                    for i in range(g.n):
                        if land[i] and i % w == w // 2:
                            cls[i] = "M"
                out.append({"src": pathlib.Path(p).stem[-7:], "name": e[1], "g": g, "n": n, "land": land,
                            "cont": cont, "part": [rank.get(c, -1) if c != -1 else -1 for c in cont],
                            "off": off, "cls": cls})
        else:
            before = s.x1("stamp", "before")
            after = s.x1("stamp", "after")
            if before is None or after is None:
                continue
            g = s.g
            n = NCONT[g.w]
            cont = unrle(after[2])
            st = s.state_before("TerrainBuilder.StampContinents")
            a = shuffles(st)["fy_forward"]
            bv = unrle(before[2])
            # mountains as the final map has them (later stages move a few)
            cls = [None if v == 1 else "K" if v == 2 else
                   ("M" if s.terrain[i] < 15 and s.terrain[i] % 3 == 2 else "L") for i, v in enumerate(bv)]
            out.append({"src": pathlib.Path(p).stem[-7:], "name": "natural", "g": g, "n": n,
                        "land": [v != 1 for v in bv], "cont": cont, "cls": cls,
                        "part": [a.index(c) if c != -1 else -1 for c in cont], "off": "ledger"})
    return out


def areas(c: dict) -> list[dict]:
    """the non-ocean components (6-neighbour, x wrapping) of three classes as
    AreaBuilder makes them: water (lakes: the stamp's non-ocean water),
    passable land, mountains; in order of lowest plot index"""
    g = c["g"]
    cls = c.get("cls") or [("L" if v else None) for v in c["land"]]
    seen = [False] * g.n
    out = []
    for i in range(g.n):
        if seen[i] or cls[i] is None:
            continue
        comp, stack = [], [i]
        seen[i] = True
        while stack:
            u = stack.pop()
            comp.append(u)
            for v in g.ring1(u):
                if v is not None and not seen[v] and cls[v] == cls[i]:
                    seen[v] = True
                    stack.append(v)
        out.append({"kind": cls[i], "plots": sorted(comp)})
    return out


TIE_LOW = "--tiehigh" not in sys.argv
_DCACHE: dict = {}


def hexdist(g: Grid):
    """all-pairs hex distance (x wrapping), cached per grid"""
    import numpy as np
    if g.w in _DCACHE:
        return _DCACHE[g.w]
    idx = np.arange(g.n)
    x, y = idx % g.w, idx // g.w
    q = x - (y - (y & 1)) // 2
    best = None
    for sh in (-g.w, 0, g.w):
        qs = (x + sh) - (y - (y & 1)) // 2
        dq = q[:, None] - qs[None, :]
        dr = y[:, None] - y[None, :]
        d = (np.abs(dq) + np.abs(dr) + np.abs(dq + dr)) // 2
        best = d if best is None else np.minimum(best, d)
    _DCACHE[g.w] = best.astype(np.int16)
    return _DCACHE[g.w]


def depth(c: dict) -> list[int]:
    """hex distance from each land plot to the nearest ocean plot (BFS)"""
    g = c["g"]
    d = [-1] * g.n
    fr = [i for i in range(g.n) if not c["land"][i]]
    for i in fr:
        d[i] = 0
    k = 0
    while fr:
        k += 1
        nx = []
        for u in fr:
            for v in g.ring1(u):
                if v is not None and d[v] < 0:
                    d[v] = k
                    nx.append(v)
        fr = nx
    return d


_ECACHE: dict = {}


def eucl(g: Grid):
    """all-pairs Euclidean distance between hex centres (x wrapping)"""
    import numpy as np
    if g.w in _ECACHE:
        return _ECACHE[g.w]
    idx = np.arange(g.n)
    x, y = idx % g.w, idx // g.w
    cx = x + 0.5 * (y & 1)
    cy = y * (3 ** 0.5) / 2
    best = None
    for sh in (-g.w, 0, g.w):
        d = np.hypot(cx[:, None] - (cx[None, :] + sh), cy[:, None] - cy[None, :])
        best = d if best is None else np.minimum(best, d)
    _ECACHE[g.w] = best.astype(np.float32)
    return _ECACHE[g.w]


def edepth(c: dict) -> list[float]:
    """Euclidean distance from each plot's centre to the nearest ocean plot's
    centre"""
    import numpy as np
    E = eucl(c["g"])
    water = np.array([not v for v in c["land"]])
    if not water.any():
        return [0.0] * c["g"].n
    return E[:, water].min(axis=1).tolist()


def edepth1(c: dict) -> list[float]:
    """Euclidean distance to the nearest ocean plot with plot centres at
    (x + 0.5 odd, y): rows one unit apart"""
    import numpy as np
    g = c["g"]
    idx = np.arange(g.n)
    x, y = idx % g.w, idx // g.w
    cx = x + 0.5 * (y & 1)
    water = np.array([not v for v in c["land"]])
    if not water.any():
        return [0.0] * g.n
    wx, wy = cx[water], y[water]
    best = None
    for sh in (-g.w, 0, g.w):
        d = np.hypot(cx[:, None] - (wx[None, :] + sh), y[:, None] - wy[None, :]).min(axis=1)
        best = d if best is None else np.minimum(best, d)
    return best.tolist()


def geodist(c: dict):
    """all-pairs land-path distance (6 neighbours through land plots, x
    wrapping); 9999 across water"""
    import numpy as np
    g = c["g"]
    land = [i for i in range(g.n) if c["land"][i]]
    D = np.full((g.n, g.n), 9999, dtype=np.int32)
    nb = {i: [v for v in g.ring1(i) if v is not None and c["land"][v]] for i in land}
    for s in land:
        row = D[s]
        row[s] = 0
        fr = [s]
        k = 0
        while fr:
            k += 1
            nx = []
            for u in fr:
                for v in nb[u]:
                    if row[v] == 9999:
                        row[v] = k
                        nx.append(v)
            fr = nx
    return D


def seed_sets(c: dict, cap: int = 200000, metric: str = "geo"):
    """all seed tuples (s_0..s_{m-1}, s_k in part k) with: every plot of
    part i no farther from s_i than from s_j for j > i, and strictly
    nearer than to s_j for j < i (hex or land-path distance)"""
    import itertools
    import numpy as np
    g = c["g"]
    D = geodist(c) if metric == "geo" else hexdist(g).astype(np.int32)
    ks = sorted({k for k in c["part"] if k >= 0})
    P = {k: np.array([i for i in range(g.n) if c["part"][i] == k]) for k in ks}
    # pairwise feasibility matrices F[(i,j)][a_idx, b_idx], i < j
    F = {}
    for i, j in itertools.combinations(ks, 2):
        Ai, Aj = P[i], P[j]
        # plots of part i: D(p, a) <= D(p, b); plots of part j: D(p, b) < D(p, a)
        dai = D[np.ix_(Ai, Ai)]  # [a, p]
        dbi = D[np.ix_(Aj, Ai)]  # [b, p]
        daj = D[np.ix_(Ai, Aj)]
        dbj = D[np.ix_(Aj, Aj)]
        ok = np.ones((len(Ai), len(Aj)), dtype=bool)
        for a in range(len(Ai)):
            c1 = ((dai[a][None, :] <= dbi) if TIE_LOW else (dai[a][None, :] < dbi)).all(axis=1)
            c2 = ((dbj < daj[a][None, :]) if TIE_LOW else (dbj <= daj[a][None, :])).all(axis=1)
            ok[a] = c1 & c2
        F[(i, j)] = ok
    dom = {k: np.ones(len(P[k]), dtype=bool) for k in ks}
    changed = True
    while changed:
        changed = False
        for (i, j), ok in F.items():
            ni = dom[i] & (ok[:, dom[j]].any(axis=1) if dom[j].any() else False)
            nj = dom[j] & (ok[dom[i], :].any(axis=0) if dom[i].any() else False)
            if (ni != dom[i]).any() or (nj != dom[j]).any():
                dom[i], dom[j], changed = ni, nj, True
    cand = {k: np.nonzero(dom[k])[0].tolist() for k in ks}
    out: list = []
    limit = 500

    def dfs(n: int, chosen: list) -> None:
        if len(out) >= limit:
            return
        if n == len(ks):
            out.append(tuple(int(P[k][chosen[m]]) for m, k in enumerate(ks)))
            return
        kn = ks[n]
        for a in cand[kn]:
            if all(F[(ks[m], kn)][chosen[m], a] for m in range(n)):
                chosen.append(a)
                dfs(n + 1, chosen)
                chosen.pop()

    dfs(0, [])
    return out


_SSCACHE: dict | None = None
SSCACHE_PATH = HERE / "runs" / "h3_seedsets_cache.json"


def seed_sets_cached(c: dict):
    """seed_sets with its results kept in runs/h3_seedsets_cache.json"""
    import json
    global _SSCACHE
    if _SSCACHE is None:
        _SSCACHE = json.loads(SSCACHE_PATH.read_text()) if SSCACHE_PATH.exists() else {}
    key = f"{c['src']}|{c['name']}|geo|{TIE_LOW}"
    if _SSCACHE.get(key) is None:
        r = seed_sets(c)
        _SSCACHE[key] = None if r is None else [list(t) for t in r[:500]]
        SSCACHE_PATH.write_text(json.dumps(_SSCACHE))
    r = _SSCACHE[key]
    return None if r is None else [tuple(t) for t in r]


def greedy_seeds(c: dict, D, dep, n: int, rule: str, k: float, order: str) -> list[int]:
    land = [i for i in range(c["g"].n) if c["land"][i]]
    land.sort(key=lambda i: (-round(dep[i], 5), -i if order == "desc" else i))
    seeds: list[int] = []
    for i in land:
        ok = True
        for s in seeds:
            need = {"seed": dep[s], "own": dep[i], "max": max(dep[s], dep[i]), "min": min(dep[s], dep[i]),
                    "sum": dep[s] + dep[i]}[rule] - k
            if D[i, s] < need:
                ok = False
                break
        if ok:
            seeds.append(i)
            if len(seeds) == n:
                break
    return seeds


def voronoi(c: dict, D, seeds: list[int], tie: str = "first") -> list[int]:
    import numpy as np
    sub = D[seeds]  # (k, n)
    if tie == "first":
        lab = np.argmin(sub, axis=0)
    else:
        lab = len(seeds) - 1 - np.argmin(sub[::-1], axis=0)
    return [int(lab[i]) if c["land"][i] else -1 for i in range(c["g"].n)]


def exact_score(c: dict, pred: list[int]) -> tuple[int, int, bool]:
    """plots whose part number agrees (labels as numbers k), land plots,
    and whether the partition agrees up to relabelling"""
    land = [i for i in range(c["g"].n) if c["land"][i]]
    same = sum(1 for i in land if pred[i] == c["part"][i])
    pairs = collections.Counter((pred[i], c["part"][i]) for i in land)
    m1 = {}
    part_ok = True
    for (a, b), _ in pairs.items():
        if m1.setdefault(a, b) != b:
            part_ok = False
    if len(set(m1.values())) != len(m1):
        part_ok = False
    return same, len(land), part_ok


def describe(c: dict) -> str:
    g = c["g"]
    cnt = collections.Counter(k for k in c["part"] if k >= 0)
    box = {}
    for i, k in enumerate(c["part"]):
        if k < 0:
            continue
        x, y = i % g.w, i // g.w
        b = box.setdefault(k, [x, y, x, y])
        b[0], b[1], b[2], b[3] = min(b[0], x), min(b[1], y), max(b[2], x), max(b[3], y)
    return "  ".join(f"k{k}:{cnt[k]} {box[k]}" for k in sorted(cnt))


def show_map(c: dict) -> None:
    g = c["g"]
    for y in range(g.h - 1, -1, -1):
        row = []
        for x in range(g.w):
            i = y * g.w + x
            k = c["part"][i]
            row.append(str(k) if k >= 0 else ("." if not c["land"][i] else "?"))
        print(f"{y:3d} " + (" " if y % 2 else "") + " ".join(row))


def centres(c: dict, idx) -> "np.ndarray":
    """hex centres (x + 0.5 odd, y * sqrt(3)/2), x unwrapped around the
    land's own gap (the widest water column run)"""
    import numpy as np
    g = c["g"]
    idx = np.asarray(idx)
    x, y = idx % g.w, idx // g.w
    cols = sorted({int(i % g.w) for i, v in enumerate(c["land"]) if v})
    # rotate so the widest empty column gap is at the seam
    gaps = [((cols[(k + 1) % len(cols)] - cols[k]) % g.w, cols[(k + 1) % len(cols)]) for k in range(len(cols))]
    start = max(gaps)[1] if len(cols) > 1 else 0
    xs = (x - start) % g.w
    return np.stack([xs + 0.5 * (y & 1), y * (3 ** 0.5) / 2], axis=1)


def separable(a, b, steps: int = 7200) -> tuple[bool, float, float]:
    """two point sets split by a straight line: (yes, angle degrees, margin)"""
    import numpy as np
    th = np.linspace(0, np.pi, steps, endpoint=False)
    d = np.stack([np.cos(th), np.sin(th)], axis=1)
    pa, pb = a @ d.T, b @ d.T
    m1 = pb.min(axis=0) - pa.max(axis=0)
    m2 = pa.min(axis=0) - pb.max(axis=0)
    m = np.maximum(m1, m2)
    k = int(m.argmax())
    return bool(m[k] > 0), float(np.degrees(th[k])), float(m[k])


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    cmd = sys.argv[1]
    valued = ("--map", "--variant", "--parts", "--metric")
    args, skip = [], False
    for a in sys.argv[2:]:
        if skip:
            skip = False
            continue
        if a in valued:
            skip = True
            continue
        if not a.startswith("--"):
            args.append(a)
    want = sys.argv[sys.argv.index("--map") + 1] if "--map" in sys.argv else None
    paths = args or [str(HERE / "runs" / e) for e in EXP]
    cases = load_cases(paths)
    if cmd == "show":
        for c in cases:
            print(f"{c['src']} {c['g'].w}x{c['g'].h} N={c['n']} off={c['off']} {c['name']:28s} {describe(c)}")
            if c["name"] == want:
                show_map(c)
            if "--areas" in sys.argv:
                for a in areas(c):
                    ks = collections.Counter(c["part"][i] for i in a["plots"])
                    print(f"      area {a['kind']} lo {a['plots'][0]} size {len(a['plots'])} parts {dict(ks)}")
    elif cmd == "greedy":
        seen = set()
        tot = collections.Counter()
        exact = collections.Counter()
        part = collections.Counter()
        n_cases = 0
        for c in cases:
            key = (c["g"].w, c["name"], tuple(c["part"]))
            if key in seen:
                continue
            seen.add(key)
            n_cases += 1
            D = hexdist(c["g"])
            E = eucl(c["g"])
            deps = {"hd": depth(c), "ed": edepth(c)}
            line = []
            for dk, dep in deps.items():
                for sk, S in (("hs", D), ("es", E)):
                    for rule in ("seed", "own", "max", "min"):
                        for k in (0, 0.5, 1, 1.5, 2):
                            for order in ("desc", "asc"):
                                tie = "first"
                                seeds = greedy_seeds(c, S, dep, c["n"], rule, k, order)
                                pred = voronoi(c, D, seeds, tie)
                                s, m, pok = exact_score(c, pred)
                                name = f"{dk}-{sk}-{rule}-{k}-{order}-{tie}"
                                tot[name] += m
                                exact[name] += s
                                part[name] += pok
                                line.append((s == m, pok, s, name))
            best = max(line)
            print(f"{c['g'].w}x{c['g'].h} {c['name']:28s} best {best[3]:18s} {best[2]}/{sum(c['land'])}"
                  f" exact={best[0]} partition={best[1]}")
        for k in sorted(tot, key=lambda k: -exact[k])[:10]:
            print(f"{k:22s} plots {exact[k]}/{tot[k]} = {exact[k] / tot[k]:.4f}  partitions {part[k]}/{n_cases}")
    elif cmd == "diag":
        # one case under one greedy variant: seeds, depth, diff map
        rule, k, order, tie = sys.argv[sys.argv.index("--variant") + 1].split("-")
        for c in cases:
            if c["name"] != want:
                continue
            g = c["g"]
            D = hexdist(g)
            dep = depth(c)
            seeds = greedy_seeds(c, D, dep, c["n"], rule, int(k), order)
            pred = voronoi(c, D, seeds, tie)
            print(c["src"], c["name"], "seeds", [(s % g.w, s // g.w, dep[s]) for s in seeds],
                  "score", exact_score(c, pred))
            xs = [i % g.w for i in range(g.n) if c["land"][i]]
            ys = [i // g.w for i in range(g.n) if c["land"][i]]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            for y in range(y1, y0 - 1, -1):
                row = []
                for x in range(x0, x1 + 1):
                    i = y * g.w + x
                    if not c["land"][i]:
                        row.append(" .")
                    elif i in seeds:
                        row.append("*" + str(pred[i]))
                    elif pred[i] == c["part"][i]:
                        row.append(" " + str(pred[i]))
                    else:
                        row.append(f"{c['part'][i]}{pred[i]}".replace(str(c['part'][i]), chr(ord('a') + c['part'][i]), 1))
                print(f"{y:3d} " + (" " if y % 2 else "") + "".join(row))
            break
    elif cmd == "pairfit":
        # seed pairs (a in part ka, b in part kb) whose hex Voronoi gives the
        # two parts exactly on their union, a tie to a (first) or to b
        import numpy as np
        ka, kb = (int(x) for x in sys.argv[sys.argv.index("--parts") + 1].split(","))
        for c in cases:
            if c["name"] != want:
                continue
            g = c["g"]
            D = hexdist(g)
            dep = depth(c)
            A = [i for i in range(g.n) if c["part"][i] == ka]
            B = [i for i in range(g.n) if c["part"][i] == kb]
            U = np.array(A + B)
            lab = np.array([0] * len(A) + [1] * len(B))
            metric = sys.argv[sys.argv.index("--metric") + 1] if "--metric" in sys.argv else "hex"
            if metric == "hex":
                Mx = D.astype(np.float64)
            elif metric == "hexeu":
                Mx = D.astype(np.float64) + eucl(g).astype(np.float64) / 1000.0
            else:
                Mx = eucl(g).astype(np.float64)
            da = Mx[np.ix_(A, U)]
            db = Mx[np.ix_(B, U)]
            dep = [round(v, 2) for v in edepth(c)] if "--ed" in sys.argv else dep
            for tie in ("a", "b"):
                sols = []
                for ia, a in enumerate(A):
                    dA = da[ia][None, :]
                    ok = np.where(lab == 0, dA <= db if tie == "a" else dA < db,
                                  db < dA if tie == "a" else db <= dA).all(axis=1)
                    for ib in np.nonzero(ok)[0]:
                        sols.append((a, B[ib]))
                print(c["src"], c["name"], f"tie->{tie}: {len(sols)} pairs")
                for a, b in sols[:40]:
                    print(f"   a ({a % g.w},{a // g.w}) d{dep[a]}  b ({b % g.w},{b // g.w}) d{dep[b]}  D {D[a, b]}")
    elif cmd == "seedsets":
        # every seed tuple (one plot per part) whose one-shot hex Voronoi, a
        # tie to the lower part number, gives the partition exactly
        for c in cases:
            if want and c["name"] != want:
                continue
            sets = seed_sets_cached(c)
            g = c["g"]
            dep = depth(c)
            ed = edepth1(c)
            if sets is None:
                print(c["src"], c["name"], "too many")
                continue
            print(c["src"], c["name"], f"{len(sets)} seed tuples")
            for t in sets[:12]:
                print("   ", " ".join(f"({s % g.w},{s // g.w}) h{dep[s]} e{ed[s]:.2f}" for s in t))
    elif cmd == "firstseed":
        # the first seed where every exact seed tuple agrees on it, ranked
        # under candidate orders over all land plots
        import numpy as np
        keysets = {}
        results = collections.defaultdict(list)
        for c in cases:
            if want and c["name"] != want:
                continue
            sets = seed_sets_cached(c)
            if not sets:
                continue
            firsts = {t[0] for t in sets}
            if len(firsts) != 1:
                continue
            s0 = firsts.pop()
            g = c["g"]
            hd = depth(c)
            e1 = edepth1(c)
            eT = edepth(c)
            land = [i for i in range(g.n) if c["land"][i]]
            keys = {
                "hd,idx": lambda i: (hd[i], i),
                "hd,-idx": lambda i: (hd[i], -i),
                "hd,eT,idx": lambda i: (hd[i], round(eT[i], 4), i),
                "hd,eT,-idx": lambda i: (hd[i], round(eT[i], 4), -i),
                "hd,e1,idx": lambda i: (hd[i], round(e1[i], 4), i),
                "hd,e1,-idx": lambda i: (hd[i], round(e1[i], 4), -i),
                "eT,idx": lambda i: (round(eT[i], 4), i),
                "eT,-idx": lambda i: (round(eT[i], 4), -i),
                "e1,idx": lambda i: (round(e1[i], 4), i),
                "e1,-idx": lambda i: (round(e1[i], 4), -i),
                "e1,y,-x": lambda i: (round(e1[i], 4), i // g.w, -(i % g.w)),
                "eT,y,-x": lambda i: (round(eT[i], 4), i // g.w, -(i % g.w)),
                "hd,e1,y,-x": lambda i: (hd[i], round(e1[i], 4), i // g.w, -(i % g.w)),
            }
            line = []
            for kn, kf in keys.items():
                best = max(land, key=kf)
                ok = best == s0
                results[kn].append(ok)
                if ok:
                    line.append(kn)
            print(f"{c['src']} {c['g'].w}x{c['g'].h} {c['name']:24s} s0 ({s0 % g.w},{s0 // g.w}) h{hd[s0]} "
                  f"e1 {e1[s0]:.2f} eT {eT[s0]:.2f}  ok: {' '.join(line)}")
        for kn, v in results.items():
            print(f"{kn:14s} {sum(v)}/{len(v)}")
    elif cmd == "firstscan":
        # scan depth metrics sqrt(dx^2 + (s dy)^2) (row scale s, parity
        # offset) for the first-seed key (depth, index)
        import numpy as np
        data = []
        for c in cases:
            sets = seed_sets_cached(c)
            if not sets:
                continue
            firsts = {t[0] for t in sets}
            if len(firsts) != 1:
                continue
            data.append((c, firsts.pop()))
        print(len(data), "cases with a determined first seed")
        for par in ("odd", "even"):
            for s in [0.80, 0.84, 0.86, 0.8660254, 0.87, 0.88, 0.9, 0.95, 1.0, 1.05, 1.1]:
                for prim in ("none", "hd"):
                    ok = 0
                    bad = []
                    for c, s0 in data:
                        g = c["g"]
                        idx = np.arange(g.n)
                        x, y = idx % g.w, idx // g.w
                        off = (y & 1) if par == "odd" else 1 - (y & 1)
                        cx = x + 0.5 * off
                        water = np.array([not v for v in c["land"]])
                        wx, wy = cx[water], y[water]
                        best = None
                        for sh in (-g.w, 0, g.w):
                            d = np.hypot(cx[:, None] - (wx[None, :] + sh), s * (y[:, None] - wy[None, :])).min(axis=1)
                            best = d if best is None else np.minimum(best, d)
                        hd = depth(c)
                        land = [i for i in range(g.n) if c["land"][i]]
                        if prim == "hd":
                            b = max(land, key=lambda i: (hd[i], round(float(best[i]), 6), i))
                        else:
                            b = max(land, key=lambda i: (round(float(best[i]), 6), i))
                        if b == s0:
                            ok += 1
                        else:
                            bad.append(c["name"])
                    print(f"parity {par} s {s:.4f} {prim:4s}: {ok}/{len(data)}  bad {sorted(set(bad))[:8]}")
    elif cmd == "seedinfo":
        # the determined seeds of each case: depth, Euclidean depth, and the
        # hex and land-path distances to the earlier seeds
        for c in cases:
            if want and c["name"] != want:
                continue
            sets = seed_sets_cached(c)
            if not sets:
                continue
            g = c["g"]
            hd, e1 = depth(c), edepth1(c)
            D = hexdist(g)
            for t in sets[:3]:
                parts = []
                for n, s in enumerate(t):
                    dd = ",".join(str(int(D[s, t[m]])) for m in range(n))
                    parts.append(f"({s % g.w},{s // g.w}) h{hd[s]} e{e1[s]:.2f} D[{dd}]")
                print(f"{c['src']} {c['name']:22s} {len(sets):4d}: " + "  ".join(parts))
    elif cmd == "eastlfirst":
        # the first seed as the head of an EASTL sort of the land plots
        from h3_eastl import eastl_sort
        res = collections.Counter()
        tot = 0
        for c in cases:
            sets = seed_sets_cached(c)
            if not sets:
                continue
            firsts = {t[0] for t in sets}
            if len(firsts) != 1:
                continue
            s0 = firsts.pop()
            tot += 1
            g = c["g"]
            keys = {"hd": depth(c), "e1": [round(v, 6) for v in edepth1(c)], "eT": [round(v, 6) for v in edepth(c)]}
            land = [i for i in range(g.n) if c["land"][i]]
            good = []
            for kn, kv in keys.items():
                for inp in ("asc", "desc"):
                    base = land if inp == "asc" else land[::-1]
                    for how in ("desc_first", "asc_last"):
                        t = list(base)
                        if how == "desc_first":
                            eastl_sort(t, lambda a, b: kv[a] > kv[b])
                            head = t[0]
                        else:
                            eastl_sort(t, lambda a, b: kv[a] < kv[b])
                            head = t[-1]
                        name = f"{kn}-{inp}-{how}"
                        if head == s0:
                            res[name] += 1
                            good.append(name)
            print(f"{c['src']} {c['name']:22s} s0 ({s0 % g.w},{s0 // g.w}): {' '.join(good)}")
        for k, v in res.most_common():
            print(f"{k:22s} {v}/{tot}")
    elif cmd == "rulescan":
        # greedy seeds in (depth desc, index desc) order, a candidate kept
        # when dist(c, s) >= g(depth_s, depth_c) - k for every earlier seed;
        # scored against the cases whose seed tuple is determined
        import numpy as np
        data = []
        for c in cases:
            sets = seed_sets_cached(c)
            if sets and len(sets) <= 3 and len({t[0] for t in sets}) == 1:
                data.append((c, [tuple(t) for t in sets]))
        print(len(data), "cases")
        pre = []
        for c, sets in data:
            g = c["g"]
            land = [i for i in range(g.n) if c["land"][i]]
            deps = {"hd": depth(c), "e1": edepth1(c), "eT": edepth(c)}
            dists = {"hex": hexdist(g), "e1": None, "eT": eucl(g)}
            idx = np.arange(g.n)
            cx = idx % g.w + 0.5 * ((idx // g.w) & 1)
            cy = (idx // g.w).astype(float)
            sub = np.array(land)
            dists["e1"] = None
            pre.append((c, sets, land, deps, dists, cx, cy))
        results = []
        for ok_name in ("e1", "hd"):
            for dk in ("e1", "hd", "eT"):
                for dist in ("hex", "e1", "eT"):
                    for gname in ("s", "c", "min", "max"):
                        for k in np.arange(0.0, 3.01, 0.25):
                            score = 0
                            for c, sets, land, deps, dists, cx, cy in pre:
                                g = c["g"]
                                od = deps[ok_name]
                                order = sorted(land, key=lambda i: (-round(od[i], 5), -i))
                                dp = deps[dk]
                                seeds = []
                                for i in order:
                                    good = True
                                    for s in seeds:
                                        if dist == "hex":
                                            d = float(dists["hex"][i, s])
                                        elif dist == "eT":
                                            d = float(dists["eT"][i, s])
                                        else:
                                            dx = abs(cx[i] - cx[s])
                                            dx = min(dx, g.w - dx)
                                            d = float(np.hypot(dx, cy[i] - cy[s]))
                                        gv = {"s": dp[s], "c": dp[i], "min": min(dp[s], dp[i]),
                                              "max": max(dp[s], dp[i])}[gname]
                                        if d < gv - k - 1e-9:
                                            good = False
                                            break
                                    if good:
                                        seeds.append(i)
                                        if len(seeds) == c["n"]:
                                            break
                                if tuple(seeds) in sets:
                                    score += 1
                            results.append((score, f"order {ok_name} depth {dk} dist {dist} g {gname} k {k:.2f}"))
        results.sort(reverse=True)
        for s, name in results[:25]:
            print(s, name)
    elif cmd == "ratioscan":
        # greedy in (e1 desc, index desc) order; a candidate kept when its
        # distance (e1 metric) to every earlier seed exceeds alpha * depth
        import numpy as np
        data = []
        for c in cases:
            sets = seed_sets_cached(c)
            if sets and len(sets) <= 3 and len({t[0] for t in sets}) == 1:
                g = c["g"]
                e1 = edepth1(c)
                idx = np.arange(g.n)
                cx = idx % g.w + 0.5 * ((idx // g.w) & 1)
                cy = (idx // g.w).astype(float)
                land = sorted((i for i in range(g.n) if c["land"][i]), key=lambda i: (-round(e1[i], 5), -i))
                data.append((c, sets, e1, depth(c), cx, cy, land))
        print(len(data), "cases")
        res = []
        for dk in ("e1", "hd"):
            for gname in ("c", "s", "min", "max"):
                for strict in (True, False):
                    for alpha in np.arange(0.60, 0.851, 0.005):
                        score = 0
                        bad = []
                        for c, sets, e1, hd, cx, cy, land in data:
                            g = c["g"]
                            dp = e1 if dk == "e1" else hd
                            seeds = []
                            for i in land:
                                good = True
                                for s in seeds:
                                    dx = abs(cx[i] - cx[s])
                                    dx = min(dx, g.w - dx)
                                    d = (dx * dx + (cy[i] - cy[s]) ** 2) ** 0.5
                                    gv = {"c": dp[i], "s": dp[s], "min": min(dp[i], dp[s]), "max": max(dp[i], dp[s])}[gname]
                                    lim = alpha * gv
                                    if (d <= lim + 1e-9) if strict else (d < lim - 1e-9):
                                        good = False
                                        break
                                if good:
                                    seeds.append(i)
                                    if len(seeds) == c["n"]:
                                        break
                            if tuple(seeds) in sets:
                                score += 1
                            else:
                                bad.append(c["name"])
                        res.append((score, f"{dk} {gname} strict={strict} alpha {alpha:.3f}", sorted(set(bad))))
        res.sort(key=lambda r: -r[0])
        for s, n, b in res[:15]:
            print(s, n, b[:12])
    elif cmd == "rulediag":
        # one greedy rule on every determined case: predicted seeds vs the
        # determined tuple(s)
        dk, gname, k = sys.argv[sys.argv.index("--variant") + 1].split(":")
        k = float(k)
        n_ok = 0
        for c in cases:
            sets = seed_sets_cached(c)
            if not (sets and len(sets) <= 3 and len({t[0] for t in sets}) == 1):
                continue
            g = c["g"]
            e1 = edepth1(c)
            dp = {"e1": e1, "hd": depth(c), "eT": edepth(c)}[dk]
            D = hexdist(g)
            land = sorted((i for i in range(g.n) if c["land"][i]), key=lambda i: (-round(e1[i], 5), -i))
            seeds = []
            for i in land:
                if all(D[i, s] >= {"s": dp[s], "c": dp[i], "min": min(dp[s], dp[i])}[gname] - k - 1e-9 for s in seeds):
                    seeds.append(i)
                    if len(seeds) == c["n"]:
                        break
            ok = tuple(seeds) in sets
            n_ok += ok
            f = lambda t: " ".join(f"({s % g.w},{s // g.w})" for s in t)
            if not ok:
                print(f"{c['src']} {c['name']:22s} pred {f(seeds)}  true {' | '.join(f(t) for t in sets)}")
        print("ok", n_ok)
    elif cmd == "top":
        # the deepest plots of one case under hex depth and both Euclidean depths
        for c in cases:
            if c["name"] != want:
                continue
            g = c["g"]
            hd, e1, eT = depth(c), edepth1(c), edepth(c)
            land = [i for i in range(g.n) if c["land"][i]]
            land.sort(key=lambda i: (hd[i], round(e1[i], 4), i), reverse=True)
            for i in land[:14]:
                print(f"  ({i % g.w},{i // g.w}) hd {hd[i]} e1 {e1[i]:.3f} eT {eT[i]:.3f} part {c['part'][i]}")
            break
    elif cmd == "lines":
        # is every pair of parts split by a straight line (Euclidean hex centres)?
        seen = set()
        for c in cases:
            key = (c["g"].w, c["name"])
            if key in seen:
                continue
            seen.add(key)
            ks = sorted({k for k in c["part"] if k >= 0})
            res = []
            for a in range(len(ks)):
                for b in range(a + 1, len(ks)):
                    ia = [i for i, k in enumerate(c["part"]) if k == ks[a]]
                    ib = [i for i, k in enumerate(c["part"]) if k == ks[b]]
                    ok, ang, mg = separable(centres(c, ia), centres(c, ib))
                    res.append(f"{ks[a]}|{ks[b]}:{'L' if ok else 'x'}{ang:.1f}/{mg:.2f}")
            print(f"{c['g'].w}x{c['g'].h} {c['name']:28s} " + " ".join(res))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
