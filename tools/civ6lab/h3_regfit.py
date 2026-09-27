"""H-3: how DivideMapIntoMajorRegions shares the n major regions among the
landmasses: candidate apportionment rules scored on every natives session
given (landmass fertility = sum of GetPlotFertility(i, -1) over its
non-ocean plots at the end of the map; truth = the landmasses of the n
queried major regions).

    python tools/civ6lab/h3_regfit.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import math
import sys

from h3_regalloc import info, landmasses
from h3_x import Session


def apportion(vals, n, rule, elig):
    idx = [j for j in range(len(vals)) if elig[j]]
    cnt = [0] * len(vals)
    if not idx:
        return cnt
    tot = sum(vals[j] for j in idx)
    if rule.startswith("div"):
        delta = float(rule[3:])
        while sum(cnt) < n:
            cnt[max(idx, key=lambda j: vals[j] / (cnt[j] + delta) if cnt[j] + delta > 0 else math.inf)] += 1
        return cnt
    if rule in ("dhondt", "sainte", "adams", "hh"):
        if rule == "adams":
            for j in idx[:n]:
                cnt[j] = 1
        while sum(cnt) < n:
            def pri(j):
                c = cnt[j]
                if rule == "dhondt":
                    return vals[j] / (c + 1)
                if rule == "sainte":
                    return vals[j] / (2 * c + 1)
                if rule == "adams":
                    return vals[j] / c if c else math.inf
                return vals[j] / math.sqrt(c * (c + 1)) if c else math.inf
            cnt[max(idx, key=pri)] += 1
        return cnt
    quota = {j: n * vals[j] / tot for j in idx}
    for j in idx:
        cnt[j] = int(quota[j])
    while sum(cnt) < n:
        if rule == "hamilton":
            j = max(idx, key=lambda j: quota[j] - cnt[j])
        elif rule == "floor_fc":
            j = max(idx, key=lambda j: vals[j] / cnt[j] if cnt[j] else math.inf)
        else:  # floor_fc1
            j = max(idx, key=lambda j: vals[j] / (cnt[j] + 1))
        cnt[j] += 1
    return cnt


def main() -> int:
    data = []
    for path in sys.argv[1:]:
        s = Session(path)
        fert = [int(v) for v in s.x1("fert")[1].split(",")]
        lm = landmasses(s)
        n = int(s.xs("sdiv")[0][1].split(",")[0])
        R = int(s.xs("sdiv")[0][2])
        maj = collections.Counter(info(e)["LandmassID"] for e in s.xs("sinfo"))
        rsum = collections.Counter()
        for e in s.xs("sinfo"):
            rsum[info(e)["LandmassID"]] += info(e)["Fertility"]
        # a landmass holding major regions: the DLL's own fertility (the sum
        # of its regions'); the others: the plot sum
        rows = sorted(((rsum[lid] if lid in rsum else sum(fert[i] for i in pl), len(pl), maj.get(lid, 0), lid)
                       for lid, pl in lm.items()), reverse=True)
        rows = [r for r in rows if r[0] >= 150]
        data.append((path[-26:], n, R, rows))
        print(path[-26:], "n", n, "R", R, [(f, p, t) for f, p, t, _ in rows])
    res = []
    for beta in [x / 20 for x in range(0, 21)]:
        for rule in ["div%.2f" % (d / 100) for d in range(0, 101, 2)] + ["hamilton", "floor_fc", "floor_fc1"]:
            for base in ("all",):
                ok = 0
                bad = []
                for name, n, R, rows in data:
                    vals = [r[0] for r in rows]
                    avg = sum(vals) / n
                    elig = [v >= beta * avg for v in vals]
                    v2 = vals if base == "all" else vals
                    got = apportion(v2, n, rule, elig)
                    truth = [r[2] for r in rows]
                    if got == truth:
                        ok += 1
                    else:
                        bad.append(name)
                res.append((ok, f"beta {beta:.2f} {rule}", bad))
    res.sort(key=lambda r: -r[0])
    for ok, name, bad in res[:15]:
        print(ok, "/", len(data), name, bad[:6])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
