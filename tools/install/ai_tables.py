"""THE AI TABLES — the install rows the game's AI reads, written as TS.

    python tools/install/ai_tables.py            # write ai/major/tables.ts and cpu/data/aiTables.ts
    python tools/install/ai_tables.py --check    # exit 1 when either file is stale

The game's AI reads its own database, not the engine's catalogs.
ai/major/tables.ts (the majors' AI): the policies and governments in
DATABASE ORDER (the index the AI's loops walk and its ties fall to; the
order checked against every AI_GovtPolicies.csv beside the H-1 recordings,
whose score lines run in it), each policy's slot, civic, Policies_XP1 terms,
government exclusivity, obsolescence and its modifiers as DynamicModifiers
resolve them (collection, effect, arguments, requirement sets); each
government's slot rows, Favor and modifiers; the slot types; the eras' order;
the settle site evaluation's conditions, its PlotEvaluations lists by leader,
civilization and strategy, the features' Settlement and NaturalWonder flags,
the resources' classes, the GlobalParameters the settle and danger code reads.
cpu/data/aiTables.ts (the value layer every party reads, cpu/core/aiValue.ts):
the Yields' and PseudoYields' DefaultValue, the great person classes' pseudo
yields, each government's InfluencePointsThreshold, and the AI lists the
weights sum: per trait (a leader's through its InheritFrom chain, its
civilization's; System Yields / YieldSensitivities), per strategy
(Strategy_Priorities; those and System PseudoYields), each item with its
difficulty bounds; Strategy_YieldPriorities; the difficulties' order.
Read through `xml_check.Install` (the layered install, the game's load
order, Update and Delete applied).
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
# the value layer's tables every AI party reads (cpu/core/aiValue.ts)
OUT_CORE = ROOT / "cpu" / "data" / "aiTables.ts"
# the systems the yield weight reads by trait and by strategy, and the one the
# pseudo-yield weight reads by strategy alone
WEIGHT_SYSTEMS = ("Yields", "YieldSensitivities")
STRATEGY_SYSTEMS = WEIGHT_SYSTEMS + ("PseudoYields",)
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
        return {"test": {"REQUIREMENTSET_TEST_ANY": "ANY", "REQUIREMENTSET_TEST_NONE": "NONE"}.get(s.get("RequirementSetType"), "ALL"),
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

    influence = {g["type"]: g["influenceThreshold"] for g in governments}

    # the AI lists the yield weight sums: each list's items, the traits and
    # strategies that carry such a list
    ai_lists = [c for c in rows("AiLists") if c.get("ListType") and c.get("System") in STRATEGY_SYSTEMS]
    items: dict[str, list] = collections.defaultdict(list)
    for c in rows("AiFavoredItems"):
        if c.get("ListType") and c.get("Item"):
            items[c["ListType"]].append({"item": c["Item"], "value": int(c.get("Value", 0) or 0),
                                         "favored": c.get("Favored", "true") not in ("false", "0"),
                                         "minDifficulty": c.get("MinDifficulty"), "maxDifficulty": c.get("MaxDifficulty")})
    trait_lists: dict[str, list] = collections.defaultdict(list)
    for c in ai_lists:
        if c.get("LeaderType") and c["System"] in WEIGHT_SYSTEMS:
            trait_lists[c["LeaderType"]].append({"list": c["ListType"], "system": c["System"],
                                                 "minDifficulty": c.get("MinDifficulty"),
                                                 "maxDifficulty": c.get("MaxDifficulty")})
    inherit = {c["LeaderType"]: c.get("InheritFrom") for c in rows("Leaders") if c.get("LeaderType")}
    ltraits: dict[str, list] = collections.defaultdict(list)
    for c in rows("LeaderTraits"):
        if c.get("LeaderType") and c.get("TraitType"):
            ltraits[c["LeaderType"]].append(c["TraitType"])
    ctraits: dict[str, list] = collections.defaultdict(list)
    for c in rows("CivilizationTraits"):
        if c.get("CivilizationType") and c.get("TraitType"):
            ctraits[c["CivilizationType"]].append(c["TraitType"])

    def leader_traits(leader):
        out, seen = [], set()
        while leader and leader not in seen:
            seen.add(leader)
            out += ltraits.get(leader, [])
            leader = inherit.get(leader)
        return out

    leader_w = {lt: [t for t in leader_traits(lt) if t in trait_lists] for lt in sorted(inherit)}
    civ_w = {ct: [t for t in ts if t in trait_lists] for ct, ts in sorted(ctraits.items())}
    plain = {c["ListType"]: c["System"] for c in ai_lists if not c.get("LeaderType") and not c.get("AgendaType")}
    strat_lists: dict[str, list] = collections.defaultdict(list)
    for c in rows("Strategy_Priorities"):
        if c.get("StrategyType") and c.get("ListType") in plain:
            strat_lists[c["StrategyType"]].append({"list": c["ListType"], "system": plain[c["ListType"]]})
    strat_yields = [{"strategy": c.get("StrategyType"), "yield": c.get("YieldType"),
                     "pct": int(c.get("PercentageDelta", 0) or 0)} for c in rows("Strategy_YieldPriorities")]
    wanted = {x["list"] for v in trait_lists.values() for x in v} | {x["list"] for v in strat_lists.values() for x in v}
    difficulties = [c["DifficultyType"] for c in keyed(rows("Difficulties"), "DifficultyType").values()]

    # the settle site evaluation: PlotEvalConditions by their index (Value),
    # the PlotEvaluations lists' items, the lists each leader and
    # civilization carries (AiLists LeaderType: a trait of the leader's chain
    # through InheritFrom, of its civilization; AgendaType: a trait of the
    # leader's historical agenda; Strategy_Priorities: a strategy's), the
    # features' Settlement and NaturalWonder
    # flags and the resources' classes
    conds = sorted(((int(c["Value"]), c["ConditionType"]) for c in rows("PlotEvalConditions")))
    lists = keyed(rows("AiLists"), "ListType")
    pe_lists = {k for k, c in lists.items() if c.get("System") == "PlotEvaluations"}
    pe_items: dict[str, list] = collections.defaultdict(list)
    for c in rows("AiFavoredItems"):
        if c.get("ListType") in pe_lists:
            pe_items[c["ListType"]].append({"condition": c["Item"], "favored": c.get("Favored") == "true",
                                            "value": int(c.get("Value", 0) or 0), "stringVal": c.get("StringVal")})
    atraits: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("AgendaTraits"):
        if "AgendaType" in c:
            atraits[c["AgendaType"]].append(c["TraitType"])
    hist = {c["LeaderType"]: c["AgendaType"] for c in rows("HistoricalAgendas") if "LeaderType" in c}

    def bound(col, traits):
        ts = set(traits)
        return [k for k in sorted(pe_lists, key=list(lists).index) if lists[k].get(col) in ts and pe_items.get(k)]

    by_leader = {}
    for lt in inherit:
        got = bound("LeaderType", leader_traits(lt)) + bound("AgendaType", atraits.get(hist.get(lt, ""), []))
        if got:
            by_leader[lt] = got
    by_civ = {cv: bound("LeaderType", ts) for cv, ts in ctraits.items() if bound("LeaderType", ts)}
    by_strategy: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("Strategy_Priorities"):
        if c.get("ListType") in pe_items:
            by_strategy[c["StrategyType"]].append(c["ListType"])
    features = [{"type": k, "settlement": c.get("Settlement", "true") != "false",
                 "naturalWonder": c.get("NaturalWonder") == "true"}
                for k, c in keyed(rows("Features"), "FeatureType").items()]
    res_class = {k: c.get("ResourceClassType") for k, c in keyed(rows("Resources"), "ResourceType").items()}
    gps = keyed(rows("GlobalParameters"), "Name")
    globals_ = {k: int(float(gps[k]["Value"])) for k in ("CITY_MIN_RANGE", "COMBAT_BOMBARD_VS_UNIT_STRENGTH_MODIFIER")}

    def lit(name, value, typ):
        return f"export const {name}: {typ} = {json.dumps(value, indent=1)};\n"

    major = (
        "/**\n * THE MAJORS' AI TABLES, written by tools/install/ai_tables.py from the\n"
        " * layered install (`--check` reports a stale file). Policies and governments\n"
        " * run in DATABASE ORDER, the index the game's AI loops walk.\n */\n"
        "import type { AiFeature, AiGovernment, AiPlotEvalItem, AiPolicy, AiSlotType } from './types';\n\n"
        + lit("AI_POLICIES", policies, "readonly AiPolicy[]")
        + lit("AI_GOVERNMENTS", governments, "readonly AiGovernment[]")
        + lit("AI_SLOT_TYPES", slots, "readonly AiSlotType[]")
        + lit("AI_ERAS", [e["EraType"] for e in eras], "readonly string[]")
        + lit("AI_PLOT_EVAL_CONDITIONS", [t for _, t in conds], "readonly string[]")
        + lit("AI_PLOT_EVAL_LISTS", {k: pe_items[k] for k in sorted(pe_items)}, "Readonly<Record<string, readonly AiPlotEvalItem[]>>")
        + lit("AI_PLOT_EVAL_BY_LEADER", by_leader, "Readonly<Record<string, readonly string[]>>")
        + lit("AI_PLOT_EVAL_BY_CIV", by_civ, "Readonly<Record<string, readonly string[]>>")
        + lit("AI_PLOT_EVAL_BY_STRATEGY", dict(by_strategy), "Readonly<Record<string, readonly string[]>>")
        + lit("AI_FEATURES", features, "readonly AiFeature[]")
        + lit("AI_RESOURCE_CLASS", res_class, "Readonly<Record<string, string>>")
        + lit("AI_GLOBALS", globals_, "Readonly<Record<string, number>>")
    )
    core = (
        "/**\n * THE AI VALUE LAYER'S TABLES (cpu/core/aiValue.ts), written by\n"
        " * tools/install/ai_tables.py from the layered install (`--check` reports a\n"
        " * stale file): the yields' and pseudo-yields' DefaultValue, the great\n"
        " * person classes' pseudo-yields, the governments' InfluencePointsThreshold,\n"
        " * and the AI lists the weights sum: System Yields and YieldSensitivities by\n"
        " * trait — a leader's traits through its InheritFrom chain, a civilization's\n"
        " * —, those and PseudoYields by strategy (Strategy_Priorities).\n */\n"
        "import type { AiListRef, AiListItem } from '../core/aiValue';\n\n"
        + lit("AI_YIELD_DEFAULT", yields, "Readonly<Record<string, number>>")
        + lit("AI_PSEUDOYIELD_DEFAULT", pseudo, "Readonly<Record<string, number>>")
        + lit("AI_GP_CLASS_PSEUDOYIELD", gpc, "Readonly<Record<string, string>>")
        + lit("AI_GOVERNMENT_INFLUENCE_THRESHOLD", influence, "Readonly<Record<string, number>>")
        + lit("AI_LIST_ITEMS", {k: items[k] for k in sorted(wanted)}, "Readonly<Record<string, readonly AiListItem[]>>")
        + lit("AI_TRAIT_LISTS", dict(sorted(trait_lists.items())), "Readonly<Record<string, readonly AiListRef[]>>")
        + lit("AI_LEADER_TRAITS", {k: v for k, v in leader_w.items() if v}, "Readonly<Record<string, readonly string[]>>")
        + lit("AI_CIVILIZATION_TRAITS", {k: v for k, v in civ_w.items() if v}, "Readonly<Record<string, readonly string[]>>")
        + lit("AI_STRATEGY_LISTS", dict(sorted(strat_lists.items())), "Readonly<Record<string, readonly AiListRef[]>>")
        + lit("AI_STRATEGY_YIELD_PRIORITIES", strat_yields,
              "readonly { strategy: string; yield: string; pct: number }[]")
        + lit("AI_DIFFICULTIES", difficulties, "readonly string[]")
    )
    return major, core


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
    text, core = build()
    if "--check" in sys.argv:
        bad = 0
        for path, want in ((OUT, text), (OUT_CORE, core)):
            stale = not path.exists() or path.read_text(encoding="utf-8") != want
            print(path.relative_to(ROOT).as_posix(), "STALE" if stale else "OK")
            bad |= stale
        return 1 if bad else 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    OUT_CORE.write_text(core, encoding="utf-8", newline="\n")
    names = [line.split('"')[3] for line in text.splitlines() if line.startswith('  "type": "POLICY_')]
    seen, bad = order_check(names)
    print(f"wrote {OUT} ({len(text)} bytes); logged score lines {seen}, out of database order {bad}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
