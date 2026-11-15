"""H-1: THE AI MEMORY READER — the game's AI memory read straight from a
running instance's GameCore_XP2_FinalRelease.dll at the moments the game
writes its AI logs, one JSON line per moment beside the recording.

    python tools/civ6lab/aimem.py --host 127.0.0.4 watch --out runs/<stem>.aimem.jsonl
    python tools/civ6lab/aimem.py --host 127.0.0.4 snap      # every player's memory now, to stdout

    python tools/civ6lab/aimem.py --host 127.0.0.4 watch --out runs/<stem>.aimem.jsonl \
        --units runs/<stem>.aiunits.jsonl --plan-from 2

With `--units`, a second stream beside the memory's (`Units`): every
unit's row with its formation, kept path and operation queue, the player's
unit container slot by slot, each unit's planning (reach, targets, the
predicted blows), the tactical target list, the known cities' cached
strengths, the military AI's unit production table and each city's build
queue — at the four sites below and at the tactical pass's own
(`tacpass`, hook site 6, written to the units' stream only). The memory's
stream holds what it held without it.

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
            before the ageing: `army`, `ops`, `danger` (the player's danger
            map as its DoTurn built it: [x, y, danger] per plot of non-zero
            danger)
  log       AI_Knowledge.csv's moment (after the ageing and the look, before
            the cities' contract submissions): `army`, `camps`,
            `contracts`, `holders`, `trees`, `ops`, `stats`
  endlook   the end look (player signal +0x228) done, the player's AI turn
            over: the same as `log`, each tree with its `nodes` (`tree_nodes`)
A section the reader could not read is named in `errors`.
`army`: per owner id per unit type index the records [unit id, +4, +8, age,
x, y, +0x18, +0x1c]. `contracts`: per contract its id, kind (build, tech,
civic, plot, diplomatic, or the vtable), status, priority, timeLimit, timeEstimate,
owner (the control id that made it), player, value (24.8 fixed point,
raw), refs, and the kind's fields. `holders`: per city (its id) the
contract in hand and its list; the Economic, Research, CultureAi and
Diplomatic AIs' lists (the handles' contract ids, -1 a released handle). `trees`: per behaviour tree control
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
    "build": {"unit": 0x178, "building": 0x190, "district": 0x1A8, "plot": (0x1C0, 2), "city": 0x1D8,
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


def CITYBUILD_FIELDS() -> list:
    """the CityBuild's named fields (`aimem_fields`)"""
    import aimem_fields  # noqa: PLC0415
    return aimem_fields.load()["CityBuild"]["fields"]


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
        """a managed-contracts container (+0 vt, +8 owner, +0x10 the vector
        of 16-byte handles {pointer, owner, id}, +0x18 its capacity, +0x20
        its count): the first count handles' contract ids, -1 for a handle
        released (its pointer null); past the count stand stale copies"""
        vec, n = self.pm.u64(at + 0x10), self.pm.i32(at + 0x20)
        if not vec or n <= 0 or n > 4096:
            return []
        b = self.pm.read(vec, 16 * n)
        out = []
        for k in range(n):
            p, _, ident = struct.unpack_from("<Qii", b, 16 * k)
            out.append(ident if p else -1)
        return out

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
            # its named fields but the turn's analyses: the threat, the
            # defenders, the plot reservations, the event trees and handles,
            # the best plots and improvement, the default build's value
            fields = self.fields(cb, [f for f in CITYBUILD_FIELDS() if "Evaluations" not in f[0] and "Yields" not in f[0]
                                      and f[0] != "m_currentGpps"])
            out["cities"].append({"city": self.pm.i32(cb + 0xA8), "threat": self.pm.i32(cb + 0xD8),
                                  "hand": self.pm.i32(cb + 0x15C), "list": self.handles(cb + 0x160), "fields": fields})
            node = self.pm.u64(node + 0x10)
        for name, (comp, at) in HOLDERS.items():
            obj = self.pm.u64(pl + comp)
            out[name] = self.handles(obj + at) if obj else []
        return out

    def trees(self, pl: int, nodes: bool = False) -> dict:
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
                if nodes:
                    rec["nodes"] = self.tree_nodes(tree, b)
                out[ident] = rec
        return out

    def tree_nodes(self, tree: int, b: bytes) -> list:
        """a tree's nodes in BehaviorTreeNodes order (the tick 0x544360):
        their count m_numNodes (+0xa0), per node its status (m_actionStates'
        vector, +0x108: 0 fresh, 1 success, 2 running, 3 failure, 4 error, 5
        skipped) and its 0xb8-byte state block (m_definitions' vector,
        +0xb8: +0 its shape, +4 its handler's index, +8 the node's data — the
        node type's own fields at their Release offsets less 8, e.g. Add Goal
        Tech's contracts +0x94 / +0x9c): [status, shape, handler, data] with
        the data as hex, its trailing zero bytes cut"""
        n = struct.unpack_from("<i", b, 0xA0)[0]
        st_p, bl_p = struct.unpack_from("<Q", b, 0x108)[0], struct.unpack_from("<Q", b, 0xB8)[0]
        if not (0 < n <= 512) or not ptr(st_p) or not ptr(bl_p):
            return []
        st = struct.unpack(f"<{n}i", self.pm.read(st_p, 4 * n))
        blocks = self.pm.read(bl_p, 0xB8 * n)
        # the node graph (+0xe0, 0x14 bytes a node: its parent first; the
        # rest — the walk's resume, a Sequence's — as five ints)
        gr_p = struct.unpack_from("<Q", b, 0xE0)[0]
        graph = struct.unpack(f"<{5 * n}i", self.pm.read(gr_p, 0x14 * n)) if ptr(gr_p) else (0,) * (5 * n)
        out = []
        for k in range(n):
            blk = blocks[0xB8 * k:0xB8 * (k + 1)]
            shape, handler = struct.unpack_from("<ii", blk, 0)
            out.append([st[k], shape, handler, blk[8:].rstrip(b"\0").hex(), self.node_data(blk[8:]), list(graph[5 * k:5 * k + 5])])
        return out

    def node_data(self, data: bytes) -> dict:
        """a node's TreeData values by DefnId: the node's data holds, at 16 x
        its DefnId, a reference {the column (the player's TreeData table +
        0x18 + 0x20 x the DataTypes id), the DataTypes id, the slot}; the
        column {+0 its entries, +0x10 their count}. An entry by type: int
        (3), bool (4), float (9, 24.8 raw) 8 bytes, its value first; Map
        Point (5) 12, x and y; string (6) 16, its text's pointer; a list
        (UnitTypes 0, TechTypes 1, BuildingTypes 2, Improvements 7, IDs 8,
        Districts 10, Civics 11) 32, {its items (4 bytes each), its capacity,
        its count}"""
        out = {}
        for off in range(0, len(data) - 15, 16):
            p, ty, slot = struct.unpack_from("<Qii", data, off)
            if not ptr(p) or not 0 <= ty <= 11 or slot < 0:
                continue
            try:
                arr, _, cnt = struct.unpack("<QQQ", self.pm.read(p, 24))
                if not ptr(arr) or not 0 <= slot < cnt or cnt > 1 << 20:
                    continue
                if ty in (3, 9):
                    v = self.pm.i32(arr + 8 * slot)
                elif ty == 4:
                    v = bool(self.pm.u8(arr + 8 * slot))
                elif ty == 5:
                    v = list(struct.unpack("<ii", self.pm.read(arr + 12 * slot, 8)))
                elif ty == 6:
                    s = self.pm.u64(arr + 16 * slot)
                    v = self.pm.cstr(s, 96) if ptr(s) else None
                else:
                    items, _, count = struct.unpack("<QQQ", self.pm.read(arr + 32 * slot, 24))
                    v = list(struct.unpack(f"<{count}i", self.pm.read(items, 4 * count))) if ptr(items) and 0 < count < 4096 else []
            except MemError:
                continue
            out[off // 16] = [ty, slot, v]
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
            teams, counts, raws = [], [], []
            tv, tn = struct.unpack_from("<Q", b, 0x150)[0], struct.unpack_from("<I", b, 0x160)[0]
            if ptr(tv) and 0 < tn < 64:
                for k in range(tn):
                    team = tv + 0x118 * k
                    ids_p, n = self.pm.u64(team + 0x18), self.pm.i32(team + 0x28)
                    ids = list(struct.unpack(f"<{n}i", self.pm.read(ids_p, 4 * n))) if ids_p and 0 < n < 256 else []
                    teams.append([self.unit(pl, i) for i in ids])
                    # per requirement the members carrying its AI type (an
                    # int32 each, +0x30, their count +0x40)
                    c_p, cn = self.pm.u64(team + 0x30), self.pm.i32(team + 0x40)
                    counts.append(list(struct.unpack(f"<{cn}i", self.pm.read(c_p, 4 * cn))) if ptr(c_p) and 0 < cn < 64 else [])
                    raws.append(self.pm.read(team, 0x118).hex())
            rec["teams"] = teams
            rec["teamCounts"] = counts
            # the teams' and the operation's own bytes whole, their fields
            # (goals, requirement counts, readiness; the operation's start,
            # locks, trigger) decoded by the harness
            rec["teamsRaw"] = raws
            rec["raw"] = b.hex()
            tree = self.control(pl, rec["treeControlId"])
            if tree:
                obj = self.pm.u64(tree + 0x10)
                if obj and self.pm.u64(obj) - self.base == VT_TREE:
                    rec["treeAllowRecruiting"] = self.pm.u8(self.pm.u64(obj + 8) + 0x180)
            out.append(rec)
            node = self.pm.u64(node + 0x10)
        return out

    def assigned(self, pl: int) -> dict:
        """per unit (its id, +0xb0) the control it is assigned to (+0x300:
        a tree's, an operation's, the tactical pass's; the list 0x6092c0
        (FinalRelease 0x401ba0) reads it), the units alive (+0x2e8 clear) on
        Player::Units' list (+0xd0: node +0 the unit, +0x10 the next)"""
        out = {}
        node = self.pm.u64(self.pm.u64(pl + 0x6C8) + 0xD0)
        while ptr(node):
            u = self.pm.u64(node)
            b = self.pm.read(u + 0xB0, 4) + self.pm.read(u + 0x2E8, 1) + self.pm.read(u + 0x300, 4)
            ident, dead, job = struct.unpack("<iBi", b)
            if not dead and job != -1:
                out[ident] = job
            node = self.pm.u64(node + 0x10)
        return out

    def danger(self, pl: int) -> list:
        """the player's danger map (the influence map, player +0x6b8; its
        per-plot int16 vector: +0xb8 the items, +0xc8 the count, a plot's
        index x + y x the map's width, [game +0x248] +0x28; the read
        FinalRelease 0x4c5920): [x, y, danger] for each plot of non-zero
        danger, in plot order"""
        im = ptr(self.pm.u64(pl + 0x6B8))
        if not im:
            return []
        items, n = self.pm.u64(im + 0xB8), self.pm.u32(im + 0xC8)
        w = self.pm.i32(self.pm.u64(self.game() + 0x248) + 0x28)
        if not ptr(items) or not 0 < n <= 1 << 16 or w <= 0:
            return []
        vals = struct.unpack(f"<{n}h", self.pm.read(items, 2 * n))
        return [[i % w, i // w, v] for i, v in enumerate(vals) if v]

    def stats(self, pl: int) -> dict:
        return {"maxMelee": self.pm.i32(self.pm.u64(pl + 0x710) + 0xA0),
                "citiesEc": self.pm.i32(self.pm.u64(pl + 0x6D0) + 0xEC)}

    # -- the players' and cities' named fields (aimem_fields.json)
    def vector(self, q0: int, q1: int, q2: int) -> bytes | None:
        """a vector header's items: an EASTL {begin, end, capacity end}, or
        a {begin, capacity, count} (the contracts' container, the build
        queue's per-type arrays); None where the words are neither"""
        if not ptr(q0):
            return None
        if ptr(q1) and q0 <= q1 <= q2 and q1 - q0 <= 0x4000:
            return self.pm.read(q0, q1 - q0) if q1 > q0 else b""
        n = min(q1, q2)
        if max(q1, q2) <= 0x1000:
            return self.pm.read(q0, 4 * n) if n else b""
        return None

    def fields(self, obj: int, table: list) -> dict:
        """an object's named fields (`aimem_fields`): a scalar member (0x18)
        its int at +0x10; a vector member (0x28: its header at +0x10, either
        layout of `vector`) its items as int32s; any other member (a
        component, City's m_kGrowth, m_kCulture, m_kBuildQueue ...) its value
        bytes as int32s, and under `<name>.v` the items of every {begin,
        capacity, count} or EASTL {begin, end, capacity end} vector its
        words hold (by the word its header starts at: the build queue's
        per-type progress, PlayerStats' m_aiNumUnitsConstructed per unit
        type) — the int lists sparse {index: value} where mostly zero"""
        def ints_of(raw: bytes):
            ints = struct.unpack(f"<{len(raw) // 4}i", raw[:len(raw) // 4 * 4])
            nz = sum(1 for v in ints if v)
            return list(ints) if nz * 2 > len(ints) else {k: v for k, v in enumerate(ints) if v} | {"n": len(ints)}

        out = {}
        size = max(o + s for _, o, s in table)
        b = self.pm.read(obj, size)
        for name, off, sz in table:
            if sz == 0x18:
                v = struct.unpack_from("<i", b, off + 0x10)[0]
                out[name] = v & 0xFF if name.startswith("m_b") else v
                continue
            if sz == 0x28:
                # a header whose words only look like a vector's: its own
                # bytes (one member's failed read never loses the object's)
                try:
                    raw = self.vector(*struct.unpack_from("<QQQ", b, off + 0x10))
                except MemError:
                    raw = None
                out[name] = ints_of(raw if raw is not None else b[off + 0x10:off + sz])
                continue
            region = b[off + 0x10:off + sz]
            out[name] = ints_of(region)
            inner = {}
            k = 0
            while k <= len(region) - 0x18:
                p, q1, q2 = struct.unpack_from("<QQQ", region, k)
                if ptr(p) and 0 < q2 <= q1 <= 0x400:
                    size = 4 * q2
                elif ptr(p) and ptr(q1) and p < q1 <= q2 and q1 - p <= 0x4000:
                    size = q1 - p
                else:
                    k += 8
                    continue
                try:
                    inner[k // 4] = ints_of(self.pm.read(p, size))
                except MemError:
                    k += 8
                    continue
                k += 0x18
            if inner:
                out[name + ".v"] = inner
        return out

    def world(self, players: list[int]) -> dict:
        """per player its components' named fields and its cities' (Player::
        Cities +0xd0's list: node +0 the city, +0x10 the next), the moment
        the dump holds"""
        import aimem_fields  # noqa: PLC0415
        tab = aimem_fields.load()
        out = {}
        for pid in players:
            pl = self.player(pid)
            if not ptr(pl):
                continue
            rec: dict = {}
            for name, t in tab.items():
                if t["component"] is None:
                    continue
                try:
                    rec[name] = self.fields(self.pm.u64(pl + int(t["component"], 16)), t["fields"])
                except MemError as e:
                    rec.setdefault("errors", []).append(f"{name}: {e}")
            cities = []
            node = self.pm.u64(self.pm.u64(pl + 0x6D0) + 0xD0)
            while ptr(node) and len(cities) < 64:
                try:
                    cities.append(self.fields(self.pm.u64(node), tab["City"]["fields"]))
                except MemError as e:
                    rec.setdefault("errors", []).append(f"city: {e}")
                node = self.pm.u64(node + 0x10)
            rec["cities"] = cities
            out[pid] = rec
        return out

    # -- the units, their formations, queues and plannings (`<stem>.aiunits.jsonl`)
    @staticmethod
    def ints(raw: bytes) -> list:
        """a member's bytes as int32s, a pointer's two halves None (an
        address differs from run to run), the trailing zeros cut"""
        raw = raw[:len(raw) // 8 * 8]
        out: list = []
        for k in range(0, len(raw), 8):
            lo, hi = struct.unpack_from("<ii", raw, k)
            out += [None, None] if ptr(struct.unpack_from("<Q", raw, k)[0]) else [lo, hi]
        while out and not out[-1]:
            out.pop()
        return out

    def items(self, at_begin: int, at_count: int, size: int, limit: int) -> bytes:
        """a {begin, capacity, count} container's items' bytes (the planning's
        reach and targets, a unit's queue, the knowledge base's lists)"""
        begin, n = self.pm.u64(at_begin), self.pm.u32(at_count)
        return self.pm.read(begin, size * n) if ptr(begin) and 0 < n <= limit else b""

    def member_vector(self, b: bytes, off: int) -> list:
        """a vector member's items as int32s (its header at +0x10, either
        layout of `vector`); [] where the words are no vector"""
        try:
            raw = self.vector(*struct.unpack_from("<QQQ", b, off + 0x10))
        except MemError:
            raw = None
        return list(struct.unpack(f"<{len(raw) // 4}i", raw[:len(raw) // 4 * 4])) if raw else []

    def formation_row(self, f: int) -> list | None:
        """a formation's row (`aimem_fields.rows()["formation"]`): its scalar
        members in offset order (m_xMovesRemaining 24.8, m_bHasMoved,
        m_bHasMovedIntoZOC ...), then its plot's y, its kept path
        (m_kLastPath's items as int32s) and its members' unit ids"""
        import aimem_fields  # noqa: PLC0415
        tab = {n: o for n, o, _ in aimem_fields.load()["Formation"]["fields"]}
        b = self.pm.read(f, tab["m_kUnitIDList"] + 0x28)
        row: list = []
        for name, off in aimem_fields.scalars("Formation"):
            v = struct.unpack_from("<i", b, off + 0x10)[0]
            row.append(v & 0xFF if name.startswith("m_b") else v)
        row.append(struct.unpack_from("<i", b, tab["m_kLocation"] + 0x14)[0])
        row.append(self.member_vector(b, tab["m_kLastPath"]))
        row.append(self.member_vector(b, tab["m_kUnitIDList"]))
        return row

    def unit_row(self, u: int) -> list:
        """a unit's row (`aimem_fields.rows()["unit"]`): its scalar members in
        offset order, then its plot's y, its Movement modifiers
        (m_kMovementModifiers' eight ints: +8 the unit's own, +0xc the
        clear-terrain start's, +0x10 own ground's, +0x14 foreign ground's, as
        GetMaxMoves FinalRelease 0x3a3a00 adds them), its experience [points,
        level, promotion ready], its formation's row (unit +0xbb8),
        m_aiAbilitiesPossessed's non-zero [index, value] pairs, the combat
        modifiers' ints (m_kCombatModifers) and its operation queue
        (m_kOperations' value +0xd0 the entries, 0x30 bytes each, +0xe0
        their count: each entry's twelve ints)"""
        import aimem_fields  # noqa: PLC0415
        tab = {n: o for n, o, _ in aimem_fields.load()["Unit"]["fields"]}
        ops = tab["m_kOperations"] + 0x10
        b = self.pm.read(u, ops + 0xE8)
        row: list = []
        for name, off in aimem_fields.scalars("Unit"):
            v = struct.unpack_from("<i", b, off + 0x10)[0]
            row.append(v & 0xFF if name.startswith("m_b") else v)
        row.append(struct.unpack_from("<i", b, tab["m_kLocation"] + 0x14)[0])
        mv = tab["m_kMovementModifiers"]
        row.append(self.ints(b[mv + 0x10:mv + 0x30]))
        xp = tab["m_kExperience"] + 0x10
        row.append([struct.unpack_from("<i", b, xp + 0xC)[0], struct.unpack_from("<i", b, xp + 0x10)[0], b[xp + 8]])
        f = ptr(struct.unpack_from("<Q", b, 0xBB8)[0])
        try:
            row.append(self.formation_row(f) if f else None)
        except MemError:
            row.append(None)
        ab = self.member_vector(b, tab["m_aiAbilitiesPossessed"])
        row.append([[k, v] for k, v in enumerate(ab) if v])
        cm = tab["m_kCombatModifers"]
        row.append(self.ints(b[cm + 0x10:tab["m_kMovementModifiers"]]))
        q_p, q_n = struct.unpack_from("<Q", b, ops + 0xD0)[0], struct.unpack_from("<I", b, ops + 0xE0)[0]
        queue = []
        if ptr(q_p) and 0 < q_n <= 16:
            try:
                raw = self.pm.read(q_p, 0x30 * q_n)
                queue = [self.ints(raw[0x30 * k:0x30 * (k + 1)]) for k in range(q_n)]
            except MemError:
                pass
        row.append(queue)
        return row

    def unit_pages(self, pl: int) -> list:
        """Player::Units' paged table (+0x98: 8 entries of 0x18 a page): per
        slot [slot, the unit or 0, the entry's first word where it is no
        unit: the free list's link]"""
        holder = self.pm.u64(pl + 0x6C8) + 0x98
        pages = self.pm.u64(holder)
        n = (self.pm.u64(holder + 8) - pages) // 8
        out = []
        if not ptr(pages) or not 0 < n <= 8192:
            return out
        for k, pg in enumerate(self.pm.qwords(pages, n)):
            if not ptr(pg):
                continue
            ents = self.pm.read(pg, 0x18 * 8)
            for j in range(8):
                w = struct.unpack_from("<Q", ents, 0x18 * j)[0]
                out.append([8 * k + j, ptr(w), 0 if ptr(w) else w & 0xFFFFFFFF])
        return out

    def units(self, pl: int) -> list:
        """every unit of the player's pages: its row"""
        out = []
        for _, u, _ in self.unit_pages(pl):
            if u:
                try:
                    out.append(self.unit_row(u))
                except MemError:
                    pass
        return out

    def slots(self, pl: int) -> dict:
        """the player's unit container as the game holds it: `slots` every
        entry of its pages, a unit's [slot, id, type index, m_bDelayedDeath,
        m_aiController] (the id's high half the creation serial), a free
        entry's [slot, -1, its link]; `order` the unit ids along its list
        (+0xd0: node +0 the unit, +0x10 the next), the order the turn walks;
        `head` Player::Units' own words +0x90..+0x110 (its counts)"""
        out: dict = {"slots": [], "order": []}
        for slot, u, link in self.unit_pages(pl):
            if u:
                b = self.pm.read(u + 0xB0, 0x254)
                out["slots"].append([slot, struct.unpack_from("<i", b, 0)[0], struct.unpack_from("<i", b, 0x18)[0],
                                     b[0x238], struct.unpack_from("<i", b, 0x250)[0]])
            else:
                out["slots"].append([slot, -1, link])
        units = self.pm.u64(pl + 0x6C8)
        node, n = self.pm.u64(units + 0xD0), 0
        while ptr(node) and n < 4096:
            out["order"].append(self.pm.i32(self.pm.u64(node) + 0xB0))
            node, n = self.pm.u64(node + 0x10), n + 1
        out["head"] = self.ints(self.pm.read(units + 0x90, 0x80))
        return out

    def plan(self, u: int) -> dict | None:
        """a unit's planning (unit +0xbc0; the reach planningReachAt
        FinalRelease 0x51c340 reads): `head` its first 0x30 bytes, `reach`
        the reach list flat, four ints a plot [x, y, turns, Movement left]
        (+0x30 the items, +0x40 their count), `targets` each target's 0xd0
        bytes as 52 ints (+0x48 the items, +0x58 their count: the target's
        plot +8 / +0xc, its spots' count +0x18, per spot the blow dealt
        +0x64, taken +0x7c, the blow back taken +0x94 and dealt +0xac, the
        kill byte +0xc4, wins +0x60)"""
        p = ptr(self.pm.u64(u + 0xBC0))
        if not p:
            return None
        reach = self.items(p + 0x30, p + 0x40, 0x10, 8192)
        targets = self.items(p + 0x48, p + 0x58, 0xD0, 512)
        return {"head": self.ints(self.pm.read(p, 0x30)),
                "reach": list(struct.unpack(f"<{len(reach) // 4}i", reach)),
                "targets": [list(struct.unpack("<52i", targets[k:k + 0xD0])) for k in range(0, len(targets), 0xD0)]}

    def plans(self, pl: int) -> dict:
        """per unit id of the player its planning (`plan`)"""
        out = {}
        for _, u, _ in self.unit_pages(pl):
            if not u:
                continue
            try:
                p = self.plan(u)
                if p is not None:
                    out[self.pm.i32(u + 0xB0)] = p
            except MemError:
                pass
        return out

    def unit_table(self, pl: int) -> dict:
        """the military AI's unit production table (the military AI +0x188:
        +0x10 the entries, 0x168 bytes each, +0x20 their count, +0x28 the
        built flag; the value's reader FinalRelease 0x524e30): per entry its
        ints, the trailing zeros cut (+0 the Units index, +8.. its flags,
        +0x20 the units held, +0x2c the at-war count, +0x30 the opposition,
        +0x160 the value, 24.8)"""
        up = self.pm.u64(pl + 0x680) + 0x188
        raw = self.items(up + 0x10, up + 0x20, 0x168, 1024)
        return {"built": self.pm.u8(up + 0x28),
                "entries": [self.ints(raw[k:k + 0x168]) for k in range(0, len(raw), 0x168)]}

    def kb_cities(self, kb: int) -> list:
        """the knowledge base's known cities (+0xe0: the entries, 0xe0 bytes
        each, +0x10 their count; the look's city arm FinalRelease 0x3f5db0
        fills them): per city its first 0x30 bytes as ints (the owner and
        the entry's type in the first, the city id, +8 / +0xc its plot,
        +0x1c the population) and its defensible districts, eight ints each
        (+0x14 the defense strength, +0x18 the same while the outer defense
        holds, +0x1c the strike)"""
        raw = self.items(kb + 0xE0, kb + 0xF0, 0xE0, 512)
        out = []
        for k in range(0, len(raw), 0xE0):
            e = raw[k:k + 0xE0]
            d_p, d_n = struct.unpack_from("<Q", e, 0x48)[0], struct.unpack_from("<I", e, 0x58)[0]
            d = self.pm.read(d_p, 0x20 * d_n) if ptr(d_p) and 0 < d_n <= 64 else b""
            out.append([list(struct.unpack("<12i", e[:0x30])), list(struct.unpack(f"<{len(d) // 4}i", d))])
        return out

    def kb_targets(self, kb: int) -> list:
        """the tactical target list (the knowledge base +0x370 the entries,
        0x28 bytes each, +0x380 their count; planTargets FinalRelease
        0x51da80 walks it): ten ints an entry, flat (+4 / +8 the plot)"""
        raw = self.items(kb + 0x370, kb + 0x380, 0x28, 8192)
        return list(struct.unpack(f"<{len(raw) // 4}i", raw))

    def city_queues(self, pl: int) -> list:
        """per city of the player its id and its m_kBuildQueue, m_kCombat and
        m_kDistricts members (`fields`: the queue's per-type progress and
        its overflow under `m_kBuildQueue.v`)"""
        import aimem_fields  # noqa: PLC0415
        tab = [f for f in aimem_fields.load()["City"]["fields"] if f[0] in ("m_kBuildQueue", "m_kCombat", "m_kDistricts")]
        out = []
        node = self.pm.u64(self.pm.u64(pl + 0x6D0) + 0xD0)
        while ptr(node) and len(out) < 64:
            c = self.pm.u64(node)
            try:
                out.append({"city": self.pm.i32(c + 0xA8), **self.fields(c, tab)})
            except MemError:
                pass
            node = self.pm.u64(node + 0x10)
        return out

    def component(self, pl: int, name: str) -> dict:
        """a player component's named fields (`aimem_fields`)"""
        import aimem_fields  # noqa: PLC0415
        t = aimem_fields.load()[name]
        return self.fields(self.pm.u64(pl + int(t["component"], 16)), t["fields"])

    def all_units(self) -> dict:
        """per player id every unit's row"""
        out = {}
        for pid in PLAYER_IDS:
            pl = ptr(self.player(pid))
            if pl:
                rows = self.units(pl)
                if rows:
                    out[pid] = rows
        return out

    def full(self, pid: int, nodes: bool = False) -> dict:
        pl = self.player(pid)
        kb = self.pm.u64(pl + 0x698) + 0x270
        out: dict = {}
        for name, fn in (("army", lambda: self.army(kb)), ("camps", lambda: self.camps(kb)),
                         ("contracts", lambda: self.contracts(pl)), ("holders", lambda: self.holders(pl)),
                         ("trees", lambda: self.trees(pl, nodes)), ("ops", lambda: self.ops(pl)),
                         ("stats", lambda: self.stats(pl)), ("assigned", lambda: self.assigned(pl))):
            try:
                out[name] = fn()
            except MemError as e:
                out.setdefault("errors", []).append(f"{name}: {e}")
        return out


class Units:
    """THE UNITS' STREAM (`<stem>.aiunits.jsonl`), a line per hook hit beside
    the memory's (the same `seq`, `site`, `turn`, `player`), its first line
    the rows' columns (`aimem_fields.rows()`):
      start     `units` per player id every unit's row (`Reader.unit_row`),
                `slots` the player's unit container (`Reader.slots`)
      tactical  `units` (every player's, as the tactical turn opens),
                `slots`
      tacpass   the tactical pass about to run (after the operations'
                trees): `units` the player's own, `plans` per unit id its
                planning (`Reader.plan`), `targets` the tactical target
                list, `kbCities` the known cities with their districts'
                strengths, `slots`
      log       `slots`, `targets`, `kbCities`
      endlook   `units` the player's own, `plans` the plannings that differ
                from its tacpass's (a unit left out holds the same),
                `unitTable` the military AI's unit production table,
                `military` and `tactical` those AIs' named fields, `cities`
                each city's build queue, combat and districts members,
                `slots`
    The plannings are read for the players from `plan_from` up (the majors'
    AI is not recorded)."""

    def __init__(self, r: Reader, plan_from: int):
        self.r, self.plan_from = r, plan_from
        self.seen: dict[int, dict] = {}

    def section(self, out: dict, name: str, fn) -> None:
        try:
            out[name] = fn()
        except Exception as e:  # noqa: BLE001 — a section that fails never costs the memory's record
            out.setdefault("errors", []).append(f"{name}: {e!r}")

    def safe(self, site: str, pid: int, pl: int) -> dict:
        try:
            return self.record(site, pid, pl)
        except Exception as e:  # noqa: BLE001
            return {"errors": [f"units: {e!r}"]}

    def record(self, site: str, pid: int, pl: int) -> dict:
        r = self.r
        kb = r.pm.u64(pl + 0x698) + 0x270
        out: dict = {}
        if site in ("start", "tactical"):
            self.section(out, "units", r.all_units)
        else:
            if site != "log":
                self.section(out, "units", lambda: r.units(pl))
            if site != "endlook":
                self.section(out, "targets", lambda: r.kb_targets(kb))
                self.section(out, "kbCities", lambda: r.kb_cities(kb))
        self.section(out, "slots", lambda: r.slots(pl))
        if site in ("tacpass", "endlook") and pid >= self.plan_from:
            self.section(out, "plans", lambda: r.plans(pl))
            plans = out.get("plans") or {}
            if site == "tacpass":
                self.seen[pid] = plans
            else:
                before = self.seen.pop(pid, {})
                out["plans"] = {k: v for k, v in plans.items() if before.get(k) != v}
        if site == "endlook":
            self.section(out, "unitTable", lambda: r.unit_table(pl))
            self.section(out, "military", lambda: r.component(pl, "MilitaryAI"))
            self.section(out, "tactical", lambda: r.component(pl, "TacticalAI"))
            self.section(out, "cities", lambda: r.city_queues(pl))
        return out


def hit_record(r: Reader, mb: bytes, units: Units | None = None) -> tuple[dict | None, dict | None]:
    """a hook hit's two records: the memory's (`<stem>.aimem.jsonl`; None for
    the tactical pass's site) and the units' (`Units`; None without one)"""
    site = struct.unpack_from("<I", mb, H.SITE)[0]
    rcx, rdx, r8, _r9, ret, _rsp, _saved, look = struct.unpack_from("<8Q", mb, H.RCX)
    pm = r.pm
    rec: dict | None = {"site": site}
    if site == 1:
        # the signal reaches every player's Targets with edx 4..0; it runs
        # where the flag is set and edx is the Targets' own +0x108
        if not (r8 & 0xFF) or (rdx & 0xFFFFFFFF) != pm.u32(rcx + 0x108):
            return None, None
        pl = pm.u64(rcx + 0x98)
        rec.update(site="tactical", player=pm.i32(pl + 0xD8))
        rec.update(r.common())
        rec["army"] = r.army(rcx + 0x270)
        rec["ops"] = r.ops(pl)
        try:
            rec["danger"] = r.danger(pl)
        except MemError as e:
            rec.setdefault("errors", []).append(f"danger: {e}")
    elif site == 2:
        pid = pm.i32(rcx + 0x6E8)
        pl = r.player(pid)
        rec.update(site="log", player=pid)
        rec.update(r.common())
        rec.update(r.full(pid))
    elif site == 4:
        pl = pm.u64(look + 0x98)
        pid = pm.i32(pl + 0xD8)
        rec.update(site="endlook", player=pid)
        rec.update(r.common())
        rec.update(r.full(pid, nodes=True))
    elif site == 5:
        pl = rdx
        rec.update(site="start", player=pm.i32(rdx + 0xD8))
        rec.update(r.common())
    elif site == 6:
        # the signal reaches every player's tactical AI; its pass runs where
        # edx is the tactical AI's own +0x118
        if units is None or (rdx & 0xFFFFFFFF) != pm.u32(rcx + 0x118):
            return None, None
        pl = pm.u64(rcx + 0x98)
        head = {"site": "tacpass", "player": pm.i32(pl + 0xD8), **r.common()}
        return None, {**head, **units.safe("tacpass", head["player"], pl)}
    else:
        return None, None
    if units is None:
        return rec, None
    head = {k: rec[k] for k in ("site", "player", "turn", "rng")}
    return rec, {**head, **units.safe(rec["site"], rec["player"], pl)}


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
    units, uout, un = None, None, 0
    if a.units is not None:
        import aimem_fields  # noqa: PLC0415
        units = Units(r, a.plan_from)
        uout = open(a.units, "a", encoding="utf-8", newline="\n")
        if uout.tell() == 0:
            uout.write(json.dumps({"site": "header", "cols": aimem_fields.rows(), "planFrom": a.plan_from},
                                  separators=(",", ":")) + "\n")
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
                if units is not None:
                    units = Units(r, a.plan_from)
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
            urec = None
            try:
                mb = pm.read(M, H.MAIL_SIZE)
                rec, urec = hit_record(r, mb, units)
            except (MemError, struct.error) as e:
                rec = {"site": "error", "hook": struct.unpack_from("<I", mb, H.SITE)[0] if mb else None, "error": str(e)}
            finally:
                pm.write(M + H.ACK, struct.pack("<I", cur))
            held = time.perf_counter() - t1
            spent += held
            seq = cur
            # the wall second of the read since the watch began, the ms the game stood
            stamp = {"seq": cur, "at": round(time.monotonic() - t0, 3), "ms": round(1000 * held, 2)}
            if rec is not None:
                rec.update(stamp)
                out.write(json.dumps(rec, separators=(",", ":")) + "\n")
                n += 1
            if urec is not None:
                urec.update(stamp)
                uout.write(json.dumps(urec, separators=(",", ":")) + "\n")
                un += 1
    finally:
        try:
            pm.write(M + H.GATE, struct.pack("<I", 0))
            pm.write(M + H.ACK, struct.pack("<I", pm.u32(M + H.SEQ)))
        except MemError:
            pass
        out.close()
        if uout is not None:
            uout.close()
        print(f"stopped: {n} records, {un} unit records, {spent:.1f}s held of {time.monotonic() - t0:.0f}s", flush=True)
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
    s.add_argument("--units", type=pathlib.Path, help="the units' stream (`Units`: <stem>.aiunits.jsonl); none without it")
    s.add_argument("--plan-from", type=int, default=0,
                   help="the first player id whose units' plannings are read (the majors' count: theirs are left out)")
    s.set_defaults(fn=cmd_watch)
    s = sub.add_parser("snap")
    s.set_defaults(fn=cmd_snap)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
