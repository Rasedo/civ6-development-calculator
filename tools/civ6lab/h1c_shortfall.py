"""C-60 a minor's shortfall line on the H-1 dumps: every minor step t -> t+1
whose upkeep the bank cannot cover — S = maint - floor(gold yield) -
floor(bank) > 0 at t — with the city's bankruptcy amenity loss read at t+1,
and the units lost on the step by `runs/c38h1_losses.jsonl`'s kind (an
`other` loss is a disband or the AI's own delete). Also every step at S <= 0
where an `other` loss happened, for contrast.

    python tools/civ6lab/h1c_shortfall.py <dump.jsonl> [...]
"""
import collections
import json
import sys

losses = collections.defaultdict(list)
for line in open("tools/civ6lab/runs/c38h1_losses.jsonl", encoding="utf-8"):
    r = json.loads(line)
    losses[(r["file"], r["player"], r["t"])].append((r["kind"], r["unit"]))
tab = collections.defaultdict(lambda: [0, 0, collections.Counter()])
for path in sys.argv[1:]:
    tag = path.split("/")[-1][:30]
    prev = None
    with open(path, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            if prev is None or d["turn"] != prev["turn"] + 1:
                prev = d
                continue
            for p in prev["players"]:
                if not p["minor"]:
                    continue
                pid = p["id"]
                S = (p["maintTotal"] or 0) - int(p["goldYield"] or 0) - int(p["gold"] or 0)
                c1 = [c for c in d["cities"] if c["owner"] == pid]
                bk = c1[0]["amenityParts"][-1] if c1 else None
                lost = losses.get((tag, pid, prev["turn"]), [])
                other = [u for k, u in lost if k == "other"]
                if S > 0:
                    print(tag[9:13], pid, prev["turn"], "S", S, "bankrupt amenities next", bk, "expected", 1 + S // 10,
                          "other losses", other, "all", lost)
                    k = "S>=10" if S >= 10 else "0<S<10"
                    tab[k][0] += 1
                    tab[k][1] += len(other)
                    tab[k][2][(bk, 1 + S // 10)] += 1
                elif other:
                    print(tag[9:13], pid, prev["turn"], "S", S, "(solvent) other losses", other)
            prev = d
for k, v in sorted(tab.items()):
    print(k, "steps", v[0], "other losses", v[1], "(read, expected) amenity pairs", dict(v[2]))
