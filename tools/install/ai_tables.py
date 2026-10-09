"""THE MAJORS' AI TABLES — the install rows `ai/major/` reads, written as TS.

    python tools/install/ai_tables.py            # write ai/major/tables.ts
    python tools/install/ai_tables.py --check    # exit 1 when the file is stale

The game's AI reads its own database, not the engine's catalogs: the policies
and governments in DATABASE ORDER (the index the AI's loops walk and its
ties fall to; the order checked against every AI_GovtPolicies.csv beside the
H-1 recordings, whose score lines run in it), each policy's slot, civic,
Policies_XP1 terms, government exclusivity, obsolescence and its modifiers
as DynamicModifiers resolve them (collection, effect, arguments, requirement
sets); each government's slot rows, Favor and modifiers; the slot types; the
Yields' and PseudoYields' DefaultValue; the great person classes' pseudo
yields; the eras' order. Read through `xml_check.Install` (the layered
install, the game's load order, Update and Delete applied).
"""
from __future__ import annotations

import collections
import glob
import json
import pathlib
import sys

from xml_check import Install

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "ai" / "major" / "tables.ts"
# the recordings live in the checkout (a worktree under .claude/worktrees reads its parent's)
RUNS = next((p / "tools" / "civ6lab" / "runs" for p in (ROOT, *ROOT.parents[2:3])
             if any((p / "tools" / "civ6lab" / "runs").glob("h1_duelw11*_20261007T232459Z.logs"))),
            ROOT / "tools" / "civ6lab" / "runs")


def keyed(rows, key):
    """rows by key in database order: a re-written row keeps its first place
    and takes its last cells (an `<Update>` writes in place; a `<Replace>` of
    an existing key is an update of it)"""
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


