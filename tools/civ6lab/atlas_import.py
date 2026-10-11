"""The atlas's citations and its bootstrap import.

`citations()` finds every DLL address the project cites: in
tools/civ6lab/dll_readings.md (with its section and paragraph) and in the
comments and string literals of the code under cpu/, gpu/ and ai/ (with the
symbol around it). An address is a hex number of 5 to 8 digits inside the
binary's image, not after `+` (a field offset). Its binary: FinalRelease
when "FinalRelease" stands within 40 characters before it; else
CivilizationVI.exe when its paragraph speaks of the exe and it lies below
0x100000; else FinalRelease when its paragraph has spoken of FinalRelease
before it and it is not followed by "(FinalRelease" (a Release address
with its twin);
else the Release DLL.

`python tools/civ6lab/atlas.py import` adds a curated record for every cited
function / global that has none (`review: imported`): its name where the
prose or a saved label names it, the dll_readings sections citing it, the
strongest status those give it (a section titled PARTLY / CLOSED / READ, an
"unread" right after the address), the recorded cases of its paragraphs (a
seed, a recording, a turn), the notes other agents saved
(.claude/scratchpad/*/), and the engine symbols whose comments cite it.
A READ with no case found is imported PARTLY. Existing records keep
everything; only their missing `impl` / `readings` entries are added.
"""
from __future__ import annotations

import io
import json
import pathlib
import re
import sys
import tokenize
from collections import defaultdict

import atlas
from atlas import ATLAS, ROOT, Gen, hexint, yaml_dump_records, yaml_load

READINGS = atlas.HERE / "dll_readings.md"
CODE_DIRS = ("cpu", "gpu", "ai")
TOKEN = re.compile(r"(?<![\w+.])0x([0-9a-fA-F]{5,8})(?!\w)")
SEED = re.compile(r"\b(h1_[a-z0-9]+_\d{8}T\d{6}Z|h1_duel[vw]?\d{4}|duel[vw]?\s?\d{4}|(?<![\d.])11[0-3]\d(?![\d.]))\b")
LAB = re.compile(r"\b(lab\d [A-Z0-9-]+|AI_[A-Za-z_]+\.csv|RandCalls\.csv|[A-Z][A-Za-z_]+\.csv)\b")
TURN = re.compile(r"\b(?:turn|[tT])\s?(\d{1,3})\b")
STOP = {"FinalRelease", "Release", "GameCore", "GameCore_XP2", "RVA", "DLL", "READ", "PARTLY", "LAB", "CLOSED",
        "The", "This", "That", "With", "From", "Into"}
HEADER = """The DLL atlas, curated layer (tools/civ6lab/atlas.py documents the record).
Records keyed by GameCore_XP2_Release.dll RVA; `final` the FinalRelease RVA.
`review: imported` = bootstrapped from dll_readings.md / code comments / saved
labels and not yet reviewed: verify against the disassembly, then edit and
set `review: reviewed`."""


class Images:
    """the address ranges of both binaries, from the generated layer"""

    def __init__(self, g: Gen):
        self.g = g
        self.sections = {side: {k: (int(a, 16), int(b, 16)) for k, (a, b) in
                                g.meta["binaries"][atlas.BIN[side]]["sections"].items()} for side in atlas.BIN}
        self.end = {side: max(b for _, b in s.values()) for side, s in self.sections.items()}

    def section(self, side: str, rva: int) -> str | None:
        for k, (a, b) in self.sections[side].items():
            if a <= rva < b:
                return k
        return None

    def is_start(self, side: str, rva: int) -> bool:
        return rva in self.g.funcs[side]


def classify(im: Images, value: int, before: str, para: str, after: str = "") -> str | None:
    """the binary an address token names: 'R', 'F', 'exe', or None (no address)"""
    if value < 0x1000:
        return None
    if "FinalRelease" in before[-40:]:
        return "F" if value < im.end["F"] else None
    if re.search(r"\bexe\b|CivilizationVI\.exe", para) and value < 0x100000:
        return "exe"
    if "FinalRelease" in before and not re.match(r"\s*\(FinalRelease", after) and value < im.end["F"]:
        return "F"
    return "R" if value < im.end["R"] else None


