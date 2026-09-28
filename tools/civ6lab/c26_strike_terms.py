"""C-26 audit: which of `defenderCS`'s unit-vs-unit terms reach a unit struck
by a city or an Encampment. Every Combat Strength modifier of the named units'
abilities and of the named policies / alliance / diplomacy rows is listed from
the layered install with the requirement types of its subject and owner sets:
a term keyed on the OPPONENT (its unit class, its tag, being a barbarian, a
combat type) or on the FIGHT being unit-vs-unit decides whether a district's
shot sees it.

    python tools/civ6lab/c26_strike_terms.py
"""
from __future__ import annotations

import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "install"))
from xml_check import Install  # noqa: E402

# the owner rows named by the terms `cityStrikeDefenderCS` omits
PATTERNS = [
    r"KHEVSURETI", r"HIGHLANDER", r"HOPLITE", r"VARU", r"NGAO_MBEBA", r"CAROLEAN", r"HUSZAR",
    r"COSSACK", r"MALON", r"GARDE", r"REDCOAT", r"BLACK_ARMY", r"CONQUISTADOR", r"U_BOAT|UBOAT",
    r"P51|MUSTANG", r"ZEVEN", r"MOUNTIE", r"DISCIPLINE", r"CYBER_WARFARE", r"ALLIANCE.*MILITARY|MILITARY_ALLIANCE",
    r"ENKIDU", r"ORTOO|DIPLO.*VIS|VISIBILITY", r"^ALLIANCE_ADJUST_COMBAT_STRENGTH$", r"GILGAMESH", r"NAGAO_RANGED_DEFENSE|ANTI_FIGHTER_AIRCRAFT_COMBAT_BONUS|TRAIT_ADJUST_ALLIANCE_ADJUST_COMBAT_STRENGTH|TRAIT_ATTACH_ALLIANCE_COMBAT_ADJUSTMENT", r"PARK_COMBAT|NATIONAL_PARK.*COMBAT", r"FIGHTER_BONUS|VS_FIGHTER|P_51|P-51",
]


def main() -> None:
    inst = Install()
    t = inst.tables
    mods = {c["ModifierId"]: c for c, _ in t.get("Modifiers", ()) if "ModifierId" in c}
    dyn = {c["ModifierType"]: c for c, _ in t.get("DynamicModifiers", ()) if "ModifierType" in c}
    reqsets: dict[str, list[str]] = {}
    for c, _ in t.get("RequirementSetRequirements", ()):
        if "RequirementSetId" in c and "RequirementId" in c:
            reqsets.setdefault(c["RequirementSetId"], []).append(c["RequirementId"])
    reqs = {c["RequirementId"]: c for c, _ in t.get("Requirements", ()) if "RequirementId" in c}
    rargs: dict[str, list[str]] = {}
    for c, _ in t.get("RequirementArguments", ()):
        if "RequirementId" in c:
            rargs.setdefault(c["RequirementId"], []).append(f"{c.get('Name')}={c.get('Value')}")
    margs: dict[str, list[str]] = {}
    for c, _ in t.get("ModifierArguments", ()):
        if "ModifierId" in c:
            margs.setdefault(c["ModifierId"], []).append(f"{c.get('Name')}={c.get('Value')}")
    pat = re.compile("|".join(PATTERNS))
    for mid, c in sorted(mods.items()):
        if not pat.search(mid):
            continue
        eff = dyn.get(c.get("ModifierType", ""), {}).get("EffectType", "?")
        if "COMBAT" not in eff and "STRENGTH" not in eff and "COMBAT" not in mid and "ALLIANCE" not in eff:
            continue
        print(f"{mid}: {c.get('ModifierType')} ({eff}) {' '.join(margs.get(mid, []))}")
        for key in ("SubjectRequirementSetId", "OwnerRequirementSetId"):
            rs = c.get(key)
            if not rs:
                continue
            for rid in reqsets.get(rs, []):
                r = reqs.get(rid, {})
                inv = " NOT" if r.get("Inverse") == "true" else ""
                print(f"    {key[:5]} {rid}:{inv} {r.get('RequirementType')} {' '.join(rargs.get(rid, []))}")


if __name__ == "__main__":
    main()
