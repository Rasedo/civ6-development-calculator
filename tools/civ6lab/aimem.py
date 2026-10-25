"""H-1: THE AI MEMORY READER — the game's AI memory read straight from a
running instance's GameCore_XP2_FinalRelease.dll at the moments the game
writes its AI logs, one JSON line per moment beside the recording.

    python tools/civ6lab/aimem.py --host 127.0.0.4 watch --out runs/<stem>.aimem.jsonl
    python tools/civ6lab/aimem.py --host 127.0.0.4 snap      # every player's memory now, to stdout

`watch` waits for the instance and its game DLL, installs the hooks
(`aimem_hook.py`: in the process only), prints `armed` and then, at each
hook hit, reads while the game thread stands at the hook and appends a
line; a DLL the host loads afresh is armed again; it ends when
`<out>.stop` appears (the gate closed first) or the process ends. Every
pointer path starts at a global
of the DLL (FinalRelease RVAs; dll_readings.md "H-1: the AI memory
reader" names each field's reader in the code):

  game        [0xb8aa68]: +0xc0 the turn, +0xf0 the synchronous generator
              (+0xf8 its state, +0xfc its draw count)
  players     [[0xb8e140] + 0x20][id]  (the Player; +0xd8 its id)
  player      +0x650 the city AI manager (+0x98 its list: node +0 the
              CityBuild, +0x10 next), +0x658 CultureAi, +0x660 Diplomatic,
              +0x668 Economic, +0x680 Military (+0x1f0 the operations: node
              +0 the operation, +0x10 next), +0x688 Research, +0x698
              Targets (+0x270 the knowledge base), +0x6a8 the behaviour tree
              manager, +0x6b0 the Control Manager (+0x110 the controls'
              pages, 8 entries of 0x18 a page, an entry's +0 the control:
              +0 id, +4 kind, +0x10 the object; +0x170 the contracts, +0x180
              their count), +0x6c8 Player::Units (+0x98 the units' pages, as
              the controls'), +0x6d0 Player::Cities (+0xec), +0x710
              PlayerStats (+0xa0 the best melee trained)

Each record: `seq`, `site`, `turn`, `player`, `rng` [state, count], `at`
(the wall second since the watch began), `ms` (how long the game thread
stood for the read), and by site:
  start     the player's turn start (PlayerTurnStarted's raise)
  tactical  the tactical turn's knowledge step (player signal +0x1f8),
            before the ageing: `army`, `ops`
  log       AI_Knowledge.csv's moment (after the ageing and the look, before
            the cities' contract submissions): `army`, `camps`,
            `contracts`, `holders`, `trees`, `ops`, `stats`
  endlook   the end look (player signal +0x228) done, the player's AI turn
            over: the same as `log`
A section the reader could not read is named in `errors`.
`army`: per owner id per unit type index the records [unit id, +4, +8, age,
x, y, +0x18, +0x1c]. `contracts`: per contract its id, kind (build, tech,
civic, plot, diplomatic, or the vtable), status, priority, timeLimit, timeEstimate,
owner (the control id that made it), player, value (24.8 fixed point,
raw), refs, and the kind's fields. `holders`: per city (its id) the
contract in hand and its list; the Economic, Research, CultureAi and
Diplomatic AIs' lists (the handles' contract ids: a weak handle keeps the
id of a contract the Control Manager no longer holds). `trees`: per behaviour tree control
id its name, flags, operation and contracts. `ops`: per operation its
name, control ids, target, rally, strengths, flags, its tree's
allowRecruiting (the tree "marked" for the recruit's offer) and its teams'
members [unit id, type index, experience, level, promotion ready].
"""
from __future__ import annotations

import argparse
import json
import pathlib
import struct
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from procmem import MemError, ProcMem  # noqa: E402
import aimem_hook as H  # noqa: E402

DLL = "GameCore_XP2_FinalRelease.dll"
G_GAME, G_PLAYERS = 0xB8AA68, 0xB8E140
PLAYER_IDS = list(range(64))

# the contract kinds by vtable (FinalRelease)
VT_KIND = {0x9FA5E0: "build", 0x9FA728: "tech", 0x9FA870: "civic", 0x9FA930: "plot", 0x9FAA78: "diplomatic"}
VT_TREE = 0xA0C238      # a behaviour tree's control interface (tree +0x218)
# the Control::Contract's watched fields: name -> value offset
CONTRACT = {"status": 0xB0, "priority": 0xC8, "timeLimit": 0xE0, "timeEstimate": 0xF8, "id": 0x110,
            "owner": 0x128, "player": 0x140, "value": 0x158, "refs": 0x160}
