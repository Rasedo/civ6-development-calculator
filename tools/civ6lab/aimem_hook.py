"""THE AI MEMORY HOOKS: a running game's GameCore_XP2_FinalRelease.dll held
at chosen moments of a player's AI turn while a reader outside the process
reads its memory (`aimem.py`).

`install(pm, base)` writes, into the process only (the install's DLL is
untouched), a stub per site in the .text section's file slack (the cave
past the replay patch's, `game.py`) and a 5-byte `jmp` over each site's
first instructions, the process suspended while it writes. A site's stub
calls the common routine, runs the displaced instructions and jumps back.
The common routine does nothing while the mailbox's gate is 0; with the
gate set it takes the mailbox's lock, stores the site number, rcx, rdx, r8,
r9, the site's return address and stack pointer, increments the sequence
number and spins (PAUSE) until the reader writes that number to the
acknowledgement — or about 40 s pass — then releases the lock. The game
thread so stands still at the site while the reader reads; nothing the
game computes changes. Only rax, r10, r11 and the flags are written, all
volatile at a function's entry.

The sites (FinalRelease RVAs; the Release twins in dll_readings.md "H-1:
the AI memory reader"):
  1 0x5146e0  the tactical turn's knowledge step (player signal +0x1f8):
              rcx the player's Targets (AI::Targets, +0x108 its player),
              edx the player signalled, r8b set when it runs
  2 0x3f3e90  the knowledge base's log (AI_Knowledge.csv, the logs'
              moment): rcx the knowledge base (+0x6e8 its player)
  3 0x515d70  the knowledge look's entry: rcx the Targets; returning to
              0x51471a it is the tactical turn's look, else the end look
              (player signal +0x228), whose return is redirected to site 4
  4 (return)  the end look done: rcx/rdx as the look left them; the
              mailbox's LOOK slot holds the Targets the look ran on
  5 0x5a8250  a player's turn start, PlayerTurnStarted's raise: rdx the
              player
"""
from __future__ import annotations

import ctypes
import struct

CAVE = 0x9B6660          # stubs, after the replay patch's cave (0x9b6630..0x9b6651)
MAIL = 0x9B67C0          # the mailbox (64 bytes) in the same slack
END = 0x9B6800           # the .text section's raw end
TACTICAL_LOOK_RET = 0x51471A

# mailbox offsets
GATE, LOCK, SEQ, ACK, SITE = 0x00, 0x04, 0x08, 0x0C, 0x10
RCX, RDX, R8, R9, RET, RSP, SAVED, LOOK = 0x18, 0x20, 0x28, 0x30, 0x38, 0x40, 0x48, 0x50
MAIL_SIZE = 0x58

# (site number, RVA, the displaced bytes it must hold, the displaced code as the stub re-emits it)
SITES = (
    (1, 0x5146E0, bytes.fromhex("4584c07463"), "tactical"),
    (2, 0x3F3E90, bytes.fromhex("40565748 83ec78".replace(" ", "")), "kblog"),
    (3, 0x515D70, bytes.fromhex("488bc448894808"), "look"),
    (5, 0x5A8250, bytes.fromhex("48895c2408"), "start"),
)


class Asm:
    """a tiny two-pass assembler: bytes, RIP-relative operands to absolute
    RVAs, rel8 / rel32 branches to labels or RVAs"""

    def __init__(self, at: int):
        self.at = at
        self.items: list = []
        self.labels: dict[str, int] = {}

    def b(self, hexs: str) -> "Asm":
        self.items.append(("b", bytes.fromhex(hexs.replace(" ", ""))))
        return self

    def rip(self, prefix: str, target, suffix: bytes = b"") -> "Asm":
        """prefix bytes, disp32 to `target` (an RVA or a label), suffix bytes
        (an immediate after the displacement)"""
        self.items.append(("rip", bytes.fromhex(prefix.replace(" ", "")), target, suffix))
        return self

    def j8(self, op: str, target: str) -> "Asm":
        self.items.append(("j8", bytes.fromhex(op), target))
        return self

    def j32(self, op: str, target) -> "Asm":
        self.items.append(("j32", bytes.fromhex(op), target))
        return self

    def label(self, name: str) -> "Asm":
        self.items.append(("label", name))
        return self

    @staticmethod
    def _size(it) -> int:
        k = it[0]
        if k == "b":
            return len(it[1])
        if k == "rip":
            return len(it[1]) + 4 + len(it[3])
        if k == "j8":
            return len(it[1]) + 1
        if k == "j32":
            return len(it[1]) + 4
        return 0

    def assemble(self, external: dict[str, int] | None = None) -> bytes:
        pos = self.at
        for it in self.items:
            if it[0] == "label":
                self.labels[it[1]] = pos
            pos += self._size(it)
        labels = {**(external or {}), **self.labels}
        out = bytearray()
        pos = self.at
        for it in self.items:
            k = it[0]
            n = self._size(it)
            end = pos + n
            if k == "b":
                out += it[1]
            elif k == "rip":
                tgt = labels[it[2]] if isinstance(it[2], str) else it[2]
                out += it[1] + struct.pack("<i", tgt - end) + it[3]
            elif k == "j8":
                d = labels[it[2]] - end
                assert -128 <= d < 128, (it, d)
                out += it[1] + struct.pack("<b", d)
            elif k == "j32":
                tgt = labels[it[2]] if isinstance(it[2], str) else it[2]
                out += it[1] + struct.pack("<i", tgt - end)
            pos = end
        return bytes(out)


