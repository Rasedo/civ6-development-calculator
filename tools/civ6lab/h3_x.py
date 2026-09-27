"""H-3: read a natives-probe session record (civ6lab_mapprobe_natives.lua via
h3_session.py --probe --extra h3_postgen.lua --extra h3_dbrows.lua): the X
records decoded, the map dump, the live database's rows and the post-game
reads, plus the hex grid (odd rows shifted right, x wraps).

    from h3_x import Session
    s = Session("runs/h3_session_<stamp>.jsonl")
"""
from __future__ import annotations

import json
import pathlib
import re

M32 = 0xFFFFFFFF
A, C = 1103515245, 12345

# Civ 6 DirectionTypes: 0 NE, 1 E, 2 SE, 3 SW, 4 W, 5 NW
DIRS = ("NE", "E", "SE", "SW", "W", "NW")


def step(s: int) -> int:
    return (A * s + C) & M32


def advance(s: int, n: int) -> int:
    for _ in range(n):
        s = step(s)
    return s


def get(s: int, r: int) -> tuple[int, int]:
    """one TerrainBuilder.GetRandomNumber(r) from state s: (new state, value)"""
    s = step(s)
    return s, ((s >> 16) * (int(r) & 0xFFFF)) >> 16


def unrle(s: str) -> list[int]:
    out = []
    for part in s.split(","):
        if not part:
            continue
        v, _, n = part.rpartition("*")
        out += [int(v)] * int(n)
    return out


def unhex(s: str, n: int) -> list[bool]:
    out = []
    for ch in s:
        d = int(ch, 16)
        for k in range(4):
            out.append(bool(d >> k & 1))
    return out[:n]


class Grid:
    def __init__(self, w: int, h: int, wrap_x: bool = True):
        self.w, self.h, self.wrap_x = w, h, wrap_x
        self.n = w * h

    def xy(self, i: int) -> tuple[int, int]:
        return i % self.w, i // self.w

    def idx(self, x: int, y: int) -> int | None:
        if self.wrap_x:
            x %= self.w
        if not (0 <= x < self.w and 0 <= y < self.h):
            return None
        return y * self.w + x

    def adj(self, i: int, d: int) -> int | None:
        """the neighbour in DirectionTypes d (0 NE .. 5 NW); odd rows are
        shifted half a hex east"""
        x, y = self.xy(i)
        odd = y & 1
        dx, dy = {
            0: (odd, 1), 1: (1, 0), 2: (odd, -1), 3: (odd - 1, -1), 4: (-1, 0), 5: (odd - 1, 1),
        }[d]
        return self.idx(x + dx, y + dy)

    def ring1(self, i: int) -> list[int | None]:
        return [self.adj(i, d) for d in range(6)]

    @staticmethod
    def civ5_hexdist(dx: int, dy: int) -> int:
        """Civ 5's hexDistance(iDX, iDY): |dx| + |dy| when the signs match,
        else max(|dx|, |dy|)"""
        if (dx >= 0) == (dy >= 0):
            return abs(dx) + abs(dy)
        return max(abs(dx), abs(dy))

    def range_check(self, i: int, r: int) -> list[int]:
        """Map.GetPlotXYWithRangeCheck over dx, dy in [-r, r]: the offset
        (dx, dy) is range-checked as if it were a hex offset, then applied to
        the plot's (x, y) as an offset: a skewed, not a hex, neighbourhood"""
        x, y = self.xy(i)
        out = []
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if self.civ5_hexdist(dx, dy) > r:
                    continue
                q = self.idx(x + dx, y + dy)
                if q is not None:
                    out.append(q)
        return out

    def dist(self, a: int, b: int) -> int:
        ax, ay = self.xy(a)
        bx, by = self.xy(b)
        best = None
        shifts = (-self.w, 0, self.w) if self.wrap_x else (0,)
        for sh in shifts:
            # offset (odd-r) to cube
            def cube(x, y):
                q = x - (y - (y & 1)) // 2
                return q, y
            q1, r1 = cube(ax, ay)
            q2, r2 = cube(bx + sh, by)
            dq, dr = q1 - q2, r1 - r2
            d = (abs(dq) + abs(dr) + abs(dq + dr)) // 2
            best = d if best is None else min(best, d)
        return best


