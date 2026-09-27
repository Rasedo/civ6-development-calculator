"""The gameplay database a Gathering Storm game builds, read from the
install: Base's data files, then every content pack's in-game database
actions under RULESET_EXPANSION_2 (tools/install/xml_check.py's criteria
evaluator), the packs in the game's mod order.

THE MOD ORDER. A pack that `References` another loads after it; one that
`ReverseReferences` another loads before it; packs otherwise free are taken
by mod id (case-insensitive). That puts Indonesia_Khmer, VikingsLandmarks and
Australia before Expansion1, Expansion1 before Expansion2 and
GranColombia_Maya after it — the Features indices the game's map dumps carry
(Ha Long Bay 18, the Vikings wonders 19-21, Uluru 22, the Expansion1 major
wonders 23-29, Reef 30, the Expansion2 features 31-42, the Maya wonders 43-45).
Across packs actions sort by (LoadOrder, pack order, action order, file
Priority).

ROWS. `Row` inserts (a duplicate primary key is refused, as SQLite refuses
it), `Replace` deletes the row with its key and appends (INSERT OR REPLACE
gives it a new rowid), `Update` / `Delete` as tools/install does. A row's
Index is its position (rowid order), RowId = Index + 1, Hash = DB.MakeHash of
its primary key: CRC-32 of the string without the final inversion, signed
(DB.MakeHash("MAPSIZE_DUEL") = 388991850, read back from the game).
Cells are typed by the schema: BOOLEAN -> bool, INTEGER -> int, REAL /
NUMERIC -> float, a missing cell reads the column's DEFAULT or nil.
"""
from __future__ import annotations

import heapq
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools" / "install"))
import xml_check as X  # noqa: E402

INSTALL = X.INSTALL


def make_hash(s: str) -> int:
    h = zlib.crc32(s.encode("utf-8")) ^ 0xFFFFFFFF
    return h - (1 << 32) if h >= 1 << 31 else h


def _mod_order(packs: list[pathlib.Path]) -> list[pathlib.Path]:
    info = {}
    for p in packs:
        mi = sorted(p.glob("*.modinfo"))[0]
        root = ET.parse(mi).getroot()
        mid = root.get("id", p.name).upper()
        refs = [m.get("id", "").upper() for r in root.iter("References") for m in r.iter("Mod")]
        rrefs = [m.get("id", "").upper() for r in root.iter("ReverseReferences") for m in r.iter("Mod")]
        info[mid] = (p, refs, rrefs)
    after: dict[str, set] = {m: set() for m in info}   # m -> mods that must precede m
    for m, (_, refs, rrefs) in info.items():
        for r in refs:
            if r in info:
                after[m].add(r)
        for r in rrefs:
            if r in info:
                after[r].add(m)
    order, done = [], set()
    ready = [m for m in info if not after[m]]
    heapq.heapify(ready)
    while ready:
        m = heapq.heappop(ready)
        order.append(info[m][0])
        done.add(m)
        for n in info:
            if n not in done and n not in ready and after[n] <= done:
                heapq.heappush(ready, n)
    return order


def data_files() -> list[pathlib.Path]:
    out = [f for f in sorted(INSTALL.glob("Base/Assets/Gameplay/Data/*.xml")) if not X.SKIP_FILE.search(f.name)]
    dlc = INSTALL / "DLC"
    packs = [p for p in sorted(dlc.iterdir()) if p.is_dir() and list(p.glob("*.modinfo"))]
    acts = []
    for rank, p in enumerate(_mod_order(packs)):
        acts += X.modinfo_files(p, rank)
    acts.sort(key=lambda t: t[:4])
    seen = set()
    for *_, p in acts:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


CREATE_RE = re.compile(r'CREATE TABLE\s+"?(\w+)"?\s*\((.*?)\);', re.S)
COL_RE = re.compile(r'^\s*"?(\w+)"?\s+(\w+)(.*)$', re.S)
PK_RE = re.compile(r'^\s*PRIMARY\s+KEY\s*\((.*?)\)', re.S | re.I)
DEFAULT_RE = re.compile(r'\bDEFAULT\s+(\S+)', re.I)