KIND_FIELDS = {
    "build": {"unit": 0x178, "building": 0x190, "district": 0x1A8, "plot": (0x1C0, 2), "city": (0x1D8, 2),
              "keepControl": (0x1F0, 0)},
    "tech": {"goal": 0x178, "next": 0x190, "bestController": 0x1A8},
    "civic": {"goal": 0x178, "next": 0x190},
    "plot": {"plot": (0x178, 2)},
    "diplomatic": {"enemy": 0x178, "action": 0x190},
}
# the AIs' managed-contracts containers: (player component offset, container offset)
HOLDERS = {"economic": (0x668, 0x268), "research": (0x688, 0x178), "culture": (0x658, 0x218),
           "diplomatic": (0x660, 0x6158)}
# a behaviour tree (its base): watched values
TREE = {"active": (0x138, "b"), "temporary": (0x150, "b"), "markForDestroy": (0x168, "b"),
        "allowRecruiting": (0x180, "b"), "controlId": (0x1B0, "i"),
        "treeId": (0x1C8, "i"), "requestPriority": (0x1E0, "i"), "recruitPriority": (0x1F8, "i"),
        "presentValue": (0x210, "i"), "operation": (0x370, "i")}
# an operation: watched values
OPERATION = {"controlId": (0x138, "i"), "enemy": (0x178, "i"), "targetX": (0x180, "i"), "targetY": (0x184, "i"),
             "rallyX": (0x1A8, "i"), "rallyY": (0x1AC, "i"), "blockedTurns": (0x1C0, "i"),
             "backupX": (0x1E0, "i"), "backupY": (0x1E4, "i"), "forceTargetSwitch": (0x208, "b"),
             "opStrength": (0x220, "i"), "targetStrength": (0x238, "i"), "combatStrength": (0x250, "i"),
             "forceReady": (0x268, "b"), "warReady": (0x280, "b"), "emergency": (0x298, "b"),
             "treeControlId": (0x2E0, "i"), "treeManagerId": (0x2F8, "i")}


def ptr(v: int) -> int:
    """v where it can be a user-space pointer, else 0"""
    return v if 0x10000 <= v < 0x7FFFFFFF0000 else 0


