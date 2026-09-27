"""C-93: where each world quantity of the C-93 witness moves.

    python tools/civ6lab/turnorder_c93where.py <record.jsonl> [...]

Walks the C9 rows (turnorder_c93snap.lua) that carry the world line
(PlayerTurnStarted / PlayerTurnStartComplete / OnGameTurnEnded /
OnGameTurnStarted) in order and prints every change of total CO2, average
temperature, climate level, sea-level countdown, the scores, favor, the
great-people timeline and the winner, naming the interval it fell in:
  start(p)   between PlayerTurnStarted(p) and PlayerTurnStartComplete(p)
  act(p)     between PlayerTurnStartComplete(p) and the next boundary
  gap        between OnGameTurnEnded(T) and OnGameTurnStarted(T+1)
A tally per quantity and interval kind closes the report.
"""
from __future__ import annotations

import collections
import json
import re
import sys

KEYS = ("co2", "temp", "tch", "lvl", "sea", "win", "score", "favor", "gp")


def world(s: str) -> dict:
    return {k: (re.search(rf"\b{k}=(\S*)", s).group(1) if re.search(rf"\b{k}=(\S*)", s) else None) for k in KEYS}


def main() -> None:
    tally = collections.Counter()
    for path in sys.argv[1:]:
        prev = None
        prev_at = None
        for line in open(path, encoding="utf-8"):
            r = json.loads(line)
            if r.get("state") != "C9" or len(r.get("args", [])) < 3 or not r["args"][2].startswith("W"):
                continue
            ev, who = r["ev"], r["args"][0]
            w = world(r["args"][2])
            if prev is not None:
                pev, pwho, pturn = prev_at
                if pev == "PlayerTurnStarted":
                    where = f"start({pwho})"
                elif pev == "PlayerTurnStartComplete":
                    where = f"act({pwho})"
                elif pev == "OnGameTurnEnded":
                    where = "gap"
                else:
                    where = f"after_{pev}"
                for k in KEYS:
                    if w[k] != prev[k]:
                        kind = where.split("(")[0]
                        tally[(k, kind)] += 1
                        a, b = prev[k] or "", w[k] or ""
                        if k in ("score", "favor", "gp"):
                            pa, pb = a.split(","), b.split(",")
                            diff = [f"{i}:{x}->{y}" for i, (x, y) in enumerate(zip(pa, pb)) if x != y]
                            shown = " ".join(diff)
                        else:
                            shown = f"{a} -> {b}"
                        print(f"t{pturn} {where:<12} {k:<5} {shown}")
            prev = w
            prev_at = (ev, who.split(",")[0], r["turn"])
    print("--- (quantity, interval kind): changes")
    for (k, kind), n in sorted(tally.items()):
        print(f"   {k:<5} {kind:<6} {n}")


if __name__ == "__main__":
    main()
