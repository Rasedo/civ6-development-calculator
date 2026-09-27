"""H-3: StartPositioner.GetPlotFertility(i, region, bCheckOthers) as the
install's DLL codes it (GameCore_XP2_Release.dll 0x890110, with 0x890be0,
0x890490, 0x890800; read with h3_dis.py), scored on the start picker's
logged calls (gpf records: index:checked:base:unchecked).

    python tools/civ6lab/h3_gpfdll.py [runs/h3_session_<stamp>.jsonl ...] [--rows]

The rule, for a region r in range (0 <= r <= the region count):
  zero: 0 when the region carries a cut flag (h3_divdll: the side a cut made,
    a part made by a cut starting with none) and the
    plot's ROW y is within D = START_DISTANCE_MAJOR_CIVILIZATION // 3 (4) of
    that edge value: a shared north edge N: y + D > N; south S: y - D < S;
    and, comparing the row with the column edges as the DLL does, a shared
    east edge E: y + D > E; west W: y - D < W;
  pct (bCheckOthers only) = centre + distance:
    centre: cx = trunc((E + W) / 2), cy = trunc((N + S) / 2); 100 when
      cx == E or cy == N; else |trunc(10 (x - cx) / (E - cx))|
      + |trunc(10 (y - cy) / (N - cy))|;
    distance: over the players' start plots set so far (none during the
      major picker: SetStartingPlot comes after it), h3_divdll.checked_fert;
  value = max(0, trunc((100 - pct) * base / 100)) (base = GetPlotFertility(i, -1)).
"""
from __future__ import annotations

import collections
import glob
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_x import Session  # noqa: E402

D_ZERO = 12 // 3
R_EXCL = 6


def trunc_div(a: int, b: int) -> int:
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


def regions(s: Session) -> dict:
    info = {}
    for e in s.x:
        p = e.split("|")
        if p[0] == "sinfo":
            kv = dict(x.split("=") for x in p[2].split(","))
            info[int(p[1])] = {k: int(v) for k, v in kv.items()}
    # shared edges: another region of the same landmass beside it
    for r, a in info.items():
        a["flags"] = set()
        for q, b in info.items():
            if q == r or b["LandmassID"] != a["LandmassID"]:
                continue
            ov_y = not (b["NorthEdge"] < a["SouthEdge"] or b["SouthEdge"] > a["NorthEdge"])
            ov_x = not (b["EastEdge"] < a["WestEdge"] or b["WestEdge"] > a["EastEdge"])
            if ov_y and b["WestEdge"] == a["EastEdge"] + 1:
                a["flags"].add("E")
            if ov_y and b["EastEdge"] == a["WestEdge"] - 1:
                a["flags"].add("W")
            if ov_x and b["SouthEdge"] == a["NorthEdge"] + 1:
                a["flags"].add("N")
            if ov_x and b["NorthEdge"] == a["SouthEdge"] - 1:
                a["flags"].add("S")
    return info


def predict(g, i: int, base: int, reg: dict, check: bool, starts: list[int]) -> int:
    x, y = i % g.w, i // g.w
    N, S, E, W = reg["NorthEdge"], reg["SouthEdge"], reg["EastEdge"], reg["WestEdge"]
    f = reg["flags"]
    if ("N" in f and y + D_ZERO > N) or ("S" in f and y - D_ZERO < S) or \
            ("E" in f and y + D_ZERO > E) or ("W" in f and y - D_ZERO < W):
        return 0
    if not check:
        return base
    cx, cy = trunc_div(E + W, 2), trunc_div(N + S, 2)
    if cy == N or cx == E:
        pct = 100
    else:
        pct = abs(trunc_div(10 * (x - cx), E - cx)) + abs(trunc_div(10 * (y - cy), N - cy))
    dp = 0
    for p in starts:
        d = g.dist(i, p)
        v = 100 if d < R_EXCL else 75 if d == R_EXCL else 50 if d == R_EXCL + 1 else 25 if d == R_EXCL + 2 else 0
        dp = max(dp, v)
    pct += dp
    if pct <= 0:
        return max(0, base)
    return max(0, trunc_div((100 - pct) * base, 100))


def dll_regions(s: Session) -> dict | None:
    """the major regions as h3_divdll computes them from the divide-time
    record (edges and cut flags), keyed by region index"""
    import h3_divdll as dv
    df = {(e[1], e[2]): [int(v) for v in dv.unrle(e[3])] for e in s.xs("dfert")}
    if ("major", "false") not in df or not s.xs("dlm"):
        return None
    g = s.g
    lmid = [-1] * g.n
    for lid, pl in dv.landmasses_at_divide(s).items():
        for i in pl:
            lmid[i] = lid
    a = s.xs("sdiv")[0][1].split(",")
    regs = dv.divide(g, s.continent, lmid, df[("major", "false")], int(a[0]), int(a[1]), int(a[2]))
    return {k: {"NorthEdge": r["N"], "SouthEdge": r["S"], "EastEdge": r["E"], "WestEdge": r["W"],
                "flags": set(r["flags"])} for k, r in enumerate(regs)}


def main() -> int:
    argv = sys.argv[1:]
    paths = [a for a in argv if a.endswith(".jsonl")] or [
        str(HERE / "runs" / f"h3_session_20260927T{t}.jsonl") for t in ("114117Z", "114551Z", "114633Z")]
    tot = collections.Counter()
    for path in paths:
        s = Session(path)
        g = s.g
        info = dll_regions(s) or regions(s)
        picks = []
        for e in s.x:
            p = e.split("|")
            if p[0] == "pick":
                if p[3] not in ("nil", ""):
                    picks.append(int(p[3]))
                continue
            if p[0] != "gpf":
                continue
            r = int(p[1])
            check = p[2] == "true"
            reg = info[r]
            for it in p[3].split(","):
                i, v, b, nc = (int(x) for x in it.split(":"))
                pv = predict(g, i, b, reg, check, [])
                pn = predict(g, i, b, reg, False, [])
                tot["calls"] += 1
                tot["checked_ok"] += pv == v
                tot["unchecked_ok"] += pn == nc
                if (pv != v or pn != nc) and "--rows" in argv:
                    print(f"  {path[-12:-6]} reg {r} {sorted(reg['flags'])} ({i % g.w},{i // g.w}) base {b} "
                          f"checked {v} pred {pv} unchecked {nc} pred {pn} picks {[(q % g.w, q // g.w) for q in picks]}")
        print(path[-26:], {k: v for k, v in tot.items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
