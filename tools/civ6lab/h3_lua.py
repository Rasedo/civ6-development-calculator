"""H-3: run a Lua file in one of the game's Lua states over the tuner and print
its output.

    python tools/civ6lab/h3_lua.py --host 127.0.0.3 [--state GameCore_Tuner] file.lua
"""
from __future__ import annotations

import argparse
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from tuner import Tuner  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--state", default="GameCore_Tuner")
    p.add_argument("--timeout", type=float, default=60)
    p.add_argument("file")
    a = p.parse_args()
    t = Tuner(a.host).connect()
    for ln in t.run(a.state, pathlib.Path(a.file).read_text(encoding="utf-8"), timeout=a.timeout):
        print(ln)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
