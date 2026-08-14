# -*- coding: utf-8 -*-
"""STATIC seat-symmetry + attribute-resolution check for the GPU engine.

Four things the compile bar cannot see, because `BatchSim`'s namespace is
built by `setattr` in a loop and there is no `__getattr__` fallback:

1. A DANGLING ATTRIBUTE. `self.C` was deleted when every seat row got one
   city-column width; three `sim.C` reads survived in the driver and would
   have raised AttributeError on the serve gate's first turn. pyright cannot
   resolve a setattr-built namespace and ruff only sees locals.

2. THE ALIAS/_MUTABLE CONTRACT. A registered alias is a VIEW; snapshot and
   restore must round-trip its BASE and never the view (a view restored
   beside its base is copied twice, and a rebind would orphan it).

3. A SHADOWED METHOD. `self.x = <tensor>` in the constructor and `def x` on a
   mixin are the same attribute; the instance binding wins, so every
   `self.x(...)` call is a TypeError and every `self.x[...]` read on the
   method is one too. Two mixin files never mention each other, so nothing
   short of running the engine notices.

4. THE SEAT-0 FORK CENSUS. Every `row == 0` / `seat == 0` / `row - 1` style
   branch in the engine is either a WIRE limit with a name, or work that has
   not been done. The allowlist below names every survivor; anything else
   fails, so a new fork cannot arrive quietly.

Read-only, imports nothing from the engine. Run it in the compile bar:

    python tools/gpu/seat_symmetry_check.py
"""
from __future__ import annotations

import ast
import pathlib
import re
import sys

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z_0-9]*$")

ROOT = pathlib.Path(__file__).resolve().parents[2]
CORE = ROOT / "gpu" / "core"
READERS = ("gpu", "policy", "tests/gpu", "tools/gpu")

# ---------------------------------------------------------------------------
# THE FORK ALLOWLIST — (module, enclosing function, why).
#
# Anything matching the fork patterns outside this list is a failure. Shrink
# the list, never grow it: an entry here is a seat-0 distinction that still
# exists, and the only acceptable reasons are the wire's own limits.
# ---------------------------------------------------------------------------
FORK_ALLOW = {
    # --- PERMANENT: the two index spaces have to meet somewhere ------------
    ("simbase.py", "seat_of_index"): "the row->seat map itself",
    # --- WIRE LIMITS, named ------------------------------------------------
    ("env.py", "step"): "#108 — row 0's action interface + unit-order replay position",
    # --- BURN-DOWN (AUDIT A-32r). Delete the entry that closes the fork. ----
    # The civ-PAIR planes (denounce / ally / warkind / strengths / proximity)
    # have no seat-0 row, so civ<->civ diplomacy is still a space seat 0
    # cannot enter — and it is a SECOND way to declare war beside the war
    # head. `apply_geo` and `_extract_geo` are where the row space and the
    # civ-pair space meet, and nowhere else. Closing A-32r closes all six.
    ("sim_seats.py", "_civ_pair_strengths"): "A-32r — civ-pair planes have no seat-0 row",
    ("sim_seats.py", "apply_geo"): "A-32r — the ONE row->civ-pair conversion",
    ("sim_economy.py", "_ww_era_base"): "A-32r — civ_pair_warkind has no seat-0 row",
    ("drive.py", "_geo_turn"): "A-32r — civ-pair planes have no seat-0 row",
    ("drive.py", "geo_decide_and_apply"): "A-32r — civ-pair planes have no seat-0 row",
    ("drive.py", "_extract_geo"): "A-32r — the record's civ-pair targets",
}

FORK_PATTERNS = (
    (re.compile(r"\brow\s*[=!]=\s*0\b"), "row == 0"),
    (re.compile(r"\bseat\s*[=!]=\s*0\b"), "seat == 0"),
    (re.compile(r"\brow\s*(?:>\s*0|>=\s*1)\b"), "row > 0"),
    (re.compile(r"\bseat\s*(?:>\s*0|>=\s*1)\b"), "seat > 0"),
    (re.compile(r"\brow\s*-\s*1\b"), "row - 1"),
    (re.compile(r"\bseat\s*-\s*1\b"), "seat - 1"),
    (re.compile(r"\br\s*\+\s*1\b"), "r + 1"),
)


def _funcs_by_line(tree: ast.AST) -> dict[int, str]:
    """line -> innermost enclosing def name."""
    out: dict[int, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            end = getattr(node, "end_lineno", node.lineno)
            for ln in range(node.lineno, end + 1):
                prev = out.get(ln)
                if prev is None or len(node.name) >= 0:
                    out[ln] = node.name
    return out


# ---------------------------------------------------------------------------
# 1. attribute resolution
# ---------------------------------------------------------------------------
def _string_literals(tree: ast.AST) -> set[str]:
    return {n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str)}


