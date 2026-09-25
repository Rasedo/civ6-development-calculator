"""The Great People census: every layered action modifier of the five one-off classes.

Reads the install as the game layers it (Base <- Expansion1 <- Expansion2 and the
DLC packs a Gathering Storm game loads, `Expansion2_RemoveData.xml` included —
`xml_check.Install`) and prints one block per person, in install order: the
`GreatPersonIndividuals` Action* columns, then each attached modifier's type, its
arguments (a nested `ModifierId` or `AbilityType` expanded), its subject
requirement set, and the file that wrote the attachment row.

    python tools/civ6lab/gp_census.py                 # every Scientist, Engineer,
                                                      # Merchant, General, Admiral
    python tools/civ6lab/gp_census.py HANNO_THE_NAVIGATOR ZHENG_HE
    python tools/civ6lab/gp_census.py --detail HANNO_THE_NAVIGATOR
                                                      # every table row naming the
                                                      # person, requirements included

`cpu/data/greatPeople.ts` (`GP_ABILITY`) is read against this output.
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from xml_check import Install  # noqa: E402

CLASSES = {"SCIENTIST", "ENGINEER", "MERCHANT", "GENERAL", "ADMIRAL"}


class Census:
    def __init__(self) -> None:
        self.t = Install().tables
        self.args: dict[str, list[tuple[str, str, str]]] = {}
        for cells, _ in self.t.get("ModifierArguments", ()):
            self.args.setdefault(cells.get("ModifierId", ""), []).append(
                (cells.get("Name", ""), cells.get("Value", ""), cells.get("Type", "")))
        self.mods = {c["ModifierId"]: c for c, _ in self.t.get("Modifiers", ()) if "ModifierId" in c}
        self.ab_mods: dict[str, list[str]] = {}
        for c, _ in self.t.get("UnitAbilityModifiers", ()):
            self.ab_mods.setdefault(c.get("UnitAbilityType", ""), []).append(c.get("ModifierId", ""))
        self.reqsets: dict[str, list[str]] = {}
        for c, _ in self.t.get("RequirementSetRequirements", ()):
            self.reqsets.setdefault(c.get("RequirementSetId", ""), []).append(c.get("RequirementId", ""))
        self.reqs = {c["RequirementId"]: c for c, _ in self.t.get("Requirements", ()) if "RequirementId" in c}
        self.req_args: dict[str, list[str]] = {}
        for c, _ in self.t.get("RequirementArguments", ()):
            self.req_args.setdefault(c.get("RequirementId", ""), []).append(
                f"{c.get('Name', '')}={c.get('Value', '')}")

    def fmt(self, mid: str, depth: int = 0) -> str:
        m = self.mods.get(mid)
        if not m:
            return f"{mid}(MISSING)"
        cells = []
        for n, v, ty in self.args.get(mid, []):
            cells.append(f"{n}={v}" + (f"<{ty}>" if ty else ""))
        s = f"{m.get('ModifierType')} [{' '.join(cells)}]"
        for k in ("SubjectRequirementSetId", "OwnerRequirementSetId", "RunOnce", "Permanent"):
            if m.get(k):
                s += f" {k}={m[k]}"
        pad = "          " + "  " * depth
        for n, v, _ in self.args.get(mid, []):
            if depth < 3 and n == "ModifierId" and v in self.mods:
                s += f"\n{pad}=> {v}: {self.fmt(v, depth + 1)}"
            if depth < 3 and n == "AbilityType":
                for sub in self.ab_mods.get(v, []):
                    s += f"\n{pad}-> {self.fmt(sub, depth + 1)}"
        rs = m.get("SubjectRequirementSetId")
        if rs:
            for rid in self.reqsets.get(rs, []):
                r = self.reqs.get(rid, {})
                s += f"\n{pad}?  {rid}: {r.get('RequirementType', '?')} [{' '.join(self.req_args.get(rid, []))}]"
        return s

    def census(self, only: list[str]) -> None:
        for cells, _ in self.t.get("GreatPersonIndividuals", ()):
            cls = cells.get("GreatPersonClassType", "").replace("GREAT_PERSON_CLASS_", "")
            gid = cells.get("GreatPersonIndividualType", "")
            name = gid.replace("GREAT_PERSON_INDIVIDUAL_", "")
            if cls not in CLASSES or (only and name not in only):
                continue
            extra = {k: v for k, v in cells.items() if k.startswith("Action") and k not in (
                "ActionNameTextOverride", "ActionEffectTileHighlighting")}
            print(f"== {cls} {name} {cells.get('EraType', '')} {extra}")
            for c, w in self.t.get("GreatPersonIndividualActionModifiers", ()):
                if c.get("GreatPersonIndividualType") == gid:
                    tgt = c.get("AttachmentTargetType", "").replace("GREAT_PERSON_ACTION_ATTACHMENT_TARGET_", "")
                    mid = c.get("ModifierId", "")
                    print(f"    {tgt:28s} {w.get('ModifierId', '?'):40s} {mid}: {self.fmt(mid)}")

    def detail(self, names: list[str]) -> None:
        for nm in names:
            gid = f"GREAT_PERSON_INDIVIDUAL_{nm}"
            print("=" * 70)
            for tag in ("GreatPersonIndividuals", "GreatPersonIndividualActionModifiers",
                        "GreatPersonIndividualBirthModifiers", "GreatPersonIndividualIconModifiers"):
                for cells, who in self.t.get(tag, ()):
                    if cells.get("GreatPersonIndividualType") == gid:
                        print(tag, cells, who)
                        if "ModifierId" in cells:
                            print("    " + self.fmt(cells["ModifierId"]))


def main(argv: list[str]) -> int:
    c = Census()
    if argv[:1] == ["--detail"]:
        c.detail(argv[1:])
    else:
        c.census(argv)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
