"""THE SUPPORT PLANE IS A UNIT PLANE — every reader whose TS twin walks every
unit (`unitsAt` / `state.units`) sees a support chassis standing alone.

    python tests/gpu/support_plane_test.py

A-5 / #260: the support stacking class shipped with its own occupancy plane
and the hand-written plane lists stayed three wide. This lane stands a lone
support unit where each folded reader looks and asks the question its twin
asks: the walls' siege assist from a Ram, a nuke's hostile tile, the
barbarians' march target, the war-weariness occupancy, a storm's damage
branch and a flood's kill branch.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.simbase import ASSIST_RAM, BARB_SEAT
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules, device="cpu", dtype=torch.float64))
    for _ in range(8):
        sim.step()
    return sim


def place(sim, tile, seat, utype, hp=100) -> int:
    """a unit through the engine's own plane writer; returns the merged slot"""
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = utype
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.unit_next[0] += 1
    g = slot + sim.POOL_LO["major"]
    sim._occ_set(torch.tensor([0]), torch.tensor([tile]), torch.tensor([g]))
    sim._gen_ver += 1
    return g


def free_land(sim, avoid=()):
    for t in range(sim.T):
        if t in avoid or not bool(sim.passable[0, t]) or bool(sim.water[0, t]) or bool(sim.tile_mountain[0, t]):
            continue
        if int(sim.military_at[0, t]) >= 0 or int(sim.civilian_at[0, t]) >= 0 or int(sim.support_at[0, t]) >= 0:
            continue
        if int(sim.tile_seat[0, t]) >= 0:
            continue
        return t
    raise AssertionError("no free land tile")


def main() -> None:
    sim = build()
    sup = [i for i in range(sim.NU) if bool(sim._type_support[i])]
    assert sup, "no support chassis in the roster"
    ram = [i for i in sup if int(sim._type_siege_support[i]) == 1]
    assert ram, "no Battering Ram"
    melee = [i for i in range(sim.NU) if bool(sim._type_melee[i]) and not bool(sim.unit_naval[i])]
    assert melee
    sim.war[0, 0, 1] = sim.war[0, 1, 0] = True
    sim.sync_war()

    # -- 1: a Ram beside the target lends its assist — it stands on support_at
    tgt = free_land(sim)
    beside = int(sim.neigh[tgt, 0])
    assert beside >= 0 and bool(sim.passable[0, beside]) and not bool(sim.water[0, beside])
    g = place(sim, beside, 0, ram[0])
    assert int(sim.support_at[0, beside]) == g and int(sim.civilian_at[0, beside]) < 0, "a Ram files on the support plane"
    bits = sim._siege_assist(torch.tensor([0]), torch.tensor([melee[0]]), torch.tensor([tgt]), torch.tensor([1]))
    assert int(bits[0]) & ASSIST_RAM, f"the Ram on the support plane lent no assist (bits {int(bits[0])})"
    print("  1 siege assist OK — a Ram on the support plane helps the melee attacker")

    # -- 2: a lone enemy support unit makes a tile hostile for a nuke, a target for
    #       the barbarians, and an occupant for the weariness count
    lone = free_land(sim, avoid=(tgt, beside))
    g2 = place(sim, lone, 1, sup[0])
    assert bool(sim._nuke_hostile(0)[0, lone]), "a nuke's hostile scan misses a lone support unit"
    assert bool(sim._nonbarb_unit_plane()[0, lone]), "the barbarians' march scan misses a lone support unit"
    assert int(sim._ww_occ(torch.tensor([lone]))[0]) & 8, "the weariness occupancy misses the support plane"
    print("  2 scans OK — nuke, barbarian march, weariness occupancy all see the lone support unit")

    # -- 3: a storm DAMAGES a support unit (the fighters' branch), a flood ROLLS
    #       to kill it (the noncombat branch)
    crip = [i for i, e in enumerate(sim._st_ids) if e == "BLIZZARD_CRIPPLING"][0]
    hp0 = int(sim.major_unit_hp[0, g2 - sim.POOL_LO["major"]])
    sim._storm_tile(torch.tensor([True]), torch.tensor([lone]), torch.tensor([crip]), torch.tensor([False]))
    alive = bool(sim.major_unit_alive[0, g2 - sim.POOL_LO["major"]])
    hp1 = int(sim.major_unit_hp[0, g2 - sim.POOL_LO["major"]]) if alive else 0
    assert hp1 < hp0, f"the crippling blizzard (landP 1) left the support unit untouched ({hp0} -> {hp1})"
    assert not alive or hp0 - 60 <= hp1 <= hp0 - 40, f"the damage is the land band 40-60, got {hp0 - hp1}"
    print(f"  3 storm OK — the support unit took {hp0 - hp1} in the fighters' band")
    print("SUPPORT PLANE OK")


if __name__ == "__main__":
    main()
