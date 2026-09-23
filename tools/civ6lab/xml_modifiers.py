"""Every modifier of the given TYPES in the LAYERED install, with its arguments.

The install writes modifier rows two ways — attribute rows
(`<Row ModifierId=".." ModifierType=".."/>`) and element rows
(`<Row><ModifierId>..</ModifierId><ModifierType>..</ModifierType></Row>`,
the style Policies.xml uses) — and a line-oriented grep sees only the first.
This reads the install through `xml_check.Install`: the game's own load order
(each pack's .modinfo, a Gathering Storm game with no game mode), `<Update>`
and `<Delete>` applied with the schema's foreign-key cascades — so a modifier
Expansion2_RemoveData.xml deletes is not listed, and a scenario's files are
never read.

    python tools/civ6lab/xml_modifiers.py MODIFIER_PLAYER_ADJUST_SPY_BONUS ...
"""
from __future__ import annotations

import sys

from xml_check import Install


def main(types: list[str]) -> int:
    want = set(types)
    inst = Install()
    mods: dict[str, tuple[str, str]] = {}      # ModifierId -> (type, file)
    for cells, who in inst.tables.get("Modifiers", ()):
        if cells.get("ModifierType") in want:
            mods[cells["ModifierId"]] = (cells["ModifierType"], who.get("ModifierType", "?"))
    args: dict[str, list[tuple[str, str]]] = {}
    for cells, _ in inst.tables.get("ModifierArguments", ()):
        if "ModifierId" in cells and "Name" in cells:
            args.setdefault(cells["ModifierId"], []).append((cells["Name"], cells.get("Value", "")))
    attach: dict[str, list[str]] = {}          # ModifierId -> who attaches it
    for tag, rows in inst.tables.items():
        if not tag.endswith("Modifiers") or tag in ("Modifiers", "DynamicModifiers"):
            continue
        # PolicyModifiers, GovernorPromotionModifiers, BuildingModifiers, ...
        for cells, _ in rows:
            mid = cells.get("ModifierId")
            if mid:
                owner = next((v for k, v in cells.items() if k != "ModifierId"), "?")
                attach.setdefault(mid, []).append(f"{tag[:-9]}:{owner}")
    for mid, (mt, fn) in sorted(mods.items(), key=lambda kv: (kv[1][0], kv[0])):
        a = " ".join(f"{k}={v}" for k, v in args.get(mid, []))
        who = ", ".join(sorted(set(attach.get(mid, [])))) or "(not attached by a *Modifiers table)"
        print(f"{mt}\n    {mid}  [{fn}]\n      args: {a}\n      via: {who}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
