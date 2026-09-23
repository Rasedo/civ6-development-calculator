"""THE CONSTANT CHECKER — every tagged constant re-read from the install.

    python tools/civ6lab/xml_check.py get Units UnitType=UNIT_BUILDER Cost
    python tools/civ6lab/xml_check.py row Units UnitType=UNIT_BUILDER
    python tools/civ6lab/xml_check.py check [seeder/worlds/provenance.json]
    python tools/civ6lab/xml_check.py check --baseline docs/PROVENANCE.md   # the battery's form
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
attributes, picks rows; an empty one takes them all) in document order. A `<Delete>` follows the schema's
FOREIGN KEYs as the game's database does: Expansion1_Alliances.xml deletes
DIPLOACTION_RESEARCH_AGREEMENT from `Types`, and DiplomaticActions (whose key
references Types(Type) ON DELETE CASCADE) loses the row with it. Rows are keyed by the key columns
the TAG names, so no per-table primary-key knowledge is needed: two rows that
agree on every `where` column are the same row. Attribute rows and element
rows (the Policies.xml style) both count.

THE PACKS' ORDER IS THE GAME'S. Each pack's .modinfo lists its database
actions (InGameActions/UpdateDatabase) under criteria; `_criteria_ok`
evaluates them for a Gathering Storm game with no game mode, actions sort
by LoadOrder and files by Priority. The BASE game has no manifest —
alphabetical there is an assumption, and a MEASURED harmless one: its 82
data files carry 0 Update and 0 Delete elements (23,196 Row, 329 Replace),
so no base file can undo another's write (2026-09-14). `*_Icons_*`,
`*_Text*`, `*Civilopedia*` files are skipped. Needs the install on disk,
no game running.

THE KINDS `check` reports: XML compared (match / mism), or its cell missing
from the layered install — no such row, a row a later layer deleted, no
such column (dangl — red); DERIVED with every
XML input resolved (deriv) or one input missing (dangl — red); an input or
tag marked `absent: true` passes when the cell is MISSING and is dangling
when it is present; LAB with its runs/ file or AUDIT id found (lab) or
none named (lab?); PEDIA and STYLIZED counted; untagged (unsrc). Red on
mism + dangl only.
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

SKIP_FILE = re.compile(r"Icons|Text|Civilopedia|Colors|Gossip|DiplomacyStatements|Presentation", re.I)

# THE RULESET THIS CHECKER READS FOR: a Gathering Storm game with every
# content pack and NO game mode. A pack's .modinfo gates each database
# action on criteria; these are the answers the evaluator gives.
GAME_CORE = "Expansion2"
RULESET = "RULESET_EXPANSION_2"


def _criteria_ok(crit: ET.Element | None) -> bool:
    """evaluate one <Criteria> block for the ruleset above. A test this code
    does not know is FALSE (a game mode, a scenario, a configuration value),
    so unknown content stays out rather than sneaking in."""
    if crit is None:
        return True
    any_of = crit.get("any") == "1"
    results = []
    for t in crit:
        tag, text = t.tag, (t.text or "").strip()
        if tag == "GameCoreInUse":
            results.append(text == GAME_CORE)
        elif tag == "RuleSetInUse":
            results.append(RULESET in [x.strip() for x in text.split(",")])
        elif tag == "LeaderPlayable":
            results.append(True)   # every leader of an installed pack is playable
        elif tag == "AlwaysMet":
            results.append(True)
        elif tag == "NeverMet":
            results.append(False)
        else:
            # ConfigurationValueMatches (game modes), ModInUse, ... — not this ruleset
            results.append(False)
    if not results:
        return True
    return any(results) if any_of else all(results)


def modinfo_files(pack: pathlib.Path, pack_rank: int) -> list[tuple[int, int, int, int, pathlib.Path]]:
    """(LoadOrder, pack rank, action order, file order, path) for every
    database file a pack's .modinfo applies under this ruleset. Within an
    action, `Priority` orders files (higher first, the schema before the
    removals before the content); across actions `<LoadOrder>` (default 0)."""
    out = []
    for mi in sorted(pack.glob("*.modinfo")):
        try:
            root = ET.parse(mi).getroot()
        except ET.ParseError:
            continue
        crits = {c.get("id"): c for c in root.iter("Criteria")}
        n_act = 0
        for act in root.iter("UpdateDatabase"):
            # only the in-game actions: FrontEndActions feed the setup screen
            parent_ok = any(act in list(p) for p in root.iter("InGameActions"))
            if not parent_ok:
                continue
            cid = act.get("criteria")
            if cid is not None and not _criteria_ok(crits.get(cid)):
                continue
            lo = 0
            props = act.find("Properties")
            if props is not None and props.find("LoadOrder") is not None:
                lo = int((props.find("LoadOrder").text or "0").strip())
            files = [(-int(f.get("Priority", "0")), i, (f.text or "").strip())
                     for i, f in enumerate(act.findall("File"))]
            files.sort()
            for k, (_, _, rel) in enumerate(files):
                p = pack / rel.replace("\\", "/")
                if p.suffix.lower() == ".xml" and p.exists() and not SKIP_FILE.search(p.name):
                    out.append((lo, pack_rank, n_act, k, p))
            n_act += 1
    return out


def data_files() -> list[pathlib.Path]:
    """the install's data files in LOAD ORDER: the base game's data directory
    (no manifest exists for it; alphabetical), then every content pack's
    database actions as its .modinfo orders them under this ruleset —
    Expansion2 first (it re-ships the Expansion1 content itself; Expansion1's
    own actions are gated on a game core this ruleset does not use), then
    the other packs alphabetically, actions by LoadOrder, files by Priority.
    Alphabetical order inside a pack was WRONG: Expansion2_RemoveData.xml
    sorted between Civics and Technologies and deleted the civic boosts the
    content files had just added (agent B, 2026-09-14)."""
    out = sorted(INSTALL.glob("Base/Assets/Gameplay/Data/*.xml"))
    out = [f for f in out if not SKIP_FILE.search(f.name)]
    dlc = INSTALL / "DLC"
    packs = [p for p in sorted(dlc.iterdir()) if p.is_dir() and list(p.glob("*.modinfo"))]
    ranked = [p for p in packs if p.name == "Expansion2"] + [p for p in packs if p.name != "Expansion2"]
    acts = []
    for rank, p in enumerate(ranked):
        acts += modinfo_files(p, rank)
    acts.sort(key=lambda t: t[:4])
    seen = set()
    for _, _, _, _, p in acts:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


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
COLDEF_RE = re.compile(r'^\s*"?(\w+)"?\s+\w+.*?\bDEFAULT\s+(\S+?)\s*$', re.S)


def _split_top(body: str) -> list[str]:
    """a CREATE TABLE body split on commas OUTSIDE parentheses — a column's
    CHECK (x IN (0,1)) carries commas of its own"""
    parts, depth, cur = [], 0, []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if cur:
        parts.append("".join(cur))
    return parts


FK_RE = re.compile(r'^\s*FOREIGN\s+KEY\s*\(\s*"?(\w+)"?\s*\)\s*REFERENCES\s+"?(\w+)"?\s*\(\s*"?(\w+)"?\s*\)'
                   r'(?:.*?\bON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION))?', re.S | re.I)

# parent table -> [(child table, child column, parent column, ON DELETE action)]
ForeignKeys = dict[str, list[tuple[str, str, str, str]]]


def schema() -> tuple[dict[str, dict[str, str]], ForeignKeys]:
    """from every gameplay schema .sql: table -> {column: DEFAULT} (an absent
    cell in a row READS this, exactly as the game's database does), and every
    FOREIGN KEY keyed by the table it REFERENCES — a `<Delete>` from `Types`
    removes the DiplomaticActions row whose key it names, because that key
    column references Types(Type) ON DELETE CASCADE"""
    out: dict[str, dict[str, str]] = {}
    fks: ForeignKeys = {}
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
            for coldef in _split_top(body):
                fk = FK_RE.match(coldef.strip())
                if fk:
                    action = " ".join((fk.group(4) or "NO ACTION").upper().split())
                    fks.setdefault(fk.group(2), []).append((table, fk.group(1), fk.group(3), action))
                    continue
                cm = COLDEF_RE.match(coldef.strip())
                if cm:
                    cols[cm.group(1)] = cm.group(2).strip().strip("'\"")
    return out, fks


class Install:
    """every table's rows in load order, each cell remembering its last writer"""

    def __init__(self) -> None:
        # table -> list of (cells dict, {col: file})
        self.tables: dict[str, list[tuple[dict[str, str], dict[str, str]]]] = {}
        # table -> [(cells, "deleted by <file> ...")] — every row a later
        # layer removed, so a tag citing one reads DANGLING with its cause
        self.deleted: dict[str, list[tuple[dict[str, str], str]]] = {}
        self.defaults, self.fks = schema()
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
                # an EMPTY `<Delete/>` matches every row, as SQL's bare
                # DELETE does (Expansion2_RemoveData.xml empties
                # GovernmentBonusNames this way)
                wc = _cells(where) if where is not None else _cells(el)
                self._delete(table.tag, wc, f"deleted by {fname}")

    def _delete(self, table: str, where: dict[str, str], why: str) -> None:
        """remove `table`'s rows matching `where`, then follow every FOREIGN
        KEY that references `table`: ON DELETE CASCADE removes the child rows
        (recursively), SET NULL / SET DEFAULT drop the child's cell so it
        reads the schema DEFAULT (or nothing)."""
        rows = self.tables.get(table)
        if not rows:
            return
        gone = [c for c, _ in rows if all(c.get(k) == v for k, v in where.items())]
        if not gone:
            return
        rows[:] = [(c, w) for c, w in rows if not all(c.get(k) == v for k, v in where.items())]
        self.deleted.setdefault(table, []).extend((c, why) for c in gone)
        for child, col, pcol, action in self.fks.get(table, ()):
            for key in {c[pcol] for c in gone if pcol in c}:
                if action == "CASCADE":
                    self._delete(child, {col: key}, f"{why} (cascade {table}.{pcol} -> {child}.{col})")
                elif action in ("SET NULL", "SET DEFAULT"):
                    for cells, who in self.tables.get(child, ()):
                        if cells.get(col) == key:
                            cells.pop(col)
                            who.pop(col, None)

    def find(self, table: str, where: dict[str, str]) -> tuple[dict[str, str], dict[str, str]] | None:
        """the LAST row of `table` matching every `where` column"""
        hit = None
        for cells, who in self.tables.get(table, ()):
            if all(cells.get(k) == v for k, v in where.items()):
                hit = (cells, who)
        return hit

    def get(self, table: str, where: str, col: str) -> tuple[str | None, str]:
        w = parse_where(where)
        row = self.find(table, w)
        if row is None:
            for cells, why in reversed(self.deleted.get(table, ())):
                if all(cells.get(k) == v for k, v in w.items()):
                    return None, f"(row {why})"
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


AUDIT_MD = ROOT / "docs" / "AUDIT.md"
RUNS_DIR = ROOT / "tools" / "civ6lab" / "runs"
LAB_REF = re.compile(r"\b([ABC]-\d+r?)\b|\bask (\d+)\b|runs/([A-Za-z0-9_.-]+)")


def xml_cell(inst: Install, src: dict, want) -> tuple[str | None, str]:
    """the install cell a tag names, in the CATALOG's units (scale applied)"""
    v, who = inst.get(src["xml"], src["where"], src["col"])
    if v is not None and "scale" in src and _num(v) is not None:
        # the catalog holds cell * scale — rounded when the catalog's value
        # is a whole number (a cost through GAME_SPEED), exact when it is a
        # fraction (a percentage stored as 0.25)
        prod = float(_num(v)) * float(src["scale"])
        if isinstance(want, (int, float)) and float(want) != int(want):
            v = repr(prod)
        else:
            v = str(int(round(prod + 1e-9)))
    return v, who


def lab_ref_ok(text: str, audit: str) -> bool | None:
    """True = the reference resolves, False = dangling, None = unverifiable
    (the tag names no AUDIT id and no runs/ file)"""
    found = False
    for m in LAB_REF.finditer(text):
        found = True
        if m.group(3):
            if not (RUNS_DIR / m.group(3)).exists():
                return False
        elif m.group(1):
            if m.group(1) not in audit:
                return False
        elif m.group(2):
            if f"ask {m.group(2)}" not in audit.lower() and f"| {m.group(2)} " not in audit:
                return False
    return True if found else None


FALLBACK_RE = re.compile(r"^(\S+) where the install .*\b(no|NO)\b")
PRESENCE_RE = re.compile(r"^true where the install (writes|carries|gives|has)\b", re.I)


def _truthy(v) -> bool:
    return v not in (0, 0.0, False, None, "", "0", "false")


def derived_verdict(inst: Install, src: dict, value) -> tuple[str, str]:
    """('ok' | 'dangling' | 'presence', why) for a DERIVED tag.

    The formula is words, and three shapes of it carry checkable semantics:
      * `X where the install ... no Y`  — the ABSENCE is the fact: when the
        input is missing the catalog must hold X (true, 0, 99, CITY_CENTER);
        when it is present nothing is claimed here;
      * `true where the install writes/carries/gives ...` — PRESENCE is the
        fact: the input present <=> the catalog value truthy;
      * anything else — every input must resolve; an input marked
        `absent: true` must NOT resolve; an unmarked missing input reads as
        ZERO, so it passes only when the catalog value is falsy.
    """
    text = src["derived"]
    inputs = [i for i in (src.get("inputs") or []) if "xml" in i]
    present = []
    missing = []
    for inp in inputs:
        v, who = inst.get(inp["xml"], inp["where"], inp["col"])
        ref = f"{inp['xml']}[{inp['where']}].{inp['col']}"
        if inp.get("absent"):
            if v is not None:
                return "presence", f"{ref} is PRESENT ({v!r} <- {who}) where the tag says absent"
            continue
        (present if v is not None else missing).append((ref, who, v))
    fb = FALLBACK_RE.match(text)
    if fb:
        if missing and not present:
            want = fb.group(1).strip("'\"`")
            if values_equal(value, want) or str(value) == want:
                return "ok", ""
            return "presence", f"the input is absent and the tag says the catalog then holds {want!r}"
        return "ok", ""
    if PRESENCE_RE.match(text):
        if bool(present) == _truthy(value):
            return "ok", ""
        state = "present" if present else "absent"
        return "presence", f"the input is {state} ({present[0][0] if present else missing[0][0]})"
    if missing:
        if not _truthy(value):
            return "ok", ""   # an absent cell reads as zero, and the catalog says zero
        return "dangling", "; ".join(f"{r} {w}" for r, w, _ in missing)
    return "ok", ""


RED_LINE = re.compile(r"^(MISMATCH|DANGLING) (\S+?):")


def known_red(baseline: pathlib.Path) -> set[str]:
    """the constant names a baseline file (docs/PROVENANCE.md, or a saved
    check output) already lists as MISMATCH or DANGLING"""
    out = set()
    for ln in baseline.read_text(encoding="utf-8").splitlines():
        m = RED_LINE.match(ln.strip())
        if m:
            out.add(m.group(2))
    return out


def cmd_check(inst: Install, path: pathlib.Path, baseline: pathlib.Path | None = None) -> int:
    dump = json.loads(path.read_text(encoding="utf-8"))
    audit = AUDIT_MD.read_text(encoding="utf-8") if AUDIT_MD.exists() else ""
    COLS = ("match", "mism", "unsrc", "deriv", "dangl", "lab", "lab?", "pedia", "styl")
    tot = dict.fromkeys(COLS, 0)
    per_cat: dict[str, dict[str, int]] = {}
    red: list[str] = []
    for e in dump["constants"]:
        cat = e.get("catalog", "?")
        t = per_cat.setdefault(cat, dict.fromkeys(COLS, 0))
        src = e.get("src")
        name = e["name"]

        def hit(col: str) -> None:
            t[col] += 1
            tot[col] += 1

        if src is None:
            hit("unsrc")
        elif "xml" in src:
            want = src.get("expect", e["value"])
            v, who = xml_cell(inst, src, want)
            if v is None:
                # the cited cell does not resolve in the LAYERED install: no
                # such row, a row a later layer deleted, or no such column
                hit("dangl")
                red.append(f"DANGLING {name}: [{src['xml']}[{src['where']}].{src['col']}] {who}")
            elif values_equal(want, v):
                hit("match")
            else:
                hit("mism")
                red.append(f"MISMATCH {name}: catalog {e['value']!r} vs install {v!r} "
                           f"[{src['xml']}[{src['where']}].{src['col']} <- {who}]")
        elif "derived" in src:
            verdict, why = derived_verdict(inst, src, e["value"])
            if verdict == "ok":
                hit("deriv")
            elif verdict == "presence":
                hit("mism")
                red.append(f"MISMATCH {name}: catalog {e['value']!r} but {why}")
            else:
                hit("dangl")
                red.append(f"DANGLING {name}: derived '{src['derived'][:60]}' names {why}")
        elif "lab" in src:
            ok = lab_ref_ok(src["lab"], audit)
            if ok is False:
                hit("dangl")
                red.append(f"DANGLING {name}: lab reference not found — {src['lab'][:80]}")
            elif ok:
                hit("lab")
            else:
                hit("lab?")
        elif "pedia" in src:
            hit("pedia")
        elif "stylized" in src:
            hit("styl")
        else:
            hit("unsrc")
    for line in red:
        print(line)
    print()
    print(f"{'catalog':<22} " + " ".join(f"{c:>6}" for c in COLS))
    for cat, t in sorted(per_cat.items()):
        print(f"{cat:<22} " + " ".join(f"{t[c]:>6}" for c in COLS))
    print(f"{'TOTAL':<22} " + " ".join(f"{tot[c]:>6}" for c in COLS))
    bad = tot["mism"] + tot["dangl"]
    summary = (f"{tot['match']} match, {tot['mism']} mismatch, {tot['dangl']} dangling, "
               f"{tot['unsrc']} unsourced, {tot['deriv']} derived, {tot['lab']} lab "
               f"(+{tot['lab?']} unverifiable), {tot['pedia']} pedia, {tot['styl']} stylized "
               f"({len(inst.files)} install files)")
    if baseline is not None:
        # THE RATCHET: the ledger already knows these lines and #264 burns
        # them down; what the battery must catch is a NEW disagreement — a
        # catalog edit that moved a value away from the install, or a tag
        # that stopped resolving. A fixed line is news too, but good news.
        known = known_red(baseline)
        now = {RED_LINE.match(ln).group(2) for ln in red if RED_LINE.match(ln)}
        new = sorted(now - known)
        fixed = sorted(known - now)
        for n in new:
            print(f"NEW RED {n}")
        if fixed:
            print(f"fixed since the baseline ({len(fixed)}): " + ", ".join(fixed[:12]) + (" …" if len(fixed) > 12 else ""))
        print("XML CHECK " + ("RED" if new else "OK") + f" against {baseline.name} — "
              f"{len(new)} new, {len(now) - len(new)} known, {len(fixed)} fixed; " + summary)
        return 1 if new else 0
    print("XML CHECK " + ("RED" if bad else "OK") + " — " + summary)
    return 1 if bad else 0


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    col = None
    if "--col" in argv:
        i = argv.index("--col")
        col = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    baseline = None
    if "--baseline" in argv:
        i = argv.index("--baseline")
        baseline = pathlib.Path(argv[i + 1])
        argv = argv[:i] + argv[i + 2:]
    cmd, rest = argv[0], argv[1:]
    if not INSTALL.exists():
        if cmd == "check" and baseline is not None:
            # the battery's hook on a box without the game: not an engine
            # failure, and not a pass either — say so and step aside
            print(f"XML CHECK SKIPPED — no install at {INSTALL}")
            return 0
        print(f"no install at {INSTALL}")
        return 2
    inst = Install()
    if cmd == "get":
        return cmd_get(inst, rest)
    if cmd == "row":
        return cmd_row(inst, rest)
    if cmd == "suggest":
        return cmd_suggest(inst, rest, col)
    if cmd == "check":
        return cmd_check(inst, pathlib.Path(rest[0]) if rest else DUMP, baseline)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
