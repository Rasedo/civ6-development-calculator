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

import sys
from pathlib import Path

import torch


def developed(rules, path, turns=40, seats=None, dtype=torch.float64):
    """A world that has DEVELOPED: every major seat driven by the ladder for
    `turns` turns from its settler start. The heavyweight sibling of
    `settle_all` — for a lane that needs cities that grew, queued and
    researched, not merely founded. Deterministic (the driver's own seeded
    streams), ~40ms per seat-turn. Returns the BatchSim."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
    from core.env import BatchEnv
    from core import load_fixture
    import drive

    env = BatchEnv([load_fixture(path)], rules, device="cpu", dtype=dtype)
    drive.drive(env, turns, seats=seats if seats is not None else list(range(env.sim.n_majors)))
    return env.sim


def plant_city(sim, row: int):
    """FOUND seat `row` a further city through the engine's own verbs: spawn a
    settler on the nearest foundable tile (canFoundCity's terms — unowned,
    settle_ok, bare, >= 4 from every live city) and issue FOUND over the real
    order path. For a lane that needs a MULTI-CITY seat without gambling on a
    driven settler surviving the walk. Returns the founded tile per game."""
    B, T = sim.B, sim.T
    nrow = sim.n_majors
    ctr = torch.cat((sim.city_center[:, :nrow].reshape(B, -1), sim.citystate_center), dim=1)
    live = torch.cat((sim.city_alive[:, :nrow].reshape(B, -1), sim.citystate_alive), dim=1)
    spot = torch.full((B,), -1, dtype=torch.long)
    for b in range(B):
        cb = ctr[b][live[b]].clamp(min=0)
        dmin = (sim.pair_dist[:, cb].min(dim=1).values.to(torch.long)
                if int(live[b].sum()) else torch.full((T,), 999, dtype=torch.long))
        ok = ((sim.tile_seat[b] < 0) & sim.settle_ok[b]
              & (sim.district[b] < 0) & (sim.built_wonder[b] < 0) & (dmin >= 4)
              & (sim.civilian_at[b] < 0) & (sim.military_at[b] < 0))
        if bool(ok.any()):
            # nearest to the seat's own capital, ties to the lowest tile index
            home = int(sim.civ_cap_tile[b, row])
            d = sim.pair_dist[max(home, 0)].to(torch.long)
            key = torch.where(ok, d * T + torch.arange(T), torch.full_like(d, 2 ** 40))
            spot[b] = key.argmin()
    if not bool((spot >= 0).any()):
        raise AssertionError(f"no foundable tile anywhere for seat {row} — cannot plant a city")
    sim._spawn_unit(row, spot >= 0, spot.clamp(min=0), sim._settler_idx)
    ext = sim.seat_ext.clone()
    sim.seat_ext[:, row] = True
    smap = sim._seat_slot_map(row)
    held = smap >= 0
    typ = sim.unit_type.gather(1, smap.clamp(min=0))
    tl = sim.unit_tile.gather(1, smap.clamp(min=0))
    a_found = sim._A_FOUND
    act = torch.where(held & (typ == sim._settler_idx) & (tl == spot.unsqueeze(1)),
                      torch.full_like(smap, a_found), torch.full_like(smap, -1))
    n_before = sim.city_alive[:, row].sum(dim=1).clone()
    sim._apply_seat_unit_actions(row, act)
    sim.seat_ext.copy_(ext)
    if not bool((sim.city_alive[:, row].sum(dim=1) > n_before).any()):
        raise AssertionError(f"plant_city founded nothing for seat {row}")
    return spot


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
