"""C-38 the walker's attacks on the H-1 dumps: every enemy unit (an owner the
minor is at war with) that lost health or vanished between records t and t+1
while a unit of the minor stood within 2 of it at t+1 (and no unit of any
other player at war with that owner stood within 2). Each row: the minor,
the victim's type, damage before / after, vanished, the minor's units near it
(type, distance, their own damage change), the victim's distance from the
minor's centre and whether the victim stood on the minor's land.

    python tools/civ6lab/h1c_attacks.py <dump.jsonl> [...] [--out runs/c38h1_attacks.jsonl]
"""
import collections
import json
import sys

sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
from h1c_losses import hexdist  # noqa: E402


def load(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def main():
    args = sys.argv[1:]
    out = None
    if "--out" in args:
        i = args.index("--out")
        out = open(args[i + 1], "w", encoding="utf-8", newline="\n")
        args = args[:i] + args[i + 2:]
    stats = collections.Counter()
    for path in args:
        cat = json.load(open(path.replace(".jsonl", ".cat.json"), encoding="utf-8"))
        un = cat["units"]
        prev = None
        for d in load(path):
            if prev is None or d["turn"] != prev["turn"] + 1:
                prev = d
                continue
            W = d["head"]["W"]
            wars = {p["id"]: set(p["wars"] or []) for p in prev["players"]}
            minors = [p["id"] for p in prev["players"] if p["minor"]]
            now = {(u["owner"], u["id"]): u for u in d["units"]}
            for v in prev["units"]:
                key = (v["owner"], v["id"])
                after = now.get(key)
                hurt = after is None or (after.get("damage") or 0) > (v.get("damage") or 0)
                if not hurt:
                    continue
                spot = (after or v)
                near = collections.defaultdict(list)
                for u in d["units"]:
                    if v["owner"] in wars.get(u["owner"], ()):
                        dist = hexdist((u["x"], u["y"]), (spot["x"], spot["y"]), W)
                        if dist <= 2:
                            near[u["owner"]].append((un[u["type"]], dist, u["id"]))
                mnear = [o for o in near if o in minors]
                if len(mnear) != 1 or len(near) != 1:
                    continue
                m = mnear[0]
                c = next((c for c in prev["cities"] if c["owner"] == m), None)
                if c is None:
                    continue
                own = prev["map"][v["y"]][v["x"]][6]
                row = {"file": path.split("/")[-1][:30], "t": prev["turn"], "minor": m, "victimOwner": v["owner"],
                       "victim": un[v["type"]], "dmg0": v.get("damage"), "dmg1": after.get("damage") if after else None,
                       "vanished": after is None, "near": near[m],
                       "distCentre": hexdist((v["x"], v["y"]), (c["x"], c["y"]), W),
                       "plotOwner": own}
                if out:
                    out.write(json.dumps(row) + "\n")
                stats[("onOwnLand" if own == m else ("unowned" if own == -1 else "foreign"))] += 1
                stats[("dist", min(row["distCentre"], 8))] += 1
                stats[("victimOwner", v["owner"])] += 1
            prev = d
    for k, v in sorted(stats.items(), key=str):
        print(k, v)


main()
