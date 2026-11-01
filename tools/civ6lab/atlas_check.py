"""The DLL atlas's check (part of the merge bar).

    python tools/civ6lab/atlas_check.py

* every DLL address cited in tools/civ6lab/dll_readings.md and in the
  comments / string literals under cpu/, gpu/, ai/ resolves to a curated
  record: the record of the function holding it (Release, or FinalRelease
  where the text says so — by its own `final` or its Release match), of the
  global / string itself, or of the CivilizationVI.exe address;
* every engine symbol a record names (`impl: [path:symbol]`) exists: the
  file, and the symbol as a word in it;
* a READ record has a confirming case;
* the curated files parse, every status is READ / PARTLY / UNREAD, and no
  address has two records;
* every dll_readings.md section a record's `readings:` names, and every one a
  comment or string under cpu/, gpu/, ai/, policy/, tools/ cites after
  `dll_readings` (a quoted title, or an unquoted `C-16` / `H-1: the ...`), is a
  `## ` / `### ` heading: the citation's part before its first ` — `,
  apostrophes and case aside, is a prefix of a heading or of a heading's text
  after its `ID: `.
Prints OK or each failure; exit 1 on any.
"""
from __future__ import annotations

import re
import sys
from collections import Counter

import atlas
import atlas_import
from atlas import ROOT, Curated, Gen, hexint

CITE_DIRS = ("cpu", "gpu", "ai", "policy", "tools")
CITE_SKIP = ("tools/civ6lab/runs/", "tools/civ6lab/atlas/", "node_modules/")
CITE_SUFFIX = (".ts", ".py", ".js", ".mjs")
CITE_AT = re.compile(r"dll_readings(?:\.md)?`?\s*,?\s*")
QUOTED = re.compile(r'"([A-Za-z][^"]{1,240})"')
BARE = re.compile(r"[A-Z]-\d+[a-z]?(?:\s*/\s*[A-Z]-\d+[a-z]?)*(?::\s(?:[^()'\"\n;\\]|\\'|'(?=[ \w]))*)?")


def _norm(s: str) -> str:
    s = s.replace("\\'", "").replace("'", "").replace("’", "")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s.rstrip(" .,;:)")


def _flat(text: str, at: int) -> str:
    """the text after a citation, its comment markers and line breaks folded"""
    out = []
    for i, ln in enumerate(text[at:at + 600].split("\n")):
        out.append(ln if i == 0 else re.sub(r"^\s*(?:\*|//|#)?\s?", "", ln))
    return " ".join(out)


def cited_titles() -> list[tuple[str, int, str]]:
    """(file, line, title) for each section a comment or string names"""
    found = []
    for d in CITE_DIRS:
        for p in sorted((ROOT / d).rglob("*")):
            rel = p.relative_to(ROOT).as_posix()
            if p.suffix not in CITE_SUFFIX or any(s in rel + "/" for s in CITE_SKIP) or not p.is_file():
                continue
            text = p.read_text(encoding="utf-8", errors="replace")
            for m in CITE_AT.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                rest = _flat(text, m.end())
                if rest.startswith('"'):
                    pos = 0
                    while True:
                        q = QUOTED.match(rest, pos)
                        if not q:
                            break
                        found.append((rel, line, q.group(1)))
                        sep = re.match(r'\s*(?:,|and)\s*(?=")', rest[q.end():])
                        if not sep:
                            break
                        pos = q.end() + sep.end()
                else:
                    b = BARE.match(rest)
                    if b:
                        found.append((rel, line, b.group(0)))
    return found


def headings() -> list[str]:
    text = (atlas.HERE / "dll_readings.md").read_text(encoding="utf-8")
    return [_norm(ln.lstrip("#")) for ln in text.splitlines() if ln.startswith(("## ", "### "))]


def resolves(title: str, heads: list[str], keyed: bool) -> bool:
    c = _norm(title.split(" — ")[0] if keyed else title)
    if not c:
        return True
    for h in heads:
        for cand in (h, h.split(": ", 1)[1] if re.match(r"[a-z]-\d", h) and ": " in h else ""):
            if cand.startswith(c) and (len(cand) == len(c) or not cand[len(c)].isalnum()):
                return True
    return False


def title_errors(c: Curated) -> list[str]:
    heads = headings()
    errs = []
    for path, r in c.records:
        for t in r.get("readings") or []:
            if not resolves(t, heads, True):
                errs.append(f"{path.relative_to(ROOT).as_posix()} {r.get('addr') or r.get('offset')}: "
                            f"readings {t[:70]!r} names no dll_readings.md section")
    for file, line, t in cited_titles():
        if not resolves(t, heads, True):
            errs.append(f"{file}:{line}: cites {t[:70]!r}, no dll_readings.md section")
    return errs


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    g = Gen()
    if not g.ok():
        print("atlas_check: no generated layer (python tools/civ6lab/atlas.py gen)")
        return 1
    errors: list[str] = []
    try:
        c = Curated()
    except Exception as e:  # a curated file that does not parse
        print(f"atlas_check: a curated file does not parse: {e}")
        return 1
    im = atlas_import.Images(g)
    keys = Counter()
    for path, r in c.records:
        where = f"{path.relative_to(ROOT).as_posix()} {r.get('addr') or r.get('offset')}"
        st = r.get("status")
        if st not in atlas.STATUS:
            errors.append(f"{where}: status {st!r} is not READ / PARTLY / UNREAD")
        if st == "READ" and not r.get("cases"):
            errors.append(f"{where}: READ with no confirming case")
        for link in r.get("impl") or []:
            file, _, sym = link.partition(":")
            p = ROOT / file
            if not p.is_file():
                errors.append(f"{where}: impl {link}: no file {file}")
            elif sym and not re.search(rf"\b{re.escape(sym)}\b", p.read_text(encoding="utf-8", errors="replace")):
                errors.append(f"{where}: impl {link}: no symbol {sym} in {file}")
        if r.get("addr") and (r.get("kind") or "function") != "field":
            keys[(r.get("binary") or "R", hexint(r["addr"]))] += 1
    errors += [f"{b}:{a:#x} has {n} records" for (b, a), n in keys.items() if n > 1]
    errors += title_errors(c)
    exe = {hexint(r["addr"]) for _, r in c.records if r.get("binary") == "CivilizationVI.exe"}
    cites = atlas_import.citations(g)
    missing = 0
    for ct in cites:
        side, v = ct["side"], ct["value"]
        if side == "exe":
            ok = v in exe
            what = "CivilizationVI.exe"
        else:
            s, key, kind = atlas_import.resolve(g, im, side, v)
            rec = c.get(s, key)
            if rec is None:
                row = g.funcs[s].get(key)
                if row and row[5] is not None:
                    rec = c.get("R" if s == "F" else "F", row[5])
            ok = rec is not None
            what = f"{atlas.BIN[s]} {kind} {key:#x}"
        if not ok:
            missing += 1
            errors.append(f"{ct['file']}:{ct['line']}: {v:#x} ({what}) has no atlas record")
    print(f"atlas_check: {len(c.records)} records, {len(cites)} citations ({missing} unresolved), "
          f"{sum(len(r.get('impl') or []) for _, r in c.records)} engine links")
    for e in errors:
        print("  " + e)
    print("OK" if not errors else f"FAIL ({len(errors)})")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.path.insert(0, str(atlas.HERE))
    raise SystemExit(main())
