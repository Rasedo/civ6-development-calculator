"""C-60: every unit event on a plot within 3 of the Free City (69:21) from the
start of the grant's turn up to the grant's placement, from a
`c60t_grant_run.py` record — who stood where when the grant was placed.

    python tools/civ6lab/c60t_grant_occ.py tools/civ6lab/runs/c60t_grant_C3_<stamp>.jsonl
"""
from __future__ import annotations

import json
import sys


def dist(a, b):
    def ax(p):
        x, y = p
        return (x - (y - (y & 1)) // 2, y)
    (q1, r1), (q2, r2) = ax(a), ax(b)
    return (abs(q1 - q2) + abs(r1 - r2) + abs((q1 + r1) - (q2 + r2))) // 2


def main() -> None:
    rows = [json.loads(line) for line in open(sys.argv[1], encoding="utf-8")]
    c = (69, 21)
    pos: dict[int, tuple[int, int, int]] = {}
    occ0 = [r for r in rows if r.get("kind") == "occ" and r["turn"] == 251]
    print("start of t251:", [(r["x"], r["y"], r["units"]) for r in occ0])
    for r in rows:
        if r.get("kind") != "event" or r["turn"] != 251:
            continue
        p = (r["x"], r["y"])
        was = pos.get(r["id"])
        pos[r["id"]] = (r["player"], r["x"], r["y"])
        near_now = dist(c, p) <= 3
        near_was = was is not None and dist(c, (was[1], was[2])) <= 3
        if near_now or near_was:
            print(f"  {r['event']} p{r['player']} {r['id']} -> {r['x']}:{r['y']} (d{dist(c, p)})"
                  + (f" from {was[1]}:{was[2]}" if was else ""))
        if r["event"] == "add" and r["player"] == 62 and dist(c, p) > 0:
            print("  == the grant; stop")
            break


if __name__ == "__main__":
    main()
