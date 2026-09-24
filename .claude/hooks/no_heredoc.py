r"""PreToolUse guard: no HEREDOCS, no SLEEP, no `python -`, no `cd` below a
checkout root (the hooks are root-relative paths; a persisted `cd` breaks
every call after it).

Both are owner bans, and neither fits a `permissions.deny` glob such as
`Bash(*<<*)`: the deny matcher is prefix-shaped, not an arbitrary substring
match, so a rule with a leading `*` silently matches nothing. A ban that does
not fire is worse than no ban, because it is believed.

This reads the command off the hook payload and refuses. Exit 2 blocks the
call and puts stderr in front of the model.

WHY HEREDOCS: a quoted bash heredoc is not byte-transparent here. Backslash
escapes collapse (`\\` + newline arrives as the two characters `\` `n`) and
apostrophes abort the command. Loud in a codemod's match pattern, SILENT in
its replacement — and three times in one session the run that followed then
measured the unfixed tree.

The replacement is the Write tool: write the script (or the commit message) to
a file and run `python <path>` / `git commit -F <path>`.
"""
from __future__ import annotations

import json
import os
import re
import sys

# `<<` opens a heredoc; `<<<` is a here-STRING and is fine, as is a shift.
HEREDOC = re.compile(r"(?<!<)<<(?!<)-?\s*[\"']?[A-Za-z_][A-Za-z0-9_]*")
PS_HERESTRING = re.compile(r"@[\"']\s*$", re.M)
# `cd <dir>` / `Set-Location <dir>` anywhere in the command
CD = re.compile(r"(^|[;&|(]\s*)(?:cd|Set-Location|sl|pushd)\s+(\"[^\"]+\"|'[^']+'|[^\s;&|)]+)", re.I)
# `python -` / `python3 -X utf8 -`: the script on stdin
PY_STDIN = re.compile(r"(^|[;&|(]\s*)python3?(\s+-X\s+\S+)*\s+-(\s|$)")
SLEEP = re.compile(r"(^|[;&|(]\s*)sleep\s+[\d.]|Start-Sleep", re.I)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # never block on a payload we cannot read
    cmd = (payload.get("tool_input") or {}).get("command") or ""
    if HEREDOC.search(cmd) or PS_HERESTRING.search(cmd):
        sys.stderr.write(
            "BLOCKED: heredocs are banned (owner). They collapse "
            "backslash escapes silently and break on apostrophes. Write the "
            "script to a file with the Write tool and run `python <path>`; for "
            "a commit message, Write it and use `git commit -F <path>`.\n")
        return 2
    for m in CD.finditer(cmd):
        target = os.path.expanduser(m.group(2).strip("'\""))
        if re.match(r"^/[a-zA-Z]/", target):  # Git Bash /c/... -> C:/...
            target = target[1] + ":" + target[2:]
        if not os.path.isdir(os.path.join(target, ".claude", "hooks")):
            sys.stderr.write(
                f"BLOCKED: `cd {m.group(2)}` leaves the checkout root. The shell's "
                "directory persists, and every hook is a path relative to the root, "
                "so every later call fails. Name paths instead: `python "
                "tools/x.py runs/y.log`, `ls tools/civ6lab/runs`.\n")
            return 2
    if PY_STDIN.search(cmd):
        sys.stderr.write(
            "BLOCKED: `python -` reads the script from stdin, and with no stdin "
            "it hangs until the tool times out. Write the script to a file and "
            "run `python <path>`.\n")
        return 2
    if SLEEP.search(cmd):
        sys.stderr.write(
            "BLOCKED: `sleep` is banned (owner). Launch the work "
            "in the background and END THE TURN; act on the completion "
            "notification instead of blocking a slot.\n")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
