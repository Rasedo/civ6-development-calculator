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
