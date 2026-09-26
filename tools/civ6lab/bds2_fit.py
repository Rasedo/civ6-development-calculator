"""B-D-S2: the policy-unlock price per turn per arm (pair_run `bds2_policy`
records), beside the tech count, with k = 1.5 + techs/10's predictions for the
jump (50k), the floor (10k) and the fall (5k).

    python tools/civ6lab/bds2_fit.py tools/civ6lab/runs/bds2_policy_<stamp>.jsonl
"""
from __future__ import annotations

import json
import sys


def main(path: str) -> int:
    recs = [json.loads(l) for l in open(path, encoding="utf-8")]
    table: dict[int, dict[str, list]] = {}
    for i, r in enumerate(recs):
        name = r["arm"] if r["arm"] != "control" else f"control{i}"
        rows = [("pre", r["pre"][0]["json"])] + [(e["turn"], e["reads"][0]["json"]) for e in r["each"]]
        for turn, js in rows:
            for x in js:
                table.setdefault(x["p"], {}).setdefault(name, []).append(
                    (x["turn"], x["cost"], x["techs"], x["civics"], x["changed"]))
    for p in sorted(table):
        print(f"== p{p}")
        for arm, seq in table[p].items():
            s = "  ".join(f"t{t}:{c}/T{te}/C{cv}{'*' if ch else ''}" for t, c, te, cv, ch in seq)
            print(f"  {arm:12s} {s}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
