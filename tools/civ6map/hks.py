"""Havok Script's source dialect on a Lua 5.1 VM.

The install's map scripts are Havok Script (Civ 6's Lua 5.1-compatible VM),
which accepts type annotations on locals and parameters: `local t:table = {}`,
`function f(plot :object, n :number)`. Standard Lua 5.1 does not, and in
standard Lua a `:` Name is always a method call followed by its arguments
(`(`, a string or a `{`). `strip_annotations` removes every `: Name` whose
next token is none of those — exactly the annotations — outside strings and
comments, and keeps line numbers.
"""
from __future__ import annotations

import re

_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def _long_bracket(src: str, i: int) -> int | None:
    """length of the opening `[==[` at i, or None"""
    m = re.match(r"\[(=*)\[", src[i:])
    return len(m.group(0)) if m else None


def _skip_long(src: str, i: int, level: int) -> int:
    close = "]" + "=" * level + "]"
    j = src.find(close, i)
    return len(src) if j < 0 else j + len(close)


def _tokens(src: str):
    """(kind, start, end) for the significant tokens: 'name', 'str', 'op'"""
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in " \t\r\n":
            i += 1
            continue
        if src.startswith("--", i):
            lb = _long_bracket(src, i + 2)
            if lb is not None:
                i = _skip_long(src, i + 2 + lb, lb - 2)
            else:
                j = src.find("\n", i)
                i = n if j < 0 else j
            continue
        if c in "\"'":
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == "\\" else 1
            yield ("str", i, j + 1)
            i = j + 1
            continue
        if c == "[":
            lb = _long_bracket(src, i)
            if lb is not None:
                j = _skip_long(src, i + lb, lb - 2)
                yield ("str", i, j)
                i = j
                continue
        m = _NAME.match(src, i)
        if m:
            yield ("name", i, m.end())
            i = m.end()
            continue
        m = re.match(r"\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+|\.\d+", src[i:])
        if m and (c.isdigit() or c == "."):
            yield ("num", i, i + len(m.group(0)))
            i += len(m.group(0))
            continue
        for op in ("...", "..", "==", "~=", "<=", ">="):
            if src.startswith(op, i):
                yield ("op", i, i + len(op))
                i += len(op)
                break
        else:
            yield ("op", i, i + 1)
            i += 1


def strip_annotations(src: str) -> str:
    toks = list(_tokens(src))
    cut: list[tuple[int, int]] = []
    for k, (kind, s, e) in enumerate(toks):
        if kind != "op" or src[s:e] != ":" or k + 1 >= len(toks) or toks[k + 1][0] != "name":
            continue
        nxt = toks[k + 2] if k + 2 < len(toks) else None
        if nxt is not None and (nxt[0] == "str" or src[nxt[1]:nxt[2]] in ("(", "{")):
            continue
        cut.append((s, toks[k + 1][2]))
    if not cut:
        return src
    out, last = [], 0
    for s, e in cut:
        out.append(src[last:s])
        out.append(" " * (e - s))
        last = e
    out.append(src[last:])
    return "".join(out)


KEYWORDS = {"and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in", "local",
            "nil", "not", "or", "repeat", "return", "then", "true", "until", "while"}
ARITH = {"+", "-", "*", "/", "%", "^", ".."}
ORDER = {"<": "__hks_lt", "<=": "__hks_le", ">": "__hks_gt", ">=": "__hks_ge", "==": "__hks_eq", "~=": "__hks_ne"}
# the comparisons as Havok Script answers them: a comparison of two numbers
# with a NaN on either side is true, its negation false (live FrontEnd, n =
# 0/0: n < 5, n <= 5, n > 5, n >= 5, 5 < n, 5 <= n, 5 > n, 5 >= n, n < n,
# n == 5, 5 == n, n == n all true, n ~= 5 false; math.ceil(n) is n).
# Tilted_Axis runs FeatureGenerator:AddFeaturesFromContinents with
# iNumLandPlots 0, and the oasis gate ceil(0 * 100 / 0) <= max passes.
NAN_COMPARES = r"""
function __hks_lt(a, b) if a ~= a or b ~= b then return true end return a < b end
function __hks_le(a, b) if a ~= a or b ~= b then return true end return a <= b end
function __hks_gt(a, b) if a ~= a or b ~= b then return true end return a > b end
function __hks_ge(a, b) if a ~= a or b ~= b then return true end return a >= b end
function __hks_eq(a, b)
  if a ~= a or b ~= b then return type(a) == "number" and type(b) == "number" end
  return a == b
end
function __hks_ne(a, b) return not __hks_eq(a, b) end
"""


