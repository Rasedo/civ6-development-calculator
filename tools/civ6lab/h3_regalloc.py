"""H-3: DivideMapIntoMajorRegions / DivideMapIntoMinorRegions: per landmass
(the LandmassID the region info carries) the regions it takes, against the
landmass's plot count and fertility (sum of GetPlotFertility(i, -1) over its
non-ocean plots, from the `fert` record), for every natives session given.

    python tools/civ6lab/h3_regalloc.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import sys

from h3_x import Session, unrle


def info(e) -> dict:
    return {k: int(v) for k, v in (kv.split("=") for kv in e[2].split(","))}


def landmasses(s: Session) -> dict:
    """landmass id (k << 16 | k - 1, k by lowest plot) -> plots: the
    non-ocean components (land, mountains, lakes together)"""
    g = s.g
    land = [s.terrain[i] < 15 for i in range(g.n)]
    seen = [False] * g.n
    out = {}
    k = 0
    for i in range(g.n):
        if seen[i]:
            continue
        comp, st = [], [i]
        seen[i] = True
        while st:
            u = st.pop()
            comp.append(u)
            for v in g.ring1(u):
                if v is not None and not seen[v] and land[v] == land[i]:
                    seen[v] = True
                    st.append(v)
        k += 1
        if land[i]:
            out[(k << 16) | (k - 1)] = sorted(comp)
    return out


def main() -> int:
    for path in sys.argv[1:]:
        s = Session(path)
        g = s.g
        fert = [int(v) for v in s.x1("fert")[1].split(",")]
        sdiv = s.xs("sdiv")
        mdiv = s.xs("mdiv")
        lm = landmasses(s)
        area = unrle(s.x1("plot", "area")[2]) if s.x1("plot", "area") else None
        maj = collections.Counter(info(e)["LandmassID"] for e in s.xs("sinfo"))
        mino = collections.Counter(info(e)["LandmassID"] for e in s.xs("minfo"))
        print(f"{path[-26:]} {g.w}x{g.h} sdiv {sdiv[0][1:] if sdiv else None} mdiv {mdiv[0][1:] if mdiv else None}")
        ids = set(maj) | set(mino)
        # the recorded LandmassID may be an area id: show both
        byarea = collections.defaultdict(list)
        if area:
            for i in range(g.n):
                byarea[area[i]].append(i)
        rows = []
        for lid in sorted(set(lm) | ids, key=lambda x: -sum(fert[i] for i in (lm.get(x) or byarea.get(x) or []))):
            pl = lm.get(lid) or byarea.get(lid) or []
            fsum = sum(fert[i] for i in pl)
            if not pl or (fsum < 60 and lid not in ids):
                continue
            rows.append((lid, len(pl), fsum, maj.get(lid, 0), mino.get(lid, 0)))
        tot = sum(r[2] for r in rows)
        # fertility with the water plots within r of the landmass
        wf = {}
        for r_ in (1, 2, 3):
            for lid, n, f, a, b in rows:
                pl = set(lm.get(lid) or [])
                ring = set(pl)
                fr = list(pl)
                for _ in range(r_):
                    nx = []
                    for u in fr:
                        for v in g.ring1(u):
                            if v is not None and v not in ring:
                                ring.add(v)
                                nx.append(v)
                    fr = nx
                wf[(lid, r_)] = sum(fert[i] for i in ring)
        for lid, n, f, a, b in rows:
            print(f"   landmass {lid:7d} plots {n:5d} fert {f:5d} +w1 {wf[(lid, 1)]:5d} +w2 {wf[(lid, 2)]:5d} "
                  f"+w3 {wf[(lid, 3)]:5d} share {f / tot:.3f} majors {a} minors {b}")
        n_maj = int(sdiv[0][1].split(",")[0]) if sdiv else 0
        truth = [a for *_, a, b in rows]
        for label, vals in (("land", [r[2] for r in rows]), ("w1", [wf[(r[0], 1)] for r in rows]),
                            ("w2", [wf[(r[0], 2)] for r in rows]), ("w3", [wf[(r[0], 3)] for r in rows])):
            for rule in ("dhondt", "sainte", "floor+c", "floor+c1"):
                got = allocate(vals, n_maj, rule)
                print(f"      {label:4s} {rule:9s} {'OK ' if got == truth else 'bad'} {got} true {truth}")
    return 0


def allocate(vals: list[int], n: int, rule: str) -> list[int]:
    elig = [v >= 150 for v in vals]
    cnt = [0] * len(vals)
    if rule in ("dhondt", "sainte"):
        for _ in range(n):
            best = max((j for j in range(len(vals)) if elig[j]),
                       key=lambda j: vals[j] / ((cnt[j] + 1) if rule == "dhondt" else (2 * cnt[j] + 1)))
            cnt[best] += 1
        return cnt
    tot = sum(v for v, e in zip(vals, elig) if e)
    for j, v in enumerate(vals):
        if elig[j]:
            cnt[j] = int(n * v / tot)
    while sum(cnt) < n:
        best = max((j for j in range(len(vals)) if elig[j]),
                   key=lambda j: vals[j] / (cnt[j] if rule == "floor+c" and cnt[j] else cnt[j] + 1))
        cnt[best] += 1
    return cnt


if __name__ == "__main__":
    raise SystemExit(main())
