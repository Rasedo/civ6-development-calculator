"""H-3: from a h3_ridgewrap10 table (saved output), the residual zones per
row: for each dy, the dhx runs of equal residual.

    python tools/civ6lab/h3_biasrows.py runs/h3_wrap10_<...>.txt
"""
from __future__ import annotations

import pathlib
import re
import sys


def main() -> int:
    for ln in pathlib.Path(sys.argv[1]).read_text(encoding="utf-8-sig").splitlines():
        m = re.match(r"dy\s+([+-]\d+): (.*)", ln)
        if not m:
            continue
        dy = int(m.group(1))
        cells = [(int(a), int(b)) for a, b in (c.split(":") for c in m.group(2).split())]
        runs = []
        for dhx, r in cells:
            if abs(r) > 3:
                continue
            if runs and runs[-1][2] == r:
                runs[-1][1] = dhx
            else:
                runs.append([dhx, dhx, r])
        print(f"dy {dy:+3d}: " + "  ".join(f"[{a:+d}..{b:+d}]={r:+d}" for a, b, r in runs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
