"""H-3: StartPositioner's region division against the natives probe's
records (sdiv / splots / sinfo for majors, mdiv / mplots / minfo for
minors): each region's rectangle, landmass, plot count and fertility,
recomputed from the map and GetPlotFertility(i, -1) (`fert`).

    python tools/civ6lab/h3_regions.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import sys

from h3_chf import Plots
from h3_x import Session, unrle


def info(e) -> dict:
    return {k: int(v) for k, v in (kv.split("=") for kv in e[2].split(","))}


def in_rect(g, i, r) -> bool:
    x, y = i % g.w, i // g.w
    if r["WestEdge"] <= r["EastEdge"]:
        okx = r["WestEdge"] <= x <= r["EastEdge"]
    else:
        okx = x >= r["WestEdge"] or x <= r["EastEdge"]
    return okx and r["SouthEdge"] <= y <= r["NorthEdge"]


def main() -> int:
    for path in sys.argv[1:]:
        s = Session(path)
        P = Plots(s)
        g = s.g
        fert = [int(v) for v in s.x1("fert")[1].split(",")]
        area = unrle(s.x1("plot", "area")[2]) if s.x1("plot", "area") else None
        print(path[-26:], "sdiv", s.xs("sdiv"), "mdiv", s.xs("mdiv"))
        for tag, ptag in (("sinfo", "splots"), ("minfo", "mplots")):
            plots = {int(e[1]): [int(v) for v in e[2].strip("[]").split(",") if v] for e in s.xs(ptag)}
            for e in s.xs(tag):
                r = info(e)
                k = int(e[1])
                rect = [i for i in range(g.n) if in_rect(g, i, r)]
                same = [i for i in rect if area is not None and area[i] == r["LandmassID"]]
                land = [i for i in rect if not P.water[i]]
                pl = plots.get(k, [])
                if tag == "sinfo":
                    # a pair of regions sharing a landmass and x range: the
                    # cut row against the running fertility from the south
                    for e2 in s.xs(tag):
                        r2 = info(e2)
                        k2 = int(e2[1])
                        if k2 > k and r2["LandmassID"] == r["LandmassID"] and r2["WestEdge"] == r["WestEdge"]:
                            both = plots.get(k, []) + plots.get(k2, [])
                            tot = sum(fert[i] for i in both)
                            lo = min(r["SouthEdge"], r2["SouthEdge"])
                            hi = max(r["NorthEdge"], r2["NorthEdge"])
                            run, cut = 0, None
                            for y in range(lo, hi + 1):
                                run += sum(fert[i] for i in both if i // g.w == y)
                                if cut is None and 2 * run >= tot:
                                    cut = (y, run)
                            print(f"  pair {k},{k2}: total {tot} first row with 2*running >= total: {cut}; "
                                  f"recorded cut after row {min(r['NorthEdge'], r2['NorthEdge'])}")
                print(f"  {tag} {k}: {r}")
                print(f"     rect {len(rect)} land {len(land)} landmass {len(same)} | fert(landmass) "
                      f"{sum(fert[i] for i in same)} fert(land) {sum(fert[i] for i in land)} "
                      f"fert(rect) {sum(fert[i] for i in rect)} | start plots {len(pl)} fert {sum(fert[i] for i in pl)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
