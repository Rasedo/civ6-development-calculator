"""#51/S8.2b — are the fixtures on disk the ones this source produces?

Nothing recorded which source built a fixture set, so a stale set read exactly
like an engine divergence. That has cost real time three separate ways:
probe-hygiene rule 5 (stale after a stash/pop), task #58 (two GPU lanes failing
on stale artifacts, not code), and a byte-identity baseline taken mid-repair
this session, which turned the strongest check available into noise.

`scripts/export-gpu.ts` hashes every input that determines the export and
writes it to `rules.json.srcStamp`; this recomputes it the same way. The file
set must be EXACT — under-cover and a change slips through, over-cover and the
check cries wolf until nobody believes it.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def source_stamp() -> str:
    files = sorted(
        (p for p in (ROOT / "src").rglob("*.ts")),
        key=lambda p: str(p.relative_to(ROOT)).replace("\\", "/"),
    )
    files = files + [ROOT / "scripts" / "export-gpu.ts"]
    files.sort(key=lambda p: str(p.relative_to(ROOT)).replace("\\", "/"))
    h = hashlib.sha256()
    for f in files:
        h.update(str(f.relative_to(ROOT)).replace("\\", "/").encode())
        h.update(f.read_bytes())
    return h.hexdigest()


def check(fixtures: Path) -> None:
    """Raise if the fixtures were built from different source than is on disk."""
    rules = json.loads((fixtures / "rules.json").read_text(encoding="utf-8"))
    have = rules.get("srcStamp")
    if have is None:
        raise SystemExit(
            "fixtures carry no srcStamp — re-export "
            "(`npx vite-node scripts/export-gpu.ts`)"
        )
    want = source_stamp()
    if have != want:
        raise SystemExit(
            "STALE FIXTURES: built from different source than is on disk.\n"
            f"  fixtures: {have[:16]}\n  source:   {want[:16]}\n"
            "Re-export before trusting any comparison — a stale set reads "
            "exactly like an engine divergence."
        )
