"""THE WONDER, THE RIVER AND THE POST — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/danube_rows_test.py

The TS twin is tests/cpu/seats/danube-rows.test.ts.

CIV6 (the install's TraitModifiers): France's wonder band and tourism, Pearl
of the Danube, Ortoo, Faces of Peace, Strength in Unity, Sahel Merchants and
the Grand Embassy.
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
TECHS = [t["id"] for t in RULES["techs"]]
TERRAINS = RULES["terrains"] if isinstance(RULES.get("terrains"), list) else None


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
    assert len(sim._wonder_era_prod_rows) == 1 and len(sim._wonder_tourism_rows) == 1
    assert len(sim._river_cross_prod_rows) == 2 and len(sim._immediate_post_rows) == 1
    # the visibility family grew with Catherine's flat level
    assert len(sim._diplo_vis_rows) == 2 and len(sim._war_ban_rows) == 3
    assert len(sim._tourism_favor_rows) == 1 and len(sim._emergency_favor_rows) == 1
    assert len(sim._golden_dedication_rows) == 1
    assert len(sim._intl_route_terrain_rows) == 1
    assert len(sim._golden_route_capacity_rows) == 1 and len(sim._progress_trade_rows) == 1
    # the band is inclusive at both ends, on the engine's own era indices
    _fc, _fl, _fs, _fe, _fp = sim._wonder_era_prod_rows[0]
    assert 0 <= _fs < _fe and _fp == 20
    # the visibility row ADDS a second step rather than replacing the first
    assert max(r[3] for r in sim._diplo_vis_rows) == sim._vis_cs_per_level
    print("  1 wire OK — 12 families, and the visibility step doubles")


def test_faces_of_peace(rules, path) -> None:
    """Canada declares no surprise war, and takes none."""
    sim = fresh(rules, path)
    if sim.n_majors < 2:
        print("  2 Faces of Peace SKIPPED — one major only")
        return

    def declared(name_a, name_b) -> bool:
        s2 = fresh(rules, path)
        seat(s2, 0, name_a)
        seat(s2, 1, name_b)
        s2.war[B0, 0, 1] = False
        s2.war[B0, 1, 0] = False
        s2.treaty_turns[B0, 0, 1] = 0
        s2.seat_denounced[B0, 0, 1] = 0          # no casus belli -> a SURPRISE war
        s2._declare_war_major(0, 1, torch.ones(s2.B, dtype=torch.bool))
        return bool(s2.war[B0, 0, 1])

    assert declared(None, None), "a plain seat could not declare"
    assert not declared("CANADA", None), "Canada declared a surprise war"
    assert not declared(None, "CANADA"), "a surprise war was declared ON Canada"
    print("  2 Faces of Peace OK — no surprise war either way, and others declare freely")


def test_tourism_favor(rules, path) -> None:
    """A Favor per hundred Tourism a turn."""
    def favor(name, rate: int) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        s2.civ_tour_rate[B0, 0] = rate
        s2._eff_version += 1
        return int(s2._tourism_favor_of(0)[B0])

    assert favor("CANADA", 250) == 2, "250 tourism did not pay 2"
    assert favor("CANADA", 99) == 0, "under a hundred paid"
    assert favor(None, 250) == 0, "a plain seat took the favor"
    print("  3 the tourism favor OK — 2 at 250, 0 at 99, none for a plain seat")


def test_ortoo(rules, path) -> None:
    """A trading post is a level of sight, and the step doubles."""
    sim = fresh(rules, path)
    if sim.n_majors < 2:
        print("  4 Ortoo SKIPPED — one major only")
        return

    def level(name, post: bool) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        s2.trading_post[B0] = False
        if post:
            _ctr = int(s2.city_center[B0, 1, 0])
            assert _ctr >= 0, "the target seats no city"
            s2.trading_post[B0, 0, _ctr] = True
        s2._eff_version += 1
        return int(s2._diplo_vis()[B0, 0, 1])

    assert level("MONGOLIA", False) == level(None, False), "a postless Mongol saw more"
    assert level("MONGOLIA", True) == level(None, True) + 1, "the post paid no level"

    def cs(name) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        s2.civ_techs[B0, :, :] = False
        if s2._vis_tech >= 0:
            s2.civ_techs[B0, 0, s2._vis_tech] = True   # one level of advantage
        s2._eff_version += 1
        return int(s2._vis_cs(torch.zeros(s2.B, dtype=torch.long),
                              torch.ones(s2.B, dtype=torch.long))[B0])

    plain = cs(None)
    assert plain > 0, "the baseline had no visibility advantage, so the scene proves nothing"
    assert cs("MONGOLIA") == plain * 2, f"Mongolia read {cs('MONGOLIA')} against {plain}"
    print(f"  4 Ortoo OK — the post is a level, and {plain} doubles to {plain * 2}")


def test_sahel_merchants(rules, path) -> None:
    """A Trade Capacity per golden age entered."""
    def cap(name, leader, ages: int) -> int:
        s2 = fresh(rules, path)
        seat(s2, 0, name, leader)
        s2.golden_ages[B0, 0] = ages
        s2._eff_version += 1
        return int(s2._trade_capacity(0)[B0])

    assert cap("MALI", "MANSA_MUSA", 0) == cap(None, None, 0), "a golden-less seat gained capacity"
    assert cap("MALI", "MANSA_MUSA", 2) == cap(None, None, 2) + 2, "two golden ages paid nothing"
    print("  5 Sahel Merchants OK — one Trade Capacity per golden age entered")


def test_strength_in_unity(rules, path) -> None:
    """A GOLDEN age still pays the normal era score, for this row alone."""
    def score(name, age: int) -> float:
        s2 = fresh(rules, path)
        seat(s2, 0, name)
        if s2.ded_picks.shape[2] == 0:
            return -1.0
        # COMMIT one: the fixture picks none this early, and a skipped scene
        # proves nothing about the guard this row reaches past
        kind = next((k for k in range(len(s2._ded_event_score))
                     if float(s2._ded_event_score[k]) > 0), -1)
        if kind < 0:
            return -1.0
        s2.ded_picks[B0, 0, 0] = kind
        s2.civ_age[B0, 0] = age
        before = float(s2.era_score[B0, 0])
        s2._dedication_event(0, kind, torch.ones(s2.B, dtype=torch.long))
        return float(s2.era_score[B0, 0]) - before

    plain_norm = score(None, 1)
    if plain_norm < 0:
        print("  6 Strength in Unity SKIPPED — this scene commits no dedication")
        return
    assert plain_norm > 0, "a normal age paid no era score"
    assert score(None, 2) == 0.0, "a plain seat scored in a golden age"
    assert score("GEORGIA", 2) == plain_norm, "Georgia did not keep the normal bonus"
    print("  6 Strength in Unity OK — the golden age still pays the normal era score")


def test_wonder_tourism_is_per_game(rules, path) -> None:
    """The roster mask is [B] — ONE answer per game in the batch. A batch
    where a single game seats France must not pay every game: a collapsed
    `.any()` here doubled a neighbouring game's tourism, and only a batched
    serve shard could see it (single-seed runs stayed green)."""
    sim = BatchSim([load_fixture(path), load_fixture(path)], rules,
                   device="cpu", dtype=torch.float64)
    _c, _l, _p = sim._wonder_tourism_rows[0]
    row = 1
    # game 0 seats nobody on this row; game 1 seats the carrier
    sim.row_civ[0, row] = -1
    sim.row_leader[0, row] = -1
    sim.row_civ[1, row] = _c
    sim.row_leader[1, row] = sim._pair_civ.index(_c) if _c >= 0 else _l
    sim._eff_version += 1
    got = sim._wonder_tourism_pct(row).tolist()
    assert got == [0, _p], f"per-game percentage read {got}, expected [0, {_p}]"
    # ...and the row is per ROW too: another row of the same games takes none
    other = 0 if row else 1
    assert sim._wonder_tourism_pct(other).tolist() == [0, 0], (
        "a row that does not seat the carrier was paid")
    print("  7 wonder tourism OK — per game and per row, never batch-wide")

def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_faces_of_peace(rules, path)
    test_tourism_favor(rules, path)
    test_ortoo(rules, path)
    test_sahel_merchants(rules, path)
    test_strength_in_unity(rules, path)
    test_wonder_tourism_is_per_game(rules, path)
    print("BATTERY OK danube_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
