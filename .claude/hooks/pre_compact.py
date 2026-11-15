"""PreCompact: the instructions for the compaction summary.

Claude Code takes this hook's stdout as the summary's instructions, for a
manual /compact and for an automatic one alike. The text is
.claude/hooks/compact_instructions.md. A hook that fails must never block a
compaction: any error prints nothing and exits 0.
"""
from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    try:
        sys.stdout.write((Path(__file__).with_name("compact_instructions.md")).read_text(encoding="utf-8"))
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
