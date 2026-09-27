"""H-3: read the install's GameCore DLL as code: the functions that reference
a string (RIP-relative disp32), their bounds from .pdata, their disassembly
and the calls they make.

    python tools/civ6lab/h3_dis.py DLL xref PATTERN          # strings matching, the functions citing them
    python tools/civ6lab/h3_dis.py DLL dis RVA [--n 400]     # disassemble the function holding RVA
    python tools/civ6lab/h3_dis.py DLL calls RVA             # the direct calls a function makes
    python tools/civ6lab/h3_dis.py DLL callers RVA           # the functions calling RVA directly

Needs capstone and pefile (installed with pip --target into
.claude/scratchpad/pylibs; the path is added here).
"""
from __future__ import annotations

import argparse
import bisect
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / ".claude" / "scratchpad" / "pylibs"))
import capstone  # noqa: E402
import numpy as np  # noqa: E402
import pefile  # noqa: E402


class Dll:
    def __init__(self, path: str):
        self.pe = pefile.PE(path, fast_load=False)
        self.base = self.pe.OPTIONAL_HEADER.ImageBase
        self.image = self.pe.get_memory_mapped_image()
        text = next(s for s in self.pe.sections if s.Name.rstrip(b"\0") == b".text")
        self.text_rva = text.VirtualAddress
        self.text = self.image[text.VirtualAddress:text.VirtualAddress + text.Misc_VirtualSize]
        # a function = a pdata entry and the chained entries that follow it
        chunks = sorted((e.struct.BeginAddress, e.struct.EndAddress,
                         bool(e.unwindinfo and e.unwindinfo.Flags & 4))
                        for e in getattr(self.pe, "DIRECTORY_ENTRY_EXCEPTION", []))
        self.funcs = []
        for b, e, chained in chunks:
            if chained and self.funcs and self.funcs[-1][1] <= b:
                self.funcs[-1] = (self.funcs[-1][0], e)
            else:
                self.funcs.append((b, e))
        self.starts = [f[0] for f in self.funcs]
        self.md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
        self.md.detail = False

    def func_of(self, rva: int):
        k = bisect.bisect_right(self.starts, rva) - 1
        if k >= 0 and self.funcs[k][0] <= rva < self.funcs[k][1]:
            return self.funcs[k]
        return None

    def strings(self, pattern: str, minlen: int = 5):
        pat = re.compile(pattern.encode(), re.I)
        for m in re.finditer(rb"[\x20-\x7e]{%d,}\x00" % minlen, self.image):
            s = m.group()[:-1]
            if pat.search(s):
                yield m.start(), s.decode()

    def refs_to(self, target_rva: int):
        """offsets in .text of a disp32 whose RIP-relative target (next
        instruction assumed 4 bytes after the disp) is target_rva"""
        t = np.frombuffer(self.text[: len(self.text) // 4 * 4 + 0], dtype=np.uint8)
        n = len(t) - 4
        d = (t[0:n].astype(np.int64) | (t[1:n + 1].astype(np.int64) << 8) | (t[2:n + 2].astype(np.int64) << 16)
             | (t[3:n + 3].astype(np.int64) << 24))
        d = np.where(d >= 1 << 31, d - (1 << 32), d)
        rvas = self.text_rva + np.arange(n) + 4 + d
        out = []
        for extra in (0, 1, 2, 4):  # an immediate after the disp shifts the next-instruction address
            out += [int(i) for i in np.nonzero(rvas + extra == target_rva)[0]]
        return sorted(set(out))

    def calls_to(self, target_rva: int):
        t = np.frombuffer(self.text, dtype=np.uint8)
        n = len(t) - 5
        idx = np.nonzero(t[:n] == 0xE8)[0]
        d = (t[idx + 1].astype(np.int64) | (t[idx + 2].astype(np.int64) << 8) | (t[idx + 3].astype(np.int64) << 16)
             | (t[idx + 4].astype(np.int64) << 24))
        d = np.where(d >= 1 << 31, d - (1 << 32), d)
        tgt = self.text_rva + idx + 5 + d
        return [int(self.text_rva + i) for i in idx[tgt == target_rva]]

    def dis(self, start: int, end: int):
        code = self.image[start:end]
        return list(self.md.disasm(code, self.base + start))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dll")
    p.add_argument("cmd")
    p.add_argument("arg")
    p.add_argument("--n", type=int, default=100000)
    a = p.parse_args()
    d = Dll(a.dll)
    if a.cmd == "xref":
        for off, s in d.strings(a.arg):
            rva = off
            print(f"string rva {rva:08x}: {s[:150]}")
            for r in d.refs_to(rva):
                f = d.func_of(d.text_rva + r)
                print(f"    ref at {d.text_rva + r:08x} in func {f[0]:08x}..{f[1]:08x}" if f else
                      f"    ref at {d.text_rva + r:08x} (no pdata)")
        return 0
    if a.cmd == "range":
        lo, hi = (int(x, 16) for x in a.arg.split(":"))
        for i in d.dis(lo, hi):
            print(f"{i.address - d.base:08x} {i.mnemonic:8s} {i.op_str}")
        return 0
    rva = int(a.arg, 16)
    if a.cmd == "callers":
        for c in d.calls_to(rva):
            f = d.func_of(c)
            print(f"call at {c:08x} in {f[0]:08x}..{f[1]:08x}" if f else f"call at {c:08x}")
        return 0
    f = d.func_of(rva)
    if not f:
        print("no function holds", a.arg)
        return 1
    print(f"function {f[0]:08x}..{f[1]:08x} ({f[1] - f[0]} bytes)")
    ins = d.dis(f[0], f[1])
    if a.cmd == "calls":
        for i in ins:
            if i.mnemonic == "call":
                print(f"{i.address - d.base:08x} call {i.op_str}")
        return 0
    for i in ins[: a.n]:
        print(f"{i.address - d.base:08x} {i.mnemonic:8s} {i.op_str}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
