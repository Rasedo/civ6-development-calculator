"""B-24r: print the `prod` rows of a record compactly — per city its
Production, the building lines of the game's tooltip (re-decoded: the tuner
hands UTF-8 text through cp1251), the per-building Production and the
governor.

    python tools/civ6lab/b24g_show.py tools/civ6lab/runs/b24g_prod.jsonl [--tag t5]
"""
from __future__ import annotations

import argparse
import json
import sys


def fix(s: str) -> str:
    # cp1251 leaves 0x98 undefined: those bytes arrive as their own code point
    out = bytearray()
    for ch in s:
        try:
            out += ch.encode("cp1251")
        except UnicodeEncodeError:
            if ord(ch) < 256:
                out.append(ord(ch))
            else:
                return s
    try:
        return out.decode("utf-8")
    except UnicodeDecodeError:
        return s


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("path")
    p.add_argument("--tag")
    a = p.parse_args()
    for ln in open(a.path, encoding="utf-8"):
        r = json.loads(ln)
        if r.get("kind") != "prod" or (a.tag and r.get("tag") != a.tag):
            continue
        for c in r["rows"]:
            tip = fix(str(c.get("tip", ""))).replace("[NEWLINE]", " | ").replace("[ICON_Bullet]", "")
            print(f"{r.get('tag')} t{c.get('turn')} city {c['id']} ({c['x']}:{c['y']}) pop {c['pop']} prod {c['prod']} "
                  f"gov {c.get('gov', '-')}/{c.get('govEst', '-')} bprod {c.get('bprod')}")
            print("      ", tip)
    return 0


if __name__ == "__main__":
    sys.exit(main())
