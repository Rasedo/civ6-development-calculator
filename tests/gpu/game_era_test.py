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
  5. A Campus's high starting adjacency (`districtMoment`): once, where its
     adjacency reaches its row's bonus.
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
        sim._game_era_turn(int(sim.turn))
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
    sim._enter_era(torch.tensor([True, False]), int(sim.turn))
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


def test_high_adjacency(rules, path) -> None:
    """5. `districtMoment`: a Campus completed where its adjacency reaches its
    row's bonus records the high-adjacency moment, in that game alone and
    once; one a point short records nothing."""
    sim = build(rules, path)
    row, j = 0, 0
    di, need, key = next((d, a, k) for d, a, k in sim._mk_high_adj
                         if sim.districts_cat[d]["id"] == "CAMPUS")
    t = int((~sim.water[0]).nonzero(as_tuple=True)[0][0])
    sim.district[:, t] = di
    sim.d_static_adj[0, t, di] = float(need)
    sim.d_static_adj[1, t, di] = float(need - 1)
    sim.city_alive[:, row, j] = True
    col = torch.tensor([j, j])
    dtile = torch.tensor([t, t])
    made = torch.tensor([True, True])
    before = sim.era_score[:, row].clone()
    sim._district_completed(row, col, dtile, made)
    got = (sim.era_score[:, row] - before).tolist()
    pay = int(sim._mk_plain[key])
    assert got == [pay, 0], f"the Campus at {need} / {need - 1} paid {got}, want [{pay}, 0]"
    again = sim.era_score[:, row].clone()
    sim._district_completed(row, col, dtile, made)
    assert sim.era_score[:, row].tolist() == again.tolist(), "the high-adjacency moment paid twice"
    print(f"  5 high adjacency OK: a Campus at {need} pays +{pay} once, one at {need - 1} nothing")


def test_formation_and_encampment(rules, path) -> None:
    """6. The once keys of a Corps on a living unit and of a city holding
    every Encampment building set (`momentKeysHeld`), in the game that holds
    them alone."""
    sim = build(rules, path)
    row, j = 0, 0
    sim.city_alive[:, row, j] = True
    corps = int(sim._mk_formation[0, 1])
    camp = sim._mk_full_camp
    held = sim._moment_held(row)
    assert not bool(held[:, corps].any()) and not bool(held[:, camp].any()), "keys held before anything stands"
    slot = int((~sim.major_unit_alive[0]).nonzero(as_tuple=True)[0][0])
    land = int((~sim.unit_naval).nonzero(as_tuple=True)[0][0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = row
    sim.major_unit_type[0, slot] = land
    sim.major_unit_formation[0, slot] = 1
    for r in range(sim._suz_mil_bldg.shape[0]):
        sim.city_bldg[0, row, j, int(sim._suz_mil_bldg[r, 0])] = True
    held = sim._moment_held(row)
    assert held[:, corps].tolist() == [True, False], f"the Corps key {held[:, corps].tolist()}"
    assert held[:, camp].tolist() == [True, False], f"the Encampment key {held[:, camp].tolist()}"
    print("  6 once keys OK: a Corps and a full Encampment, in their game alone")


def test_disaster_improvement(rules, path) -> None:
    """7. An improvement laid on a plot a natural disaster enriched records
    its once key (`improvementMoment`): one on a plain plot records nothing,
    one on an enriched plot pays the row once, in its game alone; an
    improvement standing on an enriched plot holds no key."""
    sim = build(rules, path)
    row = 0
    k = sim._mk_disaster_imp
    t = int((sim.tile_seat[0] < 0).nonzero(as_tuple=True)[0][0])
    sim.tile_seat[:, t] = row
    rows = torch.tensor([0], dtype=torch.long, device=sim.device)
    tiles = torch.tensor([t], dtype=torch.long, device=sim.device)
    before = sim.era_score[:, row].clone()
    sim._moment_disaster_improvement(row, rows, tiles)
    assert not bool(sim.moment_seen[:, row, k].any()), "an improvement on a plain plot recorded the key"
    sim.fertility[0, t] = 1
    sim.improvement[:, t] = 0
    assert not bool(sim._moment_held(row)[:, k].any()), "a standing improvement held the key"
    sim._moment_disaster_improvement(row, rows, tiles)
    sim._moment_disaster_improvement(row, rows, tiles)
    assert sim.moment_seen[:, row, k].tolist() == [True, False], "the enriched improvement's key"
    paid = (sim.era_score[:, row] - before).tolist()
    assert paid == [int(sim._mk_world[k]), 0], f"the key paid {paid}"
    print("  7 disaster improvement OK: an improvement laid on an enriched plot, once, in its game alone")


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
    test_high_adjacency(rules, p)
    test_formation_and_encampment(rules, p)
    test_disaster_improvement(rules, p)
    print("GAME_ERA OK")


if __name__ == "__main__":
    main()
