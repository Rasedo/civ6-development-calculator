"""THE MAJORS' DIPLOMACY TABLES — the install rows `ai/major/diplomacy.ts` reads,
written as TS.

    python tools/install/ai_diplomacy_tables.py            # write ai/major/diplomacyTables.ts
    python tools/install/ai_diplomacy_tables.py --check    # exit 1 when the file is stale

The diplomatic modifiers every major carries (TRAIT_LEADER_MAJOR_CIV's
MODIFIER_PLAYER_DIPLOMACY_* rows) and each agenda's (AgendaTraits ->
TraitModifiers), with their arguments and requirement sets resolved; the
agendas in DATABASE ORDER (the order the random agenda pool walks within a
tag), the random agendas' tags, the set-up and civic draws' tags, the
historical agendas, the exclusive pairs; the diplomatic states, their
transitions and the actions each state allows with their AI worth and cost.
Read through `xml_check.Install` (the layered install, the game's load order,
Update and Delete applied).
"""
from __future__ import annotations

import collections
import json
import pathlib
import sys

from xml_check import Install

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "ai" / "major" / "diplomacyTables.ts"


def keyed(rows, key):
    """rows by key in database order: a re-written row keeps its first place
    and takes its last cells"""
    out: dict[str, dict] = {}
    for c in rows:
        k = c.get(key)
        if k is None:
            continue
        if k in out:
            out[k].update(c)
        else:
            out[k] = dict(c)
    return out


