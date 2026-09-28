"""Print the Builder-less minor-turns of `runs/c38h1_builderbuy.jsonl` for one
(file prefix, player) over a turn range, and a table of the buy rate by a key.

    python tools/civ6lab/h1c_bb_show.py runs/c38h1_builderbuy.jsonl [file4 player t0 t1]
"""
import collections
import json
import sys

rows = [json.loads(l) for l in open(sys.argv[1], encoding="utf-8")]
if len(sys.argv) > 2:
    f4, pid, t0, t1 = sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
    for r in rows:
        if r["file"][9:13] == f4 and r["player"] == pid and t0 <= r["t"] <= t1:
            print(r["t"], f"bank {r['bank']:.0f} price {r['price']} prod {r['producing']} unimp {r['unimproved']}"
                  f" resU {r['resUnimproved']} pill {r['pillaged']} plots {r['nPlots']} pop {r['pop']} suz {r['suzerain']}",
                  "BUY" if r["bought"] else ("TRAIN" if r["trained"] else ""))
    sys.exit()
el = [r for r in rows if r["price"] and r["bank"] >= r["price"] and not r["producing"]]
for r in rows: r["netpos"] = r["net"] > 0
for key in ("resUnimproved", "pillaged", "unimproved", "pop", "suzerain", "netpos"):
    b = collections.defaultdict(lambda: [0, 0])
    for r in el:
        k = r[key] if not isinstance(r[key], int) else min(r[key], 6) if key != "pop" else r[key] // 3 * 3
        b[k][0] += 1
        b[k][1] += r["bought"]
    print(key, sorted(b.items(), key=lambda kv: str(kv[0])))
