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
    # No PERMANENT entry any more. The row->seat map used to sit here on the
    # grounds that two index spaces have to meet somewhere; they do not, and
    # its two helpers had no caller at all — an exemption that would have
    # pre-forgiven every future fork landing in a dead function.
    # --- WIRE LIMITS, named ------------------------------------------------
    ("serve_gate.py", "run_batched"): "#108 — the wire's seat-0 RECORD SCHEMA (production pairs, unit triples)",
    ("serve_gate.py", "main"): "#108 — the wire's seat-0 RECORD SCHEMA, the single-seed twin",
}

#: The merged seat planes, by the naming convention that IS the storage
#: contract (#111): `civ_x[:, row]`, `city_x[:, row, slot]`,
#: `seat_x[:, row, ...]`, plus the three that predate the prefixes.
_SEAT_PLANE = r"(?:(?:civ|city|seat)_[a-z_0-9]+|war|war_turns|peace_turns)"

FORK_PATTERNS = (
    (re.compile(r"\brow\s*[=!]=\s*0\b"), "row == 0"),
    (re.compile(r"\bseat\s*[=!]=\s*0\b"), "seat == 0"),
    (re.compile(r"\brow\s*(?:>\s*0|>=\s*1)\b"), "row > 0"),
    (re.compile(r"\bseat\s*(?:>\s*0|>=\s*1)\b"), "seat > 0"),
    (re.compile(r"\brow\s*-\s*1\b"), "row - 1"),
    (re.compile(r"\bseat\s*-\s*1\b"), "seat - 1"),
    (re.compile(r"\br\s*\+\s*1\b"), "r + 1"),
    # A fork does not have to name `row`. These three spellings are how every
    # one that survived #111 was written, and the token patterns above are
    # blind to all of them: they match ADJACENT tokens, and a fork hidden
    # inside an expression has none.
    #
    # `civ_techs[:, 0]` — seat 0's research standing in for the asking seat's
    # (`_farmadj_food`, `_mark_antiquity`); `city_center[:, 0]` — seat 0's
    # cities standing in for every major's (the barbarian march).
    (re.compile(r"\b" + _SEAT_PLANE + r"\[:,\s*0\s*[,\]]"), "plane[:, 0] — literal row 0"),
    # …and its other half. `city_dist_tile[:, 1:]` is "the CIV rows", which
    # only makes sense if row 0's copy of the fact lives somewhere else — the
    # exact split #109/#111 spent two rounds deleting.
    (re.compile(r"\b" + _SEAT_PLANE + r"\[:,\s*1\s*:"), "plane[:, 1:] — the civ rows alone"),
    # `tile_seat.gather(...) == 0` — a seat-VALUED expression tested against
    # seat 0 (the barbarian melee priority, the pillage-job owner test). The
    # `&`/`|` exclusion keeps the comparison in ONE conjunct, so an unrelated
    # `x == 0` further along a boolean chain is not a hit.
    (re.compile(r"\b\w*_seat\b[^\n&|]{0,80}?[=!]=\s*0\b"), "seat expression == 0"),
    # `civ_at` is `tile_seat` mapped into the CIV index space, so every reader
    # spells "a civ, not seat 0" and needs a seat-0 arm beside it.
    # (`citystate_at` is NOT here: a city-state's index is a genuinely
    # different space, the same exemption the four surviving aliases carry.)
    (re.compile(r"\.civ_at\b"), "civ-family tile view"),
    # The WIRE's own spelling: `recs["0"] = {...}`, the hand-rolled seat-0
    # record — the last seat-0 distinction either engine has, and one no
    # pattern above can see, because a schema fork is a literal dict rather
    # than a comparison. Written as an EMPTY subscript because `_code_lines`
    # blanks string tokens whole, quotes included: the census reads the literal
    # key as `recs[   ]`, while the generic `recs[str(row)]` beside it survives
    # intact and does not match.
    (re.compile(r"\brecs\[\s*\]"), 'recs["0"] — the wire\'s hand-rolled seat-0 record'),
)

