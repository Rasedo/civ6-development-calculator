"""THE BUILDING VALUE'S PARTS, LOGGED LIVE: the last terms of the building
value (FinalRelease 0x52b900, Release 0x7a7590) recorded per call in a
running instance, without holding the game.

    python tools/civ6lab/bvlog.py --host 127.0.0.2 install --buildings 5,12
    python tools/civ6lab/bvlog.py --host 127.0.0.2 read --out runs/x.bvlog.jsonl [--player 4]
    python tools/civ6lab/bvlog.py --host 127.0.0.2 uninstall

`install` writes into the process only (the install's DLL untouched; the
replay patch's .text slack must be mapped, `game.py patch apply`): a
buffer of 64-byte records and the stubs in memory of its own
(VirtualAllocEx), a 14-byte absolute jump per site in the .text slack at
0x9b6660 (the slack aimem_hook.py uses: never both at once), and each
site's `call` re-aimed at its jump, the process suspended meanwhile. A
site's stub puts its own return in the call's return slot and jumps to
the original callee; the callee returns into the stub, which, in the
building value's frame (rbp), appends a record when the building is one
asked for (a lock xadd on the buffer's count; thread-safe, no hold) and
jumps back to the call's return. Only rcx, rdx, r8-r11 and the flags are
written, all dead after a call.

The sites (FinalRelease; the Release twins):
  1 0x52c891 -> 0x527fd0  the claimed plots value (0x7a965e -> 0x7a10c0)
  2 0x52c950 -> 0x529ed0  the modifiers' sum (0x7a97a0 -> 0x7a4b20)
  3 0x52ca89 -> 0x04fa40  the neighbours walk, its sum [rsp+0x40]
                          (0x7a9943 -> 0x6b1b0, [rsp+0x48])
  4 0x52caa4 -> 0x9908f0  the end: r15d the value's whole sum
A record: site, building, T, H, the plot's x, y, the city's id (+0xa8),
its owner (+0xd8), the term (24.8 fixed point), the sum before it (r15d),
the visited-plots list's count (arg 9 +0x10), the game turn, the building
value's caller (an RVA), the thread id.
"""
from __future__ import annotations

import argparse
import ctypes
import ctypes.wintypes as wt
import json
import pathlib
import struct
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import procmem  # noqa: E402
from aimem_hook import Asm  # noqa: E402

DLL = "GameCore_XP2_FinalRelease.dll"
GAME = 0xB8AA68
SLACK = 0x9B6660
SLACK_END = 0x9B6800
# (site, the call's RVA, its callee, the term's source)
SITES = (
    (1, 0x52C891, 0x527FD0, "rax"),
    (2, 0x52C950, 0x529ED0, "rax"),
    (3, 0x52CA89, 0x04FA40, "rsp40"),
    (4, 0x52CAA4, 0x9908F0, "none"),
    (5, 0x3E3EDD, 0x52A050, "table"),
)
CAP = 1 << 20
REC = 64
HDR = 0x40               # buffer header: +0 count, +8 filter A, +0xc filter B, +0x10 the magic
MAGIC = 0xB71D0C0D
CODE_SIZE = 0x1000
DONE = 0x600DF00D

_k32 = ctypes.WinDLL("kernel32", use_last_error=True)
_k32.VirtualAllocEx.restype = ctypes.c_void_p
_k32.VirtualAllocEx.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.c_size_t, wt.DWORD, wt.DWORD]
_k32.VirtualFreeEx.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.c_size_t, wt.DWORD]
_ntdll = ctypes.WinDLL("ntdll")


