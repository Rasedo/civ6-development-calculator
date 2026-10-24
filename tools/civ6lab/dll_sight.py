"""Run the game's unit sight walk (Release 0x58b1d0) under the unicorn CPU
emulator on a map, to check `losDisk` / `sight_walk` against the shipped code.

    python tools/civ6lab/dll_sight.py <map.json> x y range [seeFeatures] [seeTerrain]

prints the (plot, ring) list the DLL builds. The map JSON: {"W", "H", "wrapX",
"tiles": [{"e": terrain height, "f": feature height, "eye": the eye's height
(`eyeHeight`), "col", "row", "elev", "feat"}]} in plot-index order. The walk's
callees are answered here: the map object (0x5d3c0: width +0x28, height +0x2c,
wrapX +0x40), the eye's height (0x58af70), a plot's heights (0x58d1c0),
__chkstk, memset, floorf and the asserts; the distance (0x58ae50) and the fixed
point multiply (0x16e7d0) run as shipped. Needs `unicorn` and `pefile` (the
pylibs folder `h3_dis.py` names).
"""
from __future__ import annotations

import json
import math
import pathlib
import struct
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / ".claude" / "scratchpad" / "pylibs"))
import pefile  # noqa: E402
from unicorn import UC_ARCH_X86, UC_HOOK_CODE, UC_MODE_64, Uc  # noqa: E402
from unicorn.x86_const import (UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_R8, UC_X86_REG_R9,  # noqa: E402
                               UC_X86_REG_RAX, UC_X86_REG_RCX, UC_X86_REG_RDX, UC_X86_REG_RIP, UC_X86_REG_RSP,
                               UC_X86_REG_XMM0)

DLL = (r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI"
       r"\DLC\Expansion2\Binaries\Win64\GameCore_XP2_Release.dll")
FN = 0x58B1D0
STACK, HEAP, STOP = 0x10000000, 0x20000000, 0x30000000
STUBS = {0x5D3C0: "map", 0x58AF70: "eye", 0x58D1C0: "through", 0xCEE930: "chkstk", 0xCEF2EE: "memset",
         0xCEF31E: "floorf", 0xCC4570: "assert", 0x56F840: "grow"}

_PE = None