# ---------------------------------------------------------------------------
# THE SAME CENSUS, ON THE TS ORACLE.
#
# Checking one engine and reporting "the class is closed" is the mistake #112
# was: a clean run is evidence about the instrument, not the codebase. The GPU
# half of that round found four live divergences; the FIRST run of the census
# below found three more in `cpu/`, all of the same shape — a rule body passing
# a literal 0 where the acting seat belongs — and all of them ones the GPU
# already got right. There is no reason the oracle should be less measured than
# the twin.
# ---------------------------------------------------------------------------
# `cpu/world` belongs here as much as the rest: WORLD CONSTRUCTION is where a
# seat gets its leader, its colour and its aggression draw, and a fork there is
# a seat that starts the game as a different kind of thing.
TS_ROOTS = ("cpu/core", "cpu/driver", "cpu/export", "cpu/world")

TS_FORK_ALLOW = {
    # No PERMANENT entry, and no index-space entry at all: `seatOfIndex` and
    # `indexOfSeat` are gone from `cpu/` entirely (#114), so there is nothing
    # left that has to convert between two numberings.
    # --- WIRE LIMITS, named ------------------------------------------------
    ("phase.ts", "seatPhase"): "#108 — `actor.seat !== 0` is the unit-order SCHEMA fork (triples vs per-unit ranks)",
    ("driver.ts", "runDriver"): "#108 — the serve client's own seat-0 candidate rows, and endTurn's ambient seat argument",
}

TS_FORK_PATTERNS = (
    (re.compile(r"\bseat\s*[=!]==\s*0\b"), "seat === 0"),
    (re.compile(r"\bseats\[0\]"), "state.seats[0] — literal seat 0"),
    # THE ONE THAT FOUND ALL THREE. `goldenCulturePerDistrict(state, 0)` in a
    # per-CITY yield body, `goldenBoostBonus(state, 0)` inside a function whose
    # own parameter is the seat, `addEraScore(state, 0)` on the path where
    # `seat` is the conqueror: a seat argument written as a literal reads like
    # a constant and is a fork.
    (re.compile(r"\(\s*state\s*,\s*0\s*[,)]"), "a SEAT argument hardcoded to 0"),
    (re.compile(r"\bseat\s*[-+]\s*1\b"), "seat ± 1 — the civ index space"),
    (re.compile(r"seatOf\(\s*state\s*,\s*[A-Za-z_][A-Za-z_0-9]*\s*\+\s*1\s*\)"), "civ index + 1 -> seat"),
    # The named conversions. Matching only `seat ± 1` would catch the two
    # DEFINITIONS and none of the callers — the caller is where the second
    # index space actually costs something, so name the call.
    (re.compile(r"\b(?:seatOfIndex|indexOfSeat)\s*\("), "the civ index space, by name"),
)


def _ts_code_lines(src: str) -> dict[int, str]:
    """line -> its CODE text, comments and string bodies blanked.

    The GPU half uses `tokenize`; there is no TS tokenizer here, so this is a
    character scan over the things that can hide or fake a hit: `//` to end of
    line, `/* */`, and quoted strings. A template literal's `${...}` is CODE
    and stays — blanking it would have hidden `seatOf(state, 0)` inside an
    interpolation, which is the same blindness this whole check exists to
    remove. Regex literals and JSX are not handled; neither appears in `cpu/`."""
    out: list[list[str]] = [list(ln) for ln in src.splitlines()]
    row = col = 0
    stack: list[str] = []  # nesting of "//" | "/*" | a quote char | "${"
    i = 0
    n = len(src)

    def mode() -> str:
        return stack[-1] if stack else ""

    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if ch == "\n":
            if mode() == "//":
                stack.pop()
            row, col, i = row + 1, 0, i + 1
            continue
        m = mode()
        blank = m in ("//", "/*") or m in ("\"", "'", "`")
        if m in ("", "${"):
            if ch == "/" and nxt == "/":
                stack.append("//")
                blank = True
            elif ch == "/" and nxt == "*":
                stack.append("/*")
                blank = True
            elif ch in "\"'`":
                stack.append(ch)  # the quote itself stays, its body goes
            elif ch == "}" and m == "${":
                stack.pop()       # back into the template literal
        elif m == "/*":
            if ch == "*" and nxt == "/":
                for c2 in (col, col + 1):
                    if c2 < len(out[row]):
                        out[row][c2] = " "
                stack.pop()
                col, i = col + 2, i + 2
                continue
        elif m in ("\"", "'", "`"):
            if ch == "\\":
                for c2 in (col, col + 1):
                    if c2 < len(out[row]):
                        out[row][c2] = " "
                col, i = col + 2, i + 2
                continue
            if m == "`" and ch == "$" and nxt == "{":
                stack.append("${")  # an interpolation is code again
                blank = False
                col, i = col + 2, i + 2
                continue
            if ch == m:
                stack.pop()
                blank = False
        if blank and col < len(out[row]):
            out[row][col] = " "
        col, i = col + 1, i + 1
    return {k + 1: "".join(v) for k, v in enumerate(out)}


