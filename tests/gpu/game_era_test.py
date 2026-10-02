"""The game era's timeline and the age bars — the `gameEraTurn` / `enterEra`
twins, `_game_era_turn` / `_enter_era`, per game.

    python tests/gpu/game_era_test.py

  1. With no major in a later era every game runs its online maximum: the
     next eras begin on turns 31 and 61 (the H-1 Duels' first two).
  2. Where half the major rows stand in a later era the countdown starts at
     the minimum less the countdown and the era begins ten turns on (turn
     21), in that game alone: a game beside it keeps its maximum.
  3. The bars the era fixes: the whole-game score plus the scaled bases and
     the shifts, as `ageBars` composes them.
  4. A founding's moments (`foundingMoments`): the centre terrain's row, in
     the founding's game alone.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from warmup import warm_base  # noqa: E402


def build(rules, path, b: int = 2):
    return warm_base((str(path), b), lambda: BatchSim([load_fixture(path) for _ in range(b)], rules,
                                                      device="cpu", dtype=torch.float64))


def run_to(sim, to: int) -> list[list[int]]:
    """Drive only the game era's step from the sim's turn through `to`; the
    turns each game began a new era on."""
    began: list[list[int]] = [[] for _ in range(sim.B)]
    while sim.turn < to:
        sim.turn += 1
        was = sim.game_era.clone()
        sim._game_era_turn()
        for b in range(sim.B):
            if int(sim.game_era[b]) != int(was[b]):
                began[b].append(int(sim.turn))
    return began


def test_maximum(rules, path) -> None:
    sim = build(rules, path)
    sim.civ_techs[:] = False
    sim.civ_civics[:] = False
    sim.turn = 1
    assert sim.game_era.tolist() == [0, 0] and sim.era_start.tolist() == [1, 1]
    assert sim.era_countdown.tolist() == [-1, -1]
    began = run_to(sim, 65)
    assert began == [[31, 61], [31, 61]], began
    assert sim.era_start.tolist() == [61, 61]
    print("  1 maximum OK: eras at 31 and 61 with no major ahead")


def test_half_ahead(rules, path) -> None:
    sim = build(rules, path)
    sim.civ_techs[:] = False
    sim.civ_civics[:] = False
    sim.turn = 1
    nt = sim._tech_era.numel()
    classical = int((sim._tech_era[:nt] == 1).nonzero()[0])
    # game 0: half the major rows (rounded up) hold a Classical tech
    for row in range((sim.n_majors + 1) // 2):
        sim.civ_techs[0, row, classical] = True
    began = run_to(sim, 35)
    assert began == [[21], [31]], began
    print(f"  2 half ahead OK: game 0 at 21 ({(sim.n_majors + 1) // 2} of {sim.n_majors} ahead), game 1 at 31")


def test_bars(rules, path) -> None:
    sim = build(rules, path)
    er = rules.eras
    # the start bars: score 0, no city, no age, the Ancient row's shift
    start = [max(0, int(er["darkBase"]) + int(er["eraShift"][0])),
             max(0, int(er["goldenBase"]) + int(er["eraShift"][0]))]
    assert sim.dark_bar[0].tolist() == [start[0]] * sim.n_majors
    assert sim.golden_bar[0].tolist() == [start[1]] * sim.n_majors
    sim.era_score[:, 0] = 40
    sim.dark_ages[:, 0] = 1  # a Dark age entered before
    ncity = int(sim.city_alive[0, 0].long().sum())
    sim._enter_era(torch.tensor([True, False]))
    assert sim.game_era.tolist() == [1, 0]
    # 40 ≥ the start Golden bar: a Golden age, out of a Normal one
    assert int(sim.civ_age[0, 0]) == 2 and int(sim.golden_ages[0, 0]) == 1
    shift = (int(er["shiftPerCity"]) * max(0, ncity - 1) + int(er["shiftPastGolden"]) * 1
             + int(er["shiftPastDark"]) * 1 + int(er["eraShift"][1]))
    want = [40 + int(er["darkBase"]) + shift, 40 + int(er["goldenBase"]) + shift]
    assert [int(sim.dark_bar[0, 0]), int(sim.golden_bar[0, 0])] == want, want
    # the game that did not begin an era keeps its bars and ages
    assert [int(sim.dark_bar[1, 0]), int(sim.golden_bar[1, 0])] == start
    assert int(sim.civ_age[1, 0]) == 1
    print(f"  3 bars OK: {want} after a Golden age at 40")


def test_moments(rules, path) -> None:
    """4. The founding's terrain moment, and the world's first pantheon."""
    sim = build(rules, path)
    er = rules.eras
    row = 0
    # a founded city on a desert: the terrain row; drive the founding's
    # moments on its own slot
    # the settler-start fixture holds no city: stand one on a land plot
    j = 0
    ctr = int((~sim.water[0]).nonzero(as_tuple=True)[0][0])
    sim.city_alive[:, :sim.n_majors] = False  # no other city, no other major's city near
    sim.city_alive[:, row, j] = True
    sim.city_center[:, row, j] = ctr
    desert = next(int(t) for t, _ in er["momentTerrain"])
    sim.terrain[:, ctr] = desert
    before = sim.era_score[:, row].clone()
    rows = torch.tensor([0], dtype=torch.long)
    sim._founding_moments(row, rows, torch.tensor([j]), torch.tensor([ctr]))
    got = (sim.era_score[:, row] - before).tolist()
    want = int(er["momentTerrain"][0][1])
    assert got == [want, 0], f"the desert founding paid {got}, want [{want}, 0]"
    print(f"  4 moments OK: a desert founding +{want} in its game alone")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    p = paths[0]
    print(f"game_era_test on {p.name}:")
    test_maximum(rules, p)
    test_half_ahead(rules, p)
    test_bars(rules, p)
    test_moments(rules, p)
    print("GAME_ERA OK")


if __name__ == "__main__":
    main()
