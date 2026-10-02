"""H-3: which branch of StampContinents' first step each recorded map took:
for every StampContinents call our generator makes on a natives-probe
session (the same script, size, seed and roster), the land and mountain
area sizes against T = (L // N) // 3 — how many exceed T, or none (the
first largest area alone).

    python tools/civ6lab/h3_stampbranch.py runs/h3_session_<stamp>.jsonl [...]
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
from h3_rostercheck import SCRIPTS  # noqa: E402
from tools.civ6map import continents as C  # noqa: E402
from tools.civ6map.check import session_setup  # noqa: E402
from tools.civ6map.generate import generate  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("sessions", nargs="+")
    a = p.parse_args()
    seen: list[str] = []
    orig = C.partition

    def hooked(w, h, wrap_x, kind, n):
        g = C.Grid(w, h, wrap_x)
        areas = [x for x in C.components(g, kind) if kind[x[0]] in (C.LAND, C.MOUNTAIN)]
        t = (sum(len(x) for x in areas) // n) // 3 if areas else 0
        big = sorted((len(x) for x in areas), reverse=True)
        over = sum(1 for s in big if s > t)
        seen.append(f"N={n} L={sum(big)} T={t} areas>T {over}{' (NONE: the largest alone)' if not over else ''} "
                    f"largest {big[:4]}")
        return orig(w, h, wrap_x, kind, n)
    C.partition = hooked
    for s in a.sessions:
        for line in pathlib.Path(s).read_text(encoding="utf-8").splitlines():
            rec = json.loads(line)
            cfg = json.loads((ROOT / rec["config"]).read_text(encoding="utf-8"))
            script = SCRIPTS.get(cfg.get("map", "").removeprefix("civ6lab_mapprobe_natives_").removesuffix(".lua"),
                                 "Continents")
            majors, minors = roster_args(rec)
            size, n_minors, options = session_setup(rec)
            seen.clear()
            generate(script, size, int(rec["map_seed"]), majors=majors, n_minors=n_minors, minors=minors,
                     options=options)
            for x in seen:
                print(f"{rec['tag']}: {x}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
