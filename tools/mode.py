"""The owner's switch for what the battery may do. Owner-only: run it as
`! python tools/mode.py <mode>` from the prompt. A hook refuses it (and any
write to .claude/mode) from the agent's own tool calls.

    python tools/mode.py            # print the current mode
    python tools/mode.py build      # gates off: no battery, no hunt
    python tools/mode.py normal     # the cadence rule decides
    python tools/mode.py measure    # box is free: cadence lifted, runs recorded as clean

The status line shows any mode other than `normal`.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "gpu"))
import battery_live as _live  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print(_live.mode())
        return 0
    m = sys.argv[1].strip().lower()
    if m not in _live.MODES:
        print(f"unknown mode {m!r}; one of {', '.join(_live.MODES)}")
        return 2
    _live.MODE.parent.mkdir(parents=True, exist_ok=True)
    _live.MODE.write_text(m + "\n", encoding="utf-8")
    print(f"mode: {m}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
