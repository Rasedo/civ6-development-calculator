"""B-82-S3: each arm against the control — category deltas per major, and the
per-city differences (population, buildings, districts, pillaged) behind them.

    python tools/civ6lab/b82s3_fit.py tools/civ6lab/runs/b82s3_<stamp>.jsonl
"""
from __future__ import annotations

import json
import sys


def seats(rec: dict) -> dict:
    out = {}
    for r in rec["post"][0]["json"]:
        out[r["p"]] = r
    return out


def relstats(rec: dict, key: str = "post") -> dict:
    src = rec[key][-1]["json"] if key == "post" else rec[key][0]["json"]
    return {r["p"]: r for r in src if r.get("kind") == "relstats"}


def main(path: str) -> int:
    recs = [json.loads(l) for l in open(path, encoding="utf-8")]
    ctrl = [r for r in recs if r["arm"] == "control"]
    base = seats(ctrl[0])
    if len(ctrl) > 1:
        same = json.dumps(seats(ctrl[1]), sort_keys=True) == json.dumps(base, sort_keys=True)
        print("controls agree:", same)
    brel = relstats(ctrl[0])
    for r in recs:
        if r["arm"] == "control":
            continue
        print(f"== {r['arm']}  {r.get('gc', {}).get('json')}")
        s = seats(r)
        for p, row in s.items():
            b = base.get(p)
            if b is None:
                continue
            if row.get("major"):
                d = {k[9:]: row["cats"][k] - b["cats"][k] for k in row["cats"]
                     if isinstance(row["cats"][k], int) and row["cats"][k] != b["cats"][k]}
                if d:
                    print(f"  p{p} cats {d}  eraScore {b.get('eraScore')}->{row.get('eraScore')}")
            bc = {c["id"]: c for c in b["cities"]}
            for c in row["cities"]:
                o = bc.get(c["id"])
                if o is None:
                    print(f"  p{p} new city {c['name']}")
                    continue
                diff = {k: (o[k], c[k]) for k in ("pop", "nb", "nd", "maj", "cap") if o[k] != c[k]}
                if o["pil"] != c["pil"]:
                    diff["pil"] = (o["pil"], c["pil"])
                if diff:
                    print(f"  p{p} {c['name']} {diff}")
        rs = relstats(r)
        for p, x in rs.items():
            y = brel.get(p, {})
            d = {k: (y.get(k), x[k]) for k in ("foreignCities", "foreignFollowers", "citiesFollowing", "beliefs")
                 if x.get(k) != y.get(k)}
            if d:
                print(f"  p{p} relstats {d}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