def build() -> str:
    inst = Install()

    def rows(t):
        return [c for c, _ in inst.tables.get(t, ())]

    dyn = keyed(rows("DynamicModifiers"), "ModifierType")
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

    def reqset(rid):
        if not rid:
            return None
        s = rsets.get(rid, {})
        return {"any": s.get("RequirementSetType") == "REQUIREMENTSET_TEST_ANY",
                "reqs": [{"type": reqs.get(r, {}).get("RequirementType", "?"),
                          "inverse": reqs.get(r, {}).get("Inverse") == "true",
                          "args": rargs.get(r, {})} for r in rset_reqs[rid]]}

    def modifier(mid):
        m = mods.get(mid, {})
        d = dyn.get(m.get("ModifierType", ""), {})
        out = {"id": mid, "collection": d.get("CollectionType", "?"), "effect": d.get("EffectType", "?"),
               "args": margs.get(mid, {})}
        sub = reqset(m.get("SubjectRequirementSetId"))
        own = reqset(m.get("OwnerRequirementSetId"))
        if sub:
            out["subjectReqs"] = sub
        if own:
            out["ownerReqs"] = own
        return out

    pmods: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("PolicyModifiers"):
        if "PolicyType" in c:
            pmods[c["PolicyType"]].append(c["ModifierId"])
    gmods: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("GovernmentModifiers"):
        if "GovernmentType" in c:
            gmods[c["GovernmentType"]].append(c["ModifierId"])
    xp1 = keyed(rows("Policies_XP1"), "PolicyType")
    excl = {c["PolicyType"]: c["GovernmentType"] for c in rows("Policy_GovernmentExclusives_XP2") if "PolicyType" in c}
    obs: dict[str, list] = collections.defaultdict(list)
    for c in rows("ObsoletePolicies"):
        if "PolicyType" in c:
            obs[c["PolicyType"]].append({"policy": c.get("ObsoletePolicy"),
                                         "gpClass": c.get("RequiresAvailableGreatPersonClass")})
    eras = list(keyed(rows("Eras"), "EraType").values())
    eras.sort(key=lambda e: int(e.get("ChronologyIndex", 0)))
    era_index = {e["EraType"]: i for i, e in enumerate(eras)}

    policies = []
    for p, c in keyed(rows("Policies"), "PolicyType").items():
        x = xp1.get(p, {})
        policies.append({
            "type": p, "slot": c.get("GovernmentSlotType"), "civic": c.get("PrereqCivic"),
            "darkAge": x.get("RequiresDarkAge") == "true", "goldenAge": x.get("RequiresGoldenAge") == "true",
            "minEra": era_index.get(x.get("MinimumGameEra", ""), -1),
            "maxEra": era_index.get(x.get("MaximumGameEra", ""), -1),
            "government": excl.get(p), "obsolete": obs.get(p, []),
            "modifiers": [modifier(m) for m in pmods[p]],
        })
    gslots: dict[str, list] = collections.defaultdict(list)
    for c in rows("Government_SlotCounts"):
        if "GovernmentType" in c:
            gslots[c["GovernmentType"]].append({"slot": c["GovernmentSlotType"], "n": int(c.get("NumSlots", 1))})
    gxp2 = keyed(rows("Governments_XP2"), "GovernmentType")
    governments = []
    for g, c in keyed(rows("Governments"), "GovernmentType").items():
        governments.append({
            "type": g, "civic": c.get("PrereqCivic"), "slots": gslots[g],
            "favor": int(gxp2.get(g, {}).get("Favor", 0) or 0),
            "influenceThreshold": int(c.get("InfluencePointsThreshold", 0) or 0),
            "modifiers": [modifier(m) for m in gmods[g]],
        })
    slots = [{"type": c["GovernmentSlotType"], "any": c.get("AllowsAnyPolicy") == "true"}
             for c in keyed(rows("GovernmentSlots"), "GovernmentSlotType").values()]
    yields = {k: float(c.get("DefaultValue", 1)) for k, c in keyed(rows("Yields"), "YieldType").items()}
    pseudo = {k: float(c.get("DefaultValue", 1)) for k, c in keyed(rows("PseudoYields"), "PseudoYieldType").items()}
    gpc = {k: c.get("PseudoYieldType") for k, c in keyed(rows("GreatPersonClasses"), "GreatPersonClassType").items()}

    def lit(name, value, typ):
        return f"export const {name}: {typ} = {json.dumps(value, indent=1)};\n"

    return (
        "/**\n * THE MAJORS' AI TABLES, written by tools/install/ai_tables.py from the\n"
        " * layered install (`--check` reports a stale file). Policies and governments\n"
        " * run in DATABASE ORDER, the index the game's AI loops walk.\n */\n"
        "import type { AiGovernment, AiPolicy, AiSlotType } from './types';\n\n"
        + lit("AI_POLICIES", policies, "readonly AiPolicy[]")
        + lit("AI_GOVERNMENTS", governments, "readonly AiGovernment[]")
        + lit("AI_SLOT_TYPES", slots, "readonly AiSlotType[]")
        + lit("AI_YIELD_DEFAULT", yields, "Readonly<Record<string, number>>")
        + lit("AI_PSEUDOYIELD_DEFAULT", pseudo, "Readonly<Record<string, number>>")
        + lit("AI_GP_CLASS_PSEUDOYIELD", gpc, "Readonly<Record<string, string>>")
        + lit("AI_ERAS", [e["EraType"] for e in eras], "readonly string[]")
    )


def order_check(policies: list[str]) -> tuple[int, int]:
    """every logged score list runs in database order: each (turn, player)'s
    Policies lines a subsequence of `policies`; (lines read, lines out of
    order)"""
    pos = {p: i for i, p in enumerate(policies)}
    bad = seen = 0
    for f in glob.glob(str(RUNS / "h1_duelw11*_20261007T232459Z.logs" / "AI_GovtPolicies.csv")):
        last = {}
        for ln in open(f, encoding="utf-8", errors="replace").readlines()[1:]:
            p = [x.strip() for x in ln.split(",")]
            if p[2] != "Policies":
                continue
            k = (p[0], p[1])
            seen += 1
            i = pos.get(p[3], -1)
            if i < 0 or (k in last and i <= last[k]):
                bad += 1
            last[k] = i
    return seen, bad


def main() -> int:
    text = build()
    if "--check" in sys.argv:
        stale = not OUT.exists() or OUT.read_text(encoding="utf-8") != text
        print("ai/major/tables.ts", "STALE" if stale else "OK")
        return 1 if stale else 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    names = [line.split('"')[3] for line in text.splitlines() if line.startswith('  "type": "POLICY_')]
    seen, bad = order_check(names)
    print(f"wrote {OUT} ({len(text)} bytes); logged score lines {seen}, out of database order {bad}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
