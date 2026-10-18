"""THE AI TABLES — the install rows the game's AI reads, written as TS.

    python tools/install/ai_tables.py            # write ai/major/tables.ts, cpu/data/aiTables.ts, aiBuildTables.ts, congressTargets.ts
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
import os
import pathlib
import sqlite3
import sys

from xml_check import Install

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "ai" / "major" / "tables.ts"
# the value layer's tables every AI party reads (cpu/core/aiValue.ts)
OUT_CORE = ROOT / "cpu" / "data" / "aiTables.ts"
# the city build AI's tables (cpu/core/aiCityBuild.ts)
OUT_CITY = ROOT / "cpu" / "data" / "aiBuildTables.ts"
# the World Congress's valid targets (cpu/core/congress.ts)
OUT_CONGRESS = ROOT / "cpu" / "data" / "congressTargets.ts"
# the game's own database, as it last loaded the ruleset: its row order
GAME_DB = pathlib.Path(os.path.expandvars(r"%LOCALAPPDATA%/Firaxis Games/Sid Meier's Civilization VI/Cache/DebugGameplay.sqlite"))
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
                          "inverse": reqs.get(r, {}).get("Inverse", "").lower() == "true",
                          "args": rargs.get(r, {})} for r in rset_reqs[rid]]}

    amods: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("UnitAbilityModifiers"):
        if "UnitAbilityType" in c:
            amods[c["UnitAbilityType"]].append(c["ModifierId"])

    def modifier(mid):
        m = mods.get(mid, {})
        d = dyn.get(m.get("ModifierType", ""), {})
        out = {"id": mid, "collection": d.get("CollectionType", "?"), "effect": d.get("EffectType", "?"),
               "args": margs.get(mid, {})}
        if out["effect"] == "EFFECT_GRANT_ABILITY":
            # the ability's own modifiers, which its analyzer runs
            out["ability"] = [modifier(x) for x in amods[out["args"].get("AbilityType", "")]]
        if (out["effect"] in ("EFFECT_ATTACH_MODIFIER", "EFFECT_ATTACH_MODIFIER_TO_PLAYERTYPE")
                and out["args"].get("ModifierId") in mods):
            # the modifier it attaches, which its analyzer (0x6ab630, the
            # registry's one object for both effects) runs on each subject
            out["attach"] = modifier(out["args"]["ModifierId"])
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
            "darkAge": x.get("RequiresDarkAge", "").lower() == "true", "goldenAge": x.get("RequiresGoldenAge", "").lower() == "true",
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
    slots = [{"type": c["GovernmentSlotType"], "any": c.get("AllowsAnyPolicy", "").lower() == "true"}
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
        owner = c.get("LeaderType") or c.get("AgendaType")
        if owner and c["System"] in WEIGHT_SYSTEMS:
            trait_lists[owner].append({"list": c["ListType"], "system": c["System"],
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
    # an agenda's traits (AgendaTraits) that carry a weight list
    atraits: dict[str, list] = collections.defaultdict(list)
    for c in rows("AgendaTraits"):
        if c.get("AgendaType") and c.get("TraitType") in trait_lists and c["TraitType"] not in atraits[c["AgendaType"]]:
            atraits[c["AgendaType"]].append(c["TraitType"])
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
            pe_items[c["ListType"]].append({"condition": c["Item"], "favored": c.get("Favored", "").lower() == "true",
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
                 "naturalWonder": c.get("NaturalWonder", "").lower() == "true"}
                for k, c in keyed(rows("Features"), "FeatureType").items()]
    res_class = {k: c.get("ResourceClassType") for k, c in keyed(rows("Resources"), "ResourceType").items()}
    # the victory manager's strategies (Strategies) in database order, each
    # with its StrategyConditions in database order; the Strategies-system
    # AiLists a leader's traits (through InheritFrom) and a civilization's
    # carry, each item a bias on the strategy's conditions needed
    sconds: dict[str, list] = collections.defaultdict(list)
    for c in rows("StrategyConditions"):
        if c.get("StrategyType"):
            sconds[c["StrategyType"]].append({
                "fn": c.get("ConditionFunction"), "threshold": int(c.get("ThresholdValue", 0) or 0),
                "string": c.get("StringValue"), "disqualifier": c.get("Disqualifier") in ("true", "1"),
                "exclusive": c.get("Exclusive") in ("true", "1"), "forbidden": c.get("Forbidden") in ("true", "1")})
    strategies = [{"type": k, "victory": c.get("VictoryType"), "needed": int(c.get("NumConditionsNeeded", 1) or 1),
                   "conditions": sconds[k]} for k, c in keyed(rows("Strategies"), "StrategyType").items()]
    st_lists = {c["ListType"]: c for c in rows("AiLists") if c.get("ListType") and c.get("System") == "Strategies"}
    st_items: dict[str, list] = collections.defaultdict(list)
    for c in rows("AiFavoredItems"):
        if c.get("ListType") in st_lists and c.get("Item"):
            st_items[c["ListType"]].append(c)

    def strategy_bias(traits):
        out = []
        for lt, c in st_lists.items():
            if c.get("LeaderType") not in traits:
                continue
            for it in st_items[lt]:
                out.append({"strategy": it["Item"], "value": int(it.get("Value", 0) or 0),
                            "minDifficulty": it.get("MinDifficulty") or c.get("MinDifficulty"),
                            "maxDifficulty": it.get("MaxDifficulty") or c.get("MaxDifficulty")})
        return out

    bias_leader = {lt: strategy_bias(set(leader_traits(lt))) for lt in sorted(inherit)}
    bias_civ = {cv: strategy_bias(set(ts)) for cv, ts in sorted(ctraits.items())}
    gps = keyed(rows("GlobalParameters"), "Name")
    globals_ = {k: int(float(gps[k]["Value"])) for k in ("CITY_MIN_RANGE", "COMBAT_BOMBARD_VS_UNIT_STRENGTH_MODIFIER",
                                                         "AI_ISLAND_COAST_PERCENTAGE")}

    # the religion AI: the beliefs in database order (the AI's belief list,
    # AI_Religious.csv's lines, run in it) with their class and modifiers;
    # the religions in database order with the Pantheon and
    # RequiresCustomName flags; FavoredReligions by leader and civilization
    bmods: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("BeliefModifiers"):
        if c.get("BeliefType"):
            bmods[c["BeliefType"]].append(c.get("ModifierID") or c.get("ModifierId"))
    beliefs = [{"type": b, "class": c.get("BeliefClassType"), "modifiers": [modifier(m) for m in bmods[b]]}
               for b, c in in_game_order("Beliefs", "BeliefType", keyed(rows("Beliefs"), "BeliefType"))]
    religions = [{"type": r, "pantheon": c.get("Pantheon", "").lower() == "true", "customName": c.get("RequiresCustomName", "").lower() == "true"}
                 for r, c in in_game_order("Religions", "ReligionType", keyed(rows("Religions"), "ReligionType"))]
    fav_leader: dict[str, list[str]] = collections.defaultdict(list)
    fav_civ: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("FavoredReligions"):
        if c.get("LeaderType"):
            fav_leader[c["LeaderType"]].append(c["ReligionType"])
        if c.get("CivilizationType"):
            fav_civ[c["CivilizationType"]].append(c["ReligionType"])

    # the governor AI: the governors and the promotions in database order
    # (the game's governor and promotion lists, AI_Governors.csv's lines, run
    # in it); a governor's promotions are its GovernorPromotionSets rows in
    # that order; its own modifiers are its BaseAbility promotions' (the
    # analysis's query, GlobalAI +0x39c0), a promotion's its
    # GovernorPromotionModifiers rows ordered by ModifierId (+0x39d8)
    gov_rows = in_game_order("Governors", "GovernorType", keyed(rows("Governors"), "GovernorType"))
    promo_rows = in_game_order("GovernorPromotions", "GovernorPromotionType", keyed(rows("GovernorPromotions"), "GovernorPromotionType"))
    gp_mods: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("GovernorPromotionModifiers"):
        if c.get("GovernorPromotionType"):
            gp_mods[c["GovernorPromotionType"]].append(c["ModifierId"])
    gp_sets: dict[str, set[str]] = collections.defaultdict(set)
    for c in rows("GovernorPromotionSets"):
        if c.get("GovernorType"):
            gp_sets[c["GovernorType"]].add(c["GovernorPromotion"])
    gov_xp2 = keyed(rows("Governors_XP2"), "GovernorType")
    gov_promos = []
    for p, c in promo_rows:
        gov_promos.append({
            "type": p, "level": int(c.get("Level", 0) or 0), "baseAbility": c.get("BaseAbility", "").lower() == "true",
            "governors": [g for g, _ in gov_rows if p in gp_sets[g]],
            "modifiers": [modifier(m) for m in sorted(gp_mods[p])],
        })
    # the World Congress AI: each resolution in database order, its option
    # effects (ResolutionEffects WhichEffect 1 / 2, ordered by the row id) and
    # its target chooser; the Resolutions lists (AiLists System Resolutions)
    # and the traits and strategies that own them
    eff: dict[str, list[list[tuple[int, str]]]] = collections.defaultdict(lambda: [[], []])
    for c in rows("ResolutionEffects"):
        if c.get("ResolutionType") and c.get("ModifierId"):
            k = int(c.get("WhichEffect", 1) or 1) - 1
            if k in (0, 1):
                eff[c["ResolutionType"]][k].append((int(c.get("ResolutionEffectId", 0) or 0), c["ModifierId"]))
    resolutions_ai = [{
        "type": r, "targetKind": c.get("TargetKind"), "chooser": c.get("AITargetChooser"),
        "effects": [[modifier(m) for _i, m in sorted(eff[r][k])] for k in (0, 1)],
    } for r, c in in_game_order("Resolutions", "ResolutionType", keyed(rows("Resolutions"), "ResolutionType"))]
    res_lists = {k: c for k, c in keyed(rows("AiLists"), "ListType").items() if c.get("System") == "Resolutions"}
    res_items: dict[str, list] = collections.defaultdict(list)
    for c in rows("AiFavoredItems"):
        if c.get("ListType") in res_lists and c.get("Item"):
            res_items[c["ListType"]].append({"resolution": c["Item"],
                                             "favored": (c.get("Favored") or "true").lower() not in ("false", "0")})
    res_by_trait: dict[str, list[str]] = collections.defaultdict(list)
    for k, c in res_lists.items():
        t = c.get("LeaderType") or c.get("AgendaType")
        if t and res_items.get(k):
            res_by_trait[t].append(k)
    ag_traits: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("AgendaTraits"):
        if c.get("AgendaType") and c.get("TraitType") in res_by_trait and c["TraitType"] not in ag_traits[c["AgendaType"]]:
            ag_traits[c["AgendaType"]].append(c["TraitType"])
    res_leader = {lt: [t for t in leader_traits(lt) if t in res_by_trait] for lt in sorted(inherit)}
    res_by_strategy: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("Strategy_Priorities"):
        if c.get("ListType") in res_lists and res_items.get(c["ListType"]):
            res_by_strategy[c["StrategyType"]].append(c["ListType"])

    governors_ai = []
    for g, c in gov_rows:
        mine = [p for p, _ in promo_rows if p in gp_sets[g]]
        governors_ai.append({
            "type": g, "identityPressure": int(c.get("IdentityPressure", 0) or 0),
            "assignCityState": c.get("AssignCityState", "").lower() == "true",
            "assignToMajor": gov_xp2.get(g, {}).get("AssignToMajor", "").lower() == "true",
            "trait": c.get("TraitType"), "promotions": mine,
            "modifiers": [modifier(m) for p in mine if dict(promo_rows)[p].get("BaseAbility", "").lower() == "true" for m in gp_mods[p]],
        })

    def lit(name, value, typ):
        return f"export const {name}: {typ} = {json.dumps(value, indent=1)};\n"

    major = (
        "/**\n * THE MAJORS' AI TABLES, written by tools/install/ai_tables.py from the\n"
        " * layered install (`--check` reports a stale file). Policies and governments\n"
        " * run in DATABASE ORDER, the index the game's AI loops walk.\n */\n"
        "import type {\n  AiBelief, AiFeature, AiGovernment, AiGovernor, AiGovernorPromotion, AiPlotEvalItem, AiPolicy, AiReligion, AiResolution, AiSlotType,\n  AiStrategy, AiStrategyBias,\n} from './types';\n\n"
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
        + lit("AI_STRATEGIES", strategies, "readonly AiStrategy[]")
        + lit("AI_STRATEGY_BIAS_BY_LEADER", {k: v for k, v in bias_leader.items() if v},
              "Readonly<Record<string, readonly AiStrategyBias[]>>")
        + lit("AI_STRATEGY_BIAS_BY_CIV", {k: v for k, v in bias_civ.items() if v},
              "Readonly<Record<string, readonly AiStrategyBias[]>>")
        + lit("AI_BELIEFS", beliefs, "readonly AiBelief[]")
        + lit("AI_RELIGIONS", religions, "readonly AiReligion[]")
        + lit("AI_FAVORED_RELIGIONS_BY_LEADER", dict(sorted(fav_leader.items())), "Readonly<Record<string, readonly string[]>>")
        + lit("AI_FAVORED_RELIGIONS_BY_CIV", dict(sorted(fav_civ.items())), "Readonly<Record<string, readonly string[]>>")
        + lit("AI_GOVERNORS", governors_ai, "readonly AiGovernor[]")
        + lit("AI_RESOLUTIONS", resolutions_ai, "readonly AiResolution[]")
        + lit("AI_RESOLUTION_LISTS", {k: res_items[k] for k in sorted(res_items)},
              "Readonly<Record<string, readonly { resolution: string; favored: boolean }[]>>")
        + lit("AI_RESOLUTION_LISTS_BY_TRAIT", dict(sorted(res_by_trait.items())), "Readonly<Record<string, readonly string[]>>")
        + lit("AI_RESOLUTION_LISTS_BY_STRATEGY", dict(sorted(res_by_strategy.items())), "Readonly<Record<string, readonly string[]>>")
        + lit("AI_RESOLUTION_LEADER_TRAITS", {k: v for k, v in res_leader.items() if v}, "Readonly<Record<string, readonly string[]>>")
        + lit("AI_RESOLUTION_AGENDA_TRAITS", dict(sorted(ag_traits.items())), "Readonly<Record<string, readonly string[]>>")
        + lit("AI_GOVERNOR_PROMOTIONS", gov_promos, "readonly AiGovernorPromotion[]")
        + lit("AI_DISTRICTS", [{"type": k, "base": not c.get("TraitType") and (c.get("InternalOnly") or "false").lower() not in ("true", "1"),
                                "cityCenter": (c.get("CityCenter") or "false").lower() in ("true", "1")}
                               for k, c in in_game_order("Districts", "DistrictType", keyed(rows("Districts"), "DistrictType"))],
              "readonly { type: string; base: boolean; cityCenter: boolean }[]")
        + lit("AI_PROJECTS", [{"type": k, "spaceRace": (c.get("SpaceRace") or "false").lower() in ("true", "1"),
                               "wmd": (c.get("WMD") or "false").lower() in ("true", "1"), "cost": int(float(c.get("Cost") or 0))}
                              for k, c in congress_order("Projects", "ProjectType", keyed(rows("Projects"), "ProjectType"))],
              "readonly { type: string; spaceRace: boolean; wmd: boolean; cost: number }[]")
        + lit("AI_PROMOTION_CLASSES", [k for k, _ in in_game_order("UnitPromotionClasses", "PromotionClassType",
                                                                    keyed(rows("UnitPromotionClasses"), "PromotionClassType"))],
              "readonly string[]")
        + lit("AI_GREAT_PERSON_CLASSES", [k for k, _ in in_game_order("GreatPersonClasses", "GreatPersonClassType",
                                                                       keyed(rows("GreatPersonClasses"), "GreatPersonClassType"))],
              "readonly string[]")
    )
    # each city-state's modifiers its envoys are worth (the diplomatic AI's
    # +0x6868 list, 0x651490): its leader's traits through the InheritFrom
    # chain and its civilization's (the query 0xe261e0), ordered by
    # ModifierId, those whose requirements name an INFLUENCE_REQUIREMENT type
    influence_tags = {c["Type"] for c in rows("TypeTags") if c.get("Tag") == "INFLUENCE_REQUIREMENT"}
    trait_mods: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("TraitModifiers"):
        if c.get("TraitType"):
            trait_mods[c["TraitType"]].append(c["ModifierId"])
    civ_level = {c["CivilizationType"]: c.get("StartingCivilizationLevelType") for c in rows("Civilizations") if c.get("CivilizationType")}
    civ_leader = {c["CivilizationType"]: c["LeaderType"] for c in rows("CivilizationLeaders") if c.get("CivilizationType")}
    civ_traits_all: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("CivilizationTraits"):
        if c.get("CivilizationType"):
            civ_traits_all[c["CivilizationType"]].append(c["TraitType"])

    def influenced(mid):
        m = mods.get(mid, {})
        return any(reqs.get(r, {}).get("RequirementType") in influence_tags
                   for key in ("SubjectRequirementSetId", "OwnerRequirementSetId") for r in rset_reqs[m.get(key, "")])

    minor_influence = {}
    for civ, level in civ_level.items():
        if level != "CIVILIZATION_LEVEL_CITY_STATE" or civ not in civ_leader:
            continue
        tree, x = [], civ_leader[civ]
        while x and x not in tree:
            tree.append(x)
            x = inherit.get(x)
        ids = sorted({m for lt in tree for t in ltraits[lt] for m in trait_mods[t]} | {m for t in civ_traits_all[civ] for m in trait_mods[t]})
        minor_influence[civ] = [modifier(m) for m in ids if influenced(m)]
    # each civic's modifiers (CivicModifiers), the civics AI's value analyses
    # them (0x7a9a10 -> 0x7a4b20)
    civic_mods: dict[str, list[str]] = collections.defaultdict(list)
    for c in rows("CivicModifiers"):
        if c.get("CivicType"):
            civic_mods[c["CivicType"]].append(c["ModifierId"])
    # THE ECONOMIC AI'S SAVINGS (every party's: the majors' and the minors'
    # traits carry DefaultSavings): the SavingTypes in table order (a slot's
    # index) and the list's weight of each
    saving_weight = {c["Item"]: int(float(c.get("Value") or 0)) for c in rows("AiFavoredItems") if c.get("ListType") == "DefaultSavings"}
    savings = [{"saving": t, "weight": saving_weight.get(t, 0)} for t in keyed(rows("SavingTypes"), "SavingType")]
    core = (
        "/**\n * THE AI VALUE LAYER'S TABLES (cpu/core/aiValue.ts), written by\n"
        " * tools/install/ai_tables.py from the layered install (`--check` reports a\n"
        " * stale file): the yields' and pseudo-yields' DefaultValue, the great\n"
        " * person classes' pseudo-yields, the governments' InfluencePointsThreshold,\n"
        " * and the AI lists the weights sum: System Yields and YieldSensitivities by\n"
        " * trait — a leader's traits through its InheritFrom chain, a civilization's,\n"
        " * an agenda's (AgendaTraits) —, those and PseudoYields by strategy\n"
        " * (Strategy_Priorities); the city-states' modifiers their envoys reach,\n"
        " * the civics' modifiers (CivicModifiers).\n */\n"
        "import type { AiModifier } from '../core/aiModifiers';\nimport type { AiListRef, AiListItem } from '../core/aiValue';\n\n"
        + lit("AI_YIELD_DEFAULT", yields, "Readonly<Record<string, number>>")
        + lit("AI_PSEUDOYIELD_DEFAULT", pseudo, "Readonly<Record<string, number>>")
        + lit("AI_GP_CLASS_PSEUDOYIELD", gpc, "Readonly<Record<string, string>>")
        + lit("AI_GOVERNMENT_INFLUENCE_THRESHOLD", influence, "Readonly<Record<string, number>>")
        + lit("AI_LIST_ITEMS", {k: items[k] for k in sorted(wanted)}, "Readonly<Record<string, readonly AiListItem[]>>")
        + lit("AI_TRAIT_LISTS", dict(sorted(trait_lists.items())), "Readonly<Record<string, readonly AiListRef[]>>")
        + lit("AI_LEADER_TRAITS", {k: v for k, v in leader_w.items() if v}, "Readonly<Record<string, readonly string[]>>")
        + lit("AI_CIVILIZATION_TRAITS", {k: v for k, v in civ_w.items() if v}, "Readonly<Record<string, readonly string[]>>")
        + lit("AI_AGENDA_TRAITS", dict(sorted(atraits.items())), "Readonly<Record<string, readonly string[]>>")
        + lit("AI_STRATEGY_LISTS", dict(sorted(strat_lists.items())), "Readonly<Record<string, readonly AiListRef[]>>")
        + lit("AI_STRATEGY_YIELD_PRIORITIES", strat_yields,
              "readonly { strategy: string; yield: string; pct: number }[]")
        + lit("AI_DIFFICULTIES", difficulties, "readonly string[]")
        + lit("AI_MINOR_INFLUENCE_MODIFIERS", dict(sorted(minor_influence.items())), "Readonly<Record<string, readonly AiModifier[]>>")
        + lit("AI_CIVIC_MODIFIERS", {k: [modifier(m) for m in v] for k, v in sorted(civic_mods.items())},
              "Readonly<Record<string, readonly AiModifier[]>>")
        + lit("AI_SPACE_RACE_PROJECTS", [k for k, c in keyed(rows("Projects"), "ProjectType").items() if c.get("SpaceRace", "").lower() == "true"],
              "readonly string[]")
        + lit("AI_DEFAULT_SAVINGS", savings, "readonly { saving: string; weight: number }[]")
    )
    city = build_city(rows, modifier)
    return major, core, city, build_congress(rows)


def congress_order(table: str, key: str, have: dict[str, dict]) -> list[tuple[str, dict]]:
    """the game's database rows in its order (its index); an install row the
    game did not load (a pack the recordings ran without) has none"""
    db = sqlite3.connect(GAME_DB)
    return [(k, have[k]) for (k,) in db.execute(f"select {key} from {table} order by rowid") if k in have]


def in_game_order(table: str, key: str, rows: dict[str, dict]) -> list[tuple[str, dict]]:
    """the install's rows in the game's DATABASE ORDER: the rowid order of the
    game's own database (DebugGameplay.sqlite in the game's cache, written as
    it loads its packs — the DLC civilizations' rows before Expansion1's, the
    later packs' after Expansion2's, an order the packs' .modinfo files do not
    state). A row the install has and the database lacks, or the reverse, is
    an error."""
    db = sqlite3.connect(GAME_DB)
    order = [r[0] for r in db.execute(f"select {key} from {table} order by rowid")]
    if set(order) != set(rows):
        raise SystemExit(f"{table}: the install and {GAME_DB.name} differ: "
                         f"{sorted(set(order) ^ set(rows))}")
    return [(k, rows[k]) for k in order]


def build_congress(rows) -> str:
    """the World Congress's valid targets: per resolution, the options
    DLC/Expansion2/Scripts/WorldCongress.lua's ValidationLua handler gives a
    player (`options.ResolutionOptions`), its candidates in DATABASE ORDER
    with their database index; what the handler filters live is a filter
    the engine applies: `met` (an alive major the player has met, or the
    player), `onMap` (a luxury the map holds), `era` (a district whose
    PrereqTech's and PrereqCivic's eras lie at or before the game era),
    `gpAvail` (a class with a great person still to earn), `founded` (a
    religion founded). A resolution whose handler the Lua lacks
    (WC_Validate_RegliousBan) or names none (Sovereignty), or a handler that
    sets nothing (WC_Validate_GreatWorkObjects), offers every row of its
    TargetKind's table — the religions as those founded."""
    def ordered(table, key):
        return congress_order(table, key, keyed(rows(table), key))

    eras = [k for k, _ in ordered("Eras", "EraType")]
    tech_era = {k: c.get("EraType") for k, c in keyed(rows("Technologies"), "TechnologyType").items()}
    civic_era = {k: c.get("EraType") for k, c in keyed(rows("Civics"), "CivicType").items()}
    wild = {c["GovernmentType"] for c in rows("Government_SlotCounts") if c.get("GovernmentSlotType") == "SLOT_WILDCARD"}

    def pick(table, key, keep, extra=None):
        return [dict({"type": k, "index": i}, **(extra(c) if extra else {}))
                for i, (k, c) in enumerate(ordered(table, key)) if keep(k, c)]

    def flag(c, k):
        return (c.get(k) or "").lower() in ("true", "1")

    def num(c, k):
        v = c.get(k)
        return 0 if v in (None, "", "NULL") else int(float(v))

    urban = {"DISTRICT_CITY_CENTER", "DISTRICT_HOLY_SITE", "DISTRICT_CAMPUS", "DISTRICT_ENCAMPMENT", "DISTRICT_HARBOR",
             "DISTRICT_AERODROME", "DISTRICT_COMMERCIAL_HUB", "DISTRICT_ENTERTAINMENT_COMPLEX", "DISTRICT_THEATER",
             "DISTRICT_INDUSTRIAL_ZONE", "DISTRICT_GOVERNMENT", "DISTRICT_WATER_ENTERTAINMENT_COMPLEX",
             "DISTRICT_DIPLOMATIC_QUARTER", "DISTRICT_PRESERVE"}

    def district_era(c):
        e = [eras.index(tech_era[c["PrereqTech"]]) if c.get("PrereqTech") else 0,
             eras.index(civic_era[c["PrereqCivic"]]) if c.get("PrereqCivic") else 0]
        return {"era": max(e)}

    players = {"filter": "met", "entries": []}
    lists = {
        "WC_Validate_LuxuryBan": {"filter": "onMap", "entries": pick(
            "Resources", "ResourceType",
            lambda k, c: c.get("ResourceClassType") == "RESOURCECLASS_LUXURY" and (num(c, "Frequency") > 0 or num(c, "SeaFrequency") > 0))},
        "WC_Validate_YieldBan": {"filter": None, "entries": pick(
            "Yields", "YieldType", lambda k, c: k in ("YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_FAITH"))},
        "WC_Validate_PowerBuilding": {"filter": None, "entries": pick(
            "Buildings", "BuildingType",
            lambda k, c: k in ("BUILDING_COAL_POWER_PLANT", "BUILDING_FOSSIL_FUEL_POWER_PLANT", "BUILDING_POWER_PLANT"))},
        "WC_Validate_WorldIdeology": {"filter": None, "entries": pick("Governments", "GovernmentType", lambda k, c: k in wild)},
        "WC_Validate_UrbanDevelopment": {"filter": "era", "entries": pick(
            "Districts", "DistrictType", lambda k, c: k in urban, district_era)},
        "WC_Validate_PublicWorks": {"filter": None, "entries": pick(
            "Projects", "ProjectType", lambda k, c: flag(c, "SpaceRace") or flag(c, "WMD"))},
        "WC_Validate_Patronage": {"filter": "gpAvail", "entries": pick("GreatPersonClasses", "GreatPersonClassType", lambda k, c: True)},
        "WC_Validate_DeforestationFeature": {"filter": None, "entries": pick(
            "Features", "FeatureType", lambda k, c: k in ("FEATURE_MARSH", "FEATURE_FOREST", "FEATURE_JUNGLE"))},
        "WC_Validate_ESPIONAGE_PACT": {"filter": None, "entries": pick(
            "UnitOperations", "OperationType",
            lambda k, c: c.get("CategoryInUI") == "OFFENSIVESPY" and num(c, "BaseProbability") > 0)},
        "WC_Validate_MILITARY_ADVISORY": {"filter": None, "entries": pick(
            "UnitPromotionClasses", "PromotionClassType",
            lambda k, c: k in ("PROMOTION_CLASS_RECON", "PROMOTION_CLASS_MELEE", "PROMOTION_CLASS_RANGED", "PROMOTION_CLASS_ANTI_CAVALRY",
                               "PROMOTION_CLASS_LIGHT_CAVALRY", "PROMOTION_CLASS_HEAVY_CAVALRY", "PROMOTION_CLASS_SIEGE"))},
        "WC_Validate_BorderControl": players, "WC_Validate_MigrationTreaty": players, "WC_Validate_ArmsControlTreaty": players,
        "WC_Validate_TradeTreaty": players, "WC_Validate_DiploVictory": players,
    }
    default = {
        "GREATWORKOBJECT": {"filter": None, "entries": pick("GreatWorkObjectTypes", "GreatWorkObjectType", lambda k, c: True)},
        "MINORCIVBONUS": {"filter": None, "entries": pick("MinorCivBonuses", "MinorCivBonusType", lambda k, c: True)},
        "RELIGION": {"filter": "founded", "entries": []},
    }
    out = {}
    for r, c in ordered("Resolutions", "ResolutionType"):
        t = lists.get(c.get("ValidationLua") or "") or default[c["TargetKind"]]
        out[r] = {"kind": c["TargetKind"], **t}
    return ("/**\n * THE WORLD CONGRESS'S VALID TARGETS (cpu/core/congress.ts), written by\n"
            " * tools/install/ai_tables.py (`build_congress`) from the layered install\n"
            " * and DLC/Expansion2/Scripts/WorldCongress.lua (`--check` reports a stale\n"
            " * file): per ResolutionType its TargetKind, the candidates its\n"
            " * ValidationLua handler offers in DATABASE ORDER with their database\n"
            " * index, and the filter the engine applies live.\n */\n"
            "export interface CongressTargetEntry { type: string; index: number; era?: number }\n"
            "export interface CongressTargetTable {\n  kind: string;\n"
            "  filter: 'met' | 'onMap' | 'era' | 'gpAvail' | 'founded' | null;\n"
            "  entries: readonly CongressTargetEntry[];\n}\n\n"
            f"export const CONGRESS_TARGET_TABLES: Readonly<Record<string, CongressTargetTable>> = {json.dumps(out, indent=1)};\n")


