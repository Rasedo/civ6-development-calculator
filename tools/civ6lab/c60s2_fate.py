"""C-60-S2: a Free City's flip and fate in the extended watch — for every city
that joins or leaves the Free Cities (p62): the owner before and after (from
the GameCore per-turn city list, `c74s2_turn.lua`), the world era, the flip
pair's type, and the p62 units within 3 of the city on the read before and
the read after (by id and type).

    python tools/civ6lab/c60s2_fate.py [tag, default c38s1_ext1]
"""
import collections
import json
import pathlib
import sys

RUNS = pathlib.Path(__file__).parent / "runs"


def cube(x, y):
    return x - (y - (y & 1)) // 2, y


def hexd(a, b, W=84):
    best = None
    for dx in (-W, 0, W):
        q1, r1 = cube(*a)
        q2, r2 = cube(b[0] + dx, b[1])
        d = (abs(q1 - q2) + abs(r1 - r2) + abs((q1 + r1) - (q2 + r2))) // 2
        best = d if best is None else min(best, d)
    return best


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else "c38s1_ext1"
    owners = {}
    era = {}
    p62 = {}
    for f in RUNS.glob(f"c74s2_turn_{tag}_*.jsonl"):
        for ln in open(f, encoding="utf-8"):
            if ln.startswith('{"kind":"cities"'):
                r = json.loads(ln)
                owners[r["turn"]] = {(c[2], c[3]): c[0] for c in r["c"]}
    for f in RUNS.glob(f"c38s1_watch_{tag}_*.jsonl"):
        for ln in open(f, encoding="utf-8"):
            if ln.startswith('{"kind":"era"'):
                r = json.loads(ln)
                era[r["turn"]] = r["worldEra"]
            elif '"p":62' in ln and '"kind":"minor"' in ln:
                r = json.loads(ln)
                p62[r["turn"]] = r
    ts = sorted(owners)
    prev = None
    for t in ts:
        cur = owners[t]
        if prev is not None:
            for xy, o in cur.items():
                po = prev.get(xy)
                if po != o and (o == 62 or po == 62):
                    def near(tt):
                        r = p62.get(tt)
                        if not r:
                            return []
                        return [(u[0], u[1][5:]) for u in r["units"] if u[2] >= 0 and hexd((u[2], u[3]), xy) <= 3]
                    print(f"t{t} city {xy}: owner {po} -> {o}; world era {era.get(t)}; p62 units within 3 before {near(t - 1)}; after {near(t)}")
            for xy, po in prev.items():
                if xy not in cur:
                    print(f"t{t} city {xy} gone (was {po})")
        prev = cur


if __name__ == "__main__":
    main()
