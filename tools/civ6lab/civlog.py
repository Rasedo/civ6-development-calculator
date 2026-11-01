"""THE CIVIC VALUE'S PARTS, LOGGED LIVE: the civics AI's value of one civic
(FinalRelease 0x52caf0, Release 0x7a9a10) recorded term by term per call in
a running instance, without holding the game.

    python tools/civ6lab/civlog.py --host 127.0.0.2 install --civic 45 [--wait 900]
    python tools/civ6lab/civlog.py --host 127.0.0.2 read --out runs/x.civlog.jsonl [--player 4] [--mem 0x...]
    python tools/civ6lab/civlog.py --host 127.0.0.2 uninstall

The machinery is bvlog.py's (a call re-aimed at a stub that takes the
callee's return, appends a 64-byte record and jumps back; the .text slack
at 0x9b6660 for the jumps: never with bvlog.py, govlog.py or aimem_hook.py
at once). Every site but 9 stands in the civic value's frame (rbp) and
records only the civic `--civic` (its Civics index, [rbp+0xf8]); each
record carries the civic, the player ([rbp+0x118] +0xd8), T ([rbp+0x108])
and H ([rbp+0x110]). The sites (FinalRelease; the Release twins):
  1 0x52cbe2 -> 0x528310  the own term's second present value: PV(H) [rax],
                          PV(T) [rbx], the rate [[rbp+0x100]]
  2 0x52ccbc -> 0x7d05e0  past the governments: edi = own + governments
  3 0x52ce06 -> 0x3e8150  a unit's value in one city (CityBuildAI): the
                          unit r15d, the value [rsp+0x40], the city +0xa8,
                          the running sum [rsp+0x58]
  4 0x52ceef -> 0x52b110  an upgrade's Gold: the unit, the Gold value [rax],
                          the unit's average r14d, the upgrade count r12d
  5 0x52cf58 -> 0x37dbd0  past the units: [rsp+0x58], the civic's era
                          (row +0xc0 +0x14) and the game's (+0x738 +0xc0)
  6 0x52d178 -> 0x528310  a building's term: PV(H) [rax], PV(T) [rbx], the
                          building, the sum before (r14d), its +0x158 flags
  7 0x52d266 -> 0x528310  a district's term: the same
  8 0x52d292 -> 0x27e570  before the policies: r14d
  9 0x529fff -> 0x9908f0  inside the modifiers' sum, called from site 10's
                          call while the civic is the one asked for: the
                          running sum, the entry, its analyzer and vtable
 10 0x52d33f -> 0x416600  each of the civic's cards: its score [rax], the
                          policy [rsi], the weakest slotted edi, the best
                          so far ebx
 11 0x52d3f4 -> 0x529ed0  the modifiers: their sum [rax], the sum before r14d
 12 0x52d413 -> 0x9908f0  the end: r14d the value
`read` folds each call's records into one line: the turn, the player, T,
H, the rate, own, governments, the era multiplier, units (each city's
value), upgrades, buildings, districts, the formations' rest, policies
(each card, the weakest slotted), modifiers (each term) and the value.
"""
from __future__ import annotations

import argparse
import ctypes
import json
import pathlib
import struct
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import procmem  # noqa: E402
from aimem_hook import Asm  # noqa: E402
from bvlog import CAP, CODE_SIZE, DLL, DONE, GAME, HDR, MAGIC, REC, SLACK, SLACK_END, _alloc, _ntdll  # noqa: E402

SITES = (
    (1, 0x52CBE2, 0x528310),
    (2, 0x52CCBC, 0x7D05E0),
    (3, 0x52CE06, 0x3E8150),
    (4, 0x52CEEF, 0x52B110),
    (5, 0x52CF58, 0x37DBD0),
    (6, 0x52D178, 0x528310),
    (7, 0x52D266, 0x528310),
    (8, 0x52D292, 0x27E570),
    (9, 0x529FFF, 0x9908F0),
    (10, 0x52D33F, 0x416600),
    (11, 0x52D3F4, 0x529ED0),
    (12, 0x52D413, 0x9908F0),
)
FLAG = 0x20   # header: 1 while site 11's call runs for the civic asked for

# each frame site's values into the record's +0x14.. slots (after the common fields)
BODY = {
    1: "8b10 41895114 8b13 41895118 4c8b9500010000 418b12 4189511c",
    2: "41897914",
    3: "45897914 8b542448 41895118 8b97a8000000 4189511c 8b542460 41895120",
    4: "45897914 8b10 41895118 4589711c 45896120",
    5: "8b542460 41895114 4d8b97c0000000 4d85d2 7408 418b5214 41895118"
       " 4d8b9538070000 418b92c0000000 4189511c",
    6: "8b10 41895114 8b13 41895118 4c8b17 418b5214 4189511c 45897120 410fb69258010000 41895124",
    8: "45897114",
    10: "8b10 41895114 8b16 41895118 4189791c 41895920",
    11: "8b10 41895114 45897118",
    12: "45897114",
}
BODY[7] = BODY[6]


