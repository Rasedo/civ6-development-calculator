"""Answer whatever holds the local seat's turn once, the way lab.wait_turn does
(lab.diagnose -> lab.handle), without ending the turn; print what was done.

    python tools/civ6lab/turnorder_unstick.py --host 127.0.0.2
"""
from __future__ import annotations

import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import lab  # noqa: E402
from tuner import Tuner  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    a = ap.parse_args()
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    for c in lab.diagnose(t, lp):
        print("cause", c, "->", lab.handle(t, lp, c))
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
