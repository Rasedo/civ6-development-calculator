"""H-3: the players a natives-probe map was made for (the probe's roster|
record, PlayerConfigurations at map generation) as check.py arguments.

    python tools/civ6lab/h3_roster.py runs/h3_session_<stamp>.jsonl [...]

Prints per record the roster in player order and the --majors / --minors
lists (majors: IsMajor true; minors: the other civilizations with a
LEADER_MINOR_CIV_* leader that are alive at map generation: the setup configures every city-state and the first n live; barbarians and free cities left out).
"""
from __future__ import annotations

import json
import pathlib
import sys


def roster(rec: dict) -> list[tuple[int, str, str, str, str]]:
    for e in rec["probe"].get("x", []):
        if e.startswith("roster|"):
            out = []
            for item in e[len("roster|"):].split(","):
                if item:
                    pid, civ, ldr, maj, alive = item.split(":")
                    out.append((int(pid), civ, ldr, maj, alive))
            return out
    return []


def args(rec: dict) -> tuple[list[str], list[str]]:
    r = roster(rec)
    majors = [ldr for _, _, ldr, maj, _ in r if maj == "true"]
    minors = [ldr for _, _, ldr, maj, alive in r if maj != "true" and alive == "true" and ldr.startswith("LEADER_MINOR_CIV_")]
    return majors, minors


def main() -> int:
    for path in sys.argv[1:]:
        for ln in pathlib.Path(path).read_text(encoding="utf-8").splitlines():
            rec = json.loads(ln)
            print("==", path, rec["tag"])
            for row in roster(rec):
                print("  ", *row)
            majors, minors = args(rec)
            print(f"  --majors {','.join(majors)} --minors {','.join(minors)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
