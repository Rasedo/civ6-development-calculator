"""#51/S3.1-S3.2: the in-place write discipline that GPU aliasing depends on.

Rounds 3-5 rebind `p_*`/`v_*`/`u_*` and the city planes as VIEWS of one merged
tensor. A view survives `x.add_(y)`. It does NOT survive `self.x = self.x + y`,
which quietly swaps in a fresh tensor and orphans every alias pointing at the
old storage. Nothing in the existing gates can see that: parity and rollout
both pass with orphaned aliases right up until the stage that creates them.

So this lane checks the source, not the behaviour. Two rules, both learned the
hard way in the sweep that introduced them:

RULE 1 - no self-referential rebinding after __init__.
    `self.x = <expr mentioning self.x>` must be an in-place write.
    A LINE-based scan of this is not good enough: the first pass used one and
    silently skipped 8 statements whose self-reference sat on a continuation
    line (the three fortify blocks among them). AST sees the whole statement.

RULE 2 - no stale captures around an in-place write.
    `was = self.x` binds a REFERENCE. Under the old rebinding style the local
    kept the OLD tensor; under an in-place write it sees the NEW value. That
    reversal is silent and it is not hypothetical: `_was = self.civ_age`
    followed by an in-place `civ_age` write made the Dark->Golden Heroic test
    unable to fire, and parity went red on techProg 127625 vs 10625. The fix
    is `.clone()`; this rule keeps it fixed.

Both rules are static and cost milliseconds, which is the point -- they guard
an invariant that only fails much later, in a stage that is expensive to
bisect.
"""

from __future__ import annotations

import ast
import pathlib
import sys

ENGINE = pathlib.Path(__file__).resolve().parent / "civ6gpu" / "engine.py"

IN_PLACE = {
    "copy_", "add_", "sub_", "mul_", "div_", "zero_", "fill_",
    "clamp_", "logical_or_", "logical_and_", "logical_not_",
    "scatter_", "index_copy_", "masked_fill_", "index_fill_",
}

# Attributes that are legitimately rebound because they are not tensors, or are
# rebuilt wholesale rather than mutated. Keep this list SHORT and justified --
# every entry is a plane that can never be aliased.
ALLOWED_REBIND: set[str] = set()


def _self_attr(node: ast.AST) -> str | None:
    """`self.foo` -> "foo", anything else -> None."""
    if (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id == "self"
    ):
        return node.attr
    return None


def _functions(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield node


def rule1_rebinds(tree: ast.AST) -> list[tuple[int, str]]:
    """Self-referential `self.x = ...` outside __init__."""
    bad: list[tuple[int, str]] = []
    for fn in _functions(tree):
        if fn.name == "__init__":
            continue
        for node in ast.walk(fn):
            if not isinstance(node, ast.Assign) or len(node.targets) != 1:
                continue
            name = _self_attr(node.targets[0])
            if name is None or name in ALLOWED_REBIND:
                continue
            if any(_self_attr(sub) == name for sub in ast.walk(node.value)):
                bad.append((node.lineno, name))
    return bad


def rule2_stale_captures(tree: ast.AST) -> list[tuple[int, str, str, int, int]]:
    """`local = self.x` ... in-place write to self.x ... local read again."""
    bad = []
    for fn in _functions(tree):
        captures = [
            (n.lineno, n.targets[0].id, _self_attr(n.value))
            for n in ast.walk(fn)
            if isinstance(n, ast.Assign)
            and len(n.targets) == 1
            and isinstance(n.targets[0], ast.Name)
            and _self_attr(n.value) is not None
        ]
        if not captures:
            continue
        writes: dict[str, list[int]] = {}
        for n in ast.walk(fn):
            if (
                isinstance(n, ast.Call)
                and isinstance(n.func, ast.Attribute)
                and n.func.attr in IN_PLACE
            ):
                owner = _self_attr(n.func.value)
                if owner is not None:
                    writes.setdefault(owner, []).append(n.lineno)
        for cap_line, local, attr in captures:
            for w_line in writes.get(attr, []):
                if w_line <= cap_line:
                    continue
                reads = [
                    x.lineno
                    for x in ast.walk(fn)
                    if isinstance(x, ast.Name)
                    and x.id == local
                    and isinstance(x.ctx, ast.Load)
                    and x.lineno > w_line
                ]
                if reads:
                    bad.append((cap_line, local, attr, w_line, min(reads)))
    return bad


def main() -> int:
    tree = ast.parse(ENGINE.read_text(encoding="utf-8"))

    rebinds = rule1_rebinds(tree)
    stale = rule2_stale_captures(tree)

    for line, name in rebinds:
        print(
            f"REBIND  engine.py:{line}: `self.{name} = <expr using self.{name}>` "
            f"— use an in-place write, or a view of this plane will be orphaned"
        )
    for cap, local, attr, w, r in stale:
        print(
            f"STALE   engine.py:{cap}: `{local} = self.{attr}` is a reference; "
            f"self.{attr} is written in place at line {w} and `{local}` is read "
            f"again at line {r} — it will see the NEW value. Use .clone()."
        )

    if rebinds or stale:
        print(f"\nin-place discipline FAILED — {len(rebinds)} rebind(s), {len(stale)} stale capture(s)")
        return 1

    # Report the scale of what is being guarded, so a silently-empty scan
    # (a refactor that renames the engine, say) reads as suspicious.
    n_inplace = sum(
        1
        for n in ast.walk(tree)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr in IN_PLACE
        and _self_attr(n.func.value) is not None
    )
    print(
        f"in-place discipline OK — {n_inplace} in-place self writes, "
        f"0 self-referential rebinds, 0 stale captures"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
