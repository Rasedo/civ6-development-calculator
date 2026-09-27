"""H-3: poll an instance's tuner states until one appears (or a timeout).

    python tools/civ6lab/h3_states.py --host 127.0.0.3 --want GameCore_Tuner --timeout 120
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from tuner import Tuner, TunerError  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--want", default="GameCore_Tuner")
    p.add_argument("--timeout", type=float, default=60)
    a = p.parse_args()
    deadline = time.monotonic() + a.timeout
    st = {}
    while True:
        try:
            t = Tuner(a.host).connect()
            st = t.refresh_states()
            t.close()
        except (OSError, TunerError) as e:
            st = {"<no answer>": str(e)}
        if a.want in st or time.monotonic() > deadline:
            break
        time.sleep(5)
    print(a.want in st, sorted(st)[:12], len(st))
    return 0


if __name__ == "__main__":
    sys.exit(main())
