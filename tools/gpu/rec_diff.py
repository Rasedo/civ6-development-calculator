"""Compare two record logs — the proof a driver refactor left every decision alone.

    CIV6_REC_LOG=.claude/scratchpad/recs/base python gpu/battery.py --seeds 9248 ...
    CIV6_REC_LOG=.claude/scratchpad/recs/head python gpu/battery.py --seeds 9248 ...
    python tools/gpu/rec_diff.py .claude/scratchpad/recs/base .claude/scratchpad/recs/head

Each directory holds `recs_<seed>.jsonl` (gpu/serve_gate.py `_log_recs`): one
line per turn, the records the decision server sent every seat. Prints the
FIRST differing turn per seed, seat and field, and exits 1 on any difference or
on a seed/turn present on one side only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def load(path: Path) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for ln in path.read_text(encoding="utf-8").splitlines():
        if ln.strip():
            row = json.loads(ln)
            out[int(row["t"])] = row["recs"]
    return out


def first_diff(a: dict, b: dict) -> str | None:
    for t in sorted(set(a) | set(b)):
        if t not in a or t not in b:
            return f"turn {t}: present on {'the first' if t in a else 'the second'} side only"
        if a[t] == b[t]:
            continue
        for seat in sorted(set(a[t]) | set(b[t]), key=str):
            ra, rb = a[t].get(seat), b[t].get(seat)
            if ra == rb:
                continue
            if ra is None or rb is None:
                return f"turn {t} seat {seat}: record on one side only"
            for k in sorted(set(ra) | set(rb)):
                if ra.get(k) != rb.get(k):
                    return f"turn {t} seat {seat} field {k}: {json.dumps(ra.get(k))[:200]} vs {json.dumps(rb.get(k))[:200]}"
    return None


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    da, db = Path(sys.argv[1]), Path(sys.argv[2])
    fa = {p.name for p in da.glob("recs_*.jsonl")}
    fb = {p.name for p in db.glob("recs_*.jsonl")}
    bad = 0
    for name in sorted(fa ^ fb):
        print(f"{name}: on one side only")
        bad += 1
    for name in sorted(fa & fb):
        a, b = load(da / name), load(db / name)
        d = first_diff(a, b)
        if d:
            print(f"{name}: {d}")
            bad += 1
        else:
            print(f"{name}: identical over {len(a)} turns")
    if not fa and not fb:
        print("no record logs found")
        return 1
    print("REC DIFF " + ("RED" if bad else "OK"))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