def _fstring_shapes(node: ast.JoinedStr) -> str | None:
    """`f"civ_{k}"` -> "civ_{}"; None when a literal part is missing."""
    parts = []
    for v in node.values:
        if isinstance(v, ast.Constant) and isinstance(v.value, str):
            parts.append(v.value)
        elif isinstance(v, ast.FormattedValue):
            parts.append("{}")
        else:
            return None
    return "".join(parts)


def _soft_literal(node: ast.AST):
    """literal_eval that tolerates non-literal cells.

    The seat-plane tables mix names with dtypes (`("alive", "alive",
    "civ_city_alive", torch.bool, ...)`), so a strict literal_eval refuses the
    whole table and the names it holds go unresolved. Non-literal cells become
    None; the string cells — the only ones that name an attribute — survive."""
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, (ast.Tuple, ast.List)):
        return [_soft_literal(e) for e in node.elts]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        v = _soft_literal(node.operand)
        return -v if isinstance(v, (int, float)) else None
    return None


def _class_tables(tree: ast.AST) -> dict[str, object]:
    """Class- and module-level literal tables, by name — the seat-plane
    tables (`_CIV_PAIR_FIELDS`, `_CS_PAIR_FIELDS`, …) a `for` unpacks."""
    out: dict[str, object] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            t = node.targets[0]
            nm = t.id if isinstance(t, ast.Name) else (t.attr if isinstance(t, ast.Attribute) else None)
            if nm is None:
                continue
            v = _soft_literal(node.value)
            if isinstance(v, list):
                out[nm] = v
    return out


def _loop_bound_strings(var: str, loops: list[ast.For], tables: dict[str, object]) -> set[str]:
    """Every string `var` can take, over the enclosing `for` statements whose
    iterable is a literal table. Empty when nothing resolves."""
    got: set[str] = set()
    for lp in loops:
        # which position in the loop target is `var`?
        tgt = lp.target
        names = [e.id for e in tgt.elts if isinstance(e, ast.Name)] if isinstance(tgt, ast.Tuple) else (
            [tgt.id] if isinstance(tgt, ast.Name) else [])
        if var not in names:
            continue
        pos = names.index(var)
        it = lp.iter
        rows: object = _soft_literal(it)
        if not isinstance(rows, list):
            key = it.attr if isinstance(it, ast.Attribute) else (it.id if isinstance(it, ast.Name) else None)
            if key is not None:
                rows = tables.get(key)
        if not isinstance(rows, (list, tuple)):
            continue
        for row in rows:
            if isinstance(row, (list, tuple)) and pos < len(row):
                v = row[pos]
            elif not isinstance(row, (list, tuple)) and pos == 0:
                v = row
            else:
                continue
            if isinstance(v, str):
                got.add(v)
    return got


def enclosing_for(scope: ast.AST, node: ast.AST) -> list[ast.For]:
    """The `for` statements wrapping `node` inside `scope`, innermost first."""
    parent: dict[int, ast.AST] = {}
    for p in ast.walk(scope):
        for c in ast.iter_child_nodes(p):
            parent[id(c)] = p
    out, cur = [], parent.get(id(node))
    while cur is not None:
        if isinstance(cur, ast.For):
            out.append(cur)
        cur = parent.get(id(cur))
    return out