class Session:
    def __init__(self, path: str | pathlib.Path, line: int = 0):
        self.path = pathlib.Path(path)
        self.rec = [json.loads(ln) for ln in self.path.read_text(encoding="utf-8").splitlines() if ln][line]
        self.dump = json.loads(pathlib.Path(self.rec["map_dump"]).read_text(encoding="utf-8"))
        w, h = self.dump["grid"]
        self.g = Grid(w, h)
        self.plots = [p.split(".") for row in self.dump["rows"] for p in row]
        self.terrain = [int(p[0]) for p in self.plots]
        self.feature = [int(p[1]) for p in self.plots]
        self.resource = [int(p[2]) for p in self.plots]
        self.rcount = [int(p[3]) for p in self.plots]
        self.continent = [int(p[5]) for p in self.plots]
        self.flags = [int(p[6]) for p in self.plots]
        self.x = self.rec.get("probe", {}).get("x", [])
        self.log = self.rec.get("probe", {}).get("log", [])
        self.extra = self.rec.get("extra", {})
        self.db = self._db()
        ledger = self.path.with_name(self.path.stem + "_ledger.json")
        self.ledger = json.loads(ledger.read_text(encoding="utf-8")) if ledger.exists() else None

    def _db(self) -> dict:
        db = {"T": {}, "F": {}, "R": {}, "C": {}}
        for ln in self.extra.get("h3_dbrows.lua", []):
            tag, _, rest = ln.partition(" ")
            if tag in ("T", "F", "R"):
                i, _, kv = rest.partition(" ")
                row = {}
                for part in re.split(r",(?=[A-Za-z_]+=)", kv):
                    k, _, v = part.partition("=")
                    row[k] = v
                db[tag][int(i)] = row
            elif tag == "C":
                i, _, name = rest.partition(" ")
                db["C"][int(i)] = name
        return db

    def xs(self, tag: str) -> list[list[str]]:
        return [e.split("|") for e in self.x if e.split("|", 1)[0] == tag]

    def x1(self, tag: str, sub: str | None = None) -> list[str] | None:
        for e in self.xs(tag):
            if sub is None or e[1] == sub:
                return e
        return None

    def bits(self, name: str) -> list[bool]:
        return unhex(self.x1("plot", name)[2], self.g.n)

    def is_water(self, i: int) -> bool:
        return self.terrain[i] in (15, 16)

    def river_edges(self, i: int) -> dict:
        """the plot's own river flags: W (its W edge... the dump's flag bits
        1 NE-of-river, 2 NW-of-river, 4 W-of-river)"""
        f = self.flags[i]
        return {"NE": bool(f & 1), "NW": bool(f & 2), "W": bool(f & 4)}

    def postgen(self, tag: str) -> list[str]:
        return [ln for ln in self.extra.get("h3_postgen.lua", []) if ln.startswith(tag + " ")]

    def state_before(self, native: str, k: int = 0) -> int:
        """the stream state before the k-th call of `native` (the ledger)"""
        run, inblock, hits = 0, 0, []
        for kind, label, n, _d in self.ledger:
            if kind == "native":
                if label.startswith(native):
                    hits.append(run + inblock)
                inblock += n or 0
            elif kind in ("lua", "block", "tail", "gap"):
                run += n or 0
                if kind == "block":
                    inblock = 0
        return advance(self.rec["map_seed"] & M32, hits[k])

    def positions(self, native: str) -> list[int]:
        run, inblock, hits = 0, 0, []
        for kind, label, n, _d in self.ledger:
            if kind == "native":
                if label.startswith(native):
                    hits.append(run + inblock)
                inblock += n or 0
            elif kind in ("lua", "block", "tail", "gap"):
                run += n or 0
                if kind == "block":
                    inblock = 0
        return hits
