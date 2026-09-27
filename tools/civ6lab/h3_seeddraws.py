"""H-3: print the raw draws of BuildRidges per seed, given the seed starts.

    python tools/civ6lab/h3_seeddraws.py DUMP NAME 0,7,14
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_ridgefit import raws  # noqa: E402


def main() -> int:
    dump, name, starts = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(",")]
    rec = next(json.loads(ln) for ln in pathlib.Path(dump).read_text(encoding="utf-8").splitlines()
               if json.loads(ln)["name"] == name)
    n = rec["draws"]["P2->P3"]
    d = raws(rec, "P2", n)
    starts = starts + [n]
    for a, b in zip(starts, starts[1:]):
        seg = d[a:b]
        print(f"[{a}:{b}] len {b - a}")
        for rg in (rec["h"], rec["w"], 2, 3, 4, 5, 6, 7, 8, 10, 16, 100, 256):
            print(f"   r{rg:<4d}", [(x * rg) >> 16 for x in seg])
    return 0


if __name__ == "__main__":
    sys.exit(main())
