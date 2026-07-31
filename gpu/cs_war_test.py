"""A-18 (#79) PLAYER<->CITY-STATE WAR — the CS-attack mask column.

    python gpu/cs_war_test.py

Real Civ 6 treats a city-state as a separate player: peace is the default and
you must DECLARE war before you can attack it. That state is exactly what the
A-18 residual was blocked on — without it the attack mask could only ever offer
a city-state centre unconditionally, and offering a PEACEFUL one is what the
autopilot invariant ("target lists never include peaceful city-states",
tests/deeper.test.ts) forbids.

This lane pins the construct the scripted gate cannot reach: the plane exists
and is persisted, peace hides the centre from the mask, and a declaration
reveals it.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import _MUTABLE


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"

    # --- 1) the plane exists, is peace-by-default and survives a round trip --
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    # #51/S6.0: `cs_atwar` is a SLICE of the war matrix now, so what has to be
    # registered — and what actually carries the state through a round trip —
    # is `war`. Registering the view instead would restore into a fresh tensor
    # and silently orphan the matrix.
    assert "war" in _MUTABLE, "the war matrix must be registered in _MUTABLE"
    assert "cs_atwar" not in _MUTABLE, "cs_atwar is a VIEW of war — registering it too would double-restore"
    assert sim.cs_atwar.data_ptr() == sim.war[:, 0, 1 + max(sim.R, 1):].data_ptr(), (
        "cs_atwar must share storage with war[player, city-state]"
    )
    assert sim.cs_atwar.shape == (sim.B, sim.S), f"cs_atwar shape {tuple(sim.cs_atwar.shape)}"
    assert not bool(sim.cs_atwar.any()), "peace is the default — no city-state starts at war"
    sim.cs_atwar[0, 0] = True
    sim.sync_war()  # #51/S6.0: close the poke under transpose
    snap = sim.snapshot()
    sim.cs_atwar[0, 0] = False
    sim.sync_war()  # #51/S6.0: close the poke under transpose
    sim.restore(snap)
    assert bool(sim.cs_atwar[0, 0]), "cs_atwar must survive snapshot/restore"

    # --- 2) peace hides the centre; a declaration reveals it -----------------
    # Walk a few turns so a player unit exists, then plant one adjacent to a
    # live city-state centre and read the mask with war off, then on.
    s2 = BatchSim([load_fixture(p) for p in paths], rules, device="cpu", dtype=torch.float64)
    for _ in range(30):
        s2.step()
    # CONSTRUCT the configuration rather than hunt for it: take any live player
    # unit, make it a fighter, and stand it next to a live city-state centre.
    # (The watermill/relics lesson — a poke that silently skips proves nothing.)
    fighter = int((s2._p_combat > 0).nonzero().flatten()[0])
    found = None
    for b in range(s2.B):
        live = s2.cs_alive[b].nonzero().flatten().tolist()
        units = s2.p_alive[b].nonzero().flatten().tolist()
        if not live or not units:
            continue
        cs = live[0]
        ctr = int(s2.cs_center[b, cs])
        nbrs = [int(x) for x in s2.neigh[ctr].tolist() if x >= 0 and bool(s2.passable[b, x])]
        if not nbrs:
            continue
        found = (b, cs, ctr, units[0], nbrs[0])
        break
    assert found is not None, "no fixture has a live city-state and a live player unit"
    s2.p_type[found[0], found[3]] = fighter
    b, cs, ctr, u, spot = found
    s2.p_tile[b, u] = spot
    s2.cs_atwar[b, cs] = False
    s2.sync_war()  # #51/S6.0: close the poke under transpose
    m_peace = s2.unit_action_mask()[b, u, 6:12]
    dirs = [i for i, n in enumerate(s2.neigh[spot].tolist()) if n == ctr]
    assert dirs, "the planted tile is not adjacent to the centre"
    d = dirs[0]
    assert not bool(m_peace[d]), "a PEACEFUL city-state must never appear in the attack mask"
    s2.cs_atwar[b, cs] = True
    s2.sync_war()  # #51/S6.0: close the poke under transpose
    m_war = s2.unit_action_mask()[b, u, 6:12]
    assert bool(m_war[d]), "after a declaration the city-state centre MUST be attackable"
    print("  a cs_atwar: peace default, a VIEW of war, snapshot round-trip OK")
    print("  b mask: peaceful hidden, declared war reveals the centre OK")
    print("cs_war_test OK — A-18 player<->city-state war gates the attack mask")


if __name__ == "__main__":
    main()
