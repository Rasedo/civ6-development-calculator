"""A DISTRICT IS PRICED OFF ITS OWN ROW — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/district_price_test.py

The TS twin is tests/cpu/city/district-price.test.ts.

CIV6 (`Districts.Cost`): each row carries its OWN base — Aqueduct 36, Canal
and Dam 81, Government Plaza and Diplomatic Quarter 30, Spaceport 1800, every
specialty row 54 — where this engine priced them all as a Campus. And
`Districts.CostProgressionParam1` is the UNDER-REPRESENTED discount: 40
everywhere the install writes it, 25 for the two plaza rows (B-67).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0


def build(path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], load_rules(),
                               device="cpu", dtype=torch.float64))


def test_the_wire(rules, path) -> None:
    """One base and one discount PER placeable row, and the two that differ."""
    sim = build(path)
    dcp = sim.rules.district_cost
    per = dcp.get("perDistrict") or []
    disc = dcp.get("discountPct") or []
    names = [d.get("id", "?") for d in sim.districts_cat]
    assert len(per) == len(names), f"{len(per)} bases for {len(names)} districts"
    assert len(disc) == len(names), f"{len(disc)} discounts for {len(names)} districts"
    speed = float(sim.rules.game_speed)

    want = {"AQUEDUCT": 36, "CANAL": 81, "DAM": 81, "NEIGHBORHOOD": 54,
            "GOVERNMENT_PLAZA": 30, "DIPLOMATIC_QUARTER": 30, "SPACEPORT": 1800,
            "CAMPUS": 54, "HARBOR": 54}
    for nm, base in want.items():
        if nm not in names:
            continue
        i = names.index(nm)
        assert per[i] == round(base * speed), (
            f"{nm} ships {per[i]}, expected {base} speed-scaled to {round(base * speed)}")
    # the ONLY two rows off the install's 40
    odd = sorted(names[i] for i, p in enumerate(disc) if p != 40)
    assert odd == ["DIPLOMATIC_QUARTER", "GOVERNMENT_PLAZA"], f"off-40 rows: {odd}"
    for nm in odd:
        assert disc[names.index(nm)] == 25
    print("  1 the wire OK —", len(per), "bases, and 25 for the two plaza rows")


def test_bases_differ_from_the_specialty_one(rules, path) -> None:
    """The point of the row's own base: an Aqueduct must not cost a Campus."""
    sim = build(path)
    dcp = sim.rules.district_cost
    per = dcp.get("perDistrict") or []
    names = [d.get("id", "?") for d in sim.districts_cat]
    spec = int(dcp.get("base", 32))
    aq = per[names.index("AQUEDUCT")]
    dam = per[names.index("DAM")]
    assert aq < spec, f"the Aqueduct ships {aq}, not below the specialty {spec}"
    assert dam > spec, f"the Dam ships {dam}, not above the specialty {spec}"
    assert per[names.index("CAMPUS")] == spec, "a Campus is not the specialty base"
    print("  2 the bases OK — Aqueduct", aq, "< Campus", spec, "< Dam", dam)


def test_the_engine_pays_the_row(rules, path) -> None:
    """The queue price a seat actually pays follows the row, not the base —
    read through the same expression `_seat_city_produce`'s neighbour uses."""
    sim = build(path)
    row = 0
    dcp = sim.rules.district_cost
    per = dcp.get("perDistrict") or []
    names = [d.get("id", "?") for d in sim.districts_cat]
    t_pct = sim.civ_techs[:, row].sum(dim=1).double() / float(sim.rules_dev.t_cost.shape[0])
    c_pct = sim.civ_civics[:, row].sum(dim=1).double() / float(sim.rules_dev.c_cost.shape[0])
    fac = 1 + dcp.get("scale", 9) * torch.maximum(t_pct, c_pct)
    price = {nm: float(torch.floor(float(per[names.index(nm)]) * fac)[B0])
             for nm in ("AQUEDUCT", "CAMPUS", "DAM")}
    assert price["AQUEDUCT"] < price["CAMPUS"] < price["DAM"], price
    # ...and the discount is the row's, not a shared 0.6
    disc = dcp.get("discountPct") or []
    for nm, want in (("CAMPUS", 0.6), ("GOVERNMENT_PLAZA", 0.75)):
        if nm not in names:
            continue
        got = 1.0 - float(disc[names.index(nm)]) / 100.0
        assert abs(got - want) < 1e-9, f"{nm} discounts to {got}, expected {want}"
    print("  3 the price OK —", {k: int(v) for k, v in price.items()})


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_bases_differ_from_the_specialty_one(rules, path)
    test_the_engine_pays_the_row(rules, path)
    print("BATTERY OK district_price")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
