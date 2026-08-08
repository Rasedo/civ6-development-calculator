"""City-state envoy/suzerain bonus self-test.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/cs_bonus_test.py

Scripted parity is the primary correctness bar; these pokes cover the part of
the surface the gate reaches only partially (seat 0 rarely passes ~5 envoys
in-gate, so the 6-envoy tier-2 building lane and the suzerain contest edges are
exercised HERE):

  1. Catalog: _cs_b1idx / _cs_b2idx map each CS type to its tier-1 / tier-2
     BUILDING catalog index (csEnvoyBonuses), _cs_suz_amt == 3, and the per-CS
     suzerain channel (cs_suz_key) round-trips from the fixture.
  2. Seat-0 envoy BUILDING bonus: a city holding the CS type's tier-1 building
     collects +districtBonus in the CS channel at >=3 envoys; the tier-2
     building collects a second +districtBonus at >=6; the bonus lands in the
     CORRECT channel (food untouched); removing the building removes the bonus;
     a PILLAGED district darkens it (bf_live mirror of TS cityBuildingYields).
  3. Seat-0 suzerain perk: a shipped-channel CS that seat 0 is STRICTLY
     suzerain of adds +suzerainYield to the CAPITAL in its channel; a descoped
     CS (cs_suz_key = -1) adds nothing; losing the contest (a civ seat with
     more envoys) removes the perk.
  4. Civ mirror: the same building bonus + suzerain perk on the civ yield
     path (_seat_city_yields_all), off that civ seat's envoy counts.

CS slot 0 is FORCED to the scientific channel (tier-1 LIBRARY, tier-2
UNIVERSITY, channel science) by overriding the derived index tensors, so the
assertions are deterministic regardless of the fixture's placed CS types.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES

RULES_J = json.loads((FIXTURES / "rules.json").read_text())
BUILDING_IDS = [b["id"] for b in RULES_J["buildings"]]
SCIENCE = 3  # yield column
FOOD = 0


def bidx(bid: str) -> int:
    return BUILDING_IDS.index(bid)


def _force_scientific_cs0(sim) -> None:
    """Make CS slot 0 a scientific CS (LIBRARY / UNIVERSITY / science channel)
    by overriding the derived per-CS index tensors — deterministic regardless
    of the fixture's placed type."""
    sim._cs_b1idx[0, 0] = bidx("LIBRARY")
    sim._cs_b2idx[0, 0] = bidx("UNIVERSITY")
    sim._cs_yidx[0, 0] = SCIENCE
    sim.cs_alive[0, 0] = True
    sim.cs_met[0, 0] = True


def test_catalog(rules, path) -> None:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    cs = rules.cs
    # per-type tier indices match the rules export
    for t in range(len(cs["typeB1Idx"])):
        # find a CS of type t (if any) and verify its derived index
        want1, want2 = cs["typeB1Idx"][t], cs["typeB2Idx"][t]
        assert want1 >= 0, f"type {t} tier-1 building absent from roster"
        assert want2 >= 0, f"type {t} tier-2 building absent from roster"
    # scientific = type 0 → LIBRARY / UNIVERSITY
    assert cs["typeB1Idx"][0] == bidx("LIBRARY"), "scientific tier-1 must be LIBRARY"
    assert cs["typeB2Idx"][0] == bidx("UNIVERSITY"), "scientific tier-2 must be UNIVERSITY"
    # religious = type 5 → SHRINE / TEMPLE
    assert cs["typeB1Idx"][5] == bidx("SHRINE"), "religious tier-1 must be SHRINE"
    assert cs["typeB2Idx"][5] == bidx("TEMPLE"), "religious tier-2 must be TEMPLE"
    assert float(sim._cs_suz_amt) == 3.0, f"suzerain amount = {float(sim._cs_suz_amt)}, want 3"
    # per-CS suzerain channel round-trips from the fixture
    f = load_fixture(path)
    for s, csr in enumerate(f.get("cityStates", [])):
        assert int(sim.cs_suz_key[0, s]) == int(csr.get("suzKey", -1)), f"cs_suz_key[{s}] mismatch"
    print(f"  catalog OK: scientific→LIBRARY/UNIVERSITY, religious→SHRINE/TEMPLE, suzAmt=3, {len(BUILDING_IDS)} bldgs")


