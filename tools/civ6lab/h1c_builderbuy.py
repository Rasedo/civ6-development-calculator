"""C-38 purchase gate from the H-1 dumps: every minor-turn with no Builder
standing, the bank against the Builder's gold price, whether the city is
producing a Builder, the count of its unimproved plots, and whether the
next record shows a Builder bought (a Builder born with the bank down by its
price).

    python tools/civ6lab/h1c_builderbuy.py <dump.jsonl> [...] [--out runs/c38h1_builderbuy.jsonl]
"""
import json
import sys


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
    for path in args:
        cat = json.load(open(path.replace(".jsonl", ".cat.json"), encoding="utf-8"))
        uname = cat["units"]
        terr = cat["terrains"]
        B = uname.index("UNIT_BUILDER")
        prev = None
        for d in load(path):
            if prev is None or d["turn"] != prev["turn"] + 1:
                prev = d
                continue
            pp = {p["id"]: p for p in prev["players"]}
            for p in d["players"]:
                if not p["minor"] or p["id"] not in pp:
                    continue
                a = pp[p["id"]]
                pid = p["id"]
                cs = [c for c in prev["cities"] if c["owner"] == pid]
                if not cs:
                    continue
                c = cs[0]
                if any(u["owner"] == pid and u["type"] == B for u in prev["units"]):
                    continue
                price = next((r[3] for r in c.get("buy") or [] if r[0] == "U" and r[1] == B), None)
                q = c.get("queue") or []
                producing = bool(q) and q[0].get("UnitType") == B
                unimp = 0
                owned = 0
                pillaged = 0
                res_unimp = 0
                for idx in c.get("plots") or []:
                    y, x = divmod(idx, d["head"]["W"])
                    pl = prev["map"][y][x]
                    tname = terr[pl[0]]
                    if pl[4] != -1 and pl[5]:
                        pillaged += 1
                    if pl[2] != -1 and pl[4] == -1 and pl[7] == -1:
                        res_unimp += 1
                    if "WATER" in tname or "OCEAN" in tname or "COAST" in tname or "MOUNTAIN" in tname:
                        continue
                    owned += 1
                    if pl[4] == -1 and pl[7] == -1:
                        unimp += 1
                born = [u for u in d["units"] if u["owner"] == pid and u["type"] == B
                        and u["id"] not in {v["id"] for v in prev["units"] if v["owner"] == pid}]
                net = (a["goldYield"] or 0) - (a["maintTotal"] or 0)
                resid = p["gold"] - a["gold"] - net
                bought = bool(born) and price is not None and abs(resid + price) <= 2
                row = {"file": path.split("/")[-1][:30], "player": pid, "civ": p["civ"], "t": prev["turn"],
                       "bank": a["gold"], "price": price, "net": (a["goldYield"] or 0) - (a["maintTotal"] or 0), "producing": producing, "unimproved": unimp,
                       "ownedLand": owned, "pillaged": pillaged, "resUnimproved": res_unimp,
                       "nPlots": len(c.get("plots") or []), "pop": c["pop"], "wars": a["wars"], "suzerain": a.get("suzerain"),
                       "bought": bought, "trained": bool(born) and not bought}
                if out:
                    out.write(json.dumps(row) + "\n")
            prev = d


main()
