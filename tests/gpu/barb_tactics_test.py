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


def scalar_search(sim, b, slot, max_turns, zoc, dest=-1, link=None):
    """`search` (cpu/core/tactical.ts) for one unit, plot by plot; `link`
    sees each priced link (plot, from, turns, moves), the start first"""
    land, wat = sim._tac_enter(BARB_SEAT, not zoc)
    cost = sim._tac_step_cost()[b].tolist()
    zp = sim._tac_zoc(BARB_SEAT)[b].tolist() if zoc else None
    ut = int(sim.barb_unit_type[b, slot])
    naval = bool(sim.unit_naval[ut])
    ent = (wat if naval else land)[b].tolist()
    a_land, a_nav = sim._tac_attack_planes(BARB_SEAT, not zoc)
    fights = int(sim._type_combat[ut]) > 0
    atk = [bool(x) and fights and not e for x, e in zip((a_nav if naval else a_land)[b].tolist(), ent)]
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
    if link:
        link(start, start, 1, mp * FIX // scale)
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
        # an attack's plot is the path's end
        if atk[best]:
            continue
        for c in cols:
            to = neigh[best][c]
            if to < 0 or not (ent[to] or atk[to]):
                continue
            pm, turns = n["moves"], n["turns"]
            if pm <= 0:
                turns += 1
                pm = full
            if atk[to]:
                cst, moves = pm, 0
            else:
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
            if link:
                link(to, best, turns, moves)
            ends = 4 +(3 if tseat[to] != BARB_SEAT else 0) if moves <= 0 else 0
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


def scalar_spots(sim, b, slot, tg):
    """`planUnit`'s targets and spots for one unit, link by link: {entry key
    (2 x plot + 1 for a unit target, 2 x plot for a COMBAT_DISTRICT): [(plot,
    turns), ...]}"""
    ut = int(sim.barb_unit_type[b, slot])
    naval = bool(sim.unit_naval[ut])
    rng = int(sim._tac_range(torch.tensor([b]), torch.tensor([slot]))[0])
    lim = int(sim._tac_full_now()[b, slot]) // sim._mp_scale * 2 + rng
    here = int(sim.barb_unit_tile[b, slot])
    fights = bool(sim._tac_can_fight()[b, slot])
    dk, uk = tg["dk"][b].tolist(), tg["uk"][b].tolist()
    keys = []
    for p in range(sim.T):
        if int(sim.pair_dist[here, p]) > lim:
            continue
        if dk[p] == 1:
            keys.append(2 * p)
        if uk[p] > 0:
            keys.append(2 * p + 1)
    water = sim.water[b].tolist()
    ctr = sim._centre_plane()[b].tolist()
    mil, emb = sim.military_at[b].tolist(), sim.embarked_at[b].tolist()

    def foreign(p):
        if mil[p] >= 0 and int(sim.unit_seat[b, mil[p]]) != BARB_SEAT:
            return True
        return emb[p] >= 0 and int(sim.unit_seat[b, emb[p]]) != BARB_SEAT and bool(
            sim._type_dom_mil[int(sim.unit_type[b, emb[p]])])

    spots = {k: [] for k in keys}

    def link(P, par, T, M):
        for k in keys:
            tp, civ = k // 2, k % 2 == 1 and uk[k // 2] == 7
            d = int(sim.pair_dist[P, tp])
            spot, turns, dd, fixed = P, T, d, False
            taken = (civ and d == 0) if rng != 0 else d == 0
            if not taken and rng == 0 and d == 1 and (M == 0 or P == here) and not foreign(P):
                dd, fixed = 0, M != 0
            if taken:
                if (not water[P] and not ctr[P]) if naval else water[P]:
                    continue
                spot, fixed = par, True
            if not fixed and M == 0:
                turns = T + 1
            sp = spots[k]
            if dd > rng or len(sp) >= 6:
                continue
            if not naval and (water[tp] if rng == 0 else water[spot]):
                continue
            if dd > 0 and civ:
                continue
            if any(s == spot for s, _ in sp) or not fights:
                continue
            if rng > 1 and dd > 1:
                disk = sim._los_disk(torch.tensor([b]), torch.tensor([spot]), rng, torch.zeros(1, dtype=torch.bool))
                if not bool(disk[0, tp]):
                    continue
            sp.append((spot, turns))

    scalar_search(sim, b, slot, 2, False, link=link)
    return spots


def has_target(sim, s) -> bool:
    """the barbarian at local slot `s` has something to attack: another
    player's unit within its reach (a ranged unit's range, else 1), or a city
    centre beside it"""
    here = int(sim.barb_unit_tile[0, s])
    ut = int(sim.barb_unit_type[0, s])
    reach = max(1, int(sim._type_ranged_range[ut])) if int(sim._type_ranged_strength[ut]) > 0 else 1
    for m in sim.unit_alive[0].nonzero(as_tuple=True)[0].tolist():
        t = int(sim.unit_tile[0, m])
        if t >= 0 and int(sim.unit_seat[0, m]) != BARB_SEAT and int(sim.pair_dist[here, t]) <= reach:
            return True
    ctr = sim._centre_plane()[0]
    return any(n >= 0 and bool(ctr[n]) for n in sim.neigh[here].tolist())


def scalar_danger(sim, viewer, b=0):
    """`dangerPlane` (cpu/core/tactical.ts) of `viewer` in game `b`, unit by
    unit (each one's reach from its own search) and city by city"""
    T = sim.T
    pd = sim.pair_dist.tolist()
    out = [0] * T
    seen = sim._barb_seen("barbarians" if viewer == BARB_SEAT else viewer)[b].tolist()
    hostile = sim._seats_hostile(viewer, sim.unit_seat)[b].tolist()
    water = sim.water[b].tolist()
    for u in range(sim.unit_alive.shape[1]):
        t = int(sim.unit_tile[b, u])
        if not bool(sim.unit_alive[b, u]) or t < 0 or not hostile[u] or not seen[t]:
            continue
        ut = int(sim.unit_type[b, u])
        melee, bomb = int(sim._type_combat[ut]), int(sim._type_bombard[ut])
        rng = 0 if bomb > 0 else int(sim._type_ranged_strength[ut])
        if (melee <= 0 and rng <= 0 and bomb <= 0) or int(sim._rel_strength[ut]) > 0:
            continue
        s = max(melee, bomb - sim._bombard_vs_unit) if bomb > 0 else max(melee, rng)
        R = 0
        if int(sim._type_ranged_strength[ut]) > 0:
            R = int(sim._type_ranged_range[ut]) + int(sim._promo_val(
                torch.tensor([ut]), sim.unit_promos[b, u].unsqueeze(0), "RANGE")[0])
        if int(sim._type_air[ut]) > 0:
            for p in range(T):
                if pd[t][p] <= R:
                    out[p] += s
            continue
        pre = "major" if u < sim.POOL_HI["major"] else "barb"
        res = sim._tac_search(torch.tensor([b]), torch.tensor([u - sim.POOL_LO[pre]]), int(sim.unit_seat[b, u]), 1,
                              False, pre=pre, full=True)
        reach = [p for p in range(T) if int(res["closed"][0, p]) >= 1]
        rs = set(reach)
        second = set()
        if R > 0:
            second = {q for q in range(T) if q not in rs and any(pd[p][q] <= R for p in reach)}
        if bool(sim._type_raider[ut]):
            second |= {q for q in range(T) if not water[q] and any(pd[p][q] == 1 for p in reach)}
        for p in reach:
            out[p] += s
        for p in second:
            out[p] += s
    own = []
    for row in range(sim.city_alive.shape[1]):
        hseat = int(sim._ROW_SEAT[row])
        minor = sim._CITY_MINOR0 <= row < sim._CITY_MINOR0 + sim.S
        for c in range(1 if minor else sim.city_alive.shape[2]):
            if not bool(sim.city_alive[b, row, c]):
                continue
            col = torch.full((sim.B,), c, dtype=torch.long)
            rt = torch.full_like(col, row)
            ctr = int(sim.city_center[b, row, c])
            pool = min(int(sim.city_outer_hp[b, row, c]), int(sim._walls_max_at(rt, col)[b]))
            strike = float(sim._strike_strength(row, col)[b])
            if row < sim.n_majors:
                strike += float(sim._gov_mods(row)[12]["crng"][b])
            strike = int(strike // 1) if pool > 0 else 0
            dcs = float(sim._city_defense_cs(rt, col)[0][b])
            if hseat == viewer:
                own.append((ctr, strike, dcs))
                continue
            if not bool(sim._seats_hostile(viewer, torch.full((sim.B,), hseat, dtype=torch.long))[b]) or not seen[ctr]:
                continue
            if int(dcs // 1) > 0:
                out[ctr] += int(dcs // 1)
            for p in range(T):
                if p != ctr and pd[ctr][p] <= (2 if strike > 0 else 1):
                    out[p] += strike if strike > 0 else 1
    for ctr, strike, dcs in own:
        if dcs > 0:
            out[ctr] = 0
        if strike <= 0:
            continue
        for p in range(T):
            if p != ctr and pd[ctr][p] <= 2 and out[p] > 0:
                out[p] = max(out[p] - strike, 1)
    return out


def scalar_safe_plot(sim, s, res, danger, b=0):
    """`safePlot` (cpu/core/tactical.ts) for barbarian `s`, its planning `res`
    (one row), plot by plot in closing order"""
    T = sim.T
    rk = res["rank"][0].tolist()
    rt = res["turns"][0].tolist()
    mv = res["moves"][0].tolist()
    own_mil = sim._tac_own_mil(BARB_SEAT)[b].tolist()
    foe = sim._tac_hostile(BARB_SEAT)[b].tolist()
    here = int(sim.barb_unit_tile[b, s])
    no_combat = int(sim._type_combat[int(sim.barb_unit_type[b, s])]) <= 0
    pd = sim.pair_dist.tolist()
    best = -1
    bs = bo = bw = False
    bd = bm = bdist = 0
    for p in sorted((p for p in range(T) if rt[p] == 1 and not own_mil[p] and not foe[p]), key=lambda p: rk[p]):
        d = danger[p]
        safe, own, water = d <= 0, int(sim.tile_seat[b, p]) == BARB_SEAT, bool(sim.water[b, p])
        dist = pd[here][p]
        if best >= 0:
            if not bw and no_combat and water and d > 0:
                continue
            if safe:
                take = not bs or (own and not bo) or mv[p] < bm
            elif own:
                take = not bs and (not bo or d < bd or (d == bd and mv[p] < bm))
            else:
                take = d < bd or (d == bd and dist > bdist)
            if not take:
                continue
        best, bs, bo, bw, bd, bm, bdist = p, safe, own, water, d, mv[p], dist
    return best


def scalar_explore(sim, s, danger, b=0):
    """`exploreTarget`'s first pick for barbarian explorer `s`, plot by plot:
    of its search of this turn's plots in closing order, no danger, no unit,
    revealed, of its area, not its own, the first whose sight holds the most
    plots the barbarians never revealed (above 0); -1 none"""
    T = sim.T
    res = sim._tac_search(torch.tensor([b]), torch.tensor([s]), BARB_SEAT, 1, False)
    rt, rk = res["turns"][0].tolist(), res["rank"][0].tolist()
    ex = sim.barb_explored[b]
    revealed = (ex | ~ex.any()).tolist()
    here = int(sim.barb_unit_tile[b, s])
    area = sim.tile_area[b].tolist()
    occ = [False] * T
    for pl in (sim.military_at, sim.civilian_at, sim.support_at, sim.embarked_at):
        for t, v in enumerate(pl[b].tolist()):
            occ[t] = occ[t] or v >= 0
    ut = int(sim.barb_unit_type[b, s])
    sight = int(sim._unit_sight(torch.tensor([ut]), sim.barb_unit_promos[b, s].unsqueeze(0))[0])
    best, bv = -1, 0
    for p in sorted((p for p in range(T) if rt[p] == 1), key=lambda p: rk[p]):
        if danger[p] > 0 or occ[p] or not revealed[p] or p == here or area[p] != area[here]:
            continue
        disk = sim._los_disk(torch.tensor([b]), torch.tensor([p]), sight, torch.zeros(1, dtype=torch.bool))[0].tolist()
        v = sum(1 for q in range(T) if disk[q] and not revealed[q])
        if v > bv:
            best, bv = p, v
    return best


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
    # a turn's end and the next's start first, so no slot of a unit lost
    # before waits
    sim._barb_slots()
    sim._barb_slots_dying()
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
    # the other barbarians hold: none walks onto the camp before it
    held = torch.ones_like(sim.barb_unit_alive)
    held[0, d] = False
    sim.barb_unit_mp[held] = 0
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
    land, _ = sim._tac_enter(BARB_SEAT)

    def open_beside(u: int) -> list[int]:
        here = int(sim.barb_unit_tile[0, u])
        return [n for n in sim.neigh[here].tolist()
                if n >= 0 and bool(land[0, n]) and int(sim.military_at[0, n]) < 0 and int(sim.tmove[0, n]) == 0
                and int(sim.improvement[0, n]) < 0 and int(sim.district[0, n]) < 0]
    # the first raider with an open flat plot beside it
    r = next((u for u in raiders if open_beside(u)), raiders[0])
    spot = open_beside(r)
    assert spot, "no open plot beside any raider"
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
    eligible = [s for s in barb_units(sim)
                if int(ai[0, s]) == 3 and int(utribe[0, s]) >= 0 and bool(sim.tribe_alive[0, int(utribe[0, s])])
                and not bool(sim.barb_unit_op[0, s]) and not has_target(sim, s)]
    assert eligible, "no unit of a standing camp's tribe"
    # the first such unit whose turn is the wander (one draw; another may
    # flee a danger first)
    base = sim.snapshot()
    pick, cands, s1 = None, [], 0
    for s in eligible:
        sim.restore(base)
        camp = int(sim.tribe_plot[0, int(utribe[0, s])])
        sim._barb_reset_mp()
        order, _ = scalar_search(sim, 0, s, 2, False)
        foreign = sim._tac_foreign(BARB_SEAT)[0]
        mil = sim.military_at[0]
        cands = [t for t, n in order if n == 1 and not bool(foreign[t])
                 and not (int(mil[t]) >= 0 and int(sim.unit_seat[0, int(mil[t])]) == BARB_SEAT)
                 and int(sim.pair_dist[camp, t]) <= 5
                 and (int(sim.tile_seat[0, camp]) < 0 or (int(sim.tile_seat[0, t]) == int(sim.tile_seat[0, camp])
                                                          and int(sim.tile_city[0, t]) == int(sim.tile_city[0, camp])))]
        if not cands:
            continue
        state0 = int(sim.rng_state[0])
        acting = torch.zeros_like(sim.barb_unit_alive)
        acting[0, s] = True
        sim._barbarian_tactics(acting)
        s1 = (state0 * 1103515245 + 12345) & 0xFFFFFFFF
        if int(sim.rng_state[0]) == s1:
            pick = s
            break
    assert pick is not None, "no unit near its camp wandered on one draw"
    want = cands[((s1 >> 16) * (len(cands) & 0xFFFF)) >> 16]
    assert int(sim.barb_unit_tile[0, pick]) == want, (
        f"the unit wandered to {int(sim.barb_unit_tile[0, pick])}, the draw names {want}")
    print(f"  5 a unit near its camp wanders on one draw over its {len(cands)} plots of this turn")
    # -- 6: a rampaging tribe's unit strikes the taker's unit beside it -------
    sim = fresh(rules, path)
    sim._barb_slots()
    ai, utribe = sim._tac_ai()
    lo = sim.POOL_LO["barb"]
    land, _ = sim._tac_enter(BARB_SEAT)
    ctr = sim._centre_plane()[0]
    majors = [m for m in sim.military_at[0].tolist()
              if m >= 0 and int(sim.unit_seat[0, m]) < sim.n_majors and not bool(sim.water[0, int(sim.unit_tile[0, m])])]
    assert majors, "no major's land unit stands"
    m = majors[0]
    found = None
    for s in barb_units(sim):
        k = int(utribe[0, s])
        if (int(ai[0, s]) != 3 or k < 0 or bool(sim.barb_unit_op[0, s])
                or bool(sim.unit_naval[int(sim.barb_unit_type[0, s])])):
            continue
        bt = int(sim.barb_unit_tile[0, s])
        spot = [n for n in sim.neigh[bt].tolist()
                if n >= 0 and bool(land[0, n]) and int(sim.military_at[0, n]) < 0 and int(sim.civilian_at[0, n]) < 0
                and not bool(ctr[n]) and int(sim.district[0, n]) < 0 and int(sim.tile_seat[0, n]) != BARB_SEAT]
        if spot:
            found = (s, k, spot[0])
            break
    assert found, "no barbarian fighter with an open plot beside it"
    s, k, mt = found
    sim._occ_clear(torch.tensor([0]), torch.tensor([int(sim.unit_tile[0, m])]), torch.tensor([m]))
    sim.unit_tile[0, m] = mt
    sim._occ_set(torch.tensor([0]), torch.tensor([mt]), torch.tensor([m]))
    sim.tribe_alive[0, k] = False
    sim.tribe_ramp[0, k] = int(sim.unit_seat[0, m])
    tg = sim._tac_targets(BARB_SEAT, sim.BK)
    assert int(tg["os"][0, mt]) == int(sim.unit_seat[0, m]) and 1 <= int(tg["ok"][0, mt]) <= 3, (
        f"the unit is no target: ok {int(tg['ok'][0, mt])} os {int(tg['os'][0, mt])} seen {bool(sim._barb_seen('barbarians')[0, mt])}")
    sim._barb_reset_mp()
    hp0 = int(sim.unit_hp[0, m])
    acting = torch.zeros_like(sim.barb_unit_alive)
    acting[0, s] = True
    sim._barbarian_tactics(acting)
    assert not bool(sim.unit_alive[0, m]) or int(sim.unit_hp[0, m]) < hp0, (
        f"the rampaging unit at {int(sim.barb_unit_tile[0, s])} left the taker's unit at {mt} whole ({hp0})")
    print("  6 a rampaging tribe's unit strikes the taker's unit beside it")
    # -- 7: a fighter whose reach takes a civilian at war goes and takes it ----
    sim = fresh(rules, path)
    sim._barb_slots()
    ai, utribe = sim._tac_ai()
    land, _ = sim._tac_enter(BARB_SEAT)
    ctr = sim._centre_plane()[0]
    # a major's land unit made a Builder
    majors = [m for m in sim.military_at[0].tolist()
              if m >= 0 and int(sim.unit_seat[0, m]) < sim.n_majors and not bool(sim.water[0, int(sim.unit_tile[0, m])])]
    assert majors, "no major's land unit stands"
    c = majors[0]

    def open_plot(n):
        return (n >= 0 and bool(land[0, n]) and int(sim.military_at[0, n]) < 0 and int(sim.civilian_at[0, n]) < 0
                and not bool(ctr[n]) and int(sim.district[0, n]) < 0)

    found = None
    # a COMBAT unit (a camp keeps its DEFENDER) with no HIGH target within 8
    # (its planning holds none, nor does its Rampage find one): Attack High
    # runs before Attack Civilians
    tgh = sim._tac_targets(BARB_SEAT, sim.BK)
    high = (tgh["uk"][0] == 3).nonzero(as_tuple=True)[0].tolist()
    for s in barb_units(sim):
        if (int(ai[0, s]) != 3 or bool(sim.barb_unit_op[0, s]) or bool(sim.unit_naval[int(sim.barb_unit_type[0, s])])
                or int(sim._type_ranged_strength[int(sim.barb_unit_type[0, s])]) > 0):
            continue
        bt = int(sim.barb_unit_tile[0, s])
        if any(int(sim.pair_dist[bt, h]) <= 8 for h in high):
            continue
        spot = [n for n in sim.neigh[bt].tolist() if open_plot(n) and int(sim.tmove[0, n]) == 0]
        if spot:
            found = (s, spot[0])
            break
    assert found, "no barbarian fighter with an open plot beside it"
    s, ct = found
    sim._occ_clear(torch.tensor([0]), torch.tensor([int(sim.unit_tile[0, c])]), torch.tensor([c]))
    sim.unit_type[0, c] = sim._builder_idx
    sim.unit_tile[0, c] = ct
    sim._occ_set(torch.tensor([0]), torch.tensor([ct]), torch.tensor([c]))
    assert int(sim.civilian_at[0, ct]) == c, "the Builder stands in no civilian plane"
    seat0 = int(sim.unit_seat[0, c])
    assert int(sim._tac_targets(BARB_SEAT, sim.BK)["ok"][0, ct]) == 7, "the Builder is no CIVILIAN target"
    sim._barb_reset_mp()
    acting = torch.zeros_like(sim.barb_unit_alive)
    acting[0, s] = True
    sim._barbarian_tactics(acting)
    assert int(sim.barb_unit_tile[0, s]) == ct, (
        f"the fighter stands on {int(sim.barb_unit_tile[0, s])}, not the civilian's plot {ct}")
    assert not bool(sim.unit_alive[0, c]) or int(sim.unit_seat[0, c]) != seat0, "the civilian stands untaken"
    print("  7 a fighter whose reach takes a civilian at war takes it")
    # -- 8: the planning's spots, link by link ---------------------------------
    sim = fresh(rules, path)
    sim._barb_slots()
    sim._barb_reset_mp()
    ai, _ = sim._tac_ai()
    tg = sim._tac_targets(BARB_SEAT, sim.BK)
    units = [s for s in barb_units(sim) if int(ai[0, s]) >= 2]
    res = sim._tac_plan(torch.zeros(len(units), dtype=torch.long), torch.tensor(units), tg)
    nspots = 0
    for i, s in enumerate(units):
        want = scalar_spots(sim, 0, s, tg)
        tp, oth = res["tp"][i].tolist(), res["other"][i].tolist()
        got = {}
        for e, p in enumerate(tp):
            if p < 0:
                continue
            n = int(res["spot_n"][i, e])
            got[2 * p + int(oth[e])] = [(int(res["spot"][i, e, k]), int(res["spot_turns"][i, e, k])) for k in range(n)]
        assert got == want, f"unit {s}: the spots {got} differ from the scalar planning's {want}"
        nspots += sum(len(v) for v in want.values())
    print(f"  8 the planning lays {nspots} spots of {len(units)} units as the scalar planning does")
    # -- 9: a fighter beside a target at war strikes it -------------------------
    sim = fresh(rules, path)
    sim._barb_slots()
    ai, utribe = sim._tac_ai()
    land, _ = sim._tac_enter(BARB_SEAT)
    tac = sim._tac_tactical(ai, utribe)
    # a fighter with no other HIGH target within 8 (one its Rampage or Attack
    # High would take before this one)
    high = (sim._tac_targets(BARB_SEAT, sim.BK)["uk"][0] == 3).nonzero(as_tuple=True)[0].tolist()
    found = None
    for s in barb_units(sim):
        if int(ai[0, s]) != 3 or not bool(tac[0, s]) or bool(sim.barb_unit_op[0, s]) or bool(
                sim.unit_naval[int(sim.barb_unit_type[0, s])]) or int(sim._type_ranged_strength[int(sim.barb_unit_type[0, s])]) > 0:
            continue
        bt = int(sim.barb_unit_tile[0, s])
        if any(int(sim.pair_dist[bt, h]) <= 8 for h in high):
            continue
        spot = [n for n in sim.neigh[bt].tolist() if n >= 0 and bool(land[0, n]) and int(sim.military_at[0, n]) < 0
                and int(sim.civilian_at[0, n]) < 0 and not bool(sim._centre_plane()[0, n])]
        if spot:
            found = (s, spot[0])
            break
    assert found, "no barbarian fighter with an open plot beside it"
    s, ft = found
    majors = [m for m in sim.military_at[0].tolist() if m >= 0 and int(sim.unit_seat[0, m]) < sim.n_majors]
    c = majors[0]
    sim._occ_clear(torch.tensor([0]), torch.tensor([int(sim.unit_tile[0, c])]), torch.tensor([c]))
    sim.unit_tile[0, c] = ft
    sim.unit_emb[0, c] = False
    sim._occ_set(torch.tensor([0]), torch.tensor([ft]), torch.tensor([c]))
    # a wounded target: the exchange favours the striker (a LOW or MEDIUM
    # target with the worse exchange is let be)
    sim.unit_hp[0, c] = 10
    sim.barb_unit_hp[0, s] = int(rules.combat["unitHp"])
    hp0 = 10
    kind = int(sim._tac_targets(BARB_SEAT, sim.BK)["ok"][0, ft])
    assert 1 <= kind <= 3, f"the major's unit beside the barbarian is no unit target ({kind})"
    sim._barb_reset_mp()
    acting = torch.zeros_like(sim.barb_unit_alive)
    acting[0, s] = True
    others = [m for m in range(sim.UNIT_MAX) if bool(sim.unit_alive[0, m]) and int(sim.unit_seat[0, m]) != BARB_SEAT]
    hps = {m: int(sim.unit_hp[0, m]) for m in others}
    sim._barbarian_tactics(acting)
    struck = [m for m in others if not bool(sim.unit_alive[0, m]) or int(sim.unit_hp[0, m]) < hps[m]]
    assert struck, (f"the fighter at {int(sim.barb_unit_tile[0, s])} struck nobody, the "
                    f"{('LOW', 'MEDIUM', 'HIGH')[kind - 1]} target at {ft} ({hp0} HP) beside it")
    print(f"  9 a fighter beside a wounded {('LOW', 'MEDIUM', 'HIGH')[kind - 1]} target at war strikes (Attack Units)")
    # -- 10: the danger map, unit by unit and city by city ---------------------
    sim = fresh(rules, path, 60)
    sim._barb_slots()
    ones = torch.ones(sim.B, sim.T, dtype=torch.bool)
    lit = 0
    for viewer in (BARB_SEAT, 100):
        got = sim._danger_plane(viewer, ones)[0].tolist()
        want = scalar_danger(sim, viewer)
        lit += sum(1 for v in want if v)
        assert got == want, f"seat {viewer}: the danger map differs at {[t for t in range(sim.T) if got[t] != want[t]][:8]}"
        # a plot set of its own: the units that cannot touch it unsearched
        need = torch.zeros_like(ones)
        need[0, ::7] = True
        part = sim._danger_plane(viewer, need)[0].tolist()
        assert all(part[t] == want[t] for t in range(0, sim.T, 7)), f"seat {viewer}: the plots read differ"
    assert lit, "no plot of danger to check"
    print(f"  10 the danger map sums {lit} plots of danger as the unit-by-unit sum does")
    # -- 11: a hurt barbarian on a plot of danger goes to the safest plot ------
    sim = fresh(rules, path)
    sim._barb_slots()
    ai, utribe = sim._tac_ai()
    tac = sim._tac_tactical(ai, utribe)
    land, _ = sim._tac_enter(BARB_SEAT)
    majors = [m for m in sim.military_at[0].tolist() if m >= 0 and int(sim.unit_seat[0, m]) < sim.n_majors]
    camps = [int(t) for t in sim.camp_tile[0].tolist() if t >= 0]
    lo = sim.POOL_LO["barb"]
    s = next(s for s in barb_units(sim) if int(ai[0, s]) == 3 and bool(tac[0, s]) and not bool(sim.barb_unit_op[0, s])
             and not bool(sim.unit_naval[int(sim.barb_unit_type[0, s])]))

    def open_land(n):
        return (n >= 0 and bool(land[0, n]) and int(sim.military_at[0, n]) < 0 and int(sim.civilian_at[0, n]) < 0
                and not bool(sim._centre_plane()[0, n]) and all(int(sim.pair_dist[n, k]) > 6 for k in camps))

    # the fighter on open land far from every camp (its foe beside it typed
    # LOW: no Attack High), the foe on an open plot beside it
    found = next(((t, n) for t in range(sim.T) if open_land(t) for n in sim.neigh[t].tolist() if open_land(n)), None)
    assert found and majors, "no open plot far from the camps"
    bt0, ft = found
    sim._occ_clear(torch.tensor([0]), torch.tensor([int(sim.barb_unit_tile[0, s])]), torch.tensor([s + lo]))
    sim.barb_unit_tile[0, s] = bt0
    sim._occ_set(torch.tensor([0]), torch.tensor([bt0]), torch.tensor([s + lo]))
    # the barbarians know the ground round it
    sim._barb_reveal(torch.tensor([0]), torch.tensor([bt0]), 4)
    c = majors[0]
    sim._occ_clear(torch.tensor([0]), torch.tensor([int(sim.unit_tile[0, c])]), torch.tensor([c]))
    sim.unit_tile[0, c] = ft
    sim.unit_emb[0, c] = False
    sim._occ_set(torch.tensor([0]), torch.tensor([ft]), torch.tensor([c]))
    # ...and its player knows the ground it stands on: its search walks the
    # plots it revealed
    sim.seat_explored[0, int(sim.unit_seat[0, c]), sim.pair_dist[ft].long() <= 4] = True
    sim.barb_unit_hp[0, s] = 40
    sim.unit_hp[0, c] = int(rules.combat["unitHp"])
    sim._barb_reset_mp()
    dplane = sim._danger_plane(BARB_SEAT, ones)
    danger = dplane[0].tolist()
    bt = int(sim.barb_unit_tile[0, s])
    assert danger[bt] > 0, "the barbarian's plot holds no danger"
    res = sim._tac_plan(torch.tensor([0]), torch.tensor([s]), sim._tac_targets(BARB_SEAT, sim.BK))
    # no blow of its planning that kills (a civilian near would give one)
    res["wins"] = torch.zeros_like(res["wins"])
    want_plot = scalar_safe_plot(sim, s, res, danger)
    # the move alone, the unit the pass's one
    P = sim.barb_unit_alive.shape[1]
    units = torch.zeros(sim.B, P, dtype=torch.bool)
    units[0, s] = True
    done = torch.zeros_like(units)
    rowof = torch.full((sim.B, P), -1, dtype=torch.long)
    rowof[0, s] = 0
    order = torch.full((sim.B, 1), s, dtype=torch.long)
    sim._tac_in_pass = True
    try:
        sim._tac_move_to_safety(lambda: units & ~done & sim.barb_unit_alive, done, order, units.sum(dim=1), rowof, res,
                                dplane, "barb", BARB_SEAT, False)
    finally:
        sim._tac_in_pass = False
    end = int(sim.barb_unit_tile[0, s])
    assert want_plot >= 0 and end == want_plot and bool(done[0, s]), (
        f"the hurt unit ends on {end}, not the safe plot {want_plot}")
    print(f"  11 a hurt barbarian on a plot of danger {danger[bt]} goes to its safe plot (danger {danger[end]})")
    # -- 12: an explorer goes where its sight takes in the most unrevealed ----
    sim = fresh(rules, path)
    sim._barb_slots()
    sim._barb_reset_mp()
    ai, _ = sim._tac_ai()
    # an explorer with no more than half its health lost (`exploreLand`)
    hp_max = int(rules.combat["unitHp"])
    scouts = [s for s in barb_units(sim) if int(ai[0, s]) == 2 and hp_max - int(sim.barb_unit_hp[0, s]) <= hp_max >> 1]
    assert scouts, "no barbarian explorer"
    s = scouts[0]
    # the barbarians have revealed the ground two round it alone
    sim.barb_explored[0] = sim.pair_dist[int(sim.barb_unit_tile[0, s])] <= 2
    dplane = sim._danger_plane(BARB_SEAT, ones)
    want = scalar_explore(sim, s, dplane[0].tolist())
    P = sim.barb_unit_alive.shape[1]
    units = torch.zeros(sim.B, P, dtype=torch.bool)
    units[0, s] = True
    done = torch.zeros_like(units)
    order = torch.full((sim.B, 1), s, dtype=torch.long)
    sim._tac_in_pass = True
    try:
        first = sim._tac_explore(lambda: units & ~done & sim.barb_unit_alive, done, order, units.sum(dim=1), ai, dplane,
                                 sim._tac_seen_regions(BARB_SEAT), "barb", BARB_SEAT)
    finally:
        sim._tac_in_pass = False
    assert want >= 0 and int(first[0, s]) == want, f"the explorer goes first for {int(first[0, s])}, not {want}"
    print(f"  12 an explorer goes to the plot of its reach whose sight takes in the most unrevealed ({want})")
    # -- 13: the knowledge base's units seen last turn, after the walk -------
    sim = fresh(rules, path)
    T = sim.T
    every = torch.ones(sim.B, T, dtype=torch.bool)
    live_b = torch.ones(sim.B, dtype=torch.bool)
    sim.citystate_kb_slot[:, sim.BK] = -2
    sim._knowledge_look(sim.BK, BARB_SEAT, every, live_b, True)
    known = [int(k) for k in sim.citystate_kb_slot[0, sim.BK].tolist() if k >= 0]
    foes = [u for u in known if int(sim.unit_seat[0, u]) < sim.n_majors and bool(sim._type_dom_mil[int(sim.unit_type[0, u])])]
    assert foes, "the barbarians' look recorded no major's fighter"
    u = foes[0]
    sim.turn = int(sim.turn) + 1
    none = torch.full((sim.B, T), -1, dtype=torch.long)
    empty = torch.zeros(sim.B, T, dtype=torch.long)
    uk, uu, us, uo = sim._tac_known_entries(BARB_SEAT, sim.BK, torch.zeros(sim.B, T, dtype=torch.bool),
                                            empty.clone(), none.clone(), none.clone(), torch.full((sim.B, T), 1 << 40))
    at = int(sim.unit_tile[0, u])
    assert int(uk[0, at]) == 1 and int(uu[0, at]) == u and int(uo[0, at]) >= T, (int(uk[0, at]), int(uu[0, at]))
    # one the player sees now is none of the knowledge base's; two turns old none
    uk2, *_ = sim._tac_known_entries(BARB_SEAT, sim.BK, every, empty.clone(), none.clone(), none.clone(),
                                     torch.full((sim.B, T), 1 << 40))
    assert int(uk2[0].count_nonzero()) == 0
    sim.turn = int(sim.turn) + 1
    uk3, *_ = sim._tac_known_entries(BARB_SEAT, sim.BK, torch.zeros(sim.B, T, dtype=torch.bool), empty.clone(),
                                     none.clone(), none.clone(), torch.full((sim.B, T), 1 << 40))
    assert int(uk3[0].count_nonzero()) == 0
    print(f"  13 the knowledge base's units seen last turn enter after the walk ({int(uk[0].count_nonzero())} entries)")
    print("BARB TACTICS OK — the pathfinder's order, the pool, the camp's defender, the pillage, the wander, the rampage,"
          " the civilians, the attacks, the danger map, Move to Safety, Explore, the knowledge base's entries")


if __name__ == "__main__":
    main()
