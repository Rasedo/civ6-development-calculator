"""Turn order: what changed between consecutive synchronous snapshots.

    python tools/civ6lab/turnorder_sndiff.py <record.jsonl> [...] [--player P]

Reads the SN rows (turnorder_snapgc.lua) and, inside each player's block
(GE.PlayerTurnStarted p .. the next PlayerTurnStarted), prints for every GE
event the fields of player p that changed since the previous snapshot of p:
  g gold, f faith, rt/rp research, cv/cc civic, per city pop / plots (border) /
  tug (turns until growth) / item (production) / fs (food surplus) / py
  (production yield), U units n:damage:moves.
Then counts, over all blocks, the interval (the event that first shows it) in
which each kind of change appears, which is the order the DLL applies them.
"""
from __future__ import annotations

import collections
import json
import sys


def parse_snap(s: str) -> dict:
    out: dict = {}
    for tok in s.split(" "):
        if "=" not in tok:
            continue
        k, v = tok.split("=", 1)
        if k == "C":
            cities = {}
            for c in v.split(";"):
                if not c:
                    continue
                parts = c.split(":")
                if len(parts) < 7:
                    continue
                cid, pop, plots, tug, item, fs, py = parts[:7]
                rel = parts[7] if len(parts) > 7 else ""
                cities[cid] = {"pop": pop, "plots": plots, "tug": tug, "item": item, "fs": fs, "py": py, "rel": rel}
            out["C"] = cities
        else:
            out[k] = v
    return out


def diff(a: dict, b: dict) -> list[str]:
    ch = []
    for k in ("g", "f", "rt", "rp", "cv", "cc", "U"):
        if a.get(k) != b.get(k):
            ch.append(f"{k}:{a.get(k)}->{b.get(k)}")
    ca, cb = a.get("C", {}), b.get("C", {})
    for cid in sorted(set(ca) | set(cb), key=lambda x: int(x)):
        x, y = ca.get(cid), cb.get(cid)
        if x is None or y is None:
            ch.append(f"city{cid}:{'new' if x is None else 'gone'}")
            continue
        for f in ("item", "pop", "tug", "plots", "fs", "py", "rel"):
            if x[f] != y[f]:
                ch.append(f"c{cid}.{f}:{x[f]}->{y[f]}")
    return ch


def main() -> None:
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    want = None
    if "--player" in sys.argv:
        want = sys.argv[sys.argv.index("--player") + 1]
        args = [x for x in args if x != want]
    first_seen = collections.Counter()
    for path in args:
        rows = [json.loads(l) for l in open(path, encoding="utf-8")]
        rows = [r for r in rows if r.get("state") == "SN"]
        cur = None
        last = None
        for r in rows:
            a = r["args"]
            ev = r["ev"]
            if ev.startswith("ALL@"):
                continue
            ea = a[0].split(",") if a else []
            snap = parse_snap(a[1]) if len(a) > 1 and a[1] else None
            if ev == "PlayerTurnStarted":
                cur = ea[0]
                last = snap
                if want is None or want == cur:
                    print(f"== t{r['turn']} player {cur}")
                continue
            if cur is None or snap is None or not ea or ea[0] != cur:
                continue
            ch = diff(last, snap) if last else []
            if want is None or want == cur:
                print(f"   {ev:<26} {a[0]:<28} {' '.join(ch)}")
            kinds = sorted({c.split(":")[0].split(".")[-1] if c.startswith("c") and "." in c else c.split(":")[0]
                            for c in ch})
            for k in kinds:
                first_seen[(ev, k)] += 1
            last = snap
    print("--- (event whose snapshot first shows the change, kind): count")
    for (ev, k), n in sorted(first_seen.items(), key=lambda x: (x[0][0], -x[1])):
        print(f"   {ev:<26} {k:<8} {n}")


if __name__ == "__main__":
    main()
