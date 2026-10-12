"""THE CITY EVENTS, THEIR BEHAVIOUR TREES AND THE CONTRACTS on the GPU
(cpu/core/aiCityTrees.ts, aiContracts.ts, behaviorTree.ts; GameCore_XP2
AI/CityBuild.cpp, AI/Contracts.cpp, AI/BehaviorTree): the city AI's state of
a group of seats over the batch (`CityAi`, [B, S, ...] tensors), the events
that start a city's trees, the trees' tick on the interpreter, the contracts
the trees make and the cities and the economic AI take up.

A tree in a slot is the one its seat's list names for the slot's event, so
each slot's nodes are fixed: the tick walks node index by node index over
the games whose walk stands there. A tree's tagged data is one value per tag
(`NONE` for none): an item list holds at most its one item, and of a
contract list only its last id can still be the tree's (a tree adds one only
when none of its list is). Items are the AI tables' rows (units, buildings,
improvements, districts), technologies and civics their indices in the
install's tech and civic lists. The world the events and trees read and act
on is the caller's (`TreeWorld`'s methods over [B] tensors).
"""

from __future__ import annotations

import torch

from .sim_research import _FX

_FX_MIN = -9999 * _FX
NONE = -(1 << 50)

BT_FRESH, BT_SUCCESS, BT_RUNNING, BT_FAILURE, BT_ERROR, BT_SKIPPED = 0, 1, 2, 3, 4, 5
SHAPE_SELECTOR, SHAPE_ACTION, SHAPE_DECISION, SHAPE_DECORATOR = 0, 1, 2, 3

CP_INVALID, CP_CLAIMED, CP_SUBMITTED, CP_ACCEPTED, CP_FAILED, CP_IN_PROGRESS, CP_CANCELLED, CP_COMPLETED = range(8)

SLOT_UNIT_OR_BUILDING, SLOT_DISTRICT, SLOT_IMPROVEMENT, SLOT_DEFENSE = 1, 2, 3, 5
N_SLOTS = 6

# the capacities of a seat's state: contracts, reservations, a tree's units
N_CONTRACTS = 16
N_RESERVATIONS = 8
N_TREE_UNITS = 4

# a contract's goal kind (the techContracts / plotContracts maps)
GOAL_NONE, GOAL_TECH, GOAL_CIVIC, GOAL_PLOT = 0, 1, 2, 3


def _l(x, like: torch.Tensor) -> torch.Tensor:
    if torch.is_tensor(x):
        return x.to(like.dtype) if x.shape == like.shape else x.to(like.dtype).expand_as(like)
    return torch.full_like(like, int(x))


def _b(x, like: torch.Tensor) -> torch.Tensor:
    if torch.is_tensor(x):
        return x.bool() if x.shape == like.shape else x.bool().expand_as(like)
    return torch.full_like(like, bool(x), dtype=torch.bool)


class _Tree:
    """a compiled tree (`compileTree`): its nodes' shape, end, parent and
    children, and their TreeData: per node per data name its tag's index
    and its default"""

    def __init__(self, name: str, rows: list):
        self.name = name
        self.nodes = []
        tags: dict[str, int] = {}
        for i, r in enumerate(rows):
            if r["id"] != i:
                raise ValueError(f"tree {name} has a gap in its NodeIds")
            data = {}
            for k, v in r["data"].items():
                t = v.get("tag")
                if t:
                    tags.setdefault(t, len(tags))
                data[k] = (tags[t] if t else None, v.get("value"))
            self.nodes.append({"index": i, "type": r["type"], "shape": int(r["shape"]),
                               "end": int(r["jumpTo"]) if int(r["jumpTo"]) >= 0 else i + 1,
                               "parent": -1, "first": -1, "last": -1, "data": data})
        stack: list[int] = []
        for n in self.nodes:
            while stack and self.nodes[stack[-1]]["end"] <= n["index"]:
                stack.pop()
            if stack:
                p = self.nodes[stack[-1]]
                n["parent"] = p["index"]
                if p["first"] < 0:
                    p["first"] = n["index"]
                p["last"] = n["index"]
            if n["end"] > n["index"] + 1:
                stack.append(n["index"])
        self.tags = tags
        self.n = len(self.nodes)

    def tag(self, i: int, name: str):
        d = self.nodes[i]["data"].get(name)
        return None if d is None else d[0]

    def value(self, i: int, name: str):
        d = self.nodes[i]["data"].get(name)
        return None if d is None else d[1]

    def flag(self, i: int, name: str):
        v = self.value(i, name)
        if v is None:
            return None
        return v == "1" or v.lower() == "true"

    def int_(self, i: int, name: str):
        v = self.value(i, name)
        if v is None or v == "" or v == "No Value":
            return None
        return int(float(v))


class CityTreeTables:
    """the static tables: the AI rows the trees and contracts read, the
    technologies and civics by install type, the seats' event lists and the
    trees compiled"""

    def __init__(self, rules):
        cb = rules.ai_city_build
        E = cb["engineIndex"]
        self.tech_code = dict(E["tech"])
        self.civic_code = dict(E["civic"])
        self.unit_rows = cb["units"]
        self.building_rows = cb["buildings"]
        self.improvement_rows = cb["improvements"]
        self.district_rows = cb["districts"]
        self.unit_row = {r["type"]: i for i, r in enumerate(self.unit_rows)}
        self.building_row = {r["type"]: i for i, r in enumerate(self.building_rows)}
        self.improvement_row = {r["type"]: i for i, r in enumerate(self.improvement_rows)}
        self.district_row = {r["type"]: i for i, r in enumerate(self.district_rows)}

        def codes(rows):
            t = [self.tech_code.get(r["tech"], -2) if r["tech"] else -1 for r in rows]
            c = [self.civic_code.get(r["civic"], -2) if r["civic"] else -1 for r in rows]
            return torch.tensor(t, dtype=torch.long), torch.tensor(c, dtype=torch.long)
        # per row its prerequisite technology and civic (-1 none; -2 one the
        # install lists that no seat can hold)
        self.u_tech, self.u_civic = codes(self.unit_rows)
        self.b_tech, self.b_civic = codes(self.building_rows)
        self.i_tech, self.i_civic = codes(self.improvement_rows)
        self.d_tech, self.d_civic = codes(self.district_rows)
        u = self.unit_rows
        self.u_combat = torch.tensor([int(r["combat"]) for r in u], dtype=torch.long)
        self.u_charges = torch.tensor([int(r["buildCharges"]) for r in u], dtype=torch.long)
        self.u_sea = torch.tensor([r["domain"] == "DOMAIN_SEA" for r in u], dtype=torch.bool)
        self.u_must_purchase = torch.tensor([bool(r["mustPurchase"]) for r in u], dtype=torch.bool)
        self.u_recon = torch.tensor([bool(r["recon"]) for r in u], dtype=torch.bool)
        self.u_gold = torch.tensor([bool(r["goldPurchase"]) for r in u], dtype=torch.bool)
        b = self.building_rows
        self.b_gold = torch.tensor([bool(r["goldPurchase"]) and not r["wonder"] for r in b], dtype=torch.bool)
        self.b_defensive = torch.tensor([r["defenseModifier"] > 0 or r["outerDefenseStrength"] > 0 for r in b], dtype=torch.bool)
        self.b_must_purchase = torch.zeros(len(b), dtype=torch.bool)
        self.d_defensive = torch.zeros(len(self.district_rows), dtype=torch.bool)
        self.event_types = list(cb["cityEventTypes"])
        self.event_lists = cb["cityEventLists"]
        self.trees = {name: _Tree(name, rows) for name, rows in cb["cityTrees"].items()}

    def trees_of(self, trait: str) -> dict[int, _Tree]:
        """per event slot the tree the trait's list starts there"""
        lst = self.event_lists[trait]
        return {k: self.trees[lst[e]] for k, e in enumerate(self.event_types)
                if e in lst and lst[e] in self.trees}


_TABLES: dict[int, tuple] = {}


def city_tree_tables(rules) -> CityTreeTables:
    """the static tables of the rules, built once"""
    hit = _TABLES.get(id(rules))
    if hit is None or hit[0] is not rules:
        hit = (rules, CityTreeTables(rules))
        _TABLES[id(rules)] = hit
    return hit[1]


