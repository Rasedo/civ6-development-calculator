"""Block until a file contains a pattern (or the time runs out): the lab's
bounded wait on a background run's log.

    python tools/civ6lab/wait_for.py <file> <regex> [--timeout 540]
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys
import time


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("file")
    p.add_argument("pattern")
    p.add_argument("--timeout", type=float, default=540.0)
    a = p.parse_args(argv)
    rx = re.compile(a.pattern)
    end = time.monotonic() + a.timeout
    path = pathlib.Path(a.file)
    while time.monotonic() < end:
        if path.exists() and rx.search(path.read_text(encoding="utf-8", errors="replace")):
            print("found")
            return 0
        time.sleep(2.0)
    print("timeout")
    return 1


if __name__ == "__main__":
    sys.exit(main())
