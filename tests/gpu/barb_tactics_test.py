"""THE BARBARIANS' UNIT AI on the GPU twin (`gpu/core/sim_tactics.py`, the
twin of `cpu/core/tactical.ts`; tools/civ6lab/dll_readings.md "C-95: the
unit pathfinder and the planning's reach", "C-95: the tactical pass").

    python tests/gpu/barb_tactics_test.py

The batched pathfinder closes each unit's plots in the order the scalar
pathfinder (`search`, written here line for line) closes them — cost, then
the open list's order among equal costs, the DirectionTypes walk — with the
same turns and parents; the unit pool hands out the slot freed last; a camp's
defender walks home; a raider in reach of an improvement walks onto it and
pillages it; a unit wandering near its camp takes ONE "Random Direction"
draw over the plots its reach takes this turn and moves to the one drawn.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import load_rules, fixture_paths, statecompare
from core.simbase import BARB_SEAT
from warmup import warm_base, opened

FIX = 256


def fresh(rules, path, turns=30):
    return warm_base((str(path), turns), lambda: opened(rules, path, turns))


def scalar_search(sim, b, slot, max_turns, zoc, dest=-1):
    """`search` (cpu/core/tactical.ts) for one unit, plot by plot"""
    land, wat = sim._tac_enter(BARB_SEAT)
    cost = sim._tac_step_cost()[b].tolist()
    zp = sim._tac_zoc(BARB_SEAT)[b].tolist() if zoc else None
    ut = int(sim.barb_unit_type[b, slot])
    naval = bool(sim.unit_naval[ut])
    ent = (wat if naval else land)[b].tolist()
    zign = bool(sim._tac_zoc_ignored(torch.tensor([ut]))[0])
    scale = sim._mp_scale
    mp = int(sim.barb_unit_mp[b, slot])
    full = (int(sim._full_mp("barb")[b, slot]) - int(sim.barb_unit_aura_mp[b, slot])) * FIX // scale
    unmoved = mp >= int(sim.barb_unit_mp_full[b, slot])
    start = int(sim.barb_unit_tile[b, slot])
    tseat = sim.tile_seat[b].tolist()
    neigh = sim.neigh.tolist()
    cols = list(sim._DIRECTION_TYPES)
    nodes = {start: dict(g=0, tie=0, moves=mp * FIX // scale, turns=1, closed=False, parent=-1)}
    open_ = [start]
    seq = 0
    order = []

    def key(t):
        return (nodes[t]["g"], nodes[t]["tie"])

    while open_:
        best = min(open_, key=key)
        open_.remove(best)
        n = nodes[best]
        n["closed"] = True
        order.append((best, n["turns"]))
        if best == dest:
            break
        for c in cols:
            to = neigh[best][c]
            if to < 0 or not ent[to]:
                continue
            pm, turns = n["moves"], n["turns"]
            if pm <= 0:
                turns += 1
                pm = full
            cst = (scale if naval else cost[best][c]) * FIX // scale
            moves = pm - cst
            if moves < 0:
                moves = 0
                if best == start and unmoved:
                    cst = pm
                elif n["turns"] == turns:
                    turns += 1
                else:
                    cst = pm if pm > 0 else FIX
            if zp is not None and moves > 0 and zp[to] and not zign:
                cst = pm
                moves = 0
            if turns > max_turns:
                continue
            ends = 4 + (3 if tseat[to] != BARB_SEAT else 0) if moves <= 0 else 0
            g = n["g"] + cst * 1000 + (ends + 2) * FIX
            o = nodes.get(to)
            if o is None:
                tie = 0
                if open_:
                    lo = min(open_, key=key)
                    hi = max(open_, key=key)
                    lg, hg = nodes[lo]["g"], nodes[hi]["g"]
                    if lg <= g <= hg:
                        seq += 1
                        tie = -seq if abs(g - lg) <= abs(g - hg) else seq
                nodes[to] = dict(g=g, tie=tie, moves=moves, turns=turns, closed=False, parent=best)
                open_.append(to)
            elif g < o["g"]:
                o.update(g=g, moves=moves, turns=turns, parent=best)
                if not o["closed"]:
                    seq += 1
                    o["tie"] = seq
    return order, {t: v["parent"] for t, v in nodes.items()}


def has_target(sim, s) -> bool:
    """the barbarian at local slot `s` has something to attack (the stand-in's
    target scan, asked without acting)"""
    seen = []
    one = torch.zeros_like(sim.barb_unit_alive)
    one[0, s] = True

    def pick(u, tgt):
        if tgt is None:
            return None
        seen.append(int(tgt[0]))
        return torch.zeros_like(tgt, dtype=torch.bool)

    sim._barb_stand_in(lambda: one & sim.barb_unit_alive, pick)
    return bool(seen) and seen[0] < sim.T


def barb_units(sim, b=0):
    return [s for s in sim.barb_unit_alive[b].nonzero(as_tuple=True)[0].tolist()
            if int(sim.barb_unit_seat[b, s]) == BARB_SEAT]


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]

    # -- 1: the batched pathfinder closes the plots the scalar one closes ------
    sim = fresh(rules, path)
    sim._barb_reset_mp()
    units = barb_units(sim)
    assert units, "no barbarian unit stands at the warm-up's end"
    rows = torch.zeros(len(units), dtype=torch.long)
    slots = torch.tensor(units)
    for zoc, turns in ((False, 2), (True, 1 << 30)):
        res = sim._tac_search(rows, slots, BARB_SEAT, turns, zoc)
        for i, s in enumerate(units):
            want, parent = scalar_search(sim, 0, s, turns, zoc)
            rk = res["rank"][i]
            got = sorted(((int(rk[t]), t, int(res["turns"][i, t])) for t in range(sim.T) if int(rk[t]) >= 0))
            assert [(t, n) for _, t, n in got] == want, (
                f"unit {s} (zoc {zoc}): the batched closing order differs from the scalar one at "
                f"{next(k for k, (a, b) in enumerate(zip([(t, n) for _, t, n in got], want)) if a != b) if got and want else 0}")
            for t, p in parent.items():
                assert int(res["parent"][i, t]) == p, f"unit {s}: plot {t}'s parent {int(res['parent'][i, t])}, not {p}"
    print(f"  1 the batched pathfinder closes {len(units)} units' plots in the scalar pathfinder's order")

    # -- 2: the unit pool hands out the slot freed last -------------------------
    sim = fresh(rules, path)
    sim._barb_slots()
    live = barb_units(sim)
    nos = sorted(int(sim.barb_unit_slotno[0, s]) for s in live)
    assert nos == list(range(len(nos))) or len(set(nos)) == len(nos), "two units share a pool slot"
    gone = [s for s in live if int(sim.barb_unit_slotno[0, s]) in nos[:2]]
    freed = sorted(int(sim.barb_unit_slotno[0, s]) for s in gone)
    lo = sim.POOL_LO["barb"]
    for s in gone:
        sim._occ_clear(torch.tensor([0]), torch.tensor([int(sim.barb_unit_tile[0, s])]), torch.tensor([s + lo]))
        sim.barb_unit_alive[0, s] = False
    sim._barb_slots_dying()
    assert sorted(sim.barb_pool_dying[0].nonzero(as_tuple=True)[0].tolist()) == freed
    sim._barb_slots()
    n = int(sim.barb_pool_nfree[0])
    assert sim.barb_pool_free[0, :n].tolist()[-2:] == freed, "the freed slots are not pushed in ascending order"
    row = statecompare._barb_tribes_row(sim, 0)
    tail = [int(sim.barb_pool_size[0]), n, *sim.barb_pool_free[0, :n].tolist()]
    assert any(row[i:i + len(tail)] == tail for i in range(len(row))), "the state row leaves the pool out"
    print("  2 the pool frees a gone unit's slot at the next turn, in ascending order, and hands out the last")

    # -- 3: a camp's defender walks home ---------------------------------------
    sim = fresh(rules, path)
    sim._barb_slots()
    ai, _ = sim._tac_ai()
    defs = [s for s in barb_units(sim) if int(ai[0, s]) == 4]
    assert defs, "no camp keeps a defender"
    d = defs[0]
    k = int((sim.tribe_defender[0] == d).nonzero(as_tuple=True)[0][0])
    camp = int(sim.tribe_plot[0, k])
    assert int(sim.barb_unit_tile[0, d]) == camp
    land, _ = sim._tac_enter(BARB_SEAT)
    away = [n for n in sim.neigh[camp].tolist()
            if n >= 0 and bool(land[0, n]) and int(sim.military_at[0, n]) < 0 and int(sim.tmove[0, n]) == 0]
    assert away, "no open plot beside the camp"
    sim._occ_clear(torch.tensor([0]), torch.tensor([camp]), torch.tensor([d + lo]))
    sim.barb_unit_tile[0, d] = away[0]
    sim._occ_set(torch.tensor([0]), torch.tensor([away[0]]), torch.tensor([d + lo]))
    sim._barb_reset_mp()
    acting = torch.zeros_like(sim.barb_unit_alive)
    acting[0, d] = True
    tgt = sim._tac_search(torch.tensor([0]), torch.tensor([d]), BARB_SEAT, 2, False)["turns"][0, camp]
    sim._barbarian_tactics(acting)
    assert int(sim.barb_unit_tile[0, d]) == camp, (
        f"the camp's defender stands on {int(sim.barb_unit_tile[0, d])}, not its camp {camp} "
        f"(off at {away[0]}, its reach takes the camp on turn {int(tgt)}, mp {int(sim.barb_unit_mp[0, d])}, "
        f"camp holds {int(sim.military_at[0, camp])})")
    print("  3 a camp's defender off its camp walks home")

    # -- 4: a raider in reach of an improvement walks onto it and pillages it --
    sim = fresh(rules, path)
    sim._barb_slots()
    ai, utribe = sim._tac_ai()
    raiders = [s for s in barb_units(sim) if int(ai[0, s]) == 3 and not bool(sim.barb_unit_op[0, s])
               and not bool(sim.unit_naval[int(sim.barb_unit_type[0, s])])
               and int(utribe[0, s]) >= 0 and bool(sim.tribe_alive[0, int(utribe[0, s])])
               and not has_target(sim, s)]
    assert raiders, "no barbarian fighter stands"
    r = raiders[0]
    here = int(sim.barb_unit_tile[0, r])
    land, _ = sim._tac_enter(BARB_SEAT)
    spot = [n for n in sim.neigh[here].tolist()
            if n >= 0 and bool(land[0, n]) and int(sim.military_at[0, n]) < 0 and int(sim.tmove[0, n]) == 0
            and int(sim.improvement[0, n]) < 0 and int(sim.district[0, n]) < 0]
    assert spot, "no open plot beside the raider"
    t = spot[0]
    farm = sim.FARM
    sim.improvement[0, t] = farm
    sim.pillaged[0, t] = False
    sim.tile_seat[0, t] = 0
    sim._tile_owner_ver += 1
    sim._eff_version += 1
    sim._barb_reset_mp()
    acting = torch.zeros_like(sim.barb_unit_alive)
    acting[0, r] = True
    sim._barbarian_tactics(acting)
    assert int(sim.barb_unit_tile[0, r]) == t and bool(sim.pillaged[0, t]), (
        f"the raider stands on {int(sim.barb_unit_tile[0, r])}, the farm {t} pillaged {bool(sim.pillaged[0, t])}")
    print("  4 a raider in reach of a seen improvement walks onto it and pillages it")

    # -- 5: a unit near its camp wanders on ONE "Random Direction" draw --------
    sim = fresh(rules, path)
    sim._barb_slots()
    sim._barb_reset_mp()
    ai, utribe = sim._tac_ai()
    pick = None
    for s in barb_units(sim):
        k = int(utribe[0, s])
        if (int(ai[0, s]) == 3 and k >= 0 and bool(sim.tribe_alive[0, k]) and not bool(sim.barb_unit_op[0, s])
                and not has_target(sim, s)):
            pick = s
            break
    assert pick is not None, "no unit of a standing camp's tribe"
    camp = int(sim.tribe_plot[0, int(utribe[0, pick])])
    sim._barb_reset_mp()
    order, _ = scalar_search(sim, 0, pick, 2, False)
    foreign = sim._tac_foreign(BARB_SEAT)[0]
    mil = sim.military_at[0]
    cands = [t for t, n in order if n == 1 and not bool(foreign[t])
             and not (int(mil[t]) >= 0 and int(sim.unit_seat[0, int(mil[t])]) == BARB_SEAT)
             and int(sim.pair_dist[camp, t]) <= 5
             and (int(sim.tile_seat[0, camp]) < 0 or (int(sim.tile_seat[0, t]) == int(sim.tile_seat[0, camp])
                                                      and int(sim.tile_city[0, t]) == int(sim.tile_city[0, camp])))]
    assert cands, "the wandering unit has no plot to wander to"
    state0 = int(sim.rng_state[0])
    acting = torch.zeros_like(sim.barb_unit_alive)
    acting[0, pick] = True
    sim._barbarian_tactics(acting)
    s1 = (state0 * 1103515245 + 12345) & 0xFFFFFFFF
    assert int(sim.rng_state[0]) == s1, "the wander took other than one draw"
    want = cands[((s1 >> 16) * (len(cands) & 0xFFFF)) >> 16]
    assert int(sim.barb_unit_tile[0, pick]) == want, (
        f"the unit wandered to {int(sim.barb_unit_tile[0, pick])}, the draw names {want}")
    print(f"  5 a unit near its camp wanders on one draw over its {len(cands)} plots of this turn")
    print("BARB TACTICS OK — the pathfinder's order, the pool, the camp's defender, the pillage, the wander")


if __name__ == "__main__":
    main()
