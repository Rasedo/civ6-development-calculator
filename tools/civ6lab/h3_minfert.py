"""H-3: the minor regions' Fertility (minfo) against candidate readings: the
game's minor rectangles re-summed over their piece's plots (continent and
landmass as the record says) with each plot's GetPlotFertility(i, -1) cut by
its hex distance d to the major start plots: 100 % at d < Z, 75 % at Z, 50 %
at Z + 1, 25 % at Z + 2, for Z = 1..8. The map is the generator's own run of
the session with the game's continents (tools/civ6map), whose majors are
the game's.

    python tools/civ6lab/h3_minfert.py [records ...]
"""
from __future__ import annotations

import collections
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))

from h3_regcheck import DEFAULT, LEADERS, info  # noqa: E402
from h3_x import Session  # noqa: E402
from tools.civ6map import check, world as W  # noqa: E402
from tools.civ6map.generate import generate  # noqa: E402


def main() -> int:
    paths = sys.argv[1:] or [str(HERE / "runs" / p) for p in DEFAULT]
    score = collections.Counter()
    tot = 0
    for path in paths:
        s = Session(path)
        if not s.xs("minfo"):
            continue
        cfg = json.loads((ROOT / s.rec["config"]).read_text(encoding="utf-8"))
        n = int(s.xs("sdiv")[0][1].split(",")[0])
        seen = {}
        orig = W.Starts.DivideMapIntoMinorRegions

        def grab(self, k):
            lmid = self.landmass_ids()
            starts = [p for pid, p in self.w.player_start.items() if p is not None]
            for e in s.xs("minfo"):
                r = info(e)
                plots = [y * self.w.W + x for y in range(r["SouthEdge"], r["NorthEdge"] + 1)
                         for x in range(r["WestEdge"], r["EastEdge"] + 1)
                         if self.w.continent[y * self.w.W + x] == r["ContinentType"]
                         and lmid[y * self.w.W + x] == r["LandmassID"]]
                row = {}
                for z in range(1, 9):
                    t = 0
                    for p in plots:
                        b = self.w.plot_fertility(p)
                        d = min((self.w.distance(*self.w.xy(p), *self.w.xy(q)) for q in starts), default=99)
                        pct = 100 if d < z else 75 if d == z else 50 if d == z + 1 else 25 if d == z + 2 else 0
                        t += (100 - pct) * b // 100
                    row[z] = t
                seen[int(e[1])] = (r["Fertility"], row)
            orig(self, k)

        W.Starts.DivideMapIntoMinorRegions = grab
        saved = W.World.partition_continents
        check.oracle_continents(s.dump)
        try:
            opts = {k: int(v) for k, v in (s.rec.get("map_options") or {}).items() if k != "MAP_SIZE"}
            generate("Continents", cfg["size"], int(s.rec["map_seed"]), majors=LEADERS[:n],
                     n_minors=int(cfg.get("city_states", 0)), minors=[], options=opts)
        finally:
            W.Starts.DivideMapIntoMinorRegions = orig
            W.World.partition_continents = saved
        for k, (want, row) in sorted(seen.items()):
            tot += 1
            hit = [z for z, v in row.items() if v == want]
            for z in hit:
                score[z] += 1
            print(pathlib.Path(path).name[11:27], "minor", k, "game", want, "Z:", row, "exact at", hit)
    print({z: f"{v}/{tot}" for z, v in sorted(score.items())})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
