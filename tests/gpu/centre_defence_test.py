"""A CITY CENTRE is attacked as the CITY, whoever stands on it.

    python tests/gpu/centre_defence_test.py

In Civ 6 a garrisoned unit adds its strength to the CITY's defence; it is not a
separate defender standing in front of it, so an attack aimed at an at-war
seat's centre lands on the CITY even when a military unit stands there.
  https://forums.civfanatics.com/threads/669378/

THERE IS NO EXCEPTION FOR A CIVILIAN. A settler or builder occupying a city
tile cannot be captured separately — the attack is on the city, and the
civilian is only lost if the city itself falls. The engines carried a
`cityFirst = enemies.length === 0 || garrisoned` term that made a lone
civilian the defender and handed it over roll-free; it is gone from both.

The scripted parity gate barely reaches this — it never issues a seat-0 attack —
so without this lane the precedence would rest on the rollout alone. All three
occupancy cases below are asserted: military, lone civilian, and both.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.engine import UNIT_SLOTS
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules,
                   device="cpu", dtype=torch.float64))
    for _ in range(40):
        sim.step()
    assert sim.n_majors > 1, "needs a civ"
    return sim


def civ_centre(sim) -> tuple[int, int]:
    """An ALIVE civ city centre, and a free land neighbour to attack from."""
    for row in range(1, sim.n_majors):
        for j in range(sim.RC):
            if not bool(sim.city_alive[0, row, j]):
                continue
            ctr = int(sim.city_center[0, row, j])
            for nb in sim.neigh[ctr].tolist():
                if nb < 0 or not bool(sim.passable[0, nb]):
                    continue
                if int(sim.military_at[0, nb]) >= 0 or int(sim.civilian_at[0, nb]) >= 0:
                    continue
                sim.war[0, 0, row] = sim.war[0, row, 0] = True
                sim.sync_war()
                return ctr, nb
    raise AssertionError("no alive civ centre with a free neighbour")


def put_p_melee(sim, tile: int) -> int:
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_type[0, slot] = 2  # WARRIOR
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_seat[0, slot] = 0
    sim.major_unit_mp[0, slot] = 2
    sim.major_unit_mp_full[0, slot] = 2
    sim.military_at[0, tile] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def clear_centre(sim, ctr: int) -> None:
    """Despawn whatever the 40-turn evolution parked on the centre — civs
    garrison their own capitals, so the tile is NOT empty by default."""
    for plane in ("military_at", "civilian_at"):
        occ = int(getattr(sim, plane)[0, ctr])
        if occ >= 0:
            lo_v = sim.POOL_LO["major"]
            assert occ >= lo_v, "incumbent should be a civ-pool unit here"
            sim.major_unit_alive[0, occ - lo_v] = False
            getattr(sim, plane)[0, ctr] = -1


def garrison(sim, ctr: int, civilian: bool) -> int:
    """Put a CIV unit on the city centre — military, or a civilian."""
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = 0 + 1
    sim.major_unit_seat[0, slot] = 1
    sim.major_unit_type[0, slot] = sim._builder_idx if civilian else 2
    sim.major_unit_tile[0, slot] = ctr
    sim.major_unit_hp[0, slot] = 100
    if civilian:
        sim.civilian_at[0, ctr] = slot + sim.POOL_LO["major"]
    else:
        sim.military_at[0, ctr] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def run(civilian: bool, military: bool = False) -> tuple[int, int, bool]:
    """Returns (city hp delta, garrison hp delta, civilian alive) after one
    seat-0 melee. `military=True` adds a military garrison ALONGSIDE the
    civilian."""
    sim = build()
    ctr, from_tile = civ_centre(sim)
    clear_centre(sim, ctr)
    if military and civilian:
        garrison(sim, ctr, civilian=False)
    g = garrison(sim, ctr, civilian)
    p = put_p_melee(sim, from_tile)

    row, j = next((row, j) for row in range(1, sim.n_majors) for j in range(sim.RC)
                  if bool(sim.city_alive[0, row, j]) and int(sim.city_center[0, row, j]) == ctr)
    hp0 = int(sim.city_hp[0, row, j])
    g_hp0 = int(sim.major_unit_hp[0, g])

    # the melee action toward the centre
    d = next(i for i, nb in enumerate(sim.neigh[from_tile].tolist()) if nb == ctr)
    # the applier indexes HEAD ROWS (this seat's living units in slot
    # order), so the poke names the rank the merged slot maps to.
    act = torch.zeros(sim.B, UNIT_SLOTS, dtype=torch.long)
    act[0, int((sim._seat_slot_map(0)[0] == p).nonzero(as_tuple=True)[0][0])] = 6 + d
    sim._apply_seat_unit_actions(0, act)

    dead = not bool(sim.major_unit_alive[0, g])
    return hp0 - int(sim.city_hp[0, row, j]), (g_hp0 if dead else g_hp0 - int(sim.major_unit_hp[0, g])), not dead


def main() -> None:
    city_d, garr_d, _ = run(civilian=False)
    print(f"  MILITARY garrison: city -{city_d} hp, garrison -{garr_d} hp")
    assert city_d > 0, (
        "a MILITARY garrison still shields its city — the attack hit the unit "
        "instead of the city (a garrison adds to CITY strength, it "
        "is not a separate defender)"
    )
    assert garr_d == 0, (
        f"the garrison took {garr_d} damage — the city should take the whole "
        "roll through it"
    )

    city_c, _, civ_alive = run(civilian=True)
    print(f"  LONE CIVILIAN    : city -{city_c} hp, civilian alive {civ_alive}")
    assert city_c > 0, (
        "a LONE CIVILIAN on the centre still drew the blow — the deleted "
        "cityFirst term is back. A city tile is attacked as the CITY."
    )
    assert civ_alive, (
        "the civilian was captured off a city tile — real Civ 6 has no "
        "capture-inside-a-city move; it is lost only if the city falls"
    )

    # garrison AND civilian on the centre: the same answer again — the centre
    # is the city, and neither occupant is a separate defender.
    city_b, _, civ_alive_b = run(civilian=True, military=True)
    print(f"  GARRISON+CIVILIAN: city -{city_b} hp, civilian alive {civ_alive_b}")
    assert city_b > 0, (
        "garrison+civilian centre must be SIEGED — the t40 fall-through is back"
    )
    assert civ_alive_b, "the civilian is not a combatant — it survives the siege"

    print("CENTRE DEFENCE OK — the city takes the blow through a garrison, "
          "a lone civilian and both together")


if __name__ == "__main__":
    main()
