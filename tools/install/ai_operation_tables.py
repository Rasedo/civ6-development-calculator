"""THE BEHAVIOUR TREE TABLES — the install rows `cpu/core/operations/` reads
and the city events' trees the engine runs, written as TS.

    python tools/install/ai_operation_tables.py            # write cpu/data/aiOperations.ts and cpu/data/aiCityTrees.ts
    python tools/install/ai_operation_tables.py --check    # exit 1 when a file is stale

The city events (CityEvents in table order, a city's tree slot), each
leader trait's CityEvents list (AiLists of System CityEvents, their
AiFavoredItems an event and the tree's name in StringVal) and the trees
those lists name, to cpu/data/aiCityTrees.ts; to the majors' tables:

The operation definitions (AiOperationDefs with their OperationType's
value), the operation lists (AllowedOperations by AiOperationLists, in the
rowid order the loader's query reads, RemoveRef kept), the operation limits
(the AiFavoredItems of the lists AiLists binds to the systems
AiOperationTypes and PerWarOperationTypes, by leader trait and by strategy),
the teams of each operation (AiOperationTeams in the order the loader's
query returns them) and each team's requirements (OpTeamRequirements in the
order of the table's primary-key index, the one its query by TeamName
walks: AiType ascending), the behaviour trees the operations and the
triggered trees run (BehaviorTreeNodes with their node definition's shape,
TreeData by data name with its default and tag), the unit AI types
(UnitAiTypes in rowid order, UnitAiInfos per unit type) and the triggered
behaviour trees. Read through `xml_check.Install` (the layered install,
the game's load order, Update and Delete applied); where the game's own
database (DebugGameplay.sqlite in the game's cache) is present, each query's
row order is checked against it.
"""
from __future__ import annotations

import json
import os
import pathlib
import sqlite3
import sys

from xml_check import Install

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "cpu" / "data" / "aiOperations.ts"
CITY_OUT = ROOT / "cpu" / "data" / "aiCityTrees.ts"
GAME_DB = pathlib.Path(os.path.expandvars(r"%LOCALAPPDATA%/Firaxis Games/Sid Meier's Civilization VI/Cache/DebugGameplay.sqlite"))


def num(v, default=0):
    if v in (None, "", "NULL"):
        return default
    try:
        return int(v)
    except ValueError:
        return int(float(v))


def real(v, default=0.0):
    if v in (None, "", "NULL"):
        return default
    return float(v)


def flag(v, default=False):
    if v in (None, "", "NULL"):
        return default
    return str(v).lower() in ("1", "true")


def keyed(rows, *keys):
    """rows by key in load order: a re-written row keeps its first place and
    takes its last cells"""
    out: dict[tuple, dict] = {}
    for c in rows:
        k = tuple(c.get(x) for x in keys)
        if any(x is None for x in k):
            continue
        if k in out:
            out[k].update(c)
        else:
            out[k] = dict(c)
    return out


