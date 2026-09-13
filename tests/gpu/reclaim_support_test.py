"""A pool compaction remaps the SUPPORT plane with the other three.

    python tests/gpu/reclaim_support_test.py

`_reclaim_pool` stably compacts a unit pool and remaps every tile->slot plane
through the inverse permutation. The remap tuple named `military_at`,
`civilian_at` and `embarked_at` — and not `support_at`, the plane a Military
Engineer, a Medic or a Battering Ram stands on — so after a compaction the
support plane pointed at whatever unit had moved INTO the old slot. TS splices
its array and has no such plane; only a forced compaction reaches it, so this
lane kills a unit BELOW a support unit and compacts by hand.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules,
                   device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def place(sim, tile, seat, utype) -> int:
    """Put `seat`'s unit of type `utype` on `tile` through the engine's own
    plane writer, return its MERGED slot."""
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = utype
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = 100
    sim.unit_next[0] += 1
    g = slot + sim.POOL_LO["major"]
    sim._occ_set(torch.tensor([0]), torch.tensor([tile]), torch.tensor([g]))
    return g


def free_land(sim) -> int:
    for t in range(sim.T):
        if (bool(sim.passable[0, t]) and int(sim.military_at[0, t]) < 0
                and int(sim.civilian_at[0, t]) < 0 and int(sim.support_at[0, t]) < 0):
            return t
    raise AssertionError("no free land tile")


def main() -> None:
    sim = build()
    sup_types = sim._type_support.nonzero().flatten().tolist()
    if not sup_types:
        print("  SKIPPED — no support chassis in the roster")
        return
    sup = sup_types[0]
    tile = free_land(sim)
    # a unit BELOW the support unit in slot order dies, so the compaction
    # moves the support unit down by one
    victim_tile = free_land(sim)
    victim = place(sim, victim_tile, 0, 2)  # WARRIOR
    tile = free_land(sim)
    g = place(sim, tile, 0, sup)
    assert int(sim.support_at[0, tile]) == g, "the engine's own plane writer did not file the support unit"
    sim.major_unit_alive[0, victim - sim.POOL_LO["major"]] = False
    sim._occ_clear(torch.tensor([0]), torch.tensor([victim_tile]), torch.tensor([victim]))
    sim._reclaim_pool("major")
    # where did the support unit land?
    alive = sim.major_unit_alive[0]
    hits = ((sim.major_unit_tile[0] == tile) & alive & (sim.major_unit_type[0] == sup)).nonzero().flatten().tolist()
    assert len(hits) == 1, f"the support unit is not exactly once in the pool after compaction: {hits}"
    new_g = hits[0] + sim.POOL_LO["major"]
    # the pool carries earlier deaths too, so the unit moves down by at least
    # the one slot this lane killed — the plane must follow it wherever it went
    assert new_g < g, f"the compaction did not move the support unit ({g} -> {new_g})"
    got = int(sim.support_at[0, tile])
    assert got == new_g, (
        f"support_at still names slot {got} after the compaction moved the unit to {new_g} — "
        f"`_reclaim_pool` must remap `support_at` with the other planes"
    )
    print(f"  support unit slot {g} -> {new_g} after compaction; support_at follows — RECLAIM SUPPORT OK")


if __name__ == "__main__":
    main()
