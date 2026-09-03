"""THE FOLLOWER, THE LEVY AND THE ROUTE — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/follower_rows_test.py

The TS twin is tests/cpu/seats/follower-rows.test.ts.

CIV6 (the install's TraitModifiers): Dharma, The Last Prophet, Songs of the
Jeli, Mediterranean Colonies, Swift Hawk, the Raven King and Radio Oranje.
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
TECHS = [t["id"] for t in RULES["techs"]]
BUILDINGS = [b["id"] for b in RULES["buildings"]]


def play(sim, row: int, name):
    """Seat one roster row, or clear it (`name=None`) for the BASELINE."""
    if name is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[0, row] = ci
        sim.row_leader[0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1
    if sim._gov_pol_cache is not None:
        sim._gov_pol_cache.clear()


def lead(sim, row: int, civ: str, leader: str) -> None:
    play(sim, row, civ)
    sim.row_leader[0, row] = sim._leader_idx(leader)
    sim._eff_version += 1


def fresh(rules, path) -> BatchSim:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for r, name in enumerate(("ROME", "EGYPT", "NORWAY")):
        play(sim, r, name)
    return settle_all(sim)


def seat(sim, row: int, name, leader=None):
    if leader is None:
        play(sim, row, name)
    else:
        lead(sim, row, name, leader)


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert len(sim._religion_amenity_rows) == 1 and len(sim._all_follower_belief_rows) == 1
    assert len(sim._route_pressure_rows) == 1 and len(sim._foreign_follower_yield_rows) == 1
    assert len(sim._gp_guarantee_rows) == 1 and len(sim._faith_purchase_district_rows) == 1
    assert len(sim._start_boost_rows) == 1 and len(sim._post_combat_loyalty_rows) == 1
    assert len(sim._levy_rows) == 1 and len(sim._domestic_route_loyalty_rows) == 1
    assert len(sim._incoming_route_yield_rows) == 1
    # by ROW, not by the list's length: this lane is about Swift Hawk, and
    # every later civilization that joins the family moves a bare count
    assert sum(1 for r in sim._combat_cs_rows if r[4] == 5) == 1, (
        "Swift Hawk's foeGolden row is not the only one of its kind")
    # the install's own magnitudes
    assert sim._post_combat_loyalty_rows[0][2] == -20 and sim._post_combat_loyalty_rows[0][3] == -20
    assert sim._levy_rows[0][2] == 75
    print("  1 wire OK — 11 families, and the combat rows read 8")


def test_dharma(rules, path) -> None:
    """An Amenity per religion with pressure in the city."""
    def present(name, p) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        s2.city_pressure[B0, 0, 0, :] = 0
        for g, v in enumerate(p):
            s2.city_pressure[B0, 0, 0, g] = v
        s2._eff_version += 1
        return int(s2._religions_present(0)[B0, 0])

    assert present(None, (0, 0)) == 0, "a bare city had a religion present"
    assert present(None, (5, 0)) == 1 and present(None, (5, 3)) == 2

    def amen(name, p) -> float:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        s2.city_pressure[B0, 0, 0, :] = 0
        for g, v in enumerate(p):
            s2.city_pressure[B0, 0, 0, g] = v
        s2._eff_version += 1
        # the amenity TIER is what `_seat_amenity` returns, so the flat add is
        # read at its own reader (the TS twin pins the full arithmetic)
        n = 0.0
        for _rc, _rl, _rf, _ra in s2._religion_amenity_rows:
            if bool(s2._row_is(0, _rc, _rl)[B0]):
                n += float(s2._religions_present(0, _rf)[B0, 0]) * _ra
        return n

    assert amen("INDIA", (5, 3)) == 2.0, "Dharma paid the wrong count"
    assert amen(None, (5, 3)) == 0.0, "a plain seat took the amenity"
    print("  2 Dharma OK — one Amenity per religion present, none for a plain seat")


def test_last_prophet(rules, path) -> None:
    """Only ANOTHER seat's cities following this seat's religion count."""
    sim = fresh(rules, path)
    play(sim, 0, "ARABIA")
    sim.city_followed[B0] = -1
    assert int(sim._foreign_follower_count(0)[B0]) == 0
    # my OWN city following my religion does not count
    sim.city_followed[B0, 0, 0] = 0
    assert int(sim._foreign_follower_count(0)[B0]) == 0, "an own city counted"
    if sim.n_majors > 1 and bool(sim.city_alive[B0, 1, 0]):
        sim.city_followed[B0, 1, 0] = 0
        assert int(sim._foreign_follower_count(0)[B0]) == 1, "a foreign follower did not count"
        sim.city_followed[B0, 1, 0] = 1
        assert int(sim._foreign_follower_count(0)[B0]) == 0, "another religion counted"
    print("  3 The Last Prophet OK — foreign cities only, and this row's religion only")


def test_guarantee(rules, path) -> None:
    """The last Great Prophet, handed over when one remains."""
    cls = fresh(rules, path)._prophet_cls

    def earned(name, claim_to_last: bool, already: int) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        nR = int(s2._gp_roster[cls])
        assert nR > 1, "the prophet roster is too small to tell"
        s2.gp_claimed[B0, cls, :] = False
        if claim_to_last:
            s2.gp_claimed[B0, cls, : nR - 1] = True
        s2.civ_gp_earned[B0, 0, cls] = already
        s2.gp_offer[B0, cls] = -1
        before = int(s2.civ_gp_earned[B0, 0, cls])
        s2._grant_guaranteed_great_people(0, torch.ones(s2.B, dtype=torch.bool))
        return int(s2.civ_gp_earned[B0, 0, cls]) - before

    assert earned("ARABIA", True, 0) == 1, "Arabia was not handed the last Prophet"
    assert earned("ARABIA", False, 0) == 0, "handed one before the next-to-last claim"
    assert earned("ARABIA", True, 1) == 0, "handed one to a seat that had earned one"
    assert earned(None, True, 0) == 0, "a plain seat was handed one"
    print("  4 the guarantee OK — one Prophet, only at the last, only if none earned")


def test_faith_door(rules, path) -> None:
    """Mali buys a Commercial Hub building with Faith, suzerain or not."""
    hub = RULES["districts"]
    hub_i = [d["id"] for d in hub].index("COMMERCIAL_HUB")
    sim = fresh(rules, path)
    mkt = next((i for i in range(sim.NB)
                if int(sim._b_req_district[i]) == hub_i and not bool(sim._b_worship[i])), -1)
    assert mkt >= 0, "no Commercial Hub building on the wire"

    def ok(name) -> bool:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        return bool(s2._faith_buyable_class(0)[B0, mkt])

    assert ok("MALI"), "Mali could not buy its Commercial Hub building with Faith"
    assert not ok(None), "a plain seat could"
    # a worship building stays outside the door for both
    wb = next(i for i in range(sim.NB) if bool(sim._b_worship[i]))
    s3 = fresh(rules, path)
    play(s3, 0, "MALI")
    assert not bool(s3._faith_buyable_class(0)[B0, wb]), "a worship building came through the door"
    print("  5 Songs of the Jeli OK — the Commercial Hub opens, the worship building does not")


def test_mediterranean_colonies(rules, path) -> None:
    """Phoenicia starts with the Writing eureka, and nobody else does."""
    sim = fresh(rules, path)
    play(sim, 0, "PHOENICIA")
    sim.civ_tech_boosted[B0, 0, :] = False
    sim._apply_roster_start()
    assert bool(sim.civ_tech_boosted[B0, 0, TECHS.index("WRITING")]), "no Writing eureka"
    play(sim, 1, "ROME")
    sim.civ_tech_boosted[B0, 1, :] = False
    sim._apply_roster_start()
    assert not bool(sim.civ_tech_boosted[B0, 1, TECHS.index("WRITING")]), "a plain seat took it"
    print("  6 Mediterranean Colonies OK — the Writing eureka at the start")


def test_swift_hawk_strength(rules, path) -> None:
    """+10 against a seat in a golden age."""
    sim = fresh(rules, path)
    warrior = UNITS.index("WARRIOR")
    land = next(t for t in range(sim.T) if not bool(sim.water[B0, t]) and bool(sim.passable[B0, t]))
    hp = torch.tensor([100.0], dtype=sim.unit_hp.dtype)

    def cs(age: int) -> int:
        sim.civ_age[B0, 1] = age
        sim._eff_version += 1
        return int(sim._roster_cs(torch.tensor([0]), torch.tensor([warrior]),
                                  torch.tensor([land]), torch.tensor([1]), hp, False)[B0])

    lead(sim, 0, "MAPUCHE", "LAUTARO")
    assert cs(2) == 10, "no strength against a golden-age seat"
    assert cs(1) == 0, "strength against a seat outside a golden age"
    play(sim, 0, "ROME")
    assert cs(2) == 0, "the strength outlived Lautaro"
    print("  7 Swift Hawk's strength OK — +10 in a golden age, 0 outside one")


def test_swift_hawk_loyalty(rules, path) -> None:
    """The DEFEATED side's city loses loyalty, doubled in a golden age."""
    def drop(name, leader, age: int, in_city: bool) -> float:
        s2 = fresh(rules, path)
        seat(s2, 0, name, leader)
        if s2.n_majors < 2 or not bool(s2.city_alive[B0, 1, 0]):
            return 0.0
        s2.civ_age[B0, 1] = age
        ctr = int(s2.city_center[B0, 1, 0])
        at = next(int(x) for x in s2.neigh[ctr].tolist() if x >= 0)
        if in_city:
            s2.tile_seat[B0, at] = 1
            s2.tile_city[B0, at] = int(s2.city_id[B0, 1, 0])
        else:
            s2.tile_seat[B0, at] = -1
            s2.tile_city[B0, at] = -1
        s2._tile_owner_ver += 1
        s2.city_loyalty[B0, 1, 0] = 100.0
        one = torch.ones(s2.B, dtype=torch.bool)
        s2._post_combat_loyalty(one, torch.zeros(s2.B, dtype=torch.long),
                                torch.ones(s2.B, dtype=torch.long),
                                torch.full((s2.B,), at, dtype=torch.long), None, one)
        return float(s2.city_loyalty[B0, 1, 0])

    assert drop("MAPUCHE", "LAUTARO", 0, True) == 80.0, "the plain loss is not 20"
    assert drop("MAPUCHE", "LAUTARO", 2, True) == 60.0, "the golden loss is not 40"
    assert drop(None, None, 2, True) == 100.0, "a plain seat dropped it"
    assert drop("MAPUCHE", "LAUTARO", 2, False) == 100.0, "a kill outside the borders dropped it"
    print("  8 Swift Hawk's loyalty OK — 20 plain, 40 golden, none outside the borders")


