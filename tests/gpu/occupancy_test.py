"""Occupancy self-test — the seat-aware stacking rules.

The stacking predicates are POKED directly (the purchase_test pattern):
manufacture a civ civilian, assert every probe direction, prove
snapshot/restore round-trips the occupancy planes, then let a long run produce
organic builders and check plane/slot coherence against them.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES
from core.engine import PLAYER_SEAT, BARB_SEAT  # seat-keyed occupancy


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    for _ in range(20):
        sim.step()

    # manufacture a civ CIVILIAN of civ 0 on a free passable tile
    free = (
        (sim.barb_at[0] < 0)
        & (sim.pmil_at[0] < 0)
        & (sim.pciv_at[0] < 0)
        & (sim.vmil_at[0] < 0)
        & (sim.vciv_at[0] < 0)
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
    sim.occ_civ[0, t] = slot + sim.POOL_LO["v"]
    # the merged occupancy map is what every predicate below reads
    sim.occ_civ[0, t] = slot + sim.POOL_LO["v"]
    sim.v_next[0] += 1

    tiles = torch.tensor([[t]])
    assert bool(sim._blocked_for(tiles, PLAYER_SEAT)[0, 0]), "civ civilian must block player military (foreign)"
    assert bool(sim._blocked_for(tiles, PLAYER_SEAT, is_civilian=True)[0, 0]), "civ civilian must block player civilian (foreign)"
    assert bool(sim._blocked_for(tiles, BARB_SEAT)[0, 0]), "civ civilian must block barbarians"
    assert not bool(sim._blocked_for(tiles, 0 + 1)[0, 0]), "own-civ military stacks cross-domain"
    assert bool(sim._blocked_for(tiles, 1 + 1)[0, 0]), "foreign-civ civ military is blocked"
    assert bool(sim._blocked_for(tiles, 0 + 1, is_civilian=True)[0, 0]), "own-civ civilian blocks (same domain)"
    assert bool(sim._blocked_for(tiles, 1 + 1, is_civilian=True)[0, 0]), "foreign-civ civ civilian is blocked"

    # a civ MILITARY tile: own-civ civilian may enter (cross-domain), foreign may not
    mil = (sim.vmil_at[0] >= 0).nonzero(as_tuple=True)[0]
    if len(mil):
        mt = int(mil[0])
        mciv = int(sim.v_civ[0, int(sim.vmil_at[0, mt])])
        mtiles = torch.tensor([[mt]])
        assert not bool(sim._blocked_for(mtiles, mciv + 1, is_civilian=True)[0, 0]), "own-civ civilian stacks on own military"
        assert bool(sim._blocked_for(mtiles, mciv + 2, is_civilian=True)[0, 0]), "foreign civilian blocked by civ military"
        assert bool(sim._blocked_for(mtiles, mciv + 1)[0, 0]), "own military blocks own military (same domain)"

    # snapshot/restore must round-trip the new planes
    snap = sim.snapshot()
    sim.occ_civ[0, t] = -1
    sim.v_charges[0, slot] = 0
    sim.restore(snap)
    assert int(sim.vciv_at[0, t]) == slot, "vciv_at not in snapshot"
    assert int(sim.occ_civ[0, t]) == slot + sim.POOL_LO["v"], "occ_civ not in snapshot"
    assert int(sim.v_charges[0, slot]) == 3, "v_charges not in snapshot"

    # builders arise organically — the plane must be POPULATED somewhere in a
    # 70-turn run, and every alive civilian slot must be indexed by it
    # (plane/slot coherence).
    sim2 = BatchSim([load_fixture(paths[1])], rules, device="cpu", dtype=torch.float64)
    seen = False
    for _ in range(70):
        sim2.step()
        seen = seen or bool((sim2.vciv_at >= 0).any())
    assert seen, "no civ builder ever existed in 70 turns (B5b broken?)"
    b2 = sim2._builder_idx
    for u in range(int(sim2.v_next[0])):
        if bool(sim2.v_alive[0, u]) and int(sim2.v_type[0, u]) == b2:
            tt2 = int(sim2.v_tile[0, u])
            assert int(sim2.vciv_at[0, tt2]) == u, "alive builder not indexed by vciv_at"

    # spawn over an own builder: a fresh own-civ MILITARY spawn stacks with a
    # standing builder (cross-domain, tileFreeForUnit); a foreign spawn probe
    # bounces.
    anchor = torch.tensor([t])
    f_own, spot_own = sim._first_free_spot(anchor, "civ", civ=0)
    assert bool(f_own[0]) and int(spot_own[0]) == t, "own-civ military spawn must land ON the builder tile"
    f_for, spot_for = sim._first_free_spot(anchor, "civ", civ=1)
    assert bool(f_for[0]) and int(spot_for[0]) != t, "foreign spawn must bounce off the builder tile"

    print("B5 OCCUPANCY OK")


if __name__ == "__main__":
    main()