def _table_post(a, n: int, rva: int, hdr: int, base: int) -> None:
    """the buildings table's store (0x3e2aa0 after 0x52a050; Release 0x5ce970
    after 0x7a4d40): r15d the building, [rax] its value, [rbp+0xb0] the plot
    evaluation; the record carries the table's two filtered slots as they
    stand (in T and H), the table's address (in the caller's place) and
    owner 0xffff"""
    a.b("4489f9")                                                    # mov ecx, r15d
    a.rip("448b05", hdr + 8).b("4183f8ff").j8("74", f"go{n}")
    a.b("4439c1").j8("74", f"go{n}")
    a.rip("3b0d", hdr + 0xC).j32("0f85", f"done{n}")
    a.label(f"go{n}")
    a.b("41b801000000").rip("f0440fc105", hdr)
    a.b("4181f8").b(struct.pack("<I", CAP).hex()).j32("0f83", f"done{n}")
    a.b("49c1e006").rip("4c8d0d", hdr + HDR).b("4d01c1")
    a.b("41c701").b(struct.pack("<I", n).hex()).b("41894904")
    a.b("4c8b95b0000000 4d8b5228 4d895130")                          # the table
    a.rip("4c631d", hdr + 8).b("438b149a 41895108")                  # table[A]
    a.rip("4c631d", hdr + 0xC).b("438b149a 4189510c")                # table[B]
    a.b("8b10 41895120")                                             # the value stored
    a.b("41c7411cffff0000")
    a.b("49ba").b(struct.pack("<Q", base + GAME).hex()).b("4d8b12 418b92c0000000 4189512c")
    a.b("658b142548000000 41895138")
    a.b("41c7413c").b(struct.pack("<I", DONE).hex())
    a.label(f"done{n}")
    a.b("58").b("49bb").b(struct.pack("<Q", base + rva + 5).hex()).b("41ffe3")


def build(mem: int, base: int) -> bytes:
    """the stubs at `mem` (the header and the records follow at mem + CODE_SIZE)"""
    hdr = mem + CODE_SIZE
    a = Asm(mem)
    for n, rva, callee, term in SITES:
        a.label(f"pre{n}")
        a.rip("4c8d1d", f"post{n}").b("4c891c24")                  # lea r11, post; mov [rsp], r11
        a.b("49bb").b(struct.pack("<Q", base + callee).hex()).b("41ffe3")
        a.label(f"post{n}")
        a.b("50")                                                    # push rax
        if term == "table":
            _table_post(a, n, rva, hdr, base)
            continue
        a.b("8b8df8010000")                                          # mov ecx, [rbp+0x1f8] the building
        a.rip("448b05", hdr + 8).b("4183f8ff").j8("74", f"go{n}")   # filter A -1: every building
        a.b("4439c1").j8("74", f"go{n}")
        a.rip("3b0d", hdr + 0xC).j32("0f85", f"done{n}")
        a.label(f"go{n}")
        a.b("41b801000000").rip("f0440fc105", hdr)                  # lock xadd [count], r8d
        a.b("4181f8").b(struct.pack("<I", CAP).hex()).j32("0f83", f"done{n}")
        a.b("49c1e006").rip("4c8d0d", hdr + HDR).b("4d01c1")        # r9 = the record
        a.b("41c701").b(struct.pack("<I", n).hex()).b("41894904")   # site, building
        a.b("8b9508020000 41895108 8b9510020000 4189510c")         # T, H
        a.b("4c8b9528020000 418b12 41895110 418b5204 41895114")     # x, y
        a.b("4c8b9520020000 418b92a8000000 41895118 410fb792d8000000 4189511c")  # city id, owner
        a.b({"rax": "8b10", "rsp40": "8b542448", "none": "31d2"}[term]).b("41895120")
        a.b("45897924")                                              # r15d the sum before
        a.b("4c8b9530020000 418b5210 41895128")                      # the list's count
        a.b("49ba").b(struct.pack("<Q", base + GAME).hex()).b("4d8b12 418b92c0000000 4189512c")  # turn
        a.b("4c8b95e8010000 4d895130")                               # the caller
        a.b("658b142548000000 41895138")                             # the thread id
        a.b("41c7413c").b(struct.pack("<I", DONE).hex())
        a.label(f"done{n}")
        a.b("58").b("49bb").b(struct.pack("<Q", base + rva + 5).hex()).b("41ffe3")
    code = a.assemble()
    assert len(code) <= CODE_SIZE
    build.labels = a.labels
    return code


def _alloc(pm, n: int) -> int:
    p = _k32.VirtualAllocEx(ctypes.c_void_p(pm.h), None, n, 0x3000, 0x40)
    if not p:
        raise procmem.MemError(f"VirtualAllocEx failed: {ctypes.get_last_error()}")
    return p


def _sites(pm, base: int):
    for n, rva, callee, _ in SITES:
        yield n, rva, callee, pm.read(base + rva, 5)


