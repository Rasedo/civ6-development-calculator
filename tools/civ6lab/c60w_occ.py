"""C-60 (lab, host 4): who stood on each plot within 3 of the Free City
(69:21) at the moment each grant was PLACED, from `c60t_grant_run.py`
records: the plots occupied at the start of the grant's turn (the `occ` reads
taken before that turn ended) replayed through every add / move event up to
the grant's add. Prints each grant's plot and the free usable plots at each
distance at that moment.

    python tools/civ6lab/c60w_occ.py tools/civ6lab/runs/c60t_grant_w_*.jsonl
"""
from __future__ import annotations

import json
import sys

sys.path.insert(0, "tools/civ6lab")
from c60w_bfs_fit import USABLE, C  # noqa: E402


def dist(a, b):
    def ax(p):
        x, y = p
        return (x - (y - (y & 1)) // 2, y)
    (q1, r1), (q2, r2) = ax(a), ax(b)
    return (abs(q1 - q2) + abs(r1 - r2) + abs((q1 + r1) - (q2 + r2))) // 2


def main() -> None:
    for path in sys.argv[1:]:
        rows = [json.loads(ln) for ln in open(path, encoding="utf-8")]
        pos: dict[tuple[int, int], tuple[int, int]] = {}   # (player, id) -> plot
        occ_turn: dict[int, set] = {}
        for r in rows:
            if r.get("kind") == "occ":
                occ_turn.setdefault(r["turn"], set()).add((r["x"], r["y"]))
        # every unit's last known plot, from the events in order
        seen_turns = set()
        for r in rows:
            if r.get("kind") != "event":
                continue
            t = r["turn"]
            if t not in seen_turns:
                seen_turns.add(t)
                # the start-of-turn picture: plots with any unit, identity unknown
                base = set(occ_turn.get(t, set()))
                moved_from: set = set()
            key = (r["player"], r["id"])
            was = pos.get(key)
            pos[key] = (r["x"], r["y"])
            if was is not None:
                moved_from.add(was)
            if r["event"] == "add" and r["player"] == 62 and (r["x"], r["y"]) != C:
                here = {p for k, p in pos.items() if k != key}
                held = (base - moved_from) | here
                free = sorted((dist(C, p), p) for p in USABLE if p not in held)
                print(f"{path.split('_', 3)[-1][:40]} t{t}: grant at {r['x']}:{r['y']} d{dist(C, (r['x'], r['y']))};"
                      f" free usable then: {free[:8]}")


if __name__ == "__main__":
    main()
