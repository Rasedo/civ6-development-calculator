"""H-3: ResourceBuilder.CanHaveResource(plot, r) against a row model
(Resources and Resource_ValidTerrains / Resource_ValidFeatures), scored plot
by plot on the finished maps of natives-probe sessions (chr records).

    python tools/civ6lab/h3_chr.py --rows R --tables T sessions... [--resource RESOURCE_X --show 8]
"""
from __future__ import annotations

import argparse
import collections

from h3_chf import DB, Plots, load_tables
from h3_x import Session, unhex


def rrule(db: DB, P: Plots, r: int, i: int) -> tuple[bool, str]:
    s, g = P.s, P.s.g
    row = db.R[r]
    name = row["ResourceType"]
    t, f = s.terrain[i], s.feature[i]
    vt = db.res_terrains.get(name, set())
    vf = db.res_features.get(name, set())
    if s.resource[i] != -1:
        return False, "has resource"
    if i in P.starts:
        return False, "a start plot"
    if f != -1:
        if f not in vf:
            return False, "feature"
    elif t not in vt:
        return False, "terrain"
    if f != -1 and vt and t not in vt and not _feature_overrides(db, f):
        return False, "terrain under feature"
    if row.get("NoRiver") == "true" and P.river[i]:
        return False, "NoRiver"
    if row.get("RequiresRiver") == "true" and not P.river[i]:
        return False, "RequiresRiver"
    if row.get("LakeEligible") == "false" and P.lake[i]:
        return False, "LakeEligible"
    if row.get("AdjacentToLand") == "true" and not any(q is not None and not P.water[q] for q in g.ring1(i)):
        return False, "AdjacentToLand"
    return True, "ok"


def _feature_overrides(db: DB, f: int) -> bool:
    return True


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--rows", required=True)
    p.add_argument("--tables", required=True)
    p.add_argument("--resource", default="")
    p.add_argument("--show", type=int, default=0)
    p.add_argument("sessions", nargs="+")
    a = p.parse_args()
    db = DB(Session(a.rows), load_tables(a.tables))
    tot = collections.Counter()
    bad = collections.Counter()
    for path in a.sessions:
        s = Session(path)
        P = Plots(s)
        P.starts = {y * s.g.w + x for _, x, y in s.dump["starts"]}
        for e in s.xs("chr"):
            r = int(e[1])
            name = db.R[r]["ResourceType"]
            if a.resource and a.resource not in name:
                continue
            got = unhex(e[2], s.g.n)
            shown = 0
            for i in range(s.g.n):
                pred, why = rrule(db, P, r, i)
                tot[name] += 1
                if pred != got[i]:
                    bad[name] += 1
                    if shown < a.show:
                        shown += 1
                        print(f"  {path[-24:]} {name} plot {s.g.xy(i)} t{s.terrain[i]} f{s.feature[i]} r{s.resource[i]} "
                              f"game={got[i]} model={pred} ({why}) water={P.water[i]} lake={P.lake[i]} river={P.river[i]}")
    for k in sorted(tot):
        if bad[k]:
            print(f"{k:28s} wrong {bad[k]} of {tot[k]}")
    print("resources exact:", len([k for k in tot if not bad[k]]), "of", len(tot))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
