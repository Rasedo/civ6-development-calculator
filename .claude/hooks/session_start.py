"""SessionStart: the handoff, the owner's mode, and any battery in flight.

Runs on every start (fresh, resume, clear, compact), so a NEW session opens
oriented exactly like a compacted one — which is what makes "one session per
goal" cheaper than compacting a long one.

The handoff is CURRENT STATE, not a log. Past HANDOFF_CAP lines this prints a
warning in front of it: git log carries the history.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "gpu"))
HANDOFF = ROOT / ".claude" / "HANDOFF.md"
HANDOFF_CAP = 120


def main() -> int:
    try:
        import battery_live as live
        mode = live.mode()
        run = live.running()
    except Exception:  # an orientation hook must never block a session
        mode, run = "normal", None
    print(f"=== OWNER MODE: {mode} ===" + {
        "build": "  (gates OFF: no battery, no hunt)",
        "measure": "  (box is free: cadence lifted, runs recorded clean)",
    }.get(mode, "  (the cadence rule decides)"))
    if run:
        age = int(time.time()) - int(run.get("started", 0))
        print(f"=== A BATTERY IS RUNNING: {run.get('kind')} at {run.get('head')}, "
              f"{age // 60}m in, {run.get('done')}/{run.get('total') or '?'} steps, "
              f"{run.get('failed')} failed. Do not start another. ===")
    if not HANDOFF.exists():
        print("No .claude/HANDOFF.md present.")
        return 0
    text = HANDOFF.read_text(encoding="utf-8")
    n = text.count("\n") + 1
    if n > HANDOFF_CAP:
        print(f"=== WARNING: HANDOFF.md is {n} lines (cap {HANDOFF_CAP}). It is CURRENT "
              "STATE, not a log: rewrite it down before adding anything. ===")
    print("=== HANDOFF (.claude/HANDOFF.md) ===")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
