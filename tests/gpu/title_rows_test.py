"""THE TITLE, THE PRIZE, THE START AND THE BAN — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/title_rows_test.py

The TS twin is tests/cpu/seats/title-rows.test.ts.

CIV6 (the install's TraitModifiers): Seondeok's Hwarang, Sweden's Nobel
Prize, the Maori's Mana, Saladin's Righteousness of the Faith and Mvemba's
Religious Convert.
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
BUILDINGS = [b["id"] for b in RULES["buildings"]]
TECHS = [t["id"] for t in RULES["techs"]]
DISTRICTS = RULES["districts"]["ids"] if isinstance(RULES["districts"], dict) else [d["id"] for d in RULES["districts"]]


def play(sim, row: int, name):
    """Seat one roster row, or clear it (`name=None`) for the BASELINE — a
    row with no civilization, so no other one's yields sit underneath."""
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


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert len(sim._governor_title_yield_rows) == 2, "Hwarang's two yields"
    assert len(sim._gpp_building_rows) == 2 and len(sim._gp_favor_rows) == 1
    assert len(sim._start_tech_rows) == 2 and len(sim._seat_ban_rows) == 5
    assert len(sim._worship_rows) == 1 and len(sim._district_unit_rows) == 1
    assert len(sim._ocean_access_rows) == 2, "the Knarr and Mana"
    assert sim._writer_cls >= 0 and sim._writer_cls != sim._prophet_cls
    print("  1 wire OK — 2 + 2 + 1 + 2 + 5 + 1 + 1 rows")


def test_hwarang(rules, path) -> None:
    """+3% per PROMOTION, the governor's first included."""
    def culture(name, leader, promos: int, established: bool) -> float:
        s2 = fresh(rules, path)
        if leader is None:
            play(s2, 0, name)
        else:
            lead(s2, 0, name, leader)
        if s2.n_governors:
            s2.civ_gov_appointed[B0, 0, 0] = True
            s2.civ_gov_city[B0, 0, 0] = int(s2.city_id[B0, 0, 0])
            s2.civ_gov_establish[B0, 0, 0] = 0 if established else 2
            s2.civ_gov_promos[B0, 0, 0] = promos
        s2._eff_version += 1
        return float(s2._seat_city_walk(0, amen_yf=s2._seat_amenity(0)[2])[B0, 0, 4])

    sim = fresh(rules, path)
    if not sim.n_governors:
        print("  2 Hwarang SKIPPED — this build seats no governors")
        return
    plain = culture(None, None, 0, True)
    assert plain > 0, "the baseline city made no Culture"
    got = culture("KOREA", "SEONDEOK", 0, True)
    assert abs(got - plain * 1.03) < 1e-9, f"a bare governor paid {got / plain - 1:.4f}"
    got2 = culture("KOREA", "SEONDEOK", 0b11, True)
    assert abs(got2 - plain * 1.09) < 1e-9, f"two promotions paid {got2 / plain - 1:.4f}"
    est = culture("KOREA", "SEONDEOK", 0b11, False)
    assert abs(est - plain) < 1e-9, "an establishing governor paid the row"
    assert abs(culture(None, None, 0b11, True) - plain) < 1e-9, "a plain seat took the row"
    print("  2 Hwarang OK — 3% bare, 9% with two promotions, nothing while establishing")


