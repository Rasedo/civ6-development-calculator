"""SIGHT IS OCCLUSION BY ELEVATION — the GPU half (tests/cpu/map/fog.test.ts's
LOS scenes are the TS twin).

    python tests/gpu/sight_test.py

The game's line-of-sight walk (`losDisk`): each plot carries the higher of
its own SightThroughModifier sum and its parent's carried height, and shows
when the parent's is below its own or no higher than the eye's; a hill adds
height, never range; Sentry sees through features.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import sight_tables
from warmup import settle_all


def main() -> None:
    # -- 1: the walk's tables, once per map — every plot within 5 once, each
    # parent beside its plot and one ring in, a side plot's two parents
    tgt, par, pick = sight_tables(16, 16, False, 5)
    W = 16
    a = 10 * W + 5
    from core.simbase import neighbor_table, pair_distances
    nb = neighbor_table(16, 16, False)
    pd = pair_distances(16, 16, False)
    row = [int(x) for x in tgt[a].tolist()]
    assert len([x for x in row if x >= 0]) == 90, "the walk within 5 of an inner tile holds 90 tiles"
    assert sorted(x for x in row if x >= 0) == sorted(b for b in range(W * 16) if 1 <= int(pd[a, b]) <= 5)
    sides = 0
    for j, b in enumerate(row):
        ring = int(pd[a, b])
        assert 3 * ring * (ring - 1) <= j < 3 * ring * (ring + 1), f"place {j} is not on ring {ring}"
        ps = [int(x) for x in par[a, j].tolist() if int(x) >= 0]
        assert ps, f"{b} has no parent"
        for q in ps:
            pt = a if q == 0 else row[q - 1]
            assert pt in nb[b].tolist() and int(pd[a, pt]) == ring - 1, f"parent {pt} of {b} is not beside it one ring in"
        sides += len(ps) == 2 and ring == 2 and int(pick[a, j]) == 0
    assert sides == 6, f"the six ring-2 side plots take both parents ({sides})"
    print("  1 tables OK — 90 plots within 5 in ring order, each parent one ring in beside its plot, the side plots both")

    # -- 2: the look itself, on the fixture map
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules, device="cpu", dtype=torch.float64))
    assert sim._sight_hills == 1 and sim._sight_mountain == 2 and sim._sight_max == 5
    woods = [i for i in range(sim._feat_sight_through.numel())
             if int(sim._feat_sight_through[i]) == 1 and bool(sim._feat_passable[i]) and not bool(sim._feat_natural[i])]
    assert woods, "no passable feature with a through-cost of 1 (Woods / Rainforest)"
    # an eye on a FLAT land tile whose two tiles east are land: o -> e1 -> e2
    o = e1 = e2 = -1
    for t in range(sim.T):
        n1 = int(sim.neigh[t, 0])
        n2 = int(sim.neigh[n1, 0]) if n1 >= 0 else -1
        if n1 < 0 or n2 < 0:
            continue
        if any(bool(sim.water[0, x]) or bool(sim.tile_mountain[0, x]) for x in (t, n1, n2)):
            continue
        o, e1, e2 = t, n1, n2
        break
    assert o >= 0, "no flat land row of three on the fixture"
    for x in (o, e1, e2):
        sim.hills[0, x] = False
        sim.feat_id[0, x] = -1
    b0 = torch.tensor([0])
    look = lambda st: sim._los_disk(b0, torch.tensor([o]), torch.tensor([2]), torch.tensor([st]))[0]
    assert bool(look(False)[e1]) and bool(look(False)[e2]), "open ground: both tiles east are seen"
    sim.hills[0, e1] = True
    assert bool(look(False)[e1]) and not bool(look(False)[e2]), "a hill in the way hides the tile behind it from a flat eye"
    sim.hills[0, o] = True
    assert bool(look(False)[e2]), "an eye on a hill looks over a hill"
    sim.feat_id[0, e1] = woods[0]
    assert not bool(look(False)[e2]), "hill + woods (2) tops a hill eye (1)"
    assert bool(look(True)[e2]), "Sentry's look counts no feature: hill (1) alone does not top a hill eye"
    sim.hills[0, e1] = False
    sim.hills[0, o] = False
    assert not bool(look(False)[e2]) and bool(look(True)[e2]), "woods alone hide from a flat eye, not from a Sentry"
    sim.feat_id[0, e2] = woods[0]
    assert not bool(look(False)[e2]), "a wooded plot does not show over woods: its equal hides it"
    sim.hills[0, e2] = True
    assert bool(look(False)[e2]), "a wooded hill (2) shows over woods (1)"
    sim.hills[0, e2] = False
    sim.feat_id[0, e2] = -1
    # a CHOPPED wood keeps its old id behind the strip flag: it hides nothing
    sim.feat_stripped[0, e1] = True
    assert bool(look(False)[e2]), "a felled feature still blocked the look (read the live feature, not feat_id)"
    sim.feat_stripped[0, e1] = False
    # range is the eye's own: a hill eye with sight 2 still stops at 2
    sim.feat_id[0, e1] = -1
    sim.hills[0, o] = True
    e3 = int(sim.neigh[e2, 0])
    if e3 >= 0:
        assert not bool(look(False)[e3]), "a hill adds height, never range"
    print("  2 look OK — flat eye blocked by a hill or woods, a hill eye over either, not over both; Sentry through woods; no range from the hill")

    # -- 3: the reveal reads the look: a spawn on the hill eye lifts the cut disk
    sim.hills[0, e1] = True
    sim.feat_id[0, e1] = woods[0]
    sim.seat_explored[0, 0] = False
    sim._reveal_around(b0, 0, torch.tensor([o]), torch.tensor([2]), see_through=torch.tensor([False]))
    assert bool(sim.seat_explored[0, 0, o]) and bool(sim.seat_explored[0, 0, e1]) and not bool(sim.seat_explored[0, 0, e2])
    sim._reveal_around(b0, 0, torch.tensor([o]), torch.tensor([2]))
    assert bool(sim.seat_explored[0, 0, e2]), "a reveal with no look (a city's) lifts the whole disk"
    print("  3 reveal OK — a unit's reveal is the cut disk, a city's the whole one")
    print("SIGHT OK")


if __name__ == "__main__":
    main()
