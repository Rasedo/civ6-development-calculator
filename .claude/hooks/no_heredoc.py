r"""PreToolUse guard: no HEREDOCS, no SLEEP.

Both are owner bans (`sleep` 2026-09-08, heredocs 2026-09-09) and both were
first written as `permissions.deny` globs like `Bash(*<<*)`. Those never
fired: the deny matcher is prefix-shaped, not an arbitrary substring match, so
a rule with a leading `*` silently matches nothing. A ban that does not fire
is worse than no ban, because it is believed.

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
import re
import sys

# `<<` opens a heredoc; `<<<` is a here-STRING and is fine, as is a shift.
HEREDOC = re.compile(r"(?<!<)<<(?!<)-?\s*[\"']?[A-Za-z_][A-Za-z0-9_]*")
PS_HERESTRING = re.compile(r"@[\"']\s*$", re.M)
SLEEP = re.compile(r"(^|[;&|(]\s*)sleep\s+[\d.]|Start-Sleep", re.I)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # never block on a payload we cannot read
    cmd = (payload.get("tool_input") or {}).get("command") or ""
    if HEREDOC.search(cmd) or PS_HERESTRING.search(cmd):
        sys.stderr.write(
            "BLOCKED: heredocs are banned (owner, 2026-09-09). They collapse "
            "backslash escapes silently and break on apostrophes. Write the "
            "script to a file with the Write tool and run `python <path>`; for "
            "a commit message, Write it and use `git commit -F <path>`.\n")
        return 2
    if SLEEP.search(cmd):
        sys.stderr.write(
            "BLOCKED: `sleep` is banned (owner, 2026-09-08). Launch the work "
            "in the background and END THE TURN; act on the completion "
            "notification instead of blocking a slot.\n")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
