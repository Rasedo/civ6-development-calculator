"""THE SLOT, THE GREAT WORK AND THE CONQUERED FORMATION — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/slot_rows_test.py

The TS twin is tests/cpu/seats/slot-rows.test.ts.

CIV6 (the install's TraitModifiers): Founding Fathers, Founder of Carthage,
Eleanor's loyalty aura, the Toqui's training XP, Isibongo's conquest, the
Flying Squadron and the Roosevelt Corollary.
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
CIVICS = [c["id"] for c in RULES["civics"]]


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


def adopt_diplomatic(sim, row: int) -> tuple[int, int]:
    """Research whatever civic unlocks the highest-tier government holding a
    DIPLOMATIC slot, and answer its (diplomatic, wildcard) counts."""
    best, best_g = -1, -1
    for g in range(sim._ngov):
        if int(sim._gov_slots[g][2]) > 0 and int(sim._gov_tier[g]) > best:
            best, best_g = int(sim._gov_tier[g]), g
    assert best_g >= 0, "no government holds a diplomatic slot"
    sim.civ_civics[B0, row, :] = False
    ci = int(sim._gov_unlock_civic[best_g])
    assert ci >= 0, "that government names no unlocking civic"
    sim.civ_civics[B0, row, ci] = True
    sim._eff_version += 1
    if sim._gov_pol_cache is not None:
        sim._gov_pol_cache.clear()
    return int(sim._gov_slots[best_g][2]), int(sim._gov_slots[best_g][3])


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert len(sim._slot_convert_rows) == 1 and len(sim._slot_favor_rows) == 1
    assert len(sim._plaza_district_prod_rows) == 1
    assert len(sim._great_work_loyalty_rows) == 2       # both Eleanors
    assert len(sim._governor_xp_rows) == 2
    assert len(sim._conquest_formation_rows) == 1 and len(sim._spy_promo_rows) == 1
    assert len(sim._park_appeal_rows) == 1
    print("  1 wire OK — 8 families that ship")


def test_founding_fathers(rules, path) -> None:
    """Every Diplomatic slot moves to Wildcard, and each Wildcard pays a Favor."""
    def slots(name) -> tuple[int, int, int, int]:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        dip, wild = adopt_diplomatic(s2, 0)
        ex = s2._wonder_extra_slots(0)
        return dip, wild, int(ex[B0, 2]), int(ex[B0, 3])

    p_dip, p_wild, p_ed, p_ew = slots(None)
    a_dip, a_wild, a_ed, a_ew = slots("AMERICA")
    assert p_dip > 0, "the scene's government holds no diplomatic slot"
    assert a_ed == p_ed - p_dip, f"the diplomatic slots did not leave ({a_ed} vs {p_ed})"
    assert a_ew == p_ew + p_dip, f"the wildcard slots did not arrive ({a_ew} vs {p_ew})"

    def favor(name) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        adopt_diplomatic(s2, 0)
        return int(s2._slot_favor_of(0)[B0])

    assert favor(None) == 0, "a plain seat took the favor"
    assert favor("AMERICA") == p_wild + p_dip, "the favor did not count the converted slots"
    print(f"  2 Founding Fathers OK — {p_dip} slots moved, {p_wild + p_dip} favor")


def test_eleanor(rules, path) -> None:
    """A foreign city loses a Loyalty per Great Work in range, and none of its own."""
    sim = fresh(rules, path)
    if sim.n_majors < 2:
        print("  3 Eleanor SKIPPED — one major only")
        return

    def pull(name, leader, works: int, near: bool = True) -> float:
        s2 = fresh(rules, path)
        seat(s2, 1, name, leader)
        s2.city_gw_writing[B0, 1] = 0
        s2.city_gw_art[B0, 1] = 0
        s2.city_gw_music[B0, 1] = 0
        here_t = int(s2.city_center[B0, 0, 0])
        if near:
            # the fixture's own cities sit past the row's range, and a skipped
            # scene proves nothing — found row 1 a SECOND city inside it
            want = 4 if near else 12
            spot = next(t for t in range(s2.T)
                        if bool(s2.settle_ok[B0, t]) and int(s2.tile_seat[B0, t]) < 0
                        and int(s2.pair_dist[here_t, t]) == want)
            s2._found_city_at(1, torch.ones(s2.B, dtype=torch.bool),
                              torch.full((s2.B,), spot, dtype=torch.long))
            assert bool(s2.city_alive[B0, 1, 1]), "the near city never founded"
            s2.city_gw_writing[B0, 1, 1] = works
        else:
            s2.city_gw_writing[B0, 1, 0] = works
        s2._eff_version += 1
        here = s2.city_center[B0, 0, 0].reshape(1)
        return float(s2._great_work_loyalty(0, here)[0])
    assert pull("ENGLAND", "ELEANOR_ENGLAND", 0) == 0.0, "a workless city pulled"
    assert pull("ENGLAND", "ELEANOR_ENGLAND", 3) == -3.0, "three works did not pull 3"
    assert pull("FRANCE", "ELEANOR_FRANCE", 3) == -3.0, "the French Eleanor did not pull"
    assert pull(None, None, 3) == 0.0, "a plain seat pulled"
    # ...and nothing at all past the row's own range
    assert pull("ENGLAND", "ELEANOR_ENGLAND", 3, near=False) == 0.0, "a distant work pulled"
    # her OWN cities never pull her down
    s3 = fresh(rules, path)
    lead(s3, 0, "ENGLAND", "ELEANOR_ENGLAND")
    s3.city_gw_writing[B0, 0, 0] = 5
    s3._eff_version += 1
    here0 = s3.city_center[B0, 0, 0].reshape(1)
    assert float(s3._great_work_loyalty(0, here0)[0]) == 0.0, "her own works pulled her down"
    print("  3 Eleanor OK — one Loyalty per work in range, and never her own")


def test_toqui_xp(rules, path) -> None:
    """Training XP under an established governor, tripled where it did not found."""
    def pct(name, founded: bool, governed: bool) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        s2.city_founder[B0, 0, 0] = 0 if founded else 1
        if governed and s2.n_governors:
            s2.civ_gov_appointed[B0, 0, 0] = True
            s2.civ_gov_city[B0, 0, 0] = int(s2.city_id[B0, 0, 0])
            s2.civ_gov_establish[B0, 0, 0] = 0
        s2._eff_version += 1
        ui = torch.full((s2.B,), UNITS.index("WARRIOR"), dtype=torch.long)
        col = torch.zeros(s2.B, dtype=torch.long)
        return int(s2._train_xp_pct(s2.city_bldg[s2._bidx, 0, col, :], ui, 0, col)[B0])

    if not fresh(rules, path).n_governors:
        print("  4 the Toqui SKIPPED — this build seats no governors")
        return
    plain = pct(None, True, True)
    assert pct("MAPUCHE", True, True) == plain + 10, "the founded city's 10%"
    assert pct("MAPUCHE", False, True) == plain + 30, "the conquered city's 30%"
    assert pct("MAPUCHE", True, False) == plain, "an ungoverned city paid the XP"
    print("  4 the Toqui OK — +10% founded, +30% not, nothing without a governor")


def test_isibongo(rules, path) -> None:
    """The formation tier the civics allow, and no chassis that forms nothing."""
    sim = fresh(rules, path)
    play(sim, 0, "ZULU")
    warrior = UNITS.index("WARRIOR")
    sim.civ_civics[B0, 0, :] = False
    sim._eff_version += 1
    assert int(sim._formation_tier_for(0, warrior)[B0]) == 0, "a tier with no civic"
    merc = CIVICS.index("MERCENARIES")
    sim.civ_civics[B0, 0, merc] = True
    sim._eff_version += 1
    assert int(sim._formation_tier_for(0, warrior)[B0]) == 1, "Mercenaries did not open a Corps"
    builder = UNITS.index("BUILDER")
    assert int(sim._formation_tier_for(0, builder)[B0]) == 0, "a Builder formed up"
    print("  5 Isibongo OK — the civic names the tier, and a Builder forms nothing")


def test_flying_squadron(rules, path) -> None:
    """Catherine's spy is born promoted."""
    def level(name, leader) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name, leader)
        if s2._spy_idx < 0:
            return -1
        at = torch.full((s2.B,), int(s2.city_center[B0, 0, 0]), dtype=torch.long)
        one = torch.ones(s2.B, dtype=torch.bool)
        # `_spawn_unit` answers WHICH GAMES spawned, not the slot, so the spy
        # is found by its own chassis in the pool
        s2._spawn_unit(0, one, at, torch.full((s2.B,), s2._spy_idx, dtype=torch.long))
        live = (s2.major_unit_alive[B0] & (s2.major_unit_seat[B0] == 0)
                & (s2.major_unit_type[B0] == s2._spy_idx))
        assert bool(live.any()), "no spy stands"
        return int(s2.major_unit_spy_level[B0, int(live.long().argmax())])

    if level(None, None) < 0:
        print("  6 the Flying Squadron SKIPPED — no spy chassis on the wire")
        return
    assert level("FRANCE", "CATHERINE_DE_MEDICI") == 1, "Catherine's spy arrived unpromoted"
    assert level(None, None) == 0, "a plain seat's spy arrived promoted"
    print("  6 the Flying Squadron OK — born at level 1, and nobody else is")


