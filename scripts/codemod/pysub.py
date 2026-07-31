"""The Python half of task #56 — a safe `sub()` for gpu/civ6gpu/engine.py.

ts-morph cannot touch a 16k-line PyTorch file, and 128 of the 163 codemod edit
sites in one round's scratchpad were in that file. So the TS harness fixes the
smaller half of the problem; this fixes the rest, and it fixes THE INCIDENT
specifically rather than trying to be an AST tool.

WHAT WENT WRONG WITH THE OLD HELPER. Scripts that edit engine.py hold the whole
file in a string and write once at the end:

    def sub(old, new, want=1):
        global s
        c = s.count(old); assert c == want
        s = s.replace(old, new); print(f'  x{c} ...')     # <-- prints APPLIED
    ...
    open(p, 'w').write(s)                                 # <-- may never run

A later anchor missed on a non-ASCII arrow, the assert raised, the file was
never written — but every earlier edit had already printed as applied. A
10-minute parity gate then failed on a bug whose fix was not on disk.

THE FIX IS THE SAME CONTRACT AS THE TS HARNESS:
  * staging and printing say PLAN, never "applied";
  * the word APPLIED is printed by `commit()`, after write + read-back + compare;
  * dry-run is the DEFAULT (`--apply` writes);
  * an anchor miss reports the CODEPOINT where it diverges, so `↔` vs `<->`
    is a one-line read instead of `assert 0 != 1`;
  * bytes in, bytes out — the old helper read in text mode and wrote with
    newline='', silently rewriting this repo's CRLF files to LF.

USAGE

    import sys; sys.path.insert(0, 'scripts/codemod')
    from pysub import Mod

    with Mod('s71-downstream') as m:
        e = m.file('gpu/civ6gpu/engine.py')
        e.sub('is_pmil', 'is_vet_mil', want=6)
        e.sub(OLD_BLOCK, NEW_BLOCK)

    .venv/Scripts/python .claude/scratchpad/s71_downstream.py            # dry run
    .venv/Scripts/python .claude/scratchpad/s71_downstream.py --apply --check
"""

from __future__ import annotations

import difflib
import os
import py_compile
import re
import subprocess
import sys
import tempfile
import time

REPO = os.environ.get("CODEMOD_ROOT") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
APPLY = "--apply" in sys.argv
CHECK = "--check" in sys.argv          # py_compile + ruff F-rules on touched files
SHOW_DIFF = "--no-diff" not in sys.argv


for _stream in (sys.stdout, sys.stderr):  # the miss report prints codepoints
    try:
        _stream.reconfigure(encoding="utf-8")
    except AttributeError:
        pass


class CodemodError(Exception):
    """A codemod that refused to run. Raised BEFORE any byte is written."""


def _nearest_miss(hay: str, needle: str) -> str:
    """Why an exact anchor did not match, at CODEPOINT resolution."""
    first = needle.strip().splitlines()[0].strip() if needle.strip() else ""
    if not first:
        return "    (empty anchor)"
    best, best_score = -1, 0
    for i, line in enumerate(hay.splitlines()):
        line = line.strip()
        k = 0
        while k < len(line) and k < len(first) and line[k] == first[k]:
            k += 1
        if k > best_score:
            best, best_score = i, k
    if best < 0 or best_score < 8:
        return "    (no similar line in file)"
    got = hay.splitlines()[best].strip()
    at = best_score

    def cp(s: str, i: int) -> str:
        return f"U+{ord(s[i]):04X} {s[i]!r}" if i < len(s) else "<end of line>"

    return "\n".join(
        [
            f"    closest is line {best + 1}, identical for {at} chars, then:",
            f"      anchor has {cp(first, at)}",
            f"      file   has {cp(got, at)}",
            f"      ...{first[max(0, at - 24):at + 24]}   <- anchor",
            f"      ...{got[max(0, at - 24):at + 24]}   <- file",
        ]
    )


