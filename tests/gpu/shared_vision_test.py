"""AN ALLIANCE THAT SHARES WHAT IT SEES — the GPU half (C-70).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/shared_vision_test.py

The TS twin is tests/cpu/map/shared-vision.test.ts.

CIV6 (Poundmaker, TRAIT_ALLIANCE_SHARED_VIS): the install writes
EFFECT_ADJUST_PLAYER_ALL_ALLIANCES_PROVIDE_SHARED_VIS with `ShareVis: true` —
a boolean, no direction and no level. Read as MUTUAL, which is what "shared"
means in the alliance system it names.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0


def build(path) -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(path)], load_rules(),
                              device="cpu", dtype=torch.float64))
    assert sim.fog_of_war, "this lane needs fog on"
    return sim


def _seat_leader(sim, row: int, leader) -> None:
    if leader is None:
        sim.row_civ[B0, row] = -1
        sim.row_leader[B0, row] = -1
    else:
        li = sim._leader_idx(leader)
        sim.row_civ[B0, row] = sim._pair_civ[li]
        sim.row_leader[B0, row] = li
    sim._eff_version += 1
    sim._gen_ver += 1


def _ally(sim, a: int, b: int, turns: int = 10) -> None:
    sim.seat_ally_turns[B0, a, b] = turns
    sim.seat_ally_turns[B0, b, a] = turns


def _dark_tile(sim, rows) -> int:
    """A tile no row in `rows` has explored yet."""
    dark = torch.ones(sim.T, dtype=torch.bool)
    for r in rows:
        dark &= ~sim.seat_explored[B0, r]
    t = dark.nonzero().flatten()
    assert t.numel(), "every tile is already explored"
    return int(t[-1])


def test_the_wire(rules, path) -> None:
    sim = build(path)
    rows = sim._alliance_shared_vis_rows
    assert len(rows) == 1, f"one carrier expected, wire has {len(rows)}"
    _c, leader = rows[0]
    assert leader >= 0, "the carrier names no leader"
    print("  1 the wire OK — one row, and it names a leader")


def test_the_ally_is_shown_what_the_carrier_uncovers(rules, path) -> None:
    sim = build(path)
    _c, li = sim._alliance_shared_vis_rows[0]
    sim.row_civ[B0, 0] = sim._pair_civ[li]
    sim.row_leader[B0, 0] = li
    sim._eff_version += 1
    sim._gen_ver += 1
    _ally(sim, 0, 1)
    t = _dark_tile(sim, (0, 1))
    sim._reveal_around(torch.tensor([B0]), 0, torch.tensor([t]), 0)
    assert bool(sim.seat_explored[B0, 0, t]), "the carrier did not see its own reveal"
    assert bool(sim.seat_explored[B0, 1, t]), "the ally was not shown it"
    print("  2 the ally OK — shown what the carrier uncovers")


def test_it_is_mutual(rules, path) -> None:
    """The ally carries no row of its own, and its look still opens the
    carrier's fog — "shared" is not one-way."""
    sim = build(path)
    _c, li = sim._alliance_shared_vis_rows[0]
    sim.row_civ[B0, 0] = sim._pair_civ[li]
    sim.row_leader[B0, 0] = li
    _seat_leader(sim, 1, None)
    _ally(sim, 0, 1)
    t = _dark_tile(sim, (0, 1))
    sim._reveal_around(torch.tensor([B0]), 1, torch.tensor([t]), 0)
    assert bool(sim.seat_explored[B0, 1, t]), "the ally did not see its own reveal"
    assert bool(sim.seat_explored[B0, 0, t]), "the carrier was not shown the ally's"
    print("  3 mutual OK — either side carrying it opens both")


def test_a_non_ally_and_a_plain_alliance_are_shown_nothing(rules, path) -> None:
    sim = build(path)
    _c, li = sim._alliance_shared_vis_rows[0]
    sim.row_civ[B0, 0] = sim._pair_civ[li]
    sim.row_leader[B0, 0] = li
    sim._eff_version += 1
    sim._gen_ver += 1
    _ally(sim, 0, 1)
    if sim.n_majors > 2:
        t = _dark_tile(sim, tuple(range(sim.n_majors)))
        sim._reveal_around(torch.tensor([B0]), 0, torch.tensor([t]), 0)
        assert not bool(sim.seat_explored[B0, 2, t]), "a seat outside the alliance was shown it"

    # ...and an alliance where NOBODY carries the row shares nothing
    bare = build(path)
    _seat_leader(bare, 0, None)
    _seat_leader(bare, 1, None)
    _ally(bare, 0, 1)
    t2 = _dark_tile(bare, (0, 1))
    bare._reveal_around(torch.tensor([B0]), 0, torch.tensor([t2]), 0)
    assert bool(bare.seat_explored[B0, 0, t2]), "the revealer did not see its own reveal"
    assert not bool(bare.seat_explored[B0, 1, t2]), "a plain alliance shared fog"
    print("  4 the gates OK — no alliance, no row, no sharing")


def test_no_alliance_shares_nothing(rules, path) -> None:
    sim = build(path)
    _c, li = sim._alliance_shared_vis_rows[0]
    sim.row_civ[B0, 0] = sim._pair_civ[li]
    sim.row_leader[B0, 0] = li
    sim._eff_version += 1
    sim._gen_ver += 1
    sim.seat_ally_turns[B0] = 0                      # nobody is allied
    t = _dark_tile(sim, (0, 1))
    sim._reveal_around(torch.tensor([B0]), 0, torch.tensor([t]), 0)
    assert not bool(sim.seat_explored[B0, 1, t]), "fog was shared without an alliance"
    print("  5 no alliance OK — the row alone shares nothing")


def test_the_discovery_stays_with_the_discoverer(rules, path) -> None:
    """A seat merely SHOWN a natural wonder scores no era points for it: the
    fog write travels and the event does not."""
    sim = build(path)
    _c, li = sim._alliance_shared_vis_rows[0]
    sim.row_civ[B0, 0] = sim._pair_civ[li]
    sim.row_leader[B0, 0] = li
    sim._eff_version += 1
    sim._gen_ver += 1
    _ally(sim, 0, 1)
    nw = (sim.nwonder[B0] & ~sim.seat_explored[B0, 0] & ~sim.seat_explored[B0, 1]).nonzero().flatten()
    if nw.numel() == 0:
        print("  6 the discovery SKIPPED — no unexplored natural wonder in this fixture")
        return
    t = int(nw[0])
    before = int(sim.era_score[B0, 1])
    sim._reveal_around(torch.tensor([B0]), 0, torch.tensor([t]), 0)
    assert bool(sim.seat_explored[B0, 1, t]), "the ally was not shown the wonder"
    assert int(sim.era_score[B0, 1]) == before, "an ally SHOWN a wonder scored it"
    print("  6 the discovery OK — the fog travels, the era score does not")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_the_ally_is_shown_what_the_carrier_uncovers(rules, path)
    test_it_is_mutual(rules, path)
    test_a_non_ally_and_a_plain_alliance_are_shown_nothing(rules, path)
    test_no_alliance_shares_nothing(rules, path)
    test_the_discovery_stays_with_the_discoverer(rules, path)
    print("BATTERY OK shared_vision")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
