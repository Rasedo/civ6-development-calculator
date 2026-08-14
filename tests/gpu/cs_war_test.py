"""SEAT 0 <-> CITY-STATE WAR — the CS-attack mask column.

    python tests/gpu/citystate_war_test.py

Real Civ 6 treats a city-state as a separate seat: peace is the default and war
must be DECLARED before its centre can be attacked. Offering a PEACEFUL
city-state as a target is what the autopilot invariant ("target lists never
include peaceful city-states", tests/cpu/seats/loyalty-and-conquest.test.ts)
forbids.

This lane pins the construct the scripted gate cannot reach: the plane exists
and is persisted, peace hides the centre from the mask, and a declaration
reveals it.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES
from core.engine import _MUTABLE


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    # --- 1) the plane exists, is peace-by-default and survives a round trip --
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    # `citystate_atwar` is a SLICE of the war matrix, so what has to be registered —
    # and what actually carries the state through a round trip — is `war`.
    # Registering the view instead would restore into a fresh tensor and
    # silently orphan the matrix.
    assert "war" in _MUTABLE, "the war matrix must be registered in _MUTABLE"
    assert "citystate_atwar" not in _MUTABLE, "citystate_atwar is a VIEW of war — registering it too would double-restore"
    assert sim.citystate_atwar.data_ptr() == sim.war[:, 0, 1 + max(sim.R, 1):].data_ptr(), (
        "citystate_atwar must share storage with war[seat 0, city-state]"
    )
    assert sim.citystate_atwar.shape == (sim.B, sim.S), f"citystate_atwar shape {tuple(sim.citystate_atwar.shape)}"
    assert not bool(sim.citystate_atwar.any()), "peace is the default — no city-state starts at war"
    sim.citystate_atwar[0, 0] = True
    sim.sync_war()  # close the poke under transpose
    snap = sim.snapshot()
    sim.citystate_atwar[0, 0] = False
    sim.sync_war()  # close the poke under transpose
    sim.restore(snap)
    assert bool(sim.citystate_atwar[0, 0]), "citystate_atwar must survive snapshot/restore"

    # --- 2) peace hides the centre; a declaration reveals it -----------------
    # Walk a few turns so a seat-0 unit exists, then plant one adjacent to a
    # live city-state centre and read the mask with war off, then on.
    s2 = BatchSim([load_fixture(p) for p in paths], rules, device="cpu", dtype=torch.float64)
    for _ in range(30):
        s2.step()
    # CONSTRUCT the configuration rather than hunt for it: take any live seat-0
    # unit, make it a fighter, and stand it next to a live city-state centre —
    # a poke that silently skips proves nothing.
    fighter = int((s2._type_combat > 0).nonzero().flatten()[0])
    found = None
    for b in range(s2.B):
        live = s2.citystate_alive[b].nonzero().flatten().tolist()
        units = (s2.major_unit_alive[b] & (s2.major_unit_seat[b] == 0)).nonzero().flatten().tolist()
        if not live or not units:
            continue
        cs = live[0]
        ctr = int(s2.citystate_center[b, cs])
        nbrs = [int(x) for x in s2.neigh[ctr].tolist() if x >= 0 and bool(s2.passable[b, x])]
        if not nbrs:
            continue
        found = (b, cs, ctr, units[0], nbrs[0])
        break
    assert found is not None, "no fixture has a live city-state and a live seat-0 unit"
    s2.major_unit_type[found[0], found[3]] = fighter
    b, cs, ctr, u, spot = found
    s2.major_unit_tile[b, u] = spot
    s2.citystate_atwar[b, cs] = False
    s2.sync_war()  # close the poke under transpose
    # the mask indexes HEAD ROWS — this seat's living units in slot order
    rw = int((s2._seat_slot_map(0)[b] == u).nonzero(as_tuple=True)[0][0])
    m_peace = s2._seat_unit_mask(0)[b, rw, 6:12]
    dirs = [i for i, n in enumerate(s2.neigh[spot].tolist()) if n == ctr]
    assert dirs, "the planted tile is not adjacent to the centre"
    d = dirs[0]
    assert not bool(m_peace[d]), "a PEACEFUL city-state must never appear in the attack mask"
    s2.citystate_atwar[b, cs] = True
    s2.sync_war()  # close the poke under transpose
    m_war = s2._seat_unit_mask(0)[b, rw, 6:12]
    assert bool(m_war[d]), "after a declaration the city-state centre MUST be attackable"
    print("  a citystate_atwar: peace default, a VIEW of war, snapshot round-trip OK")
    print("  b mask: peaceful hidden, declared war reveals the centre OK")

    # --- c: the SUZERAIN RELEASE --------------------------------------------
    # `makePeace` in cpu/core/phase.ts ends the wars a civ's city-states were
    # dragged into and sheds WW_PEACE_TREATY from each. No seat declares on a
    # city-state in the gate, so this poke is the only coverage it has.
    suz_min = int(s2.rules.citystate.get("suzerainEnvoys", 3))
    r = 0
    s2.citystate_atwar[b, cs] = True
    s2.citystate_war_turns[b, cs] = 7
    s2.seat_citystate_envoys[b, r + 1, cs] = suz_min + 2   # this civ is the strict suzerain
    s2.seat_citystate_envoys[b, 0, cs] = 0
    if s2.R > 1:
        s2.seat_citystate_envoys[b, 2:, cs] = 0
    _citystate_row = 1 + max(s2.R, 1) + cs
    s2.ww[b, 0, _citystate_row] = 900.0
    s2.sync_war()
    shed = int(s2.rules.war_weariness.get("peaceTreaty", 2000))

    _peace = torch.zeros(s2.B, dtype=torch.bool)
    _peace[b] = True
    s2._citystate_suzerain_release(r + 1, _peace)
    assert not bool(s2.citystate_atwar[b, cs]), "the suzerain's peace must end the city-state's war"
    assert int(s2.citystate_war_turns[b, cs]) == 0, "the war clock must reset"
    assert float(s2.ww[b, 0, _citystate_row]) == max(0.0, 900.0 - shed), "seat 0 must shed the treaty amount"
    assert int(s2.war_turns[b, _citystate_row]) == 0, "citystate_war_turns is a VIEW — war_turns must see the reset"

    # a civ that is NOT the suzerain releases nothing
    s2.citystate_atwar[b, cs] = True
    s2.seat_citystate_envoys[b, r + 1, cs] = 0
    s2.sync_war()
    s2._citystate_suzerain_release(r + 1, _peace)
    assert bool(s2.citystate_atwar[b, cs]), "a non-suzerain's peace must NOT free the city-state"
    print("  c suzerain release: war ends, clock resets through the view, -%d ww OK" % shed)

    print("citystate_war_test OK — A-18 seat 0 <-> city-state war gates the attack mask")


if __name__ == "__main__":
    main()
