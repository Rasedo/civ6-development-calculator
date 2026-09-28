"""C-38 military and naval buys on the H-1 dumps: per minor step t -> t+1 the
units born whose gold price (the city's `buy` row at t) sums with the others
to the unexplained bank drop, the enemy units (owners the minor is at war
with) within 3 / 6 of its centre at t, its army and its bank. Prints every
buy and a table of the buy rate by the nearest enemy distance.

    python tools/civ6lab/h1c_milbuy.py <dump.jsonl> [...] [--out runs/c38h1_milbuy.jsonl]
"""
import collections
import itertools
import json
import sys

sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
from h1c_losses import hexdist  # noqa: E402


def load(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


CIVIL = {"UNIT_BUILDER", "UNIT_TRADER", "UNIT_SETTLER", "UNIT_SCOUT"}


def main():
    args = sys.argv[1:]
    out = None
    if "--out" in args:
        i = args.index("--out")
        out = open(args[i + 1], "w", encoding="utf-8", newline="\n")
        args = args[:i] + args[i + 2:]
    tab = collections.defaultdict(lambda: [0, 0])
    for path in args:
        cat = json.load(open(path.replace(".jsonl", ".cat.json"), encoding="utf-8"))
        un = cat["units"]
        prev = None
        for d in load(path):
            if prev is None or d["turn"] != prev["turn"] + 1:
                prev = d
                continue
            W = d["head"]["W"]
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
                ids0 = {u["id"] for u in prev["units"] if u["owner"] == pid}
                born = [u for u in d["units"] if u["owner"] == pid and u["id"] not in ids0]
                price = {(r[1]): r[3] for r in c.get("buy") or [] if r[0] == "U"}
                net = (a["goldYield"] or 0) - (a["maintTotal"] or 0)
                resid = p["gold"] - a["gold"] - net
                # the subset of births (at most 4) whose prices sum to -resid, upgrades being 5 each
                bought = []
                cand = [u for u in born if un[u["type"]] not in ("UNIT_BUILDER",)]
                best = None
                for r in range(1, min(4, len(cand)) + 1):
                    for sub in itertools.combinations(cand, r):
                        s = sum(price.get(u["type"], 1e9) for u in sub)
                        for k_up in range(0, 5):
                            if abs(s + 5 * k_up + resid) <= 2:
                                best = sub
                                break
                        if best:
                            break
                    if best:
                        break
                if best:
                    bought = [un[u["type"]] for u in best]
                enemies = [u for u in prev["units"] if u["owner"] in (a["wars"] or [])]
                dmin = min((hexdist((e["x"], e["y"]), (c["x"], c["y"]), W) for e in enemies), default=99)
                army = sum(1 for u in prev["units"] if u["owner"] == pid and un[u["type"]] not in CIVIL)
                row = {"file": path.split("/")[-1][:30], "p": pid, "t": prev["turn"], "bank": a["gold"],
                       "army": army, "enemyMin": dmin, "bought": bought, "resid": round(resid, 2),
                       "coastal": any(un[u["type"]] in ("UNIT_GALLEY", "UNIT_QUADRIREME") for u in born)}
                if out:
                    out.write(json.dumps(row) + "\n")
                if bought:
                    print(row["file"][9:13], pid, prev["turn"], "bank", round(a["gold"]), "army", army, "enemy", dmin, bought)
                if a["gold"] >= 95:
                    k = "<=3" if dmin <= 3 else ("<=6" if dmin <= 6 else ">6")
                    tab[k][0] += 1
                    tab[k][1] += bool(bought)
            prev = d
    for k, v in sorted(tab.items()):
        print("enemy", k, "minor-turns at bank>=95", v[0], "with a military buy", v[1])


main()
