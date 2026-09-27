"""H-3: the start picker's GetPlotFertility(i, region, true) calls (gpf
records of the natives probe) against GetPlotFertility(i, -1) (`fert`):
the difference per call tabulated by the hex distance to the start plots
already chosen (the regions marked used before, whose best plot the Lua
picked) and to the region's edges.

    python tools/civ6lab/h3_gpf.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import collections
import sys

from h3_x import Session


def main() -> int:
    for path in sys.argv[1:]:
        s = Session(path)
        g = s.g
        fert = [int(v) for v in s.x1("fert")[1].split(",")]
        starts = {p: y * g.w + x for p, x, y in s.dump["starts"]}
        blocks = []
        for e in s.x:
            parts = e.split("|")
            if parts[0] == "gpf":
                items = [tuple(int(v) for v in it.split(":")) for it in parts[3].split(",") if it]
                blocks.append(("gpf", int(parts[1]), parts[2], items))
            elif parts[0] == "mark":
                blocks.append(("mark", int(parts[1])))
        print(path[-26:], "starts", starts)
        for e in s.xs("fertw"):
            fw = [int(v) for v in e[3].split(",")]
            pv = collections.defaultdict(collections.Counter)
            for i in range(g.n):
                pv[fert[i]][fw[i] - fert[i]] += 1
            print(f"  end fertw major {e[1]} check {e[2]}: f -> (v - f):",
                  {f: dict(c) for f, c in sorted(pv.items()) if f <= 16})
            if e[2] == "true" and "--end" in sys.argv:
                sp = list(starts.values())
                tab = collections.defaultdict(collections.Counter)
                for i in range(g.n):
                    if fert[i] <= 0:
                        continue
                    ds = sorted(g.dist(i, j) for j in sp)
                    tab[(ds[0], ds[1] if len(ds) > 1 else 99)][round(fw[i] / fert[i], 2)] += 1
                for k in sorted(tab):
                    print("     nearest start dists", k, "v/f:", dict(sorted(tab[k].items())))
        for b in blocks:
            if b[0] == "mark":
                print("  mark", b[1])
                continue
            _, reg, chk, items = b
            diff = collections.Counter(v - fert[i] for i, v in items)
            best = max(items, key=lambda t: t[1])
            print(f"  gpf region {reg} check {chk} n {len(items)} best ({best[0] % g.w},{best[0] // g.w}) {best[1]} "
                  f"diff {dict(sorted(diff.items()))}")
            if "--pairs" in sys.argv:
                pv = collections.defaultdict(collections.Counter)
                for i, v in items:
                    pv[fert[i]][v] += 1
                print("      f -> v:", {f: dict(c) for f, c in sorted(pv.items())})
            if "--why" in sys.argv:
                from h3_chf import Plots
                P = Plots(s)
                tab = collections.defaultdict(collections.Counter)
                for i, v in items:
                    if fert[i] == 0:
                        continue
                    ring = [q for q in g.ring1(i) if q is not None]
                    key = (f"river {P.river[i]}", f"fresh {P.fresh[i] and not P.river[i]}",
                           f"mtn {sum(s.terrain[q] < 15 and s.terrain[q] % 3 == 2 for q in ring)}",
                           f"coast {P.coastal[i]}", f"t {s.terrain[i]}")
                    tab[key][v - fert[i]] += 1
                for k in sorted(tab):
                    print("     ", k, dict(tab[k]))
            if "--rows" in sys.argv:
                for i, v in items[:40]:
                    ds = {p: g.dist(i, j) for p, j in starts.items()}
                    print(f"     ({i % g.w},{i // g.w}) v {v} f {fert[i]} dist {ds}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