def build() -> str:
    inst = Install()

    def rows(t):
        defaults = inst.defaults.get(t, {})
        return [{**{k: v for k, v in defaults.items() if v is not None}, **c} for c, _ in inst.tables.get(t, ())]

    op_types = {k[0]: num(c.get("Value"), -1) for k, c in keyed(rows("AiOperationTypes"), "OperationType").items()}
    defs = {}
    for (name,), c in keyed(rows("AiOperationDefs"), "OperationName").items():
        t = c.get("OperationType")
        defs[name] = {
            "name": name,
            "targetType": c.get("TargetType"),
            "targetParameter": num(c.get("TargetParameter")),
            "enemyType": c.get("EnemyType") or "NONE",
            "operationType": t or None,
            "operationTypeValue": op_types.get(t, -1) if t else -1,
            "tree": c.get("BehaviorTree") or None,
            "priority": num(c.get("Priority"), 3),
            "maxTargetDistInRegion": num(c.get("MaxTargetDistInRegion"), 10),
            "maxTargetDistInArea": num(c.get("MaxTargetDistInArea"), 5),
            "maxTargetDistInWorld": num(c.get("MaxTargetDistInWorld"), 0),
            "maxTargetStrength": num(c.get("MaxTargetStrength"), -1),
            "maxTargetDefense": num(c.get("MaxTargetDefense"), -1),
            "minOddsOfSuccess": real(c.get("MinOddsOfSuccess")),
            "selfStart": flag(c.get("SelfStart")),
            "mustBeAtWar": flag(c.get("MustBeAtWar")),
            "mustHaveNukes": flag(c.get("MustHaveNukes")),
            "mustHaveUnits": num(c.get("MustHaveUnits"), -1),
            "allowTargetUpdate": flag(c.get("AllowTargetUpdate"), True),
        }
    lists = {}
    for (lt,), c in keyed(rows("AiOperationLists"), "ListType").items():
        lists[lt] = {"base": c.get("BaseList") or None, "ops": []}
    for c in rows("AllowedOperations"):
        lt = c.get("ListType")
        if lt in lists:
            lists[lt]["ops"].append({"def": c["OperationDef"], "remove": flag(c.get("RemoveRef"))})
    leader_lists = {k[0]: c["OperationList"] for k, c in keyed(rows("Leaders"), "LeaderType").items() if c.get("OperationList")}

    items: dict[str, dict[str, int]] = {}
    for c in rows("AiFavoredItems"):
        if not c.get("ListType") or not c.get("Item"):
            continue
        d = items.setdefault(c["ListType"], {})
        d[c["Item"]] = d.get(c["Item"], 0) + num(c.get("Value"))
    strategy_lists: dict[str, list[str]] = {}
    for c in rows("Strategy_Priorities"):
        if c.get("ListType") and c.get("StrategyType"):
            strategy_lists.setdefault(c["ListType"], []).append(c["StrategyType"])
    limits = []
    for c in rows("AiLists"):
        system = c.get("System")
        if system not in ("AiOperationTypes", "PerWarOperationTypes"):
            continue
        lt = c["ListType"]
        limits.append({"list": lt, "system": system, "trait": c.get("LeaderType") or None,
                       "agenda": c.get("AgendaType") or None, "strategies": strategy_lists.get(lt, []),
                       "items": items.get(lt, {})})

    teams: dict[str, list] = {}
    for c in rows("AiOperationTeams"):
        teams.setdefault(c["OperationName"], []).append({
            "team": c["TeamName"],
            "minUnits": num(c.get("MinUnits"), 1),
            "maxUnits": num(c.get("MaxUnits"), -1),
            "initialStrengthAdvantage": real(c.get("InitialStrengthAdvantage")),
            "ongoingStrengthAdvantage": real(c.get("OngoingStrengthAdvantage")),
            "safeRallyPoint": flag(c.get("SafeRallyPoint")),
            "condition": c.get("Condition") or None,
        })
    # the query by OperationName scans the primary-key index (TeamName,
    # OperationName): a team's rows come in TeamName order
    for op in teams:
        teams[op].sort(key=lambda r: r["team"].encode())
    reqs: dict[str, list] = {}
    for (team, ai), c in keyed(rows("OpTeamRequirements"), "TeamName", "AiType").items():
        reqs.setdefault(team, []).append({
            "aiType": ai,
            "min": None if c.get("MinNumber") in (None, "") else num(c["MinNumber"]),
            "max": None if c.get("MaxNumber") in (None, "") else num(c["MaxNumber"]),
            "minPercentage": real(c.get("MinPercentage")),
            "maxPercentage": real(c.get("MaxPercentage"), 1.0),
            "reconsiderWhilePreparing": flag(c.get("ReconsiderWhilePreparing")),
            "dependence": c.get("AiTypeDependence") or None,
        })
    # the query by TeamName walks the primary-key index (TeamName, AiType)
    for t in reqs:
        reqs[t].sort(key=lambda r: r["aiType"].encode())

    triggered = [{"trigger": c["TriggerType"], "tree": c["TreeName"], "operation": c.get("OperationName") or None,
                  "event": c["AIEvent"], "priority": num(c.get("Priority"))} for c in rows("TriggeredBehaviorTrees")]
    # the city-states' triggers (the AiFavoredItems of MinorCivTriggeredTrees,
    # the list MINOR_CIV_DEFAULT_TRAIT binds to the system TriggeredTrees)
    minor_triggers = [c["Item"] for c in rows("AiFavoredItems") if c.get("ListType") == "MinorCivTriggeredTrees" and c.get("Item")]
    # the operations' trees, the triggered operations', the city-states'
    # triggered trees and the barbarian tribes' scouting trees
    # (BarbarianTribes.ScoutingBehaviorTree)
    scouting = {c["ScoutingBehaviorTree"] for c in rows("BarbarianTribes") if c.get("ScoutingBehaviorTree")}
    minor_trees = {t["tree"] for t in triggered if t["trigger"] in minor_triggers}
    tree_names = sorted({d["tree"] for d in defs.values() if d["tree"]} | {t["tree"] for t in triggered if t["operation"]} | scouting
                        | minor_trees)
    node_defs = {k[0]: c for k, c in keyed(rows("NodeDefinitions"), "NodeType").items()}
    data_defs = {(k[0], int(k[1])): c for k, c in keyed(rows("NodeDataDefinitions"), "NodeType", "DefnId").items()}
    tree_nodes: dict[str, list] = {}
    for c in rows("BehaviorTreeNodes"):
        tree_nodes.setdefault(c["TreeName"], []).append(c)
    tree_data: dict[tuple, list] = {}
    for c in rows("TreeData"):
        tree_data.setdefault((c["TreeName"], int(c["NodeId"])), []).append(c)
    def compile_tree(t):
        nodes = []
        for c in sorted(tree_nodes.get(t, []), key=lambda r: int(r["NodeId"])):
            typ = c["NodeType"]
            data = {}
            for d in tree_data.get((t, int(c["NodeId"])), []):
                dd = data_defs.get((typ, int(d["DefnId"])), {})
                name = dd.get("DataName", f"defn{d['DefnId']}")
                cell = {"defn": int(d["DefnId"])}
                if d.get("DefaultData") not in (None, ""):
                    cell["value"] = d["DefaultData"]
                if d.get("Tag") not in (None, ""):
                    cell["tag"] = d["Tag"]
                data[name] = cell
            nodes.append({"id": int(c["NodeId"]), "type": typ, "shape": num(node_defs.get(typ, {}).get("ShapeId"), -1),
                          "jumpTo": num(c.get("JumpTo"), -1) if c.get("JumpTo") not in (None, "") else -1,
                          "data": data})
        return nodes

    trees = {t: compile_tree(t) for t in tree_names}

    # the city events' trees (AiLists of System CityEvents: a list per leader
    # trait, its AiFavoredItems rows an event and the tree's name), the trees
    # the install defines
    city_lists = {}
    for c in rows("AiLists"):
        if c.get("System") == "CityEvents":
            city_lists[c["ListType"]] = c.get("LeaderType") or None
    city_events: dict[str, dict[str, str]] = {lt: {} for lt in city_lists}
    for c in rows("AiFavoredItems"):
        lt = c.get("ListType")
        if lt in city_events and c.get("Item") and c.get("StringVal"):
            city_events[lt][c["Item"]] = c["StringVal"]
    event_types = [k[0] for k in keyed(rows("CityEvents"), "EventType")]
    city_tree_names = sorted({t for ev in city_events.values() for t in ev.values() if t in tree_nodes})
    city_trees = {t: compile_tree(t) for t in city_tree_names}
    trait_lists = {trait: lt for lt, trait in city_lists.items() if trait}

    ai_types = [k[0] for k in keyed(rows("UnitAiTypes"), "AiType")]
    ai_priority = [k[0] for k, c in keyed(rows("UnitAiTypes"), "AiType").items() if str(c.get("Priority", "")).lower() in ("true", "1")]
    unit_ai: dict[str, list[str]] = {}
    for c in rows("UnitAiInfos"):
        unit_ai.setdefault(c["UnitType"], [])
        if c["AiType"] not in unit_ai[c["UnitType"]]:
            unit_ai[c["UnitType"]].append(c["AiType"])

    check_db(reqs, teams, lists)

    def js(x):
        return json.dumps(x, indent=1, sort_keys=False)

    out = [
        "/**",
        " * THE OPERATION TABLES, generated by tools/install/ai_operation_tables.py",
        " * from the layered install (`--check` reports a stale file): the operation",
        " * definitions, lists, limits, teams and team requirements, the behaviour",
        " * trees the operations run, the unit AI types and the triggered trees, each",
        " * in the order the game's loader queries read them. Do not edit.",
        " */",
        "import type { AiOpDef, AiOpLimitList, AiOpList, AiOpTeam, AiTeamReq, AiTriggeredTree } from '../core/operations/types';",
        "import type { AiTreeNode } from '../core/behaviorTree';",
        "",
        f"export const AI_OP_DEFS: Readonly<Record<string, AiOpDef>> = {js(defs)};",
        "",
        f"export const AI_OP_LISTS: Readonly<Record<string, AiOpList>> = {js(lists)};",
        "",
        "/** Leaders.OperationList; a leader without one reads Default_List */",
        f"export const AI_LEADER_OP_LISTS: Readonly<Record<string, string>> = {js(leader_lists)};",
        "",
        f"export const AI_OP_LIMIT_LISTS: readonly AiOpLimitList[] = {js(limits)};",
        "",
        f"export const AI_OP_TEAMS: Readonly<Record<string, readonly AiOpTeam[]>> = {js(teams)};",
        "",
        f"export const AI_TEAM_REQS: Readonly<Record<string, readonly AiTeamReq[]>> = {js(reqs)};",
        "",
        f"export const AI_TREES: Readonly<Record<string, readonly AiTreeNode[]>> = {js(trees)};",
        "",
        "/** UnitAiTypes in rowid order */",
        f"export const AI_UNIT_AI_TYPES: readonly string[] = {js(ai_types)};",
        "",
        "/** UnitAiTypes with Priority */",
        f"export const AI_UNIT_AI_PRIORITY: readonly string[] = {js(ai_priority)};",
        "",
        "/** UnitAiInfos: each unit type's AI types in rowid order */",
        f"export const AI_UNIT_AI: Readonly<Record<string, readonly string[]>> = {js(unit_ai)};",
        "",
        f"export const AI_TRIGGERED_TREES: readonly AiTriggeredTree[] = {js(triggered)};",
        "",
        "/** the city-states' triggers (MinorCivTriggeredTrees) */",
        f"export const AI_MINOR_TRIGGERS: readonly string[] = {js(minor_triggers)};",
        "",
    ]
    city = [
        "/**",
        " * THE CITY EVENTS' BEHAVIOUR TREES, generated by tools/install/ai_operation_tables.py",
        " * from the layered install (`--check` reports a stale file): the CityEvents",
        " * in table order (a city's tree slot is its event's index), each leader",
        " * trait's list of the tree an event starts (AiLists of System CityEvents,",
        " * their AiFavoredItems' StringVal), and the trees those lists name that the",
        " * install defines. Do not edit.",
        " */",
        "import type { AiTreeNode } from '../core/behaviorTree';",
        "",
        "/** CityEvents in table order */",
        f"export const AI_CITY_EVENT_TYPES: readonly string[] = {js(event_types)};",
        "",
        "/** per leader trait its CityEvents list */",
        f"export const AI_CITY_EVENT_LISTS: Readonly<Record<string, string>> = {js(trait_lists)};",
        "",
        "/** per CityEvents list, per event the tree it starts */",
        f"export const AI_CITY_EVENTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {js(city_events)};",
        "",
        f"export const AI_CITY_TREES: Readonly<Record<string, readonly AiTreeNode[]>> = {js(city_trees)};",
        "",
    ]
    return {OUT: "\n".join(out), CITY_OUT: "\n".join(city)}


