"""A barbarian camp's class comes from where it stands.

    python tests/gpu/barb_camps_test.py

CIV 6: an outpost with Horses within 6 tiles is a cavalry outpost, one with a
reachable coast a pirate camp, everything else a land camp — and "regardless of
position every outpost will spawn melee and ranged units". The raid therefore
ROTATES class / ranged / melee.

The gate drives barbarians every game, but whether any camp of any seed ever
rises within 6 of Horses is not something a run can be counted on for, so the
lane builds the outpost.
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
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def inland_tile(sim) -> int:
    """A passable land tile with no water neighbour — a LAND camp, so the
    pirate arm cannot answer for the cavalry one."""
    for t in range(sim.T):
        if not bool(sim.passable[0, t]) or int(sim.centre_slot_at[0, t]) >= 0:
            continue
        nb = [n for n in sim.neigh[t].tolist() if n >= 0]
        if any(bool(sim.wpass[0, n]) for n in nb):
            continue
        if int(sim.military_at[0, t]) >= 0 or int(sim.civilian_at[0, t]) >= 0:
            continue
        return t
    raise AssertionError("no inland tile for the camp")


def clear_barbs(sim) -> None:
    live = sim.barb_unit_alive[0].nonzero(as_tuple=True)[0]
    for s in live.tolist():
        t = int(sim.barb_unit_tile[0, s])
        if int(sim.military_at[0, t]) == s + sim.POOL_LO["barb"]:
            sim.military_at[0, t] = -1
        sim.barb_unit_alive[0, s] = False


def camp_at(sim, tile: int, horses: bool) -> None:
    clear_barbs(sim)
    sim.camp_tile[0, :] = -1
    sim.camp_tile[0, 0] = tile
    sim.n_camps[0] = 1
    near = (sim.pair_dist[tile] <= sim._barb_horse_range)
    sim.res_id[0][near & (sim.res_id[0] == sim._barb_horse_res)] = -1
    if horses:
        spot = [int(t) for t in near.nonzero(as_tuple=True)[0].tolist() if t != tile][0]
        sim.res_id[0, spot] = sim._barb_horse_res


def spawned_type(sim) -> int:
    """Run barbarian phases until THIS camp adds a barbarian, and name its
    roster type. The raid needs its 0.1 roll, so this waits for the draw; the
    camp cap is pinned at 1 first so no second camp can spawn a unit of its
    own and be mistaken for this one."""
    before = sim.barb_unit_alive[0].clone()
    for _ in range(4000):
        sim._barbarian_phase()
        fresh = (sim.barb_unit_alive[0] & ~before).nonzero(as_tuple=True)[0].tolist()
        if fresh:
            assert len(fresh) == 1, f"{len(fresh)} spawns in one phase — the scene is not isolated"
            return int(sim.barb_unit_type[0, fresh[0]])
    raise AssertionError("the phase never spawned — the scenario is inert")


def garrison(sim, tile: int) -> None:
    slot = int(sim.next_slot[0])
    sim.barb_unit_alive[0, slot] = True
    sim.barb_unit_type[0, slot] = int(sim._barb_ladder[0])
    sim.barb_unit_tile[0, slot] = tile
    sim.barb_unit_hp[0, slot] = 100
    sim.military_at[0, tile] = slot + sim.POOL_LO["barb"]


def main() -> None:
    sim = build()
    # One camp, and no room for another: every spawn below is THIS camp's.
    sim.max_camps = torch.ones_like(sim.n_camps) if torch.is_tensor(sim.max_camps) else 1
    lad = sim._barb_ladder.tolist()
    melee, ranged, horseman = lad[0], lad[4], lad[9]
    tile = inland_tile(sim)

    # REGARRISON: an empty camp fills on its own LAND ladder.
    camp_at(sim, tile, horses=False)
    assert spawned_type(sim) == melee, "a land camp regarrisoned with something other than melee"
    camp_at(sim, tile, horses=True)
    assert spawned_type(sim) == horseman, "a cavalry outpost regarrisoned on foot"
    print("  an empty camp regarrisons on its own land ladder")

    # THE RAID ROTATES. campNo 0, so the slot is the turn alone.
    want = {0: horseman, 1: ranged, 2: melee}
    for slot, expect in want.items():
        sim.turn = (sim.turn // 3) * 3 + slot
        camp_at(sim, tile, horses=True)
        garrison(sim, tile)
        got = spawned_type(sim)
        assert got == expect, f"turn%3=={slot}: raided with roster type {got}, expected {expect}"
    print("  the raid rotates CLASS, ranged, melee — every camp fields all three")

    print("BARB CAMPS OK — the camp's class is its ground, and ranged is nobody's class")


if __name__ == "__main__":
    main()
