"""The barbarians' turn on the GPU twin: a camp's tribe takes its kind from its
ground, raises its defender and scout, and spawns on its clock.

    python tests/gpu/barb_camps_test.py

CIV6 (BarbarianTribes, the barbarian manager — tools/civ6lab/dll_readings.md
"H-1: the barbarians' turn"): the first tribe row a camp meets is its kind — a
cavalry tribe an unowned Horses plot within its ResourceRange, a melee tribe
otherwise inland; a new camp raises its defender on the camp and its scout
within three plots; a living tribe under its unit cap spawns a melee or ranged
unit every TurnsToWarriorSpawn turns. The raider AI walks onto a Free City's
district like any other target.

The gate drives barbarians every game, but whether a camp of any seed rises
near Horses is not something a run can be counted on for, so the lane builds
the camp.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import FREE_SEAT
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def inland_tile(sim) -> int:
    """A passable unowned land tile with no water neighbour and nothing on it
    or round it — a camp neither the naval row nor a unit can answer for."""
    for t in range(sim.T):
        if not bool(sim.passable[0, t]) or bool(sim.wpass[0, t]) or int(sim.tile_seat[0, t]) >= 0:
            continue
        if int(sim.centre_slot_at[0, t]) >= 0 or int(sim.improvement[0, t]) >= 0:
            continue
        ring = [int(r) for r in sim._barb_ring[t].tolist()[:19] if r >= 0]
        if len(ring) < 19:
            continue
        if any(bool(sim.wpass[0, n]) or int(sim.military_at[0, n]) >= 0 or int(sim.civilian_at[0, n]) >= 0
               or int(sim.centre_slot_at[0, n]) >= 0 for n in ring):
            continue
        return t
    raise AssertionError("no inland tile for the camp")


def clear_barbs(sim) -> None:
    lo = sim.POOL_LO["barb"]
    for s in sim.barb_unit_alive[0].nonzero(as_tuple=True)[0].tolist():
        t = int(sim.barb_unit_tile[0, s])
        if int(sim.military_at[0, t]) == s + lo:
            sim.military_at[0, t] = -1
        if int(sim.civilian_at[0, t]) == s + lo:
            sim.civilian_at[0, t] = -1
        sim.barb_unit_alive[0, s] = False
    sim.camp_tile[0, :] = -1
    sim.n_camps[0] = 0
    sim.n_tribes[0] = 0
    sim.tribe_alive[0, :] = False
    sim.barb_unit_tribe[0, :] = -1


def horses_near(sim, tile: int, on: bool) -> None:
    _coastal, horse, rng, *_ = sim._bb["tribes"][1]
    near = sim.pair_dist[tile] <= rng
    sim.res_id[0][near & (sim.res_id[0] == horse)] = -1
    if on:
        spot = [int(t) for t in near.nonzero(as_tuple=True)[0].tolist() if t != tile][0]
        sim.res_id[0, spot] = horse
        sim.tile_seat[0, spot] = -1


def camp(sim, tile: int) -> int:
    """Raise one camp on `tile`; its tribe's slot."""
    mask = torch.zeros(sim.B, dtype=torch.bool)
    mask[0] = True
    plot = torch.full((sim.B,), tile, dtype=torch.long)
    k = int(sim.n_tribes[0])
    sim._barb_raise_camp(mask, plot)
    assert int(sim.n_tribes[0]) == k + 1, "no tribe founded"
    return k


