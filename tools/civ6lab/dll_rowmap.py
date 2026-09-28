"""A database table's row struct as GameCore_XP2_Release.dll fills it: the
row filler reads each column by index (edx) and stores it at a field (a
dword / byte store, or a masked bit), so a function reading [row + off] can
be named by its column.

    python tools/civ6lab/dll_rowmap.py LOADER_RVA [FIELD_HEX ...]
      LOADER_RVA  the "SELECT count(*) from T" / "SELECT rowid, ..." loader;
                  its row filler is the direct call just before the one
                  that files the row by its type hash
"""
from __future__ import annotations

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from dll_q import DEFAULT, Q  # noqa: E402

STORE = re.compile(r"(byte|word|dword|qword) ptr \[rbx \+ (0x[0-9a-f]+)\], (\w+)")
MASK = re.compile(r"and\s+(byte|word|dword) ptr \[rbx \+ (0x[0-9a-f]+)\], (0x[0-9a-f]+)")


def columns(q: Q, loader: int) -> tuple[list[str], int]:
    f = q.d.func_of(loader)
    sel, calls = None, []
    for ins in q.d.dis(f[0], f[1]):
        t = q.target(ins)
        if t is not None and t in q.str_at and q.str_at[t].startswith("SELECT rowid"):
            sel = q.str_at[t]
        if ins.mnemonic == "call" and ins.op_str.startswith("0x"):
            calls.append(int(ins.op_str, 16) - q.d.base)
    filler = next(calls[i - 1] for i, c in enumerate(calls)
                  if i and any("GetTypeHash" in s for s in q.fstrings(q.d.func_of(c))))
    cols = sel[len("SELECT "):sel.index(" FROM")].split(", ")
    return cols, filler


def fields(q: Q, filler: int, cols: list[str]) -> list[tuple[str, str, str]]:
    f = q.d.func_of(filler)
    out = []
    col = None
    for ins in q.d.dis(f[0], f[1]):
        s = f"{ins.mnemonic} {ins.op_str}"
        m = re.fullmatch(r"mov edx, (0x[0-9a-f]+|\d+)", s)
        if m:
            col = int(m.group(1), 0)
        elif s == "xor edx, edx":
            col = 0
        name = cols[col] if col is not None and col < len(cols) else "?"
        m = MASK.search(s)
        if m:
            out.append((m.group(2), f"bit {0xff ^ int(m.group(3), 16) if m.group(1) == 'byte' else m.group(3)}", name))
            continue
        m = STORE.search(s) if ins.mnemonic == "mov" else None
        if m and m.group(3) in ("eax", "al", "ax", "rax", "ecx", "cl", "r8d"):
            out.append((m.group(2), m.group(1), name))
    return out


def main() -> None:
    q = Q(DEFAULT)
    cols, filler = columns(q, int(sys.argv[1], 16))
    want = {int(a, 16) for a in sys.argv[2:]}
    print(f"filler {filler:08x}")
    for off, kind, name in fields(q, filler, cols):
        if not want or int(off, 16) in want:
            print(f"+{off} {kind:>8} {name}")


if __name__ == "__main__":
    main()