def section_status(title: str) -> str:
    if "PARTLY" in title:
        return "PARTLY"
    if re.search(r"\bREAD\b|CLOSED", title):
        return "READ"
    return "PARTLY"


def readings_citations(im: Images) -> list[dict]:
    text = READINGS.read_text(encoding="utf-8")
    out = []
    section = ""
    paras: list[tuple[int, str, str]] = []
    cur: list[str] = []
    start = 0
    lines = text.splitlines()
    for i, ln in enumerate(lines + [""]):
        new_para = not ln.strip() or ln.startswith("#") or re.match(r"^\s*[-*] ", ln) or ln.startswith("|")
        if new_para and cur:
            paras.append((start, section, "\n".join(cur)))
            cur = []
        if ln.startswith("#"):
            section = ln.lstrip("#").strip()
            paras.append((i, section, ln))
            continue
        if ln.strip():
            if not cur:
                start = i
            cur.append(ln)
    for line0, sec, para in paras:
        flat = para.replace("\n", " ")
        for m in TOKEN.finditer(flat):
            v = int(m.group(1), 16)
            side = classify(im, v, flat[: m.start()], flat, flat[m.end():])
            if side is None:
                continue
            after = flat[m.end(): m.end() + 24]
            status = "UNREAD" if re.match(r"^[^.;]{0,16}\bunread\b", after) else section_status(sec)
            out.append({"file": "tools/civ6lab/dll_readings.md", "line": line0 + 1, "side": side, "value": v,
                        "before": flat[max(0, m.start() - 80): m.start()], "para": flat, "section": sec,
                        "status": status, "snippet": snippet(flat, m.start(), m.end())})
    return out


def snippet(text: str, a: int, b: int, width: int = 90) -> str:
    lo = max(0, a - width)
    hi = min(len(text), b + width)
    return ("..." if lo else "") + text[lo:hi].strip() + ("..." if hi < len(text) else "")


# -- code ----------------------------------------------------------------------
DECL_TS = re.compile(r"^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+(\w+)|(?:const|let|var)\s+(\w+)\b|"
                     r"(?:interface|type|class|enum)\s+(\w+)|(?:(?:public|private|protected|static|readonly|async)\s+)*"
                     r"(\w+)\s*(?:<[^>]*>)?\([^;]*\)\s*(?::[^=;{]+)?\{)")
DECL_PY = re.compile(r"^\s*(?:async\s+)?(?:def|class)\s+(\w+)|^([A-Za-z_]\w*)\s*(?::[^=]+)?=")
KEYWORDS = {"if", "for", "while", "switch", "catch", "return", "function", "else", "do", "try", "with"}


def ts_spans(src: str) -> list[tuple[int, int]]:
    """the comment and string-literal spans of TypeScript source"""
    spans = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            j = src.find("\n", i)
            j = n if j < 0 else j
            spans.append((i, j))
            i = j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            spans.append((i, j))
            i = j
        elif c in "'\"`":
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == "\\" else 1
            spans.append((i, j + 1))
            i = j + 1
        else:
            i += 1
    return spans


def py_spans(src: str) -> list[tuple[int, int]]:
    starts = [0]
    for ln in src.splitlines(keepends=True):
        starts.append(starts[-1] + len(ln))
    spans = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if tok.type in (tokenize.COMMENT, tokenize.STRING) or tok.type == getattr(tokenize, "FSTRING_MIDDLE", -1):
                a = starts[tok.start[0] - 1] + tok.start[1]
                b = starts[tok.end[0] - 1] + tok.end[1]
                spans.append((a, b))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        pass
    return spans


