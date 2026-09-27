"""Turn order: every snapshot of every city, in order, and where a field moved.

    python tools/civ6lab/turnorder_citytimeline.py <record.jsonl> [...] --field rel|pop|plots|item

Reads the SN rows, including the all-players snapshots taken at
GE.OnGameTurnEnded / GE.OnGameTurnStarted (turnorder_snapgc.lua with --watch
-1), and prints each change of the field with the two snapshots that bracket
it: the change happened after the first and before the second. Counts the
bracket kinds.
"""
from __future__ import annotations

import collections
import json
import sys

sys.path.insert(0, __import__("pathlib").Path(__file__).parent.as_posix())
from turnorder_sndiff import parse_snap  # noqa: E402


def main() -> None:
    field = sys.argv[sys.argv.index("--field") + 1] if "--field" in sys.argv else "rel"
    paths = [x for x in sys.argv[1:] if x.endswith(".jsonl")]
    last: dict[tuple[str, str], tuple[str, str]] = {}
    kinds = collections.Counter()
    for path in paths:
        for ln in open(path, encoding="utf-8"):
            r = json.loads(ln)
            if r.get("state") != "SN" or len(r["args"]) < 2:
                continue
            ev = r["ev"]
            ea = r["args"][0].split(",")
            label = f"t{r['turn']}:{ev}:{ea[0] if ea else ''}"
            blob = "|".join(r["args"][1:])
            snaps = []
            if ev in ("OnGameTurnStarted", "OnGameTurnEnded") or ev.startswith("ALL@"):
                for part in blob.split("||"):
                    part = part.strip()
                    if not part.startswith("P"):
                        continue
                    pid, rest = part[1:].split(" ", 1)
                    snaps.append((pid, parse_snap(rest)))
            elif ea and ea[0].lstrip("-").isdigit():
                snaps.append((ea[0], parse_snap(blob)))
            for pid, s in snaps:
                for cid, c in s.get("C", {}).items():
                    key = (pid, cid)
                    val = c.get(field, "")
                    if key in last and last[key][0] != val:
                        prev_label = last[key][1]
                        kinds[(prev_label.split(":")[1], ev)] += 1
                        print(f"p{pid} c{cid} {field}: {last[key][0]} -> {val}   after {prev_label}  before {label}")
                    last[key] = (val, label)
    print("--- (last snapshot before, first snapshot after): count")
    for k, n in kinds.most_common():
        print(f"   {k[0]:<26} -> {k[1]:<26} {n}")


if __name__ == "__main__":
    main()