def test_radio_oranje(rules, path) -> None:
    """Culture from a foreign route in, Loyalty from a domestic route out."""
    bidx, col = torch.tensor([B0]), torch.tensor([0])

    def loyalty(name, leader, n: int) -> float:
        s2 = fresh(rules, path)
        seat(s2, 0, name, leader)
        s2.seat_routes[B0, 0, :, :] = -1
        s2.seat_route_dseat[B0, 0, :] = -1
        cid = int(s2.city_id[B0, 0, 0])
        for k in range(n):
            s2.seat_routes[B0, 0, k, 0] = cid
            s2.seat_routes[B0, 0, k, 1] = cid + 1
            s2.seat_route_dseat[B0, 0, k] = -1
        s2._eff_version += 1
        return float(s2._standing_loyalty(0, bidx, col)[0])

    assert loyalty("NETHERLANDS", "WILHELMINA", 0) == loyalty(None, None, 0), "a routeless city paid"
    assert loyalty("NETHERLANDS", "WILHELMINA", 2) == loyalty(None, None, 2) + 4, "two routes did not pay 4"
    print("  9 Radio Oranje OK — +2 Loyalty per domestic route out of the origin")


def test_missionary_spreads(rules, path) -> None:
    """India's Missionary carries two more charges."""
    def charges(name) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        ui = torch.full((s2.B,), UNITS.index("MISSIONARY"), dtype=torch.long)
        at = torch.full((s2.B,), int(s2.city_center[B0, 0, 0]), dtype=torch.long)
        return int(s2._extra_charges(0, ui, at)[B0])

    assert charges("INDIA") == charges(None) + 2, "Dharma's two spreads"
    print("  10 Dharma's Missionary OK — two more spreads than anyone else")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_dharma(rules, path)
    test_last_prophet(rules, path)
    test_guarantee(rules, path)
    test_faith_door(rules, path)
    test_mediterranean_colonies(rules, path)
    test_swift_hawk_strength(rules, path)
    test_swift_hawk_loyalty(rules, path)
    test_radio_oranje(rules, path)
    test_missionary_spreads(rules, path)
    print("BATTERY OK follower_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