def defined_attrs() -> tuple[set[str], list[str], set[str]]:
    """(exact names, f-string shapes, alias names) BatchSim binds on `self`."""
    names: set[str] = set()
    shapes: list[str] = []
    aliases: set[str] = set()
    for path in sorted(CORE.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        lits = _string_literals(tree)
        tables = _class_tables(tree)
        parent: dict[int, ast.AST] = {}
        for p in ast.walk(tree):
            for c in ast.iter_child_nodes(p):
                parent[id(c)] = p

        def enclosing_loops(n: ast.AST) -> list[ast.For]:
            out, cur = [], parent.get(id(n))
            while cur is not None:
                if isinstance(cur, ast.For):
                    out.append(cur)
                cur = parent.get(id(cur))
            return out

        def bind(a: ast.expr, at: ast.AST, into: set[str] | None = None) -> None:
            """Record whatever attribute name(s) `a` can be."""
            sink = names if into is None else into
            if isinstance(a, ast.Constant) and isinstance(a.value, str):
                sink.add(a.value)
                return
            if isinstance(a, ast.Name):
                got = _loop_bound_strings(a.id, enclosing_loops(at), tables)
                if got:
                    sink.update(got)
                else:  # unresolvable — accept everything rather than lie
                    shapes.append("{}")
                return
            if isinstance(a, ast.JoinedStr):
                sh = _fstring_shapes(a)
                if not sh:
                    shapes.append("{}")
                    return
                pre, _, suf = sh.partition("{}")
                slot = next((v.value for v in a.values
                             if isinstance(v, ast.FormattedValue)), None)
                got = (_loop_bound_strings(slot.id, enclosing_loops(at), tables)
                       if isinstance(slot, ast.Name) else set())
                if sh.count("{}") != 1:
                    shapes.append(sh)  # multi-slot: only the regex, never a guess
                elif got:
                    sink.update(f"{pre}{g}{suf}" for g in got)
                else:  # unresolved single slot — the shape plus identifier-ish literals
                    shapes.append(sh)
                    sink.update(f"{pre}{lit}{suf}" for lit in lits if _IDENT.match(lit))
                return
            shapes.append("{}")

        for node in ast.walk(tree):
            # self.x = ... / self.x: T = ... / self.x, self.y = ...
            targets: list[ast.expr] = []
            if isinstance(node, ast.Assign):
                targets = list(node.targets)
            elif isinstance(node, (ast.AnnAssign, ast.AugAssign)):
                targets = [node.target]
            for t in targets:
                for sub in ([t] if not isinstance(t, (ast.Tuple, ast.List)) else t.elts):
                    if (isinstance(sub, ast.Attribute) and isinstance(sub.value, ast.Name)
                            and sub.value.id == "self"):
                        names.add(sub.attr)
            # setattr(self, <name>, ...)
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                    and node.func.id == "setattr" and len(node.args) >= 2
                    and isinstance(node.args[0], ast.Name) and node.args[0].id == "self"):
                bind(node.args[1], node)
            # register_alias("x", ...) / register_alias(f"civ_only_{k}", ...)
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr == "register_alias" and node.args):
                bind(node.args[0], node, into=aliases)
                bind(node.args[0], node)
            # properties and plain methods are attributes too
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                names.add(node.name)
            if isinstance(node, ast.ClassDef):
                for st in node.body:
                    if isinstance(st, ast.Assign):
                        for t2 in st.targets:
                            if isinstance(t2, ast.Name):
                                names.add(t2.id)
                    elif isinstance(st, ast.AnnAssign) and isinstance(st.target, ast.Name):
                        names.add(st.target.id)
    return names, shapes, aliases


#: receivers that ARE the sim in this codebase. `self` inside gpu/core is the
#: sim; the pokes build several at once and name them `sim`, `s`, `s2`, `sim3`.
SIM_RX = re.compile(r"^(?:self|sim[a-z_0-9]*|s[0-9]*)$")
SIM_RECEIVERS = ("sim", "s", "self")
#: what a call has to be NAMED to count as building a sim.
_SIM_CTOR = re.compile(r"(?i)^(batchsim|build|make_sim|new_sim|_build)$")


def _callee(call: ast.Call) -> str:
    f = call.func
    if isinstance(f, ast.Name):
        return f.id
    if isinstance(f, ast.Attribute):
        return f.attr
    return ""

READER_SKIP_FILES = {"rng.py"}


def _reader_files() -> list[pathlib.Path]:
    out: list[pathlib.Path] = []
    for base in READERS:
        d = ROOT / base
        if not d.exists():
            continue
        out += [p for p in sorted(d.rglob("*.py"))
                if p.name not in READER_SKIP_FILES and "__pycache__" not in p.parts]
    return out


def _sim_bound_locals(fn: ast.AST) -> set[str]:
    """Locals in `fn` bound from a sim — `s = self.sim`, `sim = env.sim`.

    Without this, `s.clamp()` on a local TENSOR called `s` reads as a sim
    attribute and every tensor method looks dangling."""
    out: set[str] = set()
    for n in ast.walk(fn):
        if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name):
            v = n.value
            if isinstance(v, ast.Attribute) and v.attr == "sim":
                out.add(n.targets[0].id)
        elif isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Tuple):
            pass
    if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
        for arg in list(fn.args.args) + list(fn.args.kwonlyargs):
            if arg.arg in ("sim", "self"):
                out.add(arg.arg)
    return out