class Reader:
    def __init__(self, pm: ProcMem, base: int):
        self.pm, self.base = pm, base

    # -- primitives
    def player(self, pid: int) -> int:
        arr = self.pm.u64(self.pm.u64(self.base + G_PLAYERS) + 0x20)
        return self.pm.u64(arr + 8 * pid)

    def paged(self, holder: int, ident: int) -> int:
        """a paged table's entry by id (the Control Manager's controls at
        +0x110, Player::Units' units at +0x98): the page id&0xffff >> 3, the
        entry (id & 7) x 0x18, its object; 0 none"""
        if ident is None or ident < 0:
            return 0
        pages = self.pm.u64(holder)
        n = (self.pm.u64(holder + 8) - pages) // 8
        i = ident & 0xFFFF
        if (i >> 3) >= n:
            return 0
        pg = self.pm.u64(pages + 8 * (i >> 3))
        return ptr(self.pm.u64(pg + 0x18 * (i & 7))) if pg else 0

    def control(self, pl: int, ident: int) -> int:
        c = self.paged(self.pm.u64(pl + 0x6B0) + 0x110, ident)
        return c if c and self.pm.i32(c) == ident else 0

    def handles(self, at: int) -> list[int]:
        """a managed-contracts container (vt, owner, vector, size): its
        handles' contract ids"""
        vec, n = self.pm.u64(at + 0x10), self.pm.i32(at + 0x18)
        if not vec or n <= 0 or n > 4096:
            return []
        b = self.pm.read(vec, 16 * n)
        return [struct.unpack_from("<i", b, 16 * k + 12)[0] for k in range(n)]

    def game(self) -> int:
        return self.pm.u64(self.base + G_GAME)

    def common(self) -> dict:
        g = self.game()
        st, cnt = struct.unpack("<II", self.pm.read(g + 0xF8, 8))
        return {"turn": self.pm.i32(g + 0xC0), "rng": [st, cnt]}

    # -- the knowledge base
    def army(self, kb: int) -> dict:
        out = {}
        hdr = self.pm.read(kb + 0x18, 0x600)
        for owner in range(64):
            begin, _, n = struct.unpack_from("<QQq", hdr, 0x18 * owner)
            if not begin or n <= 0:
                continue
            types = self.pm.read(begin, 0x18 * n)
            per = {}
            for t in range(n):
                rp, _, rn = struct.unpack_from("<QQq", types, 0x18 * t)
                if rp and rn > 0:
                    recs = self.pm.read(rp, 0x20 * rn)
                    per[t] = [list(struct.unpack_from("<iiiiiiii", recs, 0x20 * k)) for k in range(rn)]
            if per:
                out[owner] = per
        return out

    def camps(self, kb: int) -> list:
        p, n = self.pm.u64(kb + 0x638), self.pm.i32(kb + 0x648)
        if not p or n <= 0:
            return []
        b = self.pm.read(p, 16 * n)
        return [list(struct.unpack_from("<iiii", b, 16 * k)) for k in range(n)]

    # -- contracts and their holders
    def contracts(self, pl: int) -> list:
        cm = self.pm.u64(pl + 0x6B0)
        vec, n = self.pm.u64(cm + 0x170), self.pm.i32(cm + 0x180)
        out = []
        for k in range(max(0, n)):
            c = self.pm.u64(vec + 8 * k)
            if not c:
                continue
            vt = self.pm.u64(c) - self.base
            kind = VT_KIND.get(vt, f"vt{vt:#x}")
            b = self.pm.read(c, 0x200)
            rec = {"kind": kind}
            for name, off in CONTRACT.items():
                rec[name] = struct.unpack_from("<i", b, off)[0]
            for name, off in KIND_FIELDS.get(kind, {}).items():
                # an int, or (offset, 0) a byte, or (offset, 2) an [x, y] / two-int pair
                if isinstance(off, tuple):
                    rec[name] = b[off[0]] if off[1] == 0 else list(struct.unpack_from("<ii", b, off[0]))
                else:
                    rec[name] = struct.unpack_from("<i", b, off)[0]
            out.append(rec)
        return out

    def holders(self, pl: int) -> dict:
        out: dict = {"cities": []}
        node = self.pm.u64(self.pm.u64(pl + 0x650) + 0x98)
        while node:
            cb = self.pm.u64(node)
            out["cities"].append({"city": self.pm.i32(cb + 0xA8), "threat": self.pm.i32(cb + 0xD8),
                                  "hand": self.pm.i32(cb + 0x15C), "list": self.handles(cb + 0x160)})
            node = self.pm.u64(node + 0x10)
        for name, (comp, at) in HOLDERS.items():
            obj = self.pm.u64(pl + comp)
            out[name] = self.handles(obj + at) if obj else []
        return out

    def trees(self, pl: int) -> dict:
        cm = self.pm.u64(pl + 0x6B0)
        pages = self.pm.u64(cm + 0x110)
        npages = (self.pm.u64(cm + 0x118) - pages) // 8
        out = {}
        for k in range(npages):
            pg = self.pm.u64(pages + 8 * k)
            if not pg:
                continue
            ents = self.pm.read(pg, 0x18 * 8)
            for j in range(8):
                ctl = struct.unpack_from("<Q", ents, 0x18 * j)[0]
                # a free entry holds the next free index, not a control
                if not ptr(ctl):
                    continue
                ident = self.pm.i32(ctl)
                obj = ptr(self.pm.u64(ctl + 0x10))
                if not obj or self.pm.u64(obj) - self.base != VT_TREE:
                    continue
                tree = self.pm.u64(obj + 8)
                b = self.pm.read(tree, 0x3A0)
                s = struct.unpack_from("<Q", b, 0x268)[0]
                rec = {"name": self.pm.cstr(s, 96) if s else None}
                for name, (off, ty) in TREE.items():
                    rec[name] = b[off] if ty == "b" else struct.unpack_from("<i", b, off)[0]
                rec["contracts"] = self.handles(tree + 0x378)
                out[ident] = rec
        return out

    # -- operations
    def unit(self, pl: int, ident: int) -> list:
        """[id, type index, experience, level, promotion ready]: the unit's
        experience object (unit +0x970: +8 the promotion flag, +0xc the
        points, +0x10 the level)"""
        u = self.paged(self.pm.u64(pl + 0x6C8) + 0x98, ident)
        if not u:
            return [ident, None, None, None, None]
        e = self.pm.read(u + 0x970, 0x14)
        return [ident, self.pm.i32(u + 0xC8), struct.unpack_from("<i", e, 0xC)[0], struct.unpack_from("<i", e, 0x10)[0], e[8]]

    def ops(self, pl: int) -> list:
        out = []
        node = self.pm.u64(self.pm.u64(pl + 0x680) + 0x1F0)
        while node:
            op = self.pm.u64(node)
            b = self.pm.read(op, 0x300)
            d = struct.unpack_from("<Q", b, 0xA8)[0]
            rec = {"name": self.pm.cstr(d, 96) if d else None}
            for name, (off, ty) in OPERATION.items():
                rec[name] = b[off] if ty == "b" else struct.unpack_from("<i", b, off)[0]
            # the teams, 0x118 bytes each, inline (op +0x150, their count +0x160);
            # a team's members are unit ids (+0x18, their count +0x28)
            teams = []
            tv, tn = struct.unpack_from("<Q", b, 0x150)[0], struct.unpack_from("<I", b, 0x160)[0]
            if ptr(tv) and 0 < tn < 64:
                for k in range(tn):
                    team = tv + 0x118 * k
                    ids_p, n = self.pm.u64(team + 0x18), self.pm.i32(team + 0x28)
                    ids = list(struct.unpack(f"<{n}i", self.pm.read(ids_p, 4 * n))) if ids_p and 0 < n < 256 else []
                    teams.append([self.unit(pl, i) for i in ids])
            rec["teams"] = teams
            tree = self.control(pl, rec["treeControlId"])
            if tree:
                obj = self.pm.u64(tree + 0x10)
                if obj and self.pm.u64(obj) - self.base == VT_TREE:
                    rec["treeAllowRecruiting"] = self.pm.u8(self.pm.u64(obj + 8) + 0x180)
            out.append(rec)
            node = self.pm.u64(node + 0x10)
        return out

    def stats(self, pl: int) -> dict:
        return {"maxMelee": self.pm.i32(self.pm.u64(pl + 0x710) + 0xA0),
                "citiesEc": self.pm.i32(self.pm.u64(pl + 0x6D0) + 0xEC)}

    def full(self, pid: int) -> dict:
        pl = self.player(pid)
        kb = self.pm.u64(pl + 0x698) + 0x270
        out: dict = {}
        for name, fn in (("army", lambda: self.army(kb)), ("camps", lambda: self.camps(kb)),
                         ("contracts", lambda: self.contracts(pl)), ("holders", lambda: self.holders(pl)),
                         ("trees", lambda: self.trees(pl)), ("ops", lambda: self.ops(pl)),
                         ("stats", lambda: self.stats(pl))):
            try:
                out[name] = fn()
            except MemError as e:
                out.setdefault("errors", []).append(f"{name}: {e}")
        return out