def num(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def build() -> str:
    inst = Install()

    def rows(t):
        return [c for c, _ in inst.tables.get(t, ())]

    mods = keyed(rows("Modifiers"), "ModifierId")
    margs: dict[str, dict[str, str]] = collections.defaultdict(dict)
    for c in rows("ModifierArguments"):
        if "ModifierId" in c and "Name" in c:
            margs[c["ModifierId"]][c["Name"]] = c.get("Value", "")
    rsets = keyed(rows("RequirementSets"), "RequirementSetId")
    rset_reqs: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("RequirementSetRequirements"):
        if "RequirementSetId" in c:
            rset_reqs[c["RequirementSetId"]].append(c["RequirementId"])
    reqs = keyed(rows("Requirements"), "RequirementId")
    rargs: dict[str, dict[str, str]] = collections.defaultdict(dict)
    for c in rows("RequirementArguments"):
        if "RequirementId" in c and "Name" in c:
            rargs[c["RequirementId"]][c["Name"]] = c.get("Value", "")

    sets: dict[str, dict] = {}

    def reqset(rid):
        if not rid or rid in sets:
            return rid or None
        s = rsets.get(rid, {})
        sets[rid] = {"any": s.get("RequirementSetType") == "REQUIREMENTSET_TEST_ANY", "reqs": []}
        for r in rset_reqs[rid]:
            q = reqs.get(r, {})
            a = rargs.get(r, {})
            sets[rid]["reqs"].append({"id": r, "type": q.get("RequirementType", "?"),
                                      "inverse": (q.get("Inverse") or "").lower() == "true", "args": a})
            if "RequirementSetId" in a:
                reqset(a["RequirementSetId"])
        return rid

    def modifier(mid):
        m = mods.get(mid, {})
        return {"id": mid, "type": (m.get("ModifierType") or "").replace("MODIFIER_PLAYER_DIPLOMACY_", ""),
                "owner": reqset(m.get("OwnerRequirementSetId")), "subject": reqset(m.get("SubjectRequirementSetId")),
                "args": margs.get(mid, {})}

    def diplomatic(mid):
        return (mods.get(mid, {}).get("ModifierType") or "").startswith("MODIFIER_PLAYER_DIPLOMACY")

    trait_mods: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("TraitModifiers"):
        if "TraitType" in c:
            trait_mods[c["TraitType"]].append(c["ModifierId"])
    standard = [modifier(m) for m in trait_mods["TRAIT_LEADER_MAJOR_CIV"] if diplomatic(m)]
    agenda_traits: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("AgendaTraits"):
        if "AgendaType" in c:
            agenda_traits[c["AgendaType"]].append(c["TraitType"])
    agendas = list(keyed(rows("Agendas"), "AgendaType"))
    agenda_mods = {a: [modifier(m) for t in agenda_traits[a] for m in trait_mods[t] if diplomatic(m)] for a in agendas}
    random_tag = {c["AgendaType"]: {"tag": c.get("AgendaTag"), "religion": (c.get("RequiresReligion") or "").lower() == "true"}
                  for c in keyed(rows("RandomAgendas_XP2"), "AgendaType").values()}
    random_agendas = [{"agenda": a, "gameLimit": num(c.get("GameLimit"), -1), "tag": random_tag.get(a, {}).get("tag"),
                       "requiresReligion": random_tag.get(a, {}).get("religion", False)}
                      for a, c in keyed(rows("RandomAgendas"), "AgendaType").items()]
    era_tags: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("RandomAgendaEraTags"):
        era_tags[c["EraType"]].append(c["AgendaTag"])
    civic_tags: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("RandomAgendaCivicTags"):
        civic_tags[c["CivicType"]].append(c["AgendaTag"])
    in_era = [{"era": c["EraType"], "n": num(c.get("NumAgendas"), 1), "tags": era_tags[c["EraType"]]}
              for c in rows("RandomAgendasInEra")]
    for_civic = [{"civic": c["CivicType"], "n": num(c.get("NumAgendas"), 1), "tags": civic_tags[c["CivicType"]]}
                 for c in rows("RandomAgendasForCivic")]
    historical: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("HistoricalAgendas"):
        historical[c["LeaderType"]].append(c["AgendaType"])
    exclusive = [[c["AgendaOne"], c["AgendaTwo"]] for c in rows("ExclusiveAgendas")]
    preferred = [{"agenda": c["AgendaType"], "leader": c["LeaderType"], "pct": num(c.get("PercentageChance"))}
                 for c in rows("AgendaPreferredLeaders")]
    states = [{"type": s, "yieldBonus": num(c.get("DiplomaticYieldBonus")), "level": num(c.get("RelationshipLevel"))}
              for s, c in keyed(rows("DiplomaticStates"), "StateType").items()]

    def opt(c, k):
        v = c.get(k)
        return None if v is None else num(v)

    transitions = [{"from": c["BaseState"], "to": c["TransitionState"],
                    "allowMin": opt(c, "AllowTransitionMin"), "allowMax": opt(c, "AllowTransitionMax"),
                    "requireMin": opt(c, "RequireTransitionMin"), "requireMax": opt(c, "RequireTransitionMax"),
                    "check": c.get("AllowTransitionCheck"), "action": c.get("OnTransitionAction")}
                   for c in rows("DiplomaticStateTransitions")]
    state_actions = [{"state": c["StateType"], "action": c["DiplomaticActionType"], "worth": num(c.get("Worth")),
                      "cost": num(c.get("Cost")), "aiAllowed": (c.get("AiAllowed") or "true").lower() != "false",
                      "to": c.get("TransitionToState")}
                     for c in rows("DiplomaticStateActions")]
    actions = [{"type": a, "cost": num(c.get("Cost")), "prereqCivic": c.get("InitiatorPrereqCivic"),
                "obsoleteCivic": c.get("InitiatorObsoleteCivic"), "duration": num(c.get("Duration"))}
               for a, c in keyed(rows("DiplomaticActions"), "DiplomaticActionType").items()]

    def lit(name, value, typ):
        return f"export const {name}: {typ} = {json.dumps(value, indent=1, ensure_ascii=False)};\n"

    return (
        "/**\n * THE MAJORS' DIPLOMACY TABLES, written by tools/install/ai_diplomacy_tables.py\n"
        " * from the layered install (`--check` reports a stale file). Agendas run in\n"
        " * DATABASE ORDER, the order the random agenda pool walks within a tag.\n */\n"
        "import type { DiploModifierRow, DiploRequirementSet } from './diplomacyTypes';\n\n"
        + lit("DIPLO_STANDARD_MODIFIERS", standard, "readonly DiploModifierRow[]")
        + lit("DIPLO_AGENDA_MODIFIERS", agenda_mods, "Readonly<Record<string, readonly DiploModifierRow[]>>")
        + lit("DIPLO_REQUIREMENT_SETS", sets, "Readonly<Record<string, DiploRequirementSet>>")
        + lit("DIPLO_AGENDAS", agendas, "readonly string[]")
        + lit("DIPLO_RANDOM_AGENDAS", random_agendas,
              "readonly { agenda: string; gameLimit: number; tag: string | null; requiresReligion: boolean }[]")
        + lit("DIPLO_RANDOM_AGENDAS_IN_ERA", in_era, "readonly { era: string; n: number; tags: readonly string[] }[]")
        + lit("DIPLO_RANDOM_AGENDAS_FOR_CIVIC", for_civic, "readonly { civic: string; n: number; tags: readonly string[] }[]")
        + lit("DIPLO_HISTORICAL_AGENDAS", historical, "Readonly<Record<string, readonly string[]>>")
        + lit("DIPLO_EXCLUSIVE_AGENDAS", exclusive, "readonly (readonly [string, string])[]")
        + lit("DIPLO_PREFERRED_AGENDAS", preferred, "readonly { agenda: string; leader: string; pct: number }[]")
        + lit("DIPLO_STATES", states, "readonly { type: string; yieldBonus: number; level: number }[]")
        + lit("DIPLO_TRANSITIONS", transitions,
              "readonly { from: string; to: string; allowMin: number | null; allowMax: number | null; "
              "requireMin: number | null; requireMax: number | null; check: string | null; action: string | null }[]")
        + lit("DIPLO_STATE_ACTIONS", state_actions,
              "readonly { state: string; action: string; worth: number; cost: number; aiAllowed: boolean; to: string | null }[]")
        + lit("DIPLO_ACTIONS", actions,
              "readonly { type: string; cost: number; prereqCivic: string | null; obsoleteCivic: string | null; duration: number }[]")
    )


def main() -> int:
    text = build()
    if "--check" in sys.argv:
        stale = not OUT.exists() or OUT.read_text(encoding="utf-8") != text
        print("ai/major/diplomacyTables.ts", "STALE" if stale else "OK")
        return 1 if stale else 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT} ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
