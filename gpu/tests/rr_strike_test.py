"""A rival city's WALLS fire at an enemy RIVAL's unit — #51/S7.1, task #59.

    python gpu/rr_strike_test.py

WHY THIS EXISTS. A rival city with ANCIENT_WALLS fired once per turn at the
player and at barbarians, and at nobody else. Both engines agreed, so no gate
could catch it: the GPU wrote its eligibility plane out by hand as

    hm = (_mseat == BARB_SEAT) | ((_mseat == PLAYER_SEAT) & war)

and TS filtered candidates with `!isRivalSeat(u.seat) && unitsHostile(...)`.
Both were written before A-19 made rival-vs-rival war real, and both said so.

In Civ 6 a city with at least Ancient Walls gains a ranged strike, and that
strike picks the weakest modified-strength unit in range — a rule about combat
strength with no term for WHICH enemy the unit belongs to. There is no mechanic
by which a city declines to fire on one enemy civ while firing on another.
  https://civilization.fandom.com/wiki/City_combat_(Civ6)

This lane builds the configuration the fixtures cannot be relied on to produce
and asserts the strike lands — and its negative twin asserts the SAME
configuration at PEACE takes no damage, so a lane that passes because something
else hit the unit fails instead.

ISOLATION. The strike lives inside `_rival_phase`, which also marches and
attacks, so "the unit lost HP" would otherwise be attributable to a melee.
Every OTHER unit of the striking rival is killed first, so its city is the only
thing that can reach the victim; and the victim belongs to a HIGHER-indexed
rival, which acts after, so it cannot walk away before the strike.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES

STRIKER = 0  # the walled rival: acts FIRST in the phase
VICTIM = 1  # its enemy: acts after, so it cannot step away pre-strike


def build():
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))[:1]
    sim = BatchSim([load_fixture(p) for p in paths], rules, device="cpu", dtype=torch.float64)
    for _ in range(40):  # far enough in that both rivals hold a city
        sim.step()
    assert sim.R > 1, "this lane needs two rivals"
    return sim


def setup(sim, at_war: bool) -> tuple[int, int]:
    """Walled STRIKER city, a VICTIM warrior in range, nothing else that can hit it."""
    j = next(j for j in range(sim.RC) if bool(sim.rc_alive[0, STRIKER, j]))
    ctr = int(sim.rc_center[0, STRIKER, j])
    sim.rc_bldg[0, STRIKER, j, sim._walls_bidx] = True

    # a free land tile at range 1..2 of that centre
    tile = -1
    for t in range(sim.T):
        d = int(sim.pair_dist[ctr, t])
        if 1 <= d <= 2 and bool(sim.passable[0, t]) and int(sim.occ_mil[0, t]) < 0 and int(sim.occ_civ[0, t]) < 0:
            tile = t
            break
    assert tile >= 0, "no free tile in strike range of the walled city"

    # EVERY other unit of the striker dies, so only its CITY can reach the
    # victim — otherwise a melee war-act would satisfy the assertion instead.
    kill = sim.v_civ[0] == STRIKER
    sim.v_alive[0][kill] = False
    for slot in kill.nonzero(as_tuple=True)[0].tolist():
        t_old = int(sim.v_tile[0, slot])
        gslot = slot + sim.POOL_LO["v"]
        if t_old >= 0 and int(sim.occ_mil[0, t_old]) == gslot:
            sim.occ_mil[0, t_old] = -1
        if t_old >= 0 and int(sim.occ_civ[0, t_old]) == gslot:
            sim.occ_civ[0, t_old] = -1

    slot = int(sim.v_next[0])
    sim.v_alive[0, slot] = True
    sim.v_civ[0, slot] = VICTIM
    sim.v_seat[0, slot] = VICTIM + 1
    sim.v_type[0, slot] = 2  # WARRIOR
    sim.v_tile[0, slot] = tile
    sim.v_hp[0, slot] = 100
    sim.v_mp[0, slot] = 0  # spent: it stays put and takes no heal this turn
    sim.v_mp_full[0, slot] = 2
    sim.occ_mil[0, tile] = slot + sim.POOL_LO["v"]
    sim.v_next[0] += 1

    sim.rr_war[0, STRIKER, VICTIM] = at_war
    sim.rr_war[0, VICTIM, STRIKER] = at_war
    sim.sync_war()
    return slot, tile


def run(at_war: bool) -> int:
    sim = build()
    slot, _ = setup(sim, at_war)
    before = int(sim.v_hp[0, slot])
    sim._rival_phase()
    after = int(sim.v_hp[0, slot]) if bool(sim.v_alive[0, slot]) else 0
    label = "at war" if at_war else "at peace"
    print(f"  {label:9s}: victim hp {before} -> {after}")
    return before - after


def main() -> None:
    dmg_war = run(at_war=True)
    dmg_peace = run(at_war=False)
    assert dmg_war > 0, (
        "a walled rival city did NOT fire on an enemy RIVAL's unit standing in "
        "range — the #59 fidelity gap is still open"
    )
    assert dmg_peace == 0, (
        f"the victim took {dmg_peace} damage AT PEACE — this lane is measuring "
        "something other than the strike, so the at-war assertion proves nothing"
    )
    print("RIVAL-vs-RIVAL STRIKE OK — walls fire on an enemy rival, and only at war")


if __name__ == "__main__":
    main()