def enclosing(lines: list[str], at: int, py: bool) -> str | None:
    decl = DECL_PY if py else DECL_TS

    def name(ln: str) -> str | None:
        m = decl.match(ln)
        if not m:
            return None
        got = next((x for x in m.groups() if x), None)
        return None if got in KEYWORDS else got

    def is_comment(ln: str) -> bool:
        s = ln.strip()
        return not s or s.startswith(("//", "/*", "*", "#", '"""', "'''")) or s.endswith("*/")

    indent = len(lines[at]) - len(lines[at].lstrip())
    j = at
    while j < len(lines) and j < at + 40 and is_comment(lines[j]):
        j += 1
    if j < len(lines) and len(lines[j]) - len(lines[j].lstrip()) <= indent:
        got = name(lines[j])
        if got:
            return got
    for k in range(at, -1, -1):
        ln = lines[k]
        if ln.strip() and len(ln) - len(ln.lstrip()) < max(indent, 1) or k == 0:
            got = name(ln)
            if got:
                return got
        if ln.strip() and len(ln) - len(ln.lstrip()) == 0 and k < at:
            got = name(ln)
            return got
    return None


def code_files() -> list[pathlib.Path]:
    out = []
    for d in CODE_DIRS:
        for p in sorted((ROOT / d).rglob("*")):
            if p.suffix in (".ts", ".py") and "node_modules" not in p.parts and "__pycache__" not in p.parts:
                out.append(p)
    return out


def code_citations(im: Images) -> list[dict]:
    out = []
    for p in code_files():
        src = p.read_text(encoding="utf-8", errors="replace")
        if not TOKEN.search(src):
            continue
        py = p.suffix == ".py"
        spans = py_spans(src) if py else ts_spans(src)
        lines = src.splitlines()
        line_starts = [0]
        for ln in src.splitlines(keepends=True):
            line_starts.append(line_starts[-1] + len(ln))
        rel = p.relative_to(ROOT).as_posix()
        for a, b in spans:
            chunk = src[a:b]
            for m in TOKEN.finditer(chunk):
                v = int(m.group(1), 16)
                pos = a + m.start()
                flat = chunk.replace("\n", " ")
                side = classify(im, v, flat[: m.start()], flat, flat[m.end():])
                if side is None:
                    continue
                line = max(0, next(i for i, s in enumerate(line_starts) if s > pos) - 2)
                out.append({"file": rel, "line": line + 1, "side": side, "value": v,
                            "before": flat[max(0, m.start() - 80): m.start()], "para": flat,
                            "symbol": enclosing(lines, line, py), "snippet": snippet(flat, m.start(), m.end())})
    return out


def citations(g: Gen | None = None) -> list[dict]:
    g = g or Gen()
    im = Images(g)
    return readings_citations(im) + code_citations(im)


# -- resolving -------------------------------------------------------------------
def resolve(g: Gen, im: Images, side: str, v: int) -> tuple[str, int, str]:
    """(side, key address, kind): the function holding a code address, else
    the datum itself"""
    if side == "exe":
        return ("exe", v, "function")
    if im.section(side, v) == ".text":
        f = g.func_of(side, v)
        return (side, f if f is not None else v, "function")
    kind = "string" if v in g.strings(side) else "global"
    return (side, v, kind)


def prose_name(before: str) -> str | None:
    before = before.rstrip()
    before = re.sub(r"[(\[]\s*$", "", before).rstrip()
    m = re.search(r"`([A-Za-z_][\w:.~]*(?:\(\))?)`$", before)
    if m:
        return m.group(1)
    m = re.search(r"([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_~][A-Za-z0-9_]*)*(?:\(\))?)$", before)
    if not m:
        return None
    ident = m.group(1)
    if ident in STOP or len(ident) < 4 or ident.endswith(".csv"):
        return None
    if "::" in ident or "_" in ident.strip("_") or re.search(r"[a-z][A-Z]", ident):
        if re.fullmatch(r"[A-Z0-9_]+", ident) and "_" not in ident:
            return None
        return ident
    return None


