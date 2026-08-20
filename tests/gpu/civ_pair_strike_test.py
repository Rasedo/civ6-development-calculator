"""A civ city's WALLS fire at an enemy CIV's unit.

    python tests/gpu/civ_pair_strike_test.py

In Civ 6 a city with at least Ancient Walls gains a ranged strike, and that
strike picks the weakest modified-strength unit in range — a rule about combat
strength with no term for WHICH enemy the unit belongs to. There is no mechanic
by which a city declines to fire on one enemy civ while firing on another.
  https://civilization.fandom.com/wiki/City_combat_(Civ6)

Both engines can carry the same too-narrow eligibility mask, so no gate would
catch a missing civ-vs-civ case. This lane builds the configuration the fixtures
cannot be relied on to produce and asserts the strike lands — and its negative twin asserts the SAME
configuration at PEACE takes no damage, so a lane that passes because something
else hit the unit fails instead.

ISOLATION. The strike lives inside `_seat_phase`, which also marches and
attacks, so "the unit lost HP" would otherwise be attributable to a melee.
Every OTHER unit of the striking civ is killed first, so its city is the only
thing that can reach the victim; and the victim belongs to a HIGHER-indexed
civ, which acts after, so it cannot walk away before the strike.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

STRIKER = 0  # the walled civ: acts FIRST in the phase
VICTIM = 1  # its enemy: acts after, so it cannot step away pre-strike


def build():
    rules = load_rules()
    paths = fixture_paths()[:1]
    sim = settle_all(BatchSim([load_fixture(p) for p in paths], rules, device="cpu", dtype=torch.float64))
    for _ in range(40):  # far enough in that both civs hold a city
        sim.step()
    assert sim.n_majors > 2, "this lane needs two civs"
    return sim


def setup(sim, at_war: bool) -> tuple[int, int]:
    """Walled STRIKER city, a VICTIM warrior in range, nothing else that can hit it."""
    j = next(j for j in range(sim.RC) if bool(sim.city_alive[0, STRIKER + 1, j]))
    ctr = int(sim.city_center[0, STRIKER + 1, j])
    sim.city_bldg[0, STRIKER + 1, j, sim._walls_bidx] = True
    # CIV6: the strike comes from the Outer Defense, and stops when it does
    sim.city_outer_hp[0, STRIKER + 1, j] = sim._walls_hp

    # a free land tile at range 1..2 of that centre
    tile = -1
    for t in range(sim.T):
        d = int(sim.pair_dist[ctr, t])
        if 1 <= d <= 2 and bool(sim.passable[0, t]) and int(sim.military_at[0, t]) < 0 and int(sim.civilian_at[0, t]) < 0:
            tile = t
            break
    assert tile >= 0, "no free tile in strike range of the walled city"

    # EVERY other unit of the striker dies, so only its CITY can reach the
    # victim — otherwise a melee war-act would satisfy the assertion instead.
    kill = (sim.major_unit_seat[0] - 1) == STRIKER
    sim.major_unit_alive[0][kill] = False
    for slot in kill.nonzero(as_tuple=True)[0].tolist():
        t_old = int(sim.major_unit_tile[0, slot])
        gslot = slot + sim.POOL_LO["major"]
        if t_old >= 0 and int(sim.military_at[0, t_old]) == gslot:
            sim.military_at[0, t_old] = -1
        if t_old >= 0 and int(sim.civilian_at[0, t_old]) == gslot:
            sim.civilian_at[0, t_old] = -1

    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = VICTIM + 1
    sim.major_unit_seat[0, slot] = VICTIM + 1
    sim.major_unit_type[0, slot] = 2  # WARRIOR
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_mp[0, slot] = 0  # spent: it stays put and takes no heal this turn
    sim.major_unit_mp_full[0, slot] = 2
    sim.military_at[0, tile] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1

    sim.war[0, 1 + STRIKER, 1 + VICTIM] = at_war
    sim.war[0, 1 + VICTIM, 1 + STRIKER] = at_war
    sim.sync_war()
    return slot, tile


def run(at_war: bool) -> int:
    sim = build()
    slot, _ = setup(sim, at_war)
    before = int(sim.major_unit_hp[0, slot])
    sim._seat_phase()
    after = int(sim.major_unit_hp[0, slot]) if bool(sim.major_unit_alive[0, slot]) else 0
    label = "at war" if at_war else "at peace"
    print(f"  {label:9s}: victim hp {before} -> {after}")
    return before - after


def main() -> None:
    dmg_war = run(at_war=True)
    dmg_peace = run(at_war=False)
    assert dmg_war > 0, (
        "a walled civ city did NOT fire on an enemy CIV's unit standing in "
       "range — the fidelity gap is still open"
    )
    assert dmg_peace == 0, (
        f"the victim took {dmg_peace} damage AT PEACE — this lane is measuring "
        "something other than the strike, so the at-war assertion proves nothing"
    )
    print("CIV-vs-CIV STRIKE OK — walls fire on an enemy civ, and only at war")


if __name__ == "__main__":
    main()
