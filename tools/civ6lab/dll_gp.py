"""The GlobalParameters struct as GameCore_XP2_Release.dll loads it (the
loader at 0x2d58f0: one call per parameter, r9 = the field, r8 = the name,
[rsp+0x20] = the default): the field offset of each parameter, so a
function reading [gp + off] can be named.

    python tools/civ6lab/dll_gp.py [OFFSET_HEX ...]     # all, or the named offsets
"""
from __future__ import annotations

import re
import struct
import sys

from dll_q import DEFAULT, Q

LOADER = 0x2D58F0


def gp_table(q: Q) -> dict[int, tuple[str, object]]:
    f = q.d.func_of(LOADER)
    out = {}
    field, default, fconst = 0, None, {}
    for i in q.d.dis(f[0], f[1]):
        s = i.op_str
        m = re.fullmatch(r"r9, \[rdi \+ 0x([0-9a-f]+)\]", s) if i.mnemonic == "lea" else None
        if m:
            field = int(m.group(1), 16)
        elif i.mnemonic == "mov" and s == "r9, rdi":
            field = 0
        m = re.fullmatch(r"dword ptr \[rsp \+ 0x20\], (0x[0-9a-f]+|\d+)", s) if i.mnemonic == "mov" else None
        if m:
            v = int(m.group(1), 0)
            default = v - (1 << 32) if v >= 1 << 31 else v
        m = re.fullmatch(r"(xmm\d+), dword ptr \[rip", s) if i.mnemonic == "movss" else None
        if m:
            t = q.target(i)
            fconst[m.group(1)] = round(struct.unpack_from("<f", q.d.image, t)[0], 6)
        m = re.fullmatch(r"dword ptr \[rsp \+ 0x20\], (xmm\d+)", s) if i.mnemonic == "movss" else None
        if m:
            default = fconst.get(m.group(1))
        if i.mnemonic == "lea" and s.startswith("r8, [rip"):
            t = q.target(i)
            name = q.str_at.get(t)
            if name:
                out[field] = (name, default)
    return out


def main() -> int:
    q = Q(DEFAULT)
    t = gp_table(q)
    want = [int(a, 16) for a in sys.argv[1:]]
    for off in sorted(t):
        if not want or off in want:
            print(f"{off:#06x} {t[off][0]} = {t[off][1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