class CityAi:
    """THE CITY AI'S STATE of S seats over B games (`CityAi`): per seat its
    event slots, its trees (one per slot: alive, id, node status and memory,
    tagged data, trigger, units), its contracts, the contract each city
    holds in hand, its plot reservations, its contract and tree serials"""

    def __init__(self, tables: CityTreeTables, slot_trees: dict[int, _Tree], B: int, S: int, device):
        self.T = tables
        self.slot_trees = slot_trees
        self.B, self.S = B, S
        dev = self.device = device
        L = torch.long
        N = max([t.n for t in slot_trees.values()] + [1])
        NT = max([len(t.tags) for t in slot_trees.values()] + [1])
        self.slots = torch.full((B, S, N_SLOTS), -1, dtype=L, device=dev)
        # the trees
        self.tr_alive = torch.zeros(B, S, N_SLOTS, dtype=torch.bool, device=dev)
        self.tr_id = torch.full((B, S, N_SLOTS), -1, dtype=L, device=dev)
        self.tr_status = torch.zeros(B, S, N_SLOTS, N, dtype=L, device=dev)
        self.tr_mem_a = torch.full((B, S, N_SLOTS, N), NONE, dtype=L, device=dev)
        self.tr_mem_b = torch.full((B, S, N_SLOTS, N), NONE, dtype=L, device=dev)
        self.tr_bb = torch.full((B, S, N_SLOTS, NT), NONE, dtype=L, device=dev)
        # the trigger: unit, building, district, improvement rows, plot,
        # technology, civic, city
        self.tr_trigger = torch.full((B, S, N_SLOTS, 8), -1, dtype=L, device=dev)
        self.tr_units = torch.full((B, S, N_SLOTS, N_TREE_UNITS), -1, dtype=L, device=dev)
        # the contracts
        C = N_CONTRACTS
        self.c_id = torch.full((B, S, C), -1, dtype=L, device=dev)
        self.c_tree = torch.full((B, S, C), -1, dtype=L, device=dev)
        self.c_unit = torch.full((B, S, C), -1, dtype=L, device=dev)
        self.c_building = torch.full((B, S, C), -1, dtype=L, device=dev)
        self.c_district = torch.full((B, S, C), -1, dtype=L, device=dev)
        self.c_goal_kind = torch.zeros(B, S, C, dtype=L, device=dev)
        self.c_goal = torch.full((B, S, C), -1, dtype=L, device=dev)
        self.c_plot = torch.full((B, S, C), -1, dtype=L, device=dev)
        self.c_value = torch.zeros(B, S, C, dtype=L, device=dev)
        self.c_city = torch.full((B, S, C), -1, dtype=L, device=dev)
        self.c_max_turns = torch.zeros(B, S, C, dtype=L, device=dev)
        self.c_turns = torch.full((B, S, C), -1, dtype=L, device=dev)
        self.c_progress = torch.zeros(B, S, C, dtype=L, device=dev)
        self.c_assign = torch.zeros(B, S, C, dtype=torch.bool, device=dev)
        self.c_queued = torch.zeros(B, S, C, dtype=torch.bool, device=dev)
        # the contract is in its tree's list; the seat's city lists it
        self.c_in_tree = torch.zeros(B, S, C, dtype=torch.bool, device=dev)
        self.c_listed = torch.zeros(B, S, C, dtype=torch.bool, device=dev)
        self.in_hand = torch.full((B, S), -1, dtype=L, device=dev)
        # the plot reservations
        R = N_RESERVATIONS
        self.r_plot = torch.full((B, S, R), -1, dtype=L, device=dev)
        self.r_tree = torch.full((B, S, R), -1, dtype=L, device=dev)
        self.r_value = torch.zeros(B, S, R, dtype=L, device=dev)
        self.c_serial = torch.ones(B, S, dtype=L, device=dev)
        self.t_serial = torch.full((B, S), 100, dtype=L, device=dev)


# -- the seat's book -------------------------------------------------------

def tree_live(ai: CityAi, s: int, tid: torch.Tensor) -> torch.Tensor:
    """[B, ...] the tree of the id runs (`live`)"""
    ids = ai.tr_id[:, s]
    al = ai.tr_alive[:, s]
    shp = tid.shape
    t = tid.reshape(ai.B, -1, 1)
    hit = (ids.unsqueeze(1) == t) & al.unsqueeze(1) & (t >= 0)
    return hit.any(-1).reshape(shp)


def contract_at(ai: CityAi, s: int, cid: torch.Tensor) -> torch.Tensor:
    """[B] the slot of the contract of the id in the book, -1 none"""
    m = (ai.c_id[:, s] == cid.unsqueeze(1)) & (cid.unsqueeze(1) >= 0)
    j = m.long().argmax(dim=1)
    return torch.where(m.any(dim=1), j, torch.full_like(j, -1))


def tree_contract(ai: CityAi, s: int, k: int, cid: torch.Tensor) -> torch.Tensor:
    """[B] the slot of the tree's own contract of the id (`treeContractOf`),
    -1 none"""
    m = ((ai.c_id[:, s] == cid.unsqueeze(1)) & (cid.unsqueeze(1) >= 0) & ai.c_in_tree[:, s]
         & (ai.c_tree[:, s] == ai.tr_id[:, s, k].unsqueeze(1)))
    j = m.long().argmax(dim=1)
    return torch.where(m.any(dim=1), j, torch.full_like(j, -1))


def _cget(plane: torch.Tensor, s: int, j: torch.Tensor) -> torch.Tensor:
    return plane[:, s].gather(1, j.clamp(min=0).unsqueeze(1)).squeeze(1)


def _cset(plane: torch.Tensor, s: int, j: torch.Tensor, v, mask: torch.Tensor) -> None:
    rows = (mask & (j >= 0)).nonzero(as_tuple=True)[0]
    if rows.numel():
        val = v[rows] if torch.is_tensor(v) and v.dim() > 0 else v
        plane[rows, s, j[rows]] = val if torch.is_tensor(val) else torch.as_tensor(val, dtype=plane.dtype, device=plane.device)


def new_contract(ai: CityAi, s: int, mask: torch.Tensor, **f) -> torch.Tensor:
    """the contract made where `mask`, in the book's first free slot, its id
    the seat's next; [B] its slot (-1 where not made)"""
    free = ai.c_id[:, s] < 0
    j = free.long().argmax(dim=1)
    if bool((mask & ~free.any(dim=1)).any()):
        raise RuntimeError("city AI: the contract book is full")
    j = torch.where(mask, j, torch.full_like(j, -1))
    cid = ai.c_serial[:, s].clone()
    ai.c_serial[:, s] += mask.long()
    _cset(ai.c_id, s, j, cid, mask)
    defaults = {"tree": -1, "unit": -1, "building": -1, "district": -1, "goal_kind": GOAL_NONE, "goal": -1, "plot": -1,
                "value": 0, "city": -1, "max_turns": 0, "turns": -1, "progress": CP_CLAIMED}
    for k, d in defaults.items():
        v = f.get(k, d)
        _cset(getattr(ai, "c_" + k), s, j, _l(v, cid), mask)
    for k in ("assign", "queued", "in_tree", "listed"):
        _cset(getattr(ai, "c_" + k), s, j, _b(f.get(k, False), mask), mask)
    return j


def gold_purchasable(ai: CityAi, unit: torch.Tensor, building: torch.Tensor, district: torch.Tensor) -> torch.Tensor:
    """`goldPurchasable`: a unit or a non-wonder building whose PurchaseYield
    is YIELD_GOLD, never a district"""
    T = ai.T
    dev = unit.device
    u_ok = (unit >= 0) & T.u_gold.to(dev)[unit.clamp(min=0)]
    b_ok = (building >= 0) & T.b_gold.to(dev)[building.clamp(min=0)]
    return (district < 0) & torch.where(unit >= 0, u_ok, b_ok)


def contract_eligible(ai: CityAi, s: int, j: torch.Tensor, w) -> torch.Tensor:
    """`contractEligible` of the contract in slot `j` ([B]) and the seat's
    city"""
    T = ai.T
    dev = j.device
    city = _cget(ai.c_city, s, j)
    unit, bld, dist = _cget(ai.c_unit, s, j), _cget(ai.c_building, s, j), _cget(ai.c_district, s, j)
    prog = _cget(ai.c_progress, s, j)
    max_t = _cget(ai.c_max_turns, s, j)
    plot = _cget(ai.c_plot, s, j)
    threat = _b(w.under_threat(), j)
    ok_city = (city == -1) | (city == _l(w.home_city(), j))
    over = (max_t > 0) & (_l(w.build_turns(unit, bld, dist), j) > max_t)
    done = prog == CP_COMPLETED
    # a building
    bq = bld.clamp(min=0)
    b_ok = ~(threat & ~T.b_defensive.to(dev)[bq])
    b_ok = b_ok & ~((prog == CP_IN_PROGRESS) & (_l(w.cur_building(), j) != bld)) & ~over
    b_ok = b_ok & (done | (~_b(w.building_blocked(bq), j) & ~T.b_must_purchase.to(dev)[bq]))
    # a district
    dq = dist.clamp(min=0)
    d_ok = ~(threat & ~T.d_defensive.to(dev)[dq])
    d_ok = d_ok & ~((prog == CP_IN_PROGRESS) & (_l(w.cur_district(), j) != dist)) & ~over
    d_ok = d_ok & (done | ~_b(w.district_blocked(dq, plot), j))
    # a unit
    uq = unit.clamp(min=0)
    combat = T.u_combat.to(dev)[uq]
    cur_u = _l(w.cur_unit(), j)
    u_ok = ~((prog == CP_SUBMITTED) & (combat == 0) & (cur_u == unit))
    u_ok = u_ok & ~(threat & ((combat == 0) | (T.u_charges.to(dev)[uq] > 0) | T.u_recon.to(dev)[uq]))
    u_ok = u_ok & ~(T.u_sea.to(dev)[uq] & ~_b(w.trains_sea(), j))
    u_ok = u_ok & ~((prog == CP_IN_PROGRESS) & (cur_u != unit)) & ~over
    u_ok = u_ok & (done | (~T.u_must_purchase.to(dev)[uq] & _b(w.can_train(uq), j)))
    ok = torch.where(bld >= 0, b_ok, torch.where(dist >= 0, d_ok, (unit >= 0) & u_ok))
    return ok_city & ok & (j >= 0)


def contract_evaluate(ai: CityAi, s: int, j: torch.Tensor, w, mask: torch.Tensor) -> torch.Tensor:
    """`contractEvaluate` where `mask`: its value the higher of its own and
    the city's of the item, its turns the city's; [B] the city produces the
    item"""
    unit, bld, dist = _cget(ai.c_unit, s, j), _cget(ai.c_building, s, j), _cget(ai.c_district, s, j)
    v = torch.maximum(_cget(ai.c_value, s, j), _l(w.item_value(unit, bld, dist, _cget(ai.c_plot, s, j)), j))
    _cset(ai.c_value, s, j, v, mask)
    _cset(ai.c_turns, s, j, _l(w.build_turns(unit, bld, dist), j), mask)
    off_b = (bld >= 0) & (_l(w.cur_building(), j) != bld)
    off_u = (unit >= 0) & (_l(w.cur_unit(), j) != unit)
    return ~off_b & ~off_u


