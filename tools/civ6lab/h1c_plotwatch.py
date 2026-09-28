"""One plot's H-1 layer row, turn by turn.

    python tools/civ6lab/h1c_plotwatch.py <dump.jsonl> <x> <y> <t0> <t1>
"""
import json
import sys

path, x, y, t0, t1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
cat = json.load(open(path.replace(".jsonl", ".cat.json"), encoding="utf-8"))
with open(path, encoding="utf-8") as f:
    for line in f:
        d = json.loads(line)
        if t0 <= d["turn"] <= t1:
            p = d["map"][y][x]
            print(d["turn"], cat["terrains"][p[0]], "feat", p[1], "res", p[2], "imp",
                  cat["improvements"][p[4]] if p[4] >= 0 else -1, "pill", p[5], "owner", p[6], "dist", p[7], "y", p[16])
