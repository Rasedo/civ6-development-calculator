"""H-3: tools/civ6map's StartPositioner against the natives probe's region
records: the generator runs each recorded map (the game's continents copied
in unless --own-continents, so the map is the game's through the resources)
and at DivideMapIntoMajorRegions / DivideMapIntoMinorRegions its regions
are compared with the game's (sdiv / sinfo / splots, mdiv / minfo / mplots):
the start count, and per region the rectangle, landmass, fertility,
TotalPlots, continent and the plot list (as a set and in order).

    python tools/civ6lab/h3_regcheck.py [--own-continents] [--minor] [records ...]
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))

from h3_x import Session  # noqa: E402
from tools.civ6map import check, world as W  # noqa: E402
from tools.civ6map.generate import generate  # noqa: E402

LEADERS = ["LEADER_ROBERT_THE_BRUCE", "LEADER_HOJO", "LEADER_PHILIP_II", "LEADER_JADWIGA", "LEADER_JAYAVARMAN",
           "LEADER_GORGO", "LEADER_HAMMURABI", "LEADER_CLEOPATRA", "LEADER_SIMON_BOLIVAR", "LEADER_LADY_SIX_SKY",
           "LEADER_MENELIK", "LEADER_KRISTINA"]
DEFAULT = ["h3_session_20260927T015420Z.jsonl", "h3_session_20260927T114117Z.jsonl",
           "h3_session_20260927T114551Z.jsonl", "h3_session_20260927T114633Z.jsonl"]


def info(e) -> dict:
    return {k: int(v) for k, v in (kv.split("=") for kv in e[2].split(","))}


def plots_of(e) -> list[int]:
    return [int(v) for v in e[2].strip("[]").split(",") if v]


def ours_info(st, r) -> dict:
    total = sum(1 for p in range(st.w.N) if st.in_rect(p, r))
    return {"ContinentType": r.continent, "EastEdge": r.east, "Fertility": r.fertility, "LandmassID": r.landmass,
            "NorthEdge": r.north, "SouthEdge": r.south, "TotalPlots": total, "WestEdge": r.west}


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    paths = args or [str(HERE / "runs" / p) for p in DEFAULT] + [
        str(HERE / "runs" / pathlib.PurePosixPath(p).name)
        for p in (HERE / "runs" / "h3_natives_all.txt").read_text(encoding="utf-8").split()]
    seen = set()
    tally = {"majors": [0, 0], "count": [0, 0], "minors": [0, 0], "mcount": [0, 0]}
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        s = Session(path)
        if not s.xs("sdiv"):
            continue
        rec = s.rec
        cfg = json.loads((ROOT / rec["config"]).read_text(encoding="utf-8"))
        n = int(s.xs("sdiv")[0][1].split(",")[0])
        got = {}
        orig_major, orig_minor = W.Starts.DivideMapIntoMajorRegions, W.Starts.DivideMapIntoMinorRegions

        def major(self, *a):
            orig_major(self, *a)
            got["major"] = [ours_info(self, r) for r in self.major]
            got["mplots"] = [list(r.plots) for r in self.major]
            got["nmajor"] = self.GetNumMajorCivStarts()

        def minor(self, *a):
            orig_minor(self, *a)
            got["minor"] = [ours_info(self, r) for r in self.minor]
            got["nplots"] = [list(r.plots) for r in self.minor]
            got["nminor"] = self.GetNumMinorCivStarts()

        W.Starts.DivideMapIntoMajorRegions, W.Starts.DivideMapIntoMinorRegions = major, minor
        saved = W.World.partition_continents
        if "--own-continents" not in sys.argv:
            check.oracle_continents(s.dump)
        try:
            opts = {k: int(v) for k, v in (rec.get("map_options") or {}).items() if k != "MAP_SIZE"}
            generate("Continents", cfg["size"], int(rec["map_seed"]), majors=LEADERS[:n],
                     n_minors=int(cfg.get("city_states", 0)), minors=[], options=opts)
        finally:
            W.Starts.DivideMapIntoMajorRegions, W.Starts.DivideMapIntoMinorRegions = orig_major, orig_minor
            W.World.partition_continents = saved
        name = pathlib.Path(path).name[11:27]
        want_n = int(s.xs("sdiv")[0][2])
        print(f"{name} {cfg['size'][8:]:9s} majors {n}: starts ours {got.get('nmajor')} game {want_n}")
        tally["count"][0] += got.get("nmajor") == want_n
        tally["count"][1] += 1
        for tag, ptag, key, pkey in (("sinfo", "splots", "major", "mplots"), ("minfo", "mplots", "minor", "nplots")):
            if tag == "minfo" and "--minor" not in sys.argv:
                continue
            if tag == "minfo":
                want_m = int(s.xs("mdiv")[0][2])
                print(f"   minor starts ours {got.get('nminor')} game {want_m}")
                tally["mcount"][0] += got.get("nminor") == want_m
                tally["mcount"][1] += 1
            gp = {int(e[1]): plots_of(e) for e in s.xs(ptag)}
            for e in sorted(s.xs(tag), key=lambda e: int(e[1])):
                k = int(e[1])
                g = info(e)
                o = got.get(key, [])[k] if k < len(got.get(key, [])) else None
                op = got.get(pkey, [])[k] if o else []
                bad = [f for f in g if o is None or o[f] != g[f]]
                same_set = set(op) == set(gp.get(k, []))
                same_order = op == gp.get(k, [])
                ok = not bad and same_set
                tally["majors" if tag == "sinfo" else "minors"][0] += ok
                tally["majors" if tag == "sinfo" else "minors"][1] += 1
                print(f"   {tag} {k}: {'OK ' if ok else 'BAD'} game {g}")
                if bad or not same_set:
                    print(f"            ours {o}  plots set {same_set} order {same_order}")
                elif not same_order:
                    print("            plot order differs")
    print({k: f"{a}/{b}" for k, (a, b) in tally.items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
