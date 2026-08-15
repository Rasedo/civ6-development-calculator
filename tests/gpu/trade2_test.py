"""Trade-fidelity self-test.

International routes + route duration are largely GATE-REACHABLE on the civ
seats (the scripted parity rollout exercises expiry and the domestic/CS
re-pick every game), but the international leg only fires when a seat
exhausts domestic+CS destinations, so these pokes pin the semantics
directly on the GPU tensors (the space_race_test / occupancy_test pattern:
load rules + a fixture, drive BatchSim, assert on internal state).

Proven here, turn-exact with the TS contract (cpu/core/trade.ts
routeYieldsInternational + TRADE_ROUTE_DURATION, phase.ts seat pick +
income + expiry):
  * the exported constants: trade.intlGold = 3, trade.duration = 20;
  * seat_route_dseat / seat_route_dcity / seat_route_exp are _MUTABLE, long,
    [B, NS, K];
  * an international route pays intlGold + dest completed-specialty
    count to GOLD only, and is suspended while at war with the destination;
  * duration expiry drops a due route (exp <= turn) and keeps a future one;
  * the destination is keyed by (SEAT, CITY ID), so a route to an id that
    seat no longer holds is dropped while a live pair survives;
  * a CAPTURED destination drops the route even though its centre tile is
    still a live city centre — the case a tile key could not see;
  * the route tensors ride snapshot/restore.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES
from core.engine import _MUTABLE


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text())
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"

    # --- 1) exported constants mirror cpu/core/trade.ts --------------------
    tr = rj["trade"]
    assert int(tr["intlGold"]) == 3, f"intlGold should be 3, got {tr['intlGold']}"
    assert int(tr["duration"]) == 20, f"duration should be 20, got {tr['duration']}"

    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert sim._trade_intl_gold == 3 and sim._trade_duration == 20, "engine trade consts mismatch"
    for _p in ("seat_route_dseat", "seat_route_dcity", "seat_route_exp"):
        assert _p in _MUTABLE, f"{_p} must be _MUTABLE — the route store rides snapshot/restore"
    B = sim.B
    K = sim.seat_routes.shape[2]
    for _p in ("seat_route_dseat", "seat_route_dcity", "seat_route_exp"):
        _t = getattr(sim, _p)
        assert _t.shape == (B, sim.seat_routes.shape[1], K), f"{_p} shape"
        assert _t.dtype == torch.long == sim.seat_routes.dtype, f"{_p} dtype must match seat_routes"

    # --- 2) international income: intlGold + dest specialty, gold only -----
    #   Plant a route from row 1's capital to row 0's capital, keyed the way
    #   TS keys it: (toSeat, toSeatCity). At t0 that capital holds no
    #   specialty district, so gold = intlGold(3).
    assert sim.n_majors >= 2 and bool(sim.city_alive[0, 1, 0]), "need a live second-row capital"
    dest_tile = int(sim.city_center[0, 0, 0])
    dest_cid = int(sim.city_id[0, 0, 0])
    assert int(sim.centre_slot_at[0, dest_tile]) == 0 and int(sim.tile_seat[0, dest_tile]) == 0 and bool(sim.city_alive[0, 0, 0]), "row-0 capital must own its center"
    sim.seat_routes[0, 1, 0, 0] = int(sim.city_id[0, 1, 0])  # origin = row 1's capital
    sim.seat_routes[0, 1, 0, 1] = -1                        # intl: dest carried below
    sim.seat_route_dseat[0, 1, 0] = 0
    sim.seat_route_dcity[0, 1, 0] = dest_cid
    sim.seat_route_exp[0, 1, 0] = int(sim.turn) + sim._trade_duration
    sim.war[0, 0, 1] = sim.war[0, 1, 0] = False
    sim.sync_war()  # close the poke under transpose
    sim._seat_route_cache = None
    inc = sim._seat_route_income(1)
    assert inc is not None, "income must resolve with an active route"
    gold = float(inc[0, 0, 2])
    assert abs(gold - 3.0) < 1e-9, f"peace intl income should be intlGold=3, got {gold}"
    # gold ONLY — no food/prod/sci/cul/faith on the international leg
    for col, name in [(0, "food"), (1, "prod"), (3, "sci"), (4, "cul"), (5, "faith")]:
        assert abs(float(inc[0, 0, col])) < 1e-9, f"intl route must not pay {name}"

    # destination interdiction: war with the destination seat suspends income
    sim.war[0, 0, 1] = sim.war[0, 1, 0] = True
    sim.sync_war()  # close the poke under transpose
    sim._seat_route_cache = None
    inc = sim._seat_route_income(1)
    assert inc is None or abs(float(inc[0, 0, 2])) < 1e-9, "intl income must be suspended at war"
    sim.war[0, 0, 1] = sim.war[0, 1, 0] = False
    sim.sync_war()  # close the poke under transpose

    # a completed specialty district at the destination adds 1 gold each
    own = (sim.city_slot_at(0)[0] == 0)  # capital-owned tiles
    cand = ((sim.district[0] < 0) & own & ~sim.centre_slot_at[0].ge(0)).nonzero(as_tuple=True)[0]
    if len(cand) > 0:
        spec_idx = next((i for i, d in enumerate(sim.districts_cat) if d.get("countsTowardLimit", True)), 0)
        t = int(cand[0])
        sim.district[0, t] = spec_idx
        sim.district_complete[0, t] = True
        sim._eff_version += 1
        sim._seat_route_cache = None
        inc = sim._seat_route_income(1)
        assert abs(float(inc[0, 0, 2]) - 4.0) < 1e-9, f"one dest specialty → 3+1 gold, got {float(inc[0, 0, 2])}"

    # --- 3) duration expiry: due route dropped, future route kept ----------
    s = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    fid = int(s.city_id[0, 1, 0])
    s.seat_routes[0, 1, 0, 0] = fid
    s.seat_routes[0, 1, 0, 1] = int(s.city_id[0, 1, 0])  # (any active dest; expiry keys on exp only)
    s.seat_route_exp[0, 1, 0] = int(s.turn)  # due now (exp <= turn)
    s.seat_routes[0, 1, 1, 0] = fid
    s.seat_routes[0, 1, 1, 1] = int(s.city_id[0, 1, 0])
    s.seat_route_exp[0, 1, 1] = int(s.turn) + 5  # future
    s._expire_seat_routes(1)
    assert int(s.seat_routes[0, 1, 0, 0]) == -1, "a due route (exp <= turn) must be dropped"
    assert int(s.seat_route_exp[0, 1, 0]) == -1, "dropped slot's exp must reset"
    assert int(s.seat_routes[0, 1, 1, 0]) == fid, "a future route must survive expiry"

    # --- 4) dest-gone: the (seat, city id) pair must still resolve ---------
    s2 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    live_cid = int(s2.city_id[0, 0, 0])
    dead_cid = int(s2.city_id[0, 0].max()) + 1000  # an id row 0 has never minted
    for slot, cid in ((0, dead_cid), (1, live_cid)):
        s2.seat_routes[0, 1, slot, 0] = int(s2.city_id[0, 1, 0])
        s2.seat_routes[0, 1, slot, 1] = -1
        s2.seat_route_dseat[0, 1, slot] = 0
        s2.seat_route_dcity[0, 1, slot] = cid
        s2.seat_route_exp[0, 1, slot] = int(s2.turn) + s2._trade_duration  # not yet expired
    s2._expire_seat_routes(1)
    assert int(s2.seat_routes[0, 1, 0, 0]) == -1, "an intl route to an id that seat does not hold must be dropped"
    assert int(s2.seat_routes[0, 1, 1, 0]) >= 0, "an intl route to a LIVE (seat, city) pair must survive"

    # --- 5) a CAPTURED destination drops the route -------------------------
    #   The case a dest TILE could not see: transferCity re-mints the flipped
    #   city under the captor (`civ_next_city_id[dst_row]++`) and re-crowns the
    #   same centre tile, so the tile stays a live centre while TS's
    #   (toSeat, toSeatCity) lookup stops resolving.
    s4 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    cap_tile = int(s4.city_center[0, 0, 0])
    cap_cid = int(s4.city_id[0, 0, 0])
    s4.seat_routes[0, 1, 0, 0] = int(s4.city_id[0, 1, 0])
    s4.seat_routes[0, 1, 0, 1] = -1
    s4.seat_route_dseat[0, 1, 0] = 0
    s4.seat_route_dcity[0, 1, 0] = cap_cid
    s4.seat_route_exp[0, 1, 0] = int(s4.turn) + s4._trade_duration
    s4._expire_seat_routes(1)
    assert int(s4.seat_routes[0, 1, 0, 0]) >= 0, "the route must be live BEFORE the capture, or the lane proves nothing"
    captor = 2 if s4.n_majors >= 3 else 1
    assert s4._transfer_city(0, 0, 0, captor, conquest=True), "the capture must annex, not raze, for this lane"
    assert int(s4.centre_slot_at[0, cap_tile]) >= 0, "the captured centre is STILL a live city centre — a tile key would keep paying"
    assert not bool(((s4.city_id[0, 0] == cap_cid) & s4.city_alive[0, 0]).any()), "row 0 must no longer hold that city id"
    s4._expire_seat_routes(1)
    assert int(s4.seat_routes[0, 1, 0, 0]) == -1, "a route to a CAPTURED city must be dropped"
    assert int(s4.seat_route_dcity[0, 1, 0]) == -1 and int(s4.seat_route_dseat[0, 1, 0]) == -1, "dropped slot's dest must reset"

    # --- 6) the route tensors ride snapshot/restore ------------------------
    s3 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    snap = s3.snapshot()
    s3.seat_route_dseat[0, 1, 0] = 0
    s3.seat_route_dcity[0, 1, 0] = 123
    s3.seat_route_exp[0, 1, 0] = 999
    s3.restore(snap)
    assert int(s3.seat_route_dseat[0, 1, 0]) == -1 and int(s3.seat_route_dcity[0, 1, 0]) == -1 \
        and int(s3.seat_route_exp[0, 1, 0]) == -1, "restore must roll back route metadata"

    print("trade2_test OK — intl gold(+specialty)/gold-only/war-suspend, duration expiry, "
          "(seat, city) dest keying incl. a capture, _MUTABLE round-trip")


if __name__ == "__main__":
    main()