def external_binds() -> set[str]:
    """Attributes bound on the sim from OUTSIDE gpu/core — the driver's
    per-turn scratch (`sim._vplan_wt`, `sim._driven_useq`) and the discipline
    test's synthetic base. They are real attributes; they just are not
    allocated in the constructor."""
    out: set[str] = set()
    for path in _reader_files():
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            tg: list[ast.expr] = []
            if isinstance(node, ast.Assign):
                tg = list(node.targets)
            elif isinstance(node, (ast.AnnAssign, ast.AugAssign)):
                tg = [node.target]
            for t in tg:
                for sub in ([t] if not isinstance(t, (ast.Tuple, ast.List)) else t.elts):
                    if (isinstance(sub, ast.Attribute) and isinstance(sub.value, ast.Name)
                            and SIM_RX.match(sub.value.id)):
                        out.add(sub.attr)
    return out


def unresolved_reads(known: set[str], shapes: list[str]) -> list[tuple[str, int, str]]:
    shape_res = [re.compile("^" + re.escape(sh).replace(r"\{\}", r"[A-Za-z_0-9]+") + "$")
                 for sh in shapes]
    bad: list[tuple[str, int, str]] = []
    for path in _reader_files():
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        in_core = path.parent == CORE
        scopes: list[ast.AST] = [n for n in ast.walk(tree)
                                 if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))] + [tree]
        for fn in scopes:
            recv = _sim_bound_locals(fn)
            if in_core:
                recv.add("self")
            recv.add("sim")
            # the pokes build several sims at once (`s2`, `sim3`, `simr`);
            # only a CONSTRUCTOR call binds one, or `s = x.clamp(...)` would
            # make every tensor method look like a dangling sim attribute.
            recv |= {n.targets[0].id for n in ast.walk(fn)
                     if isinstance(n, ast.Assign) and len(n.targets) == 1
                     and isinstance(n.targets[0], ast.Name)
                     and SIM_RX.match(n.targets[0].id)
                     and isinstance(n.value, ast.Call)
                     and _SIM_CTOR.match(_callee(n.value))}
            body = fn.body if isinstance(fn, ast.Module) else fn.body
            for node in [x for b in body for x in ast.walk(b)]:
                if not (isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name)):
                    continue
                if node.value.id not in recv:
                    continue
                a = node.attr
                if a in known or a.startswith("__"):
                    continue
                if any(rx.match(a) for rx in shape_res):
                    continue
                hit = (str(path.relative_to(ROOT)), node.lineno, f"{node.value.id}.{a}")
                if hit not in bad:
                    bad.append(hit)
            # `getattr(self, "x")` and `for name in ("a", "b"): getattr(self,
            # name)` read attributes the dotted scan cannot see — which is how
            # two planes deleted by the alias purge kept a live reader.
            for node in [x for b in body for x in ast.walk(b)]:
                if not (isinstance(node, ast.Call) and _callee(node) == "getattr"):
                    continue
                if not (node.args and isinstance(node.args[0], ast.Name) and node.args[0].id in recv):
                    continue
                if len(node.args) > 2:
                    continue  # a default makes the read total
                names: set[str] = set()
                key = node.args[1] if len(node.args) > 1 else None
                if isinstance(key, ast.Constant) and isinstance(key.value, str):
                    names.add(key.value)
                elif isinstance(key, ast.Name):
                    names |= _loop_bound_strings(key.id, enclosing_for(fn, node), {})
                for a in names:
                    if a in known or a.startswith("__") or any(rx.match(a) for rx in shape_res):
                        continue
                    hit = (str(path.relative_to(ROOT)), node.lineno, f"getattr(…, {a!r})")
                    if hit not in bad:
                        bad.append(hit)
    return sorted(set(bad))


