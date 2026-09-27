"""H-3: candidate StampContinents models scored on the experiments (exp
records) and natives stamps: a model maps the land mask (and the map size's
continent count N = Maps.Continents) to a partition; the score is the plots
whose continent agrees under the best one-to-one matching of labels.

Models: nearest-seed (hex distance, x wrapping, ties to the earlier seed)
with seeds chosen by
  interior:R:ord  greedily in order of distance to water (descending), then
                  plot index (ord desc/asc), skipping a plot within R of a seed
  farthest:ord    farthest-point sampling from the most interior plot

    python tools/civ6lab/h3_stampmodel.py runs/h3_session_<exp>.jsonl [...]
"""
from __future__ import annotations

import collections
import itertools
import sys

import numpy as np

from h3_x import Grid, Session, unrle

NCONT = {44: 1, 60: 2, 74: 3, 84: 4, 96: 5, 106: 6}


def hexdist_all(g: Grid) -> np.ndarray:
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
    return best.astype(np.int16)


def water_distance(g: Grid, land: np.ndarray) -> np.ndarray:
    dist = np.full(g.n, -1, dtype=np.int32)
    frontier = [i for i in range(g.n) if not land[i]]
    for i in frontier:
        dist[i] = 0
    d = 0
    while frontier:
        d += 1
        nxt = []
        for u in frontier:
            for v in g.ring1(u):
                if v is not None and dist[v] == -1:
                    dist[v] = d
                    nxt.append(v)
        frontier = nxt
    return dist


def assign(D: np.ndarray, seeds: list[int], land: np.ndarray) -> np.ndarray:
    sub = D[seeds][:, :]
    lab = np.argmin(sub, axis=0)  # ties to the earlier seed
    out = np.where(land, lab, -1)
    return out


def score(pred: np.ndarray, truth: list[int]) -> tuple[int, int]:
    t = np.array(truth)
    m = t != -1
    ct = collections.Counter(zip(pred[m].tolist(), t[m].tolist()))
    pl = sorted(set(pred[m].tolist()))
    tl = sorted(set(t[m].tolist()))
    best = 0
    if len(pl) <= 7 and len(tl) <= 7:
        for perm in itertools.permutations(tl, min(len(pl), len(tl))):
            best = max(best, sum(ct[(a, b)] for a, b in zip(pl, perm)))
    return best, int(m.sum())


def seeds_interior(D, wd, land, n, R, desc_idx):
    order = sorted(np.nonzero(land)[0].tolist(), key=lambda i: (-wd[i], -i if desc_idx else i))
    seeds = []
    for i in order:
        if all(D[i, s] >= R for s in seeds):
            seeds.append(i)
            if len(seeds) == n:
                break
    return seeds


def seeds_adaptive(D, wd, land, n, k, desc_idx, by_seed=True):
    """greedy in order of distance to water (desc) then plot index; a plot is
    skipped when a chosen seed lies closer than (that seed's depth - k), or
    (by_seed False) closer than (the plot's own depth - k)"""
    order = sorted(np.nonzero(land)[0].tolist(), key=lambda i: (-wd[i], -i if desc_idx else i))
    seeds = []
    for i in order:
        if all(D[i, s] >= (wd[s] if by_seed else wd[i]) - k for s in seeds):
            seeds.append(i)
            if len(seeds) == n:
                break
    return seeds


def seeds_farthest(D, wd, land, n, desc_idx):
    cand = np.nonzero(land)[0]
    first = sorted(cand.tolist(), key=lambda i: (-wd[i], -i if desc_idx else i))[0]
    seeds = [first]
    while len(seeds) < n:
        md = D[seeds][:, cand].min(axis=0)
        mx = md.max()
        pick = [c for c, v in zip(cand.tolist(), md.tolist()) if v == mx]
        seeds.append(max(pick) if desc_idx else min(pick))
    return seeds


def cases(path):
    s = Session(path)
    if s.xs("exp"):
        w, h = map(int, s.x1("grid")[1].split(","))
        g = Grid(w, h)
        for e in s.xs("exp"):
            yield e[1], g, np.array([v == 0 for v in unrle(e[2])]), unrle(e[3])
    else:
        before = unrle(s.x1("stamp", "before")[2])
        yield "natural", s.g, np.array([v != 1 for v in before]), unrle(s.x1("stamp", "after")[2])


def main() -> int:
    tot = collections.Counter()
    exact = collections.Counter()
    for path in sys.argv[1:]:
        cache = {}
        for name, g, land, truth in cases(path):
            if g.w not in cache:
                cache[g.w] = hexdist_all(g)
            D = cache[g.w]
            n = NCONT[g.w]
            wd = water_distance(g, land)
            models = {}
            for R in (1, 2, 3, 4, 5, 6, 8, 10):
                for dsc in (True, False):
                    models[f"interior:{R}:{'desc' if dsc else 'asc'}"] = seeds_interior(D, wd, land, n, R, dsc)
            for dsc in (True, False):
                models[f"farthest:{'desc' if dsc else 'asc'}"] = seeds_farthest(D, wd, land, n, dsc)
                for k in (0, 1, 2):
                    for bs in (True, False):
                        models[f"adaptive:{k}:{'seed' if bs else 'own'}:{'desc' if dsc else 'asc'}"] = \
                            seeds_adaptive(D, wd, land, n, k, dsc, bs)
            line = []
            for mname, seeds in models.items():
                pred = assign(D, seeds, land)
                sc, m = score(pred, truth)
                tot[mname] += m
                exact[mname] += sc
                line.append((sc, mname))
            best = max(line)
            print(f"{path[-26:]} {g.w}x{g.h} {name:22s} best {best[1]} {best[0]}/{int(land.sum())}")
    for k in sorted(tot, key=lambda k: -exact[k] / tot[k])[:8]:
        print(f"{k:22s} {exact[k]}/{tot[k]} = {exact[k] / tot[k]:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
