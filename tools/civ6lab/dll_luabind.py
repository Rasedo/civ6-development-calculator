"""The Lua bindings a registration function installs: each `lea rdx, fn` /
`lea r8, "Name"` pair in a registrar (hksi_lua_setfield after a closure),
with the virtual slots and direct calls the bound function makes, so a
plot / unit / city vtable slot can be named by the Lua method that reaches it.

    python tools/civ6lab/dll_luabind.py REGISTRAR_RVA [NAME_REGEX]
"""
from __future__ import annotations

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from dll_q import DEFAULT, Q  # noqa: E402


def bindings(q: Q, reg: int) -> list[tuple[str, int]]:
    f = q.d.func_of(reg)
    fn = None
    out = []
    for ins in q.d.dis(f[0], f[1]):
        t = q.target(ins)
        if t is None or ins.mnemonic != "lea":
            continue
        if ins.op_str.startswith("rdx") and t not in q.str_at:
            fn = t
        elif ins.op_str.startswith("r8") and t in q.str_at and fn is not None:
            out.append((q.str_at[t], fn))
            fn = None
    return out


def body(q: Q, fn: int, depth: int = 0) -> list[str]:
    f = q.d.func_of(fn)
    if f is None:
        return []
    out = []
    for ins in q.d.dis(f[0], f[1]):
        if ins.mnemonic == "call" and "ptr [r" in ins.op_str:
            out.append(f"{ins.address - q.d.base:08x} vcall {ins.op_str}")
        elif ins.mnemonic in ("call", "jmp") and ins.op_str.startswith("0x"):
            tgt = int(ins.op_str, 16) - q.d.base
            if ins.mnemonic == "call" or not (f[0] <= tgt < f[1]):
                out.append(f"{ins.address - q.d.base:08x} {ins.mnemonic} {tgt:08x} {q.flabel(tgt)[:60]}")
    return out


def main() -> None:
    q = Q(DEFAULT)
    reg = int(sys.argv[1], 16)
    pat = re.compile(sys.argv[2]) if len(sys.argv) > 2 else None
    for name, fn in bindings(q, reg):
        if pat and not pat.search(name):
            continue
        print(f"== {name} {fn:08x}")
        for line in body(q, fn):
            print("   ", line)


if __name__ == "__main__":
    main()
