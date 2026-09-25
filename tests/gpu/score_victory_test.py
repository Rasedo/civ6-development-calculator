"""CIV 6'S SCORE and the turn-limit victory, GPU side — the twin of
tests/cpu/victory/score-victory.test.ts.

`score_lines` counts the install's ScoringLineItems (cpu/data/scoring.ts): the
whole game's era score, civics 3, cities 5, completed districts 2 (a completed
wonder's own district included), citizens 1, Great People earned 5, the
founded religion's beliefs 5, techs 2, completed wonders 15. Past the turn
limit `victory_row` names `leader()`: the highest Score among the majors that
hold a city, ties to the higher line in TieBreakerPriority order, then to the
lower row. No scripted game ties at the limit, so this lane pins the order.

Run: PYTHONIOENCODING=utf-8 python tests/gpu/score_victory_test.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths  # noqa: E402
from warmup import opened, plant_city, warm_base  # noqa: E402

B0 = 0


def fresh(rules, path):
    return warm_base(str(path), lambda: opened(rules, path))


def level(sim) -> None:
    """Every major at the same Score: one city of one citizen, nothing else."""
    for r in range(sim.n_majors):
        sim.civ_civics[B0, r] = False
        sim.civ_techs[B0, r] = False
        sim.era_score[B0, r] = 0
        sim.era_score_past[B0, r] = 0
        sim.civ_gp_earned[B0, r] = 0
        for p in ("civ_follower", "civ_founder", "civ_enhancer"):
            getattr(sim, p)[B0, r] = -1
        alive = sim.city_alive[B0, r, : sim.RC]
        sim.city_pop[B0, r, : sim.RC] = torch.where(alive, torch.ones_like(sim.city_pop[B0, r, : sim.RC]),
                                                    sim.city_pop[B0, r, : sim.RC])


def total(sim, r: int) -> int:
    return int(sim.score_lines(r)[B0].sum())


def free_ring(sim, centre: int, n: int) -> list[int]:
    """`n` bare plots one step from `centre` — no district, no wonder, no city."""
    ok = ((sim.pair_dist[centre] == 1) & (sim.district[B0] < 0) & (sim.built_wonder[B0] < 0)
          & (sim.centre_slot_at[B0] < 0))
    ts = ok.nonzero(as_tuple=True)[0].tolist()
    assert len(ts) >= n, f"only {len(ts)} bare plots beside tile {centre}"
    return ts[:n]


def test_counts(rules, path) -> None:
    sim = fresh(rules, path)
    lines = [ln["count"] for ln in sim.rules.scoring]
    assert lines == ["eraScore", "civics", "cities", "districts", "population",
                     "greatPeople", "religion", "techs", "wonders"], lines
    assert [int(ln["value"]) for ln in sim.rules.scoring] == [1, 3, 5, 2, 1, 5, 5, 2, 15]
    r = 0
    plant_city(sim, r)
    cols = sim.city_alive[B0, r, : sim.RC].nonzero(as_tuple=True)[0].tolist()
    assert len(cols) == 2, f"seat {r} holds {len(cols)} cities, wanted 2"
    a, b = cols
    sim.civ_civics[B0, r] = False
    sim.civ_civics[B0, r, :2] = True
    sim.civ_techs[B0, r] = False
    sim.civ_techs[B0, r, :3] = True
    sim.city_pop[B0, r, a] = 3
    sim.city_pop[B0, r, b] = 4
    # a completed Campus counts, a placed Theater Square does not
    campus = next(i for i, d in enumerate(sim.districts_cat) if d["id"] == "CAMPUS")
    theater = next(i for i, d in enumerate(sim.districts_cat) if d["id"] == "THEATER_SQUARE")
    t_campus, t_pyr = free_ring(sim, int(sim.city_center[B0, r, a]), 2)
    t_theater, t_ora = free_ring(sim, int(sim.city_center[B0, r, b]), 2)
    for col, d, t, done in ((a, campus, t_campus, True), (b, theater, t_theater, False)):
        sim.city_dist_tile[B0, r, col, d] = t
        sim.district[B0, t] = d
        sim.district_complete[B0, t] = done
    # a completed wonder counts as a wonder AND as a district; one still under
    # construction counts as neither
    for col, wi, t, done in ((a, 0, t_pyr, True), (b, 1, t_ora, False)):
        sim.city_wonder[B0, r, col, wi] = t
        sim.built_wonder[B0, t] = wi
        sim.built_wonder_complete[B0, t] = done
    sim.civ_gp_earned[B0, r] = 0
    sim.civ_gp_earned[B0, r, 0] = 1
    sim.civ_gp_earned[B0, r, 1] = 1
    # founded and enhanced: three beliefs; the pantheon is not one of them
    sim.civ_pantheon[B0, r] = 0
    sim.civ_follower[B0, r] = 0
    sim.civ_founder[B0, r] = 0
    sim.civ_enhancer[B0, r] = 0
    sim.era_score[B0, r] = 9
    sim.era_score_past[B0, r] = 30
    got = dict(zip(lines, (int(x) for x in sim.score_lines(r)[B0].tolist())))
    want = {"eraScore": 39, "civics": 6, "cities": 10, "districts": 4, "population": 7,
            "greatPeople": 10, "religion": 15, "techs": 6, "wonders": 15}
    assert got == want, f"score lines {got}, wanted {want}"
    print(f"  1 counts OK — {got}")


def test_era_bank(rules, path) -> None:
    sim = fresh(rules, path)
    sim.era_score[B0, 0] = 12
    sim.era_score_past[B0, 0] = 5
    sim.turn = sim._era_len - 1
    sim.step()
    assert int(sim.turn) % sim._era_len == 0
    assert int(sim.era_score[B0, 0]) == 0, "the boundary resets the era's window"
    assert int(sim.era_score_past[B0, 0]) == 17, (
        f"the boundary banks the closed era: {int(sim.era_score_past[B0, 0])}, wanted 17")
    print("  2 era bank OK — 5 + 12 banked at the boundary, the window reset")


def test_ties(rules, path) -> None:
    sim = fresh(rules, path)
    assert sim.n_majors >= 2, "the lane needs two majors"
    level(sim)
    assert total(sim, 0) == total(sim, 1)
    assert int(sim.leader()[B0]) == 0, "a level field goes to the lower row"
    # the era line (1010) outranks the techs (40)
    sim = fresh(rules, path)
    level(sim)
    sim.civ_techs[B0, 0, :2] = True
    sim.era_score[B0, 1] = 4
    assert total(sim, 0) == total(sim, 1)
    assert int(sim.leader()[B0]) == 1, "the era line breaks the tie"
    # the civic line (100) outranks the techs (40)
    sim = fresh(rules, path)
    level(sim)
    sim.civ_techs[B0, 0, :3] = True
    sim.civ_civics[B0, 1, :2] = True
    assert total(sim, 0) == total(sim, 1)
    assert int(sim.leader()[B0]) == 1, "the civic line breaks the tie"
    # a seat with no city cannot win it
    sim = fresh(rules, path)
    level(sim)
    sim.civ_techs[B0, 1, :3] = True
    sim.city_alive[B0, 1] = False
    assert int(sim.leader()[B0]) == 0, "a seat with no city won the Score"
    print("  3 ties OK — era line, then civics over techs, then the lower row; a cityless seat never")


def test_turn_limit(rules, path) -> None:
    sim = fresh(rules, path)
    sim.civ_civics[B0, 1, :4] = True
    sim.turn = int(sim.rules.turn_limit) - 1
    sim.step()
    assert not bool(sim.game_over[B0]) and int(sim.victory_row[B0]) == -1
    sim.step()
    assert bool(sim.game_over[B0]), "the game runs past the turn limit"
    assert int(sim.victory_type[B0]) == 1, f"victory type {int(sim.victory_type[B0])}, wanted 1 (score)"
    assert int(sim.victory_row[B0]) == 1, f"the score victory named row {int(sim.victory_row[B0])}, wanted 1"
    assert int(sim.victory_row[B0]) == int(sim.leader()[B0])
    print("  4 turn limit OK — the game ends on the score and names the leader")


def main() -> int:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"score_victory_test on {path.name}")
    test_counts(rules, path)
    test_era_bank(rules, path)
    test_ties(rules, path)
    test_turn_limit(rules, path)
    print("score_victory_test OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
