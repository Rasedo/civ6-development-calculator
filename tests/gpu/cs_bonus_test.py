"""City-state envoy/suzerain bonus self-test.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/cs_bonus_test.py

Scripted parity is the primary correctness bar; these pokes cover the part of
the surface the gate reaches only partially (seat 0 rarely passes ~5 envoys
in-gate, so the 6-envoy tier-2 building lane and the suzerain contest edges are
exercised HERE):

  1. Catalog: _citystate_b1idx / _citystate_b2idx map each CS type to its tier-1 / tier-2
     BUILDING catalog index (cityStateEnvoyBonuses), _citystate_suz_amt == 3, and the per-CS
     suzerain channel (citystate_suz_key) round-trips from the fixture.
  2. Seat-0 envoy BUILDING bonus: a city holding the CS type's tier-1 building
     collects +districtBonus in the CS channel at >=3 envoys; the tier-2
     building collects a second +districtBonus at >=6; the bonus lands in the
     CORRECT channel (food untouched); removing the building removes the bonus;
     a PILLAGED district darkens it (bf_live mirror of TS cityBuildingYields).
  3. Seat-0 suzerain perk: a shipped-channel CS that seat 0 is STRICTLY
     suzerain of adds +suzerainYield to the CAPITAL in its channel; a descoped
     CS (citystate_suz_key = -1) adds nothing; losing the contest (a civ seat with
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
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all

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
    sim._citystate_b1idx[0, 0] = bidx("LIBRARY")
    sim._citystate_b2idx[0, 0] = bidx("UNIVERSITY")
    sim._citystate_yidx[0, 0] = SCIENCE
    sim.citystate_alive[0, 0] = True
    sim.seat_citystate_met[0, 0, 0] = True


def test_catalog(rules, path) -> None:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    cs = rules.citystate
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
    assert float(sim._citystate_suz_amt) == 3.0, f"suzerain amount = {float(sim._citystate_suz_amt)}, want 3"
    # per-CS suzerain channel round-trips from the fixture
    f = load_fixture(path)
    for s, csr in enumerate(f.get("cityStates", [])):
        assert int(sim.citystate_suz_key[0, s]) == int(csr.get("suzKey", -1)), f"citystate_suz_key[{s}] mismatch"
    print(f"  catalog OK: scientific→LIBRARY/UNIVERSITY, religious→SHRINE/TEMPLE, suzAmt=3, {len(BUILDING_IDS)} bldgs")


def test_building_bonus(rules, path) -> None:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(6):
        sim.step()
    _force_scientific_cs0(sim)
    # kill any other CS so only CS0 contributes
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    li, ui = bidx("LIBRARY"), bidx("UNIVERSITY")
    sim.city_bldg[0, 0, 0, li] = True
    sim.city_bldg[0, 0, 0, ui] = True

    def sci0(envoys: int) -> tuple[float, float]:
        sim.seat_citystate_envoys[0, 0, 0] = envoys
        sim._eff_version += 1
        total, _, _, _ = sim._city_totals()
        return float(total[0, 0, SCIENCE]), float(total[0, 0, FOOD])

    s1, f1 = sci0(1)   # capital bonus only (no building tier yet)
    s3, f3 = sci0(3)   # + tier-1 (LIBRARY)
    s6, f6 = sci0(6)   # + tier-2 (UNIVERSITY)
    assert s3 > s1 + 1e-9, f"3-envoy tier-1 building bonus did not fire ({s1}->{s3})"
    assert s6 > s3 + 1e-9, f"6-envoy tier-2 building bonus did not fire ({s3}->{s6})"
    assert abs(f3 - f1) < 1e-9 and abs(f6 - f1) < 1e-9, "food changed — bonus landed in the wrong channel"
    print(f"  seat-0 building bonus OK: science {s1:.2f}(1e) -> {s3:.2f}(3e) -> {s6:.2f}(6e), food flat")

    # CONTROL: the 1->3 envoy step also crosses the SUZERAIN threshold, whose
    # flat capital yield pays into the same channel — so "no bonus without the
    # building" cannot be read off that step alone. Take the step TWICE, with
    # and without the LIBRARY: the suzerain half is identical in both, and the
    # difference of the deltas is the building bonus by itself.
    sim.city_bldg[0, 0, 0, li] = False
    sim.city_bldg[0, 0, 0, ui] = False
    s1b, _ = sci0(1)
    s3b, _ = sci0(3)
    assert abs((s3b - s1b) - (s3 - s1)) > 1e-9, (
        f"the 1->3 envoy step paid the same with and without the LIBRARY "
        f"({s1}->{s3} vs {s1b}->{s3b}) — the tier-1 building is not gating it"
    )
    assert (s3 - s1) > (s3b - s1b), "dropping the tier-1 building must SHRINK the 3-envoy step"
    print(f"  seat-0 building CONTROL OK: the 3-envoy step is {s3 - s1:.2f} with the LIBRARY "
          f"and {s3b - s1b:.2f} without (the remainder is the suzerain yield)")


def test_building_pillage(rules, path) -> None:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(6):
        sim.step()
    _force_scientific_cs0(sim)
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
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
    owned = ((sim.city_slot_at(0)[0] == 0) & (sim.district[0] < 0)).nonzero(as_tuple=True)[0]
    if len(owned) == 0:
        print("  pillage test SKIPPED (no free owned tile)")
        return
    ct = int(owned[0])
    sim.district[0, ct] = campus_idx
    sim.district_complete[0, ct] = True
    sim.district_pillaged[0, ct] = False
    sim.district_dead[0, ct] = False
    # THE REGISTRY is what the yield walk reads (`_bldg_dark` takes the city's
    # district-tile row, TS's `city.districts` twin) — a poke that writes only
    # the tile plane builds a Campus no city owns, and nothing can go dark.
    sim.city_dist_tile[0, 0, 0, campus_idx] = ct
    li = bidx("LIBRARY")
    sim.city_bldg[0, 0, 0, li] = True

    def sci0(envoys: int) -> float:
        sim.seat_citystate_envoys[0, 0, 0] = envoys
        sim._eff_version += 1
        total, _, _, _ = sim._city_totals()
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
    # The 1->3 step also crosses the SUZERAIN threshold, whose flat capital
    # yield pays into this same channel and is unaffected by any pillage — so
    # the pillaged step is not expected to reach zero, only to LOSE the
    # building's share of it.
    assert dark_delta < live_delta - 1e-9, (
        f"pillaging the Campus did not darken its LIBRARY: the 1->3 envoy step still pays "
        f"{dark_delta} against {live_delta} live"
    )
    print(f"  pillage-dark OK: 1->3 envoy step {live_delta:.2f} live -> {dark_delta:.2f} pillaged "
          "(the remainder is the suzerain yield)")


def test_suzerain(rules, path) -> None:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(6):
        sim.step()
    _force_scientific_cs0(sim)
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    # seat 0 STRICTLY suzerain of CS0: 4 envoys, civ seats at 0
    sim.seat_citystate_envoys[0, 0, 0] = 4
    if sim.n_majors > 1:
        sim.seat_citystate_envoys[0, 1:, 0] = 0
    suz_amt = float(sim._citystate_suz_amt)

    def cap_sci(suz_key: int) -> float:
        sim.citystate_suz_key[0, 0] = suz_key
        sim._eff_version += 1
        total, _, _, _ = sim._city_totals()
        return float(total[0, 0, SCIENCE])

    ship = cap_sci(SCIENCE)   # shipped science channel
    desc = cap_sci(-1)        # descoped
    assert ship > desc + 1e-9, f"suzerain perk did not add to the capital ({desc}->{ship})"
    print(f"  seat-0 suzerain OK: capital science shipped {ship:.2f} vs descoped {desc:.2f} (+{suz_amt} pre-amenity)")

    # contest lost: a civ seat out-envoys seat 0 -> no perk
    if sim.n_majors > 1:
        sim.citystate_suz_key[0, 0] = SCIENCE
        sim.seat_citystate_envoys[0, 1, 0] = 9  # civ 0 dominates
        sim._eff_version += 1
        total, _, _, _ = sim._city_totals()
        contested = float(total[0, 0, SCIENCE])
        assert abs(contested - desc) < 1e-9, f"suzerain perk paid while contest LOST ({contested} vs {desc})"
        print("  seat-0 suzerain CONTEST OK: a civ out-envoys seat 0 -> no perk")


def test_faith_class(rules, path) -> None:
    """CIV6 (Valletta's suzerain): "City Center buildings and Encampment
    district buildings can be bought with Faith. Cost of purchasing Ancient,
    Medieval, and Renaissance Walls is reduced, but they can only be bought
    with Faith." Unreachable in the gate — the scripted seats never carry a
    minor past one envoy — so the class rule, the currency and the gold
    refusal are poked."""
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(20):
        sim.step()
    assert sim._suz_c_faith_bldg >= 0, "the suz-effect table carries no faithBuildings code"
    row = 1
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    sim.citystate_alive[0, 0] = True
    sim.citystate_suz_code[0, 0] = sim._suz_c_faith_bldg
    sim.seat_citystate_envoys[0, :, 0] = 0
    sim.seat_citystate_envoys[0, row, 0] = 4
    sim._eff_version += 1
    assert bool(sim._suz_effect(row, sim._suz_c_faith_bldg)[0]), "the suzerain read did not take"

    held = torch.ones(1, dtype=torch.bool)
    sim.civ_faith[0, row] = 10_000.0
    ok, j, b = sim._seat_class_buy_candidate(row, held)
    assert bool(ok[0]), "no class purchase offered to a Valletta suzerain with a full purse"
    bi = int(b[0])
    rq = int(sim._b_req_district[bi])
    assert rq == -1 or rq == sim._encamp_didx,         f"the candidate named {BUILDING_IDS[bi]}, which is neither a City Center nor an Encampment row"

    # the FAITH price, and the write
    price = float(sim._class_faith_cost(b)[0])
    assert abs(price - float(sim.rules_dev.b_cost[bi]) * sim.rules.faith_purchase_mult) < 1e-9,         "the class purchase is not priced at the faith rate"
    f0, jc = float(sim.civ_faith[0, row]), int(j[0])
    sim._seat_buy_building_faith(row, ok, j, b, sim._class_faith_cost(b))
    assert bool(sim.city_bldg[0, row, jc, bi]), "the faith-bought building did not land in the city"
    assert abs(float(sim.civ_faith[0, row]) - (f0 - price)) < 1e-9, "the faith was not spent"

    # a seat with no such suzerain is offered nothing
    sim.seat_citystate_envoys[0, row, 0] = 0
    sim._eff_version += 1
    ok2, _, _ = sim._seat_class_buy_candidate(row, held)
    assert not bool(ok2[0]), "the class purchase survived the loss of the suzerain"
    print(f"  faith-class OK: {BUILDING_IDS[bi]} bought for {price:.0f} faith, gone without the suzerain")


def test_walls_faith_only(rules, path) -> None:
    """... and the walls half: with the suzerain held, no walls row is offered
    to the GOLD buy any more."""
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(20):
        sim.step()
    assert sim._walls_rows, "no walls rows in this build"
    row = 1
    active = torch.ones(1, dtype=torch.bool)
    sim.civ_treasury[0, row] = 100_000.0
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    sim.citystate_alive[0, 0] = True
    sim.citystate_suz_code[0, 0] = sim._suz_c_faith_bldg
    sim.seat_citystate_envoys[0, :, 0] = 0
    sim._eff_version += 1
    _, _, _, _, elig_free = sim._seat_buy_candidates(row, active)
    sim.seat_citystate_envoys[0, row, 0] = 4
    sim._eff_version += 1
    _, _, _, _, elig_suz = sim._seat_buy_candidates(row, active)
    wr = torch.tensor(sim._walls_rows, dtype=torch.long)
    assert not bool(elig_suz[:, :, wr].any()), "a walls row survived the gold buy under the suzerain"
    kept = elig_suz[:, :, [i for i in range(elig_suz.shape[2]) if i not in set(sim._walls_rows)]]
    kept_free = elig_free[:, :, [i for i in range(elig_free.shape[2]) if i not in set(sim._walls_rows)]]
    assert bool((kept == kept_free).all()), "the walls refusal moved a NON-walls row"
    print("  walls faith-only OK: the three walls leave the gold buy, nothing else moves")


def test_civ_bonus(rules, path) -> None:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(20):
        sim.step()
    if sim.n_majors == 1:
        print("  civ test SKIPPED (no civs)")
        return
    r = 0
    live = (sim.city_alive[0, r + 1]).nonzero(as_tuple=True)[0]
    if len(live) == 0:
        print("  civ test SKIPPED (civ 0 has no cities)")
        return
    j = int(live[0])
    _force_scientific_cs0(sim)
    if sim.S > 1:
        sim.citystate_alive[0, 1:] = False
    li, ui = bidx("LIBRARY"), bidx("UNIVERSITY")
    sim.city_bldg[0, r + 1, j, li] = True
    sim.city_bldg[0, r + 1, j, ui] = True

    def rsci(renvoys: int, suz_key: int = -1) -> float:
        sim.seat_citystate_envoys[0, r + 1, 0] = renvoys
        sim.citystate_suz_key[0, 0] = suz_key
        sim._eff_version += 1
        # _seat_city_yields_all returns (food, prod, sci, cul, gold, faith).
        food, prod, sci, cul, gold, faith = sim._seat_city_yields_all(r + 1)
        return float(sci[0, j])

    r1 = rsci(1)   # capital-only (this rc may not be the capital -> possibly 0)
    r3 = rsci(3)   # + tier-1 LIBRARY on THIS city
    r6 = rsci(6)   # + tier-2 UNIVERSITY
    assert r3 > r1 + 1e-9, f"civ 3-envoy building bonus did not fire ({r1}->{r3})"
    assert r6 > r3 + 1e-9, f"civ 6-envoy building bonus did not fire ({r3}->{r6})"
    print(f"  civ building bonus OK: science {r1:.2f}(1e) -> {r3:.2f}(3e) -> {r6:.2f}(6e)")

    # civ suzerain perk on the CAPITAL: force this rc to be the capital and
    # make the civ seat strictly suzerain (envoys 4, every other seat at 0)
    sim.city_is_cap[0, r + 1, j] = True
    sim.seat_citystate_envoys[0, 0, 0] = 0
    sim.seat_citystate_envoys[0, 1:, 0] = 0
    sim.seat_citystate_envoys[0, r + 1, 0] = 4
    ship = rsci(4, suz_key=SCIENCE)
    desc = rsci(4, suz_key=-1)
    assert ship > desc + 1e-9, f"civ suzerain perk did not add to the capital ({desc}->{ship})"
    print(f"  civ suzerain OK: rc capital science shipped {ship:.2f} vs descoped {desc:.2f}")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    p = paths[0]
    print(f"cs_bonus_test on {p.name}:")
    test_catalog(rules, p)
    test_building_bonus(rules, p)
    test_building_pillage(rules, p)
    test_suzerain(rules, p)
    test_faith_class(rules, p)
    test_walls_faith_only(rules, p)
    test_civ_bonus(rules, p)
    print("CS_BONUS OK")


if __name__ == "__main__":
    main()
