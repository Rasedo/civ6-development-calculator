"""civ6lab b95t_read — B-95: the combat preview's base for every city of
--player right now (`city_defense_preview.lua`), appended to --out with --step.

    python tools/civ6lab/b95t_read.py --host 127.0.0.4 --player 1 --step bought --out tools/civ6lab/runs/b95t_X.jsonl
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--player", type=int, required=True)
    ap.add_argument("--step", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    t = Tuner(a.host).connect()
    lua = (HERE / "city_defense_preview.lua").read_text(encoding="utf-8").replace("ZMAX", "-1")
    turn = lab.turn(t)
    bases = []
    with open(a.out, "a", encoding="utf-8", newline="\n") as fh:
        for ln in t.run(lab.IG, lua, timeout=120):
            if not ln.startswith("{"):
                continue
            r = json.loads(ln)
            if r.get("owner") != a.player:
                continue
            fh.write(json.dumps({"step": a.step, **r}) + "\n")
            bases.append(f"{r.get('city', '')[14:]}={r.get('base')}")
    print(f"[{a.step}] t{turn} p{a.player} bases {' '.join(bases)}")
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