def test_nobel_points(rules, path) -> None:
    """+1 Great Engineer point from a Factory, +1 Scientist from a University."""
    def pts(name, building: str, cls_name: str) -> float:
        s2 = fresh(rules, path)
        play(s2, 0, name)
        cls = next(i for i in range(s2._gp_nc)
                   if int(s2._gp_class_district[i]) == DISTRICTS.index(
                       "INDUSTRIAL_ZONE" if cls_name == "ENGINEER" else "CAMPUS"))
        di = int(s2._gp_class_district[cls])
        # stand the class's district in city slot 0, complete
        ctr = int(s2.city_center[B0, 0, 0])
        at = next(int(x) for x in s2.neigh[ctr].tolist() if x >= 0)
        s2.district[B0, at] = di
        s2.district_complete[B0, at] = True
        s2.district_pillaged[B0, at] = False
        s2.city_dist_tile[B0, 0, 0, di] = at
        if building:
            s2.city_bldg[B0, 0, 0, BUILDINGS.index(building)] = True
        s2._eff_version += 1
        s2._bldg_version += 1
        before = float(s2.civ_gpp[B0, 0, cls])
        s2._advance_great_people(0, torch.ones(s2.B, dtype=torch.bool))
        return float(s2.civ_gpp[B0, 0, cls]) - before

    base_u = pts(None, "UNIVERSITY", "SCIENTIST")
    assert abs(pts("SWEDEN", "UNIVERSITY", "SCIENTIST") - (base_u + 1)) < 1e-9, "the University's point"
    base_f = pts(None, "FACTORY", "ENGINEER")
    assert abs(pts("SWEDEN", "FACTORY", "ENGINEER") - (base_f + 1)) < 1e-9, "the Factory's point"
    bare = pts(None, "", "SCIENTIST")
    assert abs(pts("SWEDEN", "", "SCIENTIST") - bare) < 1e-9, "the row paid without its building"
    print("  3 the Nobel points OK — +1 from the University, +1 from the Factory, none bare")


def test_nobel_favor(rules, path) -> None:
    """+50 Diplomatic Favor with every person earned."""
    def favor(name) -> tuple[float, int]:
        s2 = fresh(rules, path)
        play(s2, 0, name)
        cls = 0
        s2.civ_gpp[B0, 0, cls] = 5000.0
        before = float(s2.civ_diplo_favor[B0, 0])
        n0 = int(s2.gp_earned[B0, cls])
        s2._advance_great_people(0, torch.ones(s2.B, dtype=torch.bool))
        return float(s2.civ_diplo_favor[B0, 0]) - before, int(s2.gp_earned[B0, cls]) - n0

    got, n = favor("SWEDEN")
    assert n > 0, "nobody was earned, so the scene proves nothing"
    assert abs(got - 50 * n) < 1e-9, f"{n} earned paid {got} favor"
    plain, _ = favor(None)
    assert plain == 0.0, "a plain seat took the favor"
    print(f"  4 the Nobel favor OK — +{int(got)} for {n} earned, nothing for a plain seat")


def test_mana(rules, path) -> None:
    """The Maori's start, and the Writer they never earn."""
    sim = fresh(rules, path)
    # the START techs ride the fixture's own draw, so seat the row and re-lay
    play(sim, 0, "MAORI")
    sim.civ_techs[B0, 0, :] = False
    sim._apply_roster_start()
    for name in ("SAILING", "SHIPBUILDING"):
        assert bool(sim.civ_techs[B0, 0, TECHS.index(name)]), f"the Maori did not start with {name}"
    play(sim, 1, "ROME")
    sim.civ_techs[B0, 1, :] = False
    sim._apply_roster_start()
    assert not bool(sim.civ_techs[B0, 1, TECHS.index("SAILING")]), "a plain seat took the start"

    def writer(name) -> float:
        s2 = fresh(rules, path)
        play(s2, 0, name)
        s2.civ_gpp[B0, 0, s2._writer_cls] = 500.0
        s2._advance_great_people(0, torch.ones(s2.B, dtype=torch.bool))
        return float(s2.civ_gpp[B0, 0, s2._writer_cls])

    assert writer("MAORI") == 0.0, "the Maori banked Great Writer points"
    assert writer(None) > 0.0, "the baseline banked nothing, so the scene proves nothing"
    print("  5 Mana OK — Sailing and Shipbuilding at the start, and no Great Writer")


def test_ocean_access(rules, path) -> None:
    """Norway crosses OCEAN at Shipbuilding, the Maori from the first turn."""
    def open_at(name, techs: tuple[str, ...]) -> bool:
        s2 = fresh(rules, path)
        play(s2, 0, name)
        s2.civ_techs[B0, 0, :] = False
        for t in techs:
            s2.civ_techs[B0, 0, TECHS.index(t)] = True
        s2._eff_version += 1
        return bool(s2._row_ocean_open(0)[B0])

    assert not open_at(None, ()), "a plain seat crossed the ocean bare"
    assert open_at(None, ("CARTOGRAPHY",)), "Cartography did not open the ocean"
    assert not open_at("NORWAY", ()), "Norway crossed before Shipbuilding"
    assert open_at("NORWAY", ("SHIPBUILDING",)), "the Knarr did not open the ocean"
    assert open_at("MAORI", ()), "Mana did not open the ocean at once"
    assert not open_at("NORWAY", ("SAILING",)), "Sailing alone opened the Knarr"
    print("  6 the ocean rows OK — Cartography, the Knarr's Shipbuilding, Mana's first turn")


