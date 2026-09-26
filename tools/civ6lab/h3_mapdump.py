"""H-3: dump the running game's map (h3_mapdump.lua), and compare two dumps
plot by plot.

    python tools/civ6lab/h3_mapdump.py dump --host 127.0.0.3 --tag m1000_g2000
    python tools/civ6lab/h3_mapdump.py compare runs/h3_map_a.json runs/h3_map_b.json

A dump is runs/h3_map_<tag>.json: {"grid", "map_seed", "game_seed", "rows":
[[plot str]], "units": [...], "starts": [...]}. `compare` counts differing
plots per field (terrain, feature, resource, count, improvement, continent,
flags) and lists the unit placements that differ.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from tuner import Tuner  # noqa: E402

FIELDS = ("terrain", "feature", "resource", "count", "improvement", "continent", "flags")


def dump(host: str, tag: str) -> pathlib.Path:
    t = Tuner(host).connect()
    lines = t.run("GameCore_Tuner", (HERE / "h3_mapdump.lua").read_text(encoding="utf-8"), timeout=60)
    t.close()
    rec = {"tag": tag, "rows": {}, "units": [], "starts": []}
    for ln in lines:
        k, _, rest = ln.partition(" ")
        if k == "G":
            w, h, ms, gs = rest.split()
            rec.update(grid=[int(w), int(h)], map_seed=int(ms), game_seed=int(gs))
        elif k == "R":
            y, row = rest.split(" ", 1)
            rec["rows"][int(y)] = row.split("|")
        elif k == "U":
            p, ut, x, y = rest.split()
            rec["units"].append([int(p), ut, int(x), int(y)])
        elif k == "S":
            p, x, y = rest.split()
            rec["starts"].append([int(p), int(x), int(y)])
    rec["rows"] = [rec["rows"][y] for y in sorted(rec["rows"])]
    out = HERE / "runs" / f"h3_map_{tag}.json"
    out.write_text(json.dumps(rec), encoding="utf-8")
    return out


def compare(a: dict, b: dict) -> dict:
    diff = {f: 0 for f in FIELDS}
    plots = 0
    first = []
    for y, (ra, rb) in enumerate(zip(a["rows"], b["rows"])):
        for x, (pa, pb) in enumerate(zip(ra, rb)):
            plots += 1
            if pa != pb:
                for f, va, vb in zip(FIELDS, pa.split("."), pb.split(".")):
                    if va != vb:
                        diff[f] += 1
                if len(first) < 10:
                    first.append([x, y, pa, pb])
    ua = sorted(map(tuple, a["units"]))
    ub = sorted(map(tuple, b["units"]))
    return {"plots": plots, "differ_by_field": diff, "first_diffs": first,
            "units_equal": ua == ub, "units_a_only": [u for u in ua if u not in ub],
            "units_b_only": [u for u in ub if u not in ua],
            "starts_equal": sorted(map(tuple, a["starts"])) == sorted(map(tuple, b["starts"]))}


def main() -> int:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("dump")
    q.add_argument("--host", default="127.0.0.3")
    q.add_argument("--tag", required=True)
    q = sub.add_parser("compare")
    q.add_argument("a")
    q.add_argument("b")
    a = p.parse_args()
    if a.cmd == "dump":
        out = dump(a.host, a.tag)
        rec = json.loads(out.read_text(encoding="utf-8"))
        print(f"-> {out} grid {rec.get('grid')} seeds {rec.get('map_seed')}/{rec.get('game_seed')} "
              f"units {len(rec['units'])} starts {len(rec['starts'])}")
    else:
        ra = json.loads(pathlib.Path(a.a).read_text(encoding="utf-8"))
        rb = json.loads(pathlib.Path(a.b).read_text(encoding="utf-8"))
        print(json.dumps(compare(ra, rb), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
