"""THE GOVERNMENT VALUE'S PARTS, LOGGED LIVE: the civics AI's government
values (FinalRelease 0x52fd20, Release 0x7b0330) and each of their
modifiers' analyses, recorded per call in a running instance, without
holding the game.

    python tools/civ6lab/govlog.py --host 127.0.0.2 install
    python tools/civ6lab/govlog.py --host 127.0.0.2 read --out runs/x.govlog.jsonl [--player 2]
    python tools/civ6lab/govlog.py --host 127.0.0.2 uninstall

The machinery is bvlog.py's (a call re-aimed at a stub that takes the
callee's return, appends a 64-byte record and jumps back; the .text slack
at 0x9b6660 for the jumps: never with bvlog.py or aimem_hook.py at once).
The sites (FinalRelease; the Release twins):
  1 0x529fff -> 0x9908f0  the modifiers' sum 0x529ed0 (Release 0x7a4b20)
                          after each modifier, only when it was called by
                          the government value (through site 3): the
                          running sum [r14], the modifier entry (rdi), its
                          analyzer object [rdi] and that object's vtable,
                          the entry's requirement-set key (+0x10), the
                          context's +0x40
  2 0x413cc5 -> 0x52fd20  the civics AI's turn storing a government value
                          (Release 0x620413 -> 0x7b0330): the government
                          (r12d), the player (r13 +0xd8), the value
  3 0x5300af -> 0x529ed0  inside the government value: the value before
                          the modifiers (edi), their sum, and the slot
                          bests it read (the culture AI +0x2f0, by
                          GovernmentSlots index, its first six) (the
                          function reuses its registers, so the government
                          and the player come from the site-2 or -4 record
                          that follows)
  4 0x418529 -> 0x52fd20  the government choice on a completed civic
                          (Release 0x625d70): the government (esi), the
                          player ([rdi+0x90] +0xd8), the value
  EFFECT_ADJUST_FLAT_BONUS's WONDER_CONSTRUCTION -> COMBAT_EXPERIENCE ->
  GREAT_PEOPLE fall-through (0x476060 from 0x476325; Release 0x6c5700
  from 0x6c5b9d), every call (the context's player r13 +0x80):
  5 0x47634e -> 0x1332f0  a city's Production (City::GetYield): [rax], the
                          best before (ebx), the city ([rdi] +0xa8)
  6 0x476386 -> 0x52af40  PSEUDOYIELD_WONDER of the Amount ([r14+8])
  7 0x4763e7 -> 0x528660  the wonder term: the best x that per turn
                          ([rbp-0x29]) from the context's start (+0xb4) to
                          its horizon (+0xb8)
  8 0x476420 -> 0x52af40  PSEUDOYIELD_UNIT_COMBAT of the Amount; the unit
                          count (edi, Player_Units +0xb8)
  9 0x4764a6 -> 0x528660  the combat experience term (its per turn
                          [rbp-0x29]); ebx the wonder term
 10 0x476580 -> 0x528660  a great person class's term (r14d its
                          pseudo-yield, [rbp-0x21] its per turn)
`read` writes one line per government value: the turn, the government,
the player, the value, the value before the modifiers, their sum, the
slot bests and each modifier's term (the entry, its analyzer object's and
vtable's RVAs: the analyzer names the EffectType, `dll_readings.md` "C-96
/ C-97: the AI's yield weights and the modifier evaluator"; a flat bonus
term carries its parts, `flat`).
"""
from __future__ import annotations

import argparse
import ctypes
import json
import pathlib
import struct
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import procmem  # noqa: E402
from aimem_hook import Asm  # noqa: E402
from bvlog import CAP, CODE_SIZE, DLL, DONE, GAME, HDR, MAGIC, REC, SLACK, SLACK_END, _alloc, _ntdll  # noqa: E402

