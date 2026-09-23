"""THE DECISION SERVER IS PURE: nothing under `policy/` reaches an engine.

The driver decides from the neutral observation (`shared/decide.schema.json`)
and the game's static value alone, so any engine that emits the same value
gets the same decisions. This lane reads every `policy/*.py` as source and
refuses, by AST:

  * the names `sim` and `env` anywhere — as a variable, a parameter or an
    attribute (`x.sim`);
  * an import of `core`, `gpu` or anything under them, and any relative
    import;
  * an attribute, or a `getattr` / `setattr` / `hasattr` string, naming one
    of the engine's mutable planes (`simbase._MUTABLE`) — the torch state of
    an engine object, whatever the object is called.

    $env:PYTHONUTF8='1'; python tests/gpu/drive_purity_test.py
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "gpu"))
from core import simbase  # noqa: E402

BANNED_NAMES = {"sim", "env"}
BANNED_MODULES = ("core", "gpu")


def violations(path: Path, planes: set) -> list:
    """Every refused construct in one source file, as 'file:line: what'."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    out = []

    def bad(node: ast.AST, what: str) -> None:
        out.append(f"{path.relative_to(ROOT)}:{getattr(node, 'lineno', 0)}: {what}")

    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in BANNED_NAMES:
            bad(node, f"names `{node.id}`")
        elif isinstance(node, ast.arg) and node.arg in BANNED_NAMES:
            bad(node, f"takes a parameter `{node.arg}`")
        elif isinstance(node, ast.Attribute):
            if node.attr in BANNED_NAMES:
                bad(node, f"reads `.{node.attr}`")
            elif node.attr in planes:
                bad(node, f"reads the engine plane `.{node.attr}`")
        elif isinstance(node, ast.Import):
            for a in node.names:
                if a.name.split(".")[0] in BANNED_MODULES:
                    bad(node, f"imports `{a.name}`")
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                bad(node, "a relative import")
            elif (node.module or "").split(".")[0] in BANNED_MODULES:
                bad(node, f"imports from `{node.module}`")
        elif (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
              and node.func.id in ("getattr", "setattr", "hasattr") and len(node.args) >= 2
              and isinstance(node.args[1], ast.Constant) and node.args[1].value in planes):
            bad(node, f"{node.func.id}s the engine plane `{node.args[1].value}`")
    return out


def main() -> None:
    planes = set(simbase._MUTABLE)
    assert len(planes) > 100, f"the mutable plane list holds only {len(planes)} names"
    files = sorted((ROOT / "policy").glob("*.py"))
    assert {p.name for p in files} >= {"drive.py", "ladder.py"}, f"policy/ holds {[p.name for p in files]}"
    bad = [v for p in files for v in violations(p, planes)]
    # the checker itself must see what it refuses
    planted = "import core.simbase\nfrom gpu import x\nfrom . import y\n" \
              "def f(sim, st):\n    return env.observe(0), st.city_alive, getattr(st, 'war'), st.sim\n"
    tmp = ROOT / ".claude" / "scratchpad" / "purity_probe.py"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text(planted, encoding="utf-8")
    try:
        seen = violations(tmp, planes | {"war"})
    finally:
        tmp.unlink()
    assert len(seen) == 8, f"the checker saw {len(seen)} of the 8 planted violations: {seen}"
    if bad:
        for v in bad:
            print(v)
        raise SystemExit(f"DRIVE PURITY RED — {len(bad)} engine reads under policy/")
    print(f"DRIVE PURITY OK ({len(files)} files under policy/, {len(planes)} engine planes refused, "
          "no sim, no env, no engine import)")


if __name__ == "__main__":
    main()