def scratch_notes() -> list[tuple[str, str]]:
    """(file, text) of the notes other agents saved"""
    base = ROOT.parents[2] / ".claude" / "scratchpad" if ROOT.parent.name == "worktrees" else ROOT / ".claude" / "scratchpad"
    out = []
    for p in sorted(base.glob("*/*")):
        if p.parent.name in ("h1hunt", "pylibs") or p.parent.name.startswith("memory-archive"):
            continue
        if p.suffix in (".md", ".txt") and re.search(r"note|reading|name|label", p.name, re.I):
            out.append((p.relative_to(base.parents[1]).as_posix(), p.read_text(encoding="utf-8", errors="replace")))
    return out


def saved_labels() -> tuple[dict[int, str], dict[int, str]]:
    base = ROOT.parents[2] / ".claude" / "scratchpad" if ROOT.parent.name == "worktrees" else ROOT / ".claude" / "scratchpad"
    labels, gnames = {}, {}
    for p in sorted(base.glob("*/labels.json")):
        for k, v in json.loads(p.read_text(encoding="utf-8")).items():
            if v:
                labels[int(k, 16)] = v
    for p in sorted(base.glob("*/gnames.json")):
        for k, v in json.loads(p.read_text(encoding="utf-8")).items():
            if v:
                gnames[int(k, 16)] = v
    return labels, gnames


def target_file(g: Gen, side: str, key: int, kind: str) -> pathlib.Path:
    if side == "exe":
        return ATLAS / "other.yaml"
    if kind in ("global", "string"):
        return ATLAS / "globals.yaml"
    row = g.funcs[side].get(key)
    if row and row[1]:
        return ATLAS / "src" / (row[1] + ".yaml")
    return ATLAS / "unattributed.yaml"


def build_records(g: Gen) -> dict[tuple[str, int], dict]:
    im = Images(g)
    labels, gnames = saved_labels()
    recs: dict[tuple[str, int], dict] = {}
    order = {"UNREAD": 0, "PARTLY": 1, "READ": 2}

    def rec_for(side: str, v: int) -> dict:
        side, key, kind = resolve(g, im, side, v)
        if side == "F":
            m = g.funcs["F"].get(key)
            if m and m[5] is not None:
                side, key = "R", m[5]
        k = (side, key)
        if k not in recs:
            r = {"kind": kind, "status": "UNREAD", "cases": [], "impl": [], "readings": [], "notes": [], "context": [],
                 "review": "imported"}
            if side == "R":
                r["addr"] = f"{key:#x}"
                row = g.funcs["R"].get(key)
                if row and row[5] is not None:
                    r["final"] = f"{row[5]:#x}"
            elif side == "F":
                r["addr"] = f"{key:#x}"
                r["binary"] = "F"
            else:
                r["addr"] = f"{key:#x}"
                r["binary"] = "CivilizationVI.exe"
            recs[k] = r
        return recs[k]

    cites = citations(g)
    for c in cites:
        r = rec_for(c["side"], c["value"])
        name = prose_name(c["before"])
        if name and not r.get("name"):
            r["name"] = name
        if c["file"].endswith("dll_readings.md"):
            if c["section"] not in r["readings"]:
                r["readings"].append(c["section"])
            if order[c["status"]] > order[r["status"]]:
                r["status"] = c["status"]
            core = re.sub(r"\s+", " ", c["para"])[:120]
            if len(r["context"]) < 3 and core not in r.setdefault("_paras", []):
                r["_paras"].append(core)
                r["context"].append(re.sub(r"\s+", " ", c["snippet"]))
            for case in cases_in(c["para"]):
                if case not in r["cases"] and len(r["cases"]) < 4:
                    r["cases"].append(case)
        elif c.get("symbol"):
            link = f"{c['file']}:{c['symbol']}"
            if link not in r["impl"]:
                r["impl"].append(link)
    for (side, key), r in recs.items():
        if r["status"] == "UNREAD" and not r["readings"]:
            r["status"] = "PARTLY"
            r["notes"].append("imported: cited by the code, in no dll_readings section")
        if r["status"] == "READ" and not r["cases"]:
            r["status"] = "PARTLY"
            r["notes"].append("imported: READ in its section, no confirming case found beside it")
    for v, name in sorted(labels.items()):
        if v < im.end["R"]:
            r = rec_for("R", v)
            r.setdefault("name", name.split("(")[0] if "(" in name and not name.startswith("(") else name)
            if name != r["name"]:
                r["notes"].append(f"label: {name}")
            if r["status"] == "UNREAD":
                r["status"] = "PARTLY"
                r["notes"].append("imported: a saved label (.claude/scratchpad/cb/labels.json), no reading")
    for v, name in sorted(gnames.items()):
        r = rec_for("R", v)
        r.setdefault("name", name)
        if r["status"] == "UNREAD":
            r["status"] = "PARTLY"
            r["notes"].append("imported: a saved global name (.claude/scratchpad/cb/gnames.json)")
    notes = scratch_notes()
    for (side, key), r in recs.items():
        if side == "exe":
            continue
        pat = re.compile(rf"(?<![\w+.])0x0*{key:x}(?!\w)")
        for fname, text in notes:
            for m in pat.finditer(text):
                flat = text[max(0, m.start() - 100): m.end() + 100].replace("\n", " ")
                if not r.get("name"):
                    mm = re.search(r"([A-Za-z_]\w{3,})=$", text[max(0, m.start() - 40): m.start()])
                    nm = mm.group(1) if mm else prose_name(text[max(0, m.start() - 80): m.start()].replace("\n", " "))
                    if nm:
                        r["name"] = nm
                if len([n for n in r["notes"] if n.startswith(fname)]) < 2:
                    r["notes"].append(f"{fname}: ...{flat.strip()}...")
    return recs


