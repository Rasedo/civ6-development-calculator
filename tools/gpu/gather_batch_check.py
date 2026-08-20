"""A gather whose INDEX is already narrowed to a subset of the batch.

    python tools/gpu/gather_batch_check.py

`torch.gather(input, dim, index)` only requires `index.size(d) <= input.size(d)`
for every `d != dim`. So on a `[B, T]` plane:

    sl = plane.gather(1, tile[sel].unsqueeze(1))     # WRONG

is not a shape error — it silently reads batch rows `0..len(sel)-1` instead of
the rows named by `sel`, and returns a value for the wrong game. It is invisible
to pyright and ruff, and a B=1 run cannot see it either, because there the only
subset is `[0]`. The correct spelling gathers over the whole batch first and
narrows after:

    sl = plane.gather(1, tile.unsqueeze(1)).squeeze(1)[sel]

This is a check on the SPELLING: it flags a `dim >= 1` gather whose index
expression contains a fancy-index by a bare name. A gather that narrows its
index some other way is not matched, so a clean run is evidence about this
pattern, not about the whole class.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROOTS = ("gpu", "policy", "tools")

# `X.gather(dim, idx[sel])` where the caller deliberately drives a 1-D table by
# a per-batch index — dim 0 on a rules vector — is the intended semantic and
# never a batch-axis mistake, so only dim >= 1 is matched.


def _narrowed(node: ast.AST) -> str | None:
    """The first fancy-index-by-bare-name inside an index expression."""
    for sub in ast.walk(node):
        if not isinstance(sub, ast.Subscript):
            continue
        key = sub.slice
        if isinstance(key, ast.Name):
            return f"{ast.unparse(sub.value)}[{key.id}]"
    return None


def main() -> int:
    bad: list[str] = []
    for top in ROOTS:
        for path in sorted((ROOT / top).rglob("*.py")):
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"))
            except SyntaxError as exc:
                print(f"  {path.relative_to(ROOT).as_posix()}: unparseable ({exc})")
                return 1
            for node in ast.walk(tree):
                if not (isinstance(node, ast.Call)
                        and isinstance(node.func, ast.Attribute)
                        and node.func.attr == "gather"
                        and len(node.args) == 2):
                    continue
                dim = node.args[0]
                if not (isinstance(dim, ast.Constant) and isinstance(dim.value, int) and dim.value >= 1):
                    continue
                hit = _narrowed(node.args[1])
                if hit:
                    rel = path.relative_to(ROOT).as_posix()
                    bad.append(f"  {rel}:{node.lineno}  gather(dim={dim.value}, ... {hit} ...)")
    if bad:
        print("NARROW-BATCH GATHER — the index is subset-indexed, so the gather reads")
        print("batch rows 0..n-1 instead of the rows named. Gather over the whole")
        print("batch and narrow the RESULT instead.")
        print("\n".join(bad))
        return 1
    print("GATHER BATCH OK — no dim>=1 gather takes a subset-indexed index")
    return 0


if __name__ == "__main__":
    sys.exit(main())
