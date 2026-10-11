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
  address has two records.
Prints OK or each failure; exit 1 on any.
"""
from __future__ import annotations

import re
import sys
from collections import Counter

import atlas
import atlas_import
from atlas import ROOT, Curated, Gen, hexint


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
