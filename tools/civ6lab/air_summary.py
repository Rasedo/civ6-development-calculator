"""Summarise `air_preview.lua` records: one line per preview with each block's
ID, strength, modifier, damage and preview texts. Reads JSONL files or stdin.

    python tools/civ6lab/air_summary.py tools/civ6lab/runs/air_patrol_X.jsonl
"""
from __future__ import annotations

import json
import sys


def block(r: dict, name: str) -> str:
    b = r.get(name)
    if not isinstance(b, dict):
        return f"{name}=-"
    bid = b.get("ID", {})
    who = f"{bid.get('player')}:{bid.get('id')}" if isinstance(bid, dict) else "?"
    if isinstance(bid, dict) and bid.get("player", -1) == -1:
        return f"{name}=none"
    texts = []
    for k, v in b.items():
        if k.startswith("PREVIEW_TEXT_") and v:
            texts.append(f"{k[13:]}:{'|'.join(v)}")
    return (f"{name}[{who} {b.get('unit', '')} cs={b.get('COMBAT_STRENGTH')}+{b.get('STRENGTH_MODIFIER')}"
            f" dmgTo={b.get('DAMAGE_TO')} final={b.get('FINAL_DAMAGE_TO')} from={b.get('DAMAGE_FROM')}"
            f" {' '.join(texts)}]")


def main() -> int:
    src = [open(p, encoding="utf-8") for p in sys.argv[1:]] or [sys.stdin]
    for f in src:
        for line in f:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError as e:
                print("UNPARSED", e)
                continue
            if r.get("kind") != "airpreview":
                continue
            if "error" in r:
                print(r.get("tag"), r.get("x"), r.get("y"), "ERROR", r["error"])
                continue
            print(f"{r.get('tag')} {r.get('mode')} {r.get('att')} -> {r.get('x')}:{r.get('y')} | "
                  + " | ".join(block(r, n) for n in ("ATTACKER", "DEFENDER", "INTERCEPTOR", "ANTI_AIR")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
