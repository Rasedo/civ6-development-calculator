"""Trade-fidelity self-test.

International routes + route duration are largely GATE-REACHABLE on the CIV
seats (the scripted parity rollout exercises expiry and the domestic/CS
re-pick every game), but the international leg only fires when a civ
exhausts domestic+CS destinations, so these pokes pin the semantics
directly on the GPU tensors (the space_race_test / occupancy_test pattern:
load rules + a fixture, drive BatchSim, assert on internal state).

Proven here, turn-exact with the TS contract (cpu/core/trade.ts
routeYieldsInternational + TRADE_ROUTE_DURATION, phase.ts seat pick +
income + expiry):
  * the exported constants: trade.intlGold = 3, trade.duration = 20;
  * r_route_dest / r_route_exp are _MUTABLE, long, [B, R, K];
  * an international civ route pays intlGold + dest completed-specialty
    count to GOLD only, and is suspended while at war with the destination;
  * duration expiry drops a due route (exp <= turn) and keeps a future one;
  * a "dest gone" international route — one whose destination tile is no
    longer a seat-0 city centre — is dropped;
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
    assert "seat_route_dest" in _MUTABLE and "seat_route_exp" in _MUTABLE, "route tensors must be _MUTABLE (#51: SEAT-indexed bases; r_route_* are views)"
    B = sim.B
    K = sim.r_routes.shape[2]
    assert sim.r_route_dest.shape == (B, sim.r_routes.shape[1], K), "r_route_dest shape"
    assert sim.r_route_exp.shape == (B, sim.r_routes.shape[1], K), "r_route_exp shape"
    assert sim.r_route_dest.dtype == torch.long and sim.r_route_exp.dtype == torch.long, "route metadata dtype"
    assert sim.r_route_dest.dtype == sim.r_routes.dtype, "r_route_dest dtype must match r_routes"

    # --- 2) international income: intlGold + dest specialty, gold only -----
    #   Plant a civ-capital route to seat 0's capital centre tile. At t0 that
    #   capital holds no specialty district, so gold = intlGold(3).
    assert sim.R >= 1 and bool(sim.rc_alive[0, 0, 0]), "need a live civ capital"
    dest_tile = int(sim.site[0, 0])  # seat 0's capital centre tile
    assert int(sim.center_at[0, dest_tile]) == 0 and bool(sim.alive[0, 0]), "player capital must own its center"
    sim.r_routes[0, 0, 0, 0] = int(sim.rc_id[0, 0, 0])  # origin = civ capital
    sim.r_routes[0, 0, 0, 1] = -1                        # intl: dest carried below
    sim.r_route_dest[0, 0, 0] = dest_tile
    sim.r_route_exp[0, 0, 0] = int(sim.turn) + sim._trade_duration
    sim.r_atwar[0, 0] = False
    sim.sync_war()  # close the poke under transpose
    sim._seat_route_cache = None
    inc = sim._seat_route_income(0)
    assert inc is not None, "income must resolve with an active route"
    gold = float(inc[0, 0, 2])
    assert abs(gold - 3.0) < 1e-9, f"peace intl income should be intlGold=3, got {gold}"
    # gold ONLY — no food/prod/sci/cul/faith on the international leg
    for col, name in [(0, "food"), (1, "prod"), (3, "sci"), (4, "cul"), (5, "faith")]:
        assert abs(float(inc[0, 0, col])) < 1e-9, f"intl route must not pay {name}"

    # destination interdiction: war with the destination seat suspends income
    sim.r_atwar[0, 0] = True
    sim.sync_war()  # close the poke under transpose
    sim._seat_route_cache = None
    inc = sim._seat_route_income(0)
    assert inc is None or abs(float(inc[0, 0, 2])) < 1e-9, "intl income must be suspended at war"
    sim.r_atwar[0, 0] = False
    sim.sync_war()  # close the poke under transpose

    # a completed specialty district at the destination adds 1 gold each
    own = (sim.owner[0] == 0)  # capital-owned tiles
    cand = ((sim.district[0] < 0) & own & ~sim.center_at[0].ge(0)).nonzero(as_tuple=True)[0]
    if len(cand) > 0:
        spec_idx = next((i for i, d in enumerate(sim.districts_cat) if d.get("countsTowardLimit", True)), 0)
        t = int(cand[0])
        sim.district[0, t] = spec_idx
        sim.district_complete[0, t] = True
        sim._eff_version += 1
        sim._seat_route_cache = None
        inc = sim._seat_route_income(0)
        assert abs(float(inc[0, 0, 2]) - 4.0) < 1e-9, f"one dest specialty → 3+1 gold, got {float(inc[0, 0, 2])}"

    # --- 3) duration expiry: due route dropped, future route kept ----------
    s = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    fid = int(s.rc_id[0, 0, 0])
    s.r_routes[0, 0, 0, 0] = fid
    s.r_routes[0, 0, 0, 1] = int(s.rc_id[0, 0, 0])  # (any active dest; expiry keys on exp only)
    s.r_route_dest[0, 0, 0] = -1
    s.r_route_exp[0, 0, 0] = int(s.turn)  # due now (exp <= turn)
    s.r_routes[0, 0, 1, 0] = fid
    s.r_routes[0, 0, 1, 1] = int(s.rc_id[0, 0, 0])
    s.r_route_dest[0, 0, 1] = -1
    s.r_route_exp[0, 0, 1] = int(s.turn) + 5  # future
    s._expire_seat_routes(0)
    assert int(s.r_routes[0, 0, 0, 0]) == -1, "a due route (exp <= turn) must be dropped"
    assert int(s.r_route_exp[0, 0, 0]) == -1, "dropped slot's exp must reset"
    assert int(s.r_routes[0, 0, 1, 0]) == fid, "a future route must survive expiry"

    # --- 4) dest-gone: an intl route to a vanished centre is dropped -------
    s2 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    empty_tile = int((s2.center_at[0] < 0).nonzero(as_tuple=True)[0][0])  # not a seat-0 centre
    s2.r_routes[0, 0, 0, 0] = int(s2.rc_id[0, 0, 0])
    s2.r_routes[0, 0, 0, 1] = -1
    s2.r_route_dest[0, 0, 0] = empty_tile
    s2.r_route_exp[0, 0, 0] = int(s2.turn) + s2._trade_duration  # not yet expired
    s2._expire_seat_routes(0)
    assert int(s2.r_routes[0, 0, 0, 0]) == -1, "an intl route to a non-player-center tile must be dropped"

    # --- 5) the route tensors ride snapshot/restore ------------------------
    s3 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    snap = s3.snapshot()
    s3.r_route_dest[0, 0, 0] = 123
    s3.r_route_exp[0, 0, 0] = 999
    s3.restore(snap)
    assert int(s3.r_route_dest[0, 0, 0]) == -1 and int(s3.r_route_exp[0, 0, 0]) == -1, "restore must roll back route metadata"

    print("trade2_test OK — intl gold(+specialty)/gold-only/war-suspend, duration expiry, dest-gone prune, _MUTABLE round-trip")


if __name__ == "__main__":
    main()
