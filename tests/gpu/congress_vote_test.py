"""THE WORLD CONGRESS BALLOT — the vote as a wire decision.

    python tests/gpu/congress_vote_test.py

CIV 6 (Gathering Storm, wiki "World Congress (Civ6)"): "For each Regular
session resolution, every civilization will first choose one of the two
outcomes. If there are multiple possible targets within that outcome, the
civilization will then choose a single target." Extra votes cost favor up a
curve that restarts per resolution — "it is thus wise to spend Diplomatic
Favor on other resolutions if they are also important" — and the refunds are
100% for a losing outcome, 50% for the winning outcome on a losing target.

The gate reaches a session about five times a game, always with the ladder's
own ballot. This lane pins what a DIFFERENT ballot does: the override, the
favor curve, the two refund tiers, and the Diplomatic Victory resolution's
+/-2 landing on the winning TARGET rather than on the leader.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    # Every major needs a city to be a voter, and the session gate needs an
    # era: the eras themselves are exercised by the driven gate, so open them
    # here and pin the VOTE.
    sim._congress_min_era = -1
    sim._congress_dv_min = -1
    assert sim.n_majors >= 2, "the tally needs more than one voter"
    for row in range(sim.n_majors):
        assert bool(sim.city_alive[0, row].any()), f"seat {row} holds no city"
    return sim


def session(sim, turn: int) -> None:
    """Run one Regular Session at `turn`, exactly as the turn tail would."""
    sim.turn = turn
    sim._world_congress()


def main() -> None:
    sim = build()
    iv = sim._congress_interval
    assert iv > 0, "the congress interval is off in this fixture"
    NR = len(sim._congress_res)
    assert NR, "no resolution in the catalog"

    # --- 1) THE SLATE a ballot addresses ------------------------------------
    fires, res0, res1, dv = sim._congress_upcoming(iv)
    assert bool(fires[0]), "a session must fire on an interval turn"
    assert int(res0[0]) >= 0, "the slate's first slot must name a resolution"
    quiet, _, _, _ = sim._congress_upcoming(iv + 1)
    assert not bool(quiet[0]), "no session on an off-interval turn"
    print(f"  the slate at turn {iv}: slots {int(res0[0])}, {int(res1[0])}; dv={bool(dv[0])}")

    # The Diplomatic Victory resolution runs in the same session and pours
    # every seat's whole bank into it, which would eat the refunds below. It
    # gets its own section at the end.
    sim._congress_dv_min = 99

    # --- 2) A BALLOT OVERRIDES THE AI LINE ----------------------------------
    # One seat names a target its own preference would not pick, and buys
    # enough votes that its target wins the plurality outright.
    r = int(res0[0])
    kind = sim._congress_res[r]["t"]
    size = sim._congress_space(kind)
    assert size >= 2, "this resolution has only one target — nothing to override"
    voter = 0
    pref = int(sim._congress_pref(r, voter)[1][0])
    other = (pref + 1) % size
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = 0
    sim.civ_diplo_favor[:, voter] = 10 * (1 + 2 + 3 + 4 + 5)  # five extra votes
    sim.civ_congress_vote[0, voter, 0] = torch.tensor([0, other, 5])
    session(sim, iv)
    assert int(sim.congress_active[0, 0, 0]) == r, "slot 0 did not stand the slate's resolution"
    assert int(sim.congress_active[0, 0, 2]) == other, (
        f"the bought ballot lost: target {int(sim.congress_active[0, 0, 2])}, wanted {other}"
    )
    assert int(sim.civ_diplo_favor[0, voter]) == 0, "the winning combo takes the whole spend"
    assert not bool((sim.civ_congress_vote[0] >= 0).any()), "the ballot must clear after the session"
    print(f"  five bought votes carried target {other} over the AI's {pref}")

    # --- 3) THE CURVE: what the bank cannot clear, it does not buy ----------
    sim.civ_diplo_favor[:, voter] = 10 + 20 + 5   # three rungs cost 10+20+30
    got, spent = sim._congress_buy(voter, torch.ones(sim.B, dtype=torch.bool),
                                  torch.full((sim.B,), 9, dtype=torch.long))
    assert int(got[0]) == 2, f"a 35-favor bank buys two extra votes, got {int(got[0])}"
    assert int(spent[0]) == 30, f"two rungs cost 10+20, spent {int(spent[0])}"
    assert int(sim.civ_diplo_favor[0, voter]) == 5, "the remainder stays in the bank"
    got2, _ = sim._congress_buy(voter, torch.ones(sim.B, dtype=torch.bool),
                               torch.zeros(sim.B, dtype=torch.long))
    assert int(got2[0]) == 0, "a ballot that asks for nothing spends nothing"
    print("  the 10k curve stops at the rung the bank cannot clear")

    # --- 4) THE REFUND TIERS ------------------------------------------------
    # A seat on the LOSING outcome gets everything back; a seat on the winning
    # outcome with a losing target gets half.
    sim.congress_active[:] = -1
    bank = 10 + 20 + 30
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = bank
        sim.civ_congress_vote[0, row, 0] = torch.tensor([0, 0, 3])
    loser = sim.n_majors - 1
    sim.civ_congress_vote[0, loser, 0] = torch.tensor([1, 0, 3])   # outcome B, alone
    session(sim, iv)
    assert int(sim.congress_active[0, 0, 1]) == 0, "outcome A had the votes and must win"
    assert int(sim.civ_diplo_favor[0, loser]) == bank, (
        f"a losing OUTCOME is refunded in full, got {int(sim.civ_diplo_favor[0, loser])}"
    )
    sim.congress_active[:] = -1
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = bank
        sim.civ_congress_vote[0, row, 0] = torch.tensor([0, 0, 3])
    near = sim.n_majors - 1
    sim.civ_congress_vote[0, near, 0] = torch.tensor([0, min(1, size - 1), 1])
    sim.civ_diplo_favor[:, near] = 10
    session(sim, iv)
    assert int(sim.congress_active[0, 0, 2]) == 0, "the crowd's target must win"
    assert int(sim.civ_diplo_favor[0, near]) == 5, (
        f"the winning outcome on a losing target keeps half, got {int(sim.civ_diplo_favor[0, near])}"
    )
    print("  a losing outcome is refunded whole; a losing target keeps half")

    # --- 5) THE DIPLOMATIC VICTORY resolution pays the WINNING TARGET -------
    # Everyone votes A on seat 1 — who is NOT the DVP leader. The +2 must
    # follow the target the tally produced, not the leader.
    sim._congress_dv_min = -1
    sim._congress_res = []   # the DV resolution alone, so its points are readable
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = 0
        sim.civ_diplo_points[:, row] = 0
        sim.civ_congress_vote[0, row, 2] = torch.tensor([0, 1, 0])
    sim.civ_diplo_points[:, 0] = 5   # seat 0 leads
    lead = sim._congress_leader(torch.ones(sim.B, dtype=torch.bool))
    assert int(lead[0]) == 0, f"seat 0 should lead on points, got {int(lead[0])}"
    before = int(sim.civ_diplo_points[0, 1])
    session(sim, iv)
    after = int(sim.civ_diplo_points[0, 1])
    # +1 for voting the winning combo, +2 for being the winning target
    assert after == before + sim._dvp_per_res + sim._congress_dv_delta, (
        f"seat 1 should take {sim._dvp_per_res}+{sim._congress_dv_delta}, went {before} -> {after}"
    )
    assert int(sim.civ_diplo_points[0, 0]) == 5 + sim._dvp_per_res, (
        "the leader voted the winning combo too and takes only the resolution point"
    )
    print("  the +/-2 lands on the winning TARGET, not on the leader")

    # --- 6) THE WIDER SLATE: every reader, both faces -----------------------
    # A standing resolution is three numbers, so the readers are pinned by
    # PLANTING one rather than by winning a vote for each.
    sim2 = build()
    K = sim2.congress_active.shape[1]

    def stand(name: str, outcome: int, target: int) -> None:
        sim2.congress_active[:] = -1
        i = sim2._congress_at.get(name, -1)
        assert i >= 0, f"{name} is not in the catalog"
        sim2.congress_active[:, 0] = torch.tensor([i, outcome, target])

    stand("MERCENARY_COMPANIES", 0, 0)
    assert float(sim2._congress_unit_buy_mult(0)[0]) == sim2._c_plus100
    assert float(sim2._congress_unit_buy_mult(1)[0]) == 1.0
    stand("MERCENARY_COMPANIES", 1, 1)
    assert float(sim2._congress_unit_buy_mult(1)[0]) == sim2._c_minus50

    stand("TRADE_POLICY", 0, 1)
    ds = torch.tensor([[1, 0, -1]], dtype=torch.long)
    assert [float(x) for x in sim2._congress_trade_gold(ds)[0]] == [sim2._c_trade_gold, 0.0, 0.0]
    assert int(sim2._congress_route_capacity(1)[0]) == sim2._c_trade_cap
    assert int(sim2._congress_route_capacity(0)[0]) == 0
    assert not bool(sim2._congress_intl_banned(1)[0])
    stand("TRADE_POLICY", 1, 1)
    assert bool(sim2._congress_intl_banned(1)[0]) and not bool(sim2._congress_intl_banned(0)[0])

    if sim2._npol:
        pol = min(1, sim2._npol - 1)
        held = torch.zeros(sim2.B, sim2._npol, dtype=torch.bool)
        held[:, pol] = True
        stand("POLICY_TREATY", 0, pol)
        assert float(sim2._congress_policy_favor(held)[0]) == sim2._c_policy_favor
        assert float(sim2._congress_policy_favor(~held)[0]) == 0.0
        assert int(sim2._congress_policy_blocked()[0]) == -1
        stand("POLICY_TREATY", 1, pol)
        assert int(sim2._congress_policy_blocked()[0]) == pol

    gov = torch.ones(sim2.B, dtype=torch.long)
    stand("WORLD_IDEOLOGY", 0, 1)
    assert int(sim2._congress_wildcard_delta(gov)[0]) == sim2._c_ideology_slots
    assert int(sim2._congress_wildcard_delta(gov * 0)[0]) == 0
    stand("WORLD_IDEOLOGY", 1, 1)
    assert int(sim2._congress_wildcard_delta(gov)[0]) == -sim2._c_ideology_slots

    stand("BORDER_CONTROL_TREATY", 0, 1)
    assert int(sim2._congress_culture_bomb_seat()[0]) == 1
    assert not bool(sim2._congress_border_frozen(1)[0])
    stand("BORDER_CONTROL_TREATY", 1, 1)
    assert int(sim2._congress_culture_bomb_seat()[0]) == -1
    assert bool(sim2._congress_border_frozen(1)[0]) and not bool(sim2._congress_border_frozen(0)[0])

    if sim2.S:
        ct = int(sim2.citystate_type[0, 0])
        stand("TREATY_ORGANIZATION", 0, ct)
        assert float(sim2._congress_suz_favor_weight()[0, 0]) == sim2._c_plus100
        stand("TREATY_ORGANIZATION", 1, ct)
        assert float(sim2._congress_suz_favor_weight()[0, 0]) == 0.0
        stand("SOVEREIGNTY", 0, ct)
        assert float(sim2._congress_cs_route_mult()[0, 0]) == sim2._c_plus100
        assert not bool(sim2._congress_suz_bonus_blocked()[0, 0])
        stand("SOVEREIGNTY", 1, ct)
        assert float(sim2._congress_cs_route_mult()[0, 0]) == 1.0
        assert bool(sim2._congress_suz_bonus_blocked()[0, 0])

    if sim2._proj_rows:
        stand("PUBLIC_WORKS_PROGRAM", 0, 0)
        assert float(sim2._congress_project_mult(0)[0]) == sim2._c_plus100
        assert float(sim2._congress_project_mult(len(sim2._proj_rows) - 1)[0]) == (
            sim2._c_plus100 if len(sim2._proj_rows) == 1 else 1.0)
        stand("PUBLIC_WORKS_PROGRAM", 1, 0)
        assert float(sim2._congress_project_mult(0)[0]) == sim2._c_minus50
    print(f"  the twelve wider-slate readers answer both faces over {K} slate slots")

    # --- 7) TRADE POLICY B ends the standing legs it forbids ----------------
    row, other = 0, 1
    sim2.seat_routes[:] = -1
    sim2.seat_route_dseat[:] = -1
    ocity = int(sim2.city_id[0, row, 0])
    dcity = int(sim2.city_id[0, other, 0])
    sim2.seat_routes[0, row, 0] = torch.tensor([ocity, -1])
    sim2.seat_route_dseat[0, row, 0] = other
    sim2.seat_route_dcity[0, row, 0] = dcity
    sim2.seat_routes[0, other, 0] = torch.tensor([dcity, -1])
    sim2.seat_route_dseat[0, other, 0] = row
    sim2.seat_route_dcity[0, other, 0] = ocity
    stand("TRADE_POLICY", 1, row)
    sim2._congress_cancel_banned_intl()
    assert int(sim2.seat_routes[0, row, 0, 0]) == -1, "the banned seat keeps an international leg"
    assert int(sim2.seat_routes[0, other, 0, 0]) == -1, "a leg TO the banned seat survived"
    print("  a passed Trade Policy B cancels the legs at both ends")

    # --- 8) THE CULTURE BOMB claims the ring, and refuses a paved tile ------
    stand("BORDER_CONTROL_TREATY", 0, row)
    ctr = int(sim2.city_center[0, row, 0])
    ring = [int(t) for t in sim2.neigh[ctr] if int(t) >= 0]
    assert len(ring) >= 2, "the centre has no ring on this map"
    spot, paved = ring[0], ring[1]
    sim2.district[0, paved] = 0                       # a district is never bombed away
    sim2.tile_seat[0, paved] = other
    foreign = [int(t) for t in sim2.neigh[spot] if int(t) >= 0 and int(t) not in (ctr, paved)]
    assert foreign, "the trigger tile has no free neighbour"
    sim2.tile_seat[0, foreign[0]] = other
    sim2.tile_city[0, foreign[0]] = 999
    rows = torch.tensor([0], dtype=torch.long)
    sim2._culture_bomb(row, rows, torch.tensor([spot], dtype=torch.long),
                       torch.zeros(1, dtype=torch.long))
    assert int(sim2.tile_seat[0, foreign[0]]) == row, "the bomb left a foreign plot alone"
    assert int(sim2.tile_city[0, foreign[0]]) == int(sim2.city_id[0, row, 0])
    assert int(sim2.tile_seat[0, paved]) == other, "the bomb took a tile carrying a district"
    print("  the bomb claims a foreign plot in range and skips a district tile")

    print("CONGRESS VOTE OK — the slate, the override, the curve, both refunds, the DV target, "
          "the wider slate, the route ban and the culture bomb")


if __name__ == "__main__":
    main()
