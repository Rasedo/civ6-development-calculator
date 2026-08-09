"""A garrison does not shield its city.

    python tests/gpu/city_first_test.py

In Civ 6 a garrisoned unit adds its strength to the CITY's defence; it is not a
separate defender standing in front of it, so an attack aimed at an at-war
civ's centre lands on the CITY even when a military unit stands there.
  https://forums.civfanatics.com/threads/669378/

A LONE CIVILIAN is the exception: it is captured ROLL-FREE and the attacker
advances. Civilians cannot defend, so a city is never attacked "through" one.

The scripted parity gate barely reaches this — it never issues a seat-0 attack —
so without this lane the precedence would rest on the rollout alone. Both cases
below are asserted, and the negative twin is the civilian.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, FIXTURES
from core.engine import SEAT0_POOL_MAX


def build():
    rules = load_rules()
    sim = BatchSim([load_fixture(sorted(FIXTURES.glob("seed*.json"))[0])], rules,
                   device="cpu", dtype=torch.float64)
    for _ in range(40):
        sim.step()
    assert sim.R > 0, "needs a civ"
    return sim


def civ_centre(sim) -> tuple[int, int]:
    """An ALIVE civ city centre, and a free land neighbour to attack from."""
    for r in range(sim.R):
        for j in range(sim.RC):
            if not bool(sim.civ_city_alive[0, r, j]):
                continue
            ctr = int(sim.civ_city_center[0, r, j])
            for nb in sim.neigh[ctr].tolist():
                if nb < 0 or not bool(sim.passable[0, nb]):
                    continue
                if int(sim.military_at[0, nb]) >= 0 or int(sim.civilian_at[0, nb]) >= 0:
                    continue
                sim.civ_only_atwar[0, r] = True
                sim.sync_war()
                return ctr, nb
    raise AssertionError("no alive civ centre with a free neighbour")


def put_p_melee(sim, tile: int) -> int:
    slot = int(sim.seat0_unit_next[0])
    sim.seat0_unit_alive[0, slot] = True
    sim.seat0_unit_type[0, slot] = 2  # WARRIOR
    sim.seat0_unit_tile[0, slot] = tile
    sim.seat0_unit_hp[0, slot] = 100
    sim.seat0_unit_seat[0, slot] = 0
    sim.seat0_unit_mp[0, slot] = 2
    sim.seat0_unit_mp_full[0, slot] = 2
    sim.military_at[0, tile] = slot + sim.POOL_LO["seat0"]
    sim.seat0_unit_next[0] += 1
    return slot


def clear_centre(sim, ctr: int) -> None:
    """Despawn whatever the 40-turn evolution parked on the centre — civs
    garrison their own capitals, so the tile is NOT empty by default."""
    for plane in ("military_at", "civilian_at"):
        occ = int(getattr(sim, plane)[0, ctr])
        if occ >= 0:
            lo_v = sim.POOL_LO["civ"]
            assert occ >= lo_v, "incumbent should be a civ-pool unit here"
            sim.civ_unit_alive[0, occ - lo_v] = False
            getattr(sim, plane)[0, ctr] = -1


def garrison(sim, ctr: int, civilian: bool) -> int:
    """Put a CIV unit on the city centre — military, or a civilian."""
    slot = int(sim.civ_unit_next[0])
    sim.civ_unit_alive[0, slot] = True
    sim.civ_unit_civ[0, slot] = 0
    sim.civ_unit_seat[0, slot] = 1
    sim.civ_unit_type[0, slot] = sim._builder_idx if civilian else 2
    sim.civ_unit_tile[0, slot] = ctr
    sim.civ_unit_hp[0, slot] = 100
    if civilian:
        sim.civilian_at[0, ctr] = slot + sim.POOL_LO["civ"]
    else:
        sim.military_at[0, ctr] = slot + sim.POOL_LO["civ"]
    sim.civ_unit_next[0] += 1
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

    r, j = next((r, j) for r in range(sim.R) for j in range(sim.RC)
                if bool(sim.civ_city_alive[0, r, j]) and int(sim.civ_city_center[0, r, j]) == ctr)
    hp0 = int(sim.civ_city_hp[0, r, j])
    g_hp0 = int(sim.civ_unit_hp[0, g])

    # the melee action toward the centre
    d = next(i for i, nb in enumerate(sim.neigh[from_tile].tolist()) if nb == ctr)
    act = torch.zeros(sim.B, SEAT0_POOL_MAX, dtype=torch.long)
    act[0, p] = 6 + d
    sim._apply_unit_actions(act)

    dead = not bool(sim.civ_unit_alive[0, g])
    return hp0 - int(sim.civ_city_hp[0, r, j]), (g_hp0 if dead else g_hp0 - int(sim.civ_unit_hp[0, g])), not dead


def main() -> None:
    city_d, garr_d, _ = run(civilian=False)
    print(f"  MILITARY garrison: city -{city_d} hp, garrison -{garr_d} hp")
    assert city_d > 0, (
        "a MILITARY garrison still shields its city — the attack hit the unit "
        "instead of the city (#51/S7.10a: a garrison adds to CITY strength, it "
        "is not a separate defender)"
    )
    assert garr_d == 0, (
        f"the garrison took {garr_d} damage — the city should take the whole "
        "roll through it"
    )

    city_c, _, civ_alive = run(civilian=True)
    print(f"  LONE CIVILIAN    : city -{city_c} hp, captured {not civ_alive}")
    assert city_c == 0, (
        "the city took damage through a LONE CIVILIAN — B-31 kills it roll-free "
        "and P2's reshuffle pinned that against TS at seed 9053 t204"
    )
    assert not civ_alive, "B-31: the lone civilian must be captured roll-free"

    # garrison AND civilian on the centre: the military puts the CITY first
    # (TS cityFirst = enemies==0 || garrisoned); the civilian shields nothing
    # and survives.
    city_b, _, civ_alive_b = run(civilian=True, military=True)
    print(f"  GARRISON+CIVILIAN: city -{city_b} hp, civilian alive {civ_alive_b}")
    assert city_b > 0, (
        "garrison+civilian centre must be SIEGED — the t40 fall-through is back"
    )
    assert civ_alive_b, "the civilian is not a combatant — it survives the siege"

    print("CITY-FIRST OK — a garrison shields nothing, a lone civilian does, both together siege")


if __name__ == "__main__":
    main()