def cases_in(para: str) -> list[dict]:
    out = []
    for sent in re.split(r"(?<=[.;])\s+", para):
        seeds = [m.group(1) for m in SEED.finditer(sent)] + [m.group(1) for m in LAB.finditer(sent)]
        if not seeds:
            continue
        t = TURN.search(sent)
        case = {"recording": seeds[0].replace(" ", "")}
        if t:
            case["turn"] = t.group(1)
        case["value"] = sent.strip()[:200]
        out.append(case)
    return out


def main(argv: list[str]) -> int:
    g = Gen()
    if not g.ok():
        print("no generated layer: run `atlas.py gen` first")
        return 1
    recs = build_records(g)
    files: dict[pathlib.Path, list[dict]] = defaultdict(list)
    index: dict[tuple[str, int], dict] = {}
    for p in atlas.curated_files():
        if p.name != "binaries.yaml":
            files[p] = yaml_load(p.read_text(encoding="utf-8")) or []
            for x in files[p]:
                if x.get("addr") and (x.get("kind") or "function") != "field":
                    b = x.get("binary") or "R"
                    index[("exe" if b == "CivilizationVI.exe" else b, hexint(x["addr"]))] = x
    added = updated = 0
    for (side, key), r in sorted(recs.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        have = index.get((side, key))
        if have is not None:
            changed = False
            for fld in ("impl", "readings"):
                for x in r[fld]:
                    if x not in (have.get(fld) or []):
                        have.setdefault(fld, []).append(x)
                        changed = True
            updated += changed
            continue
        kind = r["kind"]
        files[target_file(g, side, key, kind)].append(
            {k: v for k, v in r.items() if v not in ([], None, "") and not k.startswith("_")})
        added += 1
    for p, data in files.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        data.sort(key=lambda r: (r.get("binary") or "", hexint(r["addr"]) if r.get("addr") else 0, r.get("owner") or "",
                                 hexint(r["offset"]) if r.get("offset") else 0))
        p.write_text(yaml_dump_records(data, HEADER), encoding="utf-8", newline="\n")
    print(f"imported: {added} records added, {updated} updated, in {len(files)} files")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main(sys.argv[1:]))
