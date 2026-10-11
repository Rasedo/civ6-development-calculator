"""THE RAID'S TREE on the GPU twin (`_barb_op_trees`, the twin of
`raidTick` in cpu/core/tactical.ts; tools/civ6lab/dll_readings.md "C-95: the
barbarians' raid").

    python tests/gpu/barb_raid_test.py

A raid that took its force marches on its target; within the march's range
the raid begins; the tribe's score at the Raid Check's sends it home; home at
its rally, Notify Owner lists the city for the tribe's assault and the tree
ends; a raid with no living unit through its raid ends.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import load_rules, fixture_paths
from core.simbase import BARB_SEAT
from warmup import warm_base, opened


def fresh(rules, path, turns=30):
    return warm_base((str(path), turns), lambda: opened(rules, path, turns))


def put(sim, u, tile):
    """the barbarian at local slot `u` to `tile`, its occupancy with it"""
    lo = sim.POOL_LO["barb"]
    sim._occ_clear(torch.tensor([0]), torch.tensor([int(sim.barb_unit_tile[0, u])]), torch.tensor([u + lo]))
    sim.barb_unit_tile[0, u] = tile
    sim._occ_set(torch.tensor([0]), torch.tensor([tile]), torch.tensor([u + lo]))


def open_plot(sim, near, dist):
    """a land plot `dist` from `near` no unit holds, no city on it"""
    land, _ = sim._tac_enter(BARB_SEAT)
    ctr = sim._centre_plane()[0]
    for t in range(sim.T):
        if (int(sim.pair_dist[near, t]) == dist and bool(land[0, t]) and not bool(ctr[t])
                and int(sim.military_at[0, t]) < 0 and int(sim.civilian_at[0, t]) < 0):
            return t
    raise AssertionError(f"no open plot {dist} from {near}")


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    sim = fresh(rules, path)
    sim._barb_slots()
    k = next(k for k in range(int(sim.n_tribes[0])) if bool(sim.tribe_alive[0, k]))
    camp = int(sim.tribe_plot[0, k])
    cs = [(int(sim.city_center[0, 0, c])) for c in range(sim.city_center.shape[2])
          if bool(sim.city_alive[0, 0, c])]
    assert cs, "the first major holds no city"
    target = max(cs, key=lambda c: int(sim.pair_dist[camp, c]))
    units = [s for s in sim.barb_unit_alive[0].nonzero(as_tuple=True)[0].tolist()
             if int(sim.barb_unit_seat[0, s]) == BARB_SEAT and not bool(sim.barb_unit_scout[0, s])
             and int(sim._type_combat[int(sim.barb_unit_type[0, s])]) > 0
             and not bool(sim.unit_naval[int(sim.barb_unit_type[0, s])])]
    assert units, "no barbarian fighter on land"
    u = units[0]
    sim.barb_unit_tribe[0, u] = k
    sim.tribe_defender[0][sim.tribe_defender[0] == u] = -1
    put(sim, u, open_plot(sim, camp, 1))
    sim.barb_unit_op[0] = False
    sim.barb_unit_op[0, u] = True
    sim.tribe_op[0, k] = 1
    sim.tribe_op_seat[0, k] = 0
    sim.tribe_op_plot[0, k] = target
    sim.tribe_rally[0, k] = camp
    sim.tribe_op_rec[0, k] = True
    sim.tribe_op_resume[0, k] = 9
    sim.tribe_op_done[0, k] = False
    sim.tribe_score[0, k] = 0

    def tick():
        sim._barb_reset_mp()
        sim._barbarian_tactics(sim.barb_unit_alive & (sim.barb_unit_seat == BARB_SEAT))

    # the march
    d0 = int(sim.pair_dist[int(sim.barb_unit_tile[0, u]), target])
    tick()
    d1 = int(sim.pair_dist[int(sim.barb_unit_tile[0, u]), target])
    assert int(sim.tribe_op_resume[0, k]) == 9 and d1 < d0, (
        f"the march: resume {int(sim.tribe_op_resume[0, k])}, from {d0} to {d1} of the target")
    print(f"  the raid marches on its target ({d0} -> {d1})")
    # within the march's range: the raid begins
    put(sim, u, open_plot(sim, target, 2))
    tick()
    assert int(sim.tribe_op_resume[0, k]) == 12 and int(sim.tribe_raid_from[0, k]) == int(sim.turn), (
        f"the raid: resume {int(sim.tribe_op_resume[0, k])}, began {int(sim.tribe_raid_from[0, k])}")
    print("  within the march's range the raid begins")
    # the score reached: home
    sim.tribe_score[0, k] = int(sim._bb["raidScore"])
    tick()
    assert int(sim.tribe_op_resume[0, k]) == 22, f"the raid check: resume {int(sim.tribe_op_resume[0, k])}"
    print("  the tribe's score sends it home")
    # home: the city to the assault list, the tree ends
    put(sim, u, open_plot(sim, camp, 1))
    tick()
    assert bool(sim.tribe_op_done[0, k]), "home at its rally, the raid's tree goes on"
    q = [(int(s), int(p)) for s, p in zip(sim.tribe_assq[0, k].tolist(), sim.tribe_assp[0, k].tolist()) if s >= 0]
    assert q == [(0, target)], f"the assault list {q}"
    print("  home, Notify Owner lists the city for the assault and the tree ends")
    # a raid with no unit living through its raid ends
    sim.tribe_op_done[0, k] = False
    sim.tribe_op_resume[0, k] = 12
    sim.tribe_raid_from[0, k] = int(sim.turn)
    sim.tribe_score[0, k] = 0
    lo = sim.POOL_LO["barb"]
    sim._occ_clear(torch.tensor([0]), torch.tensor([int(sim.barb_unit_tile[0, u])]), torch.tensor([u + lo]))
    sim.barb_unit_alive[0, u] = False
    tick()
    assert bool(sim.tribe_op_done[0, k]) and int(sim.tribe_op_dead[0, k]) == 1, (
        f"the raid of the dead: done {bool(sim.tribe_op_done[0, k])}, killed {int(sim.tribe_op_dead[0, k])}")
    print("  a raid whose units are all gone ends, its member killed counted")
    print("BARB RAID OK — the march, the raid, the score's end, the way home, the assault list, the raid of the dead")


if __name__ == "__main__":
    main()
