"""C1-B5a occupancy self-test.

No rival civilian exists organically until B5b spawns builders, so the
civ-aware stacking rules are POKED directly (the purchase_test pattern):
manufacture a rival civilian, assert every probe direction, and prove
snapshot/restore round-trips the new tensors.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    for _ in range(20):
        sim.step()

    # manufacture a rival CIVILIAN of civ 0 on a free passable tile
    free = (
        (sim.barb_at[0] < 0)
        & (sim.pmil_at[0] < 0)
        & (sim.pciv_at[0] < 0)
        & (sim.rv_at[0] < 0)
        & (sim.rvciv_at[0] < 0)
        & sim.passable[0]
    ).nonzero(as_tuple=True)[0]
    t = int(free[0])
    slot = int(sim.v_next[0])
    sim.v_alive[0, slot] = True
    sim.v_civ[0, slot] = 0
    sim.v_type[0, slot] = 0
    sim.v_tile[0, slot] = t
    sim.v_hp[0, slot] = 100
    sim.v_charges[0, slot] = 3
    sim.rvciv_at[0, t] = slot
    sim.v_next[0] += 1

    tiles = torch.tensor([[t]])
    assert bool(sim._blocked_for(tiles, "pmil")[0, 0]), "rival civilian must block player military (foreign)"
    assert bool(sim._blocked_for(tiles, "pciv")[0, 0]), "rival civilian must block player civilian (foreign)"
    assert bool(sim._blocked_for(tiles, "barb")[0, 0]), "rival civilian must block barbarians"
    assert not bool(sim._blocked_for(tiles, "rmil", civ=0)[0, 0]), "own-civ military stacks cross-domain"
    assert bool(sim._blocked_for(tiles, "rmil", civ=1)[0, 0]), "foreign-civ rival military is blocked"
    assert bool(sim._blocked_for(tiles, "rciv", civ=0)[0, 0]), "own-civ civilian blocks (same domain)"
    assert bool(sim._blocked_for(tiles, "rciv", civ=1)[0, 0]), "foreign-civ rival civilian is blocked"

    # a rival MILITARY tile: own-civ civilian may enter (cross-domain), foreign may not
    mil = (sim.rv_at[0] >= 0).nonzero(as_tuple=True)[0]
    if len(mil):
        mt = int(mil[0])
        mciv = int(sim.v_civ[0, int(sim.rv_at[0, mt])])
        mtiles = torch.tensor([[mt]])
        assert not bool(sim._blocked_for(mtiles, "rciv", civ=mciv)[0, 0]), "own-civ civilian stacks on own military"
        assert bool(sim._blocked_for(mtiles, "rciv", civ=mciv + 1)[0, 0]), "foreign civilian blocked by rival military"
        assert bool(sim._blocked_for(mtiles, "rmil", civ=mciv)[0, 0]), "own military blocks own military (same domain)"

    # snapshot/restore must round-trip the new planes
    snap = sim.snapshot()
    sim.rvciv_at[0, t] = -1
    sim.v_charges[0, slot] = 0
    sim.restore(snap)
    assert int(sim.rvciv_at[0, t]) == slot, "rvciv_at not in snapshot"
    assert int(sim.v_charges[0, slot]) == 3, "v_charges not in snapshot"

    # the plane is inert in real play: nothing populates it pre-B5b
    sim2 = BatchSim([load_fixture(paths[1])], rules, device="cpu", dtype=torch.float64)
    for _ in range(60):
        sim2.step()
    assert not bool((sim2.rvciv_at >= 0).any()), "no organic rival civilian should exist before B5b"

    print("B5a OCCUPANCY OK")


if __name__ == "__main__":
    main()
