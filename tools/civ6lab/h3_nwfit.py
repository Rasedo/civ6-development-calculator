"""H-3: the shape SetFeatureType(anchor, f) lays for a multi-plot natural
wonder with no CustomPlacement, against a model: the extra plots are the
first orientation, in DirectionTypes order (NE, E, SE, SW, W, NW), whose
plots all pass the single-plot CanHaveFeature test (h3_chf.rule) with the
clauses in --skip left out: a 2-plot wonder takes the neighbour in direction
d, a 3-plot wonder the neighbours d and d+1 (a triangle), a 4-plot wonder the
neighbours d, d+1 and the plot two steps out between them (--four).

    python tools/civ6lab/h3_nwfit.py --rows R --tables T runs/h3_session_<exp>.jsonl [--skip MinDistanceNW]
"""
from __future__ import annotations

import argparse

from h3_chf import DB, Plots, load_tables, rule
from h3_nwshape import offset
from h3_x import DIRS, Session


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--rows", required=True)
    p.add_argument("--tables", required=True)
    p.add_argument("--skip", action="append", default=[])
    p.add_argument("--game-valid", action="store_true", help="use the recorded neighbour validity, not the model's")
    p.add_argument("session")
    a = p.parse_args()
    db = DB(Session(a.rows), load_tables(a.tables))
    s = Session(a.session)
    nwf = {i for i, r in db.F.items() if r.get("NaturalWonder") == "true"}
    P = Plots(s, nwf)
    g = s.g
    ok = bad = 0
    for e in s.xs("nwexp"):
        f = int(e[1])
        tiles = db.fi(f, "Tiles", 1)
        if tiles < 2:
            continue
        ax, ay = map(int, e[2].split(","))
        anc = ay * g.w + ax
        # plots of the same wonder elsewhere on the map (the real one) are not this placement's
        got = sorted(o for o in (offset(g, anc, int(part.split(":")[0])) for part in e[4].split(",") if part) if o != "far")

        def ok_plot(q):
            return q is not None and rule(db, P, f, q, skip=tuple(a.skip))[0]
        valid = [ok_plot(g.adj(anc, d)) for d in range(6)]
        if a.game_valid:
            # the game's own CanHaveFeature(q, f, true) of the six, read just before the placement
            valid = [ch == "1" for ch in e[3]]
        pred = []
        corners = []
        for d in range(6):
            dirs = [d] if tiles == 2 else [d, (d + 1) % 6]
            plots_ok = all(valid[x] for x in dirs)
            names = [DIRS[x] for x in dirs]
            if tiles == 4:
                m = g.adj(anc, d)
                c = g.adj(m, (d + 1) % 6) if m is not None else None
                corners.append("1" if ok_plot(c) else "0")
                plots_ok = plots_ok and ok_plot(c)
                names.append(DIRS[d] + "+" + DIRS[(d + 1) % 6])
            if plots_ok and not pred:
                pred = sorted(["@"] + names)
        why = [rule(db, P, f, g.adj(anc, d), skip=tuple(a.skip))[1] if g.adj(anc, d) is not None else "edge" for d in range(6)]
        hit = pred == got
        ok += hit
        bad += not hit
        print(f"{'ok ' if hit else 'BAD'} f{f} {db.F[f]['FeatureType']:26s} anchor {e[2]:7s} valid {''.join('1' if v else '0' for v in valid)} "
              f"game {e[3]}" + (f" corners {''.join(corners)}" if corners else "") +
              f" got {got} model {pred}" + ("" if hit else f"  why {why}"))
    print("placements matched", ok, "of", ok + bad)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