def build_city(rows, modifier) -> str:
    """the city build AI's tables: the Buildings in DATABASE ORDER (the
    index its value tables run in, AI_CityBuild.csv's BUILDINGS rows), each
    with the columns and child rows its value reads"""

    def num(c, k, d=0):
        v = c.get(k)
        return d if v in (None, "", "NULL") else int(float(v))

    def multi(table, key):
        out: dict[str, list] = collections.defaultdict(list)
        for c in rows(table):
            if c.get(key):
                out[c[key]].append(c)
        return out

    by_yield = multi("Building_YieldChanges", "BuildingType")
    prereq = multi("BuildingPrereqs", "Building")
    gworks = multi("Building_GreatWorks", "BuildingType")
    gpp = multi("Building_GreatPersonPoints", "BuildingType")
    bmods = multi("BuildingModifiers", "BuildingType")
    copies = multi("Building_YieldDistrictCopies", "BuildingType")
    unit_pre = multi("Unit_BuildingPrereqs", "PrereqBuilding")
    exclusive = multi("MutuallyExclusiveBuildings", "Building")
    replaces = {c["CivUniqueBuildingType"]: c["ReplacesBuildingType"] for c in rows("BuildingReplaces")
                if c.get("CivUniqueBuildingType")}
    xp2 = keyed(rows("Buildings_XP2"), "BuildingType")
    subtypes = multi("GreatWork_ValidSubTypes", "GreatWorkSlotType")
    gw_pseudo = {k: c.get("PseudoYieldType") for k, c in keyed(rows("GreatWorkObjectTypes"), "GreatWorkObjectType").items()}
    gpc = {k: c.get("PseudoYieldType") for k, c in keyed(rows("GreatPersonClasses"), "GreatPersonClassType").items()}
    out = []
    for b, c in in_game_order("Buildings", "BuildingType", keyed(rows("Buildings"), "BuildingType")):
        x = xp2.get(b, {})
        out.append({
            "type": b, "cost": num(c, "Cost"), "maintenance": num(c, "Maintenance"), "housing": num(c, "Housing"),
            "entertainment": num(c, "Entertainment"), "regionalRange": num(c, "RegionalRange"),
            "outerDefenseHitPoints": c.get("OuterDefenseHitPoints") not in (None, "", "NULL"),
            "outerDefenseStrength": num(c, "OuterDefenseStrength"), "defenseModifier": num(c, "DefenseModifier"),
            "tech": c.get("PrereqTech"), "civic": c.get("PrereqCivic"), "district": c.get("PrereqDistrict"),
            "wonder": c.get("IsWonder", "").lower() == "true", "placement": c.get("RequiresPlacement", "").lower() == "true",
            "goldPurchase": c.get("PurchaseYield") == "YIELD_GOLD",
            "maxPlayerInstances": num(c, "MaxPlayerInstances", -1), "maxWorldInstances": num(c, "MaxWorldInstances", -1),
            "trait": c.get("TraitType"), "replaces": replaces.get(b),
            "capital": c.get("Capital", "").lower() == "true", "religion": c.get("EnabledByReligion", "").lower() == "true",
            "adjacentRiver": c.get("RequiresAdjacentRiver", "").lower() == "true",
            "governmentTier": int((c.get("GovernmentTierRequirement") or "Tier0")[4:] or 0),
            "exclusive": [r["MutuallyExclusiveBuilding"] for r in exclusive[b]],
            "yields": [[r["YieldType"], num(r, "YieldChange")] for r in by_yield[b]],
            "prereqs": [r["PrereqBuilding"] for r in prereq[b]],
            "greatWorks": [{"n": num(r, "NumSlots", 1),
                            "pseudo": [gw_pseudo.get(s["GreatWorkObjectType"]) for s in subtypes[r["GreatWorkSlotType"]]]}
                           for r in gworks[b]],
            "gpp": [[gpc.get(r["GreatPersonClassType"]), num(r, "PointsPerTurn")] for r in gpp[b]],
            "copies": [[r["OldYieldType"], r["NewYieldType"]] for r in copies[b]],
            "units": [r["Unit"] for r in unit_pre[b]],
            "entertainmentWithPower": num(x, "EntertainmentBonusWithPower"),
            "modifiers": [modifier(r["ModifierId"]) for r in bmods[b]],
        })
    tags = multi("TypeTags", "Type")
    unit_bld = multi("Unit_BuildingPrereqs", "Unit")
    uxp2 = keyed(rows("Units_XP2"), "UnitType")
    units = []
    for u, c in in_game_order("Units", "UnitType", keyed(rows("Units"), "UnitType")):
        x = uxp2.get(u, {})
        units.append({
            "type": u, "foundCity": c.get("FoundCity", "").lower() == "true", "buildCharges": num(c, "BuildCharges"),
            "mustPurchase": c.get("MustPurchase", "").lower() == "true", "goldPurchase": c.get("PurchaseYield") == "YIELD_GOLD",
            "combat": num(c, "Combat"),
            "recon": any(t.get("Tag") == "CLASS_RECON" for t in tags[u]),
            "rangedCombat": num(c, "RangedCombat"), "bombard": num(c, "Bombard"), "antiAir": num(c, "AntiAirCombat"),
            "range": num(c, "Range"), "moves": num(c, "BaseMoves"), "maintenance": num(c, "Maintenance"),
            "cost": num(c, "Cost"), "domain": c.get("Domain", "DOMAIN_LAND"),
            "civilian": c.get("FormationClass") == "FORMATION_CLASS_CIVILIAN",
            "pseudo": c.get("PseudoYieldType"), "promotionClass": c.get("PromotionClass"),
            "resource": c.get("StrategicResource"), "trait": c.get("TraitType"),
            "tech": c.get("PrereqTech"), "civic": c.get("PrereqCivic"), "district": c.get("PrereqDistrict"),
            "obsolete": [c[k] for k in ("MandatoryObsoleteCivic", "MandatoryObsoleteTech", "ObsoleteCivic", "ObsoleteTech")
                         if c.get(k)],
            "buildings": [r["PrereqBuilding"] for r in unit_bld[u]],
            "spy": c.get("Spy", "").lower() == "true", "wmd": c.get("WMDCapable", "").lower() == "true",
            "religion": c.get("EnabledByReligion", "").lower() == "true",
            "religiousStrength": num(c, "ReligiousStrength"), "spreadCharges": num(c, "SpreadCharges"),
            "healCharges": num(c, "ReligiousHealCharges"), "parkCharges": num(c, "ParkCharges"),
            "canTrain": str(c.get("CanTrain", "")).lower() not in ("false", "0"),
            "majorOnly": str(x.get("MajorCivOnly", "")).lower() in ("true", "1"),
            "maintenanceResource": x.get("ResourceMaintenanceType"),
            "maintenanceResourceAmount": num(x, "ResourceMaintenanceAmount"), "resourceCost": num(x, "ResourceCost"),
        })
    # the military AI's promotion class lists (AiLists System UnitPromotionClasses
    # by leader trait, their AiFavoredItems values)
    pc_lists = {c["ListType"]: c for c in rows("AiLists") if c.get("ListType") and c.get("System") == "UnitPromotionClasses"}
    pc_by_trait: dict[str, dict[str, int]] = collections.defaultdict(dict)
    for c in rows("AiFavoredItems"):
        lst = pc_lists.get(c.get("ListType", ""))
        if lst and lst.get("LeaderType") and c.get("Item"):
            pc_by_trait[lst["LeaderType"]][c["Item"]] = num(c, "Value")
    # the district lists by leader trait (AiLists System Districts): each
    # item +1 where Favored, -1 where not
    dl_lists = {c["ListType"]: c for c in rows("AiLists") if c.get("ListType") and c.get("System") == "Districts"}
    dl_by_trait: dict[str, dict[str, int]] = collections.defaultdict(dict)
    for c in rows("AiFavoredItems"):
        lst = dl_lists.get(c.get("ListType", ""))
        if lst and lst.get("LeaderType") and c.get("Item"):
            fav = c.get("Favored", "").lower() == "true"
            dl_by_trait[lst["LeaderType"]][c["Item"]] = dl_by_trait[lst["LeaderType"]].get(c["Item"], 0) + (1 if fav else -1)
    # the resources (the resource value 0x7a21e0: class, Happiness, PeakEra;
    # the units whose StrategicResource it is, Units' order) and the
    # improvements (the research value's improvement walk: PrereqTech /
    # PrereqCivic, the civilization trait, Buildable, the valid resources in
    # Improvement_ValidResources' order), each in DATABASE ORDER
    strat_units = collections.defaultdict(list)
    for u in units:
        if u["resource"]:
            strat_units[u["resource"]].append(u["type"])
    # (the improvement value's: a resource's Resource_Harvests and
    # Resource_YieldChanges; an improvement's Improvement_YieldChanges,
    # Housing / TilesRequired, YieldFromAppeal, its valid features and build
    # units, the resources it works and whether it clears their feature)
    harvests = multi("Resource_Harvests", "ResourceType")
    res_yields = multi("Resource_YieldChanges", "ResourceType")
    resources = [{"type": r, "class": c.get("ResourceClassType"), "happiness": num(c, "Happiness"),
                  "peakEra": c.get("PeakEra") if c.get("PeakEra") not in (None, "", "NO_ERA") else None,
                  "units": strat_units[r],
                  "harvests": [[h["YieldType"], num(h, "Amount")] for h in harvests[r]],
                  "harvestTechs": [h.get("PrereqTech") or None for h in harvests[r]],
                  "yields": [[y["YieldType"], num(y, "YieldChange")] for y in res_yields[r]]}
                 for r, c in in_game_order("Resources", "ResourceType", keyed(rows("Resources"), "ResourceType"))]
    valid = multi("Improvement_ValidResources", "ImprovementType")
    imp_yields = multi("Improvement_YieldChanges", "ImprovementType")
    imp_features = multi("Improvement_ValidFeatures", "ImprovementType")
    imp_units = multi("Improvement_ValidBuildUnits", "ImprovementType")
    imp_adj = multi("Improvement_Adjacencies", "ImprovementType")
    adj_yield = {k: c.get("YieldType") for k, c in keyed(rows("Adjacency_YieldChanges"), "ID").items()}
    improvements = [{"type": i, "tech": c.get("PrereqTech"), "civic": c.get("PrereqCivic"), "trait": c.get("TraitType"),
                     "buildable": c.get("Buildable", "").lower() == "true",
                     "resources": [r["ResourceType"] for r in valid[i]],
                     "keepsFeature": [r["ResourceType"] for r in valid[i] if r.get("MustRemoveFeature") == "false"],
                     "yields": [[y["YieldType"], num(y, "YieldChange")] for y in imp_yields[i]],
                     "housing": num(c, "Housing"), "tilesRequired": num(c, "TilesRequired", 1),
                     "appealYield": c.get("YieldFromAppeal") or None, "appealPct": num(c, "YieldFromAppealPercent", 100),
                     "defenseModifier": num(c, "DefenseModifier"), "grantFortification": num(c, "GrantFortification"),
                     "features": [f["FeatureType"] for f in imp_features[i]],
                     "buildUnits": [[u["UnitType"], u.get("ConsumesCharge") != "false"] for u in imp_units[i]],
                     "adjacency": [adj_yield[a["YieldChangeId"]] for a in imp_adj[i] if adj_yield.get(a["YieldChangeId"])]}
                    for i, c in in_game_order("Improvements", "ImprovementType", keyed(rows("Improvements"), "ImprovementType"))]
    # the districts (the district choice's and the trees' rows: PrereqTech /
    # PrereqCivic, the civilization trait), in DATABASE ORDER
    # (the district value's: Maintenance, Housing, Appeal, HitPoints,
    # MilitaryDomain, the flags it tests, District_GreatPersonPoints at their
    # class's pseudo-yield, Districts_XP2's Canal / PreventsFloods, the
    # projects whose PrereqDistrict it is in the database's order)
    d_gpp = multi("District_GreatPersonPoints", "DistrictType")
    d_xp2 = keyed(rows("Districts_XP2"), "DistrictType")
    d_projects = collections.defaultdict(list)
    project_rows = keyed(rows("Projects"), "ProjectType")
    for (pr,) in sqlite3.connect(GAME_DB).execute("select ProjectType from Projects order by rowid"):
        if project_rows.get(pr, {}).get("PrereqDistrict"):
            d_projects[project_rows[pr]["PrereqDistrict"]].append(pr)

    # the largest RegionalRange of the buildings the district holds (a
    # civilization's own ones left out), the Appeal housing bands
    # (AppealHousingChanges [MinimumValue, AppealChange] in the database's
    # order)
    d_range = collections.defaultdict(int)
    for b, c in keyed(rows("Buildings"), "BuildingType").items():
        if c.get("PrereqDistrict") and not c.get("TraitType"):
            d_range[c["PrereqDistrict"]] = max(d_range[c["PrereqDistrict"]], num(c, "RegionalRange"))
    d_appeal = collections.defaultdict(list)
    for dt, mv, ch in sqlite3.connect(GAME_DB).execute(
            "select DistrictType, MinimumValue, AppealChange from AppealHousingChanges order by rowid"):
        d_appeal[dt].append([mv, ch])

    def flag(c, k):
        return str(c.get(k, "")).lower() in ("true", "1")
    districts = [{"type": d, "tech": c.get("PrereqTech"), "civic": c.get("PrereqCivic"), "trait": c.get("TraitType"),
                  "maintenance": num(c, "Maintenance"), "housing": num(c, "Housing"), "appeal": num(c, "Appeal"),
                  "hitPoints": num(c, "HitPoints") if c.get("HitPoints") not in (None, "", "NULL") else None,
                  "domain": c.get("MilitaryDomain") if c.get("MilitaryDomain") not in (None, "", "NO_DOMAIN") else None,
                  "coast": flag(c, "Coast"), "aqueduct": flag(c, "Aqueduct"), "internalOnly": flag(c, "InternalOnly"),
                  "requiresPopulation": flag(c, "RequiresPopulation"),
                  "gpp": [[gpc.get(r["GreatPersonClassType"]), num(r, "PointsPerTurn")] for r in d_gpp[d]],
                  "canal": flag(d_xp2.get(d, {}), "Canal"), "preventsFloods": flag(d_xp2.get(d, {}), "PreventsFloods"),
                  "projects": d_projects[d], "regionalRange": d_range[d], "appealHousing": d_appeal[d]}
                 for d, c in in_game_order("Districts", "DistrictType", keyed(rows("Districts"), "DistrictType"))]
    # the features (a feature a Builder clears for an improvement: Removable,
    # RemoveTech; the danger map's DangerValue), in DATABASE ORDER
    feat_yields = multi("Feature_YieldChanges", "FeatureType")
    feat_removes = multi("Feature_Removes", "FeatureType")
    features = [{"type": f, "removable": c.get("Removable", "").lower() == "true", "removeTech": c.get("RemoveTech") or None,
                 "appeal": num(c, "Appeal"), "danger": num(c, "DangerValue"),
                 "yields": [[y["YieldType"], num(y, "YieldChange")] for y in feat_yields[f]],
                 "removes": [[y["YieldType"], num(y, "Yield")] for y in feat_removes[f]]}
                for f, c in in_game_order("Features", "FeatureType", keyed(rows("Features"), "FeatureType"))]
    eff_units, eff = efficiency_table()
    if eff_units != [u["type"] for u in units]:
        raise SystemExit("AI_UnitEfficiency.csv's units differ from the Units rows")
    # the database's own rows: the install reader also takes a persona pack's
    # project (PROJECT_COURT_FESTIVAL) the recorded games did not load — their
    # logged PROJECTS rows hold the database's 37
    # each with the columns the project value (0x7b28c0) reads: the projects
    # it is a prerequisite of (ProjectPrereqs), Project_GreatPersonPoints at
    # their class's pseudo-yield, Projects_XP1's loyalty a citizen,
    # Projects_XP2's CreateBuilding, Project_BuildingCosts' consumed
    # buildings, ProjectCompletionModifiers
    p_rows = keyed(rows("Projects"), "ProjectType")
    p_unlocks = collections.defaultdict(list)
    p_prereqs = collections.defaultdict(list)
    for c in rows("ProjectPrereqs"):
        p_unlocks[c["PrereqProjectType"]].append(c["ProjectType"])
        p_prereqs[c["ProjectType"]].append(c["PrereqProjectType"])
    p_gpp = multi("Project_GreatPersonPoints", "ProjectType")
    p_xp1 = keyed(rows("Projects_XP1"), "ProjectType")
    p_xp2 = keyed(rows("Projects_XP2"), "ProjectType")
    p_mods = multi("ProjectCompletionModifiers", "ProjectType")
    p_consumes = multi("Project_BuildingCosts", "ProjectType")

    def pflag(c, k):
        return str(c.get(k, "")).lower() in ("true", "1")

    def prow(pt):
        c = p_rows.get(pt, {})
        return {"type": pt, "tech": c.get("PrereqTech"), "civic": c.get("PrereqCivic"), "district": c.get("PrereqDistrict"),
                "maxPlayerInstances": num(c, "MaxPlayerInstances", -1),
                "unlocksFromEffect": pflag(c, "UnlocksFromEffect") or pflag(p_xp2.get(pt, {}), "UnlocksFromEffect"),
                "requiredBuilding": c.get("RequiredBuilding"), "prereqs": sorted(p_prereqs[pt]),
                "outerDefenseRepair": pflag(c, "OuterDefenseRepair"), "spaceRace": pflag(c, "SpaceRace"), "wmd": pflag(c, "WMD"),
                "unlocks": sorted(p_unlocks[pt]),
                "gpp": [[gpc.get(r["GreatPersonClassType"]), num(r, "Points"), num(r, "PointProgressionParam1")] for r in p_gpp[pt]],
                "identityPerCitizen": float(p_xp1.get(pt, {}).get("IdentityPerCitizenChange") or 0),
                "createBuilding": p_xp2.get(pt, {}).get("CreateBuilding"),
                "consumes": [r["ConsumedBuildingType"] for r in p_consumes[pt]],
                "modifiers": [modifier(r["ModifierId"]) for r in p_mods[pt]]}
    projects = [prow(r[0]) for r in sqlite3.connect(GAME_DB).execute("select ProjectType from Projects order by rowid")]
    return (
        "/**\n * THE CITY BUILD AI'S TABLES (cpu/core/aiCityBuild.ts), written by\n"
        " * tools/install/ai_tables.py from the layered install (`--check` reports a\n"
        " * stale file): the Buildings, Units and Projects in DATABASE ORDER — the\n"
        " * index the AI's value tables run in — with the columns and child rows\n"
        " * the values and the Default Specialization pick read.\n */\n"
        "import type { AiBuildingRow, AiDistrictRow, AiFeatureRow, AiProjectRow, AiUnitRow } from '../core/aiCityBuild';\n"
        "import type { AiImprovementRow, AiResourceRow } from '../core/aiResource';\n\n"
        f"export const AI_BUILDINGS: readonly AiBuildingRow[] = {json.dumps(out, indent=1)};\n\n"
        f"export const AI_UNITS: readonly AiUnitRow[] = {json.dumps(units, indent=1)};\n\n"
        f"export const AI_PROJECTS: readonly AiProjectRow[] = {json.dumps(projects, indent=1)};\n\n"
        f"export const AI_RESOURCES: readonly AiResourceRow[] = {json.dumps(resources, indent=1)};\n\n"
        f"export const AI_IMPROVEMENTS: readonly AiImprovementRow[] = {json.dumps(improvements, indent=1)};\n\n"
        f"export const AI_DISTRICTS: readonly AiDistrictRow[] = {json.dumps(districts, indent=1)};\n\n"
        f"export const AI_FEATURES: readonly AiFeatureRow[] = {json.dumps(features, indent=1)};\n\n"
        "/** the promotion class lists by leader trait (AiFavoredItems of the\n"
        " *  AiLists of System UnitPromotionClasses): class -> Value */\n"
        "export const AI_PROMOTION_CLASS_LISTS: Readonly<Record<string, Readonly<Record<string, number>>>> = "
        f"{json.dumps(dict(sorted(pc_by_trait.items())), indent=1)};\n\n"
        "/** the district lists by leader trait (AiFavoredItems of the AiLists of\n"
        " *  System Districts): district -> +1 favored, -1 not */\n"
        "export const AI_DISTRICT_LISTS: Readonly<Record<string, Readonly<Record<string, number>>>> = "
        f"{json.dumps(dict(sorted(dl_by_trait.items())), indent=1)};\n\n"
        "/** THE UNIT EFFICIENCIES (UnitProduction's m_efficiencies, GlobalAI\n"
        " *  +0x3c8): row the opposing unit, column the unit valued, AI_UNITS'\n"
        " *  order, raw 24.8 — the table the game computes once a game (0x79a440)\n"
        " *  and logs as AI_UnitEfficiency.csv, the same in every recording, read\n"
        " *  at its printed 0.01 */\n"
        f"export const AI_UNIT_EFFICIENCY: readonly (readonly number[])[] = [\n"
        + ",\n".join(" [" + ",".join(str(v) for v in row) + "]" for row in eff) + "\n];\n"
    )


