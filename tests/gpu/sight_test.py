"""SIGHT IS OCCLUSION BY ELEVATION — the GPU half (tests/cpu/map/fog.test.ts's
LOS scenes are the TS twin).

    python tests/gpu/sight_test.py

Measured in the live game (ask 11): a tile on the ray hides
everything behind it iff its SightThroughModifier sum EXCEEDS the observer's
SightModifier; a hill adds height, never range; Sentry sees through features.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import los_tables
from warmup import settle_all


def main() -> None:
    # -- 1: the hex line, once per map — the straight row and the line's shape
    tgt, mid = los_tables(16, 16, 5)
    W = 16
    a = 10 * W + 5
    row = {int(tgt[a, k]): k for k in range(tgt.shape[1]) if int(tgt[a, k]) >= 0}
    assert len(row) == 90, f"the disk within 5 of an inner tile holds 90 tiles, got {len(row)}"
    k = row[10 * W + 8]
    assert mid[a, k].tolist()[:2] == [10 * W + 6, 10 * W + 7] and int(mid[a, k, 2]) == -1, \
        f"the straight line east from (5,10) to (8,10) passes (6,10),(7,10): {mid[a, k].tolist()}"
    # every line: distance - 1 mids, each adjacent to the last, the first beside the eye
    from core.simbase import neighbor_table
    nb = neighbor_table(16, 16)
    for k2 in range(tgt.shape[1]):
        b = int(tgt[a, k2])
        if b < 0:
            continue
        ms = [int(m) for m in mid[a, k2].tolist() if m >= 0]
        prev = a
        for m in ms:
            assert m in nb[prev].tolist(), f"line {a}->{b}: mid {m} is not beside {prev}"
            prev = m
        assert b in nb[prev].tolist() or not ms and b in nb[a].tolist(), f"line {a}->{b} does not end beside the target"
    print("  1 lines OK — 90 targets within 5, the straight row exact, every line a chain of neighbours")

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
