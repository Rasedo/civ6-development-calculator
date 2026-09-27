"""Turn order: read a turnorder_run.py record.

    python tools/civ6lab/turnorder_analyze.py <record.jsonl> [--state GC] [--all] [--from N] [--to N]

Prints the chosen state's events in order, one per line: seq, game turn, the
sync draws taken since the previous line (the LCG stepped from one recorded
seed to the next; "?" past 20000 steps), the event and its arguments. Runs of
the same event with the same first argument fold into one line with a count.
The noisy map events (resources, routes, unit movement) are hidden unless
--all.
"""
from __future__ import annotations

import argparse
import json

NOISY = {"EV.ResourceRemovedFromMap", "EV.ResourceAddedToMap", "EV.UnitMoved", "EV.RouteChanged",
         "EV.RouteAddedToMap", "EV.UnitMovementPointsRestored", "EV.UnitMovementPointsCleared",
         "EV.PlayerResourceChanged", "EV.UnitOperationStarted", "EV.NotificationAdded",
         "EV.UnitTeleported", "EV.CityProductionUpdated", "EV.FloodplainRevealed",
         "EV.VolcanoRevealed"}


def lcg(s: int) -> int:
    return (1103515245 * s + 12345) & 0xFFFFFFFF


def steps(a: int | None, b: int | None, cap: int = 20000) -> str:
    if a is None or b is None:
        return "-"
    s = a
    for k in range(cap + 1):
        if s == b:
            return str(k)
        s = lcg(s)
    return "?"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--state", default="GC")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--from", dest="lo", type=int, default=0)
    ap.add_argument("--to", dest="hi", type=int, default=10**9)
    a = ap.parse_args()
    rows = []
    with open(a.path, encoding="utf-8") as f:
        for ln in f:
            r = json.loads(ln)
            if r.get("state") == a.state:
                rows.append(r)
    prev_seed = None
    out = []
    for r in rows:
        d = steps(prev_seed, r["seed"])
        if r["seed"] is not None:
            prev_seed = r["seed"]
        if not a.lo <= r["seq"] <= a.hi:
            continue
        if not a.all and r["ev"] in NOISY:
            if d not in ("0", "-") and out:
                out[-1]["hidden_draws"] = out[-1].get("hidden_draws", 0) + (int(d) if d.isdigit() else 0)
            continue
        key = (r["ev"], r["args"][0] if r["args"] else "")
        if out and out[-1]["key"] == key and d in ("0", "-"):
            out[-1]["n"] += 1
            out[-1]["last"] = r
            continue
        out.append({"key": key, "n": 1, "first": r, "last": r, "d": d})
    for o in out:
        r = o["first"]
        extra = f" x{o['n']} (..{o['last']['seq']} {'|'.join(o['last']['args'][:4])})" if o["n"] > 1 else ""
        hid = f" +{o['hidden_draws']}h" if o.get("hidden_draws") else ""
        print(f"{r['seq']:6d} t{r['turn']} d{o['d']:>4}{hid:>6} {r['ev']:<44} {'|'.join(r['args'][:6])}{extra}")


if __name__ == "__main__":
    main()