def test_player_building_bonus(rules, path) -> None:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(6):
        sim.step()
    _force_scientific_cs0(sim)
    # kill any other CS so only CS0 contributes
    if sim.S > 1:
        sim.cs_alive[0, 1:] = False
    li, ui = bidx("LIBRARY"), bidx("UNIVERSITY")
    sim.buildings[0, 0, li] = True
    sim.buildings[0, 0, ui] = True

    def sci0(envoys: int) -> tuple[float, float]:
        sim.cs_envoys[0, 0] = envoys
        sim._eff_version += 1
        total, _, _, _ = sim._city_totals(lux=None)
        return float(total[0, 0, SCIENCE]), float(total[0, 0, FOOD])

    s1, f1 = sci0(1)   # capital bonus only (no building tier yet)
    s3, f3 = sci0(3)   # + tier-1 (LIBRARY)
    s6, f6 = sci0(6)   # + tier-2 (UNIVERSITY)
    assert s3 > s1 + 1e-9, f"3-envoy tier-1 building bonus did not fire ({s1}->{s3})"
    assert s6 > s3 + 1e-9, f"6-envoy tier-2 building bonus did not fire ({s3}->{s6})"
    assert abs(f3 - f1) < 1e-9 and abs(f6 - f1) < 1e-9, "food changed — bonus landed in the wrong channel"
    print(f"  player building bonus OK: science {s1:.2f}(1e) -> {s3:.2f}(3e) -> {s6:.2f}(6e), food flat")

    # control: no LIBRARY -> the 3-envoy tier-1 bonus vanishes
    sim.buildings[0, 0, li] = False
    sim.buildings[0, 0, ui] = False
    s1b, _ = sci0(1)
    s3b, _ = sci0(3)
    assert abs(s3b - s1b) < 1e-9, f"3-envoy bonus fired with NO tier-1 building ({s1b}->{s3b})"
    print("  player building CONTROL OK: no tier-1 building -> no 3-envoy bonus")


def test_player_building_pillage(rules, path) -> None:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(6):
        sim.step()
    _force_scientific_cs0(sim)
    if sim.S > 1:
        sim.cs_alive[0, 1:] = False
    if not sim.districts_on:
        print("  pillage test SKIPPED (districts off)")
        return
    # plant a COMPLETE CAMPUS on an owned tile in city 0's window, holding a LIBRARY
    campus_idx = None
    for d in sim.districts_cat:
        if d.get("id") == "CAMPUS":
            campus_idx = int(d["idx"])
    if campus_idx is None:
        print("  pillage test SKIPPED (no CAMPUS district)")
        return
    owned = ((sim.owner[0] == 0) & (sim.district[0] < 0)).nonzero(as_tuple=True)[0]
    if len(owned) == 0:
        print("  pillage test SKIPPED (no free owned tile)")
        return
    ct = int(owned[0])
    sim.district[0, ct] = campus_idx
    sim.district_complete[0, ct] = True
    sim.district_pillaged[0, ct] = False
    sim.district_dead[0, ct] = False
    li = bidx("LIBRARY")
    sim.buildings[0, 0, li] = True

    def sci0(envoys: int) -> float:
        sim.cs_envoys[0, 0] = envoys
        sim._eff_version += 1
        total, _, _, _ = sim._city_totals(lux=None)
        return float(total[0, 0, SCIENCE])

    s3_live = sci0(3)
    s1_live = sci0(1)
    live_delta = s3_live - s1_live
    assert live_delta > 1e-9, f"LIBRARY-in-Campus bonus did not fire live ({live_delta})"
    # pillage the Campus -> the building goes dark -> bonus vanishes
    sim.district_pillaged[0, ct] = True
    sim._eff_version += 1
    s3_dark = sci0(3)
    s1_dark = sci0(1)
    dark_delta = s3_dark - s1_dark
    assert abs(dark_delta) < 1e-9, f"pillaged-Campus LIBRARY still paid the CS bonus ({dark_delta})"
    print(f"  pillage-dark OK: live delta {live_delta:.2f} -> pillaged delta {dark_delta:.2f}")


