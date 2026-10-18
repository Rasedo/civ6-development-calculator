"""The barbarians' turn on the GPU twin: a camp's tribe takes its kind from its
ground, raises its defender and scout, and spawns on its clock.

    python tests/gpu/barb_camps_test.py

CIV6 (BarbarianTribes, the barbarian manager — tools/civ6lab/dll_readings.md
"H-1: the barbarians' turn"): the first tribe row a camp meets is its kind — a
cavalry tribe an unowned Horses plot within its ResourceRange, a melee tribe
otherwise inland; a new camp raises its defender on the camp and its scout
within three plots; a living tribe under its unit cap spawns a melee or ranged
unit every TurnsToWarriorSpawn turns. A scout home with a major's plot in
sight starts the tribe's raid, whose tree raises its force; a scout home hurt
by a quarter of its health where another player's fighting unit can strike
holds its report; the camp step's sight takes the barbarians' own units.

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
from core.simbase import BARB_SEAT
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def inland_tile(sim) -> int:
    """A passable unowned land tile with no water or impassable plot round it
    and nothing on it or round it — a camp neither the naval row nor a unit
    can answer for, its ring free to raise on."""
    for t in range(sim.T):
        if not bool(sim.passable[0, t]) or bool(sim.wpass[0, t]) or int(sim.tile_seat[0, t]) >= 0:
            continue
        if int(sim.centre_slot_at[0, t]) >= 0 or int(sim.improvement[0, t]) >= 0:
            continue
        ring = [int(r) for r in sim._barb_ring[t].tolist()[:19] if r >= 0]
        if len(ring) < 19:
            continue
        if any(bool(sim.wpass[0, n]) or not bool(sim.passable[0, n]) or int(sim.military_at[0, n]) >= 0
               or int(sim.civilian_at[0, n]) >= 0 or int(sim.tile_seat[0, n]) >= 0
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

    def tick(acting) -> None:
        """the barbarians' tactical pass for `acting` [B, P], their trees ticking in it"""
        sim._barb_slots()
        sim._barb_reset_mp()
        sim._barbarian_tactics(acting & sim.barb_unit_alive & (sim.barb_unit_seat == BARB_SEAT))

    # THE RAID (the TS twin's "a barbarian raid"): a scout beside its camp
    # sees a major's plot, its look starts its tree, whose tick finds it home:
    # at RaidingBoldness the raid starts and its own tree asks for its force,
    # melee first, raised one a turn, a unit raised in a turn not the raid's
    # until the next
    clear_barbs(sim)
    sim.barb_camps_begun[0] = True
    horses_near(sim, tile, on=False)
    k = camp(sim, tile)
    sc = [s for s in sim.barb_unit_alive[0].nonzero(as_tuple=True)[0].tolist()
          if int(sim.barb_unit_tribe[0, s]) == k and bool(sim.barb_unit_scout[0, s])][0]
    st = int(sim.barb_unit_tile[0, sc])
    seen = [n for n in sim.neigh[st].tolist() if n >= 0 and n != tile and int(sim.pair_dist[tile, n]) >= 1
            and not bool(sim.wpass[0, n])][0]
    sim.tile_seat[0, seen] = 0
    sim._tile_owner_ver += 1
    sim.tribe_bold[0, k] = 10
    sim.barb_spot_next[0, :] = 0  # no earlier report throttles the major
    sim._barbarian_scouts()
    assert int(sim.tribe_home_slot[0, k]) == sc, "the scout's look started no tree"
    tick(torch.ones_like(sim.barb_unit_alive))
    melee = int(sim._barb_unit_for()[0, int(tribes[2][6])])
    ranged = int(sim._barb_unit_for()[0, int(tribes[2][7])])
    assert int(sim.tribe_op[0, k]) == 1 and int(sim.tribe_home_slot[0, k]) == -1, "the scout's report started no raid"
    assert int(sim.tribe_every[0, k]) == 1, f"the raid's interval {int(sim.tribe_every[0, k])}"
    q = [x for x in sim.tribe_queue[0, k].tolist() if x >= 0]
    assert q == [melee, melee, ranged], f"the raid asked for {q}"

    def team() -> int:
        return int((sim.barb_unit_op[0] & sim.barb_unit_alive[0] & (sim.barb_unit_tribe[0] == k)).sum())

    raised = []
    for _ in range(6):
        if team():
            break
        before = sim.barb_unit_alive.clone()
        was = set(before[0].nonzero(as_tuple=True)[0].tolist())
        sim._barb_tribe_turn(k)
        raised += [int(sim.barb_unit_type[0, s]) for s in sim.barb_unit_alive[0].nonzero(as_tuple=True)[0].tolist()
                   if s not in was]
        tick(before)
    assert raised == [melee, melee, melee, ranged, ranged], f"the raid raised {raised}"
    assert team() == 3 and int(sim.tribe_every[0, k]) == -1, "the force taken, the clock not the tribe's"
    print("  a scout's report starts a raid, which raises its force one a turn")

    # A HURT SCOUT (the scout's tree's Protect Unit): home with a quarter of
    # its health gone and another player's fighting unit able to strike it,
    # it holds its report; the threat gone, the report starts the raid
    clear_barbs(sim)
    sim.barb_camps_begun[0] = True
    k = camp(sim, tile)
    sc = [s for s in sim.barb_unit_alive[0].nonzero(as_tuple=True)[0].tolist()
          if int(sim.barb_unit_tribe[0, s]) == k and bool(sim.barb_unit_scout[0, s])][0]
    st = int(sim.barb_unit_tile[0, sc])
    seen = [n for n in sim.neigh[st].tolist() if n >= 0 and n != tile and not bool(sim.wpass[0, n])][0]
    sim.tile_seat[0, seen] = 0
    sim._tile_owner_ver += 1
    sim.tribe_bold[0, k] = 10
    sim.barb_spot_next[0, :] = 0
    sim.barb_unit_hp[0, sc] = 53
    ut = sim.unit_type[0].clamp(min=0, max=sim.NU - 1)
    fighters = sim.unit_alive[0] & ~sim._type_noncombat[ut] & (sim.unit_seat[0] != BARB_SEAT)
    b0 = torch.tensor([0])

    def place(u: int, t: int) -> None:
        sim._occ_clear(b0, torch.tensor([int(sim.unit_tile[0, u])]), torch.tensor([u]))
        sim.unit_tile[0, u] = t
        sim._occ_set(b0, torch.tensor([t]), torch.tensor([u]))

    dist = sim.pair_dist[sim.unit_tile[0].clamp(min=0), st]
    foe = (fighters & (dist > 10)).nonzero(as_tuple=True)[0].tolist()[0]
    far = int(sim.unit_tile[0, foe])
    for u in (fighters & (dist <= 10)).nonzero(as_tuple=True)[0].tolist():
        sim._occ_clear(b0, torch.tensor([int(sim.unit_tile[0, u])]), torch.tensor([u]))
        sim.unit_alive[0, u] = False  # nothing else threatens the scene
    # the foe's player knows the ground about the scout: its search walks it
    fs = int(sim.unit_seat[0, foe])
    sim.seat_explored[0, fs] |= sim.pair_dist[st] <= 4
    every = torch.ones(sim.B, sim.T, dtype=torch.bool)
    near = -1
    for n in range(sim.T):
        if not (2 <= int(sim.pair_dist[st, n]) <= 3 and bool(sim.passable[0, n]) and not bool(sim.wpass[0, n])
                and int(sim.military_at[0, n]) < 0 and int(sim.civilian_at[0, n]) < 0
                and int(sim.centre_slot_at[0, n]) < 0):
            continue
        place(foe, n)
        if int(sim._danger_plane(BARB_SEAT, every)[0, st]) > 0:
            near = n
            break
    assert near >= 0, "no plot from which the foe's turn reaches the scout"
    sim._barbarian_scouts()
    only_scout = torch.zeros_like(sim.barb_unit_alive)
    only_scout[0, sc] = True
    tick(only_scout)
    assert int(sim.tribe_op[0, k]) == 0 and int(sim.tribe_home_slot[0, k]) == sc, \
        "a hurt scout an enemy can strike reported"
    place(foe, far)
    # the threat gone, the scout walks home from the plot it fled to
    for _ in range(4):
        if int(sim.tribe_op[0, k]):
            break
        tick(only_scout)
    assert int(sim.tribe_op[0, k]) == 1 and int(sim.tribe_home_slot[0, k]) == -1, \
        "the hurt scout, the threat gone, started no raid"
    print("  a hurt scout holds its report while an enemy can strike it")
    # the scenes' plots of a major let go: the camp's ground unowned again
    sim.tile_seat[0][sim.pair_dist[tile] <= 2] = -1
    sim._tile_owner_ver += 1

    # THE CAMP STEP'S SIGHT counts the barbarians' own units
    clear_barbs(sim)
    assert not bool(sim._barb_seen("all")[0, tile]), "the empty camp plot is in some player's sight"
    camp(sim, tile)
    assert bool(sim._barb_seen("all")[0, tile]), "the camp's own units do not see their plot"
    assert not bool(sim._barb_seen("majors")[0, tile]), "the majors' sight took the barbarians' units"
    print("  the camp step's sight takes the barbarians' own units")

    print("BARB CAMPS OK — the tribe's kind is its ground, it raises its units on its clock, it raids")


if __name__ == "__main__":
    main()