def check_db(reqs, teams, lists) -> None:
    """the loader's queries on the game's own database return the rows in the
    order written here"""
    if not GAME_DB.exists():
        return
    db = sqlite3.connect(f"file:{GAME_DB}?mode=ro", uri=True)
    for t, rs in reqs.items():
        got = [r[0] for r in db.execute("SELECT REQ.AiType FROM OpTeamRequirements REQ WHERE REQ.TeamName = ?", (t,))]
        want = [r["aiType"] for r in rs]
        if got != want:
            raise SystemExit(f"OpTeamRequirements {t}: the game's query returns {got}, the tables {want}")
    for op, ts in teams.items():
        got = [r[0] for r in db.execute("SELECT TEAM.TeamName FROM AiOperationTeams TEAM WHERE TEAM.OperationName = ?", (op,))]
        want = [x["team"] for x in ts]
        if got != want:
            raise SystemExit(f"AiOperationTeams {op}: the game's query returns {got}, the tables {want}")
    for lt, lst in lists.items():
        got = [r[0] for r in db.execute("SELECT OP.OperationDef FROM AllowedOperations OP WHERE OP.ListType = ? ORDER BY OP.rowid", (lt,))]
        want = [x["def"] for x in lst["ops"]]
        if got != want:
            raise SystemExit(f"AllowedOperations {lt}: the game's query returns {got}, the tables {want}")


def main() -> int:
    files = build()
    if "--check" in sys.argv:
        stale = False
        for path, text in files.items():
            bad = not path.exists() or path.read_text(encoding="utf-8") != text
            print(path.relative_to(ROOT).as_posix(), "STALE" if bad else "OK")
            stale = stale or bad
        return 1 if stale else 0
    for path, text in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {path} ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