def nan_compares(src: str) -> str:
    """every comparison (`<`, `<=`, `>`, `>=`, `==`, `~=`) between two
    operands rewritten as a call of the NAN_COMPARES functions, the
    operands' text kept; line numbers
    kept. An operand is the arithmetic-level expression around the
    operator: unary operators, primaries with their field, index and call
    suffixes, joined by + - * / % ^ .."""
    toks = list(_tokens(src))
    txt = [src[s:e] for _, s, e in toks]
    kind = [k for k, _, _ in toks]
    match: dict[int, int] = {}
    stack: list[int] = []
    for k, t in enumerate(txt):
        if kind[k] != "op":
            continue
        if t in "([{":
            stack.append(k)
        elif t in ")]}" and stack:
            o = stack.pop()
            match[o], match[k] = k, o

    def ends_operand(k: int) -> bool:
        if k < 0:
            return False
        t = txt[k]
        if kind[k] in ("num", "str"):
            return True
        if kind[k] == "name":
            return t not in KEYWORDS or t in ("nil", "true", "false")
        return t in (")", "]", "}", "...")

    def left(k: int) -> int | None:
        """the first token of the operand ending at token k"""
        while True:
            if not ends_operand(k):
                return None
            # one postfix expression, read backwards
            while True:
                t = txt[k]
                if kind[k] == "op" and t in (")", "]", "}"):
                    if k not in match:
                        return None
                    k = match[k]
                    if ends_operand(k - 1):   # a call's or an index's brackets
                        k -= 1
                        continue
                    break
                if kind[k] == "str" and ends_operand(k - 1) and kind[k - 1] != "str":
                    k -= 1
                    continue
                if kind[k] == "name" and k >= 2 and txt[k - 1] in (".", ":") and ends_operand(k - 2):
                    k -= 2
                    continue
                break
            # unary operators
            while k - 1 >= 0 and (txt[k - 1] in ("not", "#") or txt[k - 1] == "-" and not ends_operand(k - 2)):
                k -= 1
            if k - 1 >= 0 and kind[k - 1] == "op" and txt[k - 1] in ARITH:
                k -= 2
                continue
            return k

    def right(k: int) -> int | None:
        """the last token of the operand starting at token k"""
        n = len(toks)
        while True:
            while k < n and (txt[k] in ("not", "#", "-") and kind[k] != "str"):
                k += 1
            if k >= n:
                return None
            t = txt[k]
            if kind[k] in ("num", "str") or kind[k] == "name" and (t not in KEYWORDS or t in ("nil", "true", "false")) \
                    or t == "...":
                pass
            elif kind[k] == "op" and t in ("(", "{"):
                if k not in match:
                    return None
                k = match[k]
            else:
                return None
            while k + 1 < n:
                nt = txt[k + 1]
                if nt in (".", ":") and k + 2 < n and kind[k + 2] == "name":
                    k += 2
                elif kind[k + 1] == "op" and nt in ("(", "[", "{") and k + 1 in match:
                    k = match[k + 1]
                elif kind[k + 1] == "str":
                    k += 1
                else:
                    break
            if k + 1 < n and kind[k + 1] == "op" and txt[k + 1] in ARITH:
                k += 2
                continue
            return k

    ins: list[tuple[int, int, str]] = []   # (position, order, text)
    rep: dict[int, str] = {}
    for k, t in enumerate(txt):
        if kind[k] != "op" or t not in ORDER:
            continue
        a, b = left(k - 1), right(k + 1)
        if a is None or b is None:
            continue
        ins.append((toks[a][1], 0, ORDER[t] + "("))
        ins.append((toks[b][2], 1, ")"))
        rep[k] = ","
    if not rep:
        return src
    edits = sorted([(p, o, s, None) for p, o, s in ins] +
                   [(toks[k][1], 2, s, toks[k][2]) for k, s in rep.items()], key=lambda e: (e[0], -e[1]))
    out, last = [], 0
    for p, _o, s, end in edits:
        out.append(src[last:p])
        out.append(s)
        last = p if end is None else end
    out.append(src[last:])
    return "".join(out)


def table_order(keys: list[int]) -> list[int]:
    """the order Havok Script's pairs visits a table whose keys are the
    integers `keys`, inserted in ascending order into an empty table: Lua
    5.1's node table (main position, the free slot searched down from the
    end, a colliding key moved off a slot it does not own, a full table
    resized to the next power of two with its nodes reinserted last to
    first) with a key's main position key mod size and no array part; a
    table of exactly 1..n is its array, in order. Evidence: DoRiver's flow
    table (keys 0..5 in ascending order, every river of the logs) and
    AddTerrainFromContinents' lonely-mountain lists by continent (Standard
    seed 1000: continents 6, 10, 11, 15 visited 15, 6, 10, 11)."""
    ks = sorted(keys)
    if ks == list(range(1, len(ks) + 1)):
        return ks
    st = {"nodes": [], "last": 0}

    def insert(k) -> bool:
        nodes = st["nodes"]
        size = len(nodes)
        if not size:
            return False
        mp = k % size
        if nodes[mp] is None:
            nodes[mp] = k
            return True
        while st["last"] > 0:
            st["last"] -= 1
            f = st["last"]
            if nodes[f] is None:
                if nodes[mp] % size != mp:
                    nodes[f], nodes[mp] = nodes[mp], k
                else:
                    nodes[f] = k
                return True
        return False

    for k in ks:
        if insert(k):
            continue
        old = st["nodes"]
        count = sum(1 for n in old if n is not None) + 1
        size = 1
        while size < count:
            size *= 2
        st["nodes"], st["last"] = [None] * size, size
        for o in reversed(old):
            if o is not None:
                insert(o)
        insert(k)
    return [n for n in st["nodes"] if n is not None]