def main() -> None:
    sim = build()
    tribes = sim._bb["tribes"]
    tile = inland_tile(sim)

    # THE KIND IS THE GROUND
    clear_barbs(sim)
    horses_near(sim, tile, on=False)
    k = camp(sim, tile)
    assert int(sim.tribe_kind[0, k]) == len(tribes) - 1, "an inland camp with no Horses is not melee"
    clear_barbs(sim)
    horses_near(sim, tile, on=True)
    k = camp(sim, tile)
    assert int(sim.tribe_kind[0, k]) == 1, "a camp with unowned Horses in range is not cavalry"
    print("  a camp's tribe takes the first row its ground meets")

    # THE CAMP RAISES ITS DEFENDER AND ITS SCOUT
    lo = sim.POOL_LO["barb"]
    assert int(sim.military_at[0, tile]) >= lo, "no defender on the camp"
    kk = torch.full((sim.B,), k, dtype=torch.long)
    assert int(sim._barb_living(kk, True)[0]) == 1, "the camp raised no scout"
    assert int(sim._barb_living(kk, False)[0]) == 0, "the defender counts against the spawn cap"
    print("  a new camp raises its defender and its scout")

    # THE SPAWN CLOCK
    every = int(tribes[1][4])
    for i in range(every - 1):
        sim._barb_tribe_turn(k)
        assert int(sim._barb_living(kk, False)[0]) == 0, f"spawned after {i + 1} of {every} turns"
    sim._barb_tribe_turn(k)
    assert int(sim._barb_living(kk, False)[0]) == 1, f"no spawn on turn {every}"
    assert int(sim.tribe_spawn[0, k]) == 0, "the clock did not reset on the spawn"
    print(f"  a cavalry tribe spawns every {every} turns")

    # THE RAID REACHES THE FREE CITIES: `isTerritorial` counts FREE_SEAT ground,
    # so a Free City's Campus two flat steps away is the nearest job and the
    # raider walks onto it (the `hostileUnitAct` twin).
    clear_barbs(sim)
    sim.barb_camps_begun[0] = True

    def flat(t: int) -> bool:
        return (bool(sim.passable[0, t]) and not bool(sim.wpass[0, t]) and not bool(sim.hills[0, t])
                and int(sim.feat_id[0, t]) < 0 and int(sim.district[0, t]) < 0
                and int(sim.centre_slot_at[0, t]) < 0
                and int(sim.military_at[0, t]) < 0 and int(sim.civilian_at[0, t]) < 0
                and int(sim.improvement[0, t]) < 0)

    scene = None
    for c in range(sim.T):
        if not flat(c):
            continue
        for mid in [n for n in sim.neigh[c].tolist() if n >= 0 and flat(n)]:
            far = [n for n in sim.neigh[mid].tolist() if n >= 0 and n != c and flat(n)
                   and int(sim.pair_dist[c, n]) == 2]
            if far:
                scene = (c, mid, far[0])
                break
        if scene:
            break
    assert scene, "no flat three-tile line for the free-city raid scene"
    campus, _mid, start = scene
    dix = 1 if sim._encamp_didx == 0 else 0
    sim.tile_seat[0, campus] = FREE_SEAT
    sim.district[0, campus] = dix
    sim.district_complete[0, campus] = True
    sim.district_pillaged[0, campus] = False
    sim._tile_owner_ver += 1
    sim._eff_version += 1
    horseman = int(sim._barb_unit_for()[0, int(tribes[1][6])])
    assert horseman >= 0, "the barbarians field no cavalry melee unit"
    slot = int(sim.next_slot[0])
    sim.barb_unit_alive[0, slot] = True
    sim.barb_unit_type[0, slot] = horseman
    sim.barb_unit_tile[0, slot] = start
    sim.barb_unit_hp[0, slot] = 100
    sim.military_at[0, start] = slot + lo
    sim.next_slot[0] += 1   # the raider loop walks slots below next_slot
    sim._barbarian_phase()
    assert int(sim.barb_unit_tile[0, slot]) == campus, (
        f"the raider stands on {int(sim.barb_unit_tile[0, slot])}, not the Free City's Campus {campus} "
        f"(start {start}, mid {_mid}, alive {bool(sim.barb_unit_alive[0, slot])})")
    print("  a Free City's district is a raid target — the raider walked onto it")

    print("BARB CAMPS OK — the tribe's kind is its ground, it raises its units on its clock")


if __name__ == "__main__":
    main()
