"""THE OPENING TURN, for a poke that needs a world with cities in it.

Fixture format 4 starts every major with a SETTLER and no city, and both
engines are decision-free without a record on the wire: `sim.step()` alone
founds nothing, ever. A poke that steps N turns and then reads a city
therefore reads an empty map — not because the mechanic under test is
broken, but because nobody ever played an opening move.

`settle_all` plays that move for every seat at once, through the engine's own
FOUND verb over the real order path — no plane is written behind the
applier's back, so a city here is a city the wire could have produced.
"""

from __future__ import annotations

import torch


def settle_all(sim, warm: int = 0):
    """FOUND every seat's capital from its starting settler, then step `warm`
    turns. Returns the sim, so it can WRAP the construction it opens:
    `sim = settle_all(BatchSim(...))`."""
    a_found = getattr(sim, "_A_FOUND", -1)
    if a_found < 0 or getattr(sim, "_settler_idx", -1) < 0:
        raise AssertionError("the catalog has no FOUND column or no settler — cannot open the game")

    ext = sim.seat_ext.clone()
    for row in range(sim.n_majors):
        smap = sim._seat_slot_map(row)
        held = smap >= 0
        typ = sim.unit_type.gather(1, smap.clamp(min=0))
        act = torch.where(held & (typ == sim._settler_idx),
                          torch.full_like(smap, a_found), torch.full_like(smap, -1))
        if not bool((act >= 0).any()):
            continue
        sim.seat_ext[:, row] = True
        sim._apply_seat_unit_actions(row, act)
    sim.seat_ext.copy_(ext)
    if not bool(sim.city_alive[:, : sim.n_majors].any()):
        raise AssertionError("the opening move founded nothing — no seat holds a settler on a settleable tile")

    for _ in range(warm):
        sim.step()
    return sim
