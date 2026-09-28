"""C-38 naval-buy rate on the H-1 dumps: which minors are coastal (a
non-lake Coast plot beside the centre), their minor-turns (all, and at a bank
of at least the cheapest naval price), and the naval units bought (from
`runs/c38h1_milbuy.jsonl`).

    python tools/civ6lab/h1c_naval.py <dump.jsonl> [...]
"""
import json
import sys

sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
from h1c_losses import hexdist  # noqa: E402

NAVAL = ("GALLEY", "QUADRIREME", "FRIGATE", "CARAVEL", "PRIVATEER", "IRONCLAD", "BATTLESHIP", "DESTROYER",
         "SUBMARINE", "CARRIER", "MISSILE_CRUISER", "NUCLEAR_SUBMARINE", "SEADOG", "TRIREME")
buys = [json.loads(l) for l in open("tools/civ6lab/runs/c38h1_milbuy.jsonl", encoding="utf-8")]
tot_turns = tot_rich = tot_buys = tot_units = 0
for path in sys.argv[1:]:
    cat = json.load(open(path.replace(".jsonl", ".cat.json"), encoding="utf-8"))
    un = cat["units"]
    terr = cat["terrains"]
    naval_idx = {i for i, n in enumerate(un) if any(n.endswith(k) for k in NAVAL)}
    coastal = {}
    turns = {}
    rich = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            W, H = d["head"]["W"], d["head"]["H"]
            for c in d["cities"]:
                p = next(q for q in d["players"] if q["id"] == c["owner"])
                if not p["minor"]:
                    continue
                if c["owner"] not in coastal:
                    cx, cy = c["x"], c["y"]
                    co = False
                    for y in range(max(0, cy - 1), min(H, cy + 2)):
                        for x in range(cx - 1, cx + 2):
                            pl = d["map"][y][x % W]
                            if hexdist((x % W, y), (cx, cy), W) == 1 and "COAST" in terr[pl[0]] and not pl[18]:
                                co = True
                    coastal[c["owner"]] = co
                if coastal[c["owner"]]:
                    turns[c["owner"]] = turns.get(c["owner"], 0) + 1
                    prices = [r[3] for r in c.get("buy") or [] if r[0] == "U" and r[1] in naval_idx]
                    if prices and p["gold"] >= min(prices):
                        rich[c["owner"]] = rich.get(c["owner"], 0) + 1
    tag = path.split("/")[-1][:30]
    nb = [b for b in buys if b["file"] == tag and any(any(u.endswith(k) for k in NAVAL) for u in b["bought"])]
    print(tag, "coastal", coastal, "turns", turns, "rich", rich, "naval buys", [(b["p"], b["t"], b["bought"]) for b in nb])
    tot_turns += sum(turns.values())
    tot_rich += sum(rich.values())
    tot_buys += len(nb)
    tot_units += sum(sum(1 for u in b["bought"] if any(u.endswith(k) for k in NAVAL)) for b in nb)
print("coastal minor-turns", tot_turns, "at a bank >= the cheapest naval price", tot_rich, "buy events", tot_buys, "units", tot_units)
