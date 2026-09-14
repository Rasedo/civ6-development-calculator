"""THE CONSTANT CHECKER — every tagged constant re-read from the install.

    python tools/civ6lab/xml_check.py get Units UnitType=UNIT_BUILDER Cost
    python tools/civ6lab/xml_check.py row Units UnitType=UNIT_BUILDER
    python tools/civ6lab/xml_check.py check [seeder/worlds/provenance.json]
    python tools/civ6lab/xml_check.py suggest Units UnitType=UNIT_ 50 --col Cost

`get` prints one cell and the file that last wrote it; `row` the whole row
with each column's last writer; `check` reads the provenance dump that
`npm run export` writes beside rules.json and prints MATCH / MISMATCH /
UNSOURCED per constant (exit 1 on any MISMATCH, never on UNSOURCED — coverage
is reported, not gated, until every catalog is tagged); `suggest` lists the
rows of a table whose column holds a value, for finding the install id of an
engine row whose spelling differs.

THE LAYERING. An XML file is a container; the TABLE is the unit of truth and
one table is written by many files. The game applies them in load order and
the last writer wins, so this reads Base, then Expansion1, then Expansion2,
then the other DLC packs alphabetically (the same order the memory
`civ6-install-source` records: layer Base <- Exp1 <- Exp2, take the LAST), and
applies each file's `<Row>` (insert or overwrite by key), `<Update>`
(`<Where>` picks rows, `<Set>` writes columns) and `<Delete>` (`<Where>`, or
attributes, picks rows) in document order. Rows are keyed by the key columns
the TAG names, so no per-table primary-key knowledge is needed: two rows that
agree on every `where` column are the same row. Attribute rows and element
rows (the Policies.xml style) both count.

Scenario and mode packs are skipped (their tables would overwrite the base
game's rows with a scenario's), and so is every `*_Icons_*`, `*_Text*`,
`*Civilopedia*` file. Needs the install on disk, no game running.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

INSTALL = pathlib.Path(r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI")
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DUMP = ROOT / "seeder" / "worlds" / "provenance.json"

SKIP_DLC = re.compile(r"Scenario|Mode$|Pack$", re.I)
SKIP_FILE = re.compile(r"Icons|Text|Civilopedia|Colors|Gossip|DiplomacyStatements|Presentation", re.I)


def data_files() -> list[pathlib.Path]:
    """the install's data files in load order"""
    out = sorted(INSTALL.glob("Base/Assets/Gameplay/Data/*.xml"))
    dlc = INSTALL / "DLC"
    packs = [p for p in sorted(dlc.iterdir()) if p.is_dir() and not SKIP_DLC.search(p.name)]
    ordered = [p for p in packs if p.name == "Expansion1"] + [p for p in packs if p.name == "Expansion2"] \
        + [p for p in packs if p.name not in ("Expansion1", "Expansion2")]
    for p in ordered:
        out += sorted((p / "Data").glob("*.xml"))
    return [f for f in out if not SKIP_FILE.search(f.name)]


def _cells(el: ET.Element) -> dict[str, str]:
    """a Row / Where / Set as {column: value}: attributes, then child elements"""
    d = dict(el.attrib)
    for child in el:
        if child.tag not in d:
            d[child.tag] = (child.text or "").strip()
    return d


def parse_where(spec: str) -> dict[str, str]:
    out = {}
    for part in spec.split("&"):
        k, _, v = part.partition("=")
        out[k.strip()] = v.strip()
    return out


CREATE_RE = re.compile(r'CREATE TABLE\s+"?(\w+)"?\s*\((.*?)\);', re.S)
COLDEF_RE = re.compile(r'^\s*"?(\w+)"?\s+\w+[^,]*?DEFAULT\s+(\S+?)\s*,?\s*$', re.M)


def schema_defaults() -> dict[str, dict[str, str]]:
    """table -> {column: DEFAULT} from every gameplay schema .sql — an absent
    cell in a row READS this, exactly as the game's database does"""
    out: dict[str, dict[str, str]] = {}
    files = sorted(INSTALL.glob("Base/Assets/Gameplay/Data/Schema/*.sql")) \
        + sorted(INSTALL.glob("DLC/*/Data/**/*.sql"))
    for f in files:
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for m in CREATE_RE.finditer(text):
            table, body = m.group(1), m.group(2)
            cols = out.setdefault(table, {})
            for cm in COLDEF_RE.finditer(body):
                v = cm.group(2).strip().strip(",")
                cols[cm.group(1)] = v.strip("'\"")
    return out


