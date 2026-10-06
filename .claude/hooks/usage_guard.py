"""The plan's usage windows, for the agent.

The status line (~/.claude/statusline.sh) writes the rate-limit windows
Claude Code hands it to ~/.claude/rate_limits.txt on every render:
"<window> <used %> <resets_at>" per line, then "at <epoch>".

UserPromptSubmit: print one usage line, which Claude Code adds to the
prompt's context, so the agent always knows how much of the 5-hour and
7-day windows is spent.
PreToolUse on Agent: refuse to start a new subagent once the 5-hour window
is at GUARD_5H % or the 7-day window at GUARD_7D % — the agents already
running finish, nothing new starts a job the limit would cut in half.
A missing or unreadable file never blocks anything.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys
import time

FILE = pathlib.Path.home() / ".claude" / "rate_limits.txt"
GUARD_5H = 90
GUARD_7D = 95
STALE_S = 30 * 60


def read() -> tuple[dict, float | None]:
    windows: dict = {}
    at = None
    try:
        for ln in FILE.read_text(encoding="utf-8").splitlines():
            parts = ln.split()
            if len(parts) >= 2 and parts[0] == "at":
                at = float(parts[1])
            elif len(parts) >= 2:
                windows[parts[0]] = (int(parts[1]), parts[2] if len(parts) > 2 else "")
    except (OSError, ValueError):
        return {}, None
    return windows, at


def resets_in(stamp: str) -> str:
    """The countdown to a window's reset, given as an ISO time or an epoch."""
    try:
        t = float(stamp)
    except ValueError:
        try:
            t = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return ""
    left = int(t - time.time())
    if left <= 0:
        return ""
    h, m = divmod(left // 60, 60)
    return f", resets in {h}h{m:02d}m" if h else f", resets in {m}m"


def line(windows: dict, at: float | None) -> str:
    names = {"five_hour": "5-hour", "seven_day": "7-day"}
    parts = [f"{names.get(k, k)} {p}%{resets_in(r)}" for k, (p, r) in windows.items()]
    stale = at is not None and time.time() - at > STALE_S
    age = f" (read {int((time.time() - at) // 60)} min ago)" if stale else ""
    return "Plan usage: " + "; ".join(parts) + age


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    windows, at = read()
    if not windows:
        return 0
    name = event.get("hook_event_name")
    if name == "UserPromptSubmit":
        print(line(windows, at))
        return 0
    if name == "PreToolUse" and event.get("tool_name") == "Agent":
        p5 = windows.get("five_hour", (0, ""))[0]
        p7 = windows.get("seven_day", (0, ""))[0]
        if p5 >= GUARD_5H or p7 >= GUARD_7D:
            why = (f"{line(windows, at)}. A new subagent now would likely be cut off by the usage "
                   f"limit mid-task: let the running agents finish, and start it after the window "
                   f"resets (or when the owner says to anyway).")
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                                     "permissionDecision": "deny",
                                                     "permissionDecisionReason": why}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
