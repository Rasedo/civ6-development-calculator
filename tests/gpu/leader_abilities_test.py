"""THE LEADER ABILITIES — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/leader_abilities_test.py

The TS twin is tests/cpu/seats/leader-abilities.test.ts.

CIV6 (the owner's install — LeaderTraits, Traits and their Modifiers), one
clause per assertion, on the rule body that pays it:
  * Trajan's Column — the cheapest City Center building at every founding;
  * Mediterranean's Bride — +4 Gold on Egypt's international routes, +2 Food
    for the sender and +2 Gold for the destination on routes into Egypt,
    doubled trade alliance points;
  * Thunderbolt of the North — the coastal raid for every naval melee unit,
    +50% naval melee Production, Science from a pillaged Mine;
  * Adventures of Enkidu — +5 CS against a seat an ally is at war with, +2
    alliance points a turn for a common foe, shared XP and plunder within 5
    tiles of an ally's unit.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
RULES = json.loads((Path(__file__).resolve().parent.parent.parent
                    / "seeder" / "worlds" / "rules.json").read_text())
UNITS = [u["id"] for u in RULES["units"]]
BLDGS = [b["id"] for b in RULES["buildings"]]
IMPS = RULES["improvements"]["ids"]
ONE = torch.tensor([0], dtype=torch.long)


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu",
                               dtype=torch.float64))


def civ(sim, name: str) -> int:
    return sim._civ_ids.index(name)


def row_of(sim, name: str) -> int:
    for r in range(sim.n_majors):
        c = int(sim.row_civ[r])
        if 0 <= c < len(sim._civ_ids) and sim._civ_ids[c] == name:
            return r
    raise AssertionError(f"no seat plays {name} in this fixture")


def place(sim, tile: int, utype: int, seat: int, *, hp=100) -> int:
    slot = int(sim.unit_next[B0])
    sim.unit_next[B0] += 1
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = seat
    sim.major_unit_type[B0, slot] = utype
    sim.major_unit_tile[B0, slot] = tile
    sim.major_unit_hp[B0, slot] = hp
    sim.major_unit_charges[B0, slot] = 0
    sim.major_unit_mp[B0, slot] = sim._mp_scale * 4
    sim.major_unit_mp_full[B0, slot] = sim._mp_scale * 4
    sim.major_unit_attacks[B0, slot] = 1
    sim.major_unit_promos[B0, slot] = 0
    sim.major_unit_promo_offer[B0, slot] = 0
    sim.major_unit_promo_used[B0, slot] = 0
    sim.major_unit_level[B0, slot] = 1
    sim.major_unit_xp[B0, slot] = 0
    plane = sim.civilian_at if bool(sim._type_civilian[utype]) else sim.military_at
    plane[B0, tile] = slot + sim.POOL_LO["major"]
    return slot


def order(sim, row: int, slot: int, action: int) -> None:
    smap = sim._seat_slot_map(row)
    rank = int((smap[B0] == slot + sim.POOL_LO["major"]).long().argmax())
    assert int(smap[B0, rank]) == slot + sim.POOL_LO["major"], "the unit is not in the slot map"
    a = torch.full(smap.shape, -1, dtype=torch.long)
    a[B0, rank] = action
    sim._apply_seat_unit_actions(row, a)


def settleable(sim) -> torch.Tensor:
    centres = torch.cat([(sim.centre_slot_at[B0] >= 0).nonzero(as_tuple=True)[0],
                         sim.citystate_center[B0][sim.citystate_alive[B0]]])
    spaced = (sim.pair_dist[centres].to(torch.long) >= 4).all(dim=0)
    return (~sim.water[B0] & sim.passable[B0] & sim.settle_ok[B0] & (sim.tile_seat[B0] < 0)
            & (sim.centre_slot_at[B0] < 0) & (sim.district[B0] < 0) & (sim.built_wonder[B0] < 0)
            & spaced)


def free_land(sim, seat: int = -2, n: int = 1) -> list[int]:
    """`n` land plots owned by `seat` (-2 = anyone's rule off), no unit on them."""
    ok = (~sim.water[B0] & sim.passable[B0] & (sim.military_at[B0] < 0) & (sim.civilian_at[B0] < 0)
          & (sim.centre_slot_at[B0] < 0) & (sim.district[B0] < 0))
    if seat != -2:
        ok = ok & (sim.tile_seat[B0] == seat)
    hit = ok.nonzero(as_tuple=True)[0]
    assert hit.numel() >= n, "not enough free land"
    return [int(x) for x in hit[:n]]


def war(sim, a: int, b: int, on: bool = True) -> None:
    sim.war[B0, a, b] = on
    sim.war[B0, b, a] = on


def ally(sim, a: int, b: int, turns: int = 10) -> None:
    sim.seat_ally_turns[B0, a, b] = turns
    sim.seat_ally_turns[B0, b, a] = turns
    sim._eff_version += 1


# ---------------------------------------------------------------------------


def test_leaders(rules, path) -> None:
    sim = fresh(rules, path)
    rome, egypt, norway = row_of(sim, "ROME"), row_of(sim, "EGYPT"), row_of(sim, "NORWAY")
    assert sim._row_leads(rome, "TRAJAN") and sim._row_leads(egypt, "CLEOPATRA") and sim._row_leads(norway, "HARDRADA")
    assert not sim._row_leads(rome, "CLEOPATRA") and not sim._row_leads(sim.BARB_ROW, "TRAJAN")
    assert sim._leads_vec("HARDRADA").tolist() == [r == norway for r in range(sim.n_majors)]
    print("  1 leaders OK")


def test_trajan(rules, path) -> None:
    sim = fresh(rules, path)
    rome = row_of(sim, "ROME")
    mon = BLDGS.index("MONUMENT")
    cap = int(sim.civ_cap_tile[B0, rome])
    d = sim.pair_dist[cap].to(torch.long)
    t = int((settleable(sim) & (d >= 4) & (d <= 8)).nonzero(as_tuple=True)[0][0])
    assert bool(sim._found_city_at(rome, torch.tensor([True]), torch.tensor([t]))[B0])
    slot = int(sim.centre_slot_at[B0, t])
    assert bool(sim.city_bldg[B0, rome, slot, mon]), "Trajan's city has no Monument"
    # the cheapest completable City Center building, by the catalog's cost
    cc = (sim._b_req_district < 0) & sim._seat_buildable(rome, True)[B0, slot]
    costs = torch.where(cc, sim.rules_dev.b_cost, torch.full_like(sim.rules_dev.b_cost, float("inf")))
    assert float(costs[mon]) <= float(costs.min()) or bool(sim.city_bldg[B0, rome, slot, int(costs.argmin())])
    sim2 = fresh(rules, path)
    egypt = row_of(sim2, "EGYPT")
    cap_e = int(sim2.civ_cap_tile[B0, egypt])
    d2 = sim2.pair_dist[cap_e].to(torch.long)
    te = int((settleable(sim2) & (d2 >= 4) & (d2 <= 8)).nonzero(as_tuple=True)[0][0])
    assert bool(sim2._found_city_at(egypt, torch.tensor([True]), torch.tensor([te]))[B0])
    assert not bool(sim2.city_bldg[B0, egypt, int(sim2.centre_slot_at[B0, te])].any()), "Egypt founded with a building"
    print("  2 Trajan's Column OK — a Monument at the founding, Rome's alone")


def _route(sim, frm_row: int, to_row: int, k: int = 0) -> None:
    sim.seat_routes[B0, frm_row, k, 0] = int(sim.city_id[B0, frm_row, 0])
    sim.seat_routes[B0, frm_row, k, 1] = -1
    sim.seat_route_dseat[B0, frm_row, k] = to_row
    sim.seat_route_dcity[B0, frm_row, k] = int(sim.city_id[B0, to_row, 0])
    sim.seat_route_exp[B0, frm_row, k] = int(sim.turn) + 20
    sim._eff_version += 1


def test_cleopatra_routes(rules, path) -> None:
    sim = fresh(rules, path)
    egypt, rome = row_of(sim, "EGYPT"), row_of(sim, "ROME")
    # Egypt's route out: +4 Gold
    _route(sim, egypt, rome)
    g_egypt = float(sim._seat_route_income(egypt)[B0, 0, 2])
    sim.row_civ[egypt] = civ(sim, "NORWAY")
    sim._eff_version += 1
    g_other = float(sim._seat_route_income(egypt)[B0, 0, 2])
    sim.row_civ[egypt] = civ(sim, "EGYPT")
    sim._eff_version += 1
    assert abs((g_egypt - g_other) - sim._cleo_intl_gold) < 1e-9, (g_egypt, g_other)
    # Rome's route in: +2 Food for Rome, +2 Gold for Egypt's destination city
    sim2 = fresh(rules, path)
    _route(sim2, rome, egypt)
    inc_r = sim2._seat_route_income(rome)
    assert abs(float(inc_r[B0, 0, 0]) - sim2._cleo_in_food) < 1e-9, float(inc_r[B0, 0, 0])
    inc_e = sim2._seat_route_income(egypt)
    assert inc_e is not None and abs(float(inc_e[B0, 0, 2]) - sim2._cleo_in_gold) < 1e-9, inc_e
    sim2.row_civ[egypt] = civ(sim2, "NORWAY")
    sim2._eff_version += 1
    inc_r2 = sim2._seat_route_income(rome)
    assert float(inc_r2[B0, 0, 0]) == 0.0, "the sender's Food outlived Cleopatra"
    inc_e2 = sim2._seat_route_income(egypt)
    assert inc_e2 is None or float(inc_e2[B0, 0, 2]) == 0.0
    print("  3 Mediterranean's Bride OK — +4 out, +2 Food / +2 Gold in")


def test_alliance_points(rules, path) -> None:
    def tick(sim, a: int, b: int) -> int:
        before = int(sim.seat_alliance_pts[B0, a, b])
        sim.step()
        return int(sim.seat_alliance_pts[B0, a, b]) - before

    # a Rome-Norway alliance with one route: turn + route
    sim = fresh(rules, path)
    rome, egypt, norway = row_of(sim, "ROME"), row_of(sim, "EGYPT"), row_of(sim, "NORWAY")
    ally(sim, rome, norway)
    _route(sim, rome, norway)
    plain = tick(sim, rome, norway)
    assert plain == sim._al_qp_turn + sim._al_qp_route, plain
    # Cleopatra on either side doubles the route's share
    sim = fresh(rules, path)
    ally(sim, rome, egypt)
    _route(sim, rome, egypt)
    assert tick(sim, rome, egypt) == sim._al_qp_turn + sim._al_qp_route * sim._cleo_trade_qp_mult
    # Gilgamesh: a common foe pays +2 points (8 quarter-points)
    sim = fresh(rules, path)
    sim.row_civ[rome] = civ(sim, "SUMERIA")
    ally(sim, rome, norway)
    war(sim, rome, egypt)
    war(sim, norway, egypt)
    assert tick(sim, rome, norway) == sim._al_qp_turn + sim._enkidu_qp
    sim = fresh(rules, path)
    ally(sim, rome, norway)
    war(sim, rome, egypt)
    war(sim, norway, egypt)
    assert tick(sim, rome, norway) == sim._al_qp_turn, "a common foe paid without Gilgamesh"
    print("  4 alliance points OK — the doubled route, the common foe")


def test_hardrada_production(rules, path) -> None:
    galley = UNITS.index("GALLEY")

    def run(as_civ: str) -> float:
        sim = fresh(rules, path)
        norway = row_of(sim, "NORWAY")
        sim.row_civ[norway] = civ(sim, as_civ)
        sim.city_current[B0, norway, 0, 0] = sim.UNIT_BASE + galley
        sim.city_qtile[B0, norway, 0, 0] = -1
        sim.city_progress[B0, norway, 0, 0] = 0
        sim.city_cost[B0, norway, 0, 0] = 100000
        sim._eff_version += 1
        sim._seat_city_produce(norway, torch.tensor([0]), torch.tensor([True]),
                               torch.tensor([20.0], dtype=torch.float64))
        return float(sim.city_progress[B0, norway, 0, 0])

    p_n, p_r = run("NORWAY"), run("ROME")
    assert p_r > 0 and abs(p_n - p_r * 1.5) < 1e-9, (p_n, p_r)
    print("  5 Thunderbolt production OK — x1.5 on a naval melee unit")


def _raid_setup(sim, row: int, foe: int, utype: int) -> tuple[int, int]:
    """A hull on water beside the foe's Mine; returns (slot, target tile)."""
    war(sim, row, foe)
    wet = [t for t in range(sim.T)
           if bool(sim.water[B0, t]) and int(sim.military_at[B0, t]) < 0
           and any(int(n) >= 0 and not bool(sim.water[B0, int(n)]) and int(sim.centre_slot_at[B0, int(n)]) < 0
                   and int(sim.district[B0, int(n)]) < 0 for n in sim.neigh[t])]
    assert wet, "no water beside plain land"
    here = wet[0]
    tgt = next(int(n) for n in sim.neigh[here]
               if int(n) >= 0 and not bool(sim.water[B0, int(n)]) and int(sim.centre_slot_at[B0, int(n)]) < 0
               and int(sim.district[B0, int(n)]) < 0)
    sim.tile_seat[B0, tgt] = foe
    sim.improvement[B0, tgt] = IMPS.index("MINE")
    sim.pillaged[B0, tgt] = False
    sim._tile_owner_ver += 1
    sim._eff_version += 1
    slot = place(sim, here, utype, row)
    sim._gen_ver += 1
    return slot, tgt


def test_hardrada_raid(rules, path) -> None:
    galley = UNITS.index("GALLEY")
    sim = fresh(rules, path)
    norway, egypt = row_of(sim, "NORWAY"), row_of(sim, "EGYPT")
    slot, tgt = _raid_setup(sim, norway, egypt, galley)
    sci0 = float(sim.civ_tech_prog[B0, norway])
    order(sim, norway, slot, sim._A_PILLAGE)
    assert bool(sim.pillaged[B0, tgt]), "Hardrada's galley did not raid the coast"
    assert float(sim.civ_tech_prog[B0, norway]) > sci0, "no Science from the raided Mine"
    # a plain galley cannot
    sim2 = fresh(rules, path)
    rome = row_of(sim2, "ROME")
    slot2, tgt2 = _raid_setup(sim2, rome, egypt, galley)
    order(sim2, rome, slot2, sim2._A_PILLAGE)
    assert not bool(sim2.pillaged[B0, tgt2]), "a plain galley raided the coast"
    print("  6 Thunderbolt raid OK — the coastal raid for a naval melee hull, Science from the Mine")


def test_enkidu_cs(rules, path) -> None:
    sim = fresh(rules, path)
    rome, egypt, norway = row_of(sim, "ROME"), row_of(sim, "EGYPT"), row_of(sim, "NORWAY")
    sim.row_civ[rome] = civ(sim, "SUMERIA")
    ally(sim, rome, egypt)
    war(sim, rome, norway)
    war(sim, egypt, norway)
    cs = sim._ally_war_cs(torch.tensor([rome]), torch.tensor([norway]))
    assert float(cs[B0]) == float(sim._enkidu_cs), float(cs[B0])
    cs_ally = sim._ally_war_cs(torch.tensor([egypt]), torch.tensor([norway]))
    assert float(cs_ally[B0]) == float(sim._enkidu_cs), "the ally does not share it"
    sim.row_civ[rome] = civ(sim, "ROME")
    assert float(sim._ally_war_cs(torch.tensor([rome]), torch.tensor([norway]))[B0]) == 0.0
    print("  7 Enkidu CS OK — +5 beside an ally's war, on both members")


def test_enkidu_xp_share(rules, path) -> None:
    sim = fresh(rules, path)
    rome, egypt, norway = row_of(sim, "ROME"), row_of(sim, "EGYPT"), row_of(sim, "NORWAY")
    sim.row_civ[rome] = civ(sim, "SUMERIA")
    ally(sim, rome, egypt)
    war(sim, rome, norway)
    war(sim, egypt, norway)
    warrior = UNITS.index("WARRIOR")
    t0 = free_land(sim)[0]
    d = sim.pair_dist[t0].to(torch.long)
    land = (~sim.water[B0] & sim.passable[B0] & (sim.military_at[B0] < 0) & (sim.centre_slot_at[B0] < 0))
    near_t = int((land & (d >= 2) & (d <= 5)).nonzero(as_tuple=True)[0][0])
    far_t = int((land & (d > 5)).nonzero(as_tuple=True)[0][0])
    earner = place(sim, t0, warrior, rome)
    near = place(sim, near_t, warrior, egypt)
    far = place(sim, far_t, warrior, egypt)
    own = place(sim, free_land(sim)[0], warrior, rome)
    gain = torch.tensor([6], dtype=sim.unit_xp.dtype)
    sim._share_joint_xp(torch.tensor([True]), torch.tensor([t0]), torch.tensor([rome]), torch.tensor([norway]), gain)
    assert int(sim.major_unit_xp[B0, near]) == 6, int(sim.major_unit_xp[B0, near])
    assert int(sim.major_unit_xp[B0, far]) == 0, "a unit past 5 tiles banked the share"
    assert int(sim.major_unit_xp[B0, own]) == 0 and int(sim.major_unit_xp[B0, earner]) == 0, "the share reached the earner's own seat"
    sim.row_civ[rome] = civ(sim, "ROME")
    sim._share_joint_xp(torch.tensor([True]), torch.tensor([t0]), torch.tensor([rome]), torch.tensor([norway]), gain)
    assert int(sim.major_unit_xp[B0, near]) == 6, "the share fired without Gilgamesh"
    print("  8 Enkidu XP share OK — within 5 tiles, the ally's units alone")


def test_enkidu_plunder_share(rules, path) -> None:
    sim = fresh(rules, path)
    rome, egypt, norway = row_of(sim, "ROME"), row_of(sim, "EGYPT"), row_of(sim, "NORWAY")
    sim.row_civ[rome] = civ(sim, "SUMERIA")
    ally(sim, rome, egypt)
    war(sim, rome, norway)
    war(sim, egypt, norway)
    warrior = UNITS.index("WARRIOR")
    tgt = free_land(sim, norway)[0]
    sim.improvement[B0, tgt] = IMPS.index("MINE")
    sim.pillaged[B0, tgt] = False
    sim._eff_version += 1
    d = sim.pair_dist[tgt].to(torch.long)
    near_t = int((~sim.water[B0] & sim.passable[B0] & (sim.military_at[B0] < 0) & (sim.centre_slot_at[B0] < 0)
                  & (d >= 1) & (d <= 5)).nonzero(as_tuple=True)[0][0])
    slot = place(sim, tgt, warrior, rome)
    place(sim, near_t, warrior, egypt)
    sim._gen_ver += 1
    g_r, g_e = float(sim.civ_treasury[B0, rome]), float(sim.civ_treasury[B0, egypt])
    order(sim, rome, slot, sim._A_PILLAGE)
    assert bool(sim.pillaged[B0, tgt]), "the pillage did not fire"
    dr, de = float(sim.civ_treasury[B0, rome]) - g_r, float(sim.civ_treasury[B0, egypt]) - g_e
    assert dr > 0 and abs(de - dr) < 1e-9, (dr, de)
    print("  9 Enkidu plunder share OK — the ally's purse takes the same lump")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_leaders(rules, path)
    test_trajan(rules, path)
    test_cleopatra_routes(rules, path)
    test_alliance_points(rules, path)
    test_hardrada_production(rules, path)
    test_hardrada_raid(rules, path)
    test_enkidu_cs(rules, path)
    test_enkidu_xp_share(rules, path)
    test_enkidu_plunder_share(rules, path)
    print("BATTERY OK leader_abilities")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
