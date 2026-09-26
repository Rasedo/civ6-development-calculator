"""H-3: read the civ6lab_mapprobe plot-property log from the running game
into a session-shaped JSON line (for h3_probelog.py), without drawing.

    python tools/civ6lab/h3_probe_collect.py --host 127.0.0.3 --tag x --out runs/h3_session_probe.jsonl
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from tuner import Tuner  # noqa: E402
import h3_session  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--port", type=int, default=4318)
    p.add_argument("--tag", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    t = Tuner(a.host, a.port).connect()
    seeds = t.run("GameCore_Tuner", "print(tostring(MapConfiguration.GetValue('RANDOM_SEED')) .. ' ' .. "
                  "tostring(GameConfiguration.GetValue('GAME_SYNC_RANDOM_SEED')))")[-1].split()
    t.close()
    rec = {"tag": a.tag, "map_seed": int(seeds[0]), "game_seed": int(seeds[1]),
           "probe": h3_session.probe_read(a.host, a.port)}
    with pathlib.Path(a.out).open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")
    print(a.tag, "entries", len(rec["probe"]["log"]), "chunks", rec["probe"]["n_chunks"],
          "reasons", len(rec["probe"]["reasons"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