class Src:
    """One file under edit. Text is staged in memory; nothing reaches disk."""

    def __init__(self, mod: "Mod", rel: str) -> None:
        self.mod = mod
        self.rel = rel.replace("\\", "/")
        self.abs = os.path.join(REPO, rel)
        with open(self.abs, "rb") as fh:
            raw = fh.read()
        self.before = raw.decode("utf-8")
        self.text = self.before
        self.crlf = raw.count(b"\r\n") > raw.count(b"\n") // 2
        self.ops = 0

    def _plan(self, what: str, n: int) -> None:
        self.ops += n
        print(f"  PLAN x{n}  {self.rel}  {what}")

    def sub(self, old: str, new: str, want: int = 1) -> "Src":
        """Literal replacement, count-asserted. Raises before any write."""
        got = self.text.count(old)
        if got != want:
            head = old.strip().splitlines()[0][:70] if old.strip() else "<empty>"
            extra = "\n" + _nearest_miss(self.text, old) if got == 0 else ""
            raise CodemodError(f"{self.rel}: {head}\n    expected {want} site(s), found {got}{extra}")
        self.text = self.text.replace(old, new)
        self._plan(repr(old.strip().splitlines()[0][:48]), got)
        return self

    def sub_re(self, pattern: str, repl: str, want: int) -> "Src":
        """Regex replacement, count-asserted. `want` is mandatory: a regex with
        an unstated site count is how a codemod edits a place nobody read."""
        got = len(re.findall(pattern, self.text))
        if got != want:
            raise CodemodError(f"{self.rel}: /{pattern}/\n    expected {want} site(s), found {got}")
        self.text = re.sub(pattern, repl, self.text)
        self._plan(f"/{pattern}/", got)
        return self

    def insert_after(self, anchor: str, text: str, want: int = 1) -> "Src":
        """Insert after the LINE containing `anchor` (indentation preserved)."""
        return self.sub(anchor, anchor + text, want=want)

    def bytes_out(self) -> bytes:
        body = self.text.replace("\r\n", "\n")
        if self.crlf:
            body = body.replace("\n", "\r\n")
        return body.encode("utf-8")