SITES = (
    (1, 0x529FFF, 0x9908F0),
    (2, 0x413CC5, 0x52FD20),
    (3, 0x5300AF, 0x529ED0),
    (4, 0x418529, 0x52FD20),
    (5, 0x47634E, 0x1332F0),
    (6, 0x476386, 0x52AF40),
    (7, 0x4763E7, 0x528660),
    (8, 0x476420, 0x52AF40),
    (9, 0x4764A6, 0x528660),
    (10, 0x476580, 0x528660),
)
# the flat bonus's sites: the context's player, the result [rax], then each its own
FLAT_HEAD = "4d8b9580000000 410fb792d8000000 41895108 8b10 4189510c"
FLAT = {
    5: "41895910 4c8b17 418b92a8000000 41895114",
    6: "41895910 418b5608 41895118",
    7: "41895910 418b5608 41895118 8b55d7 4189511c 418b95b4000000 41895120 418b95b8000000 41895124",
    8: "41895910 41897914 418b5608 41895118",
    9: "41895910 41897914 8b55d7 4189511c 418b95b4000000 41895120 418b95b8000000 41895124",
    10: "41895910 8b55df 4189512c 45897130 418b95b4000000 41895120 418b95b8000000 41895124",
}


def _slot(a: Asm, n: int, hdr: int) -> None:
    a.b("41b801000000").rip("f0440fc105", hdr)
    a.b("4181f8").b(struct.pack("<I", CAP).hex()).j32("0f83", f"done{n}")
    a.b("49c1e006").rip("4c8d0d", hdr + HDR).b("4d01c1")
    a.b("41c701").b(struct.pack("<I", n).hex())


def _tail(a: Asm, n: int, rva: int, base: int) -> None:
    a.b("49ba").b(struct.pack("<Q", base + GAME).hex()).b("4d8b12 418b92c0000000 41895138")  # turn
    a.b("41c7413c").b(struct.pack("<I", DONE).hex())
    a.label(f"done{n}")
    a.b("58").b("49bb").b(struct.pack("<Q", base + rva + 5).hex()).b("41ffe3")


def build(mem: int, base: int) -> bytes:
    hdr = mem + CODE_SIZE
    a = Asm(mem)
    for n, rva, callee in SITES:
        a.label(f"pre{n}")
        a.rip("4c8d1d", f"post{n}").b("4c891c24")
        a.b("49bb").b(struct.pack("<Q", base + callee).hex()).b("41ffe3")
        a.label(f"post{n}")
        a.b("50")
        if n == 1:
            # its caller: the government value's call returns through site 3's stub
            a.b("4c8b942450010000").rip("4c8d1d", "post3").b("4d39da").j32("0f85", f"done{n}")
            _slot(a, n, hdr)
            a.b("418b16 4189510c")                                    # the running sum
            a.b("418b542440 41895108")                                # the context's +0x40
            a.b("49897918")                                           # the entry
            a.b("4c8b17 4d895120 4d85d2").j8("74", "n1")              # its analyzer
            a.b("4d8b12 4d895128")                                    # the analyzer's vtable
            a.label("n1")
            a.b("4c8b5710 4d895130")                                  # +0x10
        elif n == 2:
            _slot(a, n, hdr)
            a.b("45896104 410fb795d8000000 41895108 8b10 4189510c")
        elif n == 3:
            _slot(a, n, hdr)
            a.b("4189790c 8b10 41895110")                              # edi, the modifiers' sum
            a.b("4d8b9558060000 4d8b92f0020000")                       # r10 = the slot bests
            for k in range(6):
                a.b(f"418b52{4 * k:02x} 418951{0x14 + 4 * k:02x}")
        elif n in FLAT:
            _slot(a, n, hdr)
            a.b(FLAT_HEAD).b(FLAT[n])
        else:
            _slot(a, n, hdr)
            a.b("41897104 4c8b9790000000 410fb792d8000000 41895108 8b10 4189510c")
        _tail(a, n, rva, base)
    code = a.assemble()
    assert len(code) <= CODE_SIZE
    build.labels = a.labels
    return code


def _sites(pm, base: int):
    for n, rva, callee in SITES:
        yield n, rva, callee, pm.read(base + rva, 5)


