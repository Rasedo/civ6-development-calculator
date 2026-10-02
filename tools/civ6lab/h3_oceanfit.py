"""H-3: StartPositioner's ocean starts against candidate rules, on a natives-
probe session with an OceanStart leader (Kupe): the game's
GetTotalOceanStartCandidates count (ocand) and the tile PlaceOceanStartCivs
gave (otile), against plot sets read off the generated map as it stood
when AssignStartingPlots ran (our generator, the same script, seed and
roster: every plot equal to the game's).

    python tools/civ6lab/h3_oceanfit.py runs/h3_session_<stamp>.jsonl
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))
from h3_roster import args as roster_args  # noqa: E402
from h3_rostercheck import SCRIPTS  # noqa: E402
from tools.civ6map import world as Wm  # noqa: E402
from tools.civ6map.check import session_setup  # noqa: E402
from tools.civ6map.generate import generate  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("session")
    a = p.parse_args()
    rec = json.loads(pathlib.Path(a.session).read_text(encoding="utf-8").splitlines()[0])
    xs = rec["probe"]["x"]
    ocand = [e for e in xs if e.startswith("ocand|")]
    oplace = [e for e in xs if e.startswith("oplace|")]
    otile = [e for e in xs if e.startswith("otile|")]
    print(ocand, oplace, otile)
    snap = {}
    orig = Wm.Starts.GetTotalOceanStartCandidates

    def hooked(self, water_map=None):
        w = self.w
        snap["terrain"], snap["feature"], snap["resource"] = list(w.terrain), list(w.feature), list(w.resource)
        snap["w"] = w
        return orig(self, water_map)
    Wm.Starts.GetTotalOceanStartCandidates = hooked
    cfg = json.loads((ROOT / rec["config"]).read_text(encoding="utf-8"))
    script = SCRIPTS.get(cfg.get("map", "").removeprefix("civ6lab_mapprobe_natives_").removesuffix(".lua"),
                         "Continents")
    majors, minors = roster_args(rec)
    size, n_minors, options = session_setup(rec)
    generate(script, size, int(rec["map_seed"]), majors=majors, n_minors=n_minors, minors=minors, options=options)
    w = snap["w"]
    w.terrain, w.feature, w.resource = snap["terrain"], snap["feature"], snap["resource"]
    coast, ocean = w.tix["TERRAIN_COAST"], w.tix["TERRAIN_OCEAN"]
    land = [not w.is_water(i) for i in range(w.N)]
    # hex distance to the nearest land plot
    dist = [0 if land[i] else 99 for i in range(w.N)]
    frontier = [i for i in range(w.N) if land[i]]
    d = 0
    while frontier:
        d += 1
        nxt = []
        for i in frontier:
            for n in w.neighbours(i):
                if dist[n] > d:
                    dist[n] = d
                    nxt.append(n)
        frontier = nxt
    tile = int(otile[0].split("|")[2]) if otile else None
    want = int(ocand[0].split("|")[2]) if ocand else None
    starts = [int(s) for s in oplace[0].split("|")[1].split("[")[1].rstrip("]").split(",")] if oplace else []
    print("ocean tile", tile, w.xy(tile) if tile is not None else None, "terrain", w.terrain[tile], "feature",
          w.feature[tile], "resource", w.resource[tile], "land distance", dist[tile], "lake", w.is_lake(tile),
          "area size", w.area_size(tile))
    print("to the land starts:", [w.distance(*w.xy(tile), *w.xy(s)) for s in starts])
    by = collections.Counter((w.terrain[i], dist[i], w.feature[i] >= 0, w.is_lake(i)) for i in range(w.N) if not land[i])
    print("water plots by (terrain, land distance, feature, lake):", sorted(by.items()))
    print("candidates wanted:", want)
    sets = {
        "ocean terrain": [i for i in range(w.N) if w.terrain[i] == ocean],
        "ocean terrain, no feature": [i for i in range(w.N) if w.terrain[i] == ocean and w.feature[i] < 0],
        "coast terrain": [i for i in range(w.N) if w.terrain[i] == coast],
        "coast, no feature": [i for i in range(w.N) if w.terrain[i] == coast and w.feature[i] < 0],
        "coast, no feature, no resource": [i for i in range(w.N) if w.terrain[i] == coast and w.feature[i] < 0
                                           and w.resource[i] < 0],
        "water dist 2": [i for i in range(w.N) if not land[i] and dist[i] == 2],
        "water dist 2, not lake": [i for i in range(w.N) if not land[i] and dist[i] == 2 and not w.is_lake(i)],
        "water dist 2, no feature": [i for i in range(w.N) if not land[i] and dist[i] == 2 and w.feature[i] < 0],
        "water dist 2, no feature, no res": [i for i in range(w.N) if not land[i] and dist[i] == 2
                                             and w.feature[i] < 0 and w.resource[i] < 0],
        "water dist 3": [i for i in range(w.N) if not land[i] and dist[i] == 3],
        "water dist >= 2": [i for i in range(w.N) if not land[i] and dist[i] >= 2],
        "water dist 2..3": [i for i in range(w.N) if not land[i] and 2 <= dist[i] <= 3],
    }
    for name, s in sets.items():
        print(f"  {name:36s} {len(s):5d} {'MATCH' if len(s) == want else ''} tile in: {tile in s}")
    # a brute sweep: terrain, feature filter, land distance band, rows kept off each pole
    ice = w.fix["FEATURE_ICE"]
    feats = {"any": lambda i: True, "none": lambda i: w.feature[i] < 0, "no ice": lambda i: w.feature[i] != ice}
    terrs = {"ocean": lambda i: w.terrain[i] == ocean, "coast": lambda i: w.terrain[i] == coast,
             "water": lambda i: not land[i] and not w.is_lake(i)}
    hits = []
    for tn, tf in terrs.items():
        for fn, ff in feats.items():
            for lo in range(1, 9):
                for hi in range(lo, 12):
                    for pole in range(0, 8):
                        s = [i for i in range(w.N) if tf(i) and ff(i) and lo <= dist[i] <= hi
                             and pole <= i // w.W < w.H - pole]
                        if len(s) == want:
                            hits.append((tn, fn, lo, hi, pole, tile in s))
    print("rules giving the count (terrain, feature, dist lo, hi, pole rows, tile in):")
    for h in hits:
        print("  ", h)
    # the DLL's count (0x890940): plots in index order, a run of Ocean
    # plots with no feature; a plot counts once the run passes 2R
    for r in range(1, 8):
        run, cands = 0, []
        for i in range(w.N):
            if w.terrain[i] == ocean and w.feature[i] < 0:
                run += 1
                if run > 2 * r:
                    cands.append(i)
            else:
                run = 0
        print(f"  run rule R={r}: {len(cands)} {'MATCH' if len(cands) == want else ''} tile in: {tile in cands}"
              f"{' tile is a run centre' if tile is not None and tile + r in cands else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
