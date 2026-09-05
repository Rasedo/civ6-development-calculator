"""A ROUTE COMING IN IS PAID WITH NO ROUTE GOING OUT (A-4r).

    python tests/gpu/incoming_route_test.py

The TS twin is tests/cpu/city/incoming-route.test.ts.

`_seat_route_income` returned None for a seat with no outgoing route, holding
the exit open for exactly one destination-side row — Cleopatra's incoming
gold. Radio Oranje's "+2 Culture from each Trade Route another civilization
sends to this one" is paid inside the same walk, so the turn Wilhelmina's
last outgoing route expired, her +2 for the route still coming IN stopped
with it. TS pays it regardless. Seed 9001 t90, city[412].cultureBox, the
whole of A-4r.

The guard now derives from the ROWS: any destination-side row this seat
carries keeps the walk alive.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
HOST, SENDER = 0, 1
CUL = 4


def build() -> BatchSim:
    return settle_all(BatchSim([load_fixture(fixture_paths()[0])], load_rules(),
                               device="cpu", dtype=torch.float64))


def seat_leader(sim: BatchSim, row: int, leader: str | None) -> None:
    if leader is None:
        sim.row_civ[B0, row] = -1
        sim.row_leader[B0, row] = -1
    else:
        li = sim._pair_leader.index(leader)
        sim.row_leader[B0, row] = li
        sim.row_civ[B0, row] = sim._pair_civ[li]
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._seat_route_cache = None


def clear_routes(sim: BatchSim, row: int) -> None:
    sim.seat_routes[B0, row, :, 0] = -1
    sim.seat_route_dseat[B0, row] = -1
    sim.seat_route_dcity[B0, row] = -1
    sim._seat_route_cache = None


def route_in(sim: BatchSim, frm: int, to: int, k: int = 0) -> None:
    """One live route: `frm`'s first city -> `to`'s first city (the
    alliance_levels crafting, verbatim)."""
    sim.seat_routes[B0, frm, k, 0] = int(sim.city_id[B0, frm, 0])
    sim.seat_routes[B0, frm, k, 1] = -1_000_000
    sim.seat_route_dseat[B0, frm, k] = to
    sim.seat_route_dcity[B0, frm, k] = int(sim.city_id[B0, to, 0])
    sim.seat_route_exp[B0, frm, k] = int(sim.turn) + 50
    sim.seat_route_born[B0, frm, k] = int(sim.turn)
    sim._seat_route_cache = None


def host_culture(sim: BatchSim) -> float | None:
    inc = sim._seat_route_income(HOST)
    if inc is None:
        return None
    return float(inc.reshape(sim.B, sim.RC, 6)[B0, 0, CUL])


def test_the_row_is_on_the_wire(sim) -> None:
    rows = sim._incoming_route_yield_rows
    assert rows, "no incoming-route yield rows on the wire"
    li = sim._pair_leader.index("WILHELMINA")
    mine = [r for r in rows if r[1] == li]
    assert mine, "Radio Oranje has no row"
    assert any(r[2] == CUL and r[3] == 2 for r in mine), f"the row is not +2 Culture: {mine}"
    print("  1 the wire OK — Radio Oranje is +2 Culture per foreign route in")


def test_paid_with_no_route_of_her_own(sim) -> None:
    """The bug, exactly: a foreign route in, none out, and the +2 must land."""
    seat_leader(sim, HOST, "WILHELMINA")
    seat_leader(sim, SENDER, None)
    clear_routes(sim, HOST)
    clear_routes(sim, SENDER)
    route_in(sim, SENDER, HOST)
    got = host_culture(sim)
    assert got is not None, "a seat with a route coming IN was not walked at all"
    assert got == 2.0, f"Wilhelmina's city was paid {got} Culture for one foreign route in, expected 2"
    print("  2 the payout OK — +2 Culture with zero outgoing routes")


def test_two_in_pays_four(sim) -> None:
    seat_leader(sim, 2, None)
    clear_routes(sim, 2)
    route_in(sim, 2, HOST)
    got = host_culture(sim)
    assert got == 4.0, f"two foreign routes in paid {got}, expected 4"
    clear_routes(sim, 2)
    print("  3 the count OK — one row per foreign route")


def test_a_plain_seat_with_nothing_still_exits(sim) -> None:
    """The early return is kept for the case it was written for."""
    seat_leader(sim, HOST, None)
    clear_routes(sim, SENDER)
    assert sim._seat_route_income(HOST) is None, \
        "a seat with no routes and no destination rows was walked for nothing"
    print("  4 the exit OK — nothing in, nothing out, nothing walked")


def test_a_plain_seat_gets_no_culture_from_a_route_in(sim) -> None:
    seat_leader(sim, HOST, None)
    route_in(sim, SENDER, HOST)
    got = host_culture(sim)
    assert got in (None, 0.0), f"a seat without the row was paid {got} for a route in"
    clear_routes(sim, SENDER)
    print("  5 the gate OK — the row pays its carrier only")


def test_the_guard_reads_rows_not_a_name(sim) -> None:
    """The fix's shape: the exemption must come from the rows, or the next
    destination-side row is behind the same door."""
    import inspect
    src = inspect.getsource(type(sim)._seat_route_income)
    assert "_incoming_route_yield_rows" in src.split("if not bool(act.any())")[0], \
        "the early return does not consult the incoming-route rows"
    assert "_route_improvement_rows" in src.split("if not bool(act.any())")[0], \
        "the early return does not consult the destination-side improvement rows"
    print("  6 the guard OK — every destination-side row holds the exit open")


def main() -> int:
    sim = build()
    test_the_row_is_on_the_wire(sim)
    test_paid_with_no_route_of_her_own(sim)
    test_two_in_pays_four(sim)
    test_a_plain_seat_with_nothing_still_exits(sim)
    test_a_plain_seat_gets_no_culture_from_a_route_in(sim)
    test_the_guard_reads_rows_not_a_name(sim)
    print("BATTERY OK incoming_route")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
