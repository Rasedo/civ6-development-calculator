"""Read GameCore_XP2_Release.dll with annotations: the h3_dis reader plus
string labels on every RIP-relative operand and call target, run as a batch
of queries so the image loads once.

    python tools/civ6lab/dll_q.py "xref PATTERN" "dis RVA [N]" "ann RVA [N]" ...
      xref PAT      strings matching PAT (regex), the functions citing them
      ann RVA [N]   the function holding RVA, disassembled, each RIP operand
                    and call target labelled (a string's text; a function by
                    the first strings it cites)
      range LO:HI   annotated disassembly of an address range
      callers RVA   the direct callers of the function at RVA (with labels)
      gref RVA      the functions touching data address RVA (a global)
      strs RVA      the strings a function cites
      vt RVA [N]    N qwords at RVA read as pointers (a vtable), labelled
      dq RVA [N]    N dwords / qwords / a double at RVA
    --dll PATH (default: the install's GameCore_XP2_Release.dll)
"""
from __future__ import annotations

import pathlib
import re
import struct
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_dis import Dll  # noqa: E402

DEFAULT = (r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI"
           r"\DLC\Expansion2\Binaries\Win64\GameCore_XP2_Release.dll")
RIP = re.compile(r"\[rip ([+-]) 0x([0-9a-f]+)\]")


class Q:
    def __init__(self, path: str):
        self.d = Dll(path)
        self.str_at: dict[int, str] = {}
        for m in re.finditer(rb"[\x20-\x7e]{4,}\x00", self.d.image):
            self.str_at[m.start()] = m.group()[:-1].decode()
        self._flabel: dict[int, str] = {}

    def sref(self, rva: int) -> str | None:
        s = self.str_at.get(rva)
        return s

    def target(self, ins) -> int | None:
        m = RIP.search(ins.op_str)
        if not m:
            return None
        off = int(m.group(2), 16) * (1 if m.group(1) == "+" else -1)
        return ins.address + ins.size + off - self.d.base

    def fstrings(self, f) -> list[str]:
        out = []
        for i in self.d.dis(f[0], f[1]):
            t = self.target(i)
            if t is not None and t in self.str_at:
                out.append(self.str_at[t])
        return out

    def flabel(self, rva: int) -> str:
        if rva in self._flabel:
            return self._flabel[rva]
        f = self.d.func_of(rva)
        lab = ""
        if f:
            ss = [s for s in self.fstrings(f) if not s.endswith(".cpp") and "\\" not in s]
            lab = " | ".join(s[:40] for s in ss[:3])
        self._flabel[rva] = lab
        return lab

    def annotate(self, ins) -> str:
        line = f"{ins.address - self.d.base:08x} {ins.mnemonic:8s} {ins.op_str}"
        t = self.target(ins)
        if t is not None:
            s = self.str_at.get(t)
            if s is not None:
                line += f"    ; \"{s[:120]}\""
            else:
                f = self.d.func_of(t)
                if f and f[0] == t:
                    line += f"    ; fn {t:08x} {self.flabel(t)}"
                else:
                    line += f"    ; @{t:08x}"
        elif ins.mnemonic in ("call", "jmp") and ins.op_str.startswith("0x"):
            t = int(ins.op_str, 16) - self.d.base
            f = self.d.func_of(t)
            if ins.mnemonic == "call" or (f and f[0] == t):
                line += f"    ; {self.flabel(t)}"
        return line

    def run(self, cmd: str) -> None:
        a = cmd.split()
        op = a[0]
        print(f"=== {cmd}")
        if op == "xref":
            pat = " ".join(a[1:])
            for off, s in self.d.strings(pat, 4):
                print(f"string {off:08x}: {s[:160]}")
                for r in self.d.refs_to(off):
                    f = self.d.func_of(self.d.text_rva + r)
                    print(f"    ref {self.d.text_rva + r:08x} in {f[0]:08x}..{f[1]:08x}" if f else
                          f"    ref {self.d.text_rva + r:08x}")
            return
        if op == "range":
            lo, hi = (int(x, 16) for x in a[1].split(":"))
            for i in self.d.dis(lo, hi):
                print(self.annotate(i))
            return
        rva = int(a[1], 16)
        n = int(a[2]) if len(a) > 2 else 100000
        if op in ("ann", "dis"):
            f = self.d.func_of(rva)
            if not f:
                print("no function holds", a[1])
                return
            print(f"function {f[0]:08x}..{f[1]:08x} ({f[1] - f[0]} bytes)")
            for i in self.d.dis(f[0], f[1])[:n]:
                print(self.annotate(i))
        elif op == "callers":
            for c in self.d.calls_to(rva):
                f = self.d.func_of(c)
                print(f"call {c:08x} in {f[0]:08x} {self.flabel(f[0])}" if f else f"call {c:08x}")
        elif op == "gref":
            seen = set()
            for r in self.d.refs_to(rva):
                f = self.d.func_of(self.d.text_rva + r)
                k = f[0] if f else None
                print(f"ref {self.d.text_rva + r:08x} in {k:08x} {self.flabel(k)}" if f else
                      f"ref {self.d.text_rva + r:08x}")
                seen.add(k)
        elif op == "fld":
            # the functions holding an instruction whose memory operand has
            # displacement RVA (a struct field), with those instructions
            pat = struct.pack("<I", rva)
            hits = {}
            for m in re.finditer(re.escape(pat), self.d.text):
                f = self.d.func_of(self.d.text_rva + m.start())
                if f:
                    hits.setdefault(f, []).append(self.d.text_rva + m.start())
            needle = f"+ {rva:#x}]"
            for f, offs in sorted(hits.items()):
                lines = [self.annotate(i) for i in self.d.dis(f[0], f[1])
                         if needle in i.op_str and any(i.address - self.d.base <= o < i.address - self.d.base + i.size
                                                       for o in offs)]
                if lines:
                    print(f"fn {f[0]:08x}..{f[1]:08x} {self.flabel(f[0])}")
                    for ln in lines:
                        print("   ", ln)
        elif op == "s":
            print(self.str_at.get(rva, "(no string)"))
        elif op == "strs":
            f = self.d.func_of(rva)
            for s in self.fstrings(f):
                print("  ", s[:160])
        elif op == "vt":
            for k in range(n if n < 100000 else 16):
                p = struct.unpack_from("<Q", self.d.image, rva + 8 * k)[0] - self.d.base
                print(f"[{k:3d}] +{8 * k:#05x} {p:08x} {self.flabel(p) if 0 <= p < len(self.d.image) else ''}")
        elif op == "dq":
            b = self.d.image[rva:rva + 16]
            print("i32", struct.unpack_from("<4i", b), "f32", struct.unpack_from("<4f", b),
                  "f64", struct.unpack_from("<2d", b))


def main() -> int:
    args = sys.argv[1:]
    path = DEFAULT
    if args[:1] == ["--dll"]:
        path, args = args[1], args[2:]
    q = Q(path)
    for c in args:
        q.run(c)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
