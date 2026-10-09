"""Run a leaf routine of the game DLL under the unicorn CPU emulator, to check a
port of its arithmetic against the shipped code itself.

    python tools/civ6lab/dll_emu.py pv [--dll fr|rel] V RATE N [N ...]

`pv` calls the AI's present value (FinalRelease 0x528310, Release 0x7a16e0)
with V and RATE in 24.8 fixed point and N turns, and prints its result beside
`dll_citybuild.pv_fixed`. The routine's only callee is floorf, answered here.
Needs `unicorn` (pip install unicorn --target <the pylibs folder>).
"""
from __future__ import annotations

import math
import pathlib
import struct
import sys

import pefile
from unicorn import UC_ARCH_X86, UC_HOOK_CODE, UC_MODE_64, Uc
from unicorn.x86_const import UC_X86_REG_R8, UC_X86_REG_R9, UC_X86_REG_RCX, UC_X86_REG_RDX, UC_X86_REG_RIP, \
    UC_X86_REG_RSP, UC_X86_REG_XMM0

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from dll_citybuild import pv_fixed  # noqa: E402

WIN64 = pathlib.Path(r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI"
                     r"\DLC\Expansion2\Binaries\Win64")
# (file, the present value's RVA, the floorf thunk's RVA)
DLLS = {"fr": ("GameCore_XP2_FinalRelease.dll", 0x528310, 0x9B0FBE),
        "rel": ("GameCore_XP2_Release.dll", 0x7A16E0, 0xCEF31E)}
STACK, DATA, STOP = 0x10000000, 0x20000000, 0x30000000


class Emu:
    def __init__(self, which: str):
        name, self.fn, floor = DLLS[which]
        pe = pefile.PE(str(WIN64 / name), fast_load=True)
        img = pe.get_memory_mapped_image()
        self.base = pe.OPTIONAL_HEADER.ImageBase
        self.mu = Uc(UC_ARCH_X86, UC_MODE_64)
        self.mu.mem_map(self.base, (len(img) + 0xFFF) & ~0xFFF)
        self.mu.mem_write(self.base, img)
        for at in (STACK, DATA, STOP):
            self.mu.mem_map(at, 0x100000 if at == STACK else 0x1000)
        self.mu.mem_write(STOP, b"\xc3")
        self.mu.hook_add(UC_HOOK_CODE, self._floorf, begin=self.base + floor, end=self.base + floor + 1)

    def _floorf(self, uc, addr, size, user):
        x = uc.reg_read(UC_X86_REG_XMM0)
        f = struct.unpack("<f", struct.pack("<I", x & 0xFFFFFFFF))[0]
        uc.reg_write(UC_X86_REG_XMM0, (x & ~0xFFFFFFFF) | struct.unpack("<I", struct.pack("<f", math.floor(f)))[0])
        rsp = uc.reg_read(UC_X86_REG_RSP)
        uc.reg_write(UC_X86_REG_RIP, struct.unpack("<Q", uc.mem_read(rsp, 8))[0])
        uc.reg_write(UC_X86_REG_RSP, rsp + 8)

    def pv(self, v: int, rate: int, n: int) -> int:
        self.mu.mem_write(DATA, struct.pack("<iii", 0, v, rate))
        rsp = STACK + 0x80000
        self.mu.mem_write(rsp, struct.pack("<Q", STOP))
        for reg, val in ((UC_X86_REG_RSP, rsp), (UC_X86_REG_RCX, DATA), (UC_X86_REG_RDX, DATA + 4),
                         (UC_X86_REG_R8, DATA + 8), (UC_X86_REG_R9, n & 0xFFFFFFFF)):
            self.mu.reg_write(reg, val)
        self.mu.emu_start(self.base + self.fn, STOP)
        return struct.unpack("<i", self.mu.mem_read(DATA, 4))[0]


def main(argv: list[str]) -> int:
    if not argv or argv[0] != "pv":
        print(__doc__)
        return 2
    args = argv[1:]
    which = "fr"
    if args[:1] == ["--dll"]:
        which, args = args[1], args[2:]
    v, rate, ns = int(args[0]), int(args[1]), [int(a) for a in args[2:]]
    emu = Emu(which)
    bad = 0
    for n in ns:
        got, port = emu.pv(v, rate, n), pv_fixed(v, rate, n)
        bad += got != port
        print(f"n {n:4d}  dll {got:7d} ({got / 256:9.4f})  pv_fixed {port:7d}{'' if got == port else '  DIFFERS'}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
