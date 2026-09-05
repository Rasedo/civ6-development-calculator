"""A TRADE ROUTE'S RELIGIOUS PRESSURE (C-56) — the GPU half.

    python tests/gpu/route_pressure_test.py

The TS twin is the "a trade route carries..." case in
tests/cpu/religion/religion-trade.test.ts.

CIV6 (GlobalParameters): RELIGION_SPREAD_TRADE_ROUTE_PRESSURE_FOR_DESTINATION
1.0 and _FOR_ORIGIN 0.5 — a live route carries its ORIGIN city's religion to
the destination each turn and the destination's back at half strength;
Dharma's +100% (ROUTE_PRESSURE_ROWS) doubles both on India's own routes.
READING: the accumulator is an integer, so the half-point lands on EVEN turns
(`_route_pressure_share`).

Scene: two cities of row 0 more than 10 tiles apart (no ambient reach), A
following religion 0 and B following religion 1, one domestic route A -> B.

  1. an even turn: B takes +1 of religion 0, A takes +1 of religion 1.
  2. an odd turn: B takes +1, A takes nothing (the half waits).
  3. India: B takes +2 and A +1 on any turn.
  4. a route whose destination follows nobody presses nothing back.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

ROW = 0
SA, SB = 8, 9  # two dedicated city slots of ROW


def play(sim, row: int, name) -> None:
    if name is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[0, row] = ci
        sim.row_leader[0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def far_pair(sim) -> tuple[int, int]:
    """two passable land tiles more than the pressure range apart, neither a centre."""
    reach = int(sim._pressure_range) + 3
    free = [t for t in range(sim.T) if bool(sim.passable[0, t]) and not bool(sim.wpass[0, t])
            and int(sim.centre_slot_at[0, t]) < 0]
    for a in free:
        d = sim.pair_dist[a]
        for b in free:
            if int(d[b]) > reach:
                return a, b
    raise AssertionError("no two land tiles far enough apart")


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules, device="cpu", dtype=torch.float64))
    # every fixture religion silenced; ROW founds religion 0, row 1 religion 1
    sim.holy_tile[0] = -1
    sim.city_pressure[0, :sim.n_majors] = 0
    sim.city_followed[0, :sim.n_majors] = -1
    a_t, b_t = far_pair(sim)
    for s, t, g in ((SA, a_t, 0), (SB, b_t, 1)):
        sim.city_alive[0, ROW, s] = True
        sim.city_center[0, ROW, s] = t
        sim.city_id[0, ROW, s] = 900 + s
        sim.city_pop[0, ROW, s] = 3
        sim.city_pressure[0, ROW, s] = 0
        sim.city_pressure[0, ROW, s, g] = 9000
        sim.city_followed[0, ROW, s] = g
    sim.holy_tile[0, 0] = a_t
    sim.holy_tile[0, 1] = b_t
    # one live domestic route A -> B, no international destination
    sim.seat_routes[0, ROW] = -1
    sim.seat_route_dcity[0, ROW] = -1
    sim.seat_route_dseat[0, ROW] = -1
    sim.seat_routes[0, ROW, 0, 0] = 900 + SA
    sim.seat_routes[0, ROW, 0, 1] = 900 + SB
    oc, dc = sim._route_centres(ROW)
    assert int(oc[0, 0]) == a_t and int(dc[0, 0]) == b_t, "the route does not resolve to A -> B"
    return sim


def spread_delta(sim, turn: int):
    sim.turn = turn
    before_a = sim.city_pressure[0, ROW, SA].clone()
    before_b = sim.city_pressure[0, ROW, SB].clone()
    sim._spread_religious_pressure()
    da = (sim.city_pressure[0, ROW, SA] - before_a).tolist()
    db = (sim.city_pressure[0, ROW, SB] - before_b).tolist()
    return da, db


def main() -> int:
    sim = build()
    play(sim, ROW, None)
    hc = int(sim._holy_city_mult) * int(sim._pressure_per_turn)  # each city presses ITSELF at the Holy City step
    da, db = spread_delta(sim, 10)
    assert db[0] == 1 and db[1] == hc, f"even turn: B took {db} (want +1 of religion 0 from the route, its own {hc})"
    assert da[1] == 1 and da[0] == hc, f"even turn: A took {da} (want the half-point of religion 1 back, its own {hc})"
    print("  1 even turn OK — the destination takes 1, the origin takes the half-point back")

    da, db = spread_delta(sim, 11)
    assert db[0] == 1, f"odd turn: B took {db}"
    assert da[1] == 0, f"odd turn: A took {da} of religion 1 — the half-point must wait for an even turn"
    print("  2 odd turn OK — the destination still takes 1, the origin nothing")

    play(sim, ROW, "INDIA")
    da, db = spread_delta(sim, 11)
    assert db[0] == 2, f"India, odd turn: B took {db} (want +2)"
    assert da[1] == 1, f"India, odd turn: A took {da} (want +1 every turn)"
    print("  3 Dharma OK — +100% on the owner's routes: 2 down the route, 1 back, every turn")

    play(sim, ROW, None)
    sim.city_pressure[0, ROW, SB] = 0
    sim.city_followed[0, ROW, SB] = -1
    da, db = spread_delta(sim, 10)
    assert db[0] == 1 and da[1] == 0, f"a destination following nobody pressed back: A {da}, B {db}"
    print("  4 no religion at the destination OK — nothing comes back")
    print("BATTERY OK route_pressure")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