class Mod:
    """Stage every edit, then commit ALL files or NONE."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.files: dict[str, Src] = {}
        print(f"[{name}] {'APPLY' if APPLY else 'DRY RUN'}{' +check' if CHECK else ''}")

    def file(self, rel: str) -> Src:
        if rel not in self.files:
            self.files[rel] = Src(self, rel)
        return self.files[rel]

    def __enter__(self) -> "Mod":
        return self

    def _refuse(self, exc: BaseException) -> None:
        sys.stdout.flush()
        print(f"\n[{self.name}] REFUSED — no file was modified.\n  {exc}\n", file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc_type is CodemodError:
            self._refuse(exc)
        if exc_type is not None:
            return False
        try:
            self.commit()
        except CodemodError as e:  # a gate or a rollback — never a stack trace
            self._refuse(e)
        return False

    def commit(self) -> None:
        pending = [s for s in self.files.values() if s.bytes_out() != s.before.encode("utf-8")]
        if not pending:
            print(f"\n[{self.name}] NOTHING TO DO — no file text changed.")
            return

        if SHOW_DIFF:
            for s in pending:
                print(
                    "\n"
                    + "".join(
                        difflib.unified_diff(
                            s.before.splitlines(keepends=True),
                            s.text.splitlines(keepends=True),
                            s.rel,
                            s.rel,
                            n=3,
                        )
                    )
                )

        if CHECK:
            self._check(pending)

        if not APPLY:
            print(
                f"\n[{self.name}] DRY RUN — {len(pending)} file(s) would change, "
                f"{sum(s.ops for s in pending)} op(s)."
                f"\n[{self.name}] NOTHING WAS WRITTEN. Re-run with --apply."
            )
            return

        backup = os.path.join(REPO, ".claude", "scratchpad", "codemod-backups", f"{self.name}-{int(time.time())}")
        os.makedirs(backup, exist_ok=True)
        for s in pending:
            with open(os.path.join(backup, s.rel.replace("/", "__")), "wb") as fh:
                fh.write(s.before.encode("utf-8"))

        def restore(why: str) -> None:
            for s in pending:
                with open(s.abs, "wb") as fh:
                    fh.write(s.before.encode("utf-8"))
            raise CodemodError(f"{why}\n    ROLLED BACK {len(pending)} file(s); originals also in {backup}")

        wrote = 0
        try:
            for s in pending:
                fd, tmp = tempfile.mkstemp(dir=os.path.dirname(s.abs), suffix=".codemod-tmp")
                with os.fdopen(fd, "wb") as fh:
                    fh.write(s.bytes_out())
                    fh.flush()
                    os.fsync(fh.fileno())
                os.replace(tmp, s.abs)
                wrote += 1
        except OSError as e:
            restore(f"WRITE FAILED after {wrote}/{len(pending)} file(s): {e}")

        # The step that makes "applied" mean applied.
        for s in pending:
            with open(s.abs, "rb") as fh:
                on_disk = fh.read()
            if on_disk != s.bytes_out():
                restore(f"READ-BACK MISMATCH in {s.rel} ({len(on_disk)} bytes on disk, {len(s.bytes_out())} planned)")

        print(f"\n[{self.name}] APPLIED — {len(pending)} file(s), {sum(s.ops for s in pending)} op(s), verified on disk:")
        for s in pending:
            print(f"    {s.rel}")
        print(f"[{self.name}] originals: {os.path.relpath(backup, REPO)}")

    def _check(self, pending: list[Src]) -> None:
        """Syntax + undefined-name check on the STAGED text, before any write.

        This is what replaces a ts-morph parser for Python: it will not catch a
        wrong tensor shape, but it does catch the two things a text codemod on
        engine.py actually breaks — a mangled block (IndentationError) and a
        name the edit forgot to define (ruff F821). Both otherwise surface ten
        minutes later as a gate failure.
        """
        tmpdir = tempfile.mkdtemp(prefix="codemod-check-")
        staged = []
        for s in pending:
            if not s.rel.endswith(".py"):
                continue
            p = os.path.join(tmpdir, s.rel.replace("/", "__"))
            with open(p, "wb") as fh:
                fh.write(s.bytes_out())
            staged.append((s, p))
        for s, p in staged:
            try:
                py_compile.compile(p, cfile=os.path.join(tmpdir, "x.pyc"), doraise=True)
            except py_compile.PyCompileError as e:
                raise CodemodError(f"{s.rel} does not parse. NOTHING WRITTEN.\n    {e}") from None
        if not staged:
            return
        # ruff lives in the HARNESS's repo, not in CODEMOD_ROOT (which may be a
        # bare scratch tree). A missing ruff FAILS the run: a safety gate that
        # silently skips is worse than no gate, because the log says +check.
        home = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        ruff = os.path.join(home, ".venv", "Scripts", "ruff.exe")
        if not os.path.exists(ruff):
            ruff = os.path.join(home, ".venv", "bin", "ruff")
        if not os.path.exists(ruff):
            raise CodemodError("--check asked for ruff and it is not in .venv. NOTHING WRITTEN.")
        r = subprocess.run(
            # Syntax is py_compile's job above; these are the NAME errors a text
            # codemod actually introduces (a symbol it forgot to define/import,
            # a def it duplicated, an import whose last use it just deleted).
            [ruff, "check", "--isolated", "--select", "F821,F811,F401", "--no-cache", *[p for _, p in staged]],
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            names = {os.path.basename(p): s.rel for s, p in staged}
            out = r.stdout
            for tmpname, rel in names.items():
                out = out.replace(tmpname, rel)
            raise CodemodError(f"ruff F-rules failed on the STAGED text. NOTHING WRITTEN.\n{out}{r.stderr}")