_TS_DECL = re.compile(
    r"^(?:export\s+)?(?:async\s+)?(?:function\s+(?P<f>[A-Za-z_$][\w$]*)"
    r"|const\s+(?P<c>[A-Za-z_$][\w$]*)\s*[:=][^=]*?(?:=>|function))"
)


def _ts_funcs_by_line(code: dict[int, str]) -> dict[int, str]:
    """line -> the last TOP-LEVEL function declaration at or above it.

    A brace-matching parser would be exact; this is not, and does not need to
    be. `cpu/` declares its functions at column 0, so "the last unindented
    declaration above this line" names the enclosing one — and anchoring at
    column 0 is what keeps a nested arrow-function const from stealing the
    attribution, which would make an allowlist key change under an unrelated
    refactor. The file:line in the report locates the hit either way."""
    out: dict[int, str] = {}
    cur = "<module>"
    for ln in sorted(code):
        m = _TS_DECL.match(code[ln])
        if m:
            cur = m.group("f") or m.group("c") or cur
        out[ln] = cur
    return out


def ts_fork_census() -> list[tuple[str, str, str, int, str]]:
    hits: list[tuple[str, str, str, int, str]] = []
    for rel in TS_ROOTS:
        for path in sorted((ROOT / rel).glob("*.ts")):
            code = _ts_code_lines(path.read_text(encoding="utf-8"))
            fmap = _ts_funcs_by_line(code)
            for i, line in code.items():
                if not line.strip():
                    continue
                for rx, label in TS_FORK_PATTERNS:
                    if rx.search(line):
                        hits.append((path.name, fmap.get(i, "<module>"), label, i, line.strip()))
    return hits


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
    # `gpu/serve_gate.py` is in the census, not just the engine and the policy:
    # it is where the WIRE is spelled, and the wire is where the last seat-0
    # distinction lives. Leaving the driver out would let the one surviving
    # fork sit in the one file nobody measures.
    for d in (CORE, ROOT / "policy", ROOT / "gpu"):
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


def census_faults(engine: str, census, allow: dict) -> int:
    """The STRAY/STALE pair, for EITHER engine's census — the two halves are
    the same check and share this body so neither can drift ahead of the
    other. A stray fork is one nobody named; a stale entry is a fork someone
    closed without saying so, and the next one to arrive in that function
    would land pre-forgiven."""
    fails = 0
    stray = [h for h in census if (h[0], h[1]) not in allow]
    if stray:
        fails += 1
        print(f"UNALLOWED SEAT FORK ({engine}) — every survivor must be named in the allowlist:")
        for f, fn, label, ln, code in stray:
            print(f"  {f}:{ln} [{fn}] {label}  {code[:80]}")
    live = {(h[0], h[1]) for h in census}
    rot = sorted(k for k in allow if k not in live)
    if rot:
        fails += 1
        print(f"STALE ALLOWLIST ENTRY ({engine}) — the fork is gone; delete the line:")
        for f, fn in rot:
            print(f"  {f} [{fn}] — {allow[(f, fn)]}")
    return fails


def main(census_only: bool = False) -> int:
    known, shapes, aliases = defined_attrs()
    known |= external_binds()
    fails = 0

    if census_only:
        for tag, hits in (("gpu", fork_census()), ("ts", ts_fork_census())):
            for f, fn, label, ln, code in hits:
                print(f"{tag} {f}:{ln} [{fn}] {label}  {code[:90]}")
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

    fails += census_faults("gpu", fork_census(), FORK_ALLOW)
    fails += census_faults("ts", ts_fork_census(), TS_FORK_ALLOW)

    if fails:
        print(f"\nseat-symmetry check FAILED ({fails} fault classes)")
        return 1
    print(f"seat-symmetry check OK — {len(known)} bound attributes, {len(aliases)} aliases, "
          f"{len(FORK_ALLOW)} allowed GPU forks, {len(TS_FORK_ALLOW)} allowed TS forks")
    return 0


if __name__ == "__main__":
    sys.exit(main(census_only="--census" in sys.argv))
