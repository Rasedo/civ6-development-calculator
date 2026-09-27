"""H-3: StartPositioner.DivideMapIntoMajorRegions as the install's DLL codes
it (GameCore_XP2_Release.dll: 0x88ef60 the native, 0x88e9f0 + 0x88e090 the
landmass entries, 0x88ec30 the major/minor filter, 0x88e4a0 the civ count,
0x88ed80 + 0x891740 the recursive split, 0x88e190 the cut, 0x88d1c0 the
final sort; read with h3_dis.py), scored on the natives sessions' sdiv /
sinfo records.

    python tools/civ6lab/h3_divdll.py [runs/h3_session_<stamp>.jsonl ...] [--show]

The rule:
  entries: one per (continent, landmass) over the plots with a continent,
    in plot-index order: plots, fertility (GetPlotFertility(i, -1) summed),
    and a box grown by ONE bound per plot (x < W: W = x; else x > E: E = x;
    else y < S: S = y; else y > N: N = y); sorted by fertility descending
    (EASTL sort: stable insertion up to 28 entries);
  majors: the entries of fertility >= the minor minimum that pass the
    landmass filter (the largest landmass only when the 4th argument is
    true) and have fertility >= the major minimum (the others are minors);
  civs: n times, the majors re-sorted by fertility // (civs + 1) descending
    (unsigned integer division, EASTL sort) and the first takes one more;
  split: an entry with c civs becomes regions by c: 0, 1 -> itself; 2 -> two
    of 1; 3 -> three of 1; 4 -> two of 2; 5, 6 -> three of 2; 7, 8 -> two
    of 4; 9 -> three of 3; 10..12 -> three of 4; 13..16 -> two of 8;
    17, 18 -> three of 6; 19, 20 -> two of 10; 21..24 -> three of 8
    (recursively); by rows when N - S >= E - W, else by columns; a two-way
    cut at 50 %, a three-way cut at 33 % then the rest at 50 %: rows (or
    columns) from the south (west) are summed (the entry's own plots in
    the row, x from W to E) while the sum is below fertility * pct // 100
    and the row is below N (E); the first part ends at the last row summed,
    the second starts after it; the parts' fertility is the sum and the
    rest; edge flags N/S (E/W) mark the cut on each side (a new part starts
    with no flags);
  order: the regions sorted by fertility descending (EASTL sort).
"""
from __future__ import annotations

import collections
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_eastl import eastl_sort  # noqa: E402
from h3_regalloc import info, landmasses  # noqa: E402
from h3_x import Session, unrle  # noqa: E402

SPLIT = {2: (1, 2), 3: (1, 3), 4: (2, 2), 5: (2, 3), 6: (2, 3), 7: (4, 2), 8: (4, 2), 9: (3, 3),
         10: (4, 3), 11: (4, 3), 12: (4, 3), 13: (8, 2), 14: (8, 2), 15: (8, 2), 16: (8, 2), 17: (6, 3),
         18: (6, 3), 19: (10, 2), 20: (10, 2), 21: (8, 3), 22: (8, 3), 23: (8, 3), 24: (8, 3)}


def entries(g, cont, lmid, fert):
    ent = {}
    order = []
    for i in range(g.n):
        if cont[i] == -1:
            continue
        key = (cont[i], lmid[i])
        x, y = i % g.w, i // g.w
        e = ent.get(key)
        if e is None:
            ent[key] = {"cont": cont[i], "lm": lmid[i], "fert": fert[i], "plots": 1,
                        "N": y, "S": y, "E": x, "W": x, "civs": 0, "flags": set()}
            order.append(key)
            continue
        e["plots"] += 1
        e["fert"] += fert[i]
        if x < e["W"]:
            e["W"] = x
        elif x > e["E"]:
            e["E"] = x
        elif y < e["S"]:
            e["S"] = y
        elif y > e["N"]:
            e["N"] = y
    out = [ent[k] for k in order]
    eastl_sort(out, lambda a, b: a["fert"] > b["fert"])
    return out