def cmd_install(a, pm, base) -> int:
    if pm.read(base + SLACK, 2) == b"\xff\x25":
        print("the slack's jumps stand: uninstall (this tool or bvlog.py) first")
        return 1
    for n, rva, callee, have in _sites(pm, base):
        want = b"\xe8" + struct.pack("<i", callee - (rva + 5))
        if have != want:
            raise RuntimeError(f"site {n} at {rva:#x} holds {have.hex()}, not {want.hex()}")
    mem = _alloc(pm, CODE_SIZE + HDR + CAP * REC)
    code = build(mem, base)
    tramp = b"".join(b"\xff\x25\x00\x00\x00\x00" + struct.pack("<Q", build.labels[f"pre{n}"]) for n, *_ in SITES)
    pm.write(mem, code)
    pm.write(mem + CODE_SIZE, struct.pack("<QiiIQ", 0, -1, -1, MAGIC, mem).ljust(HDR, b"\0"))
    _ntdll.NtSuspendProcess(ctypes.c_void_p(pm.h))
    try:
        pm.protect(base + SLACK, SLACK_END - SLACK)
        pm.write(base + SLACK_END - 8, struct.pack("<Q", mem))
        pm.write(base + SLACK, tramp)
        for i, (n, rva, callee, _) in enumerate(_sites(pm, base)):
            old = pm.protect(base + rva, 5)
            pm.write(base + rva + 1, struct.pack("<i", SLACK + 14 * i - (rva + 5)))
            pm.protect(base + rva, 5, old)
    finally:
        _ntdll.NtResumeProcess(ctypes.c_void_p(pm.h))
    print(f"installed: buffer {mem:#x}")
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
    print("sites restored, the jumps cleared")
    return 0


def cmd_read(a, pm, base) -> int:
    """site-1 records belong to the next site-3 record, and both to the
    next site-2 record (the buffer's order; the civics AI runs on the game
    thread)"""
    mem = pm.u64(base + SLACK_END - 8)
    count, _, _, magic, _ = struct.unpack("<QiiIQ", pm.read(mem + CODE_SIZE, 28))
    if magic != MAGIC:
        print("no buffer")
        return 1
    n = min(count & 0xFFFFFFFF, CAP)
    raw = pm.read(mem + CODE_SIZE + HDR, n * REC) if n else b""
    out, pend, inner, kept = open(a.out, "w", encoding="utf-8", newline="\n"), [], {}, 0
    flat: list = []
    for j in range(0, len(raw), REC):
        site, ga, pb, v1, v2, _pad, q1, q2, q3, q4, turn, done = struct.unpack("<IiiiiIQQQQII", raw[j:j + REC])
        w = struct.unpack("<16i", raw[j:j + REC])
        if done != DONE:
            continue
        if site in FLAT:
            # a call's parts start at its first city's Production
            if site == 5 and flat and flat[-1]["site"] != 5:
                flat = []
            f = {"site": site, "player": w[2], "result": w[3] / 256}
            if site == 5:
                f.update(best=w[4] / 256, city=w[5])
            elif site in (6, 7, 8):
                f.update(amount=w[6] / 256)
            if site in (7, 9):
                f.update(perTurn=w[7] / 256, start=w[8], horizon=w[9])
            if site == 8:
                f.update(units=w[5])
            if site == 9:
                f.update(wonder=w[4] / 256)
            if site == 10:
                f.update(perTurn=w[11] / 256, pseudo=w[12], start=w[8], horizon=w[9])
            flat.append(f)
            continue
        if site == 1:
            m = {"sum": v1 / 256, "entry": hex(q1), "analyzer": hex(q2 - base) if q2 else None,
                 "vtable": hex(q3 - base) if q3 else None, "key": hex(q4), "ctx40": pb}
            if flat and flat[-1]["site"] in (9, 10):
                m["flat"] = {
                    "production": [{"city": f["city"], "yield": f["result"]} for f in flat if f["site"] == 5],
                    **{k: f["result"] for f in flat for k, s in (("wonderPY", 6), ("wonder", 7), ("combatPY", 8),
                                                                  ("combat", 9)) if f["site"] == s},
                    "units": next((f["units"] for f in flat if f["site"] == 8), None),
                    "amount": next((f["amount"] for f in flat if f["site"] == 6), None),
                    "span": next(([f["start"], f["horizon"]] for f in flat if f["site"] == 7), None),
                    "greatPeople": [[f["pseudo"], f["perTurn"], f["result"]] for f in flat if f["site"] == 10],
                }
            flat = []
            pend.append(m)
            continue
        if site == 3:
            prev = 0.0
            for m in pend:
                m["term"] = round(m["sum"] - prev, 6)
                prev = m["sum"]
            inner = {"before": v1 / 256, "modifiers": v2 / 256, "slotBest": [x / 256 for x in w[5:11]], "each": pend}
            pend = []
            continue
        rec = {"at": "turn" if site == 2 else "choice", "turn": turn, "gov": ga, "player": pb, "value": v1 / 256, **inner}
        inner = {}
        if a.player is None or pb == a.player:
            out.write(json.dumps(rec) + "\n")
            kept += 1
    out.close()
    print(f"{n} records, {kept} written -> {a.out}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.2")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("install")
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