def cmd_install(a, pm, base) -> int:
    if pm.read(base + SLACK, 2) == b"\xff\x25":
        print("already installed: uninstall first")
        return 1
    for n, rva, callee, have in _sites(pm, base):
        want = b"\xe8" + struct.pack("<i", callee - (rva + 5))
        if have != want:
            raise RuntimeError(f"site {n} at {rva:#x} holds {have.hex()}, not {want.hex()}")
    mem = _alloc(pm, CODE_SIZE + HDR + CAP * REC)
    code = build(mem, base)
    blds = [int(x) for x in a.buildings.split(",")] if a.buildings else [-1]
    fa, fb = blds[0], (blds[1] if len(blds) > 1 else blds[0])
    hdr = struct.pack("<QiiIQ", 0, fa, fb, MAGIC, mem).ljust(HDR, b"\0")
    tramp = b"".join(b"\xff\x25\x00\x00\x00\x00" + struct.pack("<Q", build.labels[f"pre{n}"]) for n, *_ in SITES)
    assert SLACK + len(tramp) + 8 <= SLACK_END
    pm.write(mem, code)
    pm.write(mem + CODE_SIZE, hdr)
    _ntdll.NtSuspendProcess(ctypes.c_void_p(pm.h))
    try:
        pm.protect(base + SLACK, SLACK_END - SLACK)
        pm.write(base + SLACK_END - 8, struct.pack("<Q", mem))   # where `read` finds the buffer
        pm.write(base + SLACK, tramp)
        for i, (n, rva, callee, _) in enumerate(_sites(pm, base)):
            old = pm.protect(base + rva, 5)
            pm.write(base + rva + 1, struct.pack("<i", SLACK + 14 * i - (rva + 5)))
            pm.protect(base + rva, 5, old)
    finally:
        _ntdll.NtResumeProcess(ctypes.c_void_p(pm.h))
    print(f"installed: buffer {mem:#x}, buildings {fa},{fb}")
    return 0


def cmd_uninstall(a, pm, base) -> int:
    _ntdll.NtSuspendProcess(ctypes.c_void_p(pm.h))
    try:
        for n, rva, callee, _ in _sites(pm, base):
            old = pm.protect(base + rva, 5)
            pm.write(base + rva + 1, struct.pack("<i", callee - (rva + 5)))
            pm.protect(base + rva, 5, old)
        pm.write(base + SLACK, bytes(14 * len(SITES)))
    finally:
        _ntdll.NtResumeProcess(ctypes.c_void_p(pm.h))
    print("sites restored, the jumps cleared (the buffer and stubs stay mapped; `read` reads the last buffer)")
    return 0


def cmd_read(a, pm, base) -> int:
    mem = pm.u64(base + SLACK_END - 8)
    h = pm.read(mem + CODE_SIZE, 32)
    count, fa, fb, magic, _ = struct.unpack("<QiiIQ", h[:28])
    if magic != MAGIC:
        print("no buffer")
        return 1
    n = min(count & 0xFFFFFFFF, CAP)
    out, kept = open(a.out, "w", encoding="utf-8", newline="\n"), 0
    step = 4096
    for i in range(0, n, step):
        raw = pm.read(mem + CODE_SIZE + HDR + i * REC, min(step, n - i) * REC)
        for j in range(0, len(raw), REC):
            (site, bld, t, hz, x, y, city, owner, term, before, lst, turn, caller, tid,
             done) = struct.unpack("<IIiiiiiIiiIIQII", raw[j:j + REC])
            if done != DONE or (a.player is not None and owner not in (a.player, 0xFFFF)):
                continue
            if owner == 0xFFFF:
                out.write(json.dumps({"site": site, "building": bld, "value": term / 256, "slotA": t / 256,
                                      "slotB": hz / 256, "table": hex(caller), "turn": turn, "tid": tid}) + "\n")
                kept += 1
                continue
            out.write(json.dumps({"site": site, "building": bld, "T": t, "H": hz, "x": x, "y": y, "city": city,
                                  "owner": owner, "term": term / 256, "before": before / 256, "list": lst,
                                  "turn": turn, "caller": hex(caller - base), "tid": tid}) + "\n")
            kept += 1
    out.close()
    print(f"{n} records ({count} counted), {kept} written -> {a.out}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.2")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("install")
    s.add_argument("--buildings", default="", help="at most two building indices (default every building)")
    sub.add_parser("uninstall")
    s = sub.add_parser("read")
    s.add_argument("--out", required=True)
    s.add_argument("--player", type=int)
    a = p.parse_args()
    pm = procmem.ProcMem.of_host(a.host)
    base = pm.module(DLL)
    if not base:
        print("the game DLL is not loaded")
        return 1
    return {"install": cmd_install, "uninstall": cmd_uninstall, "read": cmd_read}[a.cmd](a, pm, base)


if __name__ == "__main__":
    sys.exit(main())
