"""Print every plot within R of a city whose improvement / feature /
resource / district / pillage changed between two H-1 records, and where one
player's Builders stood each turn in between.

    python tools/civ6lab/h1c_plotdiff.py <dump.jsonl> <player> <t0> <t1> [R]
"""
import json
import sys

path, pid, t0, t1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
R = int(sys.argv[5]) if len(sys.argv) > 5 else 4
cat = json.load(open(path.replace(".jsonl", ".cat.json"), encoding="utf-8"))
recs = {}
with open(path, encoding="utf-8") as f:
    for line in f:
        d = json.loads(line)
        if t0 <= d["turn"] <= t1:
            recs[d["turn"]] = d
a, b = recs[t0], recs[t1]
c = next(c for c in a["cities"] if c["owner"] == pid)
cx, cy = c["x"], c["y"]
W = a["head"]["W"]
imps = cat["improvements"]
feats = cat["features"]


def nm(lst, i):
    return lst[i] if 0 <= i < len(lst) else i


for y in range(max(0, cy - R), min(a["head"]["H"], cy + R + 1)):
    for x in range(cx - R - 1, cx + R + 2):
        xx = x % W
        p, q = a["map"][y][xx], b["map"][y][xx]
        if p[1:8] != q[1:8]:
            print((xx, y), "imp", nm(imps, p[4]), "->", nm(imps, q[4]), "pill", p[5], "->", q[5],
                  "feat", nm(feats, p[1]), "->", nm(feats, q[1]), "res", p[2], "->", q[2], "owner", p[6], "->", q[6],
                  "dist", p[7], "->", q[7])
B = cat["units"].index("UNIT_BUILDER")
for t in sorted(recs):
    us = [(u["id"], u["x"], u["y"], u.get("buildCharges")) for u in recs[t]["units"] if u["owner"] == pid and u["type"] == B]
    if us:
        print(t, us)