class Schema:
    def __init__(self) -> None:
        self.cols: dict[str, dict[str, tuple[str, str | None]]] = {}
        self.pk: dict[str, list[str]] = {}
        files = sorted(INSTALL.glob("Base/Assets/Gameplay/Data/Schema/*.sql")) + sorted(INSTALL.glob("DLC/*/Data/**/*.sql"))
        for f in files:
            text = f.read_text(encoding="utf-8", errors="replace")
            for m in CREATE_RE.finditer(text):
                table, body = m.group(1), m.group(2)
                if table in self.cols:
                    continue
                cols: dict[str, tuple[str, str | None]] = {}
                for part in X._split_top(body):
                    part = part.strip()
                    pk = PK_RE.match(part)
                    if pk:
                        self.pk[table] = [c.strip().strip('"') for c in pk.group(1).split(",")]
                        continue
                    if re.match(r"^(FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b", part, re.I):
                        continue
                    cm = COL_RE.match(part)
                    if not cm:
                        continue
                    d = DEFAULT_RE.search(cm.group(3))
                    cols[cm.group(1)] = (cm.group(2).upper(), d.group(1).strip("'\"") if d else None)
                    if re.search(r"\bPRIMARY\s+KEY\b", cm.group(3), re.I):
                        self.pk[table] = [cm.group(1)]
                self.cols[table] = cols


def _typed(kind: str, v: str | None):
    if v is None:
        return None
    if kind == "BOOLEAN":
        return v.strip().lower() in ("1", "true")
    if kind in ("INTEGER", "INT", "LONG"):
        try:
            return int(v)
        except ValueError:
            try:
                return int(float(v))
            except ValueError:
                return v
    if kind in ("REAL", "NUMERIC", "FLOAT"):
        try:
            return float(v)
        except ValueError:
            return v
    if v.upper() == "NULL":
        return None
    return v


class GameInfo:
    """table -> list of typed rows (dicts) in Index order"""

    def __init__(self) -> None:
        self.schema = Schema()
        self.raw: dict[str, list[dict[str, str]]] = {}
        self._keys: dict[str, dict[tuple, dict]] = {}
        for f in data_files():
            try:
                root = ET.parse(f).getroot()
            except ET.ParseError:
                continue
            for table in root:
                self._apply(table)
        self.tables: dict[str, list[dict]] = {}
        for t, rows in self.raw.items():
            cols = self.schema.cols.get(t, {})
            pk = self.schema.pk.get(t, [])
            out = []
            for i, cells in enumerate(rows):
                row = {}
                for c, (kind, d) in cols.items():
                    row[c] = _typed(kind, cells.get(c, d))
                for c, v in cells.items():
                    if c not in row:
                        row[c] = _typed("TEXT", v)
                row["Index"] = i
                row["RowId"] = i + 1
                if len(pk) == 1 and isinstance(row.get(pk[0]), str):
                    row["Hash"] = make_hash(row[pk[0]])
                out.append(row)
            self.tables[t] = out

    def _key(self, table: str, cells: dict[str, str]):
        pk = self.schema.pk.get(table)
        if not pk or any(c not in cells for c in pk):
            return None
        return tuple(cells[c] for c in pk)

    def _apply(self, table: ET.Element) -> None:
        rows = self.raw.setdefault(table.tag, [])
        keys = self._keys.setdefault(table.tag, {})
        for el in table:
            if el.tag in ("Row", "Replace"):
                cells = X._cells(el)
                k = self._key(table.tag, cells)
                if k is not None:
                    old = keys.get(k)
                    if old is not None and any(c is old for c in rows):
                        if el.tag == "Row":
                            continue
                        rows[:] = [c for c in rows if c is not old]
                    keys[k] = cells
                rows.append(cells)
            elif el.tag == "Update":
                where, sett = el.find("Where"), el.find("Set")
                if where is None or sett is None:
                    continue
                wc, sc = X._cells(where), X._cells(sett)
                for cells in rows:
                    if all(cells.get(k) == v for k, v in wc.items()):
                        cells.update(sc)
            elif el.tag == "Delete":
                where = el.find("Where")
                wc = X._cells(where) if where is not None else X._cells(el)
                rows[:] = [c for c in rows if not all(c.get(k) == v for k, v in wc.items())]

    def rows(self, table: str) -> list[dict]:
        return self.tables.get(table, [])

    def find(self, table: str, **where) -> dict | None:
        for r in self.rows(table):
            if all(r.get(k) == v for k, v in where.items()):
                return r
        return None

    def index(self, table: str, col: str, value: str) -> int:
        r = self.find(table, **{col: value})
        return -1 if r is None else r["Index"]

    def pk(self, table: str) -> str | None:
        pk = self.schema.pk.get(table, [])
        return pk[0] if len(pk) == 1 else None