def strip_sum(g, cont, lmid, fert, e, x0, x1, y0, y1):
    y0 = max(0, y0)
    y1 = min(g.h - 1, y1)
    t = 0
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            i = y * g.w + (x % g.w)
            if cont[i] == e["cont"] and lmid[i] == e["lm"]:
                t += fert[i]
    return t


def cut(g, cont, lmid, fert, src, rows: bool, pct: int):
    dst = {"cont": src["cont"], "lm": src["lm"], "civs": 0, "flags": set(),
           "N": src["N"], "S": src["S"], "E": src["E"], "W": src["W"]}
    target = (src["fert"] * pct) // 100
    run = 0
    if rows:
        k = src["S"]
        while run < target and k < src["N"]:
            run += strip_sum(g, cont, lmid, fert, src, src["W"], src["E"], k, k)
            k += 1
        src["N"] = k - 1
        src["flags"].add("N")
        dst["S"] = k
        dst["flags"].add("S")
    else:
        k = src["W"]
        while run < target and k < src["E"]:
            run += strip_sum(g, cont, lmid, fert, src, k, k, src["S"], src["N"])
            k += 1
        src["E"] = k - 1
        src["flags"].add("E")
        dst["W"] = k
        dst["flags"].add("W")
    dst["fert"] = src["fert"] - run
    src["fert"] = run
    return dst


def split(g, cont, lmid, fert, e, out):
    c = e["civs"]
    if c <= 1:
        out.append(e)
        return
    if c not in SPLIT:
        return
    each, ways = SPLIT[c]
    rows = (e["N"] - e["S"]) >= (e["E"] - e["W"])
    if ways == 2:
        b = cut(g, cont, lmid, fert, e, rows, 50)
        e["civs"] = each
        split(g, cont, lmid, fert, e, out)
        b["civs"] = each
        split(g, cont, lmid, fert, b, out)
    else:
        a = cut(g, cont, lmid, fert, e, rows, 33)
        b = cut(g, cont, lmid, fert, a, rows, 50)
        for part in (e, a, b):
            part["civs"] = each
            split(g, cont, lmid, fert, part, out)


