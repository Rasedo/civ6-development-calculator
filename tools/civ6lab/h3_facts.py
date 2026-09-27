"""H-3: print the native-call markers (and the facts after them) of a probe
session record, skipping the Lua draws.

    python tools/civ6lab/h3_facts.py runs/h3_session_<stamp>.jsonl [--line 0] [--grep Stamp]
"""
from __future__ import annotations

import argparse
import json
import pathlib


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("session")
    p.add_argument("--line", type=int, default=0)
    p.add_argument("--grep", default="")
    p.add_argument("--max", type=int, default=400)
    a = p.parse_args()
    rec = [json.loads(ln) for ln in pathlib.Path(a.session).read_text(encoding="utf-8").splitlines() if ln][a.line]
    print({k: v for k, v in rec.items() if k not in ("probe",)})
    n = 0
    lua = 0
    for e in rec["probe"]["log"]:
        if e[:1] in "<>":
            if a.grep and a.grep not in e:
                lua = 0
                continue
            if lua:
                print(f"   ({lua} Lua draws)")
                lua = 0
            print(e)
            n += 1
            if n >= a.max:
                break
        else:
            lua += 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
