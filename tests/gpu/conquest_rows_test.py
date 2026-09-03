"""THE CONQUERED CITY, THE SECOND HORSE AND THE BOOST — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/conquest_rows_test.py

The TS twin is tests/cpu/seats/conquest-rows.test.ts.

CIV6 (the install's TraitModifiers): People of the Steppe, the Great Turkish
Bombard, Free Imperial Cities, Mother Russia, Dynastic Cycle, The First
Emperor, Satyagraha, Surrounded by Glory, Grand Vizier, Magnanimous and
El Escorial.
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
from core.simbase import js_round

B0 = 0
RULES = json.loads((Path(__file__).resolve().parent.parent.parent
                    / "seeder" / "worlds" / "rules.json").read_text())
UNITS = [u["id"] for u in RULES["units"]]
TECHS = [t["id"] for t in RULES["techs"]]
DISTRICTS = [d["id"] for d in RULES["districts"]]


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
    assert len(sim._extra_unit_copy_rows) == 1 and len(sim._conquest_pop_rows) == 1
    assert len(sim._not_founded_rows) == 2 and len(sim._extra_district_rows) == 1
    assert len(sim._city_tiles_rows) == 1 and len(sim._boost_pct_rows) == 2
    assert len(sim._district_prereq_rows) == 1 and len(sim._war_weariness_rows) == 1
    assert len(sim._peaceful_founder_rows) == 1 and len(sim._yield_per_suzerain_rows) == 1
    assert len(sim._governor_title_grant_rows) == 1 and len(sim._gp_refund_rows) == 1
    assert len(sim._evict_pct_rows) == 1
    light = sorted(UNITS[i] for i in range(sim.NU) if bool(sim._type_lightcav[i]))
    assert light == ["CAVALRY", "COURSER", "HELICOPTER", "HORSEMAN"], light
    print("  1 wire OK — 13 families, 4 light-cavalry chassis")


def test_free_imperial_cities(rules, path) -> None:
    """+1 district past the population cap, and nobody else."""
    def cap(name) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        s2.city_pop[B0, 0, 0] = 1
        return int(s2._district_cap(0, 0)[B0])

    plain = cap(None)
    assert plain >= 1, "the baseline city had no district slot"
    assert cap("GERMANY") == plain + 1, "Free Imperial Cities paid nothing"
    print(f"  2 Free Imperial Cities OK — {plain + 1} slots against {plain}")


def test_mother_russia(rules, path) -> None:
    """Five more tiles at founding, in ascending tile index."""
    def owned(name) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        far = next(t for t in range(s2.T)
                   if bool(s2.settle_ok[B0, t]) and int(s2.tile_seat[B0, t]) < 0
                   and int(s2.pair_dist[int(s2.city_center[B0, 0, 0]), t]) >= 8)
        before = int((s2.tile_seat[B0] == 0).sum())
        s2._found_city_at(0, torch.ones(s2.B, dtype=torch.bool),
                          torch.full((s2.B,), far, dtype=torch.long))
        assert bool(s2.city_alive[B0, 0, 1]), "the city never founded"
        return int((s2.tile_seat[B0] == 0).sum()) - before

    plain = owned(None)
    assert plain == 7, f"the baseline claimed {plain}, not the centre and its ring"
    assert owned("RUSSIA") == plain + 5, "Mother Russia claimed no extra territory"
    print(f"  3 Mother Russia OK — {plain + 5} tiles against {plain}")


def test_dynastic_cycle(rules, path) -> None:
    """A boost worth ten points more, on techs and on civics alike."""
    def cost(name, is_civic: bool) -> float:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        base = (s2.rules_dev.c_cost if is_civic else s2.rules_dev.t_cost)[:1]
        boosted = torch.ones(1, dtype=torch.bool)
        return float(s2._eff_cost(base.reshape(1), boosted, 0, is_civic=is_civic)[0])

    sim = fresh(rules, path)
    frac = float(sim.rules.boost_fraction)
    assert abs(frac - 0.4) < 1e-9, f"the base boost fraction moved to {frac}"
    for is_civic in (False, True):
        base = float((sim.rules_dev.c_cost if is_civic else sim.rules_dev.t_cost)[0])
        # js_round's own rounding, not a ratio: a small base cost rounds and a
        # ratio assertion would read the rounding, not the fraction
        want_p = float(js_round(torch.tensor([base * (1 - frac)], dtype=torch.float64))[0])
        want_c = float(js_round(torch.tensor([base * (1 - frac - 0.1)], dtype=torch.float64))[0])
        assert cost(None, is_civic) == want_p, f"the baseline paid {cost(None, is_civic)}, not {want_p}"
        assert cost("CHINA", is_civic) == want_c, f"China paid {cost('CHINA', is_civic)}, not {want_c}"
        assert want_c < want_p, "the scene's base cost is too small to tell the two apart"
    print("  4 Dynastic Cycle OK — the boost takes half the cost, not two fifths")


def test_first_emperor(rules, path) -> None:
    """The Canal at Masonry, and the Builder's extra charge."""
    canal_di = DISTRICTS.index("CANAL")
    sim = fresh(rules, path)
    si = next((i for i, p in enumerate(sim._scaffold) if p[0] == canal_di), -1)
    assert si >= 0, "the Canal is not in the scaffold"
    usual = sim._scaffold[si][1]

    def open_at(name, leader, techs: tuple[str, ...]) -> bool:
        s2 = fresh(rules, path)
        seat(s2, 0, name, leader)
        s2.civ_techs[B0, 0, :] = False
        for t in techs:
            s2.civ_techs[B0, 0, TECHS.index(t)] = True
        s2._eff_version += 1
        return bool(s2._district_unlocked(0, si)[B0])

    assert open_at("CHINA", "QIN", ("MASONRY",)), "Masonry did not open Qin's Canal"
    assert not open_at(None, None, ("MASONRY",)), "Masonry opened a plain seat's Canal"
    if usual >= 0:
        assert open_at(None, None, (TECHS[usual],)), "the usual tech did not open the Canal"
        # the override REPLACES the edge, so the usual tech no longer opens it
        assert not open_at("CHINA", "QIN", (TECHS[usual],)), "Qin kept the usual unlock too"

    def charges(name, leader, unit: str) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name, leader)
        ui = torch.full((s2.B,), UNITS.index(unit), dtype=torch.long)
        at = torch.full((s2.B,), int(s2.city_center[B0, 0, 0]), dtype=torch.long)
        return int(s2._extra_charges(0, ui, at)[B0])

    assert charges("CHINA", "QIN", "BUILDER") == charges(None, None, "BUILDER") + 1, "Qin's Builder charge"
    assert charges("SPAIN", "PHILIP_II", "INQUISITOR") == charges(None, None, "INQUISITOR") + 1, \
        "Philip's Inquisitor charge"
    print("  5 The First Emperor OK — the Canal at Masonry, and both extra charges")