class Emu:
    def __init__(self):
        global _PE
        if _PE is None:
            pe = pefile.PE(DLL, fast_load=True)
            _PE = (pe.OPTIONAL_HEADER.ImageBase, pe.get_memory_mapped_image())
        self.base, img = _PE
        self.mu = Uc(UC_ARCH_X86, UC_MODE_64)
        self.mu.mem_map(self.base, (len(img) + 0xFFF) & ~0xFFF)
        self.mu.mem_write(self.base, img)
        self.mu.mem_map(STACK, 0x200000)
        self.mu.mem_map(HEAP, 0x200000)
        self.mu.mem_map(STOP, 0x1000)
        self.mu.mem_write(STOP, b"\xc3")
        for a in STUBS:
            self.mu.hook_add(UC_HOOK_CODE, self._stub, begin=self.base + a, end=self.base + a)
        self.map = None

    def load(self, m):
        self.map = m
        self.W, self.H = m["W"], m["H"]
        # the map object: width +0x28, height +0x2c, wrapX +0x40, wrapY +0x41
        obj = bytearray(0x100)
        struct.pack_into("<ii", obj, 0x28, self.W, self.H)
        obj[0x40] = 1 if m["wrapX"] else 0
        obj[0x41] = 0
        self.mu.mem_write(HEAP, bytes(obj))

    def _ret(self, uc, val=None):
        if val is not None:
            uc.reg_write(UC_X86_REG_RAX, val & 0xFFFFFFFFFFFFFFFF)
        rsp = uc.reg_read(UC_X86_REG_RSP)
        uc.reg_write(UC_X86_REG_RIP, struct.unpack("<Q", uc.mem_read(rsp, 8))[0])
        uc.reg_write(UC_X86_REG_RSP, rsp + 8)

    def _plot(self, x, y):
        x = struct.unpack("<i", struct.pack("<I", x & 0xFFFFFFFF))[0]
        y = struct.unpack("<i", struct.pack("<I", y & 0xFFFFFFFF))[0]
        assert 0 <= x < self.W and 0 <= y < self.H, (x, y)
        return self.map["tiles"][y * self.W + x]

    def _stub(self, uc, addr, size, user):
        what = STUBS[addr - self.base]
        if what == "map":
            self._ret(uc, HEAP)
        elif what == "eye":
            t = self._plot(uc.reg_read(UC_X86_REG_EDX), uc.reg_read(UC_X86_REG_R8))
            self._ret(uc, t["eye"])
        elif what == "through":
            t = self._plot(uc.reg_read(UC_X86_REG_ECX), uc.reg_read(UC_X86_REG_EDX))
            feat = uc.reg_read(UC_X86_REG_R8) & 0xFF
            terr = uc.reg_read(UC_X86_REG_R9) & 0xFF
            self.calls.append((t["col"], t["row"], feat, terr))
            self._ret(uc, (t["e"] if terr else 0) + (t["f"] if feat else 0))
        elif what == "chkstk":
            self._ret(uc)
        elif what == "memset":
            dst, val, n = uc.reg_read(UC_X86_REG_RCX), uc.reg_read(UC_X86_REG_EDX) & 0xFF, uc.reg_read(UC_X86_REG_R8)
            uc.mem_write(dst, bytes([val]) * n)
            self._ret(uc, dst)
        elif what == "floorf":
            x = uc.reg_read(UC_X86_REG_XMM0)
            f = struct.unpack("<f", struct.pack("<I", x & 0xFFFFFFFF))[0]
            uc.reg_write(UC_X86_REG_XMM0, (x & ~0xFFFFFFFF) | struct.unpack("<I", struct.pack("<f", math.floor(f)))[0])
            self._ret(uc)
        elif what == "assert":
            self._ret(uc, 0)
        elif what == "grow":
            raise RuntimeError("list grow")

    def sight(self, x, y, rng, see_feat=0, see_terr=0):
        self.calls = []
        lst = HEAP + 0x1000
        buf = HEAP + 0x2000
        self.mu.mem_write(lst, struct.pack("<QIIII", buf, 100000, 0, 0, 0))
        rsp = STACK + 0x180000
        frame = bytearray(0x60)
        struct.pack_into("<Q", frame, 0, STOP)
        frame[0x28] = see_feat
        frame[0x30] = see_terr
        struct.pack_into("<Q", frame, 0x38, lst)
        self.mu.mem_write(rsp, bytes(frame))
        for reg, val in ((UC_X86_REG_RSP, rsp), (UC_X86_REG_RCX, 0), (UC_X86_REG_RDX, rng),
                         (UC_X86_REG_R8, x), (UC_X86_REG_R9, y)):
            self.mu.reg_write(reg, val)
        self.mu.emu_start(self.base + FN, STOP)
        n = struct.unpack("<I", self.mu.mem_read(lst + 0x10, 4))[0]
        out = []
        for i in range(n):
            p, ring = struct.unpack("<ii", self.mu.mem_read(buf + 8 * i, 8))
            out.append((p, ring))
        return out


if __name__ == "__main__":
    m = json.loads(pathlib.Path(sys.argv[1]).read_text())
    e = Emu()
    e.load(m)
    x, y, r = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    sf = int(sys.argv[5]) if len(sys.argv) > 5 else 0
    st = int(sys.argv[6]) if len(sys.argv) > 6 else 0
    res = e.sight(x, y, r, sf, st)
    W = m["W"]
    for p, ring in res:
        t = m["tiles"][p]
        print(f"({p % W},{p // W}) ring {ring} e{t['e']} f{t['f']} {t['elev']} {t['feat']}")
    print(len(res), "plots;", len(e.calls), "through calls")