class Install:
    """every table's rows in load order, each cell remembering its last writer"""

    def __init__(self) -> None:
        # table -> list of (cells dict, {col: file})
        self.tables: dict[str, list[tuple[dict[str, str], dict[str, str]]]] = {}
        self.defaults = schema_defaults()
        self.files = data_files()
        for f in self.files:
            try:
                root = ET.parse(f).getroot()
            except ET.ParseError:
                continue
            for table in root:
                self._apply(table, f.name)

    def _apply(self, table: ET.Element, fname: str) -> None:
        rows = self.tables.setdefault(table.tag, [])
        for el in table:
            if el.tag in ("Row", "Replace"):
                # `Replace` is insert-or-replace by primary key; `Row` an
                # insert. Neither needs the table's key here: a tag's `where`
                # decides equality at read time and `find` takes the LAST
                # match, which is the replaced value either way.
                cells = _cells(el)
                rows.append((cells, {k: fname for k in cells}))
            elif el.tag == "Update":
                where = el.find("Where")
                sett = el.find("Set")
                if where is None or sett is None:
                    continue
                wc, sc = _cells(where), _cells(sett)
                for cells, who in rows:
                    if all(cells.get(k) == v for k, v in wc.items()):
                        cells.update(sc)
                        for k in sc:
                            who[k] = fname
            elif el.tag == "Delete":
                where = el.find("Where")
                wc = _cells(where) if where is not None else _cells(el)
                if not wc:
                    continue
                rows[:] = [(c, w) for c, w in rows if not all(c.get(k) == v for k, v in wc.items())]

    def find(self, table: str, where: dict[str, str]) -> tuple[dict[str, str], dict[str, str]] | None:
        """the LAST row of `table` matching every `where` column"""
        hit = None
        for cells, who in self.tables.get(table, ()):
            if all(cells.get(k) == v for k, v in where.items()):
                hit = (cells, who)
        return hit

    def get(self, table: str, where: str, col: str) -> tuple[str | None, str]:
        row = self.find(table, parse_where(where))
        if row is None:
            return None, "(no such row)"
        cells, who = row
        if col not in cells:
            d = self.defaults.get(table, {}).get(col)
            if d is not None:
                return d, "(schema DEFAULT)"
            return None, f"(row found in {who.get(next(iter(who)), '?')}, no column {col}, no default)"
        return cells[col], who.get(col, "?")


def _num(s: str):
    try:
        if re.fullmatch(r"-?\d+", s):
            return int(s)
        return float(s)
    except (TypeError, ValueError):
        return None


def values_equal(mine, theirs: str) -> bool:
    """the catalog's typed value against the install's string"""
    if isinstance(mine, bool):
        return theirs.lower() in (("true", "1") if mine else ("false", "0"))
    if isinstance(mine, (int, float)):
        t = _num(theirs)
        return t is not None and abs(float(mine) - float(t)) < 1e-9
    return str(mine) == theirs


def cmd_get(inst: Install, a: list[str]) -> int:
    table, where, col = a[0], a[1], a[2]
    v, who = inst.get(table, where, col)
    print(f"{table}[{where}].{col} = {v!r}  <- {who}")
    return 0 if v is not None else 1


def cmd_row(inst: Install, a: list[str]) -> int:
    row = inst.find(a[0], parse_where(a[1]))
    if row is None:
        print("(no such row)")
        return 1
    cells, who = row
    for k, v in cells.items():
        print(f"  {k:<32} {v!r:<40} <- {who.get(k, '?')}")
    return 0


def cmd_suggest(inst: Install, a: list[str], col: str | None) -> int:
    table, prefix, value = a[0], a[1], a[2]
    k, _, pre = prefix.partition("=")
    n = 0
    for cells, who in inst.tables.get(table, ()):
        if not cells.get(k, "").startswith(pre):
            continue
        cols = [col] if col else [c for c in cells if c != k]
        for c in cols:
            if c in cells and values_equal(_num(value) if _num(value) is not None else value, cells[c]):
                print(f"  {cells[k]}.{c} = {cells[c]}  <- {who.get(c, '?')}")
                n += 1
    print(f"{n} cell(s)")
    return 0


def cmd_check(inst: Install, path: pathlib.Path) -> int:
    dump = json.loads(path.read_text(encoding="utf-8"))
    match = mismatch = unsourced = other = 0
    per_cat: dict[str, list[int]] = {}
    for e in dump["constants"]:
        cat = e.get("catalog", "?")
        tally = per_cat.setdefault(cat, [0, 0, 0, 0])  # match, mismatch, unsourced, other
        src = e.get("src")
        name = e["name"]
        if src is None:
            unsourced += 1
            tally[2] += 1
            continue
        if "xml" in src:
            v, who = inst.get(src["xml"], src["where"], src["col"])
            want = src.get("expect", e["value"])
            if v is not None and "scale" in src and _num(v) is not None:
                # the catalog holds round(cell * scale) — compare in the
                # catalog's own units
                v = str(int(round(float(_num(v)) * float(src["scale"]) + 1e-9)))
            if v is not None and values_equal(want, v):
                match += 1
                tally[0] += 1
            else:
                mismatch += 1
                tally[1] += 1
                print(f"MISMATCH {name}: catalog {e['value']!r} vs install {v!r} "
                      f"[{src['xml']}[{src['where']}].{src['col']} <- {who}]")
        else:
            # LAB / STYLIZED / DERIVED: recorded, not compared here (yet)
            other += 1
            tally[3] += 1
    print()
    print(f"{'catalog':<22} {'match':>6} {'mism':>5} {'unsrc':>6} {'other':>6}")
    for cat, (m, mm, u, o) in sorted(per_cat.items()):
        print(f"{cat:<22} {m:>6} {mm:>5} {u:>6} {o:>6}")
    print(f"{'TOTAL':<22} {match:>6} {mismatch:>5} {unsourced:>6} {other:>6}")
    print("XML CHECK " + ("RED" if mismatch else "OK") + f" — {match} match, {mismatch} mismatch, "
          f"{unsourced} unsourced, {other} lab/stylized/derived ({len(inst.files)} install files)")
    return 1 if mismatch else 0


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    col = None
    if "--col" in argv:
        i = argv.index("--col")
        col = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    if not INSTALL.exists():
        print(f"no install at {INSTALL}")
        return 2
    inst = Install()
    cmd, rest = argv[0], argv[1:]
    if cmd == "get":
        return cmd_get(inst, rest)
    if cmd == "row":
        return cmd_row(inst, rest)
    if cmd == "suggest":
        return cmd_suggest(inst, rest, col)
    if cmd == "check":
        return cmd_check(inst, pathlib.Path(rest[0]) if rest else DUMP)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
