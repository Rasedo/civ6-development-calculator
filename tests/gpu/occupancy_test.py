"""Occupancy self-test — the seat-aware stacking rules.

The stacking predicates are POKED directly (the buy_wire_test pattern):
manufacture a civ civilian, assert every probe direction, prove
snapshot/restore round-trips the occupancy planes, then let a long run produce
organic builders and check plane/slot coherence against them.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.engine import BARB_SEAT  # seat-keyed occupancy
from warmup import developed, settle_all


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for _ in range(20):
        sim.step()

    # manufacture a civ CIVILIAN of civ 0 on a free passable tile
    free = (
        (sim.barb_at[0] < 0)
        & (sim.military_at[0] < 0)
        & (sim.civilian_at[0] < 0)
        & sim.passable[0]
    ).nonzero(as_tuple=True)[0]
    t = int(free[0])
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = 1  # civ 0's absolute seat
    sim.major_unit_type[0, slot] = 0
    sim.major_unit_tile[0, slot] = t
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_charges[0, slot] = 3
    # the merged occupancy map is what every predicate below reads
    sim.civilian_at[0, t] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1

    tiles = torch.tensor([[t]])
    assert bool(sim._blocked_for(tiles, 0)[0, 0]), "civ civilian must block seat-0 military (foreign)"
    assert bool(sim._blocked_for(tiles, 0, is_civilian=True)[0, 0]), "civ civilian must block seat-0 civilian (foreign)"
    assert bool(sim._blocked_for(tiles, BARB_SEAT)[0, 0]), "civ civilian must block barbarians"
    assert not bool(sim._blocked_for(tiles, 1)[0, 0]), "own-civ military stacks cross-domain"
    assert bool(sim._blocked_for(tiles, 2)[0, 0]), "foreign-civ civ military is blocked"
    assert bool(sim._blocked_for(tiles, 1, is_civilian=True)[0, 0]), "own-civ civilian blocks (same domain)"
    assert bool(sim._blocked_for(tiles, 2, is_civilian=True)[0, 0]), "foreign-civ civ civilian is blocked"

    # a civ MILITARY tile: own-civ civilian may enter (cross-domain), foreign may not
    mil = ((sim.military_at[0] >= 0)
           & (sim.unit_seat[0, sim.military_at[0].clamp(min=0)] > 0)
           & (sim.unit_seat[0, sim.military_at[0].clamp(min=0)] < 100)).nonzero(as_tuple=True)[0]
    if len(mil):
        mt = int(mil[0])
        mciv = int(sim.unit_seat[0, int(sim.military_at[0, mt])]) - 1
        mtiles = torch.tensor([[mt]])
        assert not bool(sim._blocked_for(mtiles, mciv + 1, is_civilian=True)[0, 0]), "own-civ civilian stacks on own military"
        assert bool(sim._blocked_for(mtiles, mciv + 2, is_civilian=True)[0, 0]), "foreign civilian blocked by civ military"
        assert bool(sim._blocked_for(mtiles, mciv + 1)[0, 0]), "own military blocks own military (same domain)"

    # snapshot/restore must round-trip the new planes
    snap = sim.snapshot()
    sim.civilian_at[0, t] = -1
    sim.major_unit_charges[0, slot] = 0
    sim.restore(snap)
    assert int(sim.civilian_at[0, t]) == slot + sim.POOL_LO["major"], "civilian_at not in snapshot"
    assert int(sim.major_unit_charges[0, slot]) == 3, "major_unit_charges not in snapshot"

    # builders arise organically from DRIVEN production (bare steps queue
    # nothing) — the plane must be POPULATED, and every alive civilian slot
    # must be indexed by it (plane/slot coherence).
    sim2 = developed(rules, paths[1], turns=40)
    seen = bool((sim2.civilian_at >= 0).any())
    assert seen, "no civ builder exists after a 40-turn driven run (B5b broken?)"
    b2 = sim2._builder_idx
    for u in range(int(sim2.unit_next[0])):
        if bool(sim2.major_unit_alive[0, u]) and int(sim2.major_unit_type[0, u]) == b2:
            tt2 = int(sim2.major_unit_tile[0, u])
            assert int(sim2.civilian_at[0, tt2]) == u, "alive builder not indexed by civilian_at"

    # spawn over an own builder: a fresh own-civ MILITARY spawn stacks with a
    # standing builder (cross-domain, tileFreeForUnit); a foreign spawn probe
    # bounces.
    anchor = torch.tensor([t])
    f_own, spot_own = sim._first_free_spot(anchor, 1)  # the builder's own seat
    assert bool(f_own[0]) and int(spot_own[0]) == t, "own-civ military spawn must land ON the builder tile"
    f_for, spot_for = sim._first_free_spot(anchor, 2)  # another seat entirely
    assert bool(f_for[0]) and int(spot_for[0]) != t, "foreign spawn must bounce off the builder tile"

    print("B5 OCCUPANCY OK")


if __name__ == "__main__":
    main()
