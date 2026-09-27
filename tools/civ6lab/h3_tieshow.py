"""H-3: show a resource-tie record (runs/h3_ties/*.json): the candidates in
score order with their insertion position, the placed ones marked.

    python tools/civ6lab/h3_tieshow.py runs/h3_ties/tie_*.json
"""
from __future__ import annotations

import json
import pathlib
import sys


def main() -> int:
    for p in sys.argv[1:]:
        d = json.loads(pathlib.Path(p).read_text())
        b = d["before"]
        want = set(d["want"])
        pos = {i: k for k, (i, _) in enumerate(b)}
        srt = sorted(b, key=lambda e: -e[1])
        print(pathlib.Path(p).stem, "n", len(b), "take", d["take"], "want", d["want"],
              "want not in list", sorted(want - set(pos)))
        cut = srt[min(d["take"], len(srt)) - 1][1]
        for i, s in srt:
            if s < cut - 3:
                break
            print(f"   {'*' if i in want else ' '} id {i:5d} pos {pos[i]:3d} score {s}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
