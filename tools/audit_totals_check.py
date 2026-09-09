"""docs/AUDIT.md's open-weight table must ADD UP.

The table is hand-maintained: an entry closes, its row goes to 0, and the
section subtotal and the grand total are edited by hand beside it. Three
numbers, three chances to forget one — and they had drifted to B 14 / C 31 /
TOTAL 32 where the rows say 12 / 21 / 33, which is the difference between
"nine items left" and "nineteen" for anyone reading the summary instead of
the rows.

The rows are the source of truth. This asks the two questions a reader would:
does each section's stated weight equal the sum of its own rows, and does the
grand total equal the sum of the sections.

    python tools/audit_totals_check.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "AUDIT.md"

# `| **A. Engine vs engine** | **0** | ... |`
SECTION = re.compile(r"^\|\s*\*\*([ABC])\.[^|]*\|\s*\*\*(\d+)\*\*\s*\|")
TOTAL = re.compile(r"^\|\s*\*\*OPEN, TOTAL\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|")
# `| B-67 district price progression | 0 | ... |` — the id's LETTER is its section
ENTRY = re.compile(r"^\|\s*([ABC])-([0-9A-Za-z]+)[^|]*\|\s*(\d+)\s*\|")


def main() -> int:
    lines = DOC.read_text(encoding="utf-8").splitlines()
    rows: dict[str, int] = {}
    seen: list[str] = []
    stated: dict[str, int] = {}
    grand: int | None = None
    for ln in lines:
        m = ENTRY.match(ln)
        if m:
            rows[m.group(1)] = rows.get(m.group(1), 0) + int(m.group(3))
            seen.append(f"{m.group(1)}-{m.group(2)}")
            continue
        m = SECTION.match(ln)
        if m:
            stated[m.group(1)] = int(m.group(2))
            continue
        m = TOTAL.match(ln)
        if m:
            grand = int(m.group(1))
            # the table ends here; entries below are prose, not rows
            break

    faults: list[str] = []
    if not seen:
        faults.append("the open-weight table has no entry rows at all — "
                      "the parser or the table's shape moved")
    for sec in sorted(set(stated) | set(rows)):
        want, got = rows.get(sec, 0), stated.get(sec)
        if got is None:
            faults.append(f"section {sec} has rows summing {want} and no subtotal row")
        elif got != want:
            faults.append(f"section {sec}: subtotal says {got}, its rows sum {want}")
    if grand is None:
        faults.append("no `OPEN, TOTAL` row")
    elif grand != sum(rows.values()):
        faults.append(f"OPEN, TOTAL says {grand}, every row sums {sum(rows.values())}")

    if faults:
        print("AUDIT TOTALS FAILED — the summary disagrees with the rows:")
        for f in faults:
            print(f"  {f}")
        return 1
    print(f"AUDIT TOTALS OK — {len(seen)} entry rows over {len(rows)} sections "
          f"sum to {grand}, and every subtotal agrees")
    return 0


if __name__ == "__main__":
    sys.exit(main())
