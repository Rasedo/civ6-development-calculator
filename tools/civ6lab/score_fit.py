"""civ6lab score_fit — B-82: read `score_read.lua` lines and test the
ScoringLineItems as flat per-item counts (GS multipliers: civics 3, techs 2,
wonders 15, cities 5, districts 2, population 1, era score 1), printing each
category's residue (what the counted items leave unexplained).

    python tools/civ6lab/score_fit.py <score_read output>
"""
from __future__ import annotations

import json
import sys


def main(path: str) -> int:
    for line in open(path, encoding="utf-8"):
        if not line.startswith("{"):
            continue
        r = json.loads(line)
        c = r["cats"]
        pred = {
            "CATEGORY_CIVICS": 3 * len(r["civics"]),
            "CATEGORY_TECH": 2 * len(r["techs"]),
            "CATEGORY_WONDER": 15 * len(r["wonders"]),
            "CATEGORY_EMPIRE": 5 * r["cities"] + 2 * r["districts"] + r["pop"] + r["buildings"],
            "CATEGORY_ERA_SCORE": r["eraScore"],
            "CATEGORY_GREAT_PEOPLE": 5 * r["gp"],
        }
        parts = [f"{k.split('_', 1)[1]} {c[k]}-{v}={c[k] - v}" for k, v in pred.items()]
        total = sum(v for k, v in c.items())
        print(f"p{r['p']} score {r['score']} (sum of cats {total}); " + "; ".join(parts)
              + f"; RELIGION {c['CATEGORY_RELIGION']} (founded {r['religion'] >= 0}, own cities {r['relMine']},"
              f" foreign {r['relForeign']})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
