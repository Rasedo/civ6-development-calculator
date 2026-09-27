"""H-3: print the printable ASCII strings of a binary that match a pattern
(the install's GameCore DLLs carry the natives' names, asserts and logs).

    python tools/civ6lab/h3_dllstrings.py DLL PATTERN [--min 5] [--context 0]
"""
from __future__ import annotations

import argparse
import re


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dll")
    p.add_argument("pattern")
    p.add_argument("--min", type=int, default=5)
    p.add_argument("--context", type=int, default=0, help="neighbouring strings to show")
    a = p.parse_args()
    data = open(a.dll, "rb").read()
    strs = [(m.start(), m.group().decode("ascii")) for m in re.finditer(rb"[\x20-\x7e]{%d,}" % a.min, data)]
    pat = re.compile(a.pattern, re.I)
    for k, (off, s) in enumerate(strs):
        if pat.search(s):
            lo, hi = max(0, k - a.context), min(len(strs), k + a.context + 1)
            for off2, s2 in strs[lo:hi]:
                print(f"{off2:08x} {'>' if off2 == off else ' '} {s2[:200]}")
            if a.context:
                print("--")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
