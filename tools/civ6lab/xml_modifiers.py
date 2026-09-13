"""Every modifier of the given TYPES across the install, with its arguments.

The install writes modifier rows two ways — attribute rows
(`<Row ModifierId=".." ModifierType=".."/>`) and element rows
(`<Row><ModifierId>..</ModifierId><ModifierType>..</ModifierType></Row>`,
the style Policies.xml uses) — and a line-oriented grep sees only the first.
This parses the XML, so both count. Base <- Expansion1 <- Expansion2 <- the
named DLC packs, every Data dir.

    python tools/civ6lab/xml_modifiers.py MODIFIER_PLAYER_ADJUST_SPY_BONUS ...
"""
from __future__ import annotations

import pathlib
import sys
import xml.etree.ElementTree as ET

INSTALL = pathlib.Path(r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI")


def rows(table: ET.Element):
    for r in table.iter("Row"):
        d = dict(r.attrib)
        for child in r:
            if child.tag not in d and child.text is not None:
                d[child.tag] = child.text.strip()
        yield d


def main(types: list[str]) -> int:
    want = set(types)
    mods: dict[str, tuple[str, str]] = {}      # ModifierId -> (type, file)
    args: dict[str, list[tuple[str, str]]] = {}
    attach: dict[str, list[str]] = {}          # ModifierId -> who attaches it
    files = sorted(INSTALL.glob("Base/Assets/Gameplay/Data/*.xml")) + sorted(INSTALL.glob("DLC/*/Data/*.xml"))
    for f in files:
        try:
            root = ET.parse(f).getroot()
        except ET.ParseError:
            continue
        for table in root:
            tag = table.tag
            if tag == "Modifiers":
                for d in rows(table):
                    if d.get("ModifierType") in want:
                        mods[d["ModifierId"]] = (d["ModifierType"], f.name)
            elif tag == "ModifierArguments":
                for d in rows(table):
                    if "ModifierId" in d and "Name" in d:
                        args.setdefault(d["ModifierId"], []).append((d["Name"], d.get("Value", "")))
            elif tag.endswith("Modifiers") and tag != "DynamicModifiers":
                # PolicyModifiers, GovernorPromotionModifiers, BuildingModifiers, ...
                for d in rows(table):
                    mid = d.get("ModifierId")
                    if mid:
                        owner = next((v for k, v in d.items() if k != "ModifierId"), "?")
                        attach.setdefault(mid, []).append(f"{tag[:-9]}:{owner}")
    for mid, (mt, fn) in sorted(mods.items(), key=lambda kv: (kv[1][0], kv[0])):
        a = " ".join(f"{k}={v}" for k, v in args.get(mid, []))
        who = ", ".join(sorted(set(attach.get(mid, [])))) or "(not attached by a *Modifiers table)"
        print(f"{mt}\n    {mid}  [{fn}]\n      args: {a}\n      via: {who}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
