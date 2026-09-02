"""THE CIVILIZATION ABILITIES — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/civ_abilities_test.py

The TS twin is tests/cpu/seats/civ-abilities.test.ts.

CIV6 (the owner's install — Traits and their Modifiers), one clause per
assertion, on the rule body that pays it:
  * All Roads Lead to Rome — a Trading Post and, within Trade Route range
    of the capital, a road along the Trader's course at every founding and
    conquest; +1 Gold per own-city hop on a route's chain;
  * Iteru — +15% Production for a district on a river tile; no flood damage
    on Egypt's ground;
  * Knarr — Ocean at Shipbuilding; naval melee +10 heal in neutral waters on
    top of the naval heal table (friendly 20 / neutral 0 / enemy 0, the
    heal-outside promotion +10 / +5);
  * Epic Quest — half-price levies.
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


def play(sim, row: int, name):
    """Seat `row` (game 0) as civilization `name`'s first roster row, or as
    nobody — both the civilization and the leader planes."""
    if name is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[0, row] = ci
        sim.row_leader[0, row] = sim._pair_civ.index(ci)
    # every memo keyed on the seat's state is stale now
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1

B0 = 0
RULES = json.loads((Path(__file__).resolve().parent.parent.parent
                    / "seeder" / "worlds" / "rules.json").read_text())
UNITS = [u["id"] for u in RULES["units"]]
TECHS = [t["id"] for t in RULES["techs"]]
IMPS = RULES["improvements"]["ids"]
ONE = torch.tensor([0], dtype=torch.long)


def fresh(rules, path) -> BatchSim:
    """The scene's trio — Rome, Egypt, Norway at rows 0-2 — seated BEFORE the
    capitals settle, so the founding clauses land as the old fixtures had them."""
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for r, name in enumerate(("ROME", "EGYPT", "NORWAY")):
        play(sim, r, name)
    return settle_all(sim)


def civ(sim, name: str) -> int:
    return sim._civ_ids.index(name)


def row_of(sim, name: str) -> int:
    """SEAT `name` at its scene row — the fixture's trio is the seeder's draw."""
    r = {"ROME": 0, "EGYPT": 1, "NORWAY": 2}[name]
    play(sim, r, name)
    return r


def place(sim, tile: int, utype: int, seat: int, *, hp=100, promos=0) -> int:
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
    sim.major_unit_promos[B0, slot] = promos
    sim.major_unit_promo_offer[B0, slot] = 0
    sim.major_unit_promo_used[B0, slot] = 0
    sim.major_unit_level[B0, slot] = 1
    plane = sim.civilian_at if bool(sim._type_civilian[utype]) else sim.military_at
    plane[B0, tile] = slot + sim.POOL_LO["major"]
    return slot


def heal_anywhere_bit(sim, utype: int) -> int:
    c = int(sim.rules_dev.u_promo_class[utype])
    ki = sim._pk["HEAL_ANYWHERE"]
    rd = sim.rules_dev
    for k in range(int(rd.promo_rows[c])):
        if bool((rd.promo_kind[c, k] == ki).any()):
            return 1 << k
    raise AssertionError("the chassis's class carries no HEAL_ANYWHERE row")


def settleable(sim) -> torch.Tensor:
    """[T] bool — free land the settle rule accepts, clear of every centre."""
    centres = torch.cat([(sim.centre_slot_at[B0] >= 0).nonzero(as_tuple=True)[0],
                         sim.citystate_center[B0][sim.citystate_alive[B0]]])
    spaced = (sim.pair_dist[centres].to(torch.long) >= 4).all(dim=0)
    return (~sim.water[B0] & sim.passable[B0] & sim.settle_ok[B0] & (sim.tile_seat[B0] < 0)
            & (sim.centre_slot_at[B0] < 0) & (sim.district[B0] < 0) & (sim.built_wonder[B0] < 0)
            & spaced)


def site_near(sim, cap: int, lo: int = 4, hi: int = 7) -> int:
    """A settleable plot `lo..hi` tiles from `cap`."""
    d = sim.pair_dist[cap].to(torch.long)
    hit = (settleable(sim) & (d >= lo) & (d <= hi)).nonzero(as_tuple=True)[0]
    assert hit.numel(), "no free plot near the capital"
    return int(hit[0])


def walk(sim, row: int, frm: int, to: int) -> list[int]:
    water = sim._trade_water_level(row)
    cur = torch.tensor([frm], dtype=torch.long)
    tgt = torch.tensor([to], dtype=torch.long)
    path = [frm]
    for _ in range(40):
        nxt = sim._trade_walk_step(ONE, cur, tgt, water)
        if int(nxt[0]) == int(cur[0]):
            break
        cur = nxt
        path.append(int(cur[0]))
    return path


# ---------------------------------------------------------------------------


def test_roster(rules, path) -> None:
    sim = fresh(rules, path)
    rome, egypt, norway = row_of(sim, "ROME"), row_of(sim, "EGYPT"), row_of(sim, "NORWAY")
    assert sim._row_plays(rome, "ROME") and not sim._row_plays(rome, "EGYPT")
    assert sim._row_plays(egypt, "EGYPT") and sim._row_plays(norway, "NORWAY")
    assert not sim._row_plays(sim.BARB_ROW, "ROME")
    got = sim._seat_plays(torch.tensor([rome, egypt, 100, -1]), "ROME").tolist()
    assert got == [True, False, False, False], got
    print(f"  1 roster OK — Rome {rome}, Egypt {egypt}, Norway {norway}")


def test_rome_founding(rules, path) -> None:
    sim = fresh(rules, path)
    rome = row_of(sim, "ROME")
    cap = int(sim.civ_cap_tile[B0, rome])
    t = site_near(sim, cap)
    water = sim._trade_water_level(rome)
    assert bool(sim._trade_walk_ok(ONE, torch.tensor([t]), torch.tensor([cap]), water)[0]), \
        "the plot must be reachable for the road clause to be the thing under test"
    assert not bool(sim.trading_post[B0, rome, t])
    found = sim._found_city_at(rome, torch.tensor([True]), torch.tensor([t]))
    assert bool(found[B0]), "the founding itself failed"
    assert bool(sim.trading_post[B0, rome, t]), "no Trading Post at the new city"
    path_ = walk(sim, rome, t, cap)
    assert path_[-1] == cap and len(path_) > 2, path_
    for i in path_:
        if not bool(sim.water[B0, i]):
            assert bool(sim.road[B0, i]), f"no road on the course at {i}"
    # a city too far from the capital gets the post and no road
    far_ok = settleable(sim) & (sim.pair_dist[cap].to(torch.long) > sim._trade_sea_range)
    if bool(far_ok.any()):
        f = int(far_ok.nonzero(as_tuple=True)[0][0])
        roads = sim.road[B0].clone()
        sim._found_city_at(rome, torch.tensor([True]), torch.tensor([f]))
        assert bool(sim.trading_post[B0, rome, f])
        assert torch.equal(sim.road[B0], roads), "a road was laid past Trade Route range"
    # every other civilization founds bare
    sim = fresh(rules, path)
    egypt = row_of(sim, "EGYPT")
    cap_e = int(sim.civ_cap_tile[B0, egypt])
    te = site_near(sim, cap_e)
    roads = sim.road[B0].clone()
    sim._found_city_at(egypt, torch.tensor([True]), torch.tensor([te]))
    assert not bool(sim.trading_post[B0, egypt, te]), "Egypt was stamped a post"
    assert torch.equal(sim.road[B0], roads), "Egypt was laid a road"
    print("  2 Rome founding OK — post and road to the capital; nobody else's")


def test_rome_conquest(rules, path) -> None:
    sim = fresh(rules, path)
    rome, egypt = row_of(sim, "ROME"), row_of(sim, "EGYPT")
    c_t = int(sim.city_center[B0, egypt, 0])
    cap = int(sim.civ_cap_tile[B0, rome])
    water = sim._trade_water_level(rome)
    mar = sim._centre_maritime_map()[B0]
    sea = bool(water[B0] > 0) and bool(mar[c_t]) and bool(mar[cap])
    rng = sim._trade_sea_range if sea else sim._trade_range
    reach = int(sim.pair_dist[c_t, cap]) <= rng and bool(
        sim._trade_walk_ok(ONE, torch.tensor([c_t]), torch.tensor([cap]), water)[0])
    assert sim._transfer_city(B0, egypt, 0, rome, conquest=True), "the conquest itself failed"
    assert bool(sim.trading_post[B0, rome, c_t]), "no Trading Post in the conquered city"
    if reach:
        for i in walk(sim, rome, c_t, cap):
            if not bool(sim.water[B0, i]):
                assert bool(sim.road[B0, i]), f"no road on the course at {i}"
    print(f"  3 Rome conquest OK — the post, and the road ({'in' if reach else 'out of'} range)")


def test_rome_chain_gold(rules, path) -> None:
    sim = fresh(rules, path)
    rome = row_of(sim, "ROME")
    cap = int(sim.civ_cap_tile[B0, rome])
    t = site_near(sim, cap)
    sim._found_city_at(rome, torch.tensor([True]), torch.tensor([t]))
    assert int(sim.tile_seat[B0, t]) == rome
    # a route from the capital to city-state 0, chained through the own city
    sim.seat_routes[B0, rome, 0, 0] = int(sim.city_id[B0, rome, 0])
    sim.seat_routes[B0, rome, 0, 1] = -2
    sim.seat_route_exp[B0, rome, 0] = int(sim.turn) + 5
    sim.seat_route_chain[B0, rome, 0, :] = -1
    sim.seat_route_chain[B0, rome, 0, 0] = t
    sim._eff_version += 1
    inc = sim._seat_route_income(rome)
    assert inc is not None
    g_rome = float(inc[B0, 0, 2])
    play(sim, rome, "EGYPT")
    sim._eff_version += 1
    g_other = float(sim._seat_route_income(rome)[B0, 0, 2])
    play(sim, rome, "ROME")
    assert abs((g_rome - g_other) - 1.0) < 1e-9, (g_rome, g_other)
    print("  4 Rome chain gold OK — +1 per own-city hop")


def _river_district(sim, row: int) -> tuple[int, int]:
    """(campus index, an owned river plot) — the queue head under Iteru."""
    campus = next(i for i, d in enumerate(sim.districts_cat) if d["id"] == "CAMPUS")
    own = (~sim.water[B0] & sim.passable[B0] & (sim.tile_seat[B0] == row)
           & (sim.centre_slot_at[B0] < 0) & (sim.district[B0] < 0))
    wet = own & sim.tile_river[B0]
    if bool(wet.any()):
        t = int(wet.nonzero(as_tuple=True)[0][0])
    else:
        t = int(own.nonzero(as_tuple=True)[0][0])
        sim.tile_river[B0, t] = True
    return campus, t


def _produce(sim, row: int, t: int, campus: int) -> float:
    sim.city_current[B0, row, 0, 0] = sim.DISTRICT_BASE + campus
    sim.city_qtile[B0, row, 0, 0] = t
    sim.city_progress[B0, row, 0, 0] = 0
    sim.city_cost[B0, row, 0, 0] = 100000
    sim._eff_version += 1
    sim._seat_city_produce(row, torch.tensor([0]), torch.tensor([True]),
                           torch.tensor([20.0], dtype=torch.float64))
    return float(sim.city_progress[B0, row, 0, 0])


def test_iteru_production(rules, path) -> None:
    sim = fresh(rules, path)
    egypt = row_of(sim, "EGYPT")
    campus, t = _river_district(sim, egypt)
    p_egypt = _produce(sim, egypt, t, campus)
    sim2 = fresh(rules, path)
    play(sim2, egypt, "ROME")
    campus2, t2 = _river_district(sim2, egypt)
    assert (campus2, t2) == (campus, t)
    p_other = _produce(sim2, egypt, t, campus)
    assert p_other > 0 and abs(p_egypt - p_other * sim._iteru_mult) < 1e-9, (p_egypt, p_other)
    # off the river, the same hammers
    sim3 = fresh(rules, path)
    dry = (~sim3.water[B0] & sim3.passable[B0] & (sim3.tile_seat[B0] == egypt)
           & (sim3.centre_slot_at[B0] < 0) & (sim3.district[B0] < 0) & ~sim3.tile_river[B0])
    td = int(dry.nonzero(as_tuple=True)[0][0])
    p_dry = _produce(sim3, egypt, td, campus)
    assert abs(p_dry - p_other) < 1e-9, (p_dry, p_other)
    # a WONDER head: its plot is the registry's, not the queue entry's
    sim4 = fresh(rules, path)
    _c4, t4 = _river_district(sim4, egypt)
    assert t4 == t
    sim4.city_wonder[B0, egypt, 0, 0] = t
    sim4.city_current[B0, egypt, 0, 0] = sim4.WONDER_BASE
    sim4.city_qtile[B0, egypt, 0, 0] = -1
    sim4.city_progress[B0, egypt, 0, 0] = 0
    sim4.city_cost[B0, egypt, 0, 0] = 100000
    sim4._eff_version += 1
    sim4._seat_city_produce(egypt, torch.tensor([0]), torch.tensor([True]),
                            torch.tensor([20.0], dtype=torch.float64))
    p_w = float(sim4.city_progress[B0, egypt, 0, 0])
    assert abs(p_w - p_other * sim._iteru_mult) < 1e-9, (p_w, p_other)
    print("  5 Iteru production OK — x1.15 on a river plot (district or wonder), x1 off it")


def test_iteru_flood(rules, path) -> None:
    lo = fresh(rules, path)._flood_dmg_lo
    sev = int(lo.argmax())
    assert int(lo[sev]) > 0, "no severity damages for sure"
    warrior, farm = UNITS.index("WARRIOR"), IMPS.index("FARM")

    def run(as_civ: str) -> tuple[int, int]:
        sim = fresh(rules, path)
        egypt = row_of(sim, "EGYPT")
        play(sim, egypt, as_civ)
        own = (~sim.water[B0] & sim.passable[B0] & (sim.tile_seat[B0] == egypt)
               & (sim.centre_slot_at[B0] < 0) & (sim.district[B0] < 0)
               & (sim.military_at[B0] < 0) & (sim.civilian_at[B0] < 0))
        fp = own & sim.floodplain[B0]
        t = int((fp if bool(fp.any()) else own).nonzero(as_tuple=True)[0][0])
        sim.floodplain[B0, t] = True
        sim.improvement[B0, t] = farm
        sim.pillaged[B0, t] = False
        slot = place(sim, t, warrior, egypt)
        sim._flood_tile(torch.tensor([True]), torch.tensor([t]), torch.tensor([sev]),
                        torch.tensor([False]))
        return int(sim.major_unit_hp[B0, slot]), int(sim.improvement[B0, t])

    hp_e, imp_e = run("EGYPT")
    assert hp_e == 100 and imp_e == farm, "Egypt's ground took flood damage"
    hp_r, _imp_r = run("ROME")
    assert hp_r < 100, "the flood damaged nothing once Egypt left"
    print("  6 Iteru flood OK — Egypt's ground is not damaged")


def test_knarr_ocean(rules, path) -> None:
    sim = fresh(rules, path)
    norway, rome = row_of(sim, "NORWAY"), row_of(sim, "ROME")
    ship, carto = TECHS.index("SHIPBUILDING"), TECHS.index("CARTOGRAPHY")
    for r in (norway, rome):
        sim.civ_techs[B0, r, ship] = False
        sim.civ_techs[B0, r, carto] = False
    assert not bool(sim._row_ocean_open(norway)[B0])
    sim.civ_techs[B0, norway, ship] = True
    sim.civ_techs[B0, rome, ship] = True
    assert bool(sim._row_ocean_open(norway)[B0]), "Shipbuilding did not open the Ocean to Norway"
    assert not bool(sim._row_ocean_open(rome)[B0]), "Shipbuilding opened the Ocean to Rome"
    assert bool(sim._ocean_open(torch.tensor([norway]))[B0])
    assert not bool(sim._ocean_open(torch.tensor([rome]))[B0])
    sim.civ_techs[B0, rome, carto] = True
    assert bool(sim._row_ocean_open(rome)[B0])
    print("  7 Knarr Ocean OK — Shipbuilding for Norway, Cartography for everyone")


def test_naval_heal(rules, path) -> None:
    sim = fresh(rules, path)
    norway, rome, egypt = row_of(sim, "NORWAY"), row_of(sim, "ROME"), row_of(sim, "EGYPT")
    galley, frigate, warrior = UNITS.index("GALLEY"), UNITS.index("FRIGATE"), UNITS.index("WARRIOR")
    wet = (sim.water[B0] & (sim.tile_seat[B0] < 0) & (sim.military_at[B0] < 0)).nonzero(as_tuple=True)[0]
    assert wet.numel() >= 3
    t_n, t_r, t_f = int(wet[0]), int(wet[1]), int(wet[2])

    def heal(slot: int) -> int:
        return int(sim._seat_heal("major")[B0, slot])

    s_n = place(sim, t_n, galley, norway, hp=50)
    s_r = place(sim, t_r, galley, rome, hp=50)
    # CIV6 (COMBAT_HEAL_NAVAL_NEUTRAL 0) + (Knarr) +10 for naval melee
    assert heal(s_r) == 0, "a hull healed in neutral waters"
    assert heal(s_n) == sim._knarr_heal, "Norway's galley did not heal in neutral waters"
    # own waters 20, anyone else's 0
    sim.tile_seat[B0, t_r] = rome
    assert heal(s_r) == 20
    sim.tile_seat[B0, t_r] = egypt
    assert heal(s_r) == 0
    sim.tile_seat[B0, t_r] = -1
    # the heal-outside promotion: +10 neutral, +5 enemy
    bit = heal_anywhere_bit(sim, galley)
    sim.major_unit_promos[B0, s_r] = bit
    sim.major_unit_promos[B0, s_n] = bit
    assert heal(s_r) == 10 and heal(s_n) == 10 + sim._knarr_heal
    sim.tile_seat[B0, t_r] = egypt
    assert heal(s_r) == 5
    sim.tile_seat[B0, t_r] = -1
    # a ranged hull is not melee; a land unit reads the land table
    s_f = place(sim, t_f, frigate, norway, hp=50)
    assert heal(s_f) == 0, "the Knarr healed a ranged hull"
    land = int((~sim.water[B0] & sim.passable[B0] & (sim.tile_seat[B0] < 0)
                & (sim.military_at[B0] < 0)).nonzero(as_tuple=True)[0][0])
    s_w = place(sim, land, warrior, norway, hp=50)
    assert heal(s_w) == 10, "the land table moved"
    print("  8 naval heal OK — 20 / 0 / 0, the promotion's +10 / +5, the Knarr's +10")


def test_epic_quest_levy(rules, path) -> None:
    sim = fresh(rules, path)
    rome = row_of(sim, "ROME")
    base = float(sim.rules.citystate["levyGoldCost"])
    assert sim._levy_cost(rome) == base
    play(sim, rome, "SUMERIA")
    assert sim._levy_cost(rome) == base * sim._epic_levy_mult
    play(sim, rome, "ROME")
    print("  9 Epic Quest OK — half-price levies")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_roster(rules, path)
    test_rome_founding(rules, path)
    test_rome_conquest(rules, path)
    test_rome_chain_gold(rules, path)
    test_iteru_production(rules, path)
    test_iteru_flood(rules, path)
    test_knarr_ocean(rules, path)
    test_naval_heal(rules, path)
    test_epic_quest_levy(rules, path)
    print("BATTERY OK civ_abilities")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