def efficiency_table() -> tuple[list[str], list[list[int]]]:
    """AI_UnitEfficiency.csv beside the recordings: every one the same; each
    value raw (24.8), the printed two decimals rounded to the nearest step"""
    texts = {open(f, encoding="utf-8").read() for f in glob.glob(str(RUNS / "h1_duel*.logs" / "AI_UnitEfficiency.csv"))}
    if len(texts) != 1:
        raise SystemExit(f"AI_UnitEfficiency.csv: {len(texts)} different tables beside the recordings")
    lines = [ln for ln in next(iter(texts)).splitlines() if ln.strip()]
    head = [x.strip() for x in lines[0].split(",")[1:] if x.strip()]
    rows = []
    for ln in lines[1:]:
        p = [x.strip() for x in ln.split(",")]
        rows.append([round(float(v) * 256) for v in p[1:1 + len(head)]])
    return head, rows


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
    text, core, city, congress = build()
    if "--check" in sys.argv:
        bad = 0
        for path, want in ((OUT, text), (OUT_CORE, core), (OUT_CITY, city), (OUT_CONGRESS, congress)):
            stale = not path.exists() or path.read_text(encoding="utf-8") != want
            print(path.relative_to(ROOT).as_posix(), "STALE" if stale else "OK")
            bad |= stale
        return 1 if bad else 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    OUT_CORE.write_text(core, encoding="utf-8", newline="\n")
    OUT_CITY.write_text(city, encoding="utf-8", newline="\n")
    OUT_CONGRESS.write_text(congress, encoding="utf-8", newline="\n")
    names = [line.split('"')[3] for line in text.splitlines() if line.startswith('  "type": "POLICY_')]
    seen, bad = order_check(names)
    print(f"wrote {OUT} ({len(text)} bytes); logged score lines {seen}, out of database order {bad}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