def test_righteousness(rules, path) -> None:
    """A tenth of the price, and 10% on the city that holds one."""
    sim = fresh(rules, path)
    play(sim, 0, None)
    full = float(sim._worship_cost_of(0)[B0])
    lead(sim, 0, "ARABIA", "SALADIN")
    cheap = float(sim._worship_cost_of(0)[B0])
    assert cheap == float(round(full / 10)), f"Saladin paid {cheap} of {full}"

    wb = [i for i, b in enumerate(BUILDINGS) if bool(sim._b_worship[i])]
    assert wb, "no worship building on the wire"

    def culture(name, leader, hold: bool) -> float:
        s2 = fresh(rules, path)
        if leader is None:
            play(s2, 0, name)
        else:
            lead(s2, 0, name, leader)
        if hold:
            s2.city_bldg[B0, 0, 0, wb[0]] = True
        s2._eff_version += 1
        s2._bldg_version += 1
        return float(s2._seat_city_walk(0, amen_yf=s2._seat_amenity(0)[2])[B0, 0, 4])

    plain_h = culture(None, None, True)
    held = culture("ARABIA", "SALADIN", True)
    assert abs(held - plain_h * 1.1) < 1e-9, f"the held city paid {held / plain_h - 1:.4f}"
    plain_b = culture(None, None, False)
    bare = culture("ARABIA", "SALADIN", False)
    assert abs(bare - plain_b) < 1e-9, "the row paid without the building"
    print("  7 Righteousness OK — a tenth of the price, +10% Culture where one stands")


def test_religious_convert(rules, path) -> None:
    """No Holy Site, no Great Prophet, no religion."""
    sim = fresh(rules, path)
    hs = sim._hs_idx
    assert hs >= 0, "no Holy Site on the wire"

    def sites(name, leader) -> int:
        s2 = fresh(rules, path)
        if leader is None:
            play(s2, 0, name)
        else:
            lead(s2, 0, name, leader)
        # hand the city's first ring to the city itself — `_district_elig_site`
        # asks for `tile_city`, which the fixture leaves unset at t0
        ctr = int(s2.city_center[B0, 0, 0])
        for x in s2.neigh[ctr].tolist():
            if x < 0:
                continue
            s2.tile_seat[B0, x] = 0
            s2.tile_city[B0, x] = int(s2.city_id[B0, 0, 0])
            s2.improvement[B0, x] = -1
            s2.feat_stripped[B0, x] = True  # nothing left to clear for a tech
        s2._tile_owner_ver += 1
        s2._eff_version += 1
        return int(s2._district_elig(0, 0, hs).sum())

    plain = sites(None, None)
    assert plain > 0, "the baseline could place no Holy Site, so the scene proves nothing"
    assert sites("KONGO", "MVEMBA") == 0, "Mvemba was offered a Holy Site plot"

    def prophet(name, leader) -> float:
        s2 = fresh(rules, path)
        if leader is None:
            play(s2, 0, name)
        else:
            lead(s2, 0, name, leader)
        s2.civ_gpp[B0, 0, s2._prophet_cls] = 500.0
        s2._advance_great_people(0, torch.ones(s2.B, dtype=torch.bool))
        return float(s2.civ_gpp[B0, 0, s2._prophet_cls])

    assert prophet("KONGO", "MVEMBA") == 0.0, "Mvemba banked Great Prophet points"
    assert prophet(None, None) > 0.0, "the baseline banked nothing, so the scene proves nothing"
    print(f"  8 Religious Convert OK — 0 Holy Site plots of {plain}, and no Prophet")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_hwarang(rules, path)
    test_nobel_points(rules, path)
    test_nobel_favor(rules, path)
    test_mana(rules, path)
    test_ocean_access(rules, path)
    test_righteousness(rules, path)
    test_religious_convert(rules, path)
    print("BATTERY OK title_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
