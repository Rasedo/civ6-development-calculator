"""THE CONSULATE'S EMPIRE-WIDE HALF — the GPU side.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/consulate_test.py

The TS twin is tests/cpu/units/consulate.test.ts.

CIV6 (Consulate): "+2 Influence Points per turn. Enemy Spy's level is reduced
by 1 when targeting this city OR CITIES WITH ENCAMPMENTS." The second half is
EMPIRE-WIDE: the building stands in one city and covers every other city of
the same seat that holds a live Encampment.

No scripted lane reaches it — it wants a Diplomatic Quarter with a Consulate in
one city and a finished Encampment in another, of the same seat, with an enemy
spy working the second.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import plant_city, settle_all


def build(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def two_city_row(sim) -> tuple[int, int, int]:
    """A seat row holding two living cities — the second planted over the
    engine's own FOUND verb, because a bare `step()` founds nothing."""
    row = next(r for r in range(sim.n_majors) if bool(sim.city_alive[0, r, 0]))
    if not bool(sim.city_alive[0, row, 1]):
        plant_city(sim, row)
    assert bool(sim.city_alive[0, row, 1]), f"seat {row} could not be given a second city"
    return row, 0, 1


def put_district(sim, row: int, j: int, di: int) -> int:
    """Give city (row, j) a COMPLETE district of catalog index `di`, on a plot
    the city itself works — `_dist_counts` reads the TILE plane through
    `city_slot_at`, so the plot has to answer with this city's column."""
    sl = sim.city_slot_at(row)
    free = [t for t in range(sim.T)
            if int(sl[0, t]) == j and int(sim.district[0, t]) < 0
            and int(sim.built_wonder[0, t]) < 0 and bool(sim.passable[0, t])
            and t != int(sim.city_center[0, row, j])]
    assert free, f"city ({row}, {j}) works no free plot"
    t = free[0]
    sim.district[0, t] = di
    sim.district_complete[0, t] = True
    sim.district_pillaged[0, t] = False
    sim.city_dist_tile[0, row, j, di] = t
    sim._eff_version += 1
    sim._tile_owner_ver += 1
    return t


def didx(sim, name: str) -> int:
    return [d["id"] for d in sim.districts_cat].index(name)


BLDG_IDS = [b["id"] for b in json.loads(
    (Path(__file__).resolve().parent.parent.parent / "seeder" / "worlds"
     / "rules.json").read_text())["buildings"]]


def bidx(name: str) -> int:
    return BLDG_IDS.index(name)


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = build(rules, path)
    con = bidx("CONSULATE")
    wide = sim._b_spy_pen_enc.nonzero(as_tuple=True)[0].tolist()
    assert wide == [con], (
        f"the empire-wide half is carried by {[BLDG_IDS[i] for i in wide]}, "
        "and only the Consulate should carry it")
    assert int(sim._b_spy_pen_enc[con]) == 1
    assert int(sim._b_spy_pen[con]) == 1, "the Consulate lost its own-city half"
    print("  1 wire OK — the Consulate alone carries the empire-wide column")


def test_it_reaches_the_other_city(rules, path) -> None:
    sim = build(rules, path)
    row, a, b = two_city_row(sim)
    dq, enc = didx(sim, "DIPLOMATIC_QUARTER"), didx(sim, "ENCAMPMENT")
    con = bidx("CONSULATE")

    base_a = sim._counter_levels(0, row, a)
    base_b = sim._counter_levels(0, row, b)

    put_district(sim, row, a, dq)
    sim.city_bldg[0, row, a, con] = True
    # the Consulate's own city: the Quarter's 2 and the building's 1
    own = sim._counter_levels(0, row, a)
    assert own == base_a + 3, f"the Consulate's own city reads {own}, not {base_a + 3}"
    assert sim._counter_levels(0, row, b) == base_b, "it reached a city with no Encampment"

    put_district(sim, row, b, enc)
    got = sim._counter_levels(0, row, b)
    want = base_b + int(sim._d_spy_pen[enc]) + 1
    assert got == want, f"the Encampment city reads {got}, not {want}"
    # ...and the building's own city still counts it exactly once
    assert sim._counter_levels(0, row, a) == own, "the empire-wide half double-counted at home"
    print(f"  2 reach OK — the other city gains 1 ({base_b} -> {got}), home unchanged at {own}")


def test_a_dead_district_pays_nothing(rules, path) -> None:
    sim = build(rules, path)
    row, a, b = two_city_row(sim)
    dq, enc = didx(sim, "DIPLOMATIC_QUARTER"), didx(sim, "ENCAMPMENT")
    con = bidx("CONSULATE")
    base_b = sim._counter_levels(0, row, b)

    dq_t = put_district(sim, row, a, dq)
    sim.city_bldg[0, row, a, con] = True
    enc_t = put_district(sim, row, b, enc)
    live = sim._counter_levels(0, row, b)
    assert live > base_b

    # an UNFINISHED Encampment is not one
    sim.district_complete[0, enc_t] = False
    assert sim._counter_levels(0, row, b) == base_b, "an unfinished Encampment drew the Consulate"
    sim.district_complete[0, enc_t] = True

    # a PILLAGED Encampment is not one
    sim.district_pillaged[0, enc_t] = True
    assert sim._counter_levels(0, row, b) == base_b, "a pillaged Encampment drew the Consulate"
    sim.district_pillaged[0, enc_t] = False

    # ...and a Consulate whose own Quarter is pillaged pays nowhere
    sim.district_pillaged[0, dq_t] = True
    assert sim._counter_levels(0, row, b) == base_b, "a dark Consulate still paid abroad"
    print("  3 dead districts OK — unfinished, pillaged, and a dark Consulate all pay nothing")


def test_a_rival_consulate_pays_nothing(rules, path) -> None:
    sim = build(rules, path)
    row, a, b = two_city_row(sim)
    other = next(r for r in range(sim.n_majors)
                 if r != row and bool(sim.city_alive[0, r].any()))
    oj = int(sim.city_alive[0, other].nonzero(as_tuple=True)[0][0])
    dq, enc = didx(sim, "DIPLOMATIC_QUARTER"), didx(sim, "ENCAMPMENT")
    con = bidx("CONSULATE")

    base_b = sim._counter_levels(0, row, b)
    put_district(sim, other, oj, dq)
    sim.city_bldg[0, other, oj, con] = True
    put_district(sim, row, b, enc)
    got = sim._counter_levels(0, row, b)
    want = base_b + int(sim._d_spy_pen[enc])
    assert got == want, f"a rival empire's Consulate reached this city ({got} vs {want})"
    print("  4 rival OK — the half is the SEAT's, and stops at its own empire")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_it_reaches_the_other_city(rules, path)
    test_a_dead_district_pays_nothing(rules, path)
    test_a_rival_consulate_pays_nothing(rules, path)
    print("BATTERY OK consulate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
