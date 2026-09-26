"""civ6lab c2s1_table — C-2-S1's arms from the `promise_c2s1_*` logs
(`near_probe.py --site ... --tag c2s1_*`): per log, the promisee's grievance
log entries against seat 0 (pair ZP -> 0) with their descriptions decoded
(a description built from a formatted string comes back UTF-8 read as
cp1251; it is re-decoded), one row per entry, written to
`runs/promise_break_<stamp>.jsonl` and printed.

    python tools/civ6lab/c2s1_table.py tools/civ6lab/runs/promise_c2s1_*.log
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys

RUNS = pathlib.Path(__file__).parent / "runs"


def fix(s: str) -> str:
    """UTF-8 bytes that were decoded as cp1251 once more, back to text; a
    byte the reader's `%c` escaped comes back as U+0080..U+009F and is that
    byte"""
    try:
        raw = b"".join(bytes([ord(ch)]) if 0x80 <= ord(ch) <= 0x9F else ch.encode("cp1251") for ch in s)
        return raw.decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("logs", nargs="+")
    p.add_argument("--p", type=int, default=1, help="the promisee")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = RUNS / f"promise_break_{stamp}.jsonl"
    rows = []
    for path in sorted(a.logs):
        tag = re.sub(r"^promise_(.*)_\d{8}T\d{6}Z\.log$", r"\1", pathlib.Path(path).name)
        seen = {}
        founded = []
        for line in open(path, encoding="utf-8"):
            if not line.startswith("{"):
                continue
            r = json.loads(line)
            if r["kind"] == "grievlog" and "entry" in r and r["a"] == a.p and r["b"] == 0:
                e = dict(r["entry"])
                e["Description"] = fix(e.get("Description", ""))
                seen[json.dumps(e, sort_keys=True, ensure_ascii=False)] = e
            elif r["kind"] == "city" and r["p"] == 0:
                founded.append((r["turn"], r["x"], r["y"]))
        for e in sorted(seen.values(), key=lambda e: (e["Turn"], e["Amount"])):
            row = {"log": pathlib.Path(path).name, "tag": tag, "promisee": a.p, **e}
            rows.append(row)
            print(f"{tag:32s} t{e['Turn']:<4} {e['Amount']:>4}  {e['Description']}")
        if not seen:
            rows.append({"log": pathlib.Path(path).name, "tag": tag, "promisee": a.p, "entries": 0})
            print(f"{tag:32s} (no entry)")
    with out.open("w", encoding="utf-8", newline="\n") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    print("->", out.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
