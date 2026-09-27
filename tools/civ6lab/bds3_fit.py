"""B-D-S3: the policy price against the tech count from `bds3_ladder.py`
records: per ladder (turn) and seat, the price at each tech count, the step
it took, and the tech moved.

The InGame `HasTech` lags GameCore's `SetTech` by an unknown number of calls
(the ladder's own reads show counts frozen for many steps), while the price
moves at once. So the count is the ladder's base read (InGame, before any
grant) plus the grants the GameCore steps report done.

    python tools/civ6lab/bds3_fit.py tools/civ6lab/runs/bds3_ladder_*.jsonl
"""
from __future__ import annotations

import collections
import json
import sys


def ladders(paths: list[str]):
    """(path, dir, turn, p) -> [(T, cost, civics, tech moved or 'base')]"""
    table: dict[tuple, list] = collections.defaultdict(list)
    for path in paths:
        turn, base, done = None, {}, collections.Counter()
        for line in open(path, encoding="utf-8"):
            r = json.loads(line)
            if r["kind"] == "base":
                turn, base, done = r["turn"], {}, collections.Counter()
                for x in r["read"]:
                    base[x["p"]] = x["techs"]
                    table[(path, r["dir"], turn, x["p"])].append((x["techs"], x["cost"], x["civics"], "base"))
                continue
            moved = {}
            for m in r["moved"]:
                if m.get("call") is True:
                    done[m["p"]] += 1
                    moved[m["p"]] = m.get("tech")
            for x in r["read"]:
                t = base[x["p"]] + r["dir"] * done[x["p"]]
                table[(path, r["dir"], turn, x["p"])].append((t, x["cost"], x["civics"], moved.get(x["p"])))
    return table


def main(paths: list[str]) -> int:
    table = ladders(paths)
    for key, seq in sorted(table.items(), key=lambda kv: (kv[0][1], kv[0][2], kv[0][3])):
        path, d, turn, p = key
        print(f"== dir {d:+d} t{turn} p{p} civics {seq[0][2]}")
        prev = None
        out = []
        for t, cost, c, tech in seq:
            step = "" if prev is None else f"{cost - prev:+d}"
            out.append(f"T{t}:{cost}{'(' + step + ')' if step else ''}")
            prev = cost
        print("   " + " ".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
