"""THE FREE CITY STEP (C-60) — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/free_city_test.py

The TS twin is tests/cpu/city/free-city.test.ts.

CIV6: "When Loyalty reaches 0, the city revolts against its owner and becomes
a Free City. Free Cities belong to no civilization ... If a Free City's
Loyalty drops to 0, its experiment of independence fails, and they seek to
join a civilization" — "the Civilization that has exerted the most Loyalty
pressure on it since the Free City became independent". Eleanor
(EFFECT_ADJUST_PLAYER_SKIP_FREE_CITY_STEP) skips the step for a city her pull
takes. Both engines were equally wrong before (a revolt went straight to the
highest-pressure seat), so the parity gate cannot see this; these scenes are
the proof.
  1. the wire: Eleanor's two rows, the two loyalty parameters, the free row
  2. a revolt makes a Free City — people, health and buildings kept, loyalty
     100, the race at zero; the old owner lost it, the puller did not gain it
  3. Eleanor's pull skips the step: the city joins her at once
  4. a Free City runs its own loyalty, and joins the seat whose accumulated
     pull is highest; its slot compacts away
  5. anyone may attack it without a declaration — no war opens
  6. a Free City heals in its own phase and presses on its neighbours
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import FREE_SEAT
from warmup import settle_all, plant_city

B0 = 0
ROOT = Path(__file__).resolve().parent.parent.parent
RULES = json.loads((ROOT / "seeder" / "worlds" / "rules.json").read_text())
UNI = [u["id"] for u in RULES["units"]]


def play(sim, row: int, name) -> None:
    ci = sim._civ_ids.index(name)
    sim.row_civ[B0, row] = ci
    sim.row_leader[B0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def lead(sim, row: int, civ: str, leader: str) -> None:
    play(sim, row, civ)
    sim.row_leader[B0, row] = sim._leader_idx(leader)
    sim._eff_version += 1


def fresh(rules, path, eleanor: bool = False) -> BatchSim:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for r, name in enumerate(("ROME", "EGYPT", "NORWAY")):
        play(sim, r, name)
    if eleanor:
        lead(sim, 1, "ENGLAND", "ELEANOR_ENGLAND")
    return settle_all(sim)


def revolt(sim, row: int = 0):
    """Give `row` a second city and let it revolt; returns its centre tile."""
    plant_city(sim, row)
    col = int(sim.city_alive[B0, row].nonzero()[-1])
    centre = int(sim.city_center[B0, row, col])
    assert not bool(sim.city_is_cap[B0, row, col])
    sim.city_pop[B0, row, col] = 3
    sim.city_hp[B0, row, col] = 150
    flip = torch.zeros(sim.B, sim.RC, dtype=torch.bool)
    flip[B0, col] = True
    sim._seat_loyalty_flips(row, flip)
    return centre


def free_slot(sim, centre: int) -> int:
    col = int(sim.centre_slot_at[B0, centre])
    assert col >= 0 and bool(sim.city_alive[B0, sim.FREE_ROW, col]), "the city is not on the free row"
    return col


def spot_at(sim, centre: int, dist: int) -> int:
    """a foundable tile exactly `dist` from `centre`, 4+ from every centre."""
    ctrs = torch.cat((sim.city_center[B0, :sim.n_majors].reshape(-1), sim.city_center[B0, sim.FREE_ROW]))
    alv = torch.cat((sim.city_alive[B0, :sim.n_majors].reshape(-1), sim.city_alive[B0, sim.FREE_ROW]))
    allc = torch.cat((ctrs[alv], sim.citystate_center[B0][sim.citystate_alive[B0]])).clamp(min=0)
    dmin = sim.pair_dist[:, allc].min(dim=1).values.to(torch.long)
    d = sim.pair_dist[centre].to(torch.long)
    ok = ((d == dist) & (sim.tile_seat[B0] < 0) & sim.settle_ok[B0] & (sim.district[B0] < 0)
          & (sim.built_wonder[B0] < 0) & (dmin >= 4) & (sim.civilian_at[B0] < 0) & (sim.military_at[B0] < 0))
    idx = ok.nonzero(as_tuple=True)[0]
    assert len(idx), f"no foundable tile at distance {dist}"
    return int(idx[0])


def put(sim, row: int, tile: int, kind: str) -> int:
    """seat a unit of `kind` on `tile`; returns its pool slot."""
    slot = int(sim.unit_next[B0])
    sim.unit_next[B0] += 1
    lo = sim.POOL_LO["major"]
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = row
    sim.major_unit_type[B0, slot] = UNI.index(kind)
    sim.major_unit_tile[B0, slot] = tile
    sim.major_unit_hp[B0, slot] = 100
    sim.major_unit_mp[B0, slot] = 2
    sim.major_unit_mp_full[B0, slot] = 2
    sim.major_unit_attacks[B0, slot] = 1
    sim.military_at[B0, tile] = slot + lo
    sim._gen_ver += 1
    return slot


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    rows = sim._skip_free_city_rows
    assert len(rows) == 2, f"Eleanor has two leaders, wire has {len(rows)}"
    leads = {sim._leader_idx("ELEANOR_ENGLAND"), sim._leader_idx("ELEANOR_FRANCE")}
    assert {l for _c, l in rows} == leads and all(c < 0 for c, _l in rows), rows
    assert sim._free_city_loyalty == 10.0, "IDENTITY_PER_TURN_FROM_FREE_CITIES is 10"
    assert sim._loyalty_after_cultural == 100.0, "LOYALTY_AFTER_TRANSFERRED_BY_CULTURAL_IDENTITY is 100"
    assert sim.FREE_ROW == sim.n_majors + max(sim.S, 1) and sim.BARB_ROW == sim.FREE_ROW + 1
    assert int(sim._seat_row[FREE_SEAT]) == sim.FREE_ROW and int(sim._ROW_SEAT[sim.FREE_ROW]) == FREE_SEAT
    for name in ("city_alive", "city_id", "city_spec_pin", "city_wonder", "city_reactor_age", "city_free_press"):
        assert getattr(sim, name).shape[1] == sim.CITY_ROWS, f"{name} has no free row"
    assert bool(sim._skips_free_city(1).any()) is False
    lead(sim, 1, "ENGLAND", "ELEANOR_ENGLAND")
    assert bool(sim._skips_free_city(1)[B0]) and not bool(sim._skips_free_city(0)[B0])
    print("  1 the wire OK — Eleanor's two rows, +10/turn, 100 after a transfer, the free row")


def test_revolt_makes_free_city(rules, path) -> None:
    sim = fresh(rules, path)
    n0 = int(sim.city_alive[B0, 0].sum())
    n1 = int(sim.city_alive[B0, 1].sum())
    centre = revolt(sim)
    col = free_slot(sim, centre)
    F = sim.FREE_ROW
    assert int(sim.city_alive[B0, 0].sum()) == n0, "the old owner still holds it"
    assert int(sim.city_alive[B0, 1].sum()) == n1, "the puller gained it"
    assert int(sim.tile_seat[B0, centre]) == FREE_SEAT
    assert int(sim.tile_city[B0, centre]) == int(sim.city_id[B0, F, col])
    assert int(sim.city_pop[B0, F, col]) == 3, "a revolt is not a conquest: the people stay"
    assert int(sim.city_hp[B0, F, col]) == 150, "...and the health"
    assert float(sim.city_loyalty[B0, F, col]) == 100.0
    assert not bool(sim.city_is_cap[B0, F, col])
    assert float(sim.city_free_press[B0, F, col].abs().sum()) == 0.0
    assert int(sim.free_next_city_id[B0]) == 1
    owned = (sim.tile_seat[B0] == FREE_SEAT).sum()
    assert int(owned) >= 1 and bool((sim.tile_city[B0][sim.tile_seat[B0] == FREE_SEAT] == int(sim.city_id[B0, F, col])).all())
    sim._check_rc_registry_invariant()
    print("  2 the revolt OK — a Free City, kept whole, on the free row")


def test_eleanor_skips(rules, path) -> None:
    sim = fresh(rules, path, eleanor=True)
    n1 = int(sim.city_alive[B0, 1].sum())
    centre = revolt(sim)
    assert int(sim.city_alive[B0, 1].sum()) == n1 + 1, "Eleanor's pull did not take the city"
    assert not bool(sim.city_alive[B0, sim.FREE_ROW].any())
    assert int(sim.tile_seat[B0, centre]) == 1
    print("  3 Eleanor OK — the city skips the Free step and joins her")


def test_free_city_loyalty_and_join(rules, path) -> None:
    sim = fresh(rules, path)
    centre = revolt(sim)
    col = free_slot(sim, centre)
    F = sim.FREE_ROW
    # a rival city of 30 four tiles away outweighs the Free City's own 1
    spot = spot_at(sim, centre, 4)
    got = sim._found_city_at(1, torch.tensor([True]), torch.tensor([spot]))
    assert bool(got[B0]), "the rival could not found beside the Free City"
    rcol = int(sim.centre_slot_at[B0, spot])
    sim.city_pop[B0, 1, rcol] = 30
    sim.city_pop[B0, F, col] = 1
    sim._eff_version += 1
    here = torch.tensor([centre])
    own = float(sim._citizen_pressure_from(here, F)[B0])
    pulls = [float(sim._citizen_pressure_from(here, r)[B0]) * float(sim._age_factor[int(sim.civ_age[B0, r])])
             for r in range(sim.n_majors)]
    assert own == 10.0 and pulls[1] == 30 * 6, (own, pulls)
    # the old owner's capital is still inside range 9 of the city it lost
    assert pulls[0] > 0 and pulls[0] < pulls[1], pulls
    foreign = sum(pulls)
    built = float(sim._built_loyalty(F, torch.tensor([B0]), torch.tensor([col]))[B0])
    sim.city_loyalty[B0, F, col] = 90.0
    sim._free_cities_phase()
    loy = float(sim.city_loyalty[B0, F, col])
    # +10 base, the pressure term, and what stands in it (the Monument's +1)
    assert abs(loy - (90.0 + 10.0 + 20.0 * (own - foreign) / (own + foreign) + built)) < 1e-9, (loy, built)
    race = sim.city_free_press[B0, F, col]
    assert [float(x) for x in race[:sim.n_majors]] == pulls, (race.tolist(), pulls)
    # ...and at 0 it joins the row that pulled hardest, kept whole
    sim.city_loyalty[B0, F, col] = 1.0
    n1 = int(sim.city_alive[B0, 1].sum())
    sim._free_cities_phase()
    assert not bool(sim.city_alive[B0, F].any()), "the Free City did not join"
    assert int(sim.city_alive[B0, 1].sum()) == n1 + 1
    jcol = int(sim.centre_slot_at[B0, centre])
    assert int(sim.tile_seat[B0, centre]) == 1 and int(sim.city_pop[B0, 1, jcol]) == 1
    assert float(sim.city_loyalty[B0, 1, jcol]) == 100.0
    assert float(sim.city_free_press[B0, 1, jcol].abs().sum()) == 0.0
    # the RACE decides, not who pulls hardest now: a seat that pulled the most
    # since the revolt takes the city even when a nearer seat pulls today
    sim2 = fresh(rules, path)
    c2 = revolt(sim2)
    col2 = free_slot(sim2, c2)
    F2 = sim2.FREE_ROW
    assert float(sim2._citizen_pressure_from(torch.tensor([c2]), 2)[B0]) == 0.0, "row 2 must be out of range here"
    sim2.city_free_press[B0, F2, col2, 2] = 10_000.0
    sim2.city_loyalty[B0, F2, col2] = 0.0
    sim2.city_pop[B0, F2, col2] = 1
    sim2._free_city_loyalty = -1000.0  # hold it at 0 whatever pulls today
    n2 = int(sim2.city_alive[B0, 2].sum())
    sim2._free_cities_phase()
    assert not bool(sim2.city_alive[B0, F2].any()) and int(sim2.city_alive[B0, 2].sum()) == n2 + 1, \
        "the race's leader did not take the city"
    assert int(sim2.tile_seat[B0, c2]) == 2
    print("  4 the Free City's loyalty OK — +10 and the pressure term, the race, the join")


def test_anyone_may_attack(rules, path) -> None:
    sim = fresh(rules, path)
    centre = revolt(sim)
    col = free_slot(sim, centre)
    F = sim.FREE_ROW
    assert not bool(sim.war[B0].any()), "the scene starts at peace"
    for row in range(sim.n_majors):
        assert bool(sim._seats_hostile(row, torch.tensor([[FREE_SEAT]]))[B0, 0]), f"row {row} may not hit a Free City"
    assert not bool(sim._seats_hostile(FREE_SEAT, torch.tensor([[FREE_SEAT]]))[B0, 0])
    assert int(sim._centre_target_seat(torch.tensor([FREE_SEAT]))[0]) == FREE_SEAT
    assert int(sim._holder_row(torch.tensor([FREE_SEAT]))[0]) == F
    nb = next(int(n) for n in sim.neigh[centre].tolist()
              if n >= 0 and bool(sim.passable[B0, n]) and not bool(sim.wpass[B0, n])
              and int(sim.military_at[B0, n]) < 0)
    u = put(sim, 1, nb, "WARRIOR")
    hp0 = int(sim.city_hp[B0, F, col])
    sim._melee_city(torch.tensor([True]), torch.tensor([centre]), "major", u)
    assert int(sim.city_hp[B0, F, col]) < hp0, "the assault did not land"
    assert not bool(sim.war[B0].any()), "attacking a Free City opened a war"
    print("  5 the attack OK — any seat, no declaration, no war opened")


def test_heal_and_pressure(rules, path) -> None:
    sim = fresh(rules, path)
    centre = revolt(sim)
    col = free_slot(sim, centre)
    F = sim.FREE_ROW
    sim.city_hp[B0, F, col] = 100
    sim.city_pop[B0, F, col] = 20
    sim._free_cities_phase()
    assert int(sim.city_hp[B0, F, col]) == 120, "a Free City did not heal"
    # its citizens press on the majors' loyalty walk as a foreign term
    spot = spot_at(sim, centre, 4)
    got = sim._found_city_at(0, torch.tensor([True]), torch.tensor([spot]))
    assert bool(got[B0])
    assert float(sim._citizen_pressure_from(torch.tensor([spot]), F)[B0]) == 20 * 6
    # a whole turn runs clean with a Free City on the map, and it persists
    for _ in range(3):
        sim.step()
    assert bool(sim.city_alive[B0, F, col]) or bool(sim.city_alive[B0, F].any())
    print("  6 the heal and the pressure OK — and three full turns with a Free City")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_revolt_makes_free_city(rules, path)
    test_eleanor_skips(rules, path)
    test_free_city_loyalty_and_join(rules, path)
    test_anyone_may_attack(rules, path)
    test_heal_and_pressure(rules, path)
    print("BATTERY OK free_city")
    return 0


if __name__ == "__main__":
    sys.exit(main())
