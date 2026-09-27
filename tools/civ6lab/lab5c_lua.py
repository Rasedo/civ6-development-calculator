"""civ6lab lab5c_lua — one deadline-bound Lua snippet with `lab_json.lua`
prepended (J, P, OUT), Z-tokens substituted; every printed JSON line is
echoed and, with --rec, appended to that record with --tag.

    python tools/civ6lab/lab5c_lua.py --host 127.0.0.4 --state InGame --file b91c_scan.lua \
        --set ZX=34 --rec runs/b91c_colonization.jsonl --tag scan
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402
import pair_run  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--state", default="GameCore")
    p.add_argument("--file", required=True)
    p.add_argument("--set", action="append", default=[])
    p.add_argument("--rec")
    p.add_argument("--tag", default="")
    p.add_argument("--deadline", type=float, default=120.0)
    a = p.parse_args()
    h4.guard(a.deadline, a.file)
    tokens = dict(kv.split("=", 1) for kv in a.set)
    lua = pair_run.snippet(a.file, None, tokens)
    t = h4.connect(a.host)
    out = pair_run.run_lua(t, a.state, lua, timeout=max(5.0, a.deadline - 10))
    t.close()
    for r in out.get("raw", []):
        print("RAW", r)
    if out.get("error"):
        print("ERROR", out["error"])
    for j in out["json"]:
        print(json.dumps(j, ensure_ascii=False))
    if a.rec:
        path = pathlib.Path(a.rec)
        if not path.is_absolute():
            path = pathlib.Path(__file__).parent / path
        with path.open("a", encoding="utf-8", newline="\n") as f:
            for j in out["json"]:
                f.write(json.dumps({"tag": a.tag, "file": a.file, "set": tokens, **(j if isinstance(j, dict) else {"v": j})},
                                   ensure_ascii=False) + "\n")
    return 1 if out.get("error") else 0


if __name__ == "__main__":
    sys.exit(main())