def submit_contract(ai: CityAi, s: int, j: torch.Tensor, w, turn: int, mask: torch.Tensor) -> None:
    """`submitContract` where `mask`: SUBMITTED; the seat's city lists it
    where it may take it, clearing its production where the contract's value
    passes the item's it set this turn or the one before; any taker (the
    city, the economic AI's gold purchase) makes it ACCEPTED"""
    _cset(ai.c_progress, s, j, CP_SUBMITTED, mask)
    unit, bld, dist = _cget(ai.c_unit, s, j), _cget(ai.c_building, s, j), _cget(ai.c_district, s, j)
    taken = gold_purchasable(ai, unit, bld, dist)
    el = mask & contract_eligible(ai, s, j, w)
    _cset(ai.c_listed, s, j, True, el)
    clear = el & (_cget(ai.c_value, s, j) > _l(w.current_value(), j)) & (_l(w.production_turn(), j) + 1 >= turn)
    if bool(clear.any()):
        w.clear_production(clear)
    taken = mask & (taken | el)
    _cset(ai.c_progress, s, j, CP_ACCEPTED, taken)


def city_contracts(ai: CityAi, s: int, w, mask: torch.Tensor) -> torch.Tensor:
    """`cityContracts` where `mask`: each contract the city lists, in
    arrival order — an ACCEPTED one it may still take valued and the one in
    hand the higher valued; any other leaves the list. [B] the slot of the
    contract in hand after, -1 none"""
    order = torch.where(ai.c_listed[:, s] & (ai.c_id[:, s] >= 0), ai.c_id[:, s], torch.full_like(ai.c_id[:, s], 1 << 40))
    idx = order.argsort(dim=1)
    for r in range(N_CONTRACTS):
        j = idx[:, r]
        on = mask & (_cget(ai.c_listed, s, j)) & (_cget(ai.c_id, s, j) >= 0)
        if not bool(on.any()):
            continue
        take = on & (_cget(ai.c_progress, s, j) == CP_ACCEPTED) & contract_eligible(ai, s, j, w)
        contract_evaluate(ai, s, j, w, take)
        held = contract_at(ai, s, ai.in_hand[:, s])
        better = take & ((held < 0) | (_cget(ai.c_value, s, held) < _cget(ai.c_value, s, j)))
        ai.in_hand[:, s] = torch.where(better, _cget(ai.c_id, s, j), ai.in_hand[:, s])
        _cset(ai.c_listed, s, j, False, on & ~take)
    return torch.where(mask, contract_at(ai, s, ai.in_hand[:, s]), torch.full_like(ai.in_hand[:, s], -1))


def takes_turn(ai: CityAi, s: int, j: torch.Tensor, unit_value, project_value) -> torch.Tensor:
    """`takesTurn`: the contract valued at least the best unit's less 1.0 and
    the best project's"""
    v = _cget(ai.c_value, s, j)
    return (j >= 0) & (v >= _l(unit_value, v) - _FX) & (v >= _l(project_value, v))