def test_roosevelt(rules, path) -> None:
    """A city holding a National Park adds an Appeal to every tile it owns."""
    def appeal(name, leader, park: bool) -> float:
        s2 = fresh(rules, path)
        seat(s2, 0, name, leader)
        ctr = int(s2.city_center[B0, 0, 0])
        at = next(int(x) for x in s2.neigh[ctr].tolist() if x >= 0)
        s2.tile_seat[B0, at] = 0
        s2.tile_city[B0, at] = int(s2.city_id[B0, 0, 0])
        s2.park[B0] = -1
        if park:
            s2.park[B0, at] = at
        s2._tile_owner_ver += 1
        s2._eff_version += 1
        return float(s2._gp_appeal_plane()[B0, at])

    assert appeal("AMERICA", "T_ROOSEVELT", True) == 1.0, "the park paid no appeal"
    assert appeal("AMERICA", "T_ROOSEVELT", False) == 0.0, "a parkless city paid"
    assert appeal(None, None, True) == 0.0, "a plain seat took the appeal"
    print("  7 the Roosevelt Corollary OK — +1 Appeal where a park stands")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_founding_fathers(rules, path)
    test_eleanor(rules, path)
    test_toqui_xp(rules, path)
    test_isibongo(rules, path)
    test_flying_squadron(rules, path)
    test_roosevelt(rules, path)
    print("BATTERY OK slot_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