def _slot(a: Asm, n: int, hdr: int) -> None:
    a.b("41b801000000").rip("f0440fc105", hdr)                       # lock xadd [count], r8d
    a.b("4181f8").b(struct.pack("<I", CAP).hex()).j32("0f83", f"done{n}")
    a.b("49c1e006").rip("4c8d0d", hdr + HDR).b("4d01c1")            # r9 = the record
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
        if n == 11:
            # the flag: this call is the asked-for civic's (r10, r11 hold no argument)
            a.b("448b95f8000000 4531db").rip("443b15", hdr + 8).j8("75", "pre11set")
            a.b("41bb01000000")
            a.label("pre11set")
            a.rip("44891d", hdr + FLAG)
        a.rip("4c8d1d", f"post{n}").b("4c891c24")                  # lea r11, post; mov [rsp], r11
        a.b("49bb").b(struct.pack("<Q", base + callee).hex()).b("41ffe3")
        a.label(f"post{n}")
        a.b("50")                                                    # push rax
        if n == 9:
            # its caller: the civic value's call returns through site 11's stub
            a.b("4c8b942450010000").rip("4c8d1d", "post11").b("4d39da").j32("0f85", f"done{n}")
            a.rip("833d", hdr + FLAG, b"\x00").j32("0f84", f"done{n}")
            _slot(a, n, hdr)
            a.b("418b16 4189510c")                                    # the running sum
            a.b("418b542440 41895108")                                # the context's +0x40
            a.b("49897918")                                           # the entry
            a.b("4c8b17 4d895120 4d85d2").j8("74", "n9")              # its analyzer
            a.b("4d8b12 4d895128")                                    # the analyzer's vtable
            a.label("n9")
            a.b("4c8b5710 4d895130")                                  # +0x10
            _tail(a, n, rva, base)
            continue
        a.b("8b8df8000000").rip("3b0d", hdr + 8).j32("0f85", f"done{n}")   # the civic asked for
        _slot(a, n, hdr)
        a.b("41894904")                                              # the civic
        a.b("4c8b9518010000 418b92d8000000 41895108")                # the player
        a.b("8b9508010000 4189510c 8b9510010000 41895110")           # T, H
        a.b(BODY[n])
        _tail(a, n, rva, base)
    code = a.assemble()
    assert len(code) <= CODE_SIZE
    build.labels = a.labels
    return code


def _sites(pm, base: int):
    for n, rva, callee in SITES:
        yield n, rva, callee, pm.read(base + rva, 5)


def _wait_game(a, base_of) -> int:
    """the game DLL's base once its game object has passed turn 1"""
    end = time.time() + a.wait
    while True:
        base = base_of()
        if base:
            try:
                pm = procmem.ProcMem.of_host(a.host)
                g = pm.u64(base + GAME)
                if g and struct.unpack("<i", pm.read(g + 0xC0, 4))[0] >= 2:
                    return base
            except (procmem.MemError, OSError):
                pass
        if time.time() > end:
            return 0
        time.sleep(2)


def cmd_install(a, pm, base) -> int:
    if pm.read(base + SLACK, 2) == b"\xff\x25":
        print("the slack's jumps stand: uninstall (this tool, govlog.py or bvlog.py) first")
        return 1
    for n, rva, callee, have in _sites(pm, base):
        want = b"\xe8" + struct.pack("<i", callee - (rva + 5))
        if have != want:
            raise RuntimeError(f"site {n} at {rva:#x} holds {have.hex()}, not {want.hex()}")
    mem = _alloc(pm, CODE_SIZE + HDR + CAP * REC)
    code = build(mem, base)
    tramp = b"".join(b"\xff\x25\x00\x00\x00\x00" + struct.pack("<Q", build.labels[f"pre{n}"]) for n, *_ in SITES)
    assert SLACK + len(tramp) + 8 <= SLACK_END
    pm.write(mem, code)
    pm.write(mem + CODE_SIZE, struct.pack("<QiiIQ", 0, a.civic, -1, MAGIC, mem).ljust(HDR, b"\0"))
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
    print(f"installed: buffer {mem:#x}, civic {a.civic}", flush=True)
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


def _fx(v: int) -> float:
    return v / 256


