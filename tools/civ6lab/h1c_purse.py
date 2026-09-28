"""C-38 / C-60 from the H-1 dumps: every minor's gold step between two
records, the part its yield and upkeep explain, and what else moved — units
born (by id) with the city's queue head before, units lost, buildings and
districts added, plots bought.

    python tools/civ6lab/h1c_purse.py runs/h1_duelw1103_*.jsonl [--out runs/c38h1_purse_<tag>.jsonl] [--print]

Each step row: player, turn t (record t -> t+1), gold before / after, the
yield and maintenance read at t, the residual (after - before - (yield - maint)),
births [(id, type, x, y, bought?)], losses, new buildings, the queue head at t,
the matched purchase (the city's `buy` gold price at t equal to -residual
within 1.5).
"""
import json
import sys


def load(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def head_of(city):
    q = city.get("queue") or []
    if not q:
        return None
    h = q[0]
    for k in ("UnitType", "BuildingType", "DistrictType", "ProjectType"):
        if k in h and h[k] is not None and h[k] != -1:
            return (k[0], h[k])
    return None


def main():
    path = sys.argv[1]
    out = None
    if "--out" in sys.argv:
        out = open(sys.argv[sys.argv.index("--out") + 1], "w", encoding="utf-8", newline="\n")
    show = "--print" in sys.argv
    cat = json.load(open(path.replace(".jsonl", ".cat.json"), encoding="utf-8"))
    units = cat["units"]
    bnames = cat["buildings"]
    prev = None
    for d in load(path):
        if prev is None or d["turn"] != prev["turn"] + 1:
            prev = d
            continue
        pp = {p["id"]: p for p in prev["players"]}
        for p in d["players"]:
            if not (p["minor"] or p["free"]):
                continue
            a = pp.get(p["id"])
            if a is None:
                continue
            pid = p["id"]
            u0 = {u["id"]: u for u in prev["units"] if u["owner"] == pid}
            u1 = {u["id"]: u for u in d["units"] if u["owner"] == pid}
            c0 = [c for c in prev["cities"] if c["owner"] == pid]
            c1 = [c for c in d["cities"] if c["owner"] == pid]
            net = (a["goldYield"] or 0) - (a["maintTotal"] or 0)
            resid = p["gold"] - a["gold"] - net
            births = [(i, units[u["type"]], u["x"], u["y"]) for i, u in u1.items() if i not in u0]
            losses = [(i, units[u["type"]], u["x"], u["y"], u.get("damage")) for i, u in u0.items() if i not in u1]
            b0 = {(c["id"], b[0]) for c in c0 for b in c["buildings"]}
            newb = [bnames[b[0]] for c in c1 for b in c["buildings"] if (c["id"], b[0]) not in b0]
            heads = [head_of(c) for c in c0]
            prices = {}
            for c in c0:
                for row in c.get("buy") or []:
                    kind, idx, _pc, gold = row[0], row[1], row[2], row[3]
                    prices[(kind, idx)] = gold
            match = []
            if resid < -1.5:
                for (kind, idx), g in prices.items():
                    if g is not None and abs(g + resid) <= 1.5:
                        name = units[idx] if kind == "U" else (bnames[idx] if kind == "B" else idx)
                        match.append((kind, name, g))
            row = {"player": pid, "civ": p["civ"], "t": prev["turn"], "gold0": a["gold"], "gold1": p["gold"],
                   "yield": a["goldYield"], "maint": a["maintTotal"], "resid": round(resid, 3),
                   "births": births, "losses": losses, "newBuildings": newb, "heads": heads,
                   "match": match, "nUnits0": len(u0), "cities": len(c1)}
            if out:
                out.write(json.dumps(row) + "\n")
            if show and (births or losses or abs(resid) > 1.5):
                print(pid, prev["turn"], f"g {a['gold']:.1f}->{p['gold']:.1f} net {net:.1f} resid {resid:.1f}",
                      "B", births, "L", losses, "nb", newb, "h", heads, "m", match[:3])
        prev = d


main()
