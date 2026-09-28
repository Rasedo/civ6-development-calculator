"""A DISTRICT IS PRICED OFF ITS OWN ROW — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/district_price_test.py

The TS twin is tests/cpu/city/district-price.test.ts.

CIV6 (`Districts.Cost`): each row carries its OWN base — Aqueduct 36, Canal
and Dam 81, Government Plaza and Diplomatic Quarter 30, Spaceport 1800, every
specialty row 54 — where this engine priced them all as a Campus. And
`Districts.CostProgressionParam1` is the UNDER-REPRESENTED discount: 40
everywhere the install writes it, 25 for the two plaza rows.
"""

from __future__ import annotations

import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, fixture_paths
from warmup import warm_base, opened

B0 = 0


# THE WARMED BASE, ONE PER FIXTURE. A scene pays a `restore` — milliseconds —
# instead of a fixture load and a settle. Every plane these pokes write is in
# `_MUTABLE`, so a restore is the whole reset.


def build(path) -> BatchSim:
    return warm_base(str(path), lambda: opened(load_rules(), path))


def test_the_wire(rules, path) -> None:
    """One base and one discount PER placeable row, and the two that differ."""
    sim = build(path)
    dcp = sim.rules.district_cost
    per = dcp["perDistrict"]
    disc = dcp["discountPct"]
    names = [d.get("id", "?") for d in sim.districts_cat]
    assert len(per) == len(names), f"{len(per)} bases for {len(names)} districts"
    assert len(disc) == len(names), f"{len(disc)} discounts for {len(names)} districts"
    # the install's Standard-speed Cost: `_progress_cost` applies the speed
    want = {"AQUEDUCT": 36, "CANAL": 81, "DAM": 81, "NEIGHBORHOOD": 54,
            "GOVERNMENT_PLAZA": 30, "DIPLOMATIC_QUARTER": 30, "SPACEPORT": 1800,
            "CAMPUS": 54, "HARBOR": 54}
    for nm, base in want.items():
        if nm not in names:
            continue
        i = names.index(nm)
        assert per[i] == base, f"{nm} ships {per[i]}, expected the install's {base}"
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
    per = dcp["perDistrict"]
    names = [d.get("id", "?") for d in sim.districts_cat]
    spec = int(dcp["base"])
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
    per = dcp["perDistrict"]
    names = [d.get("id", "?") for d in sim.districts_cat]
    pct = sim._progress_pct(row)
    price = {nm: float(sim._progress_cost(int(per[names.index(nm)]), int(dcp["perK"][names.index(nm)]), pct)[B0])
             for nm in ("AQUEDUCT", "CAMPUS", "DAM")}
    assert price["AQUEDUCT"] < price["CAMPUS"] < price["DAM"], price
    # ...and the discount is the row's, not a shared 0.6
    disc = dcp["discountPct"]
    for nm, want in (("CAMPUS", 0.6), ("GOVERNMENT_PLAZA", 0.75)):
        if nm not in names:
            continue
        got = 1.0 - float(disc[names.index(nm)]) / 100.0
        assert abs(got - want) < 1e-9, f"{nm} discounts to {got}, expected {want}"
    print("  3 the price OK —", {k: int(v) for k, v in price.items()})


def test_the_two_models_part(rules, path) -> None:
    """CIV6 (`Districts.CostProgressionModel`): floor(1/2 base (1 + k P)), P
    the integer percent of max(techs / 77, civics / 61), k the row's climb —
    a GAME_PROGRESS row's Param1 1000 read as 1000/100 - 1 = 9, a specialty
    row's 9 (runs/h1_duelw1103, the Holy Site 92)."""
    sim = build(path)
    dcp = sim.rules.district_cost
    per, ks = dcp["perDistrict"], dcp["perK"]
    assert all(int(k) == 9 for k in ks), ks
    nt = sim.civ_techs.shape[2]
    sim.civ_techs[:, 0, :] = False
    sim.civ_techs[:, 0, : min(29, nt)] = True
    pct = int(sim._progress_pct(0)[0])
    assert pct == 37, f"29 of 77 techs read as {pct}%"
    for si, (di, _ut, _uc, _plc, fc) in enumerate(sim._scaffold):
        if fc >= 0:
            continue  # the Spaceport is flat
        if bool(sim._district_discounted(0, di).any()):
            continue
        cost = float(sim._district_cost_si(0, si)[0])
        base = int(per[di]) if di < len(per) else int(dcp["base"])
        want = (base * 50 * (100 + 9 * pct)) // 10000
        if not sim._d_variants.get(di):
            assert cost == want, f"row {di}: wanted {want}, got {cost}"
    print(f"  4 the progress price OK — every row floor(1/2 base (1 + 9P)) at P {pct}%")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_bases_differ_from_the_specialty_one(rules, path)
    test_the_engine_pays_the_row(rules, path)
    test_the_two_models_part(rules, path)
    print("BATTERY OK district_price")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