def queue_contract(ai: CityAi, s: int, j: torch.Tensor, w, queued: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    """`queueContract` where `mask`: IN PROGRESS; the queue refusing it
    (`queued` false) FAILS it; else bound to the city and its completion
    connected. [B] queued"""
    _cset(ai.c_progress, s, j, CP_IN_PROGRESS, mask)
    _cset(ai.c_progress, s, j, CP_FAILED, mask & ~queued)
    ok = mask & queued
    _cset(ai.c_city, s, j, _l(w.home_city(), j), ok)
    _cset(ai.c_queued, s, j, True, ok)
    return ok


def in_hand_check(ai: CityAi, s: int, w, mask: torch.Tensor) -> None:
    """`inHandCheck` where `mask`: the contract in hand the city may no longer
    take CANCELLED, its production cleared; one the city no longer produces
    FAILED unless COMPLETED; the hand empties in each case"""
    j = contract_at(ai, s, ai.in_hand[:, s])
    none = mask & (j < 0)
    ai.in_hand[:, s] = torch.where(none, torch.full_like(j, -1), ai.in_hand[:, s])
    on = mask & (j >= 0)
    el = contract_eligible(ai, s, j, w)
    lost = on & ~el
    _cset(ai.c_progress, s, j, CP_CANCELLED, lost)
    keep = on & el
    producing = contract_evaluate(ai, s, j, w, keep)
    off = keep & ~producing
    _cset(ai.c_progress, s, j, CP_FAILED, off & (_cget(ai.c_progress, s, j) != CP_COMPLETED))
    cancelled = keep & producing & (_cget(ai.c_progress, s, j) == CP_CANCELLED)
    clear = lost | cancelled
    if bool(clear.any()):
        w.clear_production(clear)
    ai.in_hand[:, s] = torch.where(lost | off | cancelled, torch.full_like(j, -1), ai.in_hand[:, s])


def contract_built(ai: CityAi, s: int, city_id, unit: torch.Tensor, building: torch.Tensor, district: torch.Tensor,
                   unit_id: torch.Tensor, mask: torch.Tensor) -> None:
    """`contractBuilt` where `mask`: each queued contract for the item bound
    to the city (a unit's, or to none) ACCEPTED or IN PROGRESS (a building's
    or district's any progress) COMPLETED; a unit's contract hands the unit
    to its tree"""
    cid = _l(city_id, unit).unsqueeze(1)
    q = ai.c_queued[:, s] & mask.unsqueeze(1) & (ai.c_id[:, s] >= 0)
    prog = ai.c_progress[:, s]
    is_u = (unit >= 0).unsqueeze(1)
    hit_u = (q & is_u & (ai.c_unit[:, s] == unit.unsqueeze(1)) & ((ai.c_city[:, s] == -1) | (ai.c_city[:, s] == cid))
             & ((prog == CP_ACCEPTED) | (prog == CP_IN_PROGRESS)))
    same = (((building >= 0).unsqueeze(1) & (ai.c_building[:, s] == building.unsqueeze(1)))
            | ((district >= 0).unsqueeze(1) & (ai.c_district[:, s] == district.unsqueeze(1))))
    hit_o = q & ~is_u & same & (ai.c_city[:, s] == cid)
    ai.c_progress[:, s] = torch.where(hit_u | hit_o, torch.full_like(prog, CP_COMPLETED), prog)
    give = hit_u & ai.c_assign[:, s]
    if bool(give.any()):
        for j in range(N_CONTRACTS):
            g = give[:, j]
            if not bool(g.any()):
                continue
            k = (ai.tr_id[:, s] == ai.c_tree[:, s, j].unsqueeze(1)).long().argmax(dim=1)
            has = (ai.tr_id[:, s] == ai.c_tree[:, s, j].unsqueeze(1)).any(dim=1)
            _tree_take_unit(ai, s, k, unit_id, g & has)


def _tree_take_unit(ai: CityAi, s: int, k: torch.Tensor, uid: torch.Tensor, mask: torch.Tensor) -> None:
    """the unit joins the tree in slot `k` ([B]) where `mask`"""
    rows = mask.nonzero(as_tuple=True)[0]
    for b in rows.tolist():
        kk = int(k[b])
        us = ai.tr_units[b, s, kk]
        if bool((us == uid[b]).any()):
            continue
        free = (us < 0).nonzero(as_tuple=True)[0]
        if not free.numel():
            raise RuntimeError("city AI: a tree holds too many units")
        ai.tr_units[b, s, kk, int(free[0])] = uid[b]


def reap_contracts(ai: CityAi, s: int) -> None:
    """`reapContracts`: a contract lives while its tree runs and holds it, or
    the city has it in hand"""
    in_tree = ai.c_in_tree[:, s] & tree_live(ai, s, ai.c_tree[:, s])
    keep = in_tree | (ai.c_id[:, s] == ai.in_hand[:, s].unsqueeze(1))
    gone = (ai.c_id[:, s] >= 0) & ~keep
    ai.c_id[:, s] = torch.where(gone, torch.full_like(ai.c_id[:, s], -1), ai.c_id[:, s])
    ai.c_listed[:, s] &= ~gone
    ai.c_in_tree[:, s] &= ~gone
    ai.c_queued[:, s] &= ~gone


def goals_reached(ai: CityAi, s: int, w, mask: torch.Tensor) -> None:
    """`goalsReached` where `mask`: the tech and civic contracts whose goal
    the seat holds COMPLETED, the one under research IN PROGRESS (CLAIMED
    again off it), the plot contracts whose plot it owns COMPLETED"""
    m = mask.unsqueeze(1) & (ai.c_id[:, s] >= 0)
    prog = ai.c_progress[:, s]
    kind = ai.c_goal_kind[:, s]
    goal = ai.c_goal[:, s]
    held = torch.where(kind == GOAL_TECH, _b(w.tech_held(goal), goal), _b(w.civic_held(goal), goal))
    res = torch.where(kind == GOAL_TECH, _b(w.researching_tech(goal), goal), _b(w.researching_civic(goal), goal))
    tc = m & ((kind == GOAL_TECH) | (kind == GOAL_CIVIC)) & ((prog == CP_CLAIMED) | (prog == CP_IN_PROGRESS))
    new = torch.where(held, CP_COMPLETED, torch.where(res, CP_IN_PROGRESS, CP_CLAIMED))
    prog = torch.where(tc, new, prog)
    pc = m & (kind == GOAL_PLOT) & ((prog == CP_CLAIMED) | (prog == CP_ACCEPTED)) & _b(w.owns(ai.c_plot[:, s]), goal)
    ai.c_progress[:, s] = torch.where(pc, torch.full_like(prog, CP_COMPLETED), prog)


# -- the events -----------------------------------------------------------

def slot_free(ai: CityAi, s: int, slot: int) -> torch.Tensor:
    return ai.slots[:, s, slot] == -1


def free_slots(ai: CityAi, s: int, w, mask: torch.Tensor) -> None:
    """`freeSlots` where `mask`: a slot whose tree no longer runs empties
    (the defence slot's an operation's)"""
    sl = ai.slots[:, s]
    for i in range(N_SLOTS):
        held = mask & (sl[:, i] != -1)
        if not bool(held.any()):
            continue
        live = _b(w.operation_live(sl[:, i]), held) if i == SLOT_DEFENSE else tree_live(ai, s, sl[:, i])
        sl[:, i] = torch.where(held & ~live, torch.full_like(sl[:, i], -1), sl[:, i])


def start_tree(ai: CityAi, s: int, slot: int, trigger: list, mask: torch.Tensor) -> None:
    """the slot's tree started where `mask` on its trigger ([unit, building,
    district, improvement, plot, tech, civic, city], each [B] or a number)"""
    if not bool(mask.any()):
        return
    tid = ai.t_serial[:, s].clone()
    ai.t_serial[:, s] += mask.long()
    m = mask
    ai.tr_alive[:, s, slot] |= m
    ai.tr_id[:, s, slot] = torch.where(m, tid, ai.tr_id[:, s, slot])
    for plane, v in ((ai.tr_status, BT_FRESH), (ai.tr_mem_a, NONE), (ai.tr_mem_b, NONE), (ai.tr_bb, NONE), (ai.tr_units, -1)):
        x = plane[:, s, slot]
        x[:] = torch.where(m.unsqueeze(1), torch.full_like(x, v), x)
    trig = torch.stack([_l(t, tid) for t in trigger], dim=1)
    ai.tr_trigger[:, s, slot] = torch.where(m.unsqueeze(1), trig, ai.tr_trigger[:, s, slot])
    ai.slots[:, s, slot] = torch.where(m, tid, ai.slots[:, s, slot])


def _prereqs(ai: CityAi, kind: str, row: torch.Tensor):
    T = ai.T
    dev = row.device
    tech, civic = {"unit": (T.u_tech, T.u_civic), "building": (T.b_tech, T.b_civic),
                   "improvement": (T.i_tech, T.i_civic), "district": (T.d_tech, T.d_civic)}[kind]
    r = row.clamp(min=0)
    t = torch.where(row >= 0, tech.to(dev)[r], torch.full_like(row, -1))
    c = torch.where(row >= 0, civic.to(dev)[r], torch.full_like(row, -1))
    return t, c


def _lacking(w, t: torch.Tensor, c: torch.Tensor):
    """the technology and civic of the pair the seat lacks, -1 where none"""
    t_l = (t != -1) & ~_b(w.tech_held(t), t)
    c_l = (c != -1) & ~_b(w.civic_held(c), c)
    return torch.where(t_l, t, torch.full_like(t, -1)), torch.where(c_l, c, torch.full_like(c, -1))


def _held_pair(w, t: torch.Tensor, c: torch.Tensor) -> torch.Tensor:
    return ((t == -1) | _b(w.tech_held(t), t)) & ((c == -1) | _b(w.civic_held(c), c))


def defense_event(ai: CityAi, s: int, w, operation: str | None, mask: torch.Tensor) -> None:
    """`defenseEvent` where `mask`: a threatened city with its slot free
    starts the list's operation at its plot, the slot holding its tree"""
    if not operation:
        return
    go = mask & (_l(w.threat(), ai.slots[:, s, 0]) > -1) & slot_free(ai, s, SLOT_DEFENSE)
    if not bool(go.any()):
        return
    tree = _l(w.start_operation(operation, w.city_plot(), go), ai.slots[:, s, 0])
    ok = go & (tree != -1)
    ai.slots[:, s, SLOT_DEFENSE] = torch.where(ok, tree, ai.slots[:, s, SLOT_DEFENSE])


def building_event(ai: CityAi, s: int, w, mask: torch.Tensor) -> None:
    """`buildingEvent` where `mask`: with its slot free, the event's best
    building where valued at least the best defensive unit's, else that
    unit, starts the slot's tree, with its technology and civic the seat
    lacks"""
    if SLOT_UNIT_OR_BUILDING not in ai.slot_trees:
        return
    go = mask & slot_free(ai, s, SLOT_UNIT_OR_BUILDING)
    bi, bv = w.event_building()
    ui, uv = w.event_unit()
    like = ai.slots[:, s, 0]
    bi, bv, ui, uv = _l(bi, like), _l(bv, like), _l(ui, like), _l(uv, like)
    take_b = go & (bi != -1) & (bv >= uv)
    take_u = go & ~take_b & (ui != -1)
    bt, bc = _lacking(w, *_prereqs(ai, "building", torch.where(take_b, bi, torch.full_like(bi, -1))))
    ut, uc = _lacking(w, *_prereqs(ai, "unit", torch.where(take_u, ui, torch.full_like(ui, -1))))
    neg = torch.full_like(like, -1)
    start_tree(ai, s, SLOT_UNIT_OR_BUILDING, [
        torch.where(take_u, ui, neg), torch.where(take_b, bi, neg), neg, neg, neg,
        torch.where(take_b, bt, ut), torch.where(take_b, bc, uc), _l(w.home_city(), like)], take_b | take_u)


def _reserved(ai: CityAi, s: int, plots: torch.Tensor):
    """per plot ([B, P]) a reservation a running tree holds there, and its
    value (FX(-9999) where none)"""
    rp = ai.r_plot[:, s]
    live = tree_live(ai, s, ai.r_tree[:, s]) & (rp >= 0)
    hit = (plots.unsqueeze(-1) == rp.unsqueeze(1)) & live.unsqueeze(1)
    val = torch.where(hit, ai.r_value[:, s].unsqueeze(1), torch.full_like(hit, _FX_MIN, dtype=torch.long))
    return hit.any(-1), torch.where(hit.any(-1), val.max(-1).values, torch.full_like(plots, _FX_MIN))


def best_plot_for(ai: CityAi, s: int, w, imp: torch.Tensor) -> torch.Tensor:
    """`bestPlotFor`: [B] the evaluation index valuing the improvement highest
    among the owned, improvable ones no running tree reserves (the first on a
    tie), above FX(-9999); -1 none"""
    ev = w.evals()
    res, _ = _reserved(ai, s, ev["plot"])
    ok = ev["valid"] & ev["owned"] & ev["improvable"] & ~res
    v = ev["imps"].gather(2, imp.clamp(min=0).view(-1, 1, 1).expand(-1, ev["imps"].shape[1], 1)).squeeze(2)
    ok = ok & (v > _FX_MIN) & (imp >= 0).unsqueeze(1)
    key = torch.where(ok, v, torch.full_like(v, NONE))
    j = key.argmax(dim=1)
    return torch.where(ok.any(dim=1), j, torch.full_like(j, -1))


def improvement_event(ai: CityAi, s: int, w, best_improvement: torch.Tensor, mask: torch.Tensor) -> None:
    """`improvementEvent` where `mask`: with its slot free, the improvement
    the city picked, at its best plot, valued above 0 there, starts the
    slot's tree"""
    if SLOT_IMPROVEMENT not in ai.slot_trees:
        return
    go = mask & slot_free(ai, s, SLOT_IMPROVEMENT) & (best_improvement != -1)
    if not bool(go.any()):
        return
    ev = w.evals()
    j = best_plot_for(ai, s, w, best_improvement)
    v = ev["imps"].gather(1, j.clamp(min=0).view(-1, 1, 1).expand(-1, 1, ev["imps"].shape[2])).squeeze(1)
    v = v.gather(1, best_improvement.clamp(min=0).unsqueeze(1)).squeeze(1)
    go = go & (j >= 0) & (v > 0)
    plot = ev["plot"].gather(1, j.clamp(min=0).unsqueeze(1)).squeeze(1)
    neg = torch.full_like(plot, -1)
    start_tree(ai, s, SLOT_IMPROVEMENT, [neg, neg, neg, best_improvement, plot, neg, neg, _l(w.home_city(), plot)], go)


def choose_district(ai: CityAi, s: int, w, mask: torch.Tensor):
    """`chooseDistrict` where `mask`: over the evaluations a district may
    stand on, owned or beside an owned plot, the district valued highest
    above the plot's reservation by a running tree; an equal value draws 2
    (`w.district_tie`), a 1 taking it. ([B] district row, [B] plot), -1
    none"""
    ev = w.evals()
    _, floor = _reserved(ai, s, ev["plot"])
    dv = ev["dists"]
    B, P, ND = dv.shape
    plot_ok = ev["valid"] & ev["district_ok"] & (ev["owned"] | ev["near_owned"])
    elig = mask.view(B, 1, 1) & plot_ok.unsqueeze(2) & (dv > floor.unsqueeze(2))
    flat_v = dv.reshape(B, P * ND)
    flat_e = elig.reshape(B, P * ND)
    best = torch.full((B,), _FX_MIN, dtype=torch.long, device=dv.device)
    pick = torch.full((B,), -1, dtype=torch.long, device=dv.device)
    cols = flat_e.any(dim=0).nonzero(as_tuple=True)[0].tolist()
    for k in cols:
        v = flat_v[:, k]
        e = flat_e[:, k] & (v >= best)
        tie = e & (v == best)
        if bool(tie.any()):
            d = _l(w.district_tie(tie), v)
            e = e & ~(tie & (d == 0))
        best = torch.where(e, v, best)
        pick = torch.where(e, torch.full_like(pick, k), pick)
    plot = ev["plot"].gather(1, (pick.clamp(min=0) // ND).unsqueeze(1)).squeeze(1)
    return torch.where(pick >= 0, pick % ND, pick), torch.where(pick >= 0, plot, pick)


def district_event(ai: CityAi, s: int, w, mask: torch.Tensor) -> None:
    """`districtEvent` where `mask`: with its slot free, the district the
    choice names starts the slot's tree at its plot, with its technology and
    civic the seat lacks"""
    if SLOT_DISTRICT not in ai.slot_trees:
        return
    go = mask & slot_free(ai, s, SLOT_DISTRICT)
    if not bool(go.any()):
        return
    d, plot = choose_district(ai, s, w, go)
    go = go & (d >= 0)
    t, c = _lacking(w, *_prereqs(ai, "district", torch.where(go, d, torch.full_like(d, -1))))
    neg = torch.full_like(d, -1)
    start_tree(ai, s, SLOT_DISTRICT, [neg, neg, d, neg, plot, t, c, _l(w.home_city(), d)], go)


def pick_improvement(ai: CityAi, s: int, w, mask: torch.Tensor) -> torch.Tensor:
    """`pickImprovement` where `mask`: over the owned plots in order, each
    plot's best improvement valued 0 or more — the first plot's, then a later
    plot's higher one; while none picked is researched any plot's replaces
    it, after one is researched only a higher researched one — of an
    improvement a Builder can make. [B] its row, -1 none"""
    ev = w.evals()
    imps = ev["imps"]
    B, P, _ = imps.shape
    res, _ = _reserved(ai, s, ev["plot"])
    v = torch.where(imps >= 0, imps, torch.full_like(imps, NONE))
    bv_all = v.max(dim=2).values
    bi_all = v.argmax(dim=2)
    has = (bv_all > NONE) & ev["improvable"]
    bi_all = torch.where(has, bi_all, torch.full_like(bi_all, -1))
    bv_all = torch.where(has, bv_all, torch.full_like(bv_all, _FX_MIN))
    best = torch.full((B,), _FX_MIN, dtype=torch.long, device=imps.device)
    pick = torch.full((B,), -1, dtype=torch.long, device=imps.device)
    researched = torch.zeros(B, dtype=torch.bool, device=imps.device)
    t_all, c_all = _prereqs(ai, "improvement", bi_all.reshape(-1))
    t_all, c_all = t_all.view(B, P), c_all.view(B, P)
    for p in range(P):
        bi, bv = bi_all[:, p], bv_all[:, p]
        on = mask & ev["valid"][:, p] & ev["owned"][:, p] & ~res[:, p]
        on = on & ~((bv <= best) & (researched | (bi == -1))) & (bi != -1)
        if not bool(on.any()):
            continue
        held = _held_pair(w, t_all[:, p], c_all[:, p])
        on = on & ~(researched & ~held) & (_l(w.builder_type(bi), bi) >= 0)
        researched = torch.where(on, held, researched)
        pick = torch.where(on, bi, pick)
        best = torch.where(on, bv, best)
    return pick


# -- the trees' tick ------------------------------------------------------

class _Ctx:
    """one slot's tree of one seat, over the games whose tree ticks"""

    def __init__(self, ai: CityAi, s: int, k: int, w, turn: int):
        self.ai, self.s, self.k, self.w, self.turn = ai, s, k, w, turn
        self.tree: _Tree = ai.slot_trees[k]
        self.st = ai.tr_status[:, s, k]
        self.ma = ai.tr_mem_a[:, s, k]
        self.mb = ai.tr_mem_b[:, s, k]
        self.bb = ai.tr_bb[:, s, k]
        self.ref = ai.tr_id[:, s, k]

    def tag(self, i: int, name: str) -> torch.Tensor:
        t = self.tree.tag(i, name)
        return torch.full_like(self.ref, NONE) if t is None else self.bb[:, t].clone()

    def set_tag(self, i: int, name: str, v, mask: torch.Tensor) -> None:
        t = self.tree.tag(i, name)
        if t is not None:
            self.bb[:, t] = torch.where(mask, _l(v, self.ref), self.bb[:, t])

    def tree_contract(self, cid: torch.Tensor) -> torch.Tensor:
        return tree_contract(self.ai, self.s, self.k, cid)

    def units(self):
        """the world's units of the seat: id, AI row, plot, charges, valid
        ([B, U] each)"""
        return self.w.units()

    def tree_units(self) -> torch.Tensor:
        """[B, U] the world's units the tree holds"""
        u = self.units()
        held = self.ai.tr_units[:, self.s, self.k]
        return u["valid"] & (u["id"].unsqueeze(2) == held.unsqueeze(1)).any(-1) & (u["id"] >= 0)


def _first(mask: torch.Tensor):
    """[B] the first column set, -1 none"""
    j = mask.long().argmax(dim=1)
    return torch.where(mask.any(dim=1), j, torch.full_like(j, -1))


def _pick(plane: torch.Tensor, j: torch.Tensor) -> torch.Tensor:
    return torch.where(j >= 0, plane.gather(1, j.clamp(min=0).unsqueeze(1)).squeeze(1), torch.full_like(j, -1))


def _whole_eval(ev: dict, key: str, plot: torch.Tensor, row: torch.Tensor) -> torch.Tensor:
    """the evaluation of the plot's value of the row, whole; FX(-9999) whole
    where none"""
    hit = ev["valid"] & (ev["plot"] == plot.unsqueeze(1))
    j = _first(hit)
    tab = ev[key]
    v = tab.gather(1, j.clamp(min=0).view(-1, 1, 1).expand(-1, 1, tab.shape[2])).squeeze(1)
    v = v.gather(1, row.clamp(min=0).unsqueeze(1)).squeeze(1)
    return torch.where((j >= 0) & (row >= 0), v, torch.full_like(v, _FX_MIN)) >> 8


def _u_decode(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """DECODE TRIGGER (0x7f2970)"""
    ai, s, k, w = c.ai, c.s, c.k, c.w
    tr = ai.tr_trigger[:, s, k]
    unit, bld, dist, imp, plot, tech, civic, city = (tr[:, x] for x in range(8))
    value = torch.zeros_like(unit)
    decoded = torch.zeros_like(at)
    tab_b, tab_u = w.tables()
    neg = torch.full_like(unit, _FX_MIN)
    has = unit >= 0
    c.set_tag(i, "Trigger Units", unit, at & has)
    value = value + torch.where(has, torch.where(has, tab_u.gather(1, unit.clamp(min=0).unsqueeze(1)).squeeze(1), neg) >> 8, 0)
    decoded = decoded | has
    has = bld >= 0
    c.set_tag(i, "Trigger Buildings", bld, at & has)
    value = value + torch.where(has, tab_b.gather(1, bld.clamp(min=0).unsqueeze(1)).squeeze(1) >> 8, 0)
    decoded = decoded | has
    ev = w.evals()
    has = imp >= 0
    c.set_tag(i, "Trigger Improvements", imp, at & has)
    value = value + torch.where(has, _whole_eval(ev, "imps", plot, imp), 0)
    decoded = decoded | has
    has = dist >= 0
    c.set_tag(i, "Trigger District", dist, at & has)
    value = value + torch.where(has, _whole_eval(ev, "dists", plot, dist), 0)
    decoded = decoded | has
    c.set_tag(i, "Trigger City", city, at)
    c.set_tag(i, "Trigger Location", plot, at & (plot >= 0))
    c.set_tag(i, "Trigger Tech", torch.where(tech >= 0, tech, NONE), at)
    c.set_tag(i, "Trigger Civic", torch.where(civic >= 0, civic, NONE), at)
    c.set_tag(i, "Trigger Value", value, at)
    return torch.where(~decoded & (value <= 0), BT_FAILURE, BT_SUCCESS)


def _goal_of(c: _Ctx, i: int):
    """ADD GOAL TECH's first technology and civic the desired items need that
    the seat lacks (NONE none)"""
    w = c.w
    tech = torch.full_like(c.ref, NONE)
    civic = torch.full_like(c.ref, NONE)
    for name, kind in (("Desired Units", "unit"), ("Desired Buildings", "building"), ("Desired Improvements", "improvement")):
        row = c.tag(i, name)
        row = torch.where(row == NONE, -1, row)
        t, cv = _lacking(w, *_prereqs(c.ai, kind, row))
        tech = torch.where((tech == NONE) & (t >= 0), t, tech)
        civic = torch.where((civic == NONE) & (cv >= 0), cv, civic)
    t = c.tag(i, "Desired Techs")
    t_l = (t != NONE) & ~_b(w.tech_held(torch.where(t == NONE, -1, t)), t)
    tech = torch.where((tech == NONE) & t_l, t, tech)
    cv = c.tag(i, "Desired Civics")
    c_l = (cv != NONE) & ~_b(w.civic_held(torch.where(cv == NONE, -1, cv)), cv)
    civic = torch.where((civic == NONE) & c_l, cv, civic)
    return tech, civic


def _u_add_goal_tech(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """ADD GOAL TECH (0x7e7d20)"""
    tech, civic = _goal_of(c, i)
    c.ma[:, i] = torch.where(at, tech, c.ma[:, i])
    c.mb[:, i] = torch.where(at, civic, c.mb[:, i])
    return torch.where((tech == NONE) & (civic == NONE), BT_SUCCESS, BT_RUNNING)


def _x_add_goal_tech(c: _Ctx, i: int, at: torch.Tensor) -> None:
    """ADD GOAL TECH's execution (0x7e7200): a CLAIMED contract on its goal,
    where the tree holds none of the tag's"""
    tech, civic = c.ma[:, i], c.mb[:, i]
    go = at & ((tech != NONE) | (civic != NONE))
    go = go & (c.tree_contract(c.tag(i, "Contract ID")) < 0)
    if not bool(go.any()):
        return
    val = c.tag(i, "Tech Value")
    val = torch.where(val == NONE, 0, val) * _FX
    kind = torch.where(tech != NONE, GOAL_TECH, GOAL_CIVIC)
    goal = torch.where(tech != NONE, tech, civic)
    j = new_contract(c.ai, c.s, go, tree=c.ref, goal_kind=kind, goal=goal, value=val, progress=CP_CLAIMED, in_tree=True)
    c.set_tag(i, "Contract ID", _cget(c.ai.c_id, c.s, j), go)


def _u_reserve_plot(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """RESERVE PLOT (0x7f7da0)"""
    ai, s, w = c.ai, c.s, c.w
    plot = c.tag(i, "Plot to reserve")
    none = (plot == NONE) | (plot < 0)
    p = torch.where(none, 0, plot)
    owner = _l(w.plot_city(p), p)
    no_city = ~none & (owner != _l(w.home_city(), p))
    val = c.tag(i, "Value")
    val = torch.where(val == NONE, 0, val) * _FX
    rp = ai.r_plot[:, s]
    hit = (rp == p.unsqueeze(1)) & (rp >= 0)
    j = _first(hit)
    rt = _pick(ai.r_tree[:, s], j)
    rv = torch.where(j >= 0, ai.r_value[:, s].gather(1, j.clamp(min=0).unsqueeze(1)).squeeze(1), 0)
    blocked = (j >= 0) & (rt != c.ref) & tree_live(ai, s, rt) & (val <= rv + 20 * _FX)
    go = at & ~none & ~no_city & ~blocked
    free = _first(rp < 0)
    j2 = torch.where(j >= 0, j, free)
    if bool((go & (j2 < 0)).any()):
        raise RuntimeError("city AI: the reservations are full")
    _cset(ai.r_plot, s, j2, p, go)
    _cset(ai.r_tree, s, j2, c.ref, go)
    _cset(ai.r_value, s, j2, val, go)
    return torch.where(none, BT_SUCCESS, torch.where(no_city, BT_ERROR, torch.where(blocked, BT_FAILURE, BT_SUCCESS)))


def _u_check_plot(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """CHECK PLOT (0x7f6ea0)"""
    w = c.w
    plot = c.tag(i, "Plot To Check")
    none = (plot == NONE) | (plot < 0)
    p = torch.where(none, 0, plot)
    d = c.tag(i, "Building Districts")
    has_d = d != NONE
    d_ok = _b(w.can_place_district(p, torch.where(has_d, d, -1)), p)
    imp = c.tag(i, "Building Improvements")
    has_i = imp != NONE
    imp_r = torch.where(has_i, imp, -1)
    builder = _l(w.builder_type(imp_r), p)
    ok_b = has_i & (builder >= 0)
    go = at & ~none & ~has_d & ok_b
    c.set_tag(i, "Builder List", builder, go)
    c.set_tag(i, "Plot To Move", p, go)
    i_ok = _b(w.can_improve(p, imp_r), p)
    st = torch.where(has_d, torch.where(d_ok, BT_SUCCESS, BT_FAILURE),
                     torch.where(ok_b & i_ok, BT_SUCCESS, BT_FAILURE))
    return torch.where(none, BT_FAILURE, st)


def _u_find_unit(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """FIND AVAILABLE UNIT (0x7ec7b0)"""
    ai, s, w = c.ai, c.s, c.w
    want = c.tag(i, "Desired Units")
    one = c.tree.value(i, "Unit Type")
    one_r = ai.T.unit_row.get(one, -9) if one else -9
    if (want == NONE).all() and one_r == -9:
        return torch.full_like(c.ref, BT_ERROR)
    u = c.units()
    typ = u["type"]
    match = (typ == want.unsqueeze(1)) & (want != NONE).unsqueeze(1)
    if one_r != -9:
        match = match | (typ == one_r)
    match = match & u["valid"]
    mine = c.tree_units() & match
    found = _first(mine)
    # the units no running tree holds
    held = torch.zeros_like(u["valid"])
    for kk in range(N_SLOTS):
        al = ai.tr_alive[:, s, kk]
        hk = (u["id"].unsqueeze(2) == ai.tr_units[:, s, kk].unsqueeze(1)).any(-1)
        held = held | (hk & al.unsqueeze(1))
    free = match & ~held
    loc = c.tag(i, "Desired Location")
    has_loc = (loc != NONE) & (loc >= 0)
    dist = _l(w.distance(u["plot"], torch.where(has_loc, loc, 0)), u["plot"])
    big = 1 << 40
    key = torch.where(has_loc.unsqueeze(1), dist * (1 << 20) + u["id"], torch.arange(typ.shape[1], device=typ.device).unsqueeze(0))
    key = torch.where(free, key, torch.full_like(key, big))
    jf = key.argmin(dim=1)
    jf = torch.where(free.any(dim=1), jf, torch.full_like(jf, -1))
    take = at & (found < 0) & (jf >= 0)
    if bool(take.any()):
        _tree_take_unit(ai, s, torch.full_like(c.ref, c.k), _pick(u["id"], jf), take)
    found = torch.where(found >= 0, found, jf)
    c.set_tag(i, "Found Unit", _pick(u["id"], found), at & (found >= 0))
    st = torch.where(found >= 0, BT_SUCCESS, BT_FAILURE)
    if one_r == -9:
        st = torch.where(want == NONE, BT_ERROR, st)
    return st


def _u_cancel(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """CANCEL CONTRACT (0x7f5200)"""
    return torch.full_like(c.ref, BT_SUCCESS if c.tree.tag(i, "Contract") is not None else BT_ERROR)


def _x_cancel(c: _Ctx, i: int, at: torch.Tensor) -> None:
    j = c.tree_contract(c.tag(i, "Contract"))
    _cset(c.ai.c_progress, c.s, j, CP_CANCELLED, at)


def _units_of(c: _Ctx, i: int, name: str) -> torch.Tensor:
    """[B, U] the tree's units the list tag names, else all it holds"""
    u = c.units()
    ids = c.tag(i, name)
    named = u["valid"] & (u["id"] == ids.unsqueeze(1))
    return torch.where((ids != NONE).unsqueeze(1), named, c.tree_units())


def _u_protect(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    return torch.full_like(c.ref, BT_SUCCESS)


def _u_move(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """MOVE UNIT (0x7f0020)"""
    plot = c.tag(i, "Location")
    none = (plot == NONE) | (plot < 0)
    p = torch.where(none, 0, plot)
    us = _units_of(c, i, "Unit ID List")
    u = c.units()
    there = (u["plot"] == p.unsqueeze(1))
    every = (~us | there).all(dim=1)
    reach = (us & _b(c.w.reachable(p), us)).any(dim=1)
    st = torch.where(every, BT_SUCCESS, torch.where(reach, BT_RUNNING, BT_FAILURE))
    return torch.where(none | ~us.any(dim=1), BT_FAILURE, st)


def _x_move(c: _Ctx, i: int, at: torch.Tensor) -> None:
    plot = c.tag(i, "Location")
    go = at & (plot != NONE)
    us = _units_of(c, i, "Unit ID List")
    u = c.units()
    off = us & (u["plot"] != plot.unsqueeze(1)) & go.unsqueeze(1)
    for j in off.any(dim=0).nonzero(as_tuple=True)[0].tolist():
        c.w.order(u["id"][:, j], "move", plot, torch.full_like(plot, -1), off[:, j])


def _clear_imp(c: _Ctx) -> torch.Tensor:
    """the improvement the tree's Decode Trigger names (node 1's Trigger
    Improvements tag), NONE none"""
    t = c.tree.tag(1, "Trigger Improvements")
    return torch.full_like(c.ref, NONE) if t is None else c.bb[:, t]


def _u_clear(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """CLEAR PLOT (0x7f7960)"""
    plot = c.tag(i, "Plot To Clear")
    none = (plot == NONE) | (plot < 0)
    p = torch.where(none, 0, plot)
    imp = _clear_imp(c)
    ok = (imp != NONE) & _b(c.w.can_improve(p, torch.where(imp != NONE, imp, -1)), p)
    us = _units_of(c, i, "Builder List")
    u = c.units()
    on = (us & (u["plot"] == p.unsqueeze(1)) & (u["charges"] > 0)).any(dim=1)
    st = torch.where(ok, BT_SUCCESS, torch.where(on, BT_RUNNING, BT_FAILURE))
    return torch.where(none, BT_FAILURE, st)


def _x_clear(c: _Ctx, i: int, at: torch.Tensor) -> None:
    plot = c.tag(i, "Plot To Clear")
    go = at & (plot != NONE)
    us = _units_of(c, i, "Builder List")
    u = c.units()
    on = us & (u["plot"] == plot.unsqueeze(1)) & (u["charges"] > 0)
    j = _first(on)
    go = go & (j >= 0)
    if bool(go.any()):
        c.w.order(_pick(u["id"], j), "clear", plot, torch.full_like(plot, -1), go)


def _u_build_improvement(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """BUILD IMPROVEMENT (0x7e9670)"""
    ai, s, w = c.ai, c.s, c.w
    c.ma[:, i] = torch.where(at, -1, c.ma[:, i])
    c.mb[:, i] = torch.where(at, NONE, c.mb[:, i])
    plot = c.tag(i, "Goal Plot")
    none = (plot == NONE) | (plot < 0)
    p = torch.where(none, 0, plot)
    u = c.units()
    workers = _units_of(c, i, "Worker List") & (u["charges"] > 0)
    at_plot = workers & (u["plot"] == p.unsqueeze(1))
    j = _first(at_plot)
    reach = (workers & _b(w.reachable(p), workers)).any(dim=1)
    imp = c.tag(i, "Improvements")
    has_i = (imp != NONE) & _b(w.can_improve(p, torch.where(imp != NONE, imp, -1)), p)
    done = at & ~none & (j >= 0) & has_i
    uid = _pick(u["id"], j)
    c.ma[:, i] = torch.where(done, uid, c.ma[:, i])
    c.mb[:, i] = torch.where(done, imp, c.mb[:, i])
    if c.tree.flag(i, "Release when done"):
        rel = done.unsqueeze(1) & (ai.tr_units[:, s, c.k] == uid.unsqueeze(1))
        ai.tr_units[:, s, c.k] = torch.where(rel, -1, ai.tr_units[:, s, c.k])
    st = torch.where(j < 0, torch.where(reach, BT_RUNNING, BT_FAILURE), torch.where(has_i, BT_SUCCESS, BT_FAILURE))
    return torch.where(none, BT_FAILURE, st)


def _x_build_improvement(c: _Ctx, i: int, at: torch.Tensor) -> None:
    plot = c.tag(i, "Goal Plot")
    go = at & (c.ma[:, i] >= 0) & (plot != NONE)
    if bool(go.any()):
        c.w.order(c.ma[:, i], "improve", plot, c.mb[:, i], go)


def _u_purchase(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """PURCHASE PLOT (0x7f7bf0)"""
    c.ma[:, i] = torch.where(at, 0, c.ma[:, i])
    plot = c.tag(i, "Plot")
    none = (plot == NONE) | (plot < 0)
    p = torch.where(none, 0, plot)
    mine = c.tree_contract(c.tag(i, "Contract")) >= 0
    owner = _l(c.w.plot_owner(p), p)
    buy = at & ~none & ~mine & (owner == -1)
    c.ma[:, i] = torch.where(buy, 1, c.ma[:, i])
    st = torch.where(owner == c.w.seat, BT_SUCCESS, torch.where(owner != -1, BT_FAILURE, BT_RUNNING))
    return torch.where(none, BT_ERROR, torch.where(mine, BT_RUNNING, st))


def _x_purchase(c: _Ctx, i: int, at: torch.Tensor) -> None:
    go = at & (c.ma[:, i] == 1) & (c.tree_contract(c.tag(i, "Contract")) < 0)
    if not bool(go.any()):
        return
    plot = c.tag(i, "Plot")
    j = new_contract(c.ai, c.s, go, tree=c.ref, goal_kind=GOAL_PLOT, plot=plot, value=0, progress=CP_ACCEPTED, in_tree=True)
    c.set_tag(i, "Contract", _cget(c.ai.c_id, c.s, j), go)


def _u_player_ability(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """HAS PLAYER ABILITY (0x7f1fa0)"""
    n = c.tree.nodes[i]
    done = BT_FAILURE if c.tree.flag(i, "Fail if none") else BT_SUCCESS
    lack = torch.zeros_like(at)
    if c.tree.flag(i, "Builders make wonders"):
        lack = lack | ~_b(c.w.builders_make_wonders(), at)
    if c.tree.flag(i, "Builders make districts"):
        lack = lack | ~_b(c.w.builders_make_districts(), at)
    c.ma[:, i] = torch.where(at, torch.where(lack, n["end"], n["first"]), c.ma[:, i])
    return torch.where(lack, done, BT_FRESH)


def _check_contract(c: _Ctx, j: torch.Tensor, over: bool, block: bool, counts: bool, st: torch.Tensor, at: torch.Tensor):
    """`checkContract` of the tree's contract in slot `j` where `at`: (the
    new status, alive)"""
    ai, s = c.ai, c.s
    on = at & (j >= 0)
    prog = _cget(ai.c_progress, s, j)
    alive = torch.ones_like(at)
    ip = on & (prog == CP_IN_PROGRESS)
    if block:
        st = torch.where(ip & ((st == BT_FRESH) | (st == BT_SUCCESS) | (st == BT_FAILURE)), BT_RUNNING, st)
    wait = on & ((prog == CP_CLAIMED) | (prog == CP_ACCEPTED))
    if over:
        _cset(ai.c_progress, s, j, CP_FAILED, wait)
        _cset(ai.c_in_tree, s, j, False, wait)
        st = torch.where(wait, torch.where(st == BT_RUNNING, BT_RUNNING, BT_FAILURE), st)
    if block:
        st = torch.where(wait & (st == BT_SUCCESS), BT_RUNNING, st)
    alive = alive & ~wait
    comp = on & (prog == CP_COMPLETED)
    if block or counts:
        st = torch.where(comp, torch.maximum(st, torch.full_like(st, BT_SUCCESS)), st)
    other = on & ~ip & ~wait & ~comp
    _cset(ai.c_in_tree, s, j, False, other)
    st = torch.where(other, torch.maximum(st, torch.full_like(st, BT_FAILURE)), st)
    return st, alive


def _u_contract_manager(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """CONTRACT MANAGER DECORATOR (0x7f17a0)"""
    ai, s = c.ai, c.s
    n = c.tree.nodes[i]
    one = c.tree.tag(i, "Contract")
    multi = c.tree.tag(i, "Multi-Contracts")
    limit = c.tree.int_(i, "Turn Limit")
    remaining = c.tree.int_(i, "Turns Remaining")
    remaining = -1 if remaining is None else remaining
    if (one is None and multi is None) or limit is None or (limit < 0 and remaining < 0):
        return torch.full_like(c.ref, BT_ERROR)
    blk = c.tree.flag(i, "Block While Running")
    block = True if blk is None else blk
    c.ma[:, i] = torch.where(at, n["first"], c.ma[:, i])
    counter = torch.where(c.mb[:, i] == NONE, 0, c.mb[:, i]) + 1
    c.mb[:, i] = torch.where(at, counter, c.mb[:, i])
    st = torch.full_like(c.ref, BT_FRESH)
    alive = torch.ones_like(at)
    near = torch.zeros_like(at)
    has = torch.zeros_like(at)
    looked = []
    for t in (one, multi):
        if t is None:
            continue
        j = c.tree_contract(c.bb[:, t])
        looked.append(j)
        # the counter past the limit, per game
        over_g = (counter > limit) & (limit >= 0)
        st_o, al_o = _check_contract(c, j, True, block, remaining >= 0, st, at & over_g)
        st_n, al_n = _check_contract(c, j, False, block, remaining >= 0, st, at & ~over_g)
        st = torch.where(over_g, st_o, st_n)
        alive = alive & torch.where(over_g, al_o, al_n)
        if remaining >= 0:
            turns = _cget(ai.c_turns, s, j)
            near = near | ((j >= 0) & (turns >= 0) & (turns < remaining))
        has = has | (j >= 0)
    c.mb[:, i] = torch.where(at & alive, 0, c.mb[:, i])
    fail = at & (st == BT_FAILURE)
    for t in (one, multi):
        if t is None:
            continue
        j = c.tree_contract(c.bb[:, t])
        _cset(ai.c_progress, s, j, CP_FAILED, fail)
    out = st.clone()
    nxt = torch.full_like(c.ref, n["first"])
    end = torch.full_like(c.ref, n["end"])
    nxt = torch.where(fail, end, nxt)
    succ = ~fail & (st == BT_SUCCESS)
    if block:
        nxt = torch.where(succ, end, nxt)
    rest = ~fail & ~succ
    if block:
        run = rest & ((st == BT_RUNNING) | has)
        nxt = torch.where(run, end, nxt)
        out = torch.where(run, BT_RUNNING, out)
        rest = rest & ~run
    if remaining >= 0:
        far = rest & ~near
        out = torch.where(rest & near, BT_FRESH, out)
        out = torch.where(far, BT_RUNNING, out)
        nxt = torch.where(far, end, nxt)
    c.ma[:, i] = torch.where(at, nxt, c.ma[:, i])
    return out


def _u_build_unit(c: _Ctx, i: int, at: torch.Tensor) -> torch.Tensor:
    """BUILD UNIT (0x7f4e00)"""
    w = c.w
    c.ma[:, i] = torch.where(at, 0, c.ma[:, i])
    unit = c.tag(i, "Desired Units")
    bld = c.tag(i, "Desired Buildings")
    dist = c.tag(i, "Desired Districts")
    hu, hb, hd = unit != NONE, bld != NONE, dist != NONE
    err = ~hu & ~hb & ~hd
    mine = c.tree_contract(c.tag(i, "Contract ID")) >= 0
    made = (c.mb[:, i] != NONE) & (c.mb[:, i] != -1)
    br, dr, ur = torch.where(hb, bld, -1), torch.where(hd, dist, -1), torch.where(hu, unit, -1)
    holds = (hb & _b(w.building_held(br), at)) | (hd & _b(w.district_held(dr), at))
    ok = ((hu & _held_pair(w, *_prereqs(c.ai, "unit", ur))) | (hb & _held_pair(w, *_prereqs(c.ai, "building", br)))
          | (hd & _held_pair(w, *_prereqs(c.ai, "district", dr))))
    st = torch.where(ok, BT_RUNNING, BT_FAILURE)
    st = torch.where(holds, BT_SUCCESS, st)
    st = torch.where(made, BT_FAILURE, st)
    st = torch.where(mine, BT_RUNNING, st)
    st = torch.where(err, BT_ERROR, st)
    submit = at & ~err & ~mine & ~made & ~holds & ok
    c.ma[:, i] = torch.where(submit, 1, c.ma[:, i])
    return st


def _x_build_unit(c: _Ctx, i: int, at: torch.Tensor) -> None:
    """BUILD UNIT's execution (0x7f4240): its contract made and submitted"""
    ai, s, w = c.ai, c.s, c.w
    go = at & (c.ma[:, i] == 1) & (c.tree_contract(c.mb[:, i]) < 0)
    if not bool(go.any()):
        return
    unit = c.tag(i, "Desired Units")
    bld = c.tag(i, "Desired Buildings")
    dist = c.tag(i, "Desired Districts")
    hu, hb, hd = unit != NONE, bld != NONE, dist != NONE
    val = c.tag(i, "Unit Value")
    val = torch.where(val == NONE, 0, val) * _FX
    city = c.tag(i, "Required City(-1 for any city)")
    loc = c.tag(i, "Desired Location")
    rel = c.tree.flag(i, "Release Unit When Built")
    j = new_contract(ai, s, go, tree=c.ref,
                     unit=torch.where(~hd & hu, unit, -1),
                     building=torch.where(~hd & ~hu & hb, bld, -1),
                     district=torch.where(hd, dist, -1),
                     plot=torch.where(loc != NONE, loc, -1),
                     value=val,
                     city=torch.where((hd | ~hu) & (city != NONE), city, -1),
                     progress=CP_CLAIMED, assign=not (rel or False), in_tree=True)
    c.mb[:, i] = torch.where(go, _cget(ai.c_id, s, j), c.mb[:, i])
    submit_contract(ai, s, j, w, c.turn, go)
    acc = go & (_cget(ai.c_progress, s, j) == CP_ACCEPTED)
    c.set_tag(i, "Contract ID", _cget(ai.c_id, s, j), acc)


_UPDATE = {
    "Purchase Plot": _u_purchase,
    "Has Player Ability": _u_player_ability,
    "Decode Trigger": _u_decode,
    "Contract Manager Decorator": _u_contract_manager,
    "Add Goal Tech": _u_add_goal_tech,
    "Build Unit": _u_build_unit,
    "Reserve Plot": _u_reserve_plot,
    "Check Plot": _u_check_plot,
    "Find Available Unit": _u_find_unit,
    "Cancel Contract": _u_cancel,
    "Protect Unit": _u_protect,
    "Move Unit": _u_move,
    "Clear Plot": _u_clear,
    "Build Improvement": _u_build_improvement,
}
_EXECUTE = {
    "Purchase Plot": _x_purchase,
    "Add Goal Tech": _x_add_goal_tech,
    "Build Unit": _x_build_unit,
    "Cancel Contract": _x_cancel,
    "Move Unit": _x_move,
    "Clear Plot": _x_clear,
    "Build Improvement": _x_build_improvement,
}
# the nodes whose walk goes on at the node their memory names
_NEXT_MEM = ("Contract Manager Decorator", "Has Player Ability")


def _child(c: _Ctx, p: dict, own: torch.Tensor, s: torch.Tensor, child: int):
    """a selector's or decorator's parent function: (own, finished)"""
    t = p["type"]
    if t == "Contract Manager Decorator":
        v = torch.maximum(torch.where(own == BT_FRESH, s, own), s)
        return v, v != BT_FRESH
    if t == "Priority":
        r9 = torch.where(own.clamp(min=1) > s, own.clamp(min=1), s)
        fin_ok = (r9 != BT_SKIPPED) & ((s == BT_SUCCESS) | (s == BT_RUNNING))
        not_last = torch.full_like(s, child != p["last"], dtype=torch.bool) | (s == BT_FRESH) | (s == BT_SKIPPED)
        own_n = torch.where(r9 == BT_ERROR, r9, torch.where(fin_ok, s, r9))
        fin = torch.where(r9 == BT_ERROR, False, fin_ok | ~not_last)
        return own_n, fin
    if t == "Sequence":
        i = p["index"]
        r9 = torch.where(own.clamp(min=1) > s, own.clamp(min=1), s)
        stop = (r9 != BT_SKIPPED) & (r9 > 1)
        last = (child == p["last"]) & (s != BT_FRESH)
        resume = torch.where(stop, torch.where(r9 == BT_RUNNING, child, p["first"]),
                             torch.where(last & (r9 == BT_SUCCESS), p["first"], c.ma[:, i]))
        return r9, stop | last, resume
    if t == "Concurrent":
        i = p["index"]
        max_f = c.tree.int_(i, "Max Failures")
        exit_ok = c.tree.flag(i, "Exit on Success")
        last_ok = torch.where(c.mb[:, i] == NONE, -1, c.mb[:, i])
        fails = torch.where(c.ma[:, i] == NONE, 0, c.ma[:, i])
        not_f = s != BT_FAILURE
        new_last = torch.where(not_f, child, c.mb[:, i])
        early = not_f & (s == BT_SUCCESS) if exit_ok else torch.zeros_like(not_f)
        if max_f is not None:
            later = child > last_ok
            fails_n = torch.where(~not_f & later, fails + 1, fails)
            v_f = torch.where(later, torch.where(fails_n < max_f, BT_SUCCESS, BT_FAILURE), BT_SUCCESS)
        else:
            fails_n = fails
            v_f = torch.full_like(s, BT_FAILURE)
        v = torch.where(not_f, s, v_f)
        nxt = torch.maximum(own, v)
        fin = (nxt == BT_FAILURE) | (nxt == BT_ERROR) | ((child == p["last"]) & (s != BT_FRESH))
        own_n = torch.where(early, s, nxt)
        fin = early | fin
        return own_n, fin, new_last, torch.where(~not_f, fails_n, c.ma[:, i])
    if t == "Not":
        own_n = torch.where((s == BT_SUCCESS) | (s == BT_RUNNING), BT_FAILURE, torch.where(s == BT_FAILURE, BT_SUCCESS, s))
        return own_n, torch.ones_like(s, dtype=torch.bool)
    # the decorators with no logic of their own over the child
    return torch.where(s == BT_FRESH, own, s), s != BT_FRESH


def _propagate(c: _Ctx, i: int, mask: torch.Tensor) -> torch.Tensor:
    """a finished node told to its parents (0x7d1750): [B] the furthest node
    the walk skips to, 0 where none finished"""
    nodes = c.tree.nodes
    out = torch.zeros_like(c.ref)
    node = i
    m = mask
    while bool(m.any()):
        pi = nodes[node]["parent"]
        if pi < 0:
            break
        p = nodes[pi]
        if p["shape"] not in (SHAPE_SELECTOR, SHAPE_DECORATOR):
            break
        own, s = c.st[:, pi], c.st[:, node]
        r = _child(c, p, own, s, node)
        if p["type"] == "Sequence":
            c.ma[:, pi] = torch.where(m, r[2], c.ma[:, pi])
        elif p["type"] == "Concurrent":
            c.mb[:, pi] = torch.where(m, r[2], c.mb[:, pi])
            c.ma[:, pi] = torch.where(m, r[3], c.ma[:, pi])
        c.st[:, pi] = torch.where(m, r[0], c.st[:, pi])
        fin = m & r[1]
        out = torch.where(fin, torch.maximum(out, torch.full_like(out, p["end"])), out)
        m = fin
        node = pi
    return out


def tick_tree(ai: CityAi, s: int, k: int, w, turn: int, act: torch.Tensor) -> torch.Tensor:
    """ONE TICK (0x7d3a00) of the slot's tree where `act`: the walk, then the
    actions' execution; [B] the root's status. A root ending anything but
    RUNNING (or nothing) ends the tree."""
    c = _Ctx(ai, s, k, w, turn)
    tree = c.tree
    cur = torch.zeros_like(c.ref)
    for i, n in enumerate(tree.nodes):
        at = act & (cur == i)
        if not bool(at.any()):
            continue
        h = _UPDATE.get(n["type"])
        if n["parent"] >= 0:
            skipped = at & (c.st[:, n["parent"]] == BT_SKIPPED)
        else:
            skipped = torch.zeros_like(at)
        run = at & ~skipped
        if n["shape"] == SHAPE_SELECTOR and h is None:
            if n["type"] == "Concurrent":
                c.ma[:, i] = torch.where(run, 0, c.ma[:, i])
                c.mb[:, i] = torch.where(run, 0, c.mb[:, i])
            v = torch.full_like(c.ref, BT_FRESH)
        elif h is None:
            if bool(run.any()):
                raise RuntimeError(f"city AI: no handler for {n['type']} ({tree.name} node {i})")
            v = torch.full_like(c.ref, BT_FRESH)
        else:
            v = h(c, i, run) if bool(run.any()) else torch.full_like(c.ref, BT_FRESH)
        v = torch.where(skipped, BT_SKIPPED, v)
        c.st[:, i] = torch.where(at, v, c.st[:, i])
        if n["type"] in _NEXT_MEM:
            own = torch.where(c.ma[:, i] == NONE, n["first"], c.ma[:, i])
        elif n["type"] == "Sequence":
            own = torch.maximum(torch.where(c.ma[:, i] == NONE, n["first"], c.ma[:, i]), torch.full_like(cur, i + 1))
        else:
            own = torch.full_like(cur, i + 1)
        cur = torch.where(at, torch.maximum(own, _propagate(c, i, at)), cur)
    root = c.st[:, 0].clone()
    ex = act & ((root == BT_SUCCESS) | (root == BT_RUNNING) | (root == BT_FAILURE))
    for i, n in enumerate(tree.nodes):
        x = _EXECUTE.get(n["type"])
        if x is None:
            continue
        on = ex & ((c.st[:, i] == BT_SUCCESS) | (c.st[:, i] == BT_RUNNING))
        if bool(on.any()):
            x(c, i, on)
    keep = act & ((root == BT_RUNNING) | (root == BT_FRESH))
    c.st[:] = torch.where(keep.unsqueeze(1), torch.full_like(c.st, BT_FRESH), c.st)
    ai.tr_alive[:, s, k] &= ~(act & ~keep)
    return root


def tick_city_trees(ai: CityAi, s: int, w, turn: int, mask: torch.Tensor) -> None:
    """THE TREE MANAGER'S TICK (`tickCityTrees`) where `mask`: each running
    tree of the seat, in the order they started, ticks once; a tree whose
    root ends, or one of whose units its orders spent, ends; the
    reservations of trees ended and the contracts no holder keeps go"""
    city_ok = _b(w.city_alive(), mask)
    ks = sorted(ai.slot_trees)
    ids = ai.tr_id[:, s]
    alive = ai.tr_alive[:, s] & mask.unsqueeze(1)
    # a tree whose city is gone ends
    ai.tr_alive[:, s] &= ~(alive & ~city_ok.unsqueeze(1))
    alive = alive & city_ok.unsqueeze(1)
    key = torch.where(alive, ids, torch.full_like(ids, 1 << 40))
    rank = key.argsort(dim=1).argsort(dim=1)
    for r in range(N_SLOTS):
        for k in ks:
            act = alive[:, k] & (rank[:, k] == r)
            if not bool(act.any()):
                continue
            tick_tree(ai, s, k, w, turn, act)
            # a unit of the tree gone with the orders given ends the tree
            us = ai.tr_units[:, s, k]
            gone = ((us >= 0) & ~_b(w.unit_alive(us), us)).any(dim=1)
            ai.tr_alive[:, s, k] &= ~(act & gone)
    rv = ai.r_plot[:, s] >= 0
    dead = rv & ~tree_live(ai, s, ai.r_tree[:, s])
    ai.r_plot[:, s] = torch.where(dead, -1, ai.r_plot[:, s])
    ai.r_tree[:, s] = torch.where(dead, -1, ai.r_tree[:, s])
    ai.tr_id[:, s] = torch.where(ai.tr_alive[:, s], ai.tr_id[:, s], torch.full_like(ai.tr_id[:, s], -1))
    reap_contracts(ai, s)
