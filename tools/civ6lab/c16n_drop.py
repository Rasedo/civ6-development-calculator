"""C-16 (lab, host 4): does a mission's resolution take the counterspy off
its post? From `c16w_cycle.py` / `c16n_cycle.py` logs: per completion turn
t, the post read at the start of t - 1 and of t, and the results that
resolved between (InitialResult: 1 CAPTURED, 0/6 KILLED, 2/4 must escape,
3/5 undetected).

    python tools/civ6lab/c16n_drop.py tools/civ6lab/runs/escape_cs_c16w_guard3b.log [...]
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict

SUMMARY = re.compile(r"^turn (\d+) spies \d+ started")
DEF = re.compile(r"^defender (\d+) at (-?\d+):(-?\d+) level (\d+) op (\S+)")


def main(paths: list[str]) -> None:
    for path in paths:
        post: dict[int, bool] = {}
        done: dict[tuple[str, int], int] = {}
        pend = None
        for ln in open(path, encoding="utf-8", errors="replace"):
            m = DEF.match(ln)
            if m:
                pend = "COUNTERSPY" in m.group(5)
                continue
            m = SUMMARY.match(ln)
            if m and pend is not None:
                post.setdefault(int(m.group(1)), pend)
                pend = None
                continue
            if ln.startswith("mission ") and "PlotIndex=" in ln:
                kv = dict(x.split("=", 1) for x in ln[8:].split() if "=" in x)
                done[(kv["Name"], int(kv["CompletionTurn"]))] = int(kv["InitialResult"])
        by = defaultdict(list)
        for (_, ct), r in done.items():
            by[ct].append(r)
        print(f"== {path}")
        tally = defaultdict(int)
        for ct in sorted(by):
            before, after = post.get(ct - 1), post.get(ct)
            cap = 1 in by[ct]
            print(f"   t{ct}: post before {before} after {after}; results {sorted(by[ct])}; capture {cap}")
            if before:
                tally[(cap, after)] += 1
        for (cap, after), n in sorted(tally.items(), key=str):
            print(f"   post standing before, capture {cap}: post after {after} x{n}")


if __name__ == "__main__":
    main(sys.argv[1:])
