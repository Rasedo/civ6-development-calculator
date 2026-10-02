"""H-3: GenerateFloodplains, ours against the game's flood record (the
natives probe's `flood|<i:before>after,...>`), river by river: each river's
plot list (setter order, tools/civ6map world.river_plots) with the plots the
game flooded marked G, ours O, both B.

    python tools/civ6lab/h3_floodcmp.py runs/h3_session_<stamp>.jsonl --script Tilted_Axis
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))
from h3_roster import args as roster_args  # noqa: E402
from tools.civ6map import world as W  # noqa: E402
from tools.civ6map.check import session_setup  # noqa: E402
from tools.civ6map.generate import generate  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("session")
    p.add_argument("--line", type=int, default=0)
    p.add_argument("--script", required=True)
    a = p.parse_args()
    rec = [json.loads(ln) for ln in pathlib.Path(a.session).read_text(encoding="utf-8").splitlines() if ln][a.line]
    game = set()
    for e in rec["probe"]["x"]:
        if e.startswith("flood|"):
            game |= {int(c.split(":")[0]) for c in e[6:].split(",") if c}
            break
    snap = {}
    orig = W.World.generate_floodplains

    def wrapped(self, *args):
        before = list(self.feature)
        orig(self, *args)
        snap["ours"] = {i for i in range(self.N) if self.feature[i] != before[i]}
        snap["rivers"] = self.river_plots()
        snap["w"] = self
    W.World.generate_floodplains = wrapped
    majors, minors = roster_args(rec)
    size, n_minors, options = session_setup(rec)
    generate(a.script, size, int(rec["map_seed"]), majors=majors, n_minors=n_minors, minors=minors, options=options)
    ours, w = snap["ours"], snap["w"]
    print(f"floodplains: game {len(game)}, ours {len(ours)}, both {len(game & ours)}")
    for rid, plots in snap["rivers"].items():
        if not (set(plots) & (game | ours)):
            continue
        same = set(plots) & game == set(plots) & ours
        marks = []
        for q in plots:
            m = ("B" if q in game else "O") if q in ours else ("G" if q in game else ".")
            wet = w.is_water(q) or any(w.is_water(n) for n in w.neighbours(q))
            marks.append(f"{q}{m}{'~' if wet else ''}")
        print(f"river {rid} {'same' if same else 'DIFFER'}: {' '.join(marks)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