def build(base: int) -> tuple[bytes, list[tuple[int, bytes]]]:
    """the cave's code (at CAVE) and each site's jump [(rva, bytes)]"""
    m = lambda off: MAIL + off  # noqa: E731
    a = Asm(CAVE)
    # -- the common routine: r10d the site number
    a.label("common")
    a.rip("8b05", m(GATE)).b("85c0").j8("74", "ret")
    a.label("acq")
    a.b("b801000000").rip("8705", m(LOCK)).b("85c0").j8("74", "got").b("f390").j8("eb", "acq")
    a.label("got")
    a.rip("448915", m(SITE)).rip("48890d", m(RCX)).rip("488915", m(RDX)).rip("4c8905", m(R8)).rip("4c890d", m(R9))
    a.b("488b442408").rip("488905", m(RET)).b("488d442408").rip("488905", m(RSP))
    a.b("41bbffffff7f")                                  # mov r11d, 0x7fffffff: the spin's bound
    a.rip("f0ff05", m(SEQ)).rip("8b05", m(SEQ))         # lock inc [SEQ]; mov eax, [SEQ]
    a.label("spin")
    a.b("f390").b("41ffcb").j8("74", "rel").rip("3b05", m(ACK)).j8("75", "spin")
    a.label("rel")
    a.rip("c705", m(LOCK), struct.pack("<I", 0))
    a.label("ret")
    a.b("c3")
    # -- site 1: the tactical turn's knowledge step
    a.label("s1").b("41ba01000000").j32("e8", "common")
    a.b("4584c0").j32("0f84", 0x514748).j32("e9", 0x5146E5)
    # -- site 2: the knowledge base's log
    a.label("s2").b("41ba02000000").j32("e8", "common")
    a.b("4056 57 4883ec78").j32("e9", 0x3F3E97)
    # -- site 3: the look; an end look's return goes through site 4
    a.label("s3").b("41ba03000000").j32("e8", "common")
    a.rip("8b05", m(GATE)).b("85c0").j8("74", "s3d")
    a.b("488b0424").b("49bb").b(struct.pack("<Q", base + TACTICAL_LOOK_RET).hex()).b("4c39d8").j8("74", "s3d")
    a.rip("488905", m(SAVED)).rip("48890d", m(LOOK)).rip("488d05", "s4").b("48890424")
    a.label("s3d")
    a.b("488bc4 48894808").j32("e9", 0x515D77)
    # -- site 4: the end look returned
    a.label("s4")
    a.rip("ff35", m(SAVED)).b("50").b("41ba04000000").j32("e8", "common")
    a.b("58").b("415b").b("41ffe3")
    # -- site 5: a player's turn start (PlayerTurnStarted's raise; rdx the player)
    a.label("s5").b("41ba05000000").j32("e8", "common")
    a.b("48895c2408").j32("e9", 0x5A8255)
    code = a.assemble()
    assert CAVE + len(code) <= MAIL, hex(CAVE + len(code))
    jumps = []
    for n, rva, disp, _ in SITES:
        tgt = a.labels[f"s{n}"]
        jumps.append((rva, b"\xe9" + struct.pack("<i", tgt - (rva + 5)) + b"\x90" * (len(disp) - 5)))
    return code, jumps


_ntdll = ctypes.WinDLL("ntdll")


def install(pm, base: int) -> str:
    """write the stubs and the sites' jumps into the process (suspended
    meanwhile); 'installed', 'already' (the jumps there), or raises when a
    site's bytes are neither the original nor the hook"""
    code, jumps = build(base)
    have = [pm.read(base + rva, len(j)) for rva, j in jumps]
    if all(h == j for h, (_, j) in zip(have, jumps)) and pm.read(base + CAVE, len(code)) == code:
        pm.protect(base + MAIL, MAIL_SIZE)
        return "already"
    for (n, rva, disp, _), h, (_, j) in zip(SITES, have, jumps):
        if h not in (disp, j):
            raise RuntimeError(f"site {n} at {rva:#x} holds {h.hex()}, not {disp.hex()}")
    _ntdll.NtSuspendProcess(ctypes.c_void_p(pm.h))
    try:
        pm.protect(base + CAVE, END - CAVE)
        pm.write(base + MAIL, bytes(MAIL_SIZE))
        pm.write(base + CAVE, code)
        for (rva, j), h in zip(jumps, have):
            if h == j:
                continue
            old = pm.protect(base + rva, len(j))
            pm.write(base + rva, j)
            pm.protect(base + rva, len(j), old)
    finally:
        _ntdll.NtResumeProcess(ctypes.c_void_p(pm.h))
    return "installed"


def listing(base: int = 0x180000000) -> str:
    """the stubs disassembled (capstone), for a check by eye"""
    import sys
    import pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / ".claude" / "scratchpad" / "pylibs"))
    import capstone
    code, jumps = build(base)
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
    out = [f"{i.address:08x} {i.bytes.hex():24s} {i.mnemonic} {i.op_str}" for i in md.disasm(code, CAVE)]
    for rva, j in jumps:
        out += [f"site {rva:08x}: " + "; ".join(f"{i.mnemonic} {i.op_str}" for i in md.disasm(j, rva))]
    return "\n".join(out)


if __name__ == "__main__":
    print(listing())
