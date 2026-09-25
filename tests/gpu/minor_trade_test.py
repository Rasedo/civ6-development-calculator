"""A CITY-STATE'S TRADE ROUTES — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/minor_trade_test.py

The TS twin is tests/cpu/minors/minor-trade.test.ts. A minor's routes ride
the majors' route planes on its own row (`seat_routes[:, n_majors + s]`, the
origin coded 0 for its one city):
  1. its capacity is its Foreign Trade civic and its city's Market or
     Lighthouse (`_trade_capacity`'s minor arm);
  2. its free Trader takes the scorer's destination (`_minor_route_candidate`)
     and is spent on it (`_minor_trade`): the term, the walker at the centre,
     no chain;
  3. the route pays its city the destination's rows (`_minor_route_income`);
  4. it walks and comes home with its Trader at the end of its term;
  5. a major's war on the minor cancels its route to that major.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths
from warmup import opened

B0 = 0


def traders(sim, s: int) -> int:
    return int((sim.major_unit_alive[B0] & (sim.major_unit_seat[B0] == 100 + s)
                & (sim.major_unit_type[B0] == sim._trader_idx)).sum())


def a_trader(sim, s: int) -> None:
    landed = sim._minor_spawn(s, torch.ones(sim.B, dtype=torch.bool),
                              torch.full((sim.B,), sim._trader_idx, dtype=torch.long), grants=False)
    assert bool(landed[B0]), "the Trader did not land"


def trading_minor(sim) -> int:
    """a live minor with a destination in range once it trades"""
    for s in range(sim.S):
        if not bool(sim.citystate_alive[B0, s]):
            continue
        sim.citystate_civics[B0, s, sim._trade_ftc] = True
        if bool(sim._minor_route_candidate(s)[0][B0]):
            return s
    raise AssertionError("no minor on this fixture has a destination in range")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    sim = opened(rules, path, 4)
    base = sim.snapshot()

    # -- 1 capacity --------------------------------------------------------
    s = trading_minor(sim)
    row = sim._CITY_MINOR0 + s
    cap = int(sim._trade_capacity(row)[B0])
    assert cap == 1, f"Foreign Trade gives one route, got {cap}"
    sim.city_bldg[B0, row, 0, sim._trade_mkt] = True
    assert int(sim._trade_capacity(row)[B0]) == 2, "the Market adds one"
    sim.city_bldg[B0, row, 0, sim._trade_mkt] = False
    print(f"  1 capacity OK — minor {s}: the civic 1, the Market 2")

    # -- 2 the route --------------------------------------------------------
    found, code, dseat, dcity, dct = sim._minor_route_candidate(s)
    a_trader(sim, s)
    t0 = traders(sim, s)
    sim._minor_trade(s)
    rr = sim.seat_routes[B0, row]
    live = (rr[:, 0] >= 0).nonzero().flatten().tolist()
    assert len(live) == 1, "no route (or more than one) committed"
    k = live[0]
    assert int(rr[k, 0]) == 0, "the origin is the minor's one city, coded 0"
    assert int(rr[k, 1]) == int(code[B0]) and int(sim.seat_route_dseat[B0, row, k]) == int(dseat[B0])
    assert int(sim.seat_route_walk[B0, row, k]) == int(sim.citystate_center[B0, s]), "the walker starts home"
    assert int(sim.seat_route_exp[B0, row, k]) == int(sim.turn) + int(sim._trade_min_duration()[B0])
    assert bool((sim.seat_route_chain[B0, row, k] < 0).all()), "a minor rides no Trading Post"
    assert traders(sim, s) == t0 - 1, "the Trader was not spent"
    print(f"  2 route OK — to code {int(code[B0])} (seat row {int(dseat[B0])}), the Trader spent")

    # -- 3 income -------------------------------------------------------------
    inc = sim._minor_route_income(s)
    assert inc is not None
    y = inc[B0, 0].tolist()
    assert sum(y) > 0, "the route pays nothing"
    if int(code[B0]) <= -2:
        d = -int(code[B0]) - 2
        mult = float(sim._congress_cs_route_mult()[B0, d])
        assert abs(y[2] - sim._minor_cs_route_gold * mult) < 1e-9, f"gold {y[2]}"
        assert abs(sum(y) - (sim._minor_cs_route_gold + sim._minor_cs_route_spec) * mult) < 1e-9
    print(f"  3 income OK — {y}")

    # -- 4 the walk and the round trip -----------------------------------------
    exp = int(sim.seat_route_exp[B0, row, k])
    moved = False
    for turn in range(int(sim.turn) + 1, exp + 40):
        sim.turn = turn
        at = int(sim.seat_route_walk[B0, row, k])
        sim._minor_trade(s)
        if int(sim.seat_routes[B0, row, k, 0]) < 0:
            break
        if int(sim.seat_route_walk[B0, row, k]) != at:
            moved = True
    assert moved, "the Trader never walked"
    assert not bool((sim.seat_routes[B0, row, :, 0] >= 0).any()), "the route never ended"
    assert int(sim.turn) >= exp, "the route ended before its term"
    assert traders(sim, s) == t0, "the Trader did not come home"
    print(f"  4 round trip OK — home at turn {int(sim.turn)} (term {exp})")

    # -- 5 a major's war on the minor cancels its route to that major ----------
    sim.restore(base)
    sim.citystate_civics[B0, s, sim._trade_ftc] = True
    majors = [r for r in range(sim.n_majors) if bool(sim.city_alive[B0, r].any())]
    hit = False
    for r2 in majors:
        # every other minor out of the scan, so the major's city is the pick
        for s2 in range(sim.S):
            if s2 != s:
                sim.citystate_alive[B0, s2] = False
        f2 = sim._minor_route_candidate(s)
        if not bool(f2[0][B0]) or int(f2[2][B0]) != r2:
            continue
        a_trader(sim, s)
        sim._minor_trade(s)
        assert bool((sim.seat_route_dseat[B0, row] == r2).any()), "no route to the major"
        tb = traders(sim, s)
        sim._declare_war_minor(r2, s, torch.ones(sim.B, dtype=torch.bool))
        assert not bool(((sim.seat_routes[B0, row, :, 0] >= 0) & (sim.seat_route_dseat[B0, row] == r2)).any()), \
            "the war left the route standing"
        assert traders(sim, s) == tb + 1, "the cancelled route's Trader did not come home"
        f3 = sim._minor_route_candidate(s)
        assert not bool(f3[0][B0]) or int(f3[2][B0]) != r2, "a destination at war was offered"
        hit = True
        break
    print("  5 war OK — the route to the major cancels, its Trader home" if hit
          else "  5 war SKIPPED — no major city in the minor's range")
    print("BATTERY OK minor_trade")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