def hit_record(r: Reader, mb: bytes) -> dict | None:
    site = struct.unpack_from("<I", mb, H.SITE)[0]
    rcx, rdx, r8, _r9, ret, _rsp, _saved, look = struct.unpack_from("<8Q", mb, H.RCX)
    pm = r.pm
    rec = {"site": site}
    if site == 1:
        # the signal reaches every player's Targets with edx 4..0; it runs
        # where the flag is set and edx is the Targets' own +0x108
        if not (r8 & 0xFF) or (rdx & 0xFFFFFFFF) != pm.u32(rcx + 0x108):
            return None
        pl = pm.u64(rcx + 0x98)
        rec.update(site="tactical", player=pm.i32(pl + 0xD8))
        rec.update(r.common())
        rec["army"] = r.army(rcx + 0x270)
        rec["ops"] = r.ops(pl)
    elif site == 2:
        pid = pm.i32(rcx + 0x6E8)
        rec.update(site="log", player=pid)
        rec.update(r.common())
        rec.update(r.full(pid))
    elif site == 4:
        pl = pm.u64(look + 0x98)
        pid = pm.i32(pl + 0xD8)
        rec.update(site="endlook", player=pid)
        rec.update(r.common())
        rec.update(r.full(pid))
    elif site == 5:
        rec.update(site="start", player=pm.i32(rdx + 0xD8))
        rec.update(r.common())
    else:
        return None
    return rec


