"""C-38 purchase gate on the H-1 dumps: per Builder-less minor-turn, the
WORK a Builder has on the minor's own land — owned land plots (not Mountain,
not water) with no improvement and no district ("bare"), and pillaged
improvements — at record t and t+1, against whether a Builder was bought
between t and t+1 (a Builder born with the bank down by its price).

    python tools/civ6lab/h1c_work.py <dump.jsonl> [...] [--out runs/c38h1_work.jsonl]
"""
import collections
import json
import sys


def load(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def work(d, pid, terr):
    bare = pill = 0
    for row in d["map"]:
        for pl in row:
            if pl[6] != pid:
                continue
            tn = terr[pl[0]]
            if "COAST" in tn or "OCEAN" in tn or "MOUNTAIN" in tn:
                continue
            if pl[4] != -1 and pl[5]:
                pill += 1
            if pl[4] == -1 and pl[7] == -1:
                bare += 1
    return bare, pill


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
        terr = cat["terrains"]
        B = cat["units"].index("UNIT_BUILDER")
        recs = list(load(path))
        byt = {d["turn"]: d for d in recs}
        for d in recs:
            t = d["turn"]
            n = byt.get(t + 1)
            if n is None:
                continue
            for p in d["players"]:
                if not p["minor"]:
                    continue
                pid = p["id"]
                cs = [c for c in d["cities"] if c["owner"] == pid]
                if not cs:
                    continue
                if any(u["owner"] == pid and u["type"] == B for u in d["units"]):
                    continue
                c = cs[0]
                price = next((r[3] for r in c.get("buy") or [] if r[0] == "U" and r[1] == B), None)
                q = c.get("queue") or []
                producing = bool(q) and q[0].get("UnitType") == B
                pn = next((x for x in n["players"] if x["id"] == pid), None)
                if pn is None or price is None:
                    continue
                net = (p["goldYield"] or 0) - (p["maintTotal"] or 0)
                resid = pn["gold"] - p["gold"] - net
                born = [u for u in n["units"] if u["owner"] == pid and u["type"] == B
                        and u["id"] not in {v["id"] for v in d["units"] if v["owner"] == pid}]
                bought = bool(born) and abs(resid + price) <= 2
                w0 = work(d, pid, terr)
                w1 = work(n, pid, terr)
                row = {"file": path.split("/")[-1][:30], "p": pid, "t": t, "bank": p["gold"], "price": price,
                       "producing": producing, "work_t": w0, "work_t1": w1, "bought": bought,
                       "trained": bool(born) and not bought}
                if out:
                    out.write(json.dumps(row) + "\n")
                if p["gold"] >= price and not producing:
                    k = ("work" if sum(w0) > 0 else "none", "work1" if sum(w1) > 0 else "none1")
                    tab[k][0] += 1
                    tab[k][1] += bought
                    if bought and sum(w0) == 0:
                        print("buy with no work at t:", row)
    for k, v in sorted(tab.items()):
        print(k, "eligible", v[0], "bought", v[1])


main()