# ---------------------------------------------------------------------------
# 2. the alias / _MUTABLE contract
# ---------------------------------------------------------------------------
def mutable_names() -> set[str]:
    src = (CORE / "simbase.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == "_MUTABLE":
                    return {v.value for v in ast.walk(node.value)
                            if isinstance(v, ast.Constant) and isinstance(v.value, str)}
    return set()


# ---------------------------------------------------------------------------
# 3. the shadowed-method check
# ---------------------------------------------------------------------------
def shadowed_methods() -> list[tuple[str, str, str, int]]:
    """Names bound as DATA on `self` that are also a `def` in gpu/core.

    The instance binding wins over the class attribute, so the method is
    unreachable from that point on and every call site raises. This is how
    `self._seat_row = <seat->row tensor>` silently killed `_seat_row(row)`,
    the seat-loop body, in the same round that unified it.

    Returns (name, the file that defines it, the file that binds it, line)."""
    defs: dict[str, str] = {}
    binds: dict[str, tuple[str, int]] = {}
    for path in sorted(CORE.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        rel = path.name
        for cls in [n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]:
            for st in cls.body:
                if isinstance(st, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    defs.setdefault(st.name, rel)
        for node in ast.walk(tree):
            targets: list[ast.expr] = []
            if isinstance(node, ast.Assign):
                targets = list(node.targets)
            elif isinstance(node, ast.AnnAssign):
                targets = [node.target]
            for t in targets:
                for sub in ([t] if not isinstance(t, (ast.Tuple, ast.List)) else t.elts):
                    if (isinstance(sub, ast.Attribute) and isinstance(sub.value, ast.Name)
                            and sub.value.id == "self"):
                        binds.setdefault(sub.attr, (rel, sub.lineno))
    return sorted((n, defs[n], binds[n][0], binds[n][1]) for n in set(defs) & set(binds))


# ---------------------------------------------------------------------------
# 4. the fork census
# ---------------------------------------------------------------------------
def _code_lines(src: str) -> dict[int, str]:
    """line -> its CODE text, strings and comments blanked out.

    Comments and docstrings are prose about seats and are full of `r+1 = civ
    r`; scanning them turns the census into noise. tokenize is exact where a
    `#`-split is not."""
    import io
    import tokenize

    lines = src.splitlines()
    out = {i: ln for i, ln in enumerate(lines, 1)}
    try:
        toks = list(tokenize.generate_tokens(io.StringIO(src).readline))
    except (tokenize.TokenError, IndentationError):
        return out
    for tok in toks:
        if tok.type not in (tokenize.STRING, tokenize.COMMENT):
            continue
        (r1, c1), (r2, c2) = tok.start, tok.end
        for r in range(r1, r2 + 1):
            ln = out.get(r)
            if ln is None:
                continue
            lo = c1 if r == r1 else 0
            hi = c2 if r == r2 else len(ln)
            out[r] = ln[:lo] + " " * (hi - lo) + ln[hi:]
    return out


def fork_census() -> list[tuple[str, str, str, int, str]]:
    hits: list[tuple[str, str, str, int, str]] = []
    for d in (CORE, ROOT / "policy"):
        for path in sorted(d.glob("*.py")):
            src = path.read_text(encoding="utf-8")
            fmap = _funcs_by_line(ast.parse(src))
            for i, code in _code_lines(src).items():
                if not code.strip():
                    continue
                for rx, label in FORK_PATTERNS:
                    if rx.search(code):
                        hits.append((path.name, fmap.get(i, "<module>"), label, i, code.strip()))
    return hits


def main(census_only: bool = False) -> int:
    known, shapes, aliases = defined_attrs()
    known |= external_binds()
    fails = 0

    if census_only:
        for f, fn, label, ln, code in fork_census():
            print(f"{f}:{ln} [{fn}] {label}  {code[:90]}")
        return 0

    bad = unresolved_reads(known, shapes)
    if bad:
        fails += 1
        print("DANGLING ATTRIBUTE — read but never bound on the sim:")
        for f, ln, what in bad:
            print(f"  {f}:{ln}  {what}")

    dupes = sorted(aliases & mutable_names())
    if dupes:
        fails += 1
        print("ALIAS IN _MUTABLE — snapshot/restore must round-trip the BASE, never a view:")
        for d_ in dupes:
            print(f"  {d_}")

    shadowed = shadowed_methods()
    if shadowed:
        fails += 1
        print("SHADOWED METHOD — a data attribute buries a def of the same name:")
        for nm, dfile, bfile, bline in shadowed:
            print(f"  {nm}  (def in {dfile}, bound at {bfile}:{bline})")

    census = fork_census()
    stray = [h for h in census if (h[0], h[1]) not in FORK_ALLOW]
    if stray:
        fails += 1
        print("UNALLOWED SEAT FORK — every survivor must be named in FORK_ALLOW:")
        for f, fn, label, ln, code in stray:
            print(f"  {f}:{ln} [{fn}] {label}  {code[:80]}")
    # A STALE allowlist entry is a fork someone closed without saying so — and
    # the next one to arrive in that function would land pre-forgiven.
    live = {(h[0], h[1]) for h in census}
    rot = sorted(k for k in FORK_ALLOW if k not in live)
    if rot:
        fails += 1
        print("STALE FORK_ALLOW ENTRY — the fork is gone; delete the line:")
        for f, fn in rot:
            print(f"  {f} [{fn}] — {FORK_ALLOW[(f, fn)]}")

    if fails:
        print(f"\nseat-symmetry check FAILED ({fails} of 4)")
        return 1
    print(f"seat-symmetry check OK — {len(known)} bound attributes, "
          f"{len(aliases)} aliases, {len(FORK_ALLOW)} allowed forks")
    return 0


if __name__ == "__main__":
    sys.exit(main(census_only="--census" in sys.argv))
