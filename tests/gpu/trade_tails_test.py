"""THE TRADE ROUTE'S TAILS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/trade_tails_test.py

The TS twins are tests/cpu/seats/trade-tails.test.ts and the escort cases of
tests/cpu/units/unique-{land,sea-air}-units.test.ts.

  * CIV6 (TRADER_IS_WITHIN_FOUR_REQUIREMENT, MaxDistance 4): "Trader units are
    immune to being plundered if they are within 4 tiles of a Mandekalu
    Cavalry and on a land tile" — the escort's reach is 4, its own seat's
    Traders alone.
  * CIV6 (Francis Drake, Ching Shih): the admirals' plunder percentage is an
    ability of the naval classes, so a hull on the Trader's tile is paid it
    and a passenger or a land raider the plain amount.
  * CIV6 (Mountain Tunnel, Qhapaq Ñan): a Trader walks onto a portal's
    mountain and takes the portal as a unit does, a seventh candidate taken
    only when strictly closer.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from core.simbase import FIXTURES  # noqa: E402
from warmup import settle_all  # noqa: E402

UIDS = [u["id"] for u in json.loads((FIXTURES / "rules.json").read_text())["units"]]


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def park_route(sim, row: int, tile: int) -> None:
    """A route of seat row `row`, its walker PARKED on `tile` (no step)."""
    sim.seat_routes[0, row, 0, 0] = int(sim.city_id[0, row, 0])
    sim.seat_routes[0, row, 0, 1] = int(sim.city_id[0, row, 0])
    sim.seat_route_exp[0, row, 0] = int(sim.turn) + sim._trade_duration
    sim.seat_route_walk[0, row, 0] = tile
    sim.seat_route_leg[0, row, 0] = -1


def put(sim, row: int, utype: int, tile: int, *, embarked: bool = False) -> int:
    """A unit of `utype` for seat row `row`, moved onto `tile` on its own plane."""
    # a hull lands on its own water; anything else at the capital, then moves
    at = tile if bool(sim.unit_naval[utype]) else int(sim.city_center[0, row, 0])
    born = sim._spawn_unit(row, torch.ones(sim.B, dtype=torch.bool),
                           torch.full((sim.B,), at, dtype=torch.long), utype)
    assert bool(born[0]), f"{UIDS[utype]} did not land"
    slot = int(((sim.major_unit_seat[0] == row) & sim.major_unit_alive[0]
                & (sim.major_unit_type[0] == utype)).long().nonzero().flatten()[-1])
    g = torch.tensor([slot + sim.POOL_LO["major"]])
    r0 = torch.zeros(1, dtype=torch.long)
    sim._occ_clear(r0, sim.major_unit_tile[0:1, slot], g)
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_emb[0, slot] = embarked
    sim._occ_set(r0, torch.tensor([tile]), g)
    return slot


def at_war(sim, a: int, b: int) -> None:
    sim.war[0, a, b] = sim.war[0, b, a] = True
    sim.sync_war()


def free_tile(sim, water: bool) -> int:
    for t in range(sim.T):
        if (bool(sim.wpass[0, t]) and not bool(sim.ocean_tile[0, t]) if water else bool(sim.passable[0, t])) \
                and int(sim.military_at[0, t]) < 0 and int(sim.civilian_at[0, t]) < 0 \
                and int(sim.embarked_at[0, t]) < 0 and int(sim.support_at[0, t]) < 0 \
                and int(sim.centre_slot_at[0, t]) < 0:
            return t
    raise AssertionError("the fixture has no free tile of that kind")


def test_escort_radius(rules, path) -> None:
    assert int(json.loads((FIXTURES / "rules.json").read_text())["trade"]["guardRadius"]) == 4
    mand = UIDS.index("MANDEKALU_CAVALRY")
    for dist, guarded in ((4, True), (5, False)):
        sim = fresh(rules, path)
        assert sim._trader_guard_radius == 4
        t = free_tile(sim, water=False)
        park_route(sim, 1, t)
        put(sim, 0, sim._warrior_idx, t)
        at_war(sim, 0, 1)
        g = next(x for x in range(sim.T) if int(sim.pair_dist[t, x]) == dist and not bool(sim.water[0, x]))
        slot = put(sim, 1, mand, g)
        assert int(sim.major_unit_tile[0, slot]) == g
        sim._trade_walk_tick(1, torch.ones(sim.B, dtype=torch.bool))
        alive = int(sim.seat_routes[0, 1, 0, 0]) >= 0
        assert alive == guarded, f"a Mandekalu {dist} tiles off: route alive {alive}, want {guarded}"
    print("  1 the escort OK — a Mandekalu 4 tiles off guards the Trader, 5 off does not")


def test_admiral_hull(rules, path) -> None:
    gal = UIDS.index("GALLEY")
    for pct, hull, want in ((50, True, 1.5), (0, True, 1.0), (60, False, 1.0)):
        sim = fresh(rules, path)
        k = sim._gp_perm_names.index("routePlunderPct")
        sea = free_tile(sim, water=True)
        park_route(sim, 1, sea)
        if hull:
            put(sim, 0, gal, sea)
            assert int(sim.military_at[0, sea]) >= 0, "the hull files on the military plane"
        else:
            put(sim, 0, sim._warrior_idx, sea, embarked=True)
            assert int(sim.embarked_at[0, sea]) >= 0, "the passenger files as a PASSENGER"
        at_war(sim, 0, 1)
        sim.civ_gp_perm[0, 0, k] = pct
        g0 = float(sim.civ_treasury[0, 0])
        sim._trade_walk_tick(1, torch.ones(sim.B, dtype=torch.bool))
        assert int(sim.seat_routes[0, 1, 0, 0]) == -1, "the route was not plundered"
        got = float(sim.civ_treasury[0, 0]) - g0
        assert abs(got - sim._trade_plunder_gold * want) < 1e-9, \
            f"pct {pct}, hull {hull}: banked {got}, want {sim._trade_plunder_gold * want}"
    print("  2 the admirals OK — a hull takes the percentage, a passenger the plain gold")


def test_walk_through_a_portal(rules, path) -> None:
    sim = fresh(rules, path)
    # two mountains of one range, each beside land, at least 3 apart
    mt = sim.tile_mountain[0].nonzero().flatten().tolist()
    rows = torch.zeros(1, dtype=torch.long)
    water = torch.zeros(1, dtype=torch.long)
    pick = None
    for a in mt:
        for b in mt:
            if a >= b or int(sim.tile_range[0, a]) != int(sim.tile_range[0, b]):
                continue
            if int(sim.pair_dist[a, b]) < 3:
                continue
            nb = [int(x) for x in sim.neigh[b].tolist() if x >= 0 and bool(sim.passable[0, x])
                  and int(sim.pair_dist[a, x]) >= 3]
            if nb:
                pick = (a, b, nb[0])
                break
        if pick:
            break
    if pick is None:
        print("  3 the portal walk SKIPPED — this fixture has no range long enough")
        return
    a, b, tgt = pick
    tunnel = sim.TUNNEL
    assert not bool(sim._trade_walkable(rows, torch.tensor([a]), water)[0]), "a bare mountain is walkable"
    sim.improvement[0, a] = tunnel
    sim.improvement[0, b] = tunnel
    assert bool(sim._trade_walkable(rows, torch.tensor([a]), water)[0]), "a portal's mountain must be walkable"
    assert int(sim._portal_exit(torch.tensor([a]), rows)[0]) == b
    nxt = int(sim._trade_walk_step(rows, torch.tensor([a]), torch.tensor([tgt]), water)[0])
    assert nxt == b, f"the Trader on the portal stepped to {nxt}, not through to {b}"
    # heading AWAY from the exit, the Trader never takes it
    away = [int(x) for x in sim.neigh[a].tolist() if x >= 0 and bool(sim.passable[0, x])
            and int(sim.pair_dist[b, x]) > int(sim.pair_dist[b, a])]
    if away:
        back = int(sim._trade_walk_step(rows, torch.tensor([a]), torch.tensor([away[0]]), water)[0])
        assert back != b, "the portal was taken away from the target"
    print("  3 the portal walk OK — onto the mountain, and through to the next portal")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_escort_radius(rules, path)
    test_admiral_hull(rules, path)
    test_walk_through_a_portal(rules, path)
    print("BATTERY OK trade_tails")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
