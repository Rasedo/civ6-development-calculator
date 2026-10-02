"""H-3: tools/civ6map's CanHaveResource and CanHaveFeature against the game's
on the finished map of a natives-probe session (its chr / chf records): our
generator runs the same script and seed, its resources and start plots are
replaced by the game's dump, and every (plot, resource) is scored.

    python tools/civ6lab/h3_chrcmp.py runs/h3_session_<stamp>.jsonl --script Small_Continents [--show 6]
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
from h3_x import unhex  # noqa: E402
from tools.civ6map.check import session_setup  # noqa: E402
from tools.civ6map.generate import generate  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("session")
    p.add_argument("--line", type=int, default=0)
    p.add_argument("--script", required=True)
    p.add_argument("--show", type=int, default=6)
    a = p.parse_args()
    rec = [json.loads(ln) for ln in pathlib.Path(a.session).read_text(encoding="utf-8").splitlines() if ln][a.line]
    majors, minors = roster_args(rec)
    size, n_minors, options = session_setup(rec)
    w, _ = generate(a.script, size, int(rec["map_seed"]), majors=majors, n_minors=n_minors, minors=minors,
                    options=options)
    gd = json.loads(pathlib.Path(rec["map_dump"]).read_text(encoding="utf-8"))
    cells = [c.split(".") for row in gd["rows"] for c in row]
    mism = collections.Counter(k for k, (o, g) in enumerate(zip(
        [(w.terrain[i], w.feature[i]) for i in range(w.N)], [(int(c[0]), int(c[1])) for c in cells])) if o != g)
    print("plots whose terrain or feature differ:", len(mism))
    w.resource = [int(c[2]) for c in cells]
    w.starting = [bool(int(c[6]) & 64) for c in cells]
    bad, shown = collections.Counter(), 0
    for e in rec["probe"]["x"]:
        if not e.startswith("chr|"):
            continue
        _, r, bits = e.split("|")[:3]
        r = int(r)
        got = unhex(bits, w.N)
        for i in range(w.N):
            ours = w.can_have_resource(i, r)
            if ours != got[i]:
                bad[r] += 1
                if shown < a.show:
                    shown += 1
                    x, y = i % w.W, i // w.W
                    print(f"  res {r} plot {i} ({x},{y}) t{w.terrain[i]} f{w.feature[i]} game={got[i]} ours={ours} "
                          f"river={w.is_river(i)} lake={w.is_lake(i)} cont={w.continent[i]}")
    print("CanHaveResource: resources wrong", dict(bad) or "none")
    ybad, shown = collections.Counter(), 0
    for e in rec["probe"]["x"]:
        if not e.startswith("plot|yield"):
            continue
        _, name, vals = e.split("|")
        y = int(name[5:])
        for i, g in enumerate(vals.split(",")):
            ours = w.plot_yield(i, y)
            if str(ours) != g:
                ybad[y] += 1
                if shown < a.show:
                    shown += 1
                    print(f"  yield {y} plot {i} ({i % w.W},{i // w.W}) t{w.terrain[i]} f{w.feature[i]} "
                          f"r{w.resource[i]} game={g} ours={ours}")
    print("GetYield: plots wrong per yield", dict(ybad) or "none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
