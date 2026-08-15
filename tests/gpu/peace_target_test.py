"""A civ must not attack a unit it is AT PEACE with.

    python tests/gpu/peace_target_test.py

`_hostile_vs_unit` and `_hostile_ranged_strike` act for a civ that is at war
with ANYONE, so each candidate target still has to be filtered by the PAIRWISE
war state. TS does exactly that: `attackTargets` runs every candidate through
`unitsHostile(state, unit, u)`.

The scripted gate never reaches the configuration — a civ at peace with seat 0,
at war with another civ, standing adjacent to a seat-0 military — so this lane
builds it by hand and asserts the attack does not happen, for both the melee and
the ranged path.
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
    paths = fixture_paths()[:1]
    sim = settle_all(BatchSim([load_fixture(p) for p in paths], rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def place(sim, tile, seat, hp=100):
    """Put `seat`'s MILITARY unit on `tile`, return its merged slot. Every
    major seat spawns into the SAME window, so the seat is the only thing that
    separates the two sides of this scenario."""
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = 2  # WARRIOR
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.military_at[0, tile] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def scenario(sim):
    """A free land tile with a free land neighbour."""
    for t in range(sim.T):
        if not bool(sim.passable[0, t]):
            continue
        if int(sim.military_at[0, t]) >= 0 or int(sim.civilian_at[0, t]) >= 0:
            continue
        for n in sim.neigh[t].tolist():
            if n < 0 or not bool(sim.passable[0, n]):
                continue
            if int(sim.military_at[0, n]) >= 0 or int(sim.civilian_at[0, n]) >= 0:
                continue
            return t, n
    raise AssertionError("no free adjacent land pair for the scenario")


def run(ranged: bool) -> None:
    sim = build()
    civ_tile, pl_tile = scenario(sim)
    v = place(sim, civ_tile, seat=1)  # the absolute seat of civ 0
    p = place(sim, pl_tile, seat=0)

    # civ 0 is AT PEACE with seat 0, and AT WAR with civ 1.
    sim.war[0, 0, 1 + 0] = sim.war[0, 1 + 0, 0] = False
    sim.sync_war()  # close the poke under transpose
    if sim.n_majors > 2:
        sim.war[0, 1 + 0, 1 + 1] = True
        sim.war[0, 1 + 1, 1 + 0] = True
        sim.sync_war()  # close the poke under transpose

    before = int(sim.major_unit_hp[0, p])
    att = torch.zeros(sim.B, dtype=torch.bool)
    att[0] = True
    tgt = torch.full((sim.B,), pl_tile, dtype=torch.long)
    if ranged:
        sim._hostile_ranged_strike(att, tgt, "major", v)
    else:
        sim._hostile_vs_unit(att, tgt, "major", v)
    after = int(sim.major_unit_hp[0, p])
    kind = "ranged" if ranged else "melee"
    assert after == before, (
        f"{kind}: a civ AT PEACE with seat 0 damaged a seat-0 unit "
        f"({before} -> {after}) — attackTargets gates on unitsHostile"
    )
    print(f"  {kind}: at peace -> seat-0 unit untouched (hp {after})")

    # ...and the SAME attack lands once war is declared, so the assertion above
    # is about the peace treaty and not about a broken scenario.
    sim.war[0, 0, 1 + 0] = sim.war[0, 1 + 0, 0] = True
    sim.sync_war()  # close the poke under transpose
    if ranged:
        sim._hostile_ranged_strike(att, tgt, "major", v)
    else:
        sim._hostile_vs_unit(att, tgt, "major", v)
    at_war = int(sim.major_unit_hp[0, p])
    assert at_war < before, (
        f"{kind}: the scenario is inert — the attack did not land even AT WAR "
        f"({before} -> {at_war}); the peace assertion above proves nothing"
    )
    print(f"  {kind}: at war   -> seat-0 unit struck (hp {before} -> {at_war})")


def main() -> None:
    run(ranged=False)
    run(ranged=True)
    print("PEACE TARGETING OK — no attack without a war, both melee and ranged")


if __name__ == "__main__":
    main()