def wait_module(host: str, limit: float, pm: ProcMem | None = None) -> tuple[ProcMem, int]:
    t0 = time.monotonic()
    while time.monotonic() - t0 < limit:
        try:
            pm = pm or ProcMem.of_host(host)
            base = pm.module(DLL)
            if base:
                return pm, base
        except MemError:
            pm = None
        time.sleep(0.02)
    raise SystemExit(f"no {DLL} in the {host} instance within {limit:.0f}s")


def arm(pm: ProcMem, base: int) -> int:
    """install the hooks, open the gate; the sequence number to answer from"""
    how = H.install(pm, base)
    M = base + H.MAIL
    seq = pm.u32(M + H.SEQ)
    pm.write(M + H.ACK, struct.pack("<I", seq))
    pm.write(M + H.GATE, struct.pack("<I", 1))
    print(f"armed ({how}) pid {pm.pid} base {base:#x}", flush=True)
    return seq


def cmd_watch(a) -> int:
    """A hosted game loads the DLL afresh: a module that goes, or whose
    first site no longer holds the hook, is waited for again and re-armed."""
    stop = a.out.with_suffix(a.out.suffix + ".stop")
    pm, base = wait_module(a.host, a.wait)
    r = Reader(pm, base)
    seq = arm(pm, base)
    M = base + H.MAIL
    site1 = base + H.SITES[0][1]
    hooked = pm.read(site1, 5)
    n, spent, t0 = 0, 0.0, time.monotonic()
    out = open(a.out, "a", encoding="utf-8", newline="\n")
    try:
        idle = 0
        while True:
            try:
                cur = pm.u32(M + H.SEQ)
                fresh = idle % 100 == 99 and pm.read(site1, 5) != hooked
            except MemError:
                cur, fresh = seq, True
            if fresh:
                if stop.exists():
                    break
                try:
                    pm, base = wait_module(a.host, a.wait, pm)
                except SystemExit:
                    break
                r = Reader(pm, base)
                seq = arm(pm, base)
                M, site1 = base + H.MAIL, base + H.SITES[0][1]
                hooked = pm.read(site1, 5)
                idle = 0
                continue
            if cur == seq:
                idle += 1
                if idle % 500 == 0 and stop.exists():
                    break
                time.sleep(0.001)
                continue
            idle = 0
            t1 = time.perf_counter()
            mb = b""
            try:
                mb = pm.read(M, H.MAIL_SIZE)
                rec = hit_record(r, mb)
            except MemError as e:
                rec = {"site": "error", "hook": struct.unpack_from("<I", mb, H.SITE)[0] if mb else None, "error": str(e)}
            finally:
                pm.write(M + H.ACK, struct.pack("<I", cur))
            held = time.perf_counter() - t1
            spent += held
            seq = cur
            if rec is not None:
                # the wall second of the read since the watch began, the ms the game stood
                rec.update(seq=cur, at=round(time.monotonic() - t0, 3), ms=round(1000 * held, 2))
                out.write(json.dumps(rec, separators=(",", ":")) + "\n")
                n += 1
    finally:
        try:
            pm.write(M + H.GATE, struct.pack("<I", 0))
            pm.write(M + H.ACK, struct.pack("<I", pm.u32(M + H.SEQ)))
        except MemError:
            pass
        out.close()
        print(f"stopped: {n} records, {spent:.1f}s held of {time.monotonic() - t0:.0f}s", flush=True)
    return 0


def cmd_snap(a) -> int:
    pm, base = wait_module(a.host, 5)
    r = Reader(pm, base)
    rec = r.common()
    rec["players"] = {}
    for pid in PLAYER_IDS:
        if r.player(pid):
            rec["players"][pid] = r.full(pid)
    print(json.dumps(rec))
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.2")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("watch")
    s.add_argument("--out", type=pathlib.Path, required=True)
    s.add_argument("--wait", type=float, default=600.0, help="seconds to wait for the instance's game DLL")
    s.set_defaults(fn=cmd_watch)
    s = sub.add_parser("snap")
    s.set_defaults(fn=cmd_snap)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
