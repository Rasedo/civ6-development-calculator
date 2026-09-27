"""C-74-S3: the fire clock. Reads a pair_run `c74s3_fire` record
(`c74s3_plots.lua` around the lit plot, before the turn and after each) and
prints, per plot that ever burns, its feature turn by turn — so the burning,
burnt and regrowth turns, whether a spread plot keeps the origin's clock or
its own, and whether a Forest Fire reaches Rainforest are read off directly.

    python tools/civ6lab/c74s3_fire_fit.py tools/civ6lab/runs/c74s3_fire_<stamp>.jsonl
"""
from __future__ import annotations

import json
import sys

SHORT = {"FEATURE_FOREST": "F", "FEATURE_JUNGLE": "J", "FEATURE_BURNING_FOREST": "bF", "FEATURE_BURNT_FOREST": "xF",
         "FEATURE_BURNING_JUNGLE": "bJ", "FEATURE_BURNT_JUNGLE": "xJ", "FEATURE_MARSH": "M", "FEATURE_FLOODPLAINS": "fp"}


def main(path: str) -> int:
    for line in open(path, encoding="utf-8"):
        r = json.loads(line)
        reads = [r["pre"][0]["json"][0]] + [e["reads"][0]["json"][0] for e in r["each"]]
        turns = [x["turn"] for x in reads]
        series: dict[tuple, list[str]] = {}
        for k, x in enumerate(reads):
            for q in x["plots"]:
                f = q["feature"]
                s = SHORT.get(f, "-" if f == -1 else str(f)[8:12])
                series.setdefault((q["x"], q["y"], q["d"]), ["?"] * len(reads))[k] = s
        print("==", r["arm"], "turns", turns, "apply:", [(j.get("call"), j.get("ev"), j.get("x"), j.get("y")) for j in r["gc"]["json"]])
        for key, seq in sorted(series.items(), key=lambda kv: (kv[0][2], kv[0])):
            if any(s.startswith(("b", "x")) for s in seq) or key[2] <= 1:
                print(f"   ({key[0]},{key[1]}) d{key[2]}: " + " ".join(f"{s:>2s}" for s in seq))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