def test_satyagraha(rules, path) -> None:
    """Gandhi's enemy wearies twice as fast, and his Faith counts founders."""
    sim = fresh(rules, path)
    foe = torch.zeros(sim.B, dtype=torch.long)
    plain = int(sim._ww_enemy_mult(foe)[B0])
    assert plain == 100, f"a plain foe read {plain}"
    lead(sim, 0, "INDIA", "GANDHI")
    assert int(sim._ww_enemy_mult(foe)[B0]) == 200, "Gandhi did not double it"
    play(sim, 0, "ROME")
    assert int(sim._ww_enemy_mult(foe)[B0]) == 100, "the doubling outlived Gandhi"
    print("  6 Satyagraha OK — 200 against Gandhi, 100 against anyone else")


def test_grand_vizier(rules, path) -> None:
    """A Governor Title at Gunpowder, RunOnce and nobody else's."""
    def titles(name, leader, has_gp: bool) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name, leader)
        s2.civ_techs[B0, 0, :] = False
        if has_gp:
            s2.civ_techs[B0, 0, TECHS.index("GUNPOWDER")] = True
        s2._eff_version += 1
        return int(s2._governor_titles_earned(0)[B0])

    if not fresh(rules, path).n_governors:
        print("  7 Grand Vizier SKIPPED — this build seats no governors")
        return
    assert titles("OTTOMAN", "SULEIMAN", False) == titles(None, None, False), "a title before Gunpowder"
    assert titles("OTTOMAN", "SULEIMAN", True) == titles(None, None, True) + 1, "no title at Gunpowder"
    print("  7 Grand Vizier OK — one title, and only at Gunpowder")


def test_turkish_bombard(rules, path) -> None:
    """An Amenity and four Loyalty in a city the Ottomans did not found."""
    bidx, col = torch.tensor([B0]), torch.tensor([0])

    def pair(name, founded: bool) -> tuple[float, float, float]:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        s2.city_founder[B0, 0, 0] = 0 if founded else 1
        s2._eff_version += 1
        # `_seat_amenity` returns the TIER and its factors, never a headcount,
        # so the flat add is pinned at its own reader and the tier is checked
        # not to fall (the TS twin pins the full arithmetic)
        return (float(s2._not_founded_sum(0, 0)[B0, 0]),
                float(s2._seat_amenity(0)[0][B0, 0]),
                float(s2._standing_loyalty(0, bidx, col)[0]))

    o_add, o_tier, o_loy = pair("OTTOMAN", False)
    p_add, p_tier, p_loy = pair(None, False)
    assert o_add == 1.0 and p_add == 0.0, f"the amenity add read {o_add} against {p_add}"
    assert o_tier >= p_tier, f"the amenity tier fell, {o_tier} against {p_tier}"
    assert o_loy == p_loy + 4, f"the loyalty read {o_loy} against {p_loy}"
    f_add, _f_tier, f_loy = pair("OTTOMAN", True)
    q_add, _q_tier, q_loy = pair(None, True)
    assert f_add == q_add == 0.0, "a city the Ottomans founded took the amenity"
    assert f_loy == q_loy, "a city the Ottomans founded took the loyalty"
    print("  8 the Great Turkish Bombard OK — +1 Amenity, +4 Loyalty, only where not founded")


def test_conquest_population(rules, path) -> None:
    """The install keeps the whole population; everyone else loses a quarter."""
    sim = fresh(rules, path)
    keep = {}
    for name in (None, "OTTOMAN"):
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        got = 75
        for _cc, _cl, _cp in s2._conquest_pop_rows:
            if bool(s2._row_is(0, _cc, _cl)[B0]):
                got = max(got, _cp)
        keep[name] = got
    assert keep[None] == 75 and keep["OTTOMAN"] == 100, keep
    assert sim._conquest_pop_rows[0][2] == 100
    print("  9 the conquered population OK — 100% for the Ottomans, 75% for anyone else")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_free_imperial_cities(rules, path)
    test_mother_russia(rules, path)
    test_dynastic_cycle(rules, path)
    test_first_emperor(rules, path)
    test_satyagraha(rules, path)
    test_grand_vizier(rules, path)
    test_turkish_bombard(rules, path)
    test_conquest_population(rules, path)
    print("BATTERY OK conquest_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
