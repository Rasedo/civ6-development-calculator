"""C-74-S2: the Duel event slot — per game and pooled, turns 2..end:
the record share by family, the records that found no site (StartLocation -1:
the row was drawn and nothing happened), the empty share with and without
them, and the expectation 1 - (the climate screen's five family chances of
the previous read)/100, with the meteor's own 6 / N_map beside it.

    python tools/civ6lab/c74s2_empty.py [tag glob]
"""
import collections
import json
import pathlib
import re
import sys

RUNS = pathlib.Path(__file__).parent / "runs"
KEYS = ("GetFloodPercentChance", "GetStormPercentChance", "GetDroughtPercentChance",
        "GetEruptionPercentChance", "GetFirePercentChance")


def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*"
    tags = sorted({re.match(r"c74s2_turn_(.*)_\d{8}T\d{6}Z\.jsonl", f.name).group(1)
                   for f in RUNS.glob(f"c74s2_turn_{pat}_*.jsonl")})
    pool = collections.Counter()
    pexp = 0.0
    for tag in tags:
        reads = {}
        for f in RUNS.glob(f"c74s2_turn_{tag}_*.jsonl"):
            for ln in open(f, encoding="utf-8"):
                if ln.startswith('{"kind":"t"'):
                    r = json.loads(ln)
                    reads[r["turn"]] = r["climate"]
        hist = {}
        for f in RUNS.glob(f"event_history_{tag}_*.txt"):
            for ln in open(f, encoding="utf-8"):
                if ln.startswith('{"kind":"turn"'):
                    h = json.loads(ln)
                    hist[h["t"]] = h
        if not hist:
            continue
        c = collections.Counter()
        exp = 0.0
        n = 0
        for t, h in sorted(hist.items()):
            if t < 2:
                continue
            e = h.get("event")
            if not isinstance(e, dict):
                c["empty"] += 1
            else:
                tp = (h.get("eventType") or "")[13:]
                fam = tp.split("_")[0]
                if e.get("StartLocation", -1) < 0:
                    c["nosite:" + fam] += 1
                else:
                    c["placed:" + fam] += 1
            cl = reads.get(t)  # the read at t shows the chances the turn t-1 -> t processing used? use the read before
            cl = reads.get(t - 1) or cl
            if cl and all(isinstance(cl.get(k), (int, float)) for k in KEYS):
                exp += 1 - sum(cl[k] for k in KEYS) / 100
                n += 1
        tot = sum(c.values())
        nos = sum(v for k, v in c.items() if k.startswith("nosite:") and not k.endswith("SEA"))
        print(f"{tag}: {tot} turns; record-empty {c['empty']} ({c['empty'] / tot:.3f}); no-site records {nos}; "
              f"effective empty {c['empty'] + nos} ({(c['empty'] + nos) / tot:.3f}); 1 - sum(chances) expects {exp:.1f} over {n}")
        print("    ", dict(sorted(c.items())))
        pool.update(c)
        pool["turns"] += tot
        pexp += exp
    tot = pool.pop("turns")
    nos = sum(v for k, v in pool.items() if k.startswith("nosite:") and not k.endswith("SEA"))
    print(f"\npooled {tot} turns: record-empty {pool['empty']} ({pool['empty'] / tot:.3f}); effective empty "
          f"{pool['empty'] + nos} ({(pool['empty'] + nos) / tot:.3f}); expected from the chances {pexp:.1f}")
    print("    ", dict(sorted(pool.items())))


if __name__ == "__main__":
    main()
