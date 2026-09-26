"""H-3: block until a file holds a line matching any of the given substrings
(or a timeout), then print its last lines.

    python tools/civ6lab/h3_wait.py <file> --any "->" --any Traceback --timeout 600
"""
from __future__ import annotations

import argparse
import pathlib
import time


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("file")
    p.add_argument("--any", action="append", default=[])
    p.add_argument("--timeout", type=float, default=600)
    p.add_argument("--tail", type=int, default=8)
    a = p.parse_args()
    f = pathlib.Path(a.file)
    deadline = time.monotonic() + a.timeout
    while time.monotonic() < deadline:
        txt = f.read_text(encoding="utf-8", errors="replace") if f.exists() else ""
        if any(s in txt for s in a.any):
            print("\n".join(ln[:400] for ln in txt.splitlines()[-a.tail:]))
            return 0
        time.sleep(3)
    print("timeout")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