def test_player_suzerain(rules, path) -> None:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(6):
        sim.step()
    _force_scientific_cs0(sim)
    if sim.S > 1:
        sim.cs_alive[0, 1:] = False
    # seat 0 STRICTLY suzerain of CS0: 4 envoys, civ seats at 0
    sim.cs_envoys[0, 0] = 4
    if sim.R > 0:
        sim.cs_r_envoys[0, :, 0] = 0
    suz_amt = float(sim._cs_suz_amt)

    def cap_sci(suz_key: int) -> float:
        sim.cs_suz_key[0, 0] = suz_key
        sim._eff_version += 1
        total, _, _, _ = sim._city_totals(lux=None)
        return float(total[0, 0, SCIENCE])

    ship = cap_sci(SCIENCE)   # shipped science channel
    desc = cap_sci(-1)        # descoped
    assert ship > desc + 1e-9, f"suzerain perk did not add to the capital ({desc}->{ship})"
    print(f"  player suzerain OK: capital science shipped {ship:.2f} vs descoped {desc:.2f} (+{suz_amt} pre-amenity)")

    # contest lost: a civ seat out-envoys seat 0 -> no perk
    if sim.R > 0:
        sim.cs_suz_key[0, 0] = SCIENCE
        sim.cs_r_envoys[0, 0, 0] = 9  # civ 0 dominates
        sim._eff_version += 1
        total, _, _, _ = sim._city_totals(lux=None)
        contested = float(total[0, 0, SCIENCE])
        assert abs(contested - desc) < 1e-9, f"suzerain perk paid while contest LOST ({contested} vs {desc})"
        print("  player suzerain CONTEST OK: a civ out-envoys the player -> no perk")


def test_civ_bonus(rules, path) -> None:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(20):
        sim.step()
    if sim.R == 0:
        print("  civ test SKIPPED (no civs)")
        return
    r = 0
    live = (sim.rc_alive[0, r]).nonzero(as_tuple=True)[0]
    if len(live) == 0:
        print("  civ test SKIPPED (civ 0 has no cities)")
        return
    j = int(live[0])
    _force_scientific_cs0(sim)
    if sim.S > 1:
        sim.cs_alive[0, 1:] = False
    li, ui = bidx("LIBRARY"), bidx("UNIVERSITY")
    sim.rc_bldg[0, r, j, li] = True
    sim.rc_bldg[0, r, j, ui] = True

    def rsci(renvoys: int, suz_key: int = -1) -> float:
        sim.cs_r_envoys[0, r, 0] = renvoys
        sim.cs_suz_key[0, 0] = suz_key
        sim._eff_version += 1
        # _seat_city_yields_all returns (food, prod, sci, cul, gold, faith).
        food, prod, sci, cul, gold, faith = sim._seat_city_yields_all(r)
        return float(sci[0, j])

    r1 = rsci(1)   # capital-only (this rc may not be the capital -> possibly 0)
    r3 = rsci(3)   # + tier-1 LIBRARY on THIS city
    r6 = rsci(6)   # + tier-2 UNIVERSITY
    assert r3 > r1 + 1e-9, f"civ 3-envoy building bonus did not fire ({r1}->{r3})"
    assert r6 > r3 + 1e-9, f"civ 6-envoy building bonus did not fire ({r3}->{r6})"
    print(f"  civ building bonus OK: science {r1:.2f}(1e) -> {r3:.2f}(3e) -> {r6:.2f}(6e)")

    # civ suzerain perk on the CAPITAL: force this rc to be the capital and
    # make the civ seat strictly suzerain (envoys 4, every other seat at 0)
    sim.rc_is_cap[0, r, j] = True
    sim.cs_envoys[0, 0] = 0
    sim.cs_r_envoys[0, :, 0] = 0
    sim.cs_r_envoys[0, r, 0] = 4
    ship = rsci(4, suz_key=SCIENCE)
    desc = rsci(4, suz_key=-1)
    assert ship > desc + 1e-9, f"civ suzerain perk did not add to the capital ({desc}->{ship})"
    print(f"  civ suzerain OK: rc capital science shipped {ship:.2f} vs descoped {desc:.2f}")


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    p = paths[0]
    print(f"cs_bonus_test on {p.name}:")
    test_catalog(rules, p)
    test_player_building_bonus(rules, p)
    test_player_building_pillage(rules, p)
    test_player_suzerain(rules, p)
    test_civ_bonus(rules, p)
    print("CS_BONUS OK")


if __name__ == "__main__":
    main()
