"""Turn order: the player-level steps of a start of turn, counted.

    python tools/civ6lab/turnorder_startcheck.py <record.jsonl> [...]

Over every start block (SN rows, GE.PlayerTurnStarted p .. the block's
GE.PlayerTurnStartComplete p), compares the player's snapshot at the start
with the one at each later GE event of the block, and counts:
  * at the block's FIRST GE event: gold moved, research moved, faith moved,
    whether any city's queue head or population moved;
  * at GE.OnCivicCulturevated: faith already moved (it should not if faith
    comes after the civic);
  * at the block's first GE.OnFaithEarned: faith moved, and whether any city
    had been processed by then (its queue head or population moved; turns-to-growth
    also moves with any yield change, so it is no witness).
"""
from __future__ import annotations

import collections
import json
import sys

sys.path.insert(0, __import__("pathlib").Path(__file__).parent.as_posix())
from turnorder_sndiff import parse_snap  # noqa: E402


def main() -> None:
    c = collections.Counter()
    for path in sys.argv[1:]:
        rows = [json.loads(l) for l in open(path, encoding="utf-8")]
        rows = [r for r in rows if r.get("state") == "SN" and not r["ev"].startswith("ALL@")]
        cur = start = None
        first = True
        seen_faith_ev = False
        for r in rows:
            ea = r["args"][0].split(",") if r["args"] else []
            snap = parse_snap(r["args"][1]) if len(r["args"]) > 1 and r["args"][1] else None
            if r["ev"] == "PlayerTurnStarted":
                cur, start, first, seen_faith_ev = ea[0], snap, True, False
                c["blocks"] += 1
                continue
            if cur is None or snap is None or not ea or ea[0] != cur:
                continue
            if r["ev"] == "PlayerTurnStartComplete":
                cur = None
                continue
            moved = lambda k: start.get(k) != snap.get(k)  # noqa: E731
            city_moved = any(start.get("C", {}).get(cid, {}).get(f) != v.get(f)
                             for cid, v in snap.get("C", {}).items() for f in ("item", "pop"))
            if first:
                first = False
                c["first_event"] += 1
                c["first: gold moved"] += moved("g")
                c["first: research moved"] += moved("rp") or moved("rt")
                c["first: faith moved"] += moved("f")
                c["first: a city processed"] += city_moved
                c[f"first event = {r['ev']}"] += 1
            if r["ev"] == "OnCivicCulturevated":
                c["civic event"] += 1
                c["civic: faith already moved"] += moved("f")
                c["civic: gold already moved"] += moved("g")
                c["civic: a city already processed"] += city_moved
            if r["ev"] == "OnFaithEarned" and not seen_faith_ev:
                seen_faith_ev = True
                c["faith event"] += 1
                c["faith: faith moved"] += moved("f")
                c["faith: a city already processed"] += city_moved
    for k in sorted(c):
        print(f"{k:<40} {c[k]}")


if __name__ == "__main__":
    main()