def divide(g, cont, lmid, fert, n, min_major, min_minor, lm_filter=-1):
    ent = entries(g, cont, lmid, fert)
    majors = [e for e in ent if e["fert"] >= min_minor and (lm_filter == -1 or e["lm"] == lm_filter)
              and e["fert"] >= min_major]
    for _ in range(n):
        if not majors:
            break
        eastl_sort(majors, lambda a, b: a["fert"] // (a["civs"] + 1) > b["fert"] // (b["civs"] + 1))
        majors[0]["civs"] += 1
    regions = []
    for e in majors:
        split(g, cont, lmid, fert, e, regions)
    eastl_sort(regions, lambda a, b: a["fert"] > b["fert"])
    return regions


def checked_fert(g, i: int, base: int, starts: list[int], zone: int = 6, in_range: bool = False) -> int:
    """GetPlotFertility(i, r, true)'s distance term (0x890800): over the
    start plots set (players' SetStartingPlot), in ascending plot index, the
    largest of 100 / 75 / 50 / 25 % at hex distance < R / R / R + 1 / R + 2;
    R = START_DISTANCE_FERTILITY_EXCLUSION_ZONE (6), and when r is out of
    range (r = -1) R is halved at EVERY start visited: 3, 1, 0, 0, ..."""
    pct, R = 0, zone
    for q in sorted(starts):
        if not in_range:
            R = int(R / 2)
        d = g.dist(i, q)
        v = 25 if d == R + 2 else 50 if d == R + 1 else 75 if d == R else 100 if d < R else 0
        pct = max(pct, v)
    return max(0, ((100 - pct) * base) // 100) if pct else base


def divide_minor(g, cont, lmid, fert, n_major, min_major, min_minor, n_minor, starts, lm_filter=-1,
                 fert_now=None, checked_now=None):
    """0x88f100: the minor list (entries of fertility >= the minor minimum
    that are not majors, then every major region with no civs), each
    re-summed over its box (x from W to E, y from S to N, its own plots) with
    GetPlotFertility(i, -1, true) = base less 100/75/50/25 % at hex distance
    < 3 / 3 / 4 / 5 from a start plot set so far (0x8912b0, 0x890800 with R
    halved); the civs by the same integer D'Hondt; the same split, cut on
    base fertility; sorted by fertility descending. fert: the fertility at the
    major division; fert_now / checked_now: GetPlotFertility(i, -1, false /
    true) at the minor division when recorded"""
    ent = entries(g, cont, lmid, fert)
    minors = [e for e in ent if e["fert"] >= min_minor and not (
        (lm_filter == -1 or e["lm"] == lm_filter) and e["fert"] >= min_major)]
    majors = divide(g, cont, lmid, fert, n_major, min_major, min_minor, lm_filter)
    for r in majors:
        m = dict(r)
        m["civs"] = 0
        m["flags"] = set(r["flags"])
        minors.append(m)

    now = fert_now or fert

    def checked(i):
        if checked_now is not None:
            return checked_now[i]
        return checked_fert(g, i, now[i], starts)

    for e in minors:
        e["fert0"] = e["fert"]
        e["fert"] = sum(checked(y * g.w + x) for y in range(e["S"], e["N"] + 1) for x in range(e["W"], e["E"] + 1)
                        if 0 <= x < g.w and cont[y * g.w + x] == e["cont"] and lmid[y * g.w + x] == e["lm"])
    for _ in range(n_minor):
        if not minors:
            break
        eastl_sort(minors, lambda a, b: a["fert"] // (a["civs"] + 1) > b["fert"] // (b["civs"] + 1))
        minors[0]["civs"] += 1
    regions = []
    for e in minors:
        split(g, cont, lmid, now, e, regions)
    eastl_sort(regions, lambda a, b: a["fert"] > b["fert"])
    return regions


def landmasses_at_divide(s: Session) -> dict:
    """landmass id (k << 16 | k - 1, k by lowest plot over every component)
    -> plots, water bodies included (a lake is its own landmass), from the areas as the map last computed them (the dlm record:
    each plot's area at the major division; the last areas record: which
    areas are water): a lake wonder's plots, turned Coast after that, stay
    land"""
    g = s.g
    last = s.xs("areas")[-1]
    water = {int(t.split(":")[0]): t.split(":")[2] == "true" for t in last[3].split(",") if t}
    ids = [v[1:] for v in unrle_str(next(e for e in s.xs("dlm") if e[1] == "major")[2])]
    land = [not water.get(int(v), False) for v in ids]
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
        out[(k << 16) | (k - 1)] = sorted(comp)
    return out


def unrle_str(s: str) -> list[str]:
    out = []
    for part in s.split(","):
        if part:
            v, _, n = part.rpartition("*")
            out += [v] * int(n)
    return out


def main() -> int:
    argv = sys.argv[1:]
    paths = [a for a in argv if a.endswith(".jsonl")] or [
        str(HERE / "runs" / pathlib.Path(p).name)
        for p in open(HERE / "runs" / "h3_natives_all.txt").read().split()]
    tot = collections.Counter()
    for path in paths:
        s = Session(path)
        sd = s.xs("sdiv")
        if not sd:
            continue
        g = s.g
        fert = [int(v) for v in s.x1("fert")[1].split(",")]
        df = {(e[1], e[2]): [int(v) for v in unrle(e[3])] for e in s.xs("dfert")}
        tot["divide_time_fert"] += bool(df)
        fert_major = df.get(("major", "false"), fert)
        lm = landmasses_at_divide(s) if s.xs("dlm") else landmasses(s)
        lmid = [-1] * g.n
        for lid, pl in lm.items():
            for i in pl:
                lmid[i] = lid
        args = sd[0][1].split(",")
        n, mn, mi = int(args[0]), int(args[1]), int(args[2])
        regs = divide(g, s.continent, lmid, fert_major, n, mn, mi)
        truth = {int(e[1]): info(e) for e in s.xs("sinfo")}
        count_ok = len(regs) == int(sd[0][2])
        tot["sessions"] += 1
        tot["count_ok"] += count_ok
        rows = []
        for k in sorted(truth):
            t = truth[k]
            r = regs[k] if k < len(regs) else None
            edges = r is not None and (r["N"], r["S"], r["E"], r["W"]) == (t["NorthEdge"], t["SouthEdge"],
                                                                            t["EastEdge"], t["WestEdge"])
            same_lm = r is not None and (r["cont"], r["lm"]) == (t["ContinentType"], t["LandmassID"])
            tot["regions"] += 1
            tot["edges_ok"] += edges
            tot["cont_lm_ok"] += same_lm
            tot["fert_within4"] += r is not None and abs(r["fert"] - t["Fertility"]) <= 4
            tot["fert_exact"] += r is not None and r["fert"] == t["Fertility"]
            rows.append((k, edges, same_lm, t, r))
        md = s.xs("mdiv")
        if md:
            nmin = int(md[0][1].split(",")[0])
            starts = [y * g.w + x for p, x, y in s.dump["starts"] if p < n]
            mregs = divide_minor(g, s.continent, lmid, fert_major, n, mn, mi, nmin, starts,
                                 fert_now=df.get(("minor", "false")), checked_now=df.get(("minor", "true")))
            mt = {int(e[1]): info(e) for e in s.xs("minfo")}
            # GetPlotFertility(i, -1, true) at the minor division against the
            # distance rule from the players' start plots then set
            ds = s.xs("dstarts")
            if ("minor", "true") in df and ds:
                st = [int(kv.split(":")[1]) for kv in next(e for e in ds if e[1] == "minor")[2].split(",")
                      if kv.split(":")[1] not in ("nil", "")]
                base = df[("minor", "false")]
                for i in range(g.n):
                    pv = checked_fert(g, i, base[i], st)
                    tot["checked_plots"] += 1
                    tot["checked_ok"] += pv == df[("minor", "true")][i]
            tot["minor_sessions"] += 1
            tot["minor_count_ok"] += len(mregs) == int(md[0][2])
            if len(mregs) != int(md[0][2]):
                print(f"   minor count: true {md[0][2]} pred {len(mregs)} ({md[0][1]}); pred civs "
                      f"{[(r['fert'], r['civs'], r['cont'], r['lm'], r.get('plots'), r.get('fert0')) for r in mregs]}")
            for k in sorted(mt):
                t = mt[k]
                r = mregs[k] if k < len(mregs) else None
                ok = r is not None and (r["N"], r["S"], r["E"], r["W"], r["cont"], r["lm"]) == (
                    t["NorthEdge"], t["SouthEdge"], t["EastEdge"], t["WestEdge"], t["ContinentType"], t["LandmassID"])
                tot["minor_regions"] += 1
                tot["minor_ok"] += ok
                tot["minor_fert_exact"] += r is not None and r["fert"] == t["Fertility"]
                if "--minor" in argv and not ok or "--minorall" in argv:
                    print(f"   minor {k}: true N{t['NorthEdge']} S{t['SouthEdge']} E{t['EastEdge']} W{t['WestEdge']} "
                          f"F{t['Fertility']} | pred " + (f"N{r['N']} S{r['S']} E{r['E']} W{r['W']} F{r['fert']}"
                                                          if r else "-"))
        bad = [x for x in rows if not (x[1] and x[2])]
        print(f"{path[-26:]} {g.w}x{g.h} n={n} starts {sd[0][2]} pred {len(regs)} "
              f"regions ok {len(rows) - len(bad)}/{len(rows)}")
        if "--show" in argv or bad:
            for k, eo, lo, t, r in rows:
                if "--show" in argv or not (eo and lo):
                    print(f"   {k}: true N{t['NorthEdge']} S{t['SouthEdge']} E{t['EastEdge']} W{t['WestEdge']} "
                          f"F{t['Fertility']} c{t['ContinentType']} lm{t['LandmassID']} | pred "
                          + (f"N{r['N']} S{r['S']} E{r['E']} W{r['W']} F{r['fert']} c{r['cont']} lm{r['lm']} "
                             f"{sorted(r['flags'])}" if r else "-"))
    print(dict(tot))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
