r"""PreToolUse guard: the OWNER's switch is the owner's.

`.claude/mode` decides whether batteries may run (tools/gpu/battery_live.py).
It is only worth anything if the agent cannot flip it: a test ban the agent
can lift itself is a suggestion. The owner sets it with
`! python tools/mode.py <mode>`, which runs outside the tool hooks.

Blocks: Write/Edit of `.claude/mode`, and any shell command that runs
`tools/mode.py` with an argument or names `.claude/mode` beside a write verb.
"""
from __future__ import annotations

import json
import re
import sys

PATH = re.compile(r"\.claude[\\/]+mode\b(?![\\/.\w])", re.I)
MODE_SET = re.compile(r"tools[\\/]+mode\.py\s+\w", re.I)
# a redirect INTO the path (`2>/dev/null` elsewhere in a read is fine), or a
# command that writes, copies, moves or deletes
REDIRECT_INTO = re.compile(r">>?\s*[\"']?[^\s\"'|;&]*\.claude[\\/]+mode\b", re.I)
WRITE_VERB = re.compile(r"\b(Set-Content|Out-File|Add-Content|New-Item|Copy-Item|Move-Item|"
                        r"Remove-Item|tee|cp|mv|rm|write_text|open\()", re.I)
MSG = ("BLOCKED: .claude/mode is the OWNER's switch (build / normal / measure). "
       "Ask the owner; they set it with `! python tools/mode.py <mode>`.\n")


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    inp = payload.get("tool_input") or {}
    path = str(inp.get("file_path") or "")
    if payload.get("tool_name") in ("Write", "Edit") and re.search(r"\.claude[\\/]+mode$", path, re.I):
        sys.stderr.write(MSG)
        return 2
    cmd = str(inp.get("command") or "")
    if cmd and (MODE_SET.search(cmd) or REDIRECT_INTO.search(cmd)
                or (PATH.search(cmd) and WRITE_VERB.search(cmd))):
        sys.stderr.write(MSG)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
