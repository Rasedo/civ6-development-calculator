"""H-3: record the game that is up now (no new host): the map generator's
draw count (h3_session.tb_position), the map options and the map dump, one
JSON line to runs/h3_session_<stamp>.jsonl.

    python tools/civ6lab/h3_here.py --host 127.0.0.3 --map-seed 1000 --game-seed 2000 --tag cont_defaults
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import h3_mapdump  # noqa: E402
from h3_session import tb_position  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--port", type=int, default=4318)
    p.add_argument("--map-seed", type=int, required=True)
    p.add_argument("--game-seed", type=int, required=True)
    p.add_argument("--tag", required=True)
    p.add_argument("--config", default="")
    a = p.parse_args()
    tag = f"{a.tag}_m{a.map_seed}_g{a.game_seed}"
    rec = {"tag": tag, "config": a.config, "map_seed": a.map_seed, "game_seed": a.game_seed}
    rec.update(tb_position(a.host, a.port, a.map_seed))
    rec["map_dump"] = str(h3_mapdump.dump(a.host, tag))
    out = HERE / "runs" / f"h3_session_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.jsonl"
    out.write_text(json.dumps(rec) + "\n", encoding="utf-8")
    print(json.dumps(rec))
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
