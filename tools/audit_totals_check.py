"""docs/AUDIT.md's open-weight table must ADD UP, and its entries keep their form.

The rows are the source of truth. This asks what a reader would: does each
section's stated weight equal the sum of its own rows, does the grand total
equal the sum of the sections, does every row have its entry and every
weighted entry its row with the same weight.

The entries are lists of items, one item a line:

    - **C-95. BARBARIANS' UNIT MOVES.** Weight 5.
      - LAB (explore): 1128 t12 Scout 393221 on 15:16 for 17:11 stops at 15:15, ours 15:14

Every item line names its kind (BUILD / BLOCKER / ASK / LAB), may name a
topic in parentheses, and stays under the item cap: an item is one open case
or one unread rule, never a paragraph of them.

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
# `- **C-95. BARBARIANS' UNIT MOVES.** Weight 5.`
HEAD = re.compile(r"^- \*\*([A-Z]-[0-9A-Za-z]+)\. [^*]+\.\*\*(?: Weight (\d+)\.)?")
# `  - LAB (explore): ...`
ITEM = re.compile(r"^  - (BUILD|BLOCKER|ASK|LAB)(?: \([^():]+\))?: \S")
MAX_ITEM = 600


def main() -> int:
    lines = DOC.read_text(encoding="utf-8").splitlines()
    rows: dict[str, int] = {}
    row_weight: dict[str, int] = {}
    stated: dict[str, int] = {}
    grand: int | None = None
    table_end = 0
    for i, ln in enumerate(lines):
        m = ENTRY.match(ln)
        if m:
            rows[m.group(1)] = rows.get(m.group(1), 0) + int(m.group(3))
            eid = f"{m.group(1)}-{m.group(2)}"
            if eid in row_weight:
                faults_dup = eid
                print(f"AUDIT CHECK FAILED:\n  the table holds {faults_dup} twice")
                return 1
            row_weight[eid] = int(m.group(3))
            continue
        m = SECTION.match(ln)
        if m:
            stated[m.group(1)] = int(m.group(2))
            continue
        m = TOTAL.match(ln)
        if m:
            grand = int(m.group(1))
            # the table ends here; entries below are prose, not rows
            table_end = i + 1
            break

    faults: list[str] = []
    if not row_weight:
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

    # THE ENTRIES. One row per entry, no row without an entry; under an entry,
    # one item a line.
    heads: dict[str, int | None] = {}
    items = 0
    entry = ""
    for i, ln in enumerate(lines[table_end:], table_end + 1):
        m = HEAD.match(ln)
        if m:
            entry = m.group(1)
            if entry in heads:
                faults.append(f"line {i}: entry {entry} stands twice")
            heads[entry] = int(m.group(2)) if m.group(2) else None
            continue
        if ln.startswith("#"):
            entry = ""
            continue
        if not ln.startswith(" "):
            continue
        if not entry:
            faults.append(f"line {i}: an indented line under no entry")
        elif not ITEM.match(ln):
            faults.append(f"line {i} ({entry}): not `  - KIND (topic): item` with KIND one of "
                          "BUILD / BLOCKER / ASK / LAB")
        elif len(ln) > MAX_ITEM:
            faults.append(f"line {i} ({entry}): a {len(ln)}-character item (cap {MAX_ITEM}) — "
                          "one open case or one unread rule a line")
        else:
            items += 1
    for eid, w in row_weight.items():
        if eid not in heads:
            faults.append(f"row {eid} has no entry")
        elif heads[eid] != w:
            faults.append(f"{eid}: the row weighs {w}, the entry says {heads[eid]}")
    for eid, w in heads.items():
        if eid[0] in "ABC" and eid not in row_weight:
            faults.append(f"entry {eid} has no row")

    if faults:
        print("AUDIT CHECK FAILED:")
        for f in faults:
            print(f"  {f}")
        return 1
    print(f"AUDIT TOTALS OK — {len(row_weight)} entry rows over {len(rows)} sections "
          f"sum to {grand}, every subtotal agrees, {items} items in {len(heads)} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