def cmd_read(a, pm, base) -> int:
    """one line per civic value call: its records run from site 1 to site 12
    (the civics AI runs on the game thread); site-9 records belong to the
    next site-11 record"""
    mem = int(a.mem, 16) if a.mem else pm.u64(base + SLACK_END - 8)
    count, civic, _, magic, _ = struct.unpack("<QiiIQ", pm.read(mem + CODE_SIZE, 28))
    if magic != MAGIC:
        print("no buffer")
        return 1
    n = min(count & 0xFFFFFFFF, CAP)
    raw = pm.read(mem + CODE_SIZE + HDR, n * REC) if n else b""
    out, cur, mods, kept = open(a.out, "w", encoding="utf-8", newline="\n"), None, [], 0
    for j in range(0, len(raw), REC):
        r = raw[j:j + REC]
        site, = struct.unpack_from("<I", r, 0)
        turn, done = struct.unpack_from("<II", r, 0x38)
        if done != DONE:
            continue
        if site == 9:
            ctx40, s = struct.unpack_from("<ii", r, 8)
            q1, q2, q3, q4 = struct.unpack_from("<QQQQ", r, 0x18)
            mods.append({"sum": _fx(s), "entry": hex(q1), "analyzer": hex(q2 - base) if q2 else None,
                         "vtable": hex(q3 - base) if q3 else None, "key": hex(q4), "ctx40": ctx40})
            continue
        row, player, t, h = struct.unpack_from("<iiii", r, 4)
        v = struct.unpack_from("<7i", r, 0x14)
        if site == 1:
            cur = {"turn": turn, "civic": row, "player": player, "T": t, "H": h, "rate": _fx(v[2]),
                   "own": _fx(v[0] - v[1]), "units": [], "upgrades": [], "buildings": [], "districts": [],
                   "cards": []}
            continue
        if cur is None or (row, player) != (cur["civic"], cur["player"]):
            continue
        if site == 2:
            cur["ownGov"] = _fx(v[0])
            cur["governments"] = _fx(v[0]) - cur["own"]
        elif site == 3:
            cur["units"].append({"unit": v[0], "city": v[2], "value": _fx(v[1]), "sumBefore": _fx(v[3])})
        elif site == 4:
            cur["upgrades"].append({"unit": v[0], "gold": _fx(v[1]), "unitAvg": _fx(v[2]), "count": v[3]})
        elif site == 5:
            cur.update(afterUnits=_fx(v[0]), civicEra=v[1], gameEra=v[2])
        elif site in (6, 7):
            cur["buildings" if site == 6 else "districts"].append(
                {"index": v[2], "term": _fx(v[0] - v[1]), "sumBefore": _fx(v[3]), "flags": hex(v[4])})
        elif site == 8:
            cur["beforePolicies"] = _fx(v[0])
        elif site == 10:
            cur["cards"].append({"policy": v[1], "score": _fx(v[0])})
            cur["weakestSlotted"] = _fx(v[2])
        elif site == 11:
            prev = 0.0
            for m in mods:
                m["term"] = round(m["sum"] - prev, 6)
                prev = m["sum"]
            cur.update(modifiers=_fx(v[0]), beforeModifiers=_fx(v[1]), each=mods)
            mods = []
        elif site == 12:
            cur["value"] = _fx(v[0])
            if "beforeModifiers" in cur and "beforePolicies" in cur:
                cur["policies"] = cur["beforeModifiers"] - cur["beforePolicies"]
            if "afterUnits" in cur:
                cur["formationsBuildingsDistricts"] = cur.get("beforePolicies", 0.0) - cur["afterUnits"]
            if a.player is None or player == a.player:
                out.write(json.dumps(cur) + "\n")
                kept += 1
            cur = None
    out.close()
    print(f"{n} records (civic {civic}), {kept} values written -> {a.out}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.2")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("install")
    s.add_argument("--civic", type=int, required=True, help="the civic's Civics index")
    s.add_argument("--wait", type=float, default=0.0, help="seconds to wait for a game past turn 1")
    sub.add_parser("uninstall")
    s = sub.add_parser("read")
    s.add_argument("--out", required=True)
    s.add_argument("--player", type=int)
    s.add_argument("--mem", help="the buffer's address (install prints it), once the game DLL is gone")
    a = p.parse_args()

    def base_of() -> int:
        try:
            return procmem.ProcMem.of_host(a.host).module(DLL) or 0
        except (procmem.MemError, OSError, RuntimeError):
            return 0

    if a.cmd == "install" and a.wait:
        base = _wait_game(a, base_of)
    else:
        base = base_of()
    pm = procmem.ProcMem.of_host(a.host)
    if not base and not (a.cmd == "read" and a.mem):
        print("the game DLL is not loaded")
        return 1
    return {"install": cmd_install, "uninstall": cmd_uninstall, "read": cmd_read}[a.cmd](a, pm, base)


if __name__ == "__main__":
    sys.exit(main())
