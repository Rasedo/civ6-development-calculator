"""H-1: add the GreatWorks catalog to a dump recorded before the dump wrote it.

    python tools/civ6lab/h1/catalog_gw.py runs/h1_x.jsonl [...]

`h1_dump_ig.lua` writes `greatWorks` (per GreatWorks row: type, object type,
the person who makes it, era; "" for an empty column) into `<dump>.cat.json`.
A dump recorded without it carries each work as its GreatWorks row index
only; this reads the rows from the install in the game's own load order
(`tools/civ6map/gameinfo.py`) and writes them into the catalog, after
checking every work the dump records against its slot: the row's object type
must be one the building's slot takes (`Building_GreatWorks`,
`GreatWork_ValidSubTypes`; a Bank's slots, which only Giovanni de' Medici
opens, take anything). A dump where one fails is left alone.
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from tools.civ6map.gameinfo import GameInfo  # noqa: E402

# the slots a Great Person opens on a building that declares none
OPENED = {"BUILDING_BANK": "GREATWORKSLOT_PALACE"}


def main(paths: list[str]) -> int:
    gi = GameInfo()
    rows = [[r["GreatWorkType"], r["GreatWorkObjectType"], r.get("GreatPersonIndividualType") or "",
             r.get("EraType") or ""] for r in gi.rows("GreatWorks")]
    slots: dict[str, list[str]] = {}
    for r in gi.rows("Building_GreatWorks"):
        slots.setdefault(r["BuildingType"], []).extend([r["GreatWorkSlotType"]] * int(r["NumSlots"]))
    takes: dict[str, set[str]] = {}
    for r in gi.rows("GreatWork_ValidSubTypes"):
        takes.setdefault(r["GreatWorkSlotType"], set()).add(r["GreatWorkObjectType"])
    bad = 0
    for path in paths:
        cat_path = pathlib.Path(path.replace(".jsonl", ".cat.json"))
        cat = json.loads(cat_path.read_text(encoding="utf-8"))
        works = fails = 0
        for line in open(path, encoding="utf-8"):
            if not line.strip():
                continue
            rec = json.loads(line)
            for c in rec["cities"]:
                for b, s, _idx, row in c.get("greatWorks") or []:
                    works += 1
                    bname = cat["buildings"][b]
                    held = slots.get(bname, [])
                    slot = held[s] if s < len(held) else OPENED.get(bname)
                    obj = rows[row][1] if isinstance(row, int) and 0 <= row < len(rows) else None
                    if slot is None or obj not in takes.get(slot, set()):
                        fails += 1
                        if fails <= 5:
                            print(f"  t{rec['turn']} {c['name']} {bname} slot {s}: row {row} {obj} not taken by {slot}")
        print(f"{path}: {works} recorded works, {fails} not taken by their slot")
        if fails:
            bad += 1
            continue
        cat["greatWorks"] = rows
        cat_path.write_text(json.dumps(cat, sort_keys=True), encoding="utf-8", newline="\n")
        print(f"  {len(rows)} GreatWorks rows -> {cat_path}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
